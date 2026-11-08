import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GAMES_PER_PAGE, paginateGames, parseGameInput, parseSteamLibrary, steamStorageError, type Game } from '../lib/games';

describe('paginateGames', () => {
  const games: Game[] = Array.from({ length: 25 }, (_, index) => ({
    id: String(index), title: `Game ${index}`, platform: 'PC', status: 'Zerado',
    finished_at: null, hours: 0, ach: 0, ach_total: 0, rating: 0,
    notes: null, cover: null, steam_appid: null, created_at: '',
  }));

  it('paginates without duplicating, omitting or reordering games', () => {
    const pages = [1, 2, 3].map((page) => paginateGames(games, '', page));
    assert.equal(pages[0].games.length, GAMES_PER_PAGE);
    assert.deepEqual(pages.flatMap((page) => page.games), games);
    assert.deepEqual([pages[2].start, pages[2].end, pages[2].pageCount], [25, 25, 3]);
  });

  it('filters before pagination, ignoring casing and outer whitespace', () => {
    const result = paginateGames(games, '  GAME 2  ', 1);
    assert.deepEqual(result.games.map((game) => game.title), ['Game 2', 'Game 20', 'Game 21', 'Game 22', 'Game 23', 'Game 24']);
    assert.equal(result.total, 6);
    assert.equal(result.pageCount, 1);
  });

  it('handles an empty library and no search results', () => {
    for (const result of [paginateGames([], '', 1), paginateGames(games, 'missing', 3)]) {
      assert.deepEqual(result.games, []);
      assert.deepEqual([result.total, result.page, result.pageCount, result.start, result.end], [0, 1, 1, 0, 0]);
    }
  });

  it('clamps the page after deletion or filtering and handles invalid pages', () => {
    assert.equal(paginateGames(games.slice(0, 24), '', 3).page, 2);
    assert.equal(paginateGames(games, 'Game 24', 3).page, 1);
    for (const page of [0, -1, NaN, Infinity]) assert.equal(paginateGames(games, '', page).page, 1);
    assert.equal(paginateGames(games, '', 2.8).page, 2);
  });

  it('does not add an empty page for exact multiples', () => {
    assert.equal(paginateGames(games.slice(0, 24), '', 2).pageCount, 2);
  });
});

describe('steamStorageError', () => {
  it('identifies Supabase authentication failures even without an error code', () => {
    assert.match(steamStorageError(401), /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(steamStorageError(401), /mesmo projeto/);
  });

  it('distinguishes permissions from missing tables or columns', () => {
    assert.match(steamStorageError(403, '42501'), /permissoes/);
    for (const code of ['PGRST205', '42P01']) {
      assert.match(steamStorageError(404, code), /tabela games nao foi encontrada/);
    }
    for (const code of ['42703', 'PGRST204']) {
      assert.match(steamStorageError(400, code), /colunas necessarias/);
    }
  });

  it('keeps unknown errors generic without exposing upstream details', () => {
    assert.match(steamStorageError(500, 'unknown'), /disponibilidade/);
  });

  it('identifies the unique constraint required by Steam upsert', () => {
    assert.match(steamStorageError(400, '42P10', 'save'), /UNIQUE em games.steam_appid/);
  });

  it('distinguishes missing defaults, check constraints and duplicates', () => {
    assert.match(steamStorageError(400, '23502', 'save'), /NOT NULL.*DEFAULT/);
    assert.match(steamStorageError(400, '23514', 'save'), /CHECK/);
    for (const code of ['23505', '21000']) {
      assert.match(steamStorageError(400, code, 'save'), /duplicados/);
    }
  });

  it('preserves the failing operation in unknown storage errors', () => {
    assert.match(steamStorageError(500, 'unknown', 'save'), /salvar os novos jogos/);
    assert.match(steamStorageError(500, 'unknown', 'update'), /atualizar as estatisticas/);
  });
});

describe('parseSteamLibrary', () => {
  it('reports unavailable library data instead of a route-not-found error', () => {
    const result = parseSteamLibrary({ response: {} });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 422);
      assert.match(result.error, /SteamID64/);
      assert.match(result.error, /Detalhes do jogo/);
    }
  });

  it('accepts an explicitly empty library', () => {
    assert.deepEqual(parseSteamLibrary({ response: { game_count: 0 } }), { ok: true, games: [] });
    assert.deepEqual(parseSteamLibrary({ response: { games: [] } }), { ok: true, games: [] });
  });

  it('keeps all games, including the first one', () => {
    const games = [{ appid: 123, name: 'Game', playtime_forever: 60 }];
    assert.deepEqual(parseSteamLibrary({ response: { games } }), { ok: true, games });
  });

  it('rejects malformed upstream payloads', () => {
    for (const payload of [null, {}, { response: { games: {} } }, { response: { games: [null] } }]) {
      const result = parseSteamLibrary(payload);
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.status, 502);
    }
  });
});

describe('parseGameInput', () => {
  it('trims the title and keeps supported fields', () => {
    const result = parseGameInput({
      title: '  Hollow Knight  ',
      status: '100%',
      hours: '12.5',
      ignored: 'discard this',
    });

    assert.deepEqual(result, {
      ok: true,
      value: { title: 'Hollow Knight', status: '100%', hours: 12.5 },
    });
  });

  it('rejects empty or oversized titles', () => {
    assert.equal(parseGameInput({ title: '  ' }).ok, false);
    assert.equal(parseGameInput({ title: 'x'.repeat(201) }).ok, false);
  });

  it('rejects unsupported status and platform values', () => {
    assert.equal(parseGameInput({ title: 'Game', status: 'Done' }).ok, false);
    assert.equal(parseGameInput({ title: 'Game', platform: 'Unknown' }).ok, false);
  });

  it('accepts valid dates and rejects impossible dates', () => {
    assert.equal(parseGameInput({ title: 'Game', finished_at: '2024-02-29' }).ok, true);
    assert.equal(parseGameInput({ title: 'Game', finished_at: '2025-02-29' }).ok, false);
    assert.equal(parseGameInput({ title: 'Game', finished_at: 'yesterday' }).ok, false);
  });

  it('validates numeric ranges and achievement totals', () => {
    assert.equal(parseGameInput({ title: 'Game', rating: 6 }).ok, false);
    assert.equal(parseGameInput({ title: 'Game', hours: -1 }).ok, false);
    assert.equal(parseGameInput({ title: 'Game', ach: 4, ach_total: 3 }).ok, false);
    assert.equal(parseGameInput({ title: 'Game', ach: 2, ach_total: 3, rating: 5 }).ok, true);
  });

  it('allows clearing optional fields', () => {
    const result = parseGameInput({ title: 'Game', finished_at: null, notes: null, cover: null });
    assert.deepEqual(result, {
      ok: true,
      value: { title: 'Game', finished_at: null, notes: null, cover: null },
    });
  });
});