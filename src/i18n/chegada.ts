import { isIdioma, rota, semIdioma, type Idioma } from './config.ts';

/**
 * A TROCA AUTOMÁTICA DO ESPANHOL (Fase 4, Etapa 3, lote 3; Pacote 31, 25/11/2026, liberada pelo dono: "pode fazer
 * agora"). A regra fica aqui, num arquivo sem o atalho "@/", para os testes em node lerem o mesmo código que o proxy
 * (src/proxy.ts), o seletor de idioma (src/components/SeletorIdioma.tsx) e a faixa que sugere o espanhol
 * (src/components/SugestaoIdioma.tsx) usam. Quem vê qual versão, nesta ordem (material-recebido/FASE-4.md, Etapa 3):
 * (1) o link do anúncio já leva para a versão certa (/es-ar para a Argentina, /es para o Chile), e nada aqui mexe nele;
 * (2) o idioma do celular ou do navegador (es-AR ou es-CL), que vale até para o turista que já está no Brasil com IP
 * brasileiro; (3) o país do IP, que a Vercel manda no cabeçalho x-vercel-ip-country, só quando o navegador diz espanhol
 * sem dizer o país ("es" ou "es-419"). A troca só acontece na página inicial em português ("/"); nas outras páginas, no
 * máximo a faixa. A escolha da pessoa (o cookie do idioma) vale mais que a detecção.
 *
 * O país serve só para escolher o idioma: não é guardado (a política de privacidade, itens 3 e 5, diz isso).
 */

/** O cookie do idioma: o escolhido pela pessoa (no seletor ou na faixa) ou o que a troca automática escolheu. */
export const COOKIE_IDIOMA = 'on_idioma';
/** 1 ano, em segundos: o prazo que a política de privacidade (item 5) promete. */
export const IDADE_COOKIE_IDIOMA = 60 * 60 * 24 * 365;

/** As duas versões do espanhol: as únicas que a troca automática e a faixa escolhem. */
export type Espanhol = Extract<Idioma, 'es' | 'es-ar'>;

/** Um código de idioma bem formado ("es", "es-AR", "es-419", "pt-BR"); o "*" e o lixo ficam de fora. */
const CODIGO = /^[a-z]{1,8}(-[a-z0-9]{1,8})*$/i;
/** O peso de um idioma no Accept-Language, como a norma escreve (RFC 9110: de 0 a 1, até três casas). */
const PESO = /^(0(\.\d{0,3})?|1(\.0{0,3})?)$/;

/**
 * Os idiomas do cabeçalho Accept-Language, do preferido para o último (pelo peso q; empate fica na ordem em que vieram).
 * Sem pacote novo, como no guia do Next (node_modules/next/dist/docs/01-app/02-guides/internationalization.md). Peso 0,
 * peso estragado e código estragado saem; cabeçalho enorme é cortado (ninguém precisa de mais de 32 idiomas).
 */
export function linguasDoNavegador(aceita: string | null | undefined): string[] {
  if (!aceita) return [];
  const lidas: { codigo: string; peso: number; ordem: number }[] = [];
  aceita
    .slice(0, 1000)
    .split(',')
    .slice(0, 32)
    .forEach((pedaco, ordem) => {
      const [bruto, ...parametros] = pedaco.split(';');
      const codigo = bruto.trim().replace(/_/g, '-');
      if (!CODIGO.test(codigo)) return;
      let peso = 1;
      for (const parametro of parametros) {
        const [nome, valor = ''] = parametro.split('=').map((p) => p.trim());
        if (nome.toLowerCase() === 'q') peso = PESO.test(valor) ? Number(valor) : Number.NaN;
      }
      if (peso > 0) lidas.push({ codigo, peso, ordem });
    });
  return lidas.sort((a, b) => b.peso - a.peso || a.ordem - b.ordem).map((l) => l.codigo);
}

/** O primeiro idioma bem formado da lista (a do Accept-Language já ordenada, ou a do navigator.languages). */
export function primeiraLingua(linguas: readonly string[]): string | null {
  for (const lingua of linguas) {
    const codigo = String(lingua ?? '')
      .trim()
      .replace(/_/g, '-');
    if (CODIGO.test(codigo)) return codigo;
  }
  return null;
}

/**
 * A versão do espanhol de um idioma do navegador, ou null se não for espanhol. es-AR vai para o da Argentina; o espanhol
 * de outro país (es-CL, es-MX, es-ES, es-UY...) vai para o neutro. Pela regra do dono, o Uruguai, que também usa "vos",
 * fica no neutro. Sem o país no código ("es", ou a região numérica "es-419", da América Latina), vale o país do IP:
 * AR vai para o da Argentina; qualquer outro, ou nenhum (no navegador e no computador não há o cabeçalho), para o neutro.
 */
export function espanholDaLingua(codigo: string, pais?: string | null): Espanhol | null {
  const [lingua, ...resto] = codigo.toLowerCase().split('-');
  if (lingua !== 'es') return null;
  const regiao = resto.find((p) => /^([a-z]{2}|\d{3})$/.test(p));
  if (regiao && /^[a-z]{2}$/.test(regiao)) return regiao === 'ar' ? 'es-ar' : 'es';
  return (pais ?? '').trim().toUpperCase() === 'AR' ? 'es-ar' : 'es';
}

/** O idioma guardado no cookie, só se for um dos quatro do site; valor estranho é ignorado. */
export function idiomaGuardado(valor: string | null | undefined): Idioma | null {
  return valor && isIdioma(valor) ? valor : null;
}

/** O valor do cookie do idioma no texto do document.cookie ("a=1; on_idioma=es-ar"), ou null. */
export function cookieDoIdioma(cookies: string): string | null {
  for (const parte of cookies.split(';')) {
    const [nome, ...valor] = parte.trim().split('=');
    if (nome === COOKIE_IDIOMA) return valor.join('=');
  }
  return null;
}

/**
 * Robôs nunca são trocados, pelo nome do navegador: os do Google (Googlebot, AdsBot, Mediapartners, o InspectionTool do
 * Search Console, GoogleOther), Bing, os outros buscadores, as prévias de link (WhatsApp, Facebook, Telegram, Slack...)
 * e o Lighthouse do PageSpeed. O Google pode visitar com o Accept-Language de outro país; trocado, ele veria a "/" (o
 * x-default do hreflang) como um redirecionamento. Navegador sem nome também fica. Um celular com "bot" no nome
 * (o CUBOT) cai aqui por engano: ele só fica no português, como era antes, e a faixa ainda sugere o espanhol. Os
 * navegadores de dentro do Instagram e do Facebook (FBAN, FBAV, Instagram) são pessoas: ficam de fora da lista.
 */
const ROBOS =
  /bot\b|bot_|crawl|spider|slurp|preview|lighthouse|pagespeed|google-|-google|googleother|facebookexternalhit|facebookcatalog|meta-external|whatsapp/i;

export function ehRobo(navegador: string | null | undefined): boolean {
  return !navegador?.trim() || ROBOS.test(navegador);
}

/**
 * Quem já está andando no site nunca é trocado: o seletor de idioma, o logo e as navegações internas do Next pedem a "/"
 * com Sec-Fetch-Site "same-origin". O Next tira do proxy os cabeçalhos internos dessas navegações
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md, "RSC requests and rewrites"), então
 * este é o jeito de reconhecê-las. Sem o Sec-Fetch-Site (o Safari antes da 16.4), vale o Referer do próprio site, que o
 * site manda para ele mesmo (Referrer-Policy em next.config.ts). Com o Sec-Fetch-Site, só ele decide.
 *
 * Limite conhecido e aceito (revisão do Pacote 31): as páginas do pedido e da reserva pedem referrer "no-referrer" (o
 * link leva o token do cliente), então, num Safari antes da 16.4, o toque no logo de lá chega na "/" sem os dois
 * cabeçalhos e conta como chegada de fora: um aparelho em espanhol vai para a inicial em espanhol. O Next 16 só garante
 * o Safari 16.4 para cima (node_modules/next/dist/docs/03-architecture/supported-browsers.md), que já manda o
 * Sec-Fetch-Site. O teste "quem já está andando no site" registra esse caso.
 */
export function navegacaoDeDentro(
  secFetchSite: string | null | undefined,
  referer: string | null | undefined,
  hostsDoSite: readonly string[],
): boolean {
  if (secFetchSite) return secFetchSite.trim().toLowerCase() === 'same-origin';
  if (!referer) return false;
  try {
    const host = new URL(referer).host.toLowerCase();
    return hostsDoSite.some((h) => h && h.toLowerCase() === host);
  } catch {
    return false;
  }
}

/** O pedido que chega no proxy, só com o que a troca automática lê. */
export interface Chegada {
  metodo: string;
  /** O caminho público, sem a busca ("/"). */
  caminho: string;
  /** A busca do endereço, com o "?" ("?utm_source=google"), ou vazia. */
  busca: string;
  /** O cabeçalho Accept-Language. */
  aceitaIdioma?: string | null;
  /** O país do IP (x-vercel-ip-country), que só a Vercel manda. */
  pais?: string | null;
  /** O valor do cookie do idioma. */
  cookie?: string | null;
  /** O User-Agent. */
  navegador?: string | null;
  secFetchSite?: string | null;
  referer?: string | null;
  /** Os endereços do próprio site (o Host do pedido e o oficial), para ler o Referer. */
  hostsDoSite: readonly string[];
}

/** A troca: o idioma escolhido e o endereço de destino, com a mesma busca. */
export interface TrocaDaChegada {
  idioma: Exclude<Idioma, 'pt'>;
  destino: string;
}

/**
 * Para onde mandar quem chega na página inicial em português, ou null para ficar nela. Só a "/", só GET (o HEAD dos
 * verificadores de link e o POST ficam), nunca quem já está no site e nunca robô. O cookie manda: "pt" fica; "es",
 * "es-ar" ou "en" vão para a página inicial dessa versão. Sem cookie, vale o PRIMEIRO idioma do navegador: espanhol vai
 * para /es-ar ou /es (espanholDaLingua); qualquer outro fica no português (o celular em inglês continua no português,
 * como antes). O destino leva a mesma busca, para a etiqueta da campanha (utm_*, gclid) não se perder.
 *
 * O pedido do roteador do Next (a navegação por dentro do site, o RSC) não tem regra própria aqui: o Next tira do proxy o
 * "?_rsc=" do endereço (node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/
 * skipProxyUrlNormalize.md: "The internal `_rsc` query parameter is stripped") e os cabeçalhos rsc e next-router-*
 * (01-app/03-api-reference/03-file-conventions/proxy.md, "RSC requests and rewrites"). Conferido na cópia particular em
 * 25/11: um "/?_rsc=" chega aqui sem o parâmetro. Ele é reconhecido pelo Sec-Fetch-Site "same-origin", ou pelo Referer
 * do site, como qualquer navegação de dentro (navegacaoDeDentro).
 */
export function trocaDaChegada(c: Chegada): TrocaDaChegada | null {
  if (c.metodo !== 'GET' || c.caminho !== '/') return null;
  if (navegacaoDeDentro(c.secFetchSite, c.referer, c.hostsDoSite) || ehRobo(c.navegador)) return null;
  const guardado = idiomaGuardado(c.cookie);
  const primeira = primeiraLingua(linguasDoNavegador(c.aceitaIdioma));
  const idioma = guardado ?? (primeira ? espanholDaLingua(primeira, c.pais) : null);
  if (!idioma || idioma === 'pt') return null;
  return { idioma, destino: `${rota(idioma, '/')}${c.busca}` };
}

/**
 * As páginas sem a faixa: o checkout, o pedido, a reserva (o voucher), o consultar pedido e o sair da lista, em
 * qualquer idioma. Trocar de idioma no meio de uma compra ou de um link com o token do cliente atrapalha mais do que
 * ajuda. Pelo mesmo motivo, as que terminam num passo de compra: o "Finalizar transfer" (/transfer/checkout) e a futura
 * página de reservar uma casa (/casas-de-temporada/<casa>/reservar, o link do botão "Reservar" de
 * src/components/casas/ReservaCasa.tsx).
 */
const PASTAS_SEM_SUGESTAO = ['checkout', 'pedido', 'reserva', 'consultar-pedido', 'sair-da-lista'];
const FINAIS_SEM_SUGESTAO = ['checkout', 'reservar'];

export function paginaComSugestao(caminho: string): boolean {
  const [trilha] = caminho.split(/[?#]/);
  const partes = semIdioma(trilha || '/')
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  return !PASTAS_SEM_SUGESTAO.includes(partes[0] ?? '') && !FINAIS_SEM_SUGESTAO.includes(partes.at(-1) ?? '');
}

/**
 * A versão do espanhol que a faixa sugere, ou null para não aparecer. Só nas páginas em português e em inglês (entre os
 * dois espanhóis ela não sugere: os dois se entendem, e o seletor resolve), menos as de paginaComSugestao. Com o cookie,
 * ele manda: "es" ou "es-ar" sugerem a versão dele; "pt" ou "en" (a pessoa escolheu, ou fechou a faixa) não sugerem
 * nada. Sem cookie, o primeiro idioma do aparelho (navigator.languages), sem o país do IP, que o navegador não tem:
 * es-AR sugere /es-ar; o resto do espanhol, /es.
 */
export function sugestaoDeIdioma(s: {
  idiomaDaPagina: Idioma;
  caminho: string;
  cookie?: string | null;
  linguas: readonly string[];
}): Espanhol | null {
  if (s.idiomaDaPagina !== 'pt' && s.idiomaDaPagina !== 'en') return null;
  if (!paginaComSugestao(s.caminho)) return null;
  const guardado = idiomaGuardado(s.cookie);
  if (guardado) return guardado === 'es' || guardado === 'es-ar' ? guardado : null;
  const primeira = primeiraLingua(s.linguas);
  return primeira ? espanholDaLingua(primeira) : null;
}

/**
 * As opções do cookie do idioma gravado pelo servidor (o proxy na troca e a rota /api/idioma): 1 ano, o site inteiro,
 * SameSite=Lax e Secure no https.
 */
export function opcoesDoCookieDoIdioma(seguro: boolean) {
  return { path: '/', maxAge: IDADE_COOKIE_IDIOMA, sameSite: 'lax' as const, secure: seguro };
}

/**
 * O mesmo cookie escrito pelo navegador (o seletor e a faixa). Sem HttpOnly de propósito: a faixa precisa ler a escolha.
 * O valor é só o código do idioma, nada da pessoa.
 */
export function textoDoCookieDoIdioma(idioma: Idioma, seguro: boolean): string {
  return `${COOKIE_IDIOMA}=${idioma}; path=/; max-age=${IDADE_COOKIE_IDIOMA}; samesite=lax${seguro ? '; secure' : ''}`;
}

/** A rota que devolve o cookie do idioma com o Set-Cookie do próprio site (src/app/api/idioma/route.ts). */
export const ROTA_DO_IDIOMA = '/api/idioma';

/**
 * Grava o idioma escolhido (no toque do seletor e da faixa, antes de ir para a outra versão), de dois jeitos. No
 * navegador, na hora, para a faixa e a próxima página já lerem a escolha. E pelo servidor, que devolve o mesmo cookie
 * com o Set-Cookie: no Safari do iPhone (e nos navegadores de dentro do Instagram e do Facebook, que usam o mesmo
 * motor), o cookie escrito pelo JavaScript dura no máximo 7 dias (webkit.org/tracking-prevention), enquanto o do servidor
 * dura o 1 ano prometido, como o que a troca automática grava. Sem isso, a escolha da pessoa sumiria antes da detecção.
 * O keepalive deixa o pedido terminar mesmo se a página mudar logo depois do toque; se ele falhar, fica o do navegador.
 */
export function gravarIdiomaNoNavegador(idioma: Idioma): void {
  try {
    document.cookie = textoDoCookieDoIdioma(idioma, location.protocol === 'https:');
  } catch {}
  try {
    fetch(`${ROTA_DO_IDIOMA}?idioma=${idioma}`, { method: 'POST', keepalive: true, credentials: 'same-origin' }).catch(() => {});
  } catch {}
}
