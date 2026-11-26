import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_IDIOMA, opcoesDoCookieDoIdioma, trocaDaChegada } from '@/i18n/chegada';
import { PREFIXOS_IDIOMA, rota, semIdioma, type Idioma } from '@/i18n/config';
import { urlDoSite } from '@/lib/site';

/** O endereço que a Vercel dá ao projeto: abre o mesmo site, então quem chega por ele vai para o endereço oficial. */
const ENDERECO_DA_VERCEL = 'agencia-victor-hugo.vercel.app';

/** O host do endereço oficial (orlanativa.online), para a troca automática reconhecer o Referer do próprio site. */
function hostOficial(): string {
  try {
    return new URL(urlDoSite()).host;
  } catch {
    return '';
  }
}

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
 *    servido pela pasta em português;
 *  - o endereço antigo em português (/es/passeios) e /pt/... redirecionam (evita conteúdo duplicado);
 *  - a única troca automática de idioma é a da página inicial em português ("/"), desde o Pacote 31 (25/11): quem chega
 *    de fora com o cookie do idioma vai para a inicial da versão guardada nele (o "pt" fica), e, sem o cookie, quem tem
 *    o navegador em espanhol vai para /es-ar ou /es (a regra completa em src/i18n/chegada.ts). Nenhuma outra página
 *    troca, e os endereços dos anúncios (/es-ar/..., /es/...) continuam mandando.
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

  // Pacote 31 (25/11): a troca automática do espanhol, só na "/" (quem decide e por quê: src/i18n/chegada.ts). Sempre
  // 307, temporário: um 301 ou 308 fica guardado no navegador e prenderia quem depois escolhe o português no seletor. A
  // página inicial continua estática e guardada no cache da Vercel: a decisão roda aqui, antes do cache, como a
  // reescrita de "/" para "/pt" logo abaixo (node_modules/next/dist/docs/01-app/02-guides/cdn-caching.md). O hreflang,
  // o canonical e o x-default ("/") não mudam, e os robôs nunca são trocados.
  if (pathname === '/') {
    const troca = trocaDaChegada({
      metodo: request.method,
      caminho: pathname,
      busca: search,
      aceitaIdioma: request.headers.get('accept-language'),
      pais: request.headers.get('x-vercel-ip-country'),
      cookie: request.cookies.get(COOKIE_IDIOMA)?.value,
      navegador: request.headers.get('user-agent'),
      secFetchSite: request.headers.get('sec-fetch-site'),
      referer: request.headers.get('referer'),
      hostsDoSite: [request.headers.get('host') ?? '', hostOficial()],
    });
    if (troca) {
      const resposta = NextResponse.redirect(new URL(troca.destino, request.url), 307);
      // a versão fica guardada: as próximas chegadas de fora na "/" vão direto para ela (até a pessoa escolher outra no
      // seletor ou na faixa), e a faixa das outras páginas sabe qual espanhol sugerir
      resposta.cookies.set(COOKIE_IDIOMA, troca.idioma, opcoesDoCookieDoIdioma(request.nextUrl.protocol === 'https:'));
      // a "/" é a mesma para todos: a resposta da troca não vai para nenhum cache (nem o da Vercel, nem o do navegador)
      resposta.headers.set('Cache-Control', 'private, no-store');
      return resposta;
    }
  }

  const interno = new URL(`/pt${pathname === '/' ? '' : pathname}`, request.url);
  interno.search = search;
  return NextResponse.rewrite(interno);
}

/**
 * O prefixo 149e9513-… é o caminho que o withBotId (next.config.ts) reescreve para api.vercel.com: o desafio c.js e a
 * passagem /v1/proxy/:path* (ver node_modules/botid/dist/next/config/index.mjs). Fica fora das rotas de idioma; sem
 * isto, as chamadas sem extensão do BotID virariam /pt/149e…, a reescrita nunca casaria e o envio do cliente ficaria
 * esperando.
 */
export const config = {
  matcher: ['/((?!api|admin|_next|_vercel|149e9513-01fa-4fb0-aad4-566afd725d1b|.*\\..*).*)'],
};
