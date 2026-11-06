import { authed, deny, privateJson } from '@/lib/server';

export const runtime = 'nodejs';

type TwitchToken = { access_token?: string };
type IgdbGame = { name: string; first_release_date?: number; cover?: { image_id: string } };

export async function GET(req: Request): Promise<Response> {
  if (!authed(req)) return deny();
  const q = (new URL(req.url).searchParams.get('q') || '').replace(/["\\;]/g, ' ').trim().slice(0, 80);
  if (!q) return privateJson([]);
  const { TWITCH_CLIENT_ID: id, TWITCH_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) return privateJson({ error: 'Configure as credenciais da API IGDB.' }, { status: 503 });

  let tokenResponse: Response;
  try {
    tokenResponse = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`,
      { method: 'POST', signal: AbortSignal.timeout(10000), cache: 'no-store' }
    );
  } catch {
    return privateJson({ error: 'Não foi possível conectar à Twitch.' }, { status: 502 });
  }
  if (!tokenResponse.ok) return privateJson({ error: 'Credenciais da Twitch inválidas.' }, { status: 502 });
  const token = (await tokenResponse.json()) as TwitchToken;
  if (!token.access_token) return privateJson({ error: 'A Twitch não retornou um token.' }, { status: 502 });

  let response: Response;
  try {
    response = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: { 'Client-ID': id, Authorization: `Bearer ${token.access_token}` },
      body: `search "${q}"; fields name,first_release_date,cover.image_id; limit 6;`,
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
  } catch {
    return privateJson({ error: 'Não foi possível consultar o IGDB.' }, { status: 502 });
  }
  if (!response.ok) return privateJson({ error: 'Falha ao consultar o IGDB.' }, { status: 502 });
  const list = (await response.json()) as IgdbGame[];
  if (!Array.isArray(list)) return privateJson({ error: 'Resposta inválida do IGDB.' }, { status: 502 });
  return privateJson(list.map((game) => ({
    title: game.name,
    year: game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : null,
    cover: game.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg` : null,
  })));
}
