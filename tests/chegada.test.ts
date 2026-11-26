import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { frasesDoDocumento } from '../src/content/legal/argentino.ts';
import { ATUALIZADO_EM_EMAILS, ATUALIZADO_EM_ONLINE, PRIVACIDADE_EMAILS, PRIVACIDADE_ONLINE } from '../src/content/legal/online.ts';
import { PRIVACIDADE } from '../src/content/legal/privacidade.ts';
import { ATUALIZADO_EM, type DocumentoLegal } from '../src/content/legal/tipos.ts';
import {
  COOKIE_IDIOMA,
  IDADE_COOKIE_IDIOMA,
  cookieDoIdioma,
  ehRobo,
  espanholDaLingua,
  gravarIdiomaNoNavegador,
  idiomaGuardado,
  linguasDoNavegador,
  navegacaoDeDentro,
  opcoesDoCookieDoIdioma,
  paginaComSugestao,
  primeiraLingua,
  ROTA_DO_IDIOMA,
  sugestaoDeIdioma,
  textoDoCookieDoIdioma,
  trocaDaChegada,
  type Chegada,
} from '../src/i18n/chegada.ts';
import { IDIOMAS } from '../src/i18n/config.ts';
import { texto, type Traduzido } from '../src/i18n/conteudo.ts';
import { dicionario } from '../src/i18n/index.ts';

// Pacote 31 (25/11/2026): a troca automática do espanhol (lote 3 da Etapa 3 da Fase 4), que o dono liberou em 25/11
// ("pode fazer agora"). A regra (src/i18n/chegada.ts) é testada aqui em node; o proxy, o seletor, a faixa e o layout
// usam o atalho "@/", então deles se lê o código (sem os comentários). A política de privacidade ganhou a frase do país
// aproximado e do cookie do idioma, nos quatro idiomas e nas três versões.

/** O código de um arquivo sem os comentários (os do JSX, os de bloco e as linhas de comentário): só o que roda. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join(...partes), 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

const SITE = ['orlanativa.online', 'orlanativa.online'];
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** Quem chega de fora (um link no WhatsApp, a busca do Google, o endereço digitado), no celular, na "/". */
const chegada = (extra: Partial<Chegada> = {}): Chegada => ({
  metodo: 'GET',
  caminho: '/',
  busca: '',
  aceitaIdioma: 'es-AR,es;q=0.9',
  pais: null,
  cookie: null,
  navegador: IPHONE,
  secFetchSite: 'cross-site',
  referer: null,
  hostsDoSite: SITE,
  ...extra,
});
const destino = (extra: Partial<Chegada> = {}) => trocaDaChegada(chegada(extra))?.destino ?? null;

/* ------------------------------------------------------------------ */
/* O idioma do navegador                                               */

test('o Accept-Language: do preferido para o último, sem o "*", sem peso 0 e sem o que vier estragado', () => {
  assert.deepEqual(linguasDoNavegador('es-AR,es;q=0.9,en;q=0.8'), ['es-AR', 'es', 'en']);
  // o peso manda, não a ordem em que veio; empate fica na ordem
  assert.deepEqual(linguasDoNavegador('en;q=0.5, es-CL, pt;q=0.5'), ['es-CL', 'en', 'pt']);
  assert.deepEqual(linguasDoNavegador('es-419,es;q=0.9'), ['es-419', 'es']);
  for (const vazio of [null, undefined, '', '*', ' , ', 'es;q=0', '*;q=1']) assert.deepEqual(linguasDoNavegador(vazio), [], String(vazio));
  // peso estragado ou fora de 0 a 1 tira o idioma (não vira peso 1)
  assert.deepEqual(linguasDoNavegador('es;q=abc,pt-BR'), ['pt-BR']);
  assert.deepEqual(linguasDoNavegador('es;q=1.5,pt-BR;q=0.4'), ['pt-BR']);
  assert.deepEqual(linguasDoNavegador('es-AR;q=0.9x,en'), ['en']);
  // o "_" de alguns aplicativos vira "-"; lixo sai
  assert.deepEqual(linguasDoNavegador('es_AR'), ['es-AR']);
  assert.deepEqual(linguasDoNavegador('<script>,es-CL'), ['es-CL']);
  // cabeçalho enorme não trava nada: no máximo 32 idiomas
  assert.ok(linguasDoNavegador(Array(500).fill('es').join(',')).length <= 32);
  // a lista do navegador (navigator.languages): o primeiro bem formado
  assert.equal(primeiraLingua(['es-AR', 'es']), 'es-AR');
  assert.equal(primeiraLingua(['', '*', 'es_CL']), 'es-CL');
  assert.equal(primeiraLingua([]), null);
});

test('a versão do espanhol: es-AR vai para o argentino; o resto do espanhol, para o neutro; sem país no código, o do IP', () => {
  assert.equal(espanholDaLingua('es-AR'), 'es-ar');
  assert.equal(espanholDaLingua('es-ar'), 'es-ar');
  assert.equal(espanholDaLingua('es-Latn-AR'), 'es-ar');
  // o Uruguai também usa "vos", mas pela regra do dono vai para o neutro
  for (const codigo of ['es-CL', 'es-MX', 'es-ES', 'es-UY', 'es-CO', 'es-PE', 'es-US'])
    assert.equal(espanholDaLingua(codigo, 'AR'), 'es', codigo);
  // "es" sozinho e a América Latina (es-419): o país do IP decide
  assert.equal(espanholDaLingua('es', 'AR'), 'es-ar');
  assert.equal(espanholDaLingua('es', 'ar'), 'es-ar');
  assert.equal(espanholDaLingua('es-419', 'AR'), 'es-ar');
  assert.equal(espanholDaLingua('es-419', 'CL'), 'es');
  // o turista que já está no Brasil com o celular em "es": o neutro
  assert.equal(espanholDaLingua('es', 'BR'), 'es');
  // no navegador e no computador não há o cabeçalho do país: o neutro
  assert.equal(espanholDaLingua('es'), 'es');
  assert.equal(espanholDaLingua('es-419', null), 'es');
  for (const codigo of ['pt-BR', 'pt', 'en-US', 'en', 'eu', 'esp', 'fr-AR']) assert.equal(espanholDaLingua(codigo, 'AR'), null, codigo);
});

/* ------------------------------------------------------------------ */
/* A troca na página inicial                                           */

test('quem chega de fora na "/" com o celular em espanhol vai para /es-ar (Argentina) ou /es (o resto)', () => {
  assert.equal(destino({ aceitaIdioma: 'es-AR,es;q=0.9,en;q=0.8' }), '/es-ar');
  assert.equal(destino({ aceitaIdioma: 'es-CL,es;q=0.9' }), '/es');
  assert.equal(destino({ aceitaIdioma: 'es-419,es;q=0.9', pais: 'AR' }), '/es-ar');
  assert.equal(destino({ aceitaIdioma: 'es-419,es;q=0.9', pais: 'CL' }), '/es');
  assert.equal(destino({ aceitaIdioma: 'es', pais: 'BR' }), '/es');
  assert.equal(destino({ aceitaIdioma: 'es', pais: null }), '/es');
  // o idioma escolhido também volta, para o cookie
  assert.deepEqual(trocaDaChegada(chegada({ aceitaIdioma: 'es-AR' })), { idioma: 'es-ar', destino: '/es-ar' });
  // o navegador de dentro do Instagram e do Facebook é gente (o anúncio pode abrir nele), e o computador também
  const instagram = `${IPHONE} Instagram 360.0.0.0 (iPhone16,2; iOS 18_1; es_AR; es-AR; scale=3.00; 1290x2796)`;
  const facebook = `${ANDROID} [FBAN/EMA;FBLC/es_LA;FBAV/400.0.0.0;]`;
  for (const navegador of [instagram, facebook, ANDROID, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36'])
    assert.equal(destino({ navegador }), '/es-ar', navegador);
  // e o Sec-Fetch-Site "none" (endereço digitado, favorito) troca
  assert.equal(destino({ secFetchSite: 'none' }), '/es-ar');
});

test('vale o PRIMEIRO idioma do navegador: português, inglês ou outro ficam na "/" em português, como antes', () => {
  for (const aceitaIdioma of ['pt-BR,pt;q=0.9,es;q=0.8', 'en-US,en;q=0.9,es;q=0.8', 'fr-FR,es;q=0.5', 'pt', 'en'])
    assert.equal(destino({ aceitaIdioma }), null, aceitaIdioma);
  // Accept-Language vazio, "*" ou estragado: fica
  for (const aceitaIdioma of [null, '', '*', 'es;q=0', ';;;', 'es;q=2'])
    assert.equal(destino({ aceitaIdioma }), null, String(aceitaIdioma));
});

test('a escolha da pessoa vale mais que a detecção: o cookie do idioma manda', () => {
  assert.equal(destino({ cookie: 'pt', aceitaIdioma: 'es-AR' }), null);
  assert.equal(destino({ cookie: 'es-ar', aceitaIdioma: 'pt-BR' }), '/es-ar');
  assert.equal(destino({ cookie: 'es', aceitaIdioma: 'es-AR' }), '/es');
  assert.equal(destino({ cookie: 'en', aceitaIdioma: 'es-AR' }), '/en');
  assert.equal(destino({ cookie: 'en', aceitaIdioma: 'pt-BR' }), '/en');
  // cookie com valor estranho é ignorado: vale o navegador
  for (const cookie of ['fr', 'ES-AR', 'es-AR', '', ' pt', 'pt; x', '../es'])
    assert.equal(destino({ cookie, aceitaIdioma: 'es-CL' }), '/es', cookie);
  assert.equal(idiomaGuardado('es-ar'), 'es-ar');
  assert.equal(idiomaGuardado('es-AR'), null);
  assert.equal(idiomaGuardado(undefined), null);
  // o cookie só vale para quem chega de fora: quem já navega no site, os robôs e o HEAD ficam, com qualquer cookie
  // (revisão do Pacote 31: nada travava a ordem das conferências)
  assert.equal(destino({ cookie: 'es-ar', aceitaIdioma: 'pt-BR', secFetchSite: 'same-origin' }), null);
  assert.equal(destino({ cookie: 'en', secFetchSite: null, referer: 'https://orlanativa.online/passeios' }), null);
  assert.equal(destino({ cookie: 'es', navegador: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }), null);
  assert.equal(destino({ cookie: 'es-ar', metodo: 'HEAD' }), null);
});

test('quem já está andando no site nunca é trocado: o seletor, o logo e as navegações internas', () => {
  // o Sec-Fetch-Site do próprio site
  assert.equal(destino({ secFetchSite: 'same-origin' }), null);
  assert.equal(destino({ secFetchSite: 'Same-Origin' }), null);
  // sem o Sec-Fetch-Site (o Safari antes da 16.4): o Referer do próprio site, pelo Host do pedido ou pelo oficial
  assert.equal(destino({ secFetchSite: null, referer: 'https://orlanativa.online/passeios' }), null);
  assert.equal(
    destino({ secFetchSite: null, referer: 'http://localhost:3400/es-ar', hostsDoSite: ['localhost:3400', 'orlanativa.online'] }),
    null,
  );
  // o Referer de outro site, ou estragado, não conta
  assert.equal(destino({ secFetchSite: null, referer: 'https://www.google.com/' }), '/es-ar');
  assert.equal(destino({ secFetchSite: null, referer: 'https://orlanativa.online.golpe.com/' }), '/es-ar');
  assert.equal(destino({ secFetchSite: null, referer: 'não é endereço' }), '/es-ar');
  // com o Sec-Fetch-Site, só ele decide (um Referer do site com "cross-site" não é navegação de dentro)
  assert.equal(destino({ secFetchSite: 'cross-site', referer: 'https://orlanativa.online/' }), '/es-ar');
  assert.equal(destino({ secFetchSite: 'same-site' }), '/es-ar');
  assert.equal(navegacaoDeDentro(undefined, undefined, SITE), false);
  // limite conhecido e aceito: sem os dois cabeçalhos, conta como chegada de fora. É o toque no logo das páginas do
  // pedido e da reserva (referrer "no-referrer") num Safari antes da 16.4, que o Next 16 não garante mais
  assert.equal(destino({ secFetchSite: null, referer: null }), '/es-ar');
  // o pedido do roteador do Next (o RSC): o Next tira do proxy o "?_rsc=" e os cabeçalhos rsc e next-router-*, então
  // ele é reconhecido como qualquer navegação de dentro, pelo Sec-Fetch-Site (ou pelo Referer do site, sem ele). A regra
  // não lê o "?_rsc=": ela nunca o veria no site de verdade (conferido na cópia particular em 25/11)
  assert.equal(destino({ secFetchSite: 'same-origin', busca: '' }), null);
  assert.equal(destino({ secFetchSite: null, referer: 'https://orlanativa.online/es-ar', busca: '' }), null);
  assert.doesNotMatch(trocaDaChegada.toString(), /_rsc/);
});

test('robôs nunca são trocados: Google, Bing, as prévias do WhatsApp, do Facebook e do Telegram, o Lighthouse', () => {
  const ROBOS = [
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'AdsBot-Google (+http://www.google.com/adsbot.html)',
    'Mozilla/5.0 (Linux; Android 5.0; SM-G920A) AppleWebKit (KHTML, like Gecko) Chrome Mobile Safari (compatible; AdsBot-Google-Mobile; +http://www.google.com/mobile/adsbot.html)',
    'Mediapartners-Google',
    'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
    'Mozilla/5.0 (compatible; GoogleOther)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'WhatsApp/2.23.20.0 A',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
    'TelegramBot (like TwitterBot)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Chrome-Lighthouse',
    'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    '',
    '   ',
  ];
  for (const navegador of ROBOS) {
    assert.ok(ehRobo(navegador), navegador);
    assert.equal(destino({ navegador, aceitaIdioma: 'es-AR' }), null, navegador);
  }
  assert.ok(ehRobo(null) && ehRobo(undefined));
  for (const navegador of [IPHONE, ANDROID]) assert.equal(ehRobo(navegador), false, navegador);
});

test('só a "/" com GET troca: as outras páginas, os endereços dos anúncios, o POST e o HEAD nunca', () => {
  for (const caminho of ['/passeios', '/passeios/escuna-buzios', '/es', '/es-ar', '/en', '/es-ar/paseos/goleta-buzios', '/checkout', '//'])
    assert.equal(destino({ caminho }), null, caminho);
  for (const metodo of ['POST', 'HEAD', 'OPTIONS', 'get']) assert.equal(destino({ metodo }), null, metodo);
});

test('o destino leva a mesma busca: a etiqueta da campanha e o código do clique não se perdem', () => {
  assert.equal(destino({ busca: '?utm_source=google&utm_campaign=ar&gclid=abc' }), '/es-ar?utm_source=google&utm_campaign=ar&gclid=abc');
  assert.equal(destino({ aceitaIdioma: 'es-CL', busca: '?fbclid=x' }), '/es?fbclid=x');
  // a busca vai depois do caminho fixo: não muda o site de destino
  assert.equal(destino({ busca: '?x=//golpe.com' }), '/es-ar?x=//golpe.com');
  assert.equal(new URL(destino({ busca: '?x=//golpe.com' }) ?? '', 'https://orlanativa.online').host, 'orlanativa.online');
});

/* ------------------------------------------------------------------ */
/* A faixa nas outras páginas                                          */

test('a faixa: só nas páginas em português e em inglês, pelo cookie ou pelo primeiro idioma do aparelho', () => {
  const s = (extra: Partial<Parameters<typeof sugestaoDeIdioma>[0]> = {}) =>
    sugestaoDeIdioma({ idiomaDaPagina: 'pt', caminho: '/passeios/escuna-buzios', cookie: null, linguas: ['es-AR', 'es'], ...extra });
  assert.equal(s(), 'es-ar');
  assert.equal(s({ linguas: ['es-CL'] }), 'es');
  // sem o país do IP (o navegador não tem): "es" e "es-419" sugerem o neutro
  assert.equal(s({ linguas: ['es'] }), 'es');
  assert.equal(s({ linguas: ['es-419', 'es'] }), 'es');
  assert.equal(s({ idiomaDaPagina: 'en', caminho: '/en/tours' }), 'es-ar');
  // entre os dois espanhóis ela não sugere
  assert.equal(s({ idiomaDaPagina: 'es', caminho: '/es/paseos' }), null);
  assert.equal(s({ idiomaDaPagina: 'es-ar', caminho: '/es-ar/paseos', linguas: ['es-CL'] }), null);
  // português e inglês no aparelho: nada
  for (const linguas of [['pt-BR', 'es'], ['en-US'], [], ['']]) assert.equal(s({ linguas }), null, linguas.join());
  // o cookie manda: "pt" ou "en" (escolheu ou fechou a faixa) não sugerem; "es" ou "es-ar" sugerem a versão dele
  assert.equal(s({ cookie: 'pt' }), null);
  assert.equal(s({ cookie: 'en' }), null);
  assert.equal(s({ cookie: 'es', linguas: ['pt-BR'] }), 'es');
  assert.equal(s({ cookie: 'es-ar', linguas: ['en-US'] }), 'es-ar');
  assert.equal(s({ cookie: 'xx', linguas: ['es-CL'] }), 'es');
  // a mesma regra em qualquer página aberta
  for (const caminho of [
    '/',
    '/passeios',
    '/transfer',
    '/contato',
    '/en/transfer',
    '/politica-de-privacidade',
    '/casas-de-temporada/casa-x',
  ])
    assert.equal(s({ caminho }), 'es-ar', caminho);
});

test('a faixa não aparece no checkout, no pedido, no voucher, no consultar pedido nem no sair da lista', () => {
  for (const caminho of [
    '/checkout',
    '/en/checkout',
    '/pedido/ON-ABC234',
    '/pedido/ON-ABC234?t=abc',
    '/en/pedido/ON-ABC234',
    '/reserva/ON-ABC234',
    '/consultar-pedido',
    '/en/find-my-order',
    '/sair-da-lista',
    '/en/unsubscribe',
    '/casas-de-temporada/casa-ferradura/reservar',
    // o "Finalizar transfer" também é um passo de compra (revisão do Pacote 31)
    '/transfer/checkout',
    '/transfer/checkout?saida=x',
    '/en/transfer/checkout',
  ]) {
    assert.equal(paginaComSugestao(caminho), false, caminho);
    assert.equal(sugestaoDeIdioma({ idiomaDaPagina: caminho.startsWith('/en') ? 'en' : 'pt', caminho, linguas: ['es-AR'] }), null, caminho);
  }
  for (const caminho of ['/', '/passeios', '/pedidos-especiais', '/en/tours/schooner-buzios', '/casas-de-temporada', '/transfer', '/en/transfer'])
    assert.equal(paginaComSugestao(caminho), true, caminho);
});

/* ------------------------------------------------------------------ */
/* O cookie                                                             */

test('o cookie do idioma: on_idioma, 1 ano, o site inteiro, SameSite=Lax, Secure só no https, e só o código do idioma', () => {
  assert.equal(COOKIE_IDIOMA, 'on_idioma');
  assert.equal(IDADE_COOKIE_IDIOMA, 365 * 24 * 60 * 60);
  // o do proxy (Set-Cookie): sem HttpOnly de propósito, porque a faixa lê a escolha no navegador
  assert.deepEqual(opcoesDoCookieDoIdioma(true), { path: '/', maxAge: 31536000, sameSite: 'lax', secure: true });
  assert.deepEqual(opcoesDoCookieDoIdioma(false), { path: '/', maxAge: 31536000, sameSite: 'lax', secure: false });
  // o do navegador (o seletor e a faixa), escrito como os outros cookies do site (src/lib/pixel.ts)
  assert.equal(textoDoCookieDoIdioma('pt', true), 'on_idioma=pt; path=/; max-age=31536000; samesite=lax; secure');
  assert.equal(textoDoCookieDoIdioma('es-ar', false), 'on_idioma=es-ar; path=/; max-age=31536000; samesite=lax');
  for (const idioma of IDIOMAS) assert.equal(cookieDoIdioma(textoDoCookieDoIdioma(idioma, true).split(';')[0]), idioma);
  assert.equal(cookieDoIdioma('on_carrinho=abc; on_idioma=es-ar; on_medicao=sim'), 'es-ar');
  assert.equal(cookieDoIdioma('on_idioma_velho=es; xon_idioma=es'), null);
  assert.equal(cookieDoIdioma(''), null);
});

test('a escolha é gravada no navegador na hora e também pelo servidor (no iPhone, o cookie do JavaScript dura 7 dias)', async () => {
  const g = globalThis as Record<string, unknown>;
  const antes = { document: g.document, location: g.location, fetch: g.fetch };
  const pedidos: [string, RequestInit | undefined][] = [];
  try {
    g.document = { cookie: '' };
    g.location = { protocol: 'https:' };
    g.fetch = async (url: string, init?: RequestInit) => {
      pedidos.push([url, init]);
      return new Response(null, { status: 204 });
    };
    gravarIdiomaNoNavegador('pt');
    assert.equal((g.document as { cookie: string }).cookie, 'on_idioma=pt; path=/; max-age=31536000; samesite=lax; secure');
    assert.deepEqual(pedidos, [[`${ROTA_DO_IDIOMA}?idioma=pt`, { method: 'POST', keepalive: true, credentials: 'same-origin' }]]);
    assert.equal(ROTA_DO_IDIOMA, '/api/idioma');
    // o pedido que falha (sem internet) não estraga nada: o cookie do navegador já ficou
    g.fetch = async () => {
      throw new TypeError('sem rede');
    };
    gravarIdiomaNoNavegador('es-ar');
    assert.match((g.document as { cookie: string }).cookie, /^on_idioma=es-ar;/);
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    g.document = antes.document;
    g.location = antes.location;
    g.fetch = antes.fetch;
  }
});

/* ------------------------------------------------------------------ */
/* O proxy, o seletor, a faixa e o layout (o código)                   */

test('o proxy: a troca só na "/", com 307, o cookie e sem cache, antes da reescrita para /pt', () => {
  const proxy = codigo('src', 'proxy.ts');
  assert.match(proxy, /import \{ COOKIE_IDIOMA, opcoesDoCookieDoIdioma, trocaDaChegada \} from '@\/i18n\/chegada';/);
  const inicio = proxy.indexOf("if (pathname === '/') {");
  const reescrita = proxy.indexOf('const interno = new URL(`/pt${');
  const doPt = proxy.indexOf("if (pathname === '/pt' || pathname.startsWith('/pt/'))");
  assert.ok(inicio > doPt && doPt > 0, 'a troca vem depois do redirecionamento do /pt');
  assert.ok(reescrita > inicio, 'a troca vem antes da reescrita para /pt');
  const bloco = proxy.slice(inicio, reescrita);
  // sempre 307: o 301 e o 308 ficam guardados no navegador e prenderiam quem depois escolhe o português
  assert.match(bloco, /NextResponse\.redirect\(new URL\(troca\.destino, request\.url\), 307\)/);
  assert.doesNotMatch(bloco, /30[18]/);
  assert.equal(bloco.match(/NextResponse\.redirect\(/g)?.length, 1);
  assert.match(
    bloco,
    /resposta\.cookies\.set\(COOKIE_IDIOMA, troca\.idioma, opcoesDoCookieDoIdioma\(request\.nextUrl\.protocol === 'https:'\)\)/,
  );
  assert.match(bloco, /resposta\.headers\.set\('Cache-Control', 'private, no-store'\)/);
  // o que a regra lê vem do pedido, cada coisa do seu cabeçalho
  for (const lido of [
    'metodo: request.method',
    'caminho: pathname',
    'busca: search',
    "aceitaIdioma: request.headers.get('accept-language')",
    "pais: request.headers.get('x-vercel-ip-country')",
    'cookie: request.cookies.get(COOKIE_IDIOMA)?.value',
    "navegador: request.headers.get('user-agent')",
    "secFetchSite: request.headers.get('sec-fetch-site')",
    "referer: request.headers.get('referer')",
    "hostsDoSite: [request.headers.get('host') ?? '', hostOficial()]",
  ])
    assert.ok(bloco.includes(lido), lido);
  // o resto do proxy continua igual: os outros redirecionamentos e o matcher
  assert.match(proxy, /return NextResponse\.redirect\(destino, 301\);/);
  assert.match(proxy, /return NextResponse\.redirect\(destino, 308\);/);
  assert.match(proxy, /matcher: \['\/\(\(\?!api\|admin\|_next\|_vercel\|149e9513-01fa-4fb0-aad4-566afd725d1b\|\.\*\\\\\.\.\*\)\.\*\)'\]/);
  // a regra fica num arquivo sem o atalho "@/", para os testes em node lerem o mesmo código
  assert.doesNotMatch(readFileSync(path.join('src', 'i18n', 'chegada.ts'), 'utf8'), /from '@\//);
});

test('o hreflang, o canonical e o x-default não mudam: a "/" continua o x-default', () => {
  const site = codigo('src', 'lib', 'site.ts');
  assert.match(site, /languages\['x-default'\] = rota\('pt', caminho\);/);
  assert.match(site, /for \(const i of IDIOMAS\) languages\[HREFLANG\[i\]\] = rota\(i, caminho\);/);
});

test('o seletor de idioma grava a escolha no toque, antes de ir para a outra versão', () => {
  const seletor = codigo('src', 'components', 'SeletorIdioma.tsx');
  assert.match(seletor, /import \{ gravarIdiomaNoNavegador \} from '@\/i18n\/chegada';/);
  assert.match(seletor, /onClick=\{\(\) => gravarIdiomaNoNavegador\(i\)\}/);
  assert.match(seletor, /<details\s+ref=\{detalhes\}\s+data-seletor-idioma/);
});

test('a faixa: depois de carregar, pela regra; "Ver en español" grava a versão sugerida e o × grava a da página', () => {
  const faixa = codigo('src', 'components', 'SugestaoIdioma.tsx');
  assert.match(faixa, /^'use client';$/m);
  assert.match(
    faixa,
    /sugestaoDeIdioma\(\{\s*idiomaDaPagina: idioma,\s*caminho: caminhoPublico,\s*cookie: cookieDoIdioma\(document\.cookie\),/,
  );
  // só dentro do useEffect: o HTML estático é o mesmo para todos, e a faixa nasce escondida (nada pula)
  assert.match(faixa, /const \[sugerido, setSugerido\] = useState<Espanhol \| null>\(null\);/);
  // a página também é conferida no desenho: numa navegação por dentro para o checkout, a faixa não pisca nele
  assert.match(faixa, /if \(!sugerido \|\| !paginaComSugestao\(caminhoPublico\)\) return null;/);
  // com a letra grande ou a tela estreita, o botão e o × descem juntos e a pergunta guarda pelo menos 9em (sem passar da
  // largura da faixa)
  assert.match(faixa, /className="sugestao-faixa [^"]*\bflex-wrap\b/);
  assert.match(faixa, /<p id=\{idPergunta\} className="min-w-\[min\(9em,100%\)\] flex-\[1_1_0%\] /);
  assert.match(faixa, /<div className="ml-auto flex items-center gap-2 md:gap-3">\s*<Link\b[\s\S]*?<\/Link>\s*<button\b[\s\S]*?<\/button>\s*<\/div>/);
  // só por cima de foto (decisão do dono em 25/11): nas páginas sem foto no topo (a lista de passeios, as políticas, a
  // página de erro), ela taparia o título. Medida escondida antes de pintar (useLayoutEffect), uma vez por página
  assert.match(faixa, /function porCimaDeFoto\(caixa: DOMRect\): boolean \{/);
  assert.match(faixa, /document\.querySelectorAll\('img, video'\)\)\s*\.filter\(\(m\) => !m\.closest\('\.sugestao-idioma, \.cabecalho'\)\)/);
  assert.match(faixa, /\[0\.25, 0\.5, 0\.75\]\.filter/);
  assert.match(faixa, /return acertos\.length >= 2;/);
  // e sem tapar texto da página (o título da inicial fica em cima da foto: em tela baixa, a faixa o tapava), comparando
  // com as linhas de texto, e não com as caixas (as fotos da galeria são botões embaixo da faixa); medida de novo
  // quando a largura da tela muda (girar o tablet muda o topo da casa)
  assert.match(faixa, /function tapaTexto\(caixa: DOMRect\): boolean \{/);
  assert.match(faixa, /document\.createTreeWalker\(raiz, NodeFilter\.SHOW_TEXT\)/);
  assert.match(faixa, /trecho\.getClientRects\(\)/);
  assert.match(faixa, /el\.closest\('\.sugestao-idioma, \.cabecalho, \.sr-only, \[aria-hidden="true"\]'\)/);
  assert.match(faixa, /const ler = \(\) => setLargura\(document\.documentElement\.clientWidth\);/);
  assert.match(faixa, /const chaveDaFoto = `\$\{caminhoPublico\}\|\$\{largura\}`;/);
  assert.match(faixa, /useLayoutEffect\(\(\) => \{\s*if \(!sugerido \|\| !conferindo \|\| !caixa\.current\) return;/);
  assert.match(faixa, /setFoto\(\{ chave: chaveDaFoto, sim: porCimaDeFoto\(r\) && !tapaTexto\(r\) \}\);/);
  assert.match(faixa, /if \(!conferindo && !foto\?\.sim\) return null;/);
  assert.equal(faixa.match(/ref=\{caixa\}/g)?.length, 1);
  assert.match(faixa, /style=\{conferindo \? \{ visibility: 'hidden' \} : undefined\}/);
  assert.doesNotMatch(faixa, /useSearchParams/);
  // a mesma página na versão sugerida, como o seletor, sem baixar antes
  assert.match(faixa, /href=\{rota\(sugerido, semIdioma\(caminhoPublico\) \+ busca\)\}\s+prefetch=\{false\}/);
  assert.match(faixa, /onClick=\{\(\) => gravarIdiomaNoNavegador\(sugerido\)\}/);
  assert.match(faixa, /const fechar = \(\) => \{\s*gravarIdiomaNoNavegador\(idioma\);\s*setSugerido\(null\);/);
  assert.match(faixa, /aria-label=\{t\.fechar\}/);
  assert.equal(faixa.match(/role="region"\s+aria-labelledby=\{idPergunta\}/g)?.length, 1);
  assert.match(faixa, /lang=\{HREFLANG\[sugerido\]\}/);
  // o dono escolheu a posição A (a faixa) em 25/11: o balão (a B) e a prévia dele saíram do código
  assert.doesNotMatch(faixa, /balao|previa|PARAMETRO_DA_PREVIA|posicao/i);
  assert.doesNotMatch(codigo('src', 'app', 'globals.css'), /sugestao-balao/);
});

test('o layout: a faixa logo depois da cápsula, só em português e em inglês, com os textos do es e do es-ar', () => {
  const layout = codigo('src', 'app', '[locale]', 'layout.tsx');
  assert.match(
    layout,
    /<Cabecalho idioma=\{locale\} d=\{d\} \/>\s*\{locale === 'pt' \|\| locale === 'en' \? \(\s*<SugestaoIdioma\s+idioma=\{locale\}\s+textos=\{\{ es: dicionario\('es'\)\.nav\.sugestaoIdioma, 'es-ar': dicionario\('es-ar'\)\.nav\.sugestaoIdioma \}\}\s+\/>\s*\) : null\}/,
  );
  const css = codigo('src', 'app', 'globals.css');
  const regra = css.match(/\n\.sugestao-idioma \{([^}]*)\}/)?.[1] ?? '';
  // fora do fluxo e rolando com a página (não fixa): por baixo da cápsula (40) e por cima do conteúdo
  assert.match(regra, /position: absolute;/);
  assert.match(regra, /top: 4\.5rem;/);
  assert.match(regra, /z-index: 30;/);
  assert.match(css, /@media \(min-width: 48rem\) \{\s*\.sugestao-idioma \{\s*top: 5rem;/);
  assert.match(css, /body:has\(\.cabecalho details\[open\], #menu-movel\) \.sugestao-idioma \{\s*visibility: hidden;/);
  // enquanto a sugestão está na tela, o contador das fotos do passeio (1/11) sai de cena (ele aparecia através do vidro
  // da faixa); o das casas fica embaixo da foto e não muda
  assert.match(css, /body:has\(\.sugestao-idioma\) \.galeria-contador:not\(\.galeria-casa-contador\) \{\s*visibility: hidden;/);
  assert.match(codigo('src', 'components', 'GaleriaPasseio.tsx'), /galeria-contador/);
  assert.match(codigo('src', 'components', 'casas', 'GaleriaCasa.tsx'), /galeria-contador galeria-casa-contador/);
});

/* ------------------------------------------------------------------ */
/* Os textos da faixa                                                  */

test('os textos da faixa nos quatro idiomas: o es com "tú", o es-ar com "vos", o mesmo botão e o mesmo "Cerrar"', () => {
  const es = dicionario('es').nav.sugestaoIdioma;
  const ar = dicionario('es-ar').nav.sugestaoIdioma;
  assert.deepEqual(es, { pergunta: '¿Quieres ver esta página en español?', botao: 'Ver en español', fechar: 'Cerrar' });
  assert.deepEqual(ar, { pergunta: '¿Querés ver esta página en español?', botao: 'Ver en español', fechar: 'Cerrar' });
  assert.deepEqual(dicionario('pt').nav.sugestaoIdioma, {
    pergunta: 'Quer ver esta página em português?',
    botao: 'Ver em português',
    fechar: 'Fechar',
  });
  assert.deepEqual(dicionario('en').nav.sugestaoIdioma, {
    pergunta: 'Would you like to see this page in English?',
    botao: 'See it in English',
    fechar: 'Close',
  });
  for (const idioma of IDIOMAS)
    for (const t of Object.values(dicionario(idioma).nav.sugestaoIdioma)) assert.doesNotMatch(t, /[{}]/, idioma);
});

/* ------------------------------------------------------------------ */
/* A política de privacidade                                           */

const ITEM_3: Record<'pt' | 'en' | 'es', string> = {
  pt: 'Mostrar o site no idioma de quem visita, pelo idioma do celular ou do navegador e pelo país aproximado do acesso — legítimo interesse (art. 7º, IX).',
  en: 'To show the website in the visitor’s language, based on the language of the phone or browser and the approximate country of the connection — legitimate interest (art. 7, IX).',
  es: 'Mostrar el sitio en el idioma de quien lo visita, según el idioma del celular o del navegador y el país aproximado de la conexión — interés legítimo (art. 7, IX).',
};
const ITEM_5: Record<'pt' | 'en' | 'es', string> = {
  pt: 'Um cookie guarda por 1 ano o idioma do site: o escolhido no seletor de idioma ou na faixa que sugere outro idioma, ou, na primeira visita à página inicial, o que o site escolhe pelo idioma do celular ou do navegador e pelo país aproximado do acesso. Esse país vem do endereço IP, serve só para escolher o idioma e não é guardado pelo site.',
  en: 'A cookie keeps the website’s language for 1 year: the one chosen in the language menu or in the banner that suggests another language, or, on the first visit to the home page, the one the website picks from the language of the phone or browser and the approximate country of the connection. That country comes from the IP address, is used only to pick the language and is not stored by the website.',
  es: 'Una cookie guarda durante 1 año el idioma del sitio: el elegido en el selector de idioma o en la franja que sugiere otro idioma, o, en la primera visita a la página de inicio, el que el sitio elige según el idioma del celular o del navegador y el país aproximado de la conexión. Ese país sale de la dirección IP, sirve solo para elegir el idioma y el sitio no lo guarda.',
};

test('a privacidade: o país aproximado e o cookie do idioma nos itens 3 e 5, nas três versões e nos quatro idiomas', () => {
  for (const [nome, doc] of [
    ['hoje', PRIVACIDADE],
    ['e-mails', PRIVACIDADE_EMAILS],
    ['online', PRIVACIDADE_ONLINE],
  ] as [string, Traduzido<DocumentoLegal>][]) {
    for (const idioma of IDIOMAS) {
      const p = texto(doc, idioma);
      const onde = `${nome}.${idioma}`;
      // sem verbo de "tú", o es-ar lê as frases do es
      const frase = (t: Record<'pt' | 'en' | 'es', string>) => t[idioma === 'es-ar' ? 'es' : idioma];
      // item 3: entre as bases legais, logo antes do tópico dos anúncios, o único com consentimento, que continua o último
      const item3 = p.secoes.find((s) => s.titulo.startsWith('3. '))?.lista ?? [];
      assert.equal(item3.at(-2), frase(ITEM_3), onde);
      assert.match(item3.at(-1) ?? '', /consentimento|consent|consentimiento/, onde);
      assert.equal(item3.filter((l) => l === frase(ITEM_3)).length, 1, onde);
      // item 5: logo depois do parágrafo dos outros cookies do site, antes do dos anúncios
      const item5 = p.secoes.find((s) => s.titulo.startsWith('5. Cookies'))?.paragrafos ?? [];
      assert.equal(item5[1], frase(ITEM_5), onde);
      assert.match(item5[0], /(carrinho|cart|carrito)/, onde);
      assert.match(item5[2], /Google.*Meta/, onde);
      assert.equal(frasesDoDocumento(p).filter((f) => f === frase(ITEM_5)).length, 1, onde);
    }
  }
  // o "1 ano" da frase é o prazo do cookie
  assert.equal(IDADE_COOKIE_IDIOMA / 86400, 365);
});

test('a data da privacidade foi para 25/11/2026 nas três versões, e só a dela (e a dos termos online, do mesmo pacote)', () => {
  assert.equal(ATUALIZADO_EM.privacidade, '2026-11-25');
  assert.equal(ATUALIZADO_EM_ONLINE.privacidade, '2026-11-25');
  assert.equal(ATUALIZADO_EM_EMAILS, '2026-11-25');
  // os outros textos de hoje ficam com as datas deles; o cancelamento online, com a do dia de ligar
  assert.equal(ATUALIZADO_EM.termos, '2026-11-11');
  assert.equal(ATUALIZADO_EM.cancelamento, '2026-11-13');
  assert.equal(ATUALIZADO_EM_ONLINE.cancelamento, '2026-11-24');
});
