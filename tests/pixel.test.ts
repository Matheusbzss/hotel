import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// As tags de anúncio (Pixel da Meta e tag do Google) mandam o endereço da página para fora. As páginas do pedido
// e do voucher levam no endereço o token do cliente; por isso, nelas, as tags não carregam e nenhum evento sai.

type Pixel = typeof import('../src/lib/pixel.ts');
type Janela = {
  location: { pathname: string };
  fbq?: ((...a: unknown[]) => void) & { queue?: unknown[][] };
  gtag?: (...a: unknown[]) => void;
  dataLayer?: unknown[];
};

const mundo = globalThis as unknown as { window?: Janela; document?: unknown };
/** As tags <script> que o módulo pôs na página de mentira. */
let anexadas: { src?: string }[] = [];
let documentos = 0;

/** Abre um documento novo (de mentira) num endereço: o módulo começa do zero, como numa carga inteira da página. */
async function abrir(caminho: string): Promise<Pixel> {
  anexadas = [];
  mundo.window = { location: { pathname: caminho } };
  mundo.document = { createElement: () => ({}), head: { appendChild: (s: { src?: string }) => anexadas.push(s) } };
  documentos += 1;
  return import(`../src/lib/pixel.ts?documento=${documentos}`);
}

/** Troca o endereço sem trocar de documento, como faz a navegação interna do site. */
const navegar = (caminho: string) => {
  mundo.window!.location.pathname = caminho;
};

/** O que chegou ao Pixel, como "comando:nome". */
const noPixel = () => (mundo.window!.fbq?.queue ?? []).map((c) => `${c[0]}:${c[1]}`);

after(() => {
  delete mundo.window;
  delete mundo.document;
});

test('numa página pública as tags carregam e os eventos saem', async () => {
  const p = await abrir('/passeios/escuna-buzios');
  assert.equal(p.tagsLiberadas(), true);
  assert.equal(p.tagsCarregadas(), false);
  p.carregarPixel('123');
  p.carregarGoogle('AW-1');
  assert.deepEqual(
    anexadas.map((s) => s.src),
    ['https://connect.facebook.net/en_US/fbevents.js', 'https://www.googletagmanager.com/gtag/js?id=AW-1'],
  );
  assert.equal(p.tagsCarregadas(), true);
  p.rastrear('PageView');
  assert.deepEqual(noPixel(), ['init:123', 'track:PageView']);
  assert.equal(mundo.window!.dataLayer!.length, 3, 'js, config e o page_view');
});

test('o evento de antes das tags espera e sai depois', async () => {
  const p = await abrir('/checkout');
  p.rastrear('InitiateCheckout', { value: 10, currency: 'BRL' });
  p.carregarPixel('123');
  p.soltarEventos();
  assert.deepEqual(noPixel(), ['init:123', 'track:InitiateCheckout']);
});

test('nas páginas do pedido e do voucher as tags não carregam, em nenhum idioma', async () => {
  for (const caminho of ['/pedido/ABC', '/reserva/ABC', '/es/pedido/ABC', '/es-ar/reserva/ABC', '/en/reserva/ABC', '/pt/pedido/ABC']) {
    const p = await abrir(caminho);
    assert.equal(p.tagsLiberadas(), false, caminho);
    p.carregarPixel('123');
    p.carregarGoogle('AW-1');
    assert.equal(anexadas.length, 0, caminho);
    assert.equal(p.tagsCarregadas(), false, caminho);
    assert.equal(mundo.window!.fbq, undefined, caminho);
    assert.equal(mundo.window!.gtag, undefined, caminho);
  }
});

test('quem passou por uma página particular não mede mais nada até recarregar a página', async () => {
  const p = await abrir('/pedido/ABC');
  p.rastrear('Contact');
  navegar('/passeios/escuna-buzios');
  assert.equal(p.tagsLiberadas(), false);
  p.carregarPixel('123');
  p.carregarGoogle('AW-1');
  assert.equal(anexadas.length, 0);
  // mesmo que outra coisa ponha um fbq e um gtag na página, nada do site chega neles
  const chamadas: unknown[][] = [];
  mundo.window!.fbq = (...a: unknown[]) => void chamadas.push(a);
  mundo.window!.gtag = (...a: unknown[]) => void chamadas.push(a);
  p.rastrear('PageView');
  p.soltarEventos();
  assert.deepEqual(chamadas, []);
});

test('o caminho que o Next informa vale antes de o endereço do navegador mudar', async () => {
  const p = await abrir('/checkout');
  assert.equal(p.tagsLiberadas('/es/pedido/ABC'), false);
  assert.equal(p.tagsLiberadas(), false, 'o "não" fica marcado no documento');
  assert.equal(p.tagsLiberadas('/checkout'), false);
});

test('cair numa página particular com as tags já carregadas é percebido, e nenhum evento sai', async () => {
  const p = await abrir('/checkout');
  p.carregarPixel('123');
  navegar('/pedido/ABC');
  // é esta a condição que faz o componente Rastreamento recarregar a página
  assert.equal(p.tagsLiberadas('/pedido/ABC'), false);
  assert.equal(p.tagsCarregadas(), true);
  p.rastrear('PageView');
  p.rastrear('Contact');
  assert.deepEqual(noPixel(), ['init:123']);
});

test('no servidor, sem navegador, nada é liberado', async () => {
  delete mundo.window;
  delete mundo.document;
  documentos += 1;
  const p: Pixel = await import(`../src/lib/pixel.ts?documento=${documentos}`);
  assert.equal(p.tagsLiberadas(), false);
  assert.equal(p.tagsLiberadas('/checkout'), false);
  p.rastrear('PageView');
  p.carregarPixel('123');
  p.carregarGoogle('AW-1');
  assert.equal(p.tagsCarregadas(), false);
});

// As páginas particulares têm de nascer numa carga inteira da página (window.location.assign): assim o documento
// delas nunca tem as tags. A navegação interna (router.push, router.replace) manteria as tags da página anterior.

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    return e.isDirectory() ? arquivos(caminho) : [caminho];
  });
}

test('ninguém entra no pedido ou no voucher pela navegação interna do site', () => {
  const NAVEGACAO_INTERNA = /router\.(push|replace)\(/;
  const PARTICULAR = /pedido|reserva|voucher|urlvolta|\?t=/i;
  const culpados = arquivos('src')
    .filter((f) => /\.tsx?$/.test(f))
    .flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((linha, i) => ({ onde: `${f}:${i + 1}`, linha: linha.trim() }))
        .filter(({ linha }) => NAVEGACAO_INTERNA.test(linha) && PARTICULAR.test(linha)),
    );
  assert.deepEqual(culpados, []);
});

test('o carrinho e o checkout embutido abrem o pedido com a página inteira carregando', () => {
  const carrinho = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  const checkout = readFileSync(path.join('src', 'components', 'pagamento', 'CheckoutEmbutido.tsx'), 'utf8');
  assert.match(carrinho, /window\.location\.assign\(`\$\{base\}\/\$\{corpo\.codigo\}\?t=/);
  assert.match(checkout, /window\.location\.assign\(urlVolta\)/);
});
