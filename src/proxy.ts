import { NextResponse, type NextRequest } from 'next/server';

/**
 * Rotas de idioma:
 *  - português fica sem prefixo (/passeios) e é servido internamente por /pt/passeios;
 *  - inglês e espanhol usam /en/... e /es/...;
 *  - /pt/... redireciona para o endereço sem prefixo (evita conteúdo duplicado).
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === '/en' || pathname.startsWith('/en/') || pathname === '/es' || pathname.startsWith('/es/')) {
    return NextResponse.next();
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
