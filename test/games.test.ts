import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseGameInput, parseSteamLibrary, steamStorageError } from '../lib/games';

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