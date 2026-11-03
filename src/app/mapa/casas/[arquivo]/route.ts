import { casasAtivas, obterCasa } from '@/data/casas';
import { recorteSatelite } from '@/lib/satelite-casa';

// o mapa de cada casa é gerado uma vez, no build (o endereço termina em .webp e passa direto pelo
// roteador de idiomas)
export const dynamicParams = false;

export function generateStaticParams() {
  return casasAtivas().map((c) => ({ arquivo: `${c.slug}.webp` }));
}

export async function GET(_req: Request, ctx: RouteContext<'/mapa/casas/[arquivo]'>) {
  const { arquivo } = await ctx.params;
  const casa = obterCasa(arquivo.replace(/\.webp$/, ''));
  if (!casa) return new Response('Mapa não encontrado', { status: 404 });
  const imagem = await recorteSatelite(casa.pontoAproximado);
  return new Response(new Uint8Array(imagem), {
    headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}
