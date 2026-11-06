#!/usr/bin/env node
/**
 * Verificador de links: lê o sitemap, abre cada página como o Google recebe e segue todos os links e imagens.
 * Falha se achar link quebrado, link interno que passa por redirecionamento ou imagem que não abre. Nas páginas do
 * sitemap, confere também o que o Google lê: noindex, canônica, hreflang, título e descrição únicos e no tamanho certo,
 * um h1 só, foto de prévia, texto alternativo nas fotos e o caminho nos dados estruturados.
 *
 *   npm run links                          confere o site no ar
 *   npm run links -- http://localhost:3000 confere a versão local (npm run build e npm start antes)
 */

const OFICIAL = 'https://agenciavictorhugo.online';
const BASE = (process.argv[2] ?? OFICIAL).replace(/\/$/, '');
const AO_MESMO_TEMPO = 8;
/** Páginas que só existem para quem tem o código: não entram no rastreamento. */
const IGNORAR = /^\/(admin|api)(\/|$)/;

const limpar = (texto) => texto.replace(/&amp;/g, '&').replace(/&#x27;/g, "'");
/** O sitemap sempre traz o endereço oficial: na versão local, troca pelo endereço testado. */
const naBase = (url) => url.replace(OFICIAL, BASE).replace(/^https?:\/\/localhost:\d+/, BASE);
const semHash = (url) => url.split('#')[0];

async function abrir(url, metodo = 'GET') {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await fetch(url, { method: metodo, redirect: 'manual', signal: AbortSignal.timeout(60000) });
    } catch (erro) {
      if (tentativa === 2) return { status: 0, headers: new Headers(), text: async () => '', erro };
    }
  }
}

async function emFila(lista, trabalhar) {
  const fila = [...lista];
  await Promise.all(
    Array.from({ length: AO_MESMO_TEMPO }, async () => {
      while (fila.length) await trabalhar(fila.shift());
    }),
  );
}

const problemas = [];
const avisar = (texto) => problemas.push(texto);
const curto = (url) => url.replace(BASE, '') || '/';

const respostaSitemap = await abrir(`${BASE}/sitemap.xml`);
if (respostaSitemap.status !== 200) {
  console.error(`Não consegui abrir ${BASE}/sitemap.xml (${respostaSitemap.status}).`);
  process.exit(1);
}
const xml = await respostaSitemap.text();
const doSitemap = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => naBase(m[1]));
const alternativas = [...xml.matchAll(/hreflang="[^"]+" href="([^"]+)"/g)].map((m) => naBase(limpar(m[1])));
const sitemap = new Set(doSitemap.map((u) => u.replace(/\/$/, '')));

const paginas = new Map();
const imagens = new Map();
const titulos = new Map();
const descricoes = new Map();
const pendentes = new Set([...doSitemap, ...alternativas].map(semHash));

function anotarLink(href, origem) {
  const url = href.startsWith('/') && !href.startsWith('//') ? `${BASE}${href}` : href;
  if (!url.startsWith(BASE)) return;
  const limpo = semHash(url);
  if (IGNORAR.test(new URL(limpo).pathname)) return;
  if (!paginas.has(limpo)) pendentes.add(limpo);
  const origens = paginas.get(limpo)?.origens;
  if (origens) origens.add(origem);
}

async function lerPagina(url) {
  if (paginas.has(url)) return;
  const item = { status: 0, origens: new Set() };
  paginas.set(url, item);
  const r = await abrir(url);
  item.status = r.status;
  if (r.status >= 300 && r.status < 400) {
    item.destino = r.headers.get('location');
    await r.text().catch(() => '');
    return;
  }
  if (r.status !== 200 || !(r.headers.get('content-type') ?? '').includes('text/html')) {
    await r.text().catch(() => '');
    return;
  }
  const html = await r.text();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) anotarLink(limpar(m[1]), url);
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) {
    const src = limpar(m[1]);
    if (src.startsWith('data:')) continue;
    const alvo = src.startsWith('/') ? `${BASE}${src}` : src;
    if (!imagens.has(alvo)) imagens.set(alvo, url);
  }
  for (const m of html.matchAll(/<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/g)) {
    const alvo = naBase(limpar(m[1]));
    if (!imagens.has(alvo)) imagens.set(alvo, url);
  }
  if (sitemap.has(url.replace(/\/$/, ''))) conferirPagina(url, html);
}

/** O que o Google lê em cada página pública. */
function conferirPagina(url, html) {
  const pagina = curto(url);
  if (/<meta name="robots" content="[^"]*noindex/.test(html)) avisar(`noindex numa página do sitemap: ${pagina}`);
  const canonica = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!canonica) avisar(`sem canônica: ${pagina}`);
  else if (naBase(limpar(canonica)).replace(/\/$/, '') !== url.replace(/\/$/, ''))
    avisar(`canônica aponta para outro lugar: ${pagina} → ${canonica}`);
  for (const idioma of ['pt-BR', 'en', 'es', 'x-default']) {
    if (!new RegExp(`hrefLang="${idioma}"`, 'i').test(html)) avisar(`sem hreflang ${idioma}: ${pagina}`);
  }
  const titulo = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const descricao = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!titulo) avisar(`sem título: ${pagina}`);
  else {
    if (limpar(titulo).length > 65) avisar(`título longo (${limpar(titulo).length}): ${pagina}`);
    if (titulos.has(titulo)) avisar(`título repetido em ${pagina} e ${titulos.get(titulo)}`);
    titulos.set(titulo, pagina);
  }
  if (!descricao) avisar(`sem descrição: ${pagina}`);
  else {
    if (limpar(descricao).length > 165) avisar(`descrição longa (${limpar(descricao).length}): ${pagina}`);
    if (descricoes.has(descricao)) avisar(`descrição repetida em ${pagina} e ${descricoes.get(descricao)}`);
    descricoes.set(descricao, pagina);
  }
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) avisar(`${h1} títulos h1: ${pagina}`);
  if (!/property="og:image"/.test(html)) avisar(`sem foto de prévia: ${pagina}`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const foto = /src="[^"]*(?:%2Ffotos%2F|\/fotos\/)/.test(m[0]);
    if (foto && !/\balt="[^"]+"/.test(m[0])) avisar(`foto sem texto alternativo em ${pagina}: ${m[0].match(/src="([^"]{0,70})/)?.[1]}`);
  }
  if (pagina !== '/' && !/^\/(en|es)$/.test(pagina) && !html.includes('"BreadcrumbList"')) avisar(`sem caminho nos dados: ${pagina}`);
}

while (pendentes.size) {
  const lote = [...pendentes];
  pendentes.clear();
  await emFila(lote, lerPagina);
}

for (const [url, p] of paginas) {
  const de = [...p.origens][0];
  const origem = de ? ` (link em ${curto(de)})` : ' (sitemap)';
  if (p.status === 0 || p.status >= 400) avisar(`quebrado [${p.status}]: ${curto(url)}${origem}`);
  else if (p.status >= 300) avisar(`passa por redirecionamento [${p.status}]: ${curto(url)} → ${p.destino}${origem}`);
}

await emFila([...imagens.keys()], async (url) => {
  const r = await abrir(url);
  await r.text().catch(() => '');
  if (r.status !== 200) avisar(`imagem quebrada [${r.status}]: ${curto(url)} (em ${curto(imagens.get(url))})`);
});

console.log(`${BASE}: ${doSitemap.length} páginas no sitemap, ${paginas.size} endereços abertos, ${imagens.size} imagens.`);
if (problemas.length) {
  console.error(`\n${problemas.length} problema(s):`);
  for (const p of problemas.slice(0, 60)) console.error(`  ${p}`);
  process.exit(1);
}
console.log('Nenhum link quebrado.');
