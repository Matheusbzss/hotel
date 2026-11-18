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
  // a consulta dos rótulos mede a própria grade: nenhum outro @container entre a grade e os rótulos. O outro @container
  // do componente é o da faixa escura do total (Pacote 18), que fica fora da grade, embaixo dela
  assert.equal(reserva.match(/@container/g)?.length, 2);
  assert.equal(reserva.match(/className="@container tom-campo /g)?.length, 1);
  assert.ok(reserva.indexOf('className="@container tom-campo ') > reserva.lastIndexOf('</dl>'), 'a faixa vem depois das duas grades');
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

/* ------------------------------------------------------------------ */
/* A faixa da reserva e o ícone do WhatsApp (Pacote 18, reteste de 17-18/11) */

/**
 * As larguras que a bancada mediu no reteste de 17-18/11 (X1, telas/saida/090-icone-whatsapp/medidas.txt): o botão do
 * WhatsApp do voucher pago, que ocupa a largura do bloco dele (w-full dentro do respiro px-6 do voucher), em 320, 360 e
 * 390 px com a letra em 100, 125 e 150%. É a mesma largura da faixa escura do total, que fica no mesmo voucher, com o
 * mesmo respiro.
 */
const BOTAO_MEDIDO: Record<number, number[]> = { 320: [240, 220, 200], 360: [280, 260, 240], 390: [309, 290, 270] };
const RAIZES = [16, 20, 24];

test('a faixa da reserva: o valor e o rótulo juntos (Inteiro e @container), e o rótulo nunca se parte ("R$ 138,60 no / Pix")', () => {
  // defeito 5 do reteste de 17-18/11: em 320 px com a letra em 150%, a faixa mostrava "R$ 138,60 no" numa linha e "Pix"
  // na outra (o valor e o rótulo eram um texto só, que quebrava em qualquer espaço). Agora como a faixa da página do pedido
  const faixa = classesDe(
    reserva,
    /<div className="([^"]*(?<![\w-])tom-campo(?![\w-])[^"]*)">\s*<span className="font-semibold">\s*<PalavraDoStatus/,
    'a faixa da reserva',
  );
  for (const c of ['@container', 'tom-campo', 'flex', 'flex-wrap', 'justify-between', 'px-6', 'py-5', 'md:px-8'])
    assert.ok(faixa.includes(c), `${c}: ${faixa.join(' ')}`);
  // o valor com o rótulo num Inteiro; o rótulo ("no Pix", "con tarjeta") num whitespace-nowrap, depois de um espaço comum
  assert.match(
    reserva,
    /const valorTela = \(centavos: number, rotulo\?: string\) => \{\s*const valor = \(\s*<Inteiro>\s*\{formatarCentavos\(centavos, locale\)\}\s*\{rotulo && \(\s*<>\s*\{' '\}\s*<span className="whitespace-nowrap">\{rotulo\}<\/span>\s*<\/>\s*\)\}\s*<\/Inteiro>\s*\);/,
  );
  // o texto de antes (o valor e o rótulo colados numa frase só) não volta; o dólar continua um pedaço à parte, que desce
  // inteiro para a linha de baixo
  assert.doesNotMatch(reserva, /`\$\{formatarCentavos\(centavos, locale\)\} \$\{rotulo\}`/);
  assert.match(reserva, /\{valor\} <span className="whitespace-nowrap">\(\{u\}\)<\/span>/);
  assert.match(reserva, /^import \{ Inteiro \} from '\.\/ComDolar';$/m);
  // cada valor da faixa pode encolher até a largura dela (max-w-full): sem isso o Inteiro, que pede a largura dele
  // inteiro, não chega a quebrar, e o recorte da caixa dos valores (overflow-hidden) cortaria o rótulo
  const valor = classesDe(reserva, /<span key=\{parte\.forma \?\? 'total'\} className="([^"]*)">/, 'cada valor da faixa');
  for (const c of ['relative', 'max-w-full', 'pl-[0.626em]']) assert.ok(valor.includes(c), `${c}: ${valor.join(' ')}`);
  const caixa = classesDe(
    reserva,
    /<span className="([^"]*)">\s*<span className="-ml-\[0\.626em\] flex flex-wrap gap-y-1">\{brlTela\}<\/span>/,
    'a caixa dos valores',
  );
  for (const c of ['numeros', 'overflow-hidden', 'text-lead', 'font-semibold']) assert.ok(caixa.includes(c), `${c}: ${caixa.join(' ')}`);
  // os valores da faixa saem todos do valorTela
  assert.equal(reserva.match(/valorTela\(/g)?.length, 1);
  // o Inteiro só quebra abaixo de 14rem da caixa com @container (a faixa); acima disso, fica numa linha só
  assert.match(
    codigo('components', 'ComDolar.tsx'),
    /export function Inteiro\b[\s\S]*?className="whitespace-nowrap @max-\[14rem\]:inline-block @max-\[14rem\]:w-max @max-\[14rem\]:max-w-full @max-\[14rem\]:whitespace-normal"/,
  );
});

/** O text-lead (clamp(1.1875rem, 1.1rem + 0.4vw, 1.375rem)), em px, numa tela de `largura` px com o html em `raiz` px. */
const letraLead = (largura: number, raiz: number) => Math.min(1.375 * raiz, Math.max(1.1875 * raiz, 1.1 * raiz + (0.4 * largura) / 100));

test('a conta da faixa da reserva: em 320, 360 e 390 px, letra 100/125/150%, em pt, en e es, o valor e o rótulo cabem e só se separam juntos', () => {
  // as medidas do código: a letra dos valores, o limite do Inteiro e a faixa que ele mede (o @container dela, com o
  // respiro px-6 de sempre): é o que a conta abaixo supõe
  assert.match(
    readFileSync(path.join('src', 'app', 'tokens.css'), 'utf8'),
    /--text-lead: clamp\(1\.1875rem, 1\.1rem \+ 0\.4vw, 1\.375rem\);/,
  );
  const limite = Number(codigo('components', 'ComDolar.tsx').match(/@max-\[(\d+(?:\.\d+)?)rem\]:whitespace-normal/)?.[1]);
  assert.equal(limite, 14);
  assert.match(
    reserva,
    /<div className="@container tom-campo flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-5 md:px-8">/,
  );
  assert.match(reserva, /<div className="tom-papel">\s*<div className="px-6 pb-6 pt-6 md:px-8">/);
  // a largura de dentro da faixa é a da grade do voucher (o mesmo voucher, o mesmo respiro px-6), conferida com a do botão
  // do WhatsApp que a bancada mediu no mesmo voucher
  for (const [largura, medidas] of Object.entries(BOTAO_MEDIDO))
    RAIZES.forEach((raiz, n) => assert.equal(Math.round(larguraDaGrade(Number(largura), raiz)), medidas[n], `${largura}/${raiz}`));
  // Os valores e os rótulos, em vezes a letra, no Barlow SemiBold (a letra da faixa: o body em Barlow com font-semibold),
  // com os algarismos tabulares do .numeros e o kerning, pelo arquivo da fonte que o site carrega. Por idioma: o valor, o
  // rótulo e os dois juntos (com o espaço). O maior é o de um pedido de R$ 5.500,00 no cartão, em espanhol
  const TEXTOS: Record<string, [string, number, number, number][]> = {
    pt: [
      ['R$ 138,60 no Pix', 4.335, 2.662, 7.197],
      ['R$ 154,00 no cartão', 4.335, 4.182, 8.717],
      ['R$ 5.500,00 no cartão', 5.146, 4.182, 9.528],
    ],
    en: [
      ['R$138.60 with Pix', 4.143, 3.5, 7.843],
      ['R$154.00 by card', 4.143, 3.208, 7.551],
      ['R$5,500.00 by card', 4.946, 3.208, 8.354],
    ],
    es: [
      ['R$ 138,60 con Pix', 4.335, 3.192, 7.727],
      ['R$ 154,00 con tarjeta', 4.335, 4.776, 9.311],
      ['R$ 5.500,00 con tarjeta', 5.146, 4.776, 10.122],
    ],
  };
  for (const largura of [320, 360, 390]) {
    for (const raiz of RAIZES) {
      const faixa = larguraDaGrade(largura, raiz);
      const letra = letraLead(largura, raiz);
      const quebra = faixa < limite * raiz;
      for (const [idioma, lista] of Object.entries(TEXTOS)) {
        for (const [texto, valor, rotulo, juntos] of lista) {
          const onde = `${idioma} "${texto}" em ${largura}/${raiz}`;
          // o valor e o rótulo, cada um, sempre cabem na faixa: quando os dois juntos não cabem, o rótulo desce inteiro
          assert.ok(valor * letra <= faixa && rotulo * letra <= faixa, onde);
          // acima de 14rem o Inteiro não quebra: os dois juntos cabem (nada fica escondido no recorte da faixa)
          if (!quebra) assert.ok(juntos * letra <= faixa, onde);
        }
      }
    }
  }
  // com a letra normal, a faixa tem 14rem ou mais em 320, 360 e 390 px: o Inteiro fica numa linha só e, como tudo cabe, a
  // faixa fica igual à de antes. Com 125%, só em 390 px; com 150%, em nenhuma
  assert.deepEqual(
    [320, 360, 390].map((largura) => RAIZES.map((raiz) => larguraDaGrade(largura, raiz) >= limite * raiz)),
    [
      [true, false, false],
      [true, false, false],
      [true, true, false],
    ],
  );
  // o defeito: em 320 px com 150% a faixa tem 200 px e "R$ 138,60 no Pix" pede 205 (28,5 px de letra): ele precisa quebrar,
  // e agora quebra entre o valor e o rótulo ("R$ 138,60" / "no Pix"), nunca dentro do rótulo
  assert.equal(larguraDaGrade(320, 24), 200);
  assert.equal(letraLead(320, 24), 28.5);
  assert.ok(7.197 * letraLead(320, 24) > larguraDaGrade(320, 24));
  // onde a bancada viu o rótulo inteiro (360 px com 125% e 390 px com 150%), os dois juntos continuam numa linha só
  assert.ok(7.197 * letraLead(360, 20) <= larguraDaGrade(360, 20));
  assert.ok(7.197 * letraLead(390, 24) <= larguraDaGrade(390, 24));
});

test('o ícone do WhatsApp não encolhe dentro do botão com a letra grande: shrink-0 no próprio componente, nos cinco botões', () => {
  // X1 do reteste de 17-18/11: o svg sem shrink-0 dentro do .botao (inline-flex) encolhia até 8,6 px em vez de 30 em 320 px
  // com a letra em 150%, quando o texto do botão quebrava em várias linhas
  const icone = codigo('components', 'IconeWhatsApp.tsx');
  assert.equal(icone.match(/<svg\b/g)?.length, 1);
  assert.match(icone, /<svg viewBox="0 0 32 32" className=\{className \? `shrink-0 \$\{className\}` : 'shrink-0'\}/);
  // o .botao é inline-flex: o motivo de o ícone encolher sem o shrink-0
  const css = readFileSync(path.join('src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');
  const regra = css.slice(css.indexOf('\n  .botao {'), css.indexOf('}', css.indexOf('\n  .botao {')));
  assert.match(regra, /display: inline-flex;/);
  // os cinco lugares: dois na página da reserva (o voucher pago e o "finalizar pelo WhatsApp"), dois na página do pedido e o
  // botão do carrinho que registra o pedido pelo WhatsApp (o que está no ar); todos com size-5, dentro de um .botao-whats
  const lugares: [string[], number][] = [
    [['components', 'StatusReserva.tsx'], 2],
    [['app', '[locale]', 'pedido', '[codigo]', 'page.tsx'], 2],
    [['components', 'carrinho', 'FormularioCarrinho.tsx'], 1],
  ];
  for (const [partes, quantos] of lugares) {
    const fonte = codigo(...partes);
    const usos = [...fonte.matchAll(/<IconeWhatsApp\b[^>]*\/>/g)];
    assert.equal(usos.length, quantos, partes.join('/'));
    for (const uso of usos) {
      assert.equal(uso[0], '<IconeWhatsApp className="size-5" />', partes.join('/'));
      const antes = fonte.slice(0, uso.index);
      const abre = Math.max(antes.lastIndexOf('<a'), antes.lastIndexOf('<button'));
      assert.match(antes.slice(abre), /className="botao botao-whats[^"]*"/, partes.join('/'));
    }
  }
});

test('a conta do botão do WhatsApp do voucher pago: com o ícone inteiro, a palavra mais longa continua dentro do botão', () => {
  // o .botao: respiro de 1.4rem dos lados, vão de 0.6rem entre o ícone e o texto e letra de 1.125rem; o ícone, size-5
  // (1.25rem), que agora nunca encolhe: a conta abaixo é a do ícone inteiro
  assert.match(codigo('components', 'IconeWhatsApp.tsx'), /className=\{className \? `shrink-0 \$\{className\}` : 'shrink-0'\}/);
  const css = readFileSync(path.join('src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');
  const regra = css.slice(css.indexOf('\n  .botao {'), css.indexOf('}', css.indexOf('\n  .botao {')));
  for (const linha of ['gap: 0.6rem;', 'padding: 0.75rem 1.4rem;', 'font-size: 1.125rem;']) assert.ok(regra.includes(linha), linha);
  // A palavra mais longa do texto do botão é "WhatsApp" nos três idiomas: com o ícone encolhido, os três ficaram com os
  // mesmos 8,64 px em 320 px com 150%, o que sobrava ao lado dela no botão de 200 px. Daí, a largura dela em vezes a letra
  // do botão (o Barlow Semi Condensed): (200 − 2 × 1,4 × 24 − 0,6 × 24 − 8,64) / (1,125 × 24) = 4,065
  const palavra = (200 - 2 * 1.4 * 24 - 0.6 * 24 - 8.64) / (1.125 * 24);
  assert.equal(Math.round(palavra * 1000) / 1000, 4.065);
  for (const largura of [320, 360, 390]) {
    for (const raiz of RAIZES) {
      const botao = larguraDaGrade(largura, raiz);
      const espaco = botao - 2 * 1.4 * raiz;
      // o ícone com o tamanho dele, o vão e a palavra
      const ocupa = 1.25 * raiz + 0.6 * raiz + palavra * 1.125 * raiz;
      const onde = `${largura}/${raiz}`;
      // sempre dentro do botão verde
      assert.ok(ocupa <= botao, onde);
      // e dentro do espaço do texto, menos em 320 px com 150%: lá o conjunto avança 10,7 px em cada respiro de 33,6
      // (o .botao centraliza), e o texto ainda termina a 22,9 px da borda
      if (largura === 320 && raiz === 24) {
        assert.equal(Math.round(((ocupa - espaco) / 2) * 10) / 10, 10.7);
        assert.ok((ocupa - espaco) / 2 < 1.4 * raiz);
      } else assert.ok(ocupa <= espaco, onde);
    }
  }
  // os outros quatro botões (o "finalizar pelo WhatsApp" da reserva, os dois da página do pedido e o do carrinho) ocupam a
  // largura da página, sem o respiro do voucher: sobra mais espaço ao lado do ícone em todas as combinações
  for (const largura of [320, 360, 390])
    for (const raiz of RAIZES) {
      const pagina = largura - 2 * margemDaPagina(largura, raiz);
      assert.ok(1.25 * raiz + 0.6 * raiz + palavra * 1.125 * raiz <= pagina - 2 * 1.4 * raiz, `página ${largura}/${raiz}`);
    }
});
