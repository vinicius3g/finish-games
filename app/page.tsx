'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { PLATFORMS, STATUSES, type Game, type GamePlatform, type GameStatus } from '@/lib/games';

const DONE: GameStatus[] = ['Zerado', '100%', 'Platinado'];

interface GameForm {
  id?: string;
  title: string;
  platform: GamePlatform;
  status: GameStatus;
  finished_at: string;
  hours: string | number;
  ach: string | number;
  ach_total: string | number;
  rating: string | number;
  notes: string;
  cover: string | null;
  steam_appid?: number | null;
}

interface CoverHit {
  title: string;
  year: number | null;
  cover: string | null;
}

interface SteamSyncResult {
  synced: number;
  added: number;
  nextOffset: number;
  hasMore: boolean;
}

const EMPTY: GameForm = {
  title: '', platform: 'PC', status: 'Zerado', finished_at: '',
  hours: '', ach: '', ach_total: '', rating: 0, notes: '', cover: null,
};

export default function Page() {
  const [secret, setSecret] = useState<string | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [form, setForm] = useState<GameForm | null>(null);
  const [hits, setHits] = useState<CoverHit[]>([]);
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => setSecret(localStorage.getItem('secret') || ''), []);

  const api = async <T,>(url: string, opt: RequestInit = {}): Promise<T> => {
    const response = await fetch(url, {
      ...opt,
      headers: { 'Content-Type': 'application/json', 'x-app-secret': secret || '', ...opt.headers },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => ({})) as T & { error?: string };
    if (response.status === 401) {
      localStorage.removeItem('secret');
      setSecret('');
    }
    if (!response.ok) throw new Error(body.error || 'Erro inesperado.');
    return body;
  };

  const run = (fn: () => Promise<unknown>) => fn().catch((error: unknown) => {
    setMsg(error instanceof Error ? error.message : 'Erro inesperado.');
  });
  const reload = () => run(async () => setGames(await api<Game[]>('/api/games')));
  useEffect(() => { if (secret) void reload(); }, [secret]);

  const stats = useMemo(() => {
    const done = games.filter((game) => DONE.includes(game.status));
    const years: Record<string, number> = {};
    done.forEach((game) => {
      const year = game.finished_at?.slice(0, 4) || 'Sem data';
      years[year] = (years[year] || 0) + 1;
    });
    return {
      count: done.length,
      hours: Math.round(done.reduce((sum, game) => sum + Number(game.hours || 0), 0)),
      perfect: done.filter((game) => game.status !== 'Zerado').length,
      years: Object.entries(years).sort((a, b) => b[0].localeCompare(a[0])),
    };
  }, [games]);

  const list = games.filter((game) => game.title.toLowerCase().includes(q.toLowerCase()));
  const set = (key: keyof GameForm) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.value;
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const draft = form;
    if (!draft) return;
    run(async () => {
      const number = (value: string | number) => Number(value) || 0;
      await api<Game>('/api/games', {
        method: 'POST',
        body: JSON.stringify({
          ...draft,
          hours: number(draft.hours),
          ach: number(draft.ach),
          ach_total: number(draft.ach_total),
          rating: number(draft.rating),
          finished_at: draft.finished_at || null,
        }),
      });
      setForm(null);
      setHits([]);
      setMsg('');
      await reload();
    });
  };

  const remove = (game: Game) => confirm(`Excluir "${game.title}"?`) && run(async () => {
    await api(`/api/games?id=${encodeURIComponent(game.id)}`, { method: 'DELETE' });
    await reload();
  });

  const searchCover = () => run(async () => {
    setHits(await api<CoverHit[]>(`/api/igdb?q=${encodeURIComponent(form?.title || '')}`));
  });

  const sync = () => run(async () => {
    let offset = 0;
    let synced = 0;
    let added = 0;
    let hasMore = true;
    while (hasMore) {
      setMsg(`Sincronizando com a Steam… ${synced} jogos processados`);
      const result = await api<SteamSyncResult>(`/api/steam?offset=${offset}`, { method: 'POST' });
      synced += result.synced;
      added += result.added;
      offset = result.nextOffset;
      hasMore = result.hasMore;
    }
    setMsg(`${synced} jogos sincronizados (${added} novos).`);
    await reload();
  });

  if (secret === null) return null;
  if (!secret) return (
    <main>
      <h1>Meus jogos zerados</h1>
      <form className="card" onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get('s');
        if (typeof value === 'string') {
          localStorage.setItem('secret', value);
          setSecret(value);
        }
      }}>
        <label>Senha do app<input name="s" type="password" required /></label>
        <button className="pri">Entrar</button>
      </form>
    </main>
  );

  return (
    <main>
      <header>
        <h1>Meus jogos zerados</h1>
        <div className="row">
          <button onClick={sync}>Sincronizar Steam</button>
          <button className="pri" onClick={() => setForm({ ...EMPTY })}>Adicionar jogo</button>
        </div>
      </header>
      {msg && <p className="meta" role="status">{msg}</p>}

      <section className="stats">
        <div><b>{stats.count}</b>zerados</div>
        <div><b>{stats.hours}</b>horas</div>
        <div><b>{stats.perfect}</b>com 100% ou platina</div>
        {stats.years.map(([year, count]) => <div key={year}><b>{count}</b>em {year}</div>)}
      </section>

      <input placeholder="Buscar pelo nome" value={q} onChange={(event) => setQ(event.target.value)} />
      <div className="grid">
        {list.map((game) => (
          <article className="card" key={game.id}>
            {game.cover && <img src={game.cover} alt="" loading="lazy" />}
            <h3>{game.title}</h3>
            <p className="meta">{game.platform} — {game.status}{game.rating ? ` — ${'★'.repeat(game.rating)}` : ''}</p>
            <p className="meta">{Number(game.hours)} h{game.ach_total ? ` — ${game.ach}/${game.ach_total} conquistas` : ''}{game.finished_at ? ` — ${game.finished_at}` : ''}</p>
            {game.notes && <p className="meta">{game.notes}</p>}
            <div className="row">
              <button onClick={() => setForm({
                ...EMPTY,
                ...game,
                finished_at: game.finished_at || '',
                hours: game.hours,
                ach: game.ach,
                ach_total: game.ach_total,
                rating: game.rating,
                notes: game.notes || '',
              })}>Editar</button>
              <button onClick={() => remove(game)}>Excluir</button>
            </div>
          </article>
        ))}
      </div>

      {form && (
        <div className="modal">
          <form onSubmit={save}>
            <h2>{form.id ? 'Editar jogo' : 'Adicionar jogo'}</h2>
            <label>Nome
              <div className="row"><input style={{ flex: 1 }} required value={form.title} onChange={set('title')} />
                <button type="button" onClick={searchCover}>Buscar capa</button></div>
            </label>
            <div className="hits">
              {hits.map((hit, index) => (
                <button type="button" key={`${hit.title}-${index}`} onClick={() => {
                  setForm({ ...form, title: hit.title, cover: hit.cover });
                  setHits([]);
                }}>
                  {hit.title}{hit.year ? ` (${hit.year})` : ''}
                </button>
              ))}
            </div>
            <label>Plataforma<select value={form.platform} onChange={set('platform')}>{PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
            <label>Status<select value={form.status} onChange={set('status')}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>Data de término<input type="date" value={form.finished_at} onChange={set('finished_at')} /></label>
            <label>Horas jogadas<input type="number" min="0" step="0.5" value={form.hours} onChange={set('hours')} /></label>
            <div className="row">
              <label>Conquistas obtidas<input type="number" min="0" value={form.ach} onChange={set('ach')} /></label>
              <label>Total de conquistas<input type="number" min="0" value={form.ach_total} onChange={set('ach_total')} /></label>
            </div>
            <label>Nota<select value={form.rating} onChange={set('rating')}><option value="0">Sem nota</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{'★'.repeat(rating)}</option>)}</select></label>
            <label>Anotações<textarea rows={3} value={form.notes || ''} onChange={set('notes')} /></label>
            <div className="row">
              <button type="button" onClick={() => { setForm(null); setHits([]); }}>Cancelar</button>
              <button className="pri">Salvar jogo</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
