import { parseGameInput } from '@/lib/games';
import { db, authed, deny, privateJson } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  if (!authed(req)) return deny();
  const { data, error } = await db().from('games').select('*')
      .order('finished_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  if (error) return privateJson({ error: 'Não foi possível carregar os jogos.' }, { status: 500 });
  return privateJson(data);
}

export async function POST(req: Request): Promise<Response> {
  if (!authed(req)) return deny();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return privateJson({ error: 'Corpo JSON inválido.' }, { status: 400 });
  }
  const parsed = parseGameInput(body);
  if (!parsed.ok) return privateJson({ error: parsed.error }, { status: 400 });
  const { data, error } = await db().from('games').upsert(parsed.value).select().single();
  if (error) return privateJson({ error: 'Não foi possível salvar o jogo.' }, { status: 500 });
  return privateJson(data);
}

export async function DELETE(req: Request): Promise<Response> {
  if (!authed(req)) return deny();
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return privateJson({ error: 'Informe o identificador do jogo.' }, { status: 400 });
  const { data, error } = await db().from('games').delete().eq('id', id).select();
  if (error) return privateJson({ error: 'Não foi possível excluir o jogo.' }, { status: 500 });
  return privateJson(data);
}
