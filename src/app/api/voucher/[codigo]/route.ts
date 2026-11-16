import { NextResponse } from 'next/server';
import { gerarVoucherPdf } from '@/lib/pdf-voucher';
import { statusDoVoucher, tokenConfere } from '@/lib/reserva-publica';
import { obterReserva } from '@/lib/reservas';
import { rota } from '@/i18n/config';
import { urlDoSite } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Voucher em PDF — só depois que o pagamento foi confirmado, e só do voucher que ainda vale (statusDoVoucher). O pedido
 * que ainda não foi pago, o vencido, o cancelado, o reembolsado, o contestado e o item cancelado ou reembolsado sozinho
 * num pedido pago não recebem PDF: o link leva à página da reserva (303), que diz o estado de verdade no idioma do
 * cliente (antes, um texto cru dizia "é só esperar" até num pedido reembolsado). Sem o token certo, 404, como antes.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/voucher/[codigo]'>) {
  const { codigo } = await ctx.params;
  const t = new URL(req.url).searchParams.get('t');
  const reserva = await obterReserva(codigo).catch(() => null);
  if (!reserva || !tokenConfere(reserva, t)) return new Response('Reserva não encontrada', { status: 404 });
  // a página da reserva com o token: o que o QR do PDF abre e, sem voucher para entregar, para onde o link leva
  const pagina = `${rota(reserva.idioma, `/reserva/${reserva.codigo}`)}?t=${encodeURIComponent(reserva.token)}`;
  if (statusDoVoucher(reserva) !== 'pago') return semVoucher(new URL(pagina, req.url));
  const pdf = await gerarVoucherPdf(reserva, `${urlDoSite()}${pagina}`);
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="voucher-${reserva.codigo}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

/**
 * O voucher que não vale (ainda não pago, vencido, reembolsado, contestado, cancelado): nenhum PDF sai. O link leva à
 * página da reserva, que diz o estado de verdade (o voucher de um pedido com vários itens cujo pedido não está pago
 * segue de lá para a página do pedido). O endereço leva o token, como o link que o cliente abriu: a resposta não fica
 * guardada no caminho e a página seguinte não fica sabendo de onde ele veio.
 */
function semVoucher(pagina: URL) {
  const resposta = NextResponse.redirect(pagina, 303);
  resposta.headers.set('Cache-Control', 'private, no-store');
  resposta.headers.set('Referrer-Policy', 'no-referrer');
  return resposta;
}
