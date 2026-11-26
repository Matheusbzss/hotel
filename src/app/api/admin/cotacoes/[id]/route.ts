import { NextResponse } from 'next/server';
import { pedidoRecusado } from '@/lib/admin-auth';
import { STATUS_COTACAO } from '@/lib/cotacao';
import { mudarStatusCotacao } from '@/lib/cotacoes';

export const runtime = 'nodejs';

/** Muda o status da cotação (nova, respondida, fechada ou perdida) e volta para a lista. */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/cotacoes/[id]'>) {
  const { id } = await ctx.params;
  // a proteção de todas as rotas do painel: o próprio site e a sessão (sem ela, o formulário volta à entrada do painel)
  const recusado = await pedidoRecusado(req);
  if (recusado) return recusado;

  const form = await req.formData();
  const status = STATUS_COTACAO.find((s) => s === form.get('status'));
  if (!status || !/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  await mudarStatusCotacao(id, status);
  const volta = new URL('/admin/cotacoes', req.url);
  const filtro = form.get('filtro');
  if (filtro) volta.searchParams.set('status', String(filtro));
  return NextResponse.redirect(volta, 303);
}
