import { centroDaCasa } from '@/lib/casas';
import { centroCabeNoRecorte, recorteSatelite, versaoDoRecorte } from '@/lib/satelite-casa';

/**
 * O mapa de cada casa no ar: o recorte da foto de satélite em volta do centro PÚBLICO do círculo (deslocado do ponto
 * que o dono marca no painel; o ponto nunca sai do banco). Feito na primeira visita (o endereço termina em .webp e passa
 * direto pelo roteador de idiomas). Sem o ponto marcado, não há mapa.
 *
 * A página pede o endereço com a versão do centro (?v=, versaoDoRecorte), e só esse endereço fica guardado por um dia,
 * na Vercel e no navegador: quando o dono muda o ponto, a página refeita pede uma versão nova, e a foto nova chega junto
 * com os nomes das praias. O recorte sai sempre do centro gravado na casa; o ?v= só decide se a foto pode ser guardada.
 * Uma versão que não é a do centro de agora (a página aberta antes da mudança, ou o endereço sem a versão) leva a foto
 * sem guardar: assim, o endereço de uma versão nunca fica guardado com a foto de outro centro.
 */
export async function GET(req: Request, ctx: RouteContext<'/mapa/casas/[arquivo]'>) {
  const { arquivo } = await ctx.params;
  const centro = await centroDaCasa(arquivo.replace(/\.webp$/, ''));
  if (!centro || !centroCabeNoRecorte(centro)) return new Response('Mapa não encontrado', { status: 404 });
  const imagem = await recorteSatelite(centro);
  const daVersao = new URL(req.url).searchParams.get('v') === versaoDoRecorte(centro);
  return new Response(new Uint8Array(imagem), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': daVersao ? 'public, max-age=86400, s-maxage=86400' : 'private, no-store',
    },
  });
}
