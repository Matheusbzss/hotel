import { periodosParaOAirbnb } from '@/lib/casas';
import { gerarIcal } from '@/lib/ical';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** O link .ics de cada casa, para colar no Airbnb. O código secreto no endereço é o que dá acesso às datas. */
export async function GET(_req: Request, ctx: RouteContext<'/api/casas/calendario/[arquivo]'>) {
  const { arquivo } = await ctx.params;
  const periodos = await periodosParaOAirbnb(arquivo.replace(/\.ics$/, ''));
  if (!periodos) return new Response('Calendário não encontrado', { status: 404 });
  return new Response(gerarIcal(periodos, new Date()), {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
