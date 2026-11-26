import { NextResponse } from 'next/server';
import { isIdioma } from '@/i18n/config';
import { ipDaRequisicao } from '@/lib/limite-ip';
import { paraPublico, tokenConfere } from '@/lib/reserva-publica';
import { obterReservaDoPedido } from '@/lib/reservas';
import { conferirNaStripe } from '../../pedido/pedido-stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEM_CACHE = { 'Cache-Control': 'no-store' };

/**
 * O status da reserva, para a página consultar a cada poucos segundos enquanto o pagamento está pendente. O código
 * pode ser o de um voucher ou o de um pedido do carrinho com vários itens (o checkout embutido acompanha o pedido
 * inteiro): aí vale o voucher que representa o pedido. Só sai o que src/lib/reserva-publica.ts deixa (o status, o
 * motivo da recusa, o provedor e a forma de pagamento). Se o pedido da Stripe está pendente há mais de 60 s, o
 * servidor confere a sessão na Stripe por conta própria (rede de segurança se o webhook atrasar): uma consulta de
 * cada vez, no máximo a cada 10 s por pedido e com um teto por IP (conferirNaStripe). O navegador nunca decide o
 * status.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/reservas/[codigo]'>) {
  const { codigo } = await ctx.params;
  const url = new URL(req.url);
  const idiomaQ = url.searchParams.get('idioma') ?? 'pt';
  const ler = () => obterReservaDoPedido(codigo).catch(() => null);
  let reserva = await ler();
  if (!reserva || !tokenConfere(reserva, url.searchParams.get('t'))) {
    return NextResponse.json({ ok: false }, { status: 404, headers: SEM_CACHE });
  }
  try {
    // a consulta atualiza o pedido; a resposta é sobre o código consultado, relido depois
    if (await conferirNaStripe(reserva, { origem: 'status', ip: ipDaRequisicao(req.headers) })) reserva = (await ler()) ?? reserva;
  } catch (e) {
    console.error(`[status] falha ao consultar a Stripe sobre ${codigo}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const idioma = isIdioma(idiomaQ) ? idiomaQ : 'pt';
  return NextResponse.json({ ok: true, reserva: paraPublico(reserva, idioma) }, { headers: SEM_CACHE });
}
