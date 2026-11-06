import { NextResponse } from 'next/server';
import { sincronizarReserva } from '@/lib/pagamentos';
import { paraPublico, tokenConfere } from '@/lib/reserva-publica';
import { obterReserva } from '@/lib/reservas';
import { isIdioma } from '@/i18n/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Status da reserva (a página de confirmação consulta a cada poucos segundos enquanto o Pix não cai). */
export async function GET(req: Request, ctx: RouteContext<'/api/reservas/[codigo]'>) {
  const { codigo } = await ctx.params;
  const url = new URL(req.url);
  const idiomaQ = url.searchParams.get('idioma') ?? 'pt';
  let reserva = await obterReserva(codigo).catch(() => null);
  if (!reserva || !tokenConfere(reserva, url.searchParams.get('t'))) {
    return NextResponse.json({ ok: false }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  // Se ainda está pendente, confere direto na Pagar.me (no máximo a cada 6 s), caso o webhook atrase.
  const ultima = reserva.pagamento.ultimaConsulta ? Date.parse(reserva.pagamento.ultimaConsulta) : 0;
  if (reserva.status === 'pendente' && Date.now() - ultima > 6000) {
    reserva = await sincronizarReserva(reserva, 'consulta').catch((e) => {
      console.error('[status] falha ao consultar a Pagar.me', e);
      return reserva!;
    });
  }
  const idioma = isIdioma(idiomaQ) ? idiomaQ : 'pt';
  return NextResponse.json({ ok: true, reserva: paraPublico(reserva, idioma) }, { headers: { 'Cache-Control': 'no-store' } });
}
