import { segredoConfere } from '@/lib/admin-auth';
import { arquivoDoGoogle } from '@/lib/conversoes';
import { agruparPedidos } from '@/lib/pedidos-painel';
import { listarReservas } from '@/lib/reservas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * O arquivo de vendas pagas que o Google busca todo dia. O endereço leva um segredo: <GOOGLE_ARQUIVO_SEGREDO>.csv.
 * Sem o segredo cadastrado na Vercel, o arquivo não existe.
 */
export async function GET(_req: Request, ctx: RouteContext<'/api/anuncios/compras-google/[arquivo]'>) {
  const { arquivo } = await ctx.params;
  if (!segredoConfere(arquivo.replace(/\.csv$/, ''), process.env.GOOGLE_ARQUIVO_SEGREDO)) {
    return new Response('Arquivo não encontrado', { status: 404 });
  }
  return new Response(arquivoDoGoogle(agruparPedidos(await listarReservas()), new Date()), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
