import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as modulo from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Pacote 31 (25/11/2026): o proxy DE VERDADE (src/proxy.ts), chamado com pedidos montados à mão, sem servidor: a troca
// automática do espanhol na "/" e o que o proxy já fazia continuam como devem. O proxy usa o atalho "@/" e importa
// 'next/server' sem a extensão; um gancho do node, só neste arquivo (cada arquivo de teste roda no seu processo), leva
// "@/x" para src/x.ts e 'next/server' para 'next/server.js'. Num node sem module.registerHooks, o teste é pulado (a regra
// continua testada em tests/chegada.test.ts).

type Proximo = (especificador: string, contexto?: unknown) => unknown;
const registerHooks = (
  modulo as unknown as { registerHooks?: (ganchos: { resolve: (e: string, c: unknown, p: Proximo) => unknown }) => unknown }
).registerHooks;

const SRC = path.resolve('src');
if (registerHooks)
  registerHooks({
    resolve(especificador, contexto, proximo) {
      if (especificador.startsWith('@/')) {
        const base = path.join(SRC, especificador.slice(2));
        for (const fim of ['.ts', '.tsx', path.join(path.sep, 'index.ts')])
          if (existsSync(base + fim)) return proximo(pathToFileURL(base + fim).href, contexto);
      }
      if (especificador === 'next/server') return proximo('next/server.js', contexto);
      return proximo(especificador, contexto);
    },
  });

const pular = registerHooks ? false : 'este node não tem module.registerHooks';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

/** Chama o proxy com um pedido e devolve o que importa da resposta. */
async function pedir(url: string, cabecalhos: Record<string, string> = {}, metodo = 'GET') {
  const { proxy } = (await import('../src/proxy.ts')) as { proxy: (r: unknown) => Response };
  const { NextRequest } = ((await import('next/server.js')) as { default: { NextRequest: new (u: string, i: RequestInit) => unknown } })
    .default;
  const resposta = proxy(
    new NextRequest(url, { method: metodo, headers: { host: new URL(url).host, 'user-agent': IPHONE, ...cabecalhos } }),
  );
  return {
    status: resposta.status,
    destino: resposta.headers.get('location'),
    reescrita: resposta.headers.get('x-middleware-rewrite'),
    cookie: resposta.headers.get('set-cookie'),
    cache: resposta.headers.get('cache-control'),
  };
}

test(
  'o proxy de verdade: na "/", o celular em espanhol de fora recebe o 307, o cookie de 1 ano e nada de cache',
  { skip: pular },
  async () => {
    const ar = await pedir('https://orlanativa.online/', { 'accept-language': 'es-AR,es;q=0.9', 'sec-fetch-site': 'cross-site' });
    assert.equal(ar.status, 307);
    assert.equal(ar.destino, 'https://orlanativa.online/es-ar');
    assert.match(ar.cookie ?? '', /^on_idioma=es-ar; Path=\/; Expires=[^;]+; Max-Age=31536000; Secure; SameSite=lax$/i);
    assert.doesNotMatch(ar.cookie ?? '', /HttpOnly/i);
    assert.equal(ar.cache, 'private, no-store');
    // "es-419" com o IP da Argentina, e a busca (a etiqueta da campanha) vai junto
    const ip = await pedir('https://orlanativa.online/?utm_source=google&gclid=abc', {
      'accept-language': 'es-419,es',
      'x-vercel-ip-country': 'AR',
    });
    assert.equal(ip.status, 307);
    assert.equal(ip.destino, 'https://orlanativa.online/es-ar?utm_source=google&gclid=abc');
    // o Chile vai para o neutro
    const cl = await pedir('https://orlanativa.online/', { 'accept-language': 'es-CL' });
    assert.equal(cl.destino, 'https://orlanativa.online/es');
    assert.match(cl.cookie ?? '', /^on_idioma=es;/);
    // no computador (http://localhost), o cookie vai sem o Secure: o Safari aceita no teste local
    const local = await pedir('http://localhost:3400/', { 'accept-language': 'es-AR' });
    assert.equal(local.destino, 'http://localhost:3400/es-ar');
    assert.doesNotMatch(local.cookie ?? '', /Secure/i);
  },
);

test('o proxy de verdade: quem não troca segue para a página inicial em português, como antes, sem cookie', { skip: pular }, async () => {
  const fica: [string, Record<string, string>, string?][] = [
    ['https://orlanativa.online/', { 'accept-language': 'pt-BR,pt;q=0.9,es;q=0.8' }],
    ['https://orlanativa.online/', { 'accept-language': 'en-US,en;q=0.9' }],
    ['https://orlanativa.online/', { 'accept-language': 'es-AR', cookie: 'on_idioma=pt' }],
    ['https://orlanativa.online/', { 'accept-language': 'es-AR', 'sec-fetch-site': 'same-origin' }],
    // quem já navega no site fica, mesmo com o cookie de outra versão (o cookie só vale para quem chega de fora)
    ['https://orlanativa.online/', { 'accept-language': 'pt-BR', cookie: 'on_idioma=es-ar', 'sec-fetch-site': 'same-origin' }],
    ['https://orlanativa.online/', { 'accept-language': 'es-AR', referer: 'https://orlanativa.online/passeios' }],
    ['https://orlanativa.online/', { 'accept-language': 'es-AR', 'user-agent': GOOGLEBOT }],
    ['https://orlanativa.online/', { 'accept-language': 'es-AR' }, 'HEAD'],
    ['https://orlanativa.online/', { 'accept-language': 'es-AR' }, 'POST'],
  ];
  for (const [url, cabecalhos, metodo] of fica) {
    const r = await pedir(url, cabecalhos, metodo);
    const onde = `${metodo ?? 'GET'} ${JSON.stringify(cabecalhos)}`;
    assert.equal(r.status, 200, onde);
    assert.equal(r.destino, null, onde);
    assert.equal(r.reescrita, 'https://orlanativa.online/pt', onde);
    assert.equal(r.cookie, null, onde);
    assert.equal(r.cache, null, onde);
  }
  // o cookie de outra versão leva para ela (a escolha vale mais que a detecção)
  const en = await pedir('https://orlanativa.online/', { 'accept-language': 'es-AR', cookie: 'on_idioma=en' });
  assert.equal(en.destino, 'https://orlanativa.online/en');
});

test(
  'o proxy de verdade: as outras páginas e os endereços dos anúncios não trocam, e as reescritas de antes seguem',
  { skip: pular },
  async () => {
    const espanhol = { 'accept-language': 'es-AR' };
    assert.equal((await pedir('https://orlanativa.online/passeios', espanhol)).reescrita, 'https://orlanativa.online/pt/passeios');
    const anuncio = await pedir('https://orlanativa.online/es-ar/paseos/goleta-buzios?utm_source=google', { 'accept-language': 'pt-BR' });
    assert.equal(anuncio.status, 200);
    assert.equal(anuncio.destino, null);
    assert.equal(anuncio.reescrita, 'https://orlanativa.online/es-ar/passeios/escuna-buzios?utm_source=google');
    // a "/es-ar" e a "/es" de quem tem o navegador em português: ficam (o link do anúncio manda)
    for (const url of ['https://orlanativa.online/es-ar', 'https://orlanativa.online/es']) {
      const r = await pedir(url, { 'accept-language': 'pt-BR' });
      assert.equal(r.status, 200, url);
      assert.equal(r.destino, null, url);
    }
    // o endereço antigo em português de uma página em espanhol continua com o 301, e o /pt com o 308
    const antigo = await pedir('https://orlanativa.online/es/passeios', espanhol);
    assert.equal(antigo.status, 301);
    assert.equal(antigo.destino, 'https://orlanativa.online/es/paseos');
    const pt = await pedir('https://orlanativa.online/pt/passeios', espanhol);
    assert.equal(pt.status, 308);
    assert.equal(pt.destino, 'https://orlanativa.online/passeios');
  },
);

test(
  'a rota /api/idioma de verdade: grava a escolha com o Set-Cookie do site (1 ano), só do próprio site e só os 4 idiomas',
  { skip: pular },
  async () => {
    const { POST } = (await import('../src/app/api/idioma/route.ts')) as { POST: (r: unknown) => Promise<Response> };
    const { NextRequest } = ((await import('next/server.js')) as { default: { NextRequest: new (u: string, i: RequestInit) => unknown } })
      .default;
    const gravar = async (url: string, cabecalhos: Record<string, string> = {}) => {
      const r = await POST(new NextRequest(url, { method: 'POST', headers: { host: new URL(url).host, 'user-agent': IPHONE, ...cabecalhos } }));
      return { status: r.status, cookie: r.headers.get('set-cookie'), cache: r.headers.get('cache-control'), corpo: await r.text() };
    };
    // o toque no seletor ou na faixa (o mesmo site): 204, o cookie de 1 ano, sem HttpOnly (a faixa lê a escolha), sem cache
    for (const idioma of ['pt', 'en', 'es', 'es-ar']) {
      const r = await gravar(`https://orlanativa.online/api/idioma?idioma=${idioma}`, { 'sec-fetch-site': 'same-origin' });
      assert.equal(r.status, 204, idioma);
      assert.equal(r.corpo, '', idioma);
      assert.match(r.cookie ?? '', new RegExp(`^on_idioma=${idioma}; Path=/; Expires=[^;]+; Max-Age=31536000; Secure; SameSite=lax$`, 'i'));
      assert.doesNotMatch(r.cookie ?? '', /HttpOnly/i);
      assert.equal(r.cache, 'private, no-store', idioma);
    }
    // o Safari antes da 16.4 não manda o Sec-Fetch-Site: vale
    assert.equal((await gravar('https://orlanativa.online/api/idioma?idioma=es')).status, 204);
    // no computador (http://localhost), sem o Secure
    assert.doesNotMatch((await gravar('http://localhost:3400/api/idioma?idioma=es-ar', { 'sec-fetch-site': 'same-origin' })).cookie ?? '', /Secure/i);
    // de outro site, nada muda: 403 e nenhum cookie
    for (const site of ['cross-site', 'same-site', 'none']) {
      const r = await gravar('https://orlanativa.online/api/idioma?idioma=en', { 'sec-fetch-site': site });
      assert.equal(r.status, 403, site);
      assert.equal(r.cookie, null, site);
    }
    // só os quatro idiomas do site, escritos como o site escreve: o resto é 400, sem cookie
    for (const busca of ['', '?idioma=', '?idioma=fr', '?idioma=ES-AR', '?idioma=es-AR', '?idioma=pt;%20x', '?lingua=pt']) {
      const r = await gravar(`https://orlanativa.online/api/idioma${busca}`, { 'sec-fetch-site': 'same-origin' });
      assert.equal(r.status, 400, busca);
      assert.equal(r.cookie, null, busca);
    }
  },
);
