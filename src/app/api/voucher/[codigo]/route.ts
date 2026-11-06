import { gerarVoucherPdf } from '@/lib/pdf-voucher';
import { tokenConfere } from '@/lib/reserva-publica';
import { obterReserva } from '@/lib/reservas';
import { rota } from '@/i18n/config';
import { urlDoSite } from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Voucher em PDF — só depois que o pagamento foi confirmado. */
export async function GET(req: Request, ctx: RouteContext<'/api/voucher/[codigo]'>) {
  const { codigo } = await ctx.params;
  const t = new URL(req.url).searchParams.get('t');
  const reserva = await obterReserva(codigo).catch(() => null);
  if (!reserva || !tokenConfere(reserva, t)) return new Response('Reserva não encontrada', { status: 404 });
  if (reserva.status !== 'pago') return new Response('Voucher disponível após a confirmação do pagamento', { status: 409 });
  const link = `${urlDoSite()}${rota(reserva.idioma, `/reserva/${reserva.codigo}`)}?t=${encodeURIComponent(reserva.token)}`;
  const pdf = await gerarVoucherPdf(reserva, link);
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="voucher-${reserva.codigo}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
