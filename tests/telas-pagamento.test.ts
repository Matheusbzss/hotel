import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// As telas do pagamento com a letra grande do celular (Pacote 9, 16/11; achados T4b, telas#1 e telas#3 do teste de
// 15/11). Com a letra em 150% em tela estreita, a escolha entre Pix e cartão e as páginas do pedido e da reserva rolavam
// de lado (uma coluna de grade "auto" cresce com o que não quebra), o código do voucher quebrava no hífen de "ON-" e
// sobrava um vão branco embaixo do formulário da Stripe. O conserto é só de classes (medido na bancada antes de
// construir: com a letra normal, nada muda). Os componentes rodam no navegador e no servidor do Next (React e o atalho
// "@/"), então estes testes leem o código deles. A medida de verdade (0 px de rolagem lateral em 320 a 1440 px, letra
// 100/125/150, Chromium e WebKit) é a do reteste na bancada. Só leitura: nada é gravado.

/**
 * O código de um arquivo de src/, sem os comentários (os do JSX, os de bloco que começam a linha e as linhas de
 * comentário): só o que roda. As quebras de linha do Windows (o arquivo pode estar com CRLF no disco) viram \n.
 */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** As classes de um className, uma por uma. */
const classes = (texto: string) => texto.split(/\s+/).filter(Boolean);

/** O className do elemento que o padrão acha (o primeiro grupo do padrão). */
function classesDe(fonte: string, padrao: RegExp, onde: string): string[] {
  const achado = fonte.match(padrao);
  assert.ok(achado, onde);
  return classes(achado[1]);
}

const escolha = codigo('components', 'pagamento', 'EscolhaPagamento.tsx');
const pedido = codigo('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
const reserva = codigo('components', 'StatusReserva.tsx');
const carrinho = codigo('components', 'carrinho', 'FormularioCarrinho.tsx');
const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');

test('a escolha entre Pix e cartão: uma coluna que encolhe e o preço que desce para a linha de baixo, à direita', () => {
  // a grade das opções com a coluna que encolhe com a tela (sem grid-cols-1, a coluna "auto" ficava da largura da linha
  // mais larga e passava do fieldset e da tela)
  const grade = classesDe(escolha, /<div className="([^"]*)">\s*\{opcoes\.map\(/, 'a grade das opções');
  assert.ok(grade.includes('grid') && grade.includes('grid-cols-1'), grade.join(' '));
  // a linha do nome e do preço pode quebrar; o vão entre os dois continua o de sempre (gap-4 = gap-x-4)
  const linha = classesDe(escolha, /<span className="([^"]*)">\s*<span className="flex items-center gap-3">/, 'a linha do nome e do preço');
  for (const c of ['flex', 'flex-wrap', 'justify-between', 'gap-x-4']) assert.ok(linha.includes(c), `${c}: ${linha.join(' ')}`);
  assert.ok(!linha.includes('flex-nowrap') && !linha.includes('whitespace-nowrap'), linha.join(' '));
  // o preço, quando desce, fica à direita (sozinho na linha, o justify-between o deixaria à esquerda)
  const preco = classesDe(escolha, /<span className="([^"]*)">\{brl\(centavos\)\}<\/span>/, 'o preço de cada forma');
  assert.ok(preco.includes('ml-auto') && preco.includes('cifra'), preco.join(' '));
});

test('as páginas do pagamento: grades com a coluna que encolhe e códigos que não quebram no hífen, sempre juntos', () => {
  // Os dois consertos entram juntos (a dependência que o crítico escreveu): o código sem quebra, sozinho, alarga a
  // coluna "auto" da página (um código grande largo pede até ~252 px em 320 px com a letra em 150%, contra 200 de
  // espaço) e a página paga volta a rolar de lado. Por isso este teste confere as duas coisas na mesma passada.
  const paginas = [
    // a página do pedido de vários itens, as três grades da página da reserva (pago, pagar, os outros estados) e o
    // checkout (que já tinha grid-cols-1)
    { nome: 'pedido/[codigo]/page.tsx', fonte: pedido, grades: 1, codigos: 3 },
    { nome: 'StatusReserva.tsx', fonte: reserva, grades: 3, codigos: 1 },
    { nome: 'FormularioCarrinho.tsx', fonte: carrinho, grades: 2, codigos: 1 },
  ];
  for (const { nome, fonte, grades, codigos } of paginas) {
    // toda lista de classes (entre aspas, em qualquer forma) com lg:grid-cols-12 tem também a coluna que encolhe
    const comDozeColunas = [...fonte.matchAll(/["'`]([^"'`]*?(?<![\w:-])lg:grid-cols-12(?![\w-])[^"'`]*)["'`]/g)].map((m) => m[1]);
    assert.equal(comDozeColunas.length, grades, `${nome}: as grades da página`);
    for (const grade of comDozeColunas) assert.ok(classes(grade).includes('grid-cols-1'), `${nome}: ${grade}`);

    // todo elemento que mostra só o código ({codigo}, {r.codigo}, {sessao.codigo}) não quebra no hífen de "ON-"
    const comCodigo = [...fonte.matchAll(/<(\w+) className="([^"]*)">\{(?:\w+\.)?codigo\}<\/\1>/g)].map((m) => m[2]);
    assert.equal(comCodigo.length, codigos, `${nome}: os códigos na tela`);
    for (const c of comCodigo) assert.ok(classes(c).includes('whitespace-nowrap'), `${nome}: ${c}`);
    // e todo código grande (display numeros), seja qual for o que vem dentro
    for (const [, c] of fonte.matchAll(/<p className="(display numeros[^"]*)"/g))
      assert.ok(classes(c).includes('whitespace-nowrap'), `${nome}: ${c}`);
  }
  // os códigos grandes: o do pedido e o da reserva (ou do voucher)
  assert.equal(pedido.match(/<p className="display numeros[^"]*">\{codigo\}<\/p>/g)?.length, 1);
  assert.equal(reserva.match(/<p className="display numeros[^"]*">\{r\.codigo\}<\/p>/g)?.length, 1);
});

test('a faixa do total do pedido: o valor e o rótulo só se separam quando nem juntos cabem na faixa (Inteiro e @container)', () => {
  const achada = pedido.match(/<div className="([^"]*(?<![\w-])tom-campo(?![\w-])[^"]*)">([\s\S]*?)<\/div>/);
  assert.ok(achada, 'a faixa do total');
  const [, classesDaFaixa, faixa] = achada;
  // a largura da faixa decide quando o Inteiro quebra (abaixo de 14rem: só com a letra grande em tela estreita)
  assert.ok(classes(classesDaFaixa).includes('@container'), classesDaFaixa);
  // os dois valores (o principal e, em aberto, o da outra forma) saem do valorDaFaixa, dentro do ComDolar de sempre
  assert.match(faixa, /<ComDolar dolar=\{usd\(principal\.centavos\)\}[^>]*>\s*\{valorDaFaixa\(principal\)\}\s*<\/ComDolar>/);
  assert.match(faixa, /<ComDolar dolar=\{usd\(segunda\.centavos\)\}[^>]*>\s*\{valorDaFaixa\(segunda\)\}\s*<\/ComDolar>/);
  // o valor inteiro sem quebra de antes (o que passava da faixa e da tela) não volta
  assert.doesNotMatch(faixa, /\{valor\((principal|segunda)\)\}/);
  // as caixas em volta podem encolher até a largura da faixa: sem isso o Inteiro não chega a quebrar
  for (const parte of ['principal', 'segunda']) {
    const caixa = classesDe(faixa, new RegExp(`<span className="([^"]*)">\\s*<ComDolar dolar=\\{usd\\(${parte}\\.centavos\\)\\}`), parte);
    assert.ok(caixa.includes('max-w-full'), `${parte}: ${caixa.join(' ')}`);
  }
  // o valor com o rótulo num Inteiro; o rótulo ("no Pix", "con tarjeta") nunca se parte por dentro
  assert.match(
    pedido,
    /const valorDaFaixa = \(p: ParteDoTotal\) => \(\s*<Inteiro>\s*\{brl\(p\.centavos\)\}\s*\{p\.forma && \(\s*<>\s*\{' '\}\s*<span className="whitespace-nowrap">\{rotulo\[p\.forma\]\}<\/span>\s*<\/>\s*\)\}\s*<\/Inteiro>\s*\);/,
  );
  assert.match(pedido, /^import \{[^}]*(?<!\w)Inteiro(?!\w)[^}]*\} from '@\/components\/ComDolar';$/m);
  // o Inteiro (src/components/ComDolar.tsx) só quebra abaixo de 14rem da caixa com @container: com a letra normal, nada muda
  assert.match(codigo('components', 'ComDolar.tsx'), /export function Inteiro\b[\s\S]*?@max-\[14rem\]:whitespace-normal/);
  // as linhas de valor de cada item ficam como estavam: o conserto planejado para elas quebrava o texto (linha vazia e o
  // começo do valor cortado em 320 px com a letra em 150%; seção 3.6 do desenho das telas)
  const inicio = pedido.indexOf('const linhaDeValores = ');
  const fim = pedido.indexOf('const doPedido', inicio);
  assert.ok(inicio !== -1 && fim > inicio, 'as linhas de valor de cada item');
  const linhas = pedido.slice(inicio, fim);
  assert.doesNotMatch(linhas, /Inteiro/);
  assert.match(linhas, /<Pedaco key=\{`\$\{chave\}-valor`\} ponto=\{n > 0\} className="whitespace-nowrap">/);
});

test('o formulário da Stripe guarda 448 px de altura, em px: com a letra grande não sobra vão branco embaixo dele', () => {
  // 448 px é 28rem com a letra normal (nada muda); em rem, com a letra em 150%, a altura guardada ia a 672 px e o
  // formulário da Stripe (que não cresce com a letra do celular) deixava 147 px de branco embaixo
  assert.equal(checkout.match(/<EmbeddedCheckout\b(?!Provider)/g)?.length, 1);
  assert.match(checkout, /<EmbeddedCheckout className="min-h-\[448px\]" \/>/);
  assert.doesNotMatch(checkout, /min-h-\[28rem\]/);
  assert.doesNotMatch(checkout, /min-h-\[[\d.]+rem\]/);
});
