import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { atualizarReserva, registrar, type MetodoPagamento, type StatusReserva } from '@/lib/reservas';

export const runtime = 'nodejs';

const ACOES: Record<string, { status: StatusReserva; evento: string; metodo?: MetodoPagamento }> = {
  marcar_pago: { status: 'pago', evento: 'Marcada como paga no admin' },
  // no WhatsApp, a forma de pagamento só se decide agora: ela define quanto entrou
  pago_pix: { status: 'pago', evento: 'Marcada como paga no Pix, no admin', metodo: 'pix' },
  pago_cartao: { status: 'pago', evento: 'Marcada como paga no cartão, no admin', metodo: 'cartao' },
  cancelar: { status: 'cancelado', evento: 'Cancelada no admin' },
  reembolsado: { status: 'reembolsado', evento: 'Marcada como reembolsada no admin' },
};

export async function POST(req: Request, ctx: RouteContext<'/api/admin/reservas/[codigo]'>) {
  const { codigo } = await ctx.params;
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) return NextResponse.json({ ok: false }, { status: 401 });
  const origem = req.headers.get('origin');
  if (origem && new URL(origem).host !== new URL(req.url).host) return NextResponse.json({ ok: false }, { status: 403 });

  const form = await req.formData();
  const acao = ACOES[String(form.get('acao'))];
  if (!acao) return NextResponse.json({ ok: false }, { status: 400 });
  await atualizarReserva(codigo, (r) => {
    r.status = acao.status;
    if (acao.metodo) r.pagamento.metodo = acao.metodo;
    if (acao.status === 'pago' && !r.pagamento.pagoEm) r.pagamento.pagoEm = new Date().toISOString();
    return registrar(r, acao.evento);
  });
  const volta = new URL('/admin', req.url);
  const filtro = form.get('filtro');
  if (filtro) volta.searchParams.set('status', String(filtro));
  return NextResponse.redirect(volta, 303);
}
