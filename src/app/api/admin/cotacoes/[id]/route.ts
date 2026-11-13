import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { STATUS_COTACAO } from '@/lib/cotacao';
import { mudarStatusCotacao } from '@/lib/cotacoes';

export const runtime = 'nodejs';

/** Muda o status da cotação (nova, respondida, fechada ou perdida) e volta para a lista. */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/cotacoes/[id]'>) {
  const { id } = await ctx.params;
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) return NextResponse.json({ ok: false }, { status: 401 });
  const origem = req.headers.get('origin');
  if (origem && new URL(origem).host !== new URL(req.url).host) return NextResponse.json({ ok: false }, { status: 403 });

  const form = await req.formData();
  const status = STATUS_COTACAO.find((s) => s === form.get('status'));
  if (!status || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  await mudarStatusCotacao(id, status);
  const volta = new URL('/admin/cotacoes', req.url);
  const filtro = form.get('filtro');
  if (filtro) volta.searchParams.set('status', String(filtro));
  return NextResponse.redirect(volta, 303);
}
