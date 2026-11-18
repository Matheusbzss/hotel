import { NextResponse, type NextRequest } from 'next/server';
import { PREFIXOS_IDIOMA, rota, semIdioma, type Idioma } from '@/i18n/config';
import { urlDoSite } from '@/lib/site';

/** O endereço que a Vercel dá ao projeto: abre o mesmo site, então quem chega por ele vai para o endereço oficial. */
const ENDERECO_DA_VERCEL = 'agencia-victor-hugo.vercel.app';

/** Os prefixos dos idiomas com endereço próprio (/en, /es, /es-ar), do mais comprido para o mais curto: /es-ar casa antes de /es. */
const PREFIXO_TRADUZIDO = new RegExp(
  `^\\/(${PREFIXOS_IDIOMA.split('|')
    .filter((p) => p !== 'pt')
    .join('|')})(?=\\/|$)`,
);

/**
 * Rotas de idioma:
 *  - português fica sem prefixo (/passeios) e é servido internamente por /pt/passeios;
 *  - inglês e os dois espanhóis usam /en/..., /es/... e /es-ar/..., com o endereço traduzido (/es/paseos, /es-ar/paseos),
 *    servido pela pasta em português; nenhuma troca automática de idioma acontece aqui;
 *  - o endereço antigo em português (/es/passeios) e /pt/... redirecionam (evita conteúdo duplicado).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (request.headers.get('host') === ENDERECO_DA_VERCEL) {
    return NextResponse.redirect(`${urlDoSite()}${pathname}${search}`, 301);
  }

  const idioma = pathname.match(PREFIXO_TRADUZIDO)?.[1] as Exclude<Idioma, 'pt'> | undefined;
  if (idioma) {
    // as imagens de prévia geradas pelo Next ficam no caminho da pasta
    if (pathname.includes('/opengraph-image') || pathname.includes('/twitter-image')) return NextResponse.next();
    const pasta = semIdioma(pathname);
    const publico = rota(idioma, pasta);
    if (publico !== pathname) {
      const destino = new URL(publico, request.url);
      destino.search = search;
      return NextResponse.redirect(destino, 301);
    }
    const interno = new URL(`/${idioma}${pasta === '/' ? '' : pasta}`, request.url);
    if (interno.pathname === pathname) return NextResponse.next();
    interno.search = search;
    return NextResponse.rewrite(interno);
  }

  if (pathname === '/pt' || pathname.startsWith('/pt/')) {
    // imagens de prévia geradas pelo Next ficam sob /pt/...; não redirecionar
    if (pathname.includes('/opengraph-image') || pathname.includes('/twitter-image')) return NextResponse.next();
    const destino = new URL(pathname.replace(/^\/pt/, '') || '/', request.url);
    destino.search = search;
    return NextResponse.redirect(destino, 308);
  }

  const interno = new URL(`/pt${pathname === '/' ? '' : pathname}`, request.url);
  interno.search = search;
  return NextResponse.rewrite(interno);
}

export const config = {
  matcher: ['/((?!api|admin|_next|_vercel|.*\\..*).*)'],
};
