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
  // desde a caixa do Pix no celular (Pacote 10, opção B): a altura guardada continua no próprio formulário, dentro da caixa
  // que encolhe, e encolhe junto com ele no celular pequeno. É a única altura mínima do componente: na caixa de fora (a
  // altura dela é a do quadro encolhido, escrita pelo efeito da escala) ou no cartão, sobraria branco embaixo do formulário
  assert.match(checkout, /<div ref=\{dentroRef\}>\s*<EmbeddedCheckoutProvider\b[^>]*>\s*<EmbeddedCheckout className="min-h-\[448px\]" \/>/);
  assert.equal(checkout.match(/(?<![\w-])min-h-/g)?.length, 1);
});

/** O efeito da escala do CheckoutEmbutido: do useEffect que cria o vigia de tamanho até as dependências dele. */
function efeitoDaEscala(): string {
  const vigia = checkout.indexOf('new ResizeObserver(');
  assert.notEqual(vigia, -1, 'o vigia de tamanho (ResizeObserver)');
  const inicio = checkout.lastIndexOf('useEffect(() => {', vigia);
  const deps = '}, [formaAtual, semStripe]);';
  const fim = checkout.indexOf(deps, vigia);
  assert.notEqual(inicio, -1);
  assert.notEqual(fim, -1, 'a escala recomeça com a forma (o Pix pede outra largura) e com a caixa que volta (semStripe)');
  return checkout.slice(inicio, fim + deps.length);
}

test('a caixa do Pix (e do cartão) no celular: de ponta a ponta abaixo do sm e, quando nem assim cabe, encolhida só o necessário', () => {
  // Pacote 10 (16/11; T1, T2, pix#3 e telas#2 do teste de 15/11; o dono escolheu a opção B). A Stripe não deixa o
  // formulário mais estreito que 412 px na caixa do Pix antes do QR (322 no cartão), e a margem da página mais o respiro
  // do cartão deixavam 333 px num celular de 390 (306 com a letra em 150%): a direita do formulário ficava escondida.
  // O cartão do formulário: no celular, de ponta a ponta (a margem da página devolvida), sem cantos e sem respiro dos lados;
  // do sm para cima, como era (sem margem negativa, cantos de 8 px e respiro de 20 px)
  const cartao = classesDe(checkout, /<div\s+ref=\{caixaRef\}\s+className="([^"]*)"/, 'o cartão do formulário');
  for (const c of ['-mx-(--margem)', 'bg-(--color-papel)', 'py-3', 'sm:mx-0', 'sm:rounded-cartao', 'sm:p-5'])
    assert.ok(cartao.includes(c), `${c}: ${cartao.join(' ')}`);
  for (const c of cartao) assert.doesNotMatch(c, /^(rounded|p|px|ps|pe|pl|pr|m|mx|ms|me|ml|mr)-/, `no celular: ${cartao.join(' ')}`);

  // dentro do cartão: a régua (um bloco vazio, sem altura), irmã da caixa de fora; a caixa que encolhe é filha da de fora
  // e envolve a peça da Stripe. A régua mais rasa que a caixa que encolhe é o que evita o aviso "ResizeObserver loop"
  // (seção 6.1 do desenho das telas); nenhuma das três tem condição
  assert.match(
    checkout,
    /\sref=\{caixaRef\}[^>]*>\s*<div ref=\{reguaRef\} aria-hidden="true" \/>\s*<div ref=\{foraRef\} className="relative">\s*<div ref=\{dentroRef\}>\s*<EmbeddedCheckoutProvider\b[^>]*>\s*<EmbeddedCheckout\b[^>]*\/>\s*<\/EmbeddedCheckoutProvider>\s*<\/div>\s*<\/div>\s*<\/div>/,
  );
  assert.match(checkout, /^import \{ escalaDoQuadro, LARGURA_MINIMA_STRIPE \} from '@\/lib\/quadro-stripe';$/m);

  const efeito = efeitoDaEscala();
  assert.equal(checkout.match(/new ResizeObserver\(/g)?.length, 1);
  // sem a caixa (o script barrado), nada; a largura que a Stripe pede é a da forma do momento
  assert.match(efeito, /if \(semStripe \|\| !regua \|\| !fora \|\| !dentro \|\| typeof ResizeObserver === 'undefined'\) return;/);
  assert.match(efeito, /const minima = LARGURA_MINIMA_STRIPE\[formaAtual\];/);
  // a régua medida sem arredondar (há celulares com largura fracionária, como 411,43 px)
  assert.match(efeito, /const escala = escalaDoQuadro\(regua\.getBoundingClientRect\(\)\.width, minima\);/);
  assert.doesNotMatch(efeito, /clientWidth|offsetWidth/);
  // cabendo, nenhum estilo fica; encolhido, o quadro tem a largura que a Stripe pede, sai do fluxo e encolhe a partir do
  // canto, e a caixa de fora fica com a altura do quadro encolhido
  assert.match(efeito, /if \(escala === 1\) return soltar\(\);/);
  assert.match(efeito, /dentro\.style\.position = 'absolute';/);
  assert.match(efeito, /dentro\.style\.width = `\$\{minima\}px`;/);
  assert.match(efeito, /dentro\.style\.transformOrigin = '0 0';/);
  assert.match(efeito, /dentro\.style\.transform = `scale\(\$\{escala\}\)`;/);
  assert.match(efeito, /fora\.style\.overflow = 'hidden';/);
  assert.match(efeito, /fora\.style\.height = `\$\{dentro\.offsetHeight \* escala\}px`;/);
  // o vigia segue a régua (a largura: girar o celular) e a caixa que encolhe (a Stripe muda a altura do formulário)
  assert.match(
    efeito,
    /const vigia = new ResizeObserver\(acertar\);\s*vigia\.observe\(regua\);\s*vigia\.observe\(dentro\);\s*acertar\(\);/,
  );
  // ao sair (outra forma, o script barrado, a página fechada): o vigia para e os estilos saem. Recomeça com a forma (o Pix
  // depois do cartão recusado pede 412) e com semStripe (a caixa que volta depois do "Tentar de novo")
  assert.match(efeito, /return \(\) => \{\s*vigia\.disconnect\(\);\s*soltar\(\);\s*\};\s*\}, \[formaAtual, semStripe\]\);$/);

  // o vigia só escreve no estilo das duas caixas, e soltar() tira tudo o que acertar() põe (nada sobra ao desligar)
  const kebab = (nome: string) => nome.replace(/[A-Z]/g, (letra) => `-${letra.toLowerCase()}`);
  assert.deepEqual([...new Set([...efeito.matchAll(/\b(\w+)\.style\b/g)].map((m) => m[1]))].sort(), ['dentro', 'fora']);
  for (const caixa of ['dentro', 'fora']) {
    const postos = [...efeito.matchAll(new RegExp(`\\b${caixa}\\.style\\.(\\w+) =`, 'g'))].map((m) => kebab(m[1])).sort();
    const tirados = efeito.match(new RegExp(`for \\(const p of \\[([^\\]]*)\\]\\) ${caixa}\\.style\\.removeProperty\\(p\\);`));
    assert.ok(tirados, `soltar(): ${caixa}`);
    assert.deepEqual([...tirados[1].matchAll(/'([\w-]+)'/g)].map((m) => m[1]).sort(), postos, caixa);
  }
  // fora do efeito, nenhum estilo escrito por JavaScript no componente
  assert.equal(checkout.match(/\.style\b/g)?.length, efeito.match(/\.style\b/g)?.length);
  // e nenhuma margem ou respiro escrito por JavaScript: a margem do celular vem das classes do cartão. Posta pelo vigia, ela
  // mudaria a largura da régua dentro do próprio vigia, e o navegador avisaria "ResizeObserver loop"
  assert.doesNotMatch(checkout, /style\.(margin|padding)|marginInline|paddingInline|setProperty\(\s*['"`](margin|padding)/);
});

/* ------------------------------------------------------------------ */
/* A grade do voucher com a letra grande (Pacote 15, reteste de 17/11)  */

test('a grade do voucher: no celular, o vão menor e os rótulos sem passar da coluna, com o hífen só na grade estreita (Departure time)', () => {
  // Na reserva de 1 item em inglês, "Departure time" passava 22 px da coluna dele em 320 px com a letra em 150% e 2 px em
  // 360 (defeito 6 do reteste de 17/11). A grade do passeio e a do transfer usam as mesmas duas listas de classes
  const grade = classesDe(reserva, /^const GRADE_DO_VOUCHER = '([^']*)';$/m, 'a grade do voucher');
  for (const c of ['mt-6', 'grid', 'grid-cols-2', 'gap-x-4', 'gap-y-4', 'sm:gap-x-8', '@container'])
    assert.ok(grade.includes(c), `${c}: ${grade.join(' ')}`);
  // o vão de 2rem só do sm para cima
  assert.ok(!grade.includes('gap-x-8') && !grade.some((c) => /^gap-\d/.test(c)), grade.join(' '));
  // a consulta dos rótulos mede a própria grade: nenhum outro @container no componente, entre a grade e os rótulos
  assert.equal(reserva.match(/@container/g)?.length, 1);
  const rotulo = classesDe(reserva, /^const ROTULO_DA_GRADE = '([^']*)';$/m, 'os rótulos da grade');
  for (const c of ['text-small', '[overflow-wrap:anywhere]', '@max-[11.6rem]:hyphens-auto'])
    assert.ok(rotulo.includes(c), `${c}: ${rotulo.join(' ')}`);
  // O hífen só com a grade abaixo de 11,6rem (a letra grande em tela estreita). O navegador hifeniza de forma gulosa:
  // um hyphens-auto solto, sem a variante, valeria em toda largura e quebraria com a letra normal palavras que cabem
  // inteiras na linha de baixo ("Busca na hospeda- / gem", "Recogida en el aloja- / miento")
  assert.ok(!rotulo.includes('hyphens-auto'), rotulo.join(' '));
  assert.deepEqual(
    rotulo.filter((c) => c.includes('hyphens')),
    ['@max-[11.6rem]:hyphens-auto'],
  );
  // nada que impeça o rótulo de quebrar ou que segure a largura
  for (const c of rotulo)
    assert.doesNotMatch(c, /nowrap|truncate|break-normal|break-keep|hyphens-(none|manual)|^(min-)?w-/, rotulo.join(' '));
  // as duas grades e todos os rótulos delas (os 13: 6 do transfer, 7 do passeio) com as duas listas
  assert.equal(reserva.match(/<dl\b/g)?.length, 2);
  assert.equal(reserva.match(/<dl className=\{GRADE_DO_VOUCHER\}>/g)?.length, 2);
  const rotulos = reserva.match(/<dt\b[^>]*>/g) ?? [];
  assert.equal(rotulos.length, 13);
  for (const dt of rotulos) assert.equal(dt, '<dt className={ROTULO_DA_GRADE}>');
  // a data e o horário do passeio continuam lado a lado no celular, meia grade cada um, como antes
  assert.match(reserva, /<div>\s*<dt className=\{ROTULO_DA_GRADE\}>\{textos\.data\}<\/dt>/);
  assert.match(
    reserva,
    /<div>\s*<dt className=\{ROTULO_DA_GRADE\}>\{r\.horario\.busca \? textos\.horarioBusca : textos\.horarioSaida\}<\/dt>/,
  );
  // o hífen segue o idioma da página: o html leva o lang do idioma do endereço
  assert.match(codigo('app', '[locale]', 'layout.tsx'), /<html lang=\{HREFLANG\[locale\]\}/);
  assert.match(codigo('i18n', 'config.ts'), /HREFLANG: Record<Idioma, string> = \{ pt: 'pt-BR', en: 'en', es: 'es', 'es-ar': 'es-AR' \}/);
});

/** A margem da página (--margem: clamp(1rem, 0.6rem + 1.8vw, 2rem)), em px, com o html em `raiz` px. */
const margemDaPagina = (largura: number, raiz: number) => Math.min(2 * raiz, Math.max(raiz, 0.6 * raiz + (1.8 * largura) / 100));
/** A grade do voucher abaixo do md: a tela menos a margem da página e o respiro do cartão (px-6), dos dois lados. */
const larguraDaGrade = (largura: number, raiz: number) => largura - 2 * margemDaPagina(largura, raiz) - 2 * 1.5 * raiz;
/** Cada uma das duas colunas da grade, com o vão em rem. */
const colunaDaGrade = (largura: number, raiz: number, vaoRem: number) => (larguraDaGrade(largura, raiz) - vaoRem * raiz) / 2;
/** Um texto de `ems` vezes a letra, no tamanho dos rótulos (text-small, 0.9375rem). */
const noTextoPequeno = (ems: number, raiz: number) => ems * 0.9375 * raiz;

test('a conta da grade do voucher: o modelo dá os 22 e os 2 px do reteste; o hífen só liga onde "hospedagem" não cabe na meia coluna', () => {
  // as medidas do código: a margem da página, o tamanho dos rótulos e o respiro do cartão do voucher
  const tokens = readFileSync(path.join('src', 'app', 'tokens.css'), 'utf8');
  assert.match(tokens, /--margem: clamp\(1rem, 0\.6rem \+ 1\.8vw, 2rem\);/);
  assert.match(tokens, /--text-small: 0\.9375rem;/);
  assert.match(reserva, /<div className="tom-papel">\s*<div className="px-6 pb-6 pt-6 md:px-8">/);
  // o html em 24 px (a letra em 150%) e em 20 (125%), como o reteste mede. "Departure", em Barlow (a letra do site), mede
  // 4,375 vezes a letra (pela largura de cada letra no arquivo da fonte que o site carrega): 98,4 px com 150% (o reteste: 99)
  const departure = noTextoPequeno(4.375, 24);
  // antes (gap-x-8): 76 px em 320 e 96 em 360, e "Departure" passava 22,4 e 2,4 px (o reteste: 22 e 2)
  assert.equal(colunaDaGrade(320, 24, 2), 76);
  assert.equal(colunaDaGrade(360, 24, 2), 96);
  assert.equal(Math.round((departure - colunaDaGrade(320, 24, 2)) * 10) / 10, 22.4);
  assert.equal(Math.round((departure - colunaDaGrade(360, 24, 2)) * 10) / 10, 2.4);
  // agora, o vão abaixo do sm lido do código (gap-x-4: 1rem): 88 e 100 px em 320 (150 e 125%), 108 e 120 em 360
  const vaoDoCodigo = classesDe(reserva, /^const GRADE_DO_VOUCHER = '([^']*)';$/m, 'a grade do voucher').find((c) => /^gap-x-\d+$/.test(c));
  assert.ok(vaoDoCodigo, 'o vão abaixo do sm');
  const vao = Number(vaoDoCodigo.slice('gap-x-'.length)) * 0.25;
  assert.equal(vao, 1);
  assert.deepEqual(
    [320, 360].flatMap((largura) => [24, 20].map((raiz) => colunaDaGrade(largura, raiz, vao))),
    [88, 100, 108, 120],
  );
  // "Departure" cabe inteira em 360 com 150% e nas duas telas com 125%; só em 320 com 150% (98,4 px para 88) ela quebra,
  // com o hífen: "Depar-" (2,972 vezes a letra) e "ture" (1,797) cabem na coluna
  assert.ok(departure <= colunaDaGrade(360, 24, vao));
  for (const largura of [320, 360]) assert.ok(noTextoPequeno(4.375, 20) <= colunaDaGrade(largura, 20, vao), `${largura}/125`);
  assert.ok(departure > colunaDaGrade(320, 24, vao));
  for (const pedaco of [2.972, 1.797]) assert.ok(noTextoPequeno(pedaco, 24) <= colunaDaGrade(320, 24, vao), String(pedaco));
  // o rótulo da busca na hospedagem (fora do reteste) também precisa do hífen: "hospedagem" (5,602) e "alojamiento" (5,105)
  // não cabem inteiras em 320 e 360 com 150%, nem "hospedagem" em 320 com 125%
  for (const [ems, largura, raiz] of [
    [5.602, 320, 24],
    [5.602, 360, 24],
    [5.105, 320, 24],
    [5.105, 360, 24],
    [5.602, 320, 20],
  ])
    assert.ok(noTextoPequeno(ems, raiz) > colunaDaGrade(largura, raiz, vao), `${ems} ${largura}/${raiz}`);
  // os rótulos de linha inteira ficam numa linha só em 320 com 150%: o mais largo, "Punto de encuentro", 8,528 vezes a letra
  assert.ok(noTextoPequeno(8.528, 24) <= larguraDaGrade(320, 24));

  // O hífen só com a grade estreita: o limite lido do código (@max-[11.6rem]: a grade com menos de 11,6rem)
  const limiteDoCodigo = classesDe(reserva, /^const ROTULO_DA_GRADE = '([^']*)';$/m, 'os rótulos da grade')
    .map((c) => c.match(/^@max-\[(\d+(?:\.\d+)?)rem\]:hyphens-auto$/)?.[1])
    .find(Boolean);
  assert.ok(limiteDoCodigo, 'o limite do hífen');
  const limite = Number(limiteDoCodigo);
  assert.equal(limite, 11.6);
  // "hospedagem" (5,602 vezes a letra, 5,25rem no tamanho dos rótulos) é a palavra mais longa dos rótulos de meia grade:
  // com a grade de 11,6rem ou mais, a meia coluna ((11,6 − 1) / 2 = 5,3rem) a comporta, em qualquer tela e letra
  assert.ok((limite - vao) / 2 >= 5.602 * 0.9375);
  // (1) as combinações de tela e letra (o html em 16, 20 e 24 px: a letra em 100, 125 e 150%) com o hífen ligado e desligado
  const ligadas = [
    [320, 20],
    [320, 24],
    [360, 24],
    [375, 24],
    [390, 24],
  ];
  const desligadas = [
    [320, 16],
    [360, 16],
    [375, 16],
    [390, 16],
    [412, 16],
    [360, 20],
    [375, 20],
    [390, 20],
    [412, 24],
  ];
  for (const [largura, raiz] of ligadas) assert.ok(larguraDaGrade(largura, raiz) / raiz < limite, `ligado em ${largura}/${raiz}`);
  for (const [largura, raiz] of desligadas) assert.ok(larguraDaGrade(largura, raiz) / raiz >= limite, `desligado em ${largura}/${raiz}`);
  // (2) desligado, "hospedagem" cabe inteira na meia coluna: nenhuma palavra dos rótulos de meia grade quebra, e o rótulo
  // quebra só entre palavras, como antes (com a letra normal e com 125% a partir de 360 px)
  for (const [largura, raiz] of desligadas)
    assert.ok(colunaDaGrade(largura, raiz, vao) >= noTextoPequeno(5.602, raiz), `cabe em ${largura}/${raiz}`);
  // (3) ligado, "hospedagem" não cabe: o hífen é o último recurso, só onde uma palavra precisa mesmo quebrar
  for (const [largura, raiz] of ligadas)
    assert.ok(noTextoPequeno(5.602, raiz) > colunaDaGrade(largura, raiz, vao), `não cabe em ${largura}/${raiz}`);
});
