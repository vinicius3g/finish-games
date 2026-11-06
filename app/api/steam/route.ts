import { db, authed, deny, privateJson } from '@/lib/server';
import { parseSteamLibrary, steamStorageError, type GameWrite } from '@/lib/games';

export const runtime = 'nodejs';
export const maxDuration = 60;
const S = 'https://api.steampowered.com';
const MAX_GAMES_PER_SYNC = 50;
const CONCURRENCY = 10;

type SyncRow = GameWrite & { steam_appid: number; hours: number; ach: number; ach_total: number };

export async function POST(req: Request): Promise<Response> {
  if (!authed(req)) return deny();
  const { STEAM_API_KEY: key, STEAM_ID: id } = process.env;
  if (!key || !id) return privateJson({ error: 'Configure STEAM_API_KEY e STEAM_ID.' }, { status: 503 });

  const offsetParam = new URL(req.url).searchParams.get('offset') || '0';
  const offset = Number(offsetParam);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    return privateJson({ error: 'Posição de sincronização inválida.' }, { status: 400 });
  }

  const params = new URLSearchParams({ key, steamid: id, include_appinfo: '1', format: 'json' });
  let ownedResponse: Response;
  try {
    ownedResponse = await fetch(`${S}/IPlayerService/GetOwnedGames/v0001/?${params}`, {
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
  } catch {
    return privateJson({ error: 'A Steam não respondeu a tempo.' }, { status: 502 });
  }
  if (!ownedResponse.ok) {
    return privateJson({ error: 'A Steam recusou a chamada. Confira STEAM_API_KEY e STEAM_ID.' }, { status: 502 });
  }
  const library = parseSteamLibrary(await ownedResponse.json().catch(() => null));
  if (!library.ok) {
    return privateJson({ error: library.error }, { status: library.status });
  }

  const played = library.games.filter((game) => game.playtime_forever > 0);
  const batch = played.slice(offset, offset + MAX_GAMES_PER_SYNC);
  if (offset > played.length) return privateJson({ error: 'Posição de sincronização fora do intervalo.' }, { status: 400 });
  if (!batch.length) {
    return privateJson({ synced: 0, added: 0, nextOffset: offset, hasMore: false });
  }

  const { data: existing = [], error: selectError, status: selectStatus } = await db()
    .from('games').select('id,steam_appid,ach,ach_total').not('steam_appid', 'is', null);
  if (selectError) {
    return privateJson({ error: steamStorageError(selectStatus, selectError.code) }, { status: 500 });
  }
  const byApp = new Map((existing ?? []).map((game) => [game.steam_appid, game]));
  const newRows: SyncRow[] = [];
  const updatedRows: SyncRow[] = [];

  for (let index = 0; index < batch.length; index += CONCURRENCY) {
    await Promise.all(batch.slice(index, index + CONCURRENCY).map(async (game) => {
      const old = byApp.get(game.appid);
      let ach = old?.ach ?? 0;
      let total = old?.ach_total ?? 0;
      const achievementParams = new URLSearchParams({ appid: String(game.appid), key, steamid: id });
      try {
        const response = await fetch(`${S}/ISteamUserStats/GetPlayerAchievements/v0001/?${achievementParams}`, {
          signal: AbortSignal.timeout(8000),
          cache: 'no-store',
        });
        if (response.ok) {
          const stats = (await response.json()) as { playerstats?: { achievements?: { achieved: number }[] } };
          const achievements = stats.playerstats?.achievements;
          if (achievements) {
            total = achievements.length;
            ach = achievements.filter((item) => item.achieved === 1).length;
          }
        }
      } catch {
        // Keep existing achievement counts when Steam has no data or times out.
      }

      const row: SyncRow = {
        steam_appid: game.appid,
        hours: Math.round(game.playtime_forever / 6) / 10,
        ach,
        ach_total: total,
      };
      if (old) {
        row.id = old.id;
        updatedRows.push(row);
      } else {
        row.title = game.name;
        row.platform = 'PC';
        row.status = total > 0 && ach === total ? '100%' : 'Jogando';
        row.cover = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
        newRows.push(row);
      }
    }));
  }

  if (newRows.length) {
    const { error, status } = await db().from('games').upsert(newRows, { onConflict: 'steam_appid' });
    if (error) {
      console.error('Steam sync insert failed', { status, code: error.code });
      return privateJson({ error: steamStorageError(status, error.code, 'save') }, { status: 500 });
    }
  }

  for (let index = 0; index < updatedRows.length; index += CONCURRENCY) {
    const results = await Promise.all(updatedRows.slice(index, index + CONCURRENCY).map((row) =>
      db().from('games').update({ hours: row.hours, ach: row.ach, ach_total: row.ach_total })
        .eq('steam_appid', row.steam_appid)
    ));
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      console.error('Steam sync update failed', { status: failed.status, code: failed.error.code });
      return privateJson({ error: steamStorageError(failed.status, failed.error.code, 'update') }, { status: 500 });
    }
  }

  const nextOffset = offset + batch.length;
  return privateJson({ synced: batch.length, added: newRows.length, nextOffset, hasMore: nextOffset < played.length });
}
