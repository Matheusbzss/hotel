import { pedidoRecusado } from '@/lib/admin-auth';
import { obterCasaPainel } from '@/lib/casas';
import { centroCabeNoRecorte, recorteSatelite } from '@/lib/satelite-casa';

export const runtime = 'nodejs';

/**
 * A prévia do mapa no painel (Pacote 32): o MESMO recorte da foto de satélite que a página da casa mostra
 * (/mapa/casas/<slug>.webp), em volta do centro PÚBLICO do círculo, mas também para a casa fora do ar, e só com o login
 * do painel. Nada de cache: depois de mudar o ponto, a prévia já vem com o centro novo.
 */
// o tipo do segundo argumento vai escrito à mão (o mesmo do RouteContext), para o tsc não depender dos tipos gerados
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const recusado = await pedidoRecusado(req);
  if (recusado) return recusado;
  const { id } = await ctx.params;
  const casa = await obterCasaPainel(id);
  if (!casa?.centro || !centroCabeNoRecorte(casa.centro)) return new Response('Mapa não encontrado', { status: 404 });
  const imagem = await recorteSatelite(casa.centro);
  return new Response(new Uint8Array(imagem), {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store' },
  });
}
