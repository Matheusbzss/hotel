import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_IDIOMA, idiomaGuardado, opcoesDoCookieDoIdioma } from '@/i18n/chegada';

export const dynamic = 'force-dynamic';

/**
 * Grava o idioma que a pessoa escolheu (no seletor ou na faixa que sugere o espanhol) com o Set-Cookie do próprio site
 * (revisão do Pacote 31, 25/11). O navegador já grava o mesmo cookie na hora (gravarIdiomaNoNavegador, em
 * src/i18n/chegada.ts), mas no Safari do iPhone o cookie escrito pelo JavaScript dura no máximo 7 dias; este dura 1 ano,
 * como o que a troca automática grava no proxy. Só aceita um dos quatro idiomas do site, e só do próprio site: um pedido
 * vindo de outro site (Sec-Fetch-Site diferente de "same-origin") não muda o idioma de ninguém. Não lê nem guarda nada
 * da pessoa. Responde 204, sem corpo e sem cache.
 */
export async function POST(request: NextRequest) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site.trim().toLowerCase() !== 'same-origin') return new NextResponse(null, { status: 403 });
  const idioma = idiomaGuardado(request.nextUrl.searchParams.get('idioma'));
  if (!idioma) return new NextResponse(null, { status: 400 });
  const resposta = new NextResponse(null, { status: 204 });
  resposta.cookies.set(COOKIE_IDIOMA, idioma, opcoesDoCookieDoIdioma(request.nextUrl.protocol === 'https:'));
  resposta.headers.set('Cache-Control', 'private, no-store');
  return resposta;
}
