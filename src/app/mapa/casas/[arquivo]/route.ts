import { centroDaCasa } from '@/lib/casas';
import { centroCabeNoRecorte, recorteSatelite } from '@/lib/satelite-casa';

/**
 * O mapa de cada casa no ar: o recorte da foto de satélite em volta do centro PÚBLICO do círculo (deslocado do ponto
 * que o dono marca no painel; o ponto nunca sai do banco). Feito na primeira visita e guardado por um dia (o endereço
 * termina em .webp e passa direto pelo roteador de idiomas). Sem o ponto marcado, não há mapa.
 */
export async function GET(_req: Request, ctx: RouteContext<'/mapa/casas/[arquivo]'>) {
  const { arquivo } = await ctx.params;
  const centro = await centroDaCasa(arquivo.replace(/\.webp$/, ''));
  if (!centro || !centroCabeNoRecorte(centro)) return new Response('Mapa não encontrado', { status: 404 });
  const imagem = await recorteSatelite(centro);
  return new Response(new Uint8Array(imagem), {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  });
}
