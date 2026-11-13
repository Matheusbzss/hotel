import { pontoDaCasa } from '@/lib/casas';
import { recorteSatelite } from '@/lib/satelite-casa';

/**
 * O mapa de cada casa no ar: feito na primeira visita e guardado por um dia (o endereço termina em .webp
 * e passa direto pelo roteador de idiomas).
 */
export async function GET(_req: Request, ctx: RouteContext<'/mapa/casas/[arquivo]'>) {
  const { arquivo } = await ctx.params;
  const ponto = await pontoDaCasa(arquivo.replace(/\.webp$/, ''));
  if (!ponto) return new Response('Mapa não encontrado', { status: 404 });
  const imagem = await recorteSatelite(ponto);
  return new Response(new Uint8Array(imagem), {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  });
}
