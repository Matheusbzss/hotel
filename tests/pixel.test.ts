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

test('"Continuar o pagamento do pedido" é um botão que carrega a página inteira, nunca um link do site', () => {
  const carrinho = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  // o <Link> entrava na página particular pela navegação interna, com pré-carga e com o token num href do checkout
  assert.doesNotMatch(carrinho, /<Link\s+href=\{pedidoAberto\.href\}/);
  assert.doesNotMatch(carrinho, /href=\{pedidoAberto/);
  // os dois lugares: o carrinho vazio com o pedido em aberto e a faixa em cima do formulário
  assert.equal(carrinho.match(/onClick=\{\(\) => window\.location\.assign\(pedidoAberto\.href\)\}/g)?.length, 2);
  for (const m of carrinho.matchAll(/onClick=\{\(\) => window\.location\.assign\(pedidoAberto\.href\)\}/g)) {
    // um <button type="button"> (dentro do formulário, sem o type ele enviaria o formulário)
    const tag = carrinho.slice(carrinho.lastIndexOf('<', m.index), m.index);
    assert.match(tag, /^<button\s+type="button"/, tag);
  }
});

test('o checkout de um carrinho que virou pedido pago segue para o pedido com a página inteira carregando', () => {
  const pedidoPago = readFileSync(path.join('src', 'components', 'carrinho', 'PedidoPago.tsx'), 'utf8');
  const pagina = readFileSync(path.join('src', 'app', '[locale]', 'checkout', 'page.tsx'), 'utf8');
  // sozinha (replace: o "voltar" não cai de novo na passagem) e pelo botão, por garantia: sempre uma carga inteira
  assert.match(pedidoPago, /window\.location\.replace\(href\)/);
  assert.match(pedidoPago, /onClick=\{\(\) => window\.location\.assign\(href\)\}/);
  assert.doesNotMatch(pedidoPago, /from 'next\/link'|from 'next\/navigation'|<Link\b|useRouter|router\./);
  assert.doesNotMatch(pedidoPago, /href=\{/);
  // a tela de passagem tem a cara do "carrinho vazio", já medida de 320 a 1440 px e com a letra grande: a mesma largura,
  // a mesma letra e o mesmo botão; só o código do pedido não quebra no hífen (é curto: cabe em 320 px com a letra em 150%)
  const vazio = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  assert.match(vazio, /<div className="max-w-\[44ch\]">\s+<p className="text-lead">\{K\.vazio\}<\/p>/);
  assert.match(pedidoPago, /<div className="max-w-\[44ch\]">\s+<p className="text-lead" role="status">/);
  assert.match(pedidoPago, /<span className="numeros whitespace-nowrap">\{codigo\}<\/span>/);
  assert.match(pedidoPago, /<button type="button" className="botao mt-6" onClick=/);
  assert.equal(pedidoPago.match(/whitespace-nowrap|min-w-|(?<![\w-])w-\[\d/g)?.length, 1);
  // a página do checkout desenha a passagem no lugar do formulário e nunca redireciona pelo servidor (com o checkout
  // aberto por um link do site, o redirecionamento viraria navegação interna para dentro da página particular)
  assert.match(
    pagina,
    /\{pedidoPago \? \([\s\S]*?<PedidoPago href=\{pedidoPago\.href\} codigo=\{pedidoPago\.codigo\}[\s\S]*?\) : \(\s+<FormularioCarrinho/,
  );
  assert.doesNotMatch(pagina, /\bredirect\(|permanentRedirect\(/);
});

/**
 * As aberturas de <Link …> de um arquivo (o elemento pode ocupar várias linhas), até o ">" que fecha a abertura,
 * pulando o que está entre chaves (um href={…} pode ter "=>" dentro), e o valor do href de cada uma.
 */
function linksDoSite(fonte: string): { tag: string; href: string }[] {
  return [...fonte.matchAll(/<Link(?=[\s>])/g)].map((m) => {
    let chaves = 0;
    let fim = fonte.length;
    for (let i = m.index; i < fonte.length; i++) {
      if (fonte[i] === '{') chaves++;
      else if (fonte[i] === '}') chaves--;
      else if (fonte[i] === '>' && chaves === 0) {
        fim = i + 1;
        break;
      }
    }
    const tag = fonte.slice(m.index, fim);
    const inicio = tag.search(/\shref=/);
    if (inicio === -1) return { tag, href: '' };
    const resto = tag.slice(inicio + 6);
    if (resto[0] !== '{') return { tag, href: resto.slice(0, resto.indexOf(resto[0], 1) + 1) };
    let nivel = 0;
    for (let i = 0; i < resto.length; i++) {
      if (resto[i] === '{') nivel++;
      else if (resto[i] === '}' && --nivel === 0) return { tag, href: resto.slice(0, i + 1) };
    }
    return { tag, href: resto };
  });
}

test('nenhum <Link> fora das páginas particulares leva ao pedido, ao voucher ou a um endereço com o token', () => {
  // o <Link> é a navegação interna do site (com pré-carga): de uma página com as tags de anúncio, ele entraria na página
  // particular com elas no documento e poria o endereço com o token num href da tela. As páginas do pedido e da reserva
  // já nasceram sem as tags (o "← Voltar ao pedido" da reserva fica entre elas)
  const PARTICULAR = /pedidoAberto|pedidoPago|linkDoPedido|urlVolta|urlPagina|token|\?t=/;
  const fora = (f: string) => !/^src\/app\/\[locale\]\/(pedido|reserva)\//.test(f.split(path.sep).join('/'));
  const todos = arquivos('src')
    .filter((f) => f.endsWith('.tsx') && fora(f))
    .flatMap((f) => linksDoSite(readFileSync(f, 'utf8')).map((l) => ({ onde: f, ...l })));
  // a leitura acha os links de verdade (o site tem dezenas), com o href inteiro, mesmo com "=>" ou chaves dentro
  assert.ok(todos.length > 20, String(todos.length));
  assert.ok(todos.every((l) => l.href.length > 0 && l.tag.endsWith('>')));
  const culpados = todos.filter((l) => PARTICULAR.test(l.href)).map((l) => `${l.onde}: ${l.tag.replace(/\s+/g, ' ')}`);
  assert.deepEqual(culpados, []);
  // a leitura pega o caso que o teste existe para barrar, em várias linhas
  const exemplo = linksDoSite('<Link\n  href={pedidoAberto.href}\n  className="botao"\n>\n  Continuar\n</Link>');
  assert.equal(exemplo.length, 1);
  assert.ok(PARTICULAR.test(exemplo[0].href));
  assert.equal(linksDoSite('<Link href={rota(locale, `/x/${a.map((b) => b).join()}`)} className="y">').at(0)?.href.endsWith(')}'), true);
});
