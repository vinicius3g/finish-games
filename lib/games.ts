export const PLATFORMS = ['PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Retrô / emulador', 'Mobile', 'Outra'] as const;
export const STATUSES = ['Zerado', '100%', 'Platinado', 'Jogando', 'Backlog', 'Abandonado'] as const;

export type GamePlatform = (typeof PLATFORMS)[number];
export type GameStatus = (typeof STATUSES)[number];

export interface Game {
  id: string;
  title: string;
  platform: GamePlatform;
  status: GameStatus;
  finished_at: string | null;
  hours: number;
  ach: number;
  ach_total: number;
  rating: number;
  notes: string | null;
  cover: string | null;
  steam_appid: number | null;
  created_at: string;
}

export type GameWrite = Partial<Omit<Game, 'created_at'>>;

export const GAMES_PER_PAGE = 12;

export function paginateGames(games: Game[], query: string, requestedPage: number) {
  const filtered = games.filter((game) => game.title.toLowerCase().includes(query.trim().toLowerCase()));
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / GAMES_PER_PAGE));
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 1));
  const offset = (page - 1) * GAMES_PER_PAGE;
  return {
    games: filtered.slice(offset, offset + GAMES_PER_PAGE),
    total,
    page,
    pageCount,
    start: total ? offset + 1 : 0,
    end: Math.min(offset + GAMES_PER_PAGE, total),
  };
}

export function steamStorageError(status: number, code?: string, operation: 'load' | 'save' | 'update' = 'load'): string {
  if (status === 401) {
    return 'O Supabase recusou a autenticacao. Confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY: use uma chave de servidor valida do mesmo projeto e reinicie o app apos alterar o ambiente.';
  }
  if (status === 403) {
    return 'O Supabase negou acesso aos jogos. Confira as permissoes e use a chave de servidor em SUPABASE_SERVICE_ROLE_KEY, nao a chave anon/publicavel.';
  }
  if (code === 'PGRST205' || code === '42P01') {
    return 'A tabela games nao foi encontrada no Supabase. Execute supabase/schema.sql no projeto configurado em SUPABASE_URL.';
  }
  if (code === '42703' || code === 'PGRST204') {
    return 'A tabela games esta sem colunas necessarias para sincronizar a Steam. Compare todas as colunas com supabase/schema.sql.';
  }
  if (code === '42P10') {
    return 'A sincronizacao exige uma restricao UNIQUE em games.steam_appid. Confira o schema da tabela existente; executar CREATE TABLE IF NOT EXISTS nao adiciona essa restricao.';
  }
  if (code === '23502') {
    return 'O Supabase exige um campo obrigatorio que nao foi preenchido. Confira as colunas NOT NULL e os valores DEFAULT da tabela games conforme supabase/schema.sql.';
  }
  if (code === '23514') {
    return 'Um valor do jogo foi recusado por uma restricao CHECK da tabela games. Confira se o banco aceita os status Jogando e 100% e os valores de horas e conquistas.';
  }
  if (code === '23505' || code === '21000') {
    return 'O Supabase encontrou registros duplicados ou um conflito de unicidade ao sincronizar. Confira as restricoes da tabela games e os steam_appid duplicados.';
  }
  if (operation === 'save') return 'Nao foi possivel salvar os novos jogos da Steam no Supabase. Confira a disponibilidade e a configuracao do banco.';
  if (operation === 'update') return 'Nao foi possivel atualizar as estatisticas dos jogos no Supabase. Confira a disponibilidade e a configuracao do banco.';
  return 'Nao foi possivel carregar os jogos da Steam salvos no Supabase. Confira a disponibilidade e a configuracao do banco.';
}

export type GameInputResult =
  | { ok: true; value: GameWrite }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number;
}

export function parseSteamLibrary(input: unknown):
  | { ok: true; games: SteamGame[] }
  | { ok: false; status: 422 | 502; error: string } {
  if (!isRecord(input) || !isRecord(input.response)) {
    return { ok: false, status: 502, error: 'Resposta da Steam invalida.' };
  }
  const { games, game_count: count } = input.response;
  if (games === undefined && count === 0) return { ok: true, games: [] };
  if (games === undefined) {
    return {
      ok: false,
      status: 422,
      error: 'A Steam respondeu, mas nao disponibilizou a biblioteca. Confira o STEAM_ID (SteamID64) e deixe o perfil e "Detalhes do jogo" publicos; desmarque a opcao de manter o tempo de jogo privado.',
    };
  }
  if (!Array.isArray(games) || !games.every((game): game is SteamGame =>
    isRecord(game) && Number.isSafeInteger(game.appid) && Number(game.appid) > 0 &&
    typeof game.name === 'string' && typeof game.playtime_forever === 'number' &&
    Number.isFinite(game.playtime_forever) && game.playtime_forever >= 0
  )) {
    return { ok: false, status: 502, error: 'Resposta da Steam invalida.' };
  }
  return { ok: true, games };
}

const isDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};

export function parseGameInput(input: unknown): GameInputResult {
  if (!isRecord(input)) return { ok: false, error: 'Dados do jogo inválidos.' };

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 200) {
    return { ok: false, error: 'Informe um nome de jogo com até 200 caracteres.' };
  }

  const value: GameWrite = { title };
  if (input.id !== undefined) {
    if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.id)) {
      return { ok: false, error: 'Identificador do jogo inválido.' };
    }
    value.id = input.id;
  }

  if (input.platform !== undefined) {
    if (typeof input.platform !== 'string' || !PLATFORMS.includes(input.platform as GamePlatform)) {
      return { ok: false, error: 'Plataforma inválida.' };
    }
    value.platform = input.platform as GamePlatform;
  }

  if (input.status !== undefined) {
    if (typeof input.status !== 'string' || !STATUSES.includes(input.status as GameStatus)) {
      return { ok: false, error: 'Status inválido.' };
    }
    value.status = input.status as GameStatus;
  }

  if (input.finished_at !== undefined) {
    if (input.finished_at !== null && (typeof input.finished_at !== 'string' || !isDate(input.finished_at))) {
      return { ok: false, error: 'Data de término inválida.' };
    }
    value.finished_at = input.finished_at as string | null;
  }

  const numericFields = [
    ['hours', 100000, false],
    ['ach', 1000000, true],
    ['ach_total', 1000000, true],
    ['rating', 5, true],
    ['steam_appid', 2147483647, true],
  ] as const;
  for (const [field, max, integer] of numericFields) {
    const raw = input[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const number = typeof raw === 'number' ? raw : Number(raw);
    const min = field === 'rating' || field === 'hours' || field === 'ach' || field === 'ach_total' ? 0 : 1;
    if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
      return { ok: false, error: `Valor inválido para ${field}.` };
    }
    value[field] = number;
  }

  if (value.rating !== undefined && value.rating > 5) {
    return { ok: false, error: 'A nota deve estar entre 0 e 5.' };
  }
  if (value.ach !== undefined && value.ach_total !== undefined && value.ach > value.ach_total) {
    return { ok: false, error: 'Conquistas obtidas não podem exceder o total.' };
  }

  if (input.notes !== undefined) {
    if (input.notes !== null && (typeof input.notes !== 'string' || input.notes.length > 10000)) {
      return { ok: false, error: 'Anotações inválidas (limite de 10.000 caracteres).' };
    }
    value.notes = input.notes as string | null;
  }
  if (input.cover !== undefined) {
    if (input.cover !== null && (typeof input.cover !== 'string' || input.cover.length > 2048)) {
      return { ok: false, error: 'URL da capa inválida.' };
    }
    value.cover = input.cover as string | null;
  }

  return { ok: true, value };
}