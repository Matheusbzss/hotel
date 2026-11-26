import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// O painel da equipe (/admin) e as estatísticas no celular (Pacote 12, 17/11; R1 do reteste de 16-17/11). Em 320, 360 e
// 390 px o painel ficava mais largo que a tela (de 209 a 578 px a mais), e com o histórico aberto (ele abre sozinho nos
// pedidos com aviso) até a caixa "Confirmo: devolver R$ …" do reembolso ficava cortada na borda; as estatísticas passavam
// 22 e 62 px com a letra em 150%. O conserto é só de classes, e no computador (1440 px) nada muda. As duas páginas rodam
// no servidor do Next (o atalho "@/"), então estes testes leem o código delas. Antes de construir, as classes foram medidas
// numa réplica estática com o CSS do próprio projeto, no Chromium e no WebKit do Playwright, como o reteste mede (o
// tamanho da letra no html): 0 px de rolagem lateral em 320, 360 e 390 px com a letra em 100, 125 e 150%, e o mesmo
// desenho de antes em 1440 px (o texto e as caixas no mesmo lugar). A medida de verdade é a do reteste na bancada
// (telas/s11-painel.mjs). Só leitura: nada é gravado.

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

function temTodas(lista: string[], esperadas: string[], onde: string) {
  for (const c of esperadas) assert.ok(lista.includes(c), `${onde}: falta ${c} em "${lista.join(' ')}"`);
}

const painel = codigo('app', 'admin', 'page.tsx');
const estatisticas = codigo('app', 'admin', 'estatisticas', 'page.tsx');

test('o cartão do pedido no painel: uma coluna que encolhe no celular e o histórico que quebra os códigos da Stripe', () => {
  // toda lista de classes com lg:grid-cols-12 tem também a coluna que encolhe: sem grid-cols-1, a coluna "auto" do celular
  // crescia até a linha mais larga do cartão (um código cs_test_… de 66 letras no histórico) e o cartão passava da tela
  const grades = [...painel.matchAll(/["'`]([^"'`]*?(?<![\w:-])lg:grid-cols-12(?![\w-])[^"'`]*)["'`]/g)].map((m) => m[1]);
  assert.equal(grades.length, 1, 'hoje, uma grade só: o cartão do pedido');
  for (const g of grades) assert.ok(classes(g).includes('grid-cols-1'), g);
  const cartao = classesDe(painel, /function CartaoPedido\([\s\S]*?\n {4}<li className="([^"]*)">/, 'o cartão do pedido');
  temTodas(cartao, ['grid', 'grid-cols-1', 'gap-4', 'bg-white', 'p-5', 'lg:grid-cols-12'], 'o cartão do pedido');

  // o histórico: as linhas com os códigos da Stripe (cs_test_…, pi_…, re_…, du_…), que não têm onde quebrar, quebram em
  // qualquer ponto; com a coluna que encolhe, só isso já não deixava o histórico aberto alargar a página
  const historico = classesDe(
    painel,
    /<summary className="cursor-pointer font-semibold">Histórico<\/summary>\s*<ul className="([^"]*)">/,
    'a lista do histórico',
  );
  temTodas(historico, ['mt-2', 'space-y-1', '[overflow-wrap:anywhere]'], 'a lista do histórico');
  const trechoDoHistorico = painel.slice(
    painel.indexOf('>Histórico</summary>'),
    painel.indexOf('</details>', painel.indexOf('>Histórico</summary>')),
  );
  assert.doesNotMatch(trechoDoHistorico, /whitespace-nowrap|text-nowrap|break-normal|truncate/);

  // as caixas em volta das ações deixam o reembolso (com a caixa "Confirmo") encolher até a largura do cartão
  assert.match(
    painel,
    /<div className="flex flex-wrap items-start justify-between gap-3 lg:col-span-12">\s*<Acoes p=\{p\} filtro=\{filtro\} busca=\{busca\} \/>/,
  );
  assert.match(painel, /<div className="flex min-w-0 flex-col items-start gap-3">/);
  // os códigos da Stripe fora do histórico (os links do pagamento) já quebravam em qualquer letra
  assert.match(painel, /className="block break-all text-small underline underline-offset-4"/);
});

test('a busca do painel: no celular, a linha dela, com a caixa que encolhe ao lado do botão; do sm para cima, como sempre', () => {
  // o bloco da busca: a linha inteira no celular; do sm (640 px) para cima, à direita e da largura do que tem dentro
  const bloco = classesDe(painel, /<div className="([^"]*)">\s*\{filtro\.valor && <input type="hidden" name="status"/, 'o bloco da busca');
  temTodas(bloco, ['flex', 'w-full', 'gap-2', 'sm:ml-auto', 'sm:w-auto'], 'o bloco da busca');
  assert.ok(!bloco.includes('ml-auto'), 'no celular a busca não é empurrada para a direita: ela ocupa a linha dela');
  // a caixa: no celular ocupa o que sobra ao lado do botão e pode encolher (sem min-w-0, ela não ficaria mais estreita que a
  // largura natural de um campo de texto, que cresce com a letra); do sm para cima, os 16rem de sempre, sem crescer nem encolher
  const caixa = classesDe(painel, /<input\s+id="q"[^>]*?className="([^"]*)"/, 'a caixa da busca');
  temTodas(caixa, ['campo', 'min-h-11', 'min-w-0', 'flex-1', 'py-2', 'sm:w-64', 'sm:flex-none'], 'a caixa da busca');
  assert.ok(!caixa.includes('w-64'), 'os 16rem fixos só do sm para cima');
  assert.match(painel, /<button type="submit" className="min-h-11 bg-mar px-5 font-semibold text-white">\s*Buscar\s*<\/button>/);
});

test('os filtros do painel: o texto quebra dentro do filtro só quando, sozinho, ele não cabe na linha', () => {
  // "Recusados / cancelados" mede uns 300 px em 320 px com a letra em 150%, e a linha tem 272: sem quebrar, a página
  // passava 4 px da tela (medido na réplica, e o mesmo grupo aparece no log do reteste em 324,5 px). Com espaço, cada filtro
  // fica numa linha só, como sempre (eles já descem inteiros para a linha de baixo quando não cabem lado a lado)
  const filtro = painel.match(/className=\{`filtro ([^$`]*)\$\{f\.valor === filtro\.valor \? '!bg-mar !text-sol' : '!bg-white'\}`\}/);
  assert.ok(filtro, 'a classe dos filtros do painel');
  assert.ok(classes(filtro[1]).includes('whitespace-normal'), filtro[1]);
  // e a classe vence: o .filtro (com o nowrap) mora na camada components do CSS, e as classes do Tailwind, na utilities
  const css = readFileSync(path.join('src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');
  const regra = css.indexOf('\n  .filtro {');
  assert.notEqual(regra, -1, 'a regra .filtro');
  assert.match(css.slice(regra, css.indexOf('}', regra)), /white-space: nowrap;/);
  const camadas = [...css.slice(0, regra).matchAll(/^@layer (\w+) \{$/gm)];
  assert.equal(camadas.at(-1)?.[1], 'components');
});

test('as estatísticas no celular: a tabela rola dentro da caixa dela, e nem os números nem as linhas de status passam da tela', () => {
  // "Ver em tabela": a tabela, mais larga que o cartão com a letra grande, rola de lado dentro de uma caixa; a página não.
  // A margem de cima passou da tabela para a caixa
  assert.match(
    estatisticas,
    /<summary className="cursor-pointer text-small font-semibold">Ver em tabela<\/summary>\s*<div className="mt-3 overflow-x-auto">\s*<table className="w-full text-small tabular-nums">[\s\S]*?<\/table>\s*<\/div>\s*<\/details>/,
  );
  assert.equal(estatisticas.match(/<table\b/g)?.length, 1);

  // os números sem quebra: o faturamento e os quatro cartões. O que passava 22 e 62 px da tela em 360 e 320 px com a letra
  // em 150% era o faturamento (o texto saía da caixa dele, por isso a lista do reteste só achou a tabela): o mínimo da
  // letra, 2.25rem, ia a 54 px. Agora o mínimo também segue a tela
  const grande = classesDe(estatisticas, /Faturamento \(menos reembolsos\)<\/p>\s*<p className="([^"]*)">/, 'o faturamento');
  temTodas(grande, ['whitespace-nowrap', 'text-[clamp(min(2.25rem,12vw),11vw,3.25rem)]', 'font-bold', 'leading-none'], 'o faturamento');
  const pequeno = classesDe(estatisticas, /<p className="([^"]*)">\{valor\}<\/p>/, 'o valor de cada cartão (Numero)');
  temTodas(pequeno, ['whitespace-nowrap', 'text-[clamp(min(1.125rem,5.8vw),5.2vw,1.5rem)]', 'font-bold'], 'o valor de cada cartão');
  // os mínimos que só cresciam com a letra não voltam
  assert.doesNotMatch(estatisticas, /text-\[clamp\(2\.25rem|text-\[clamp\(1\.125rem/);

  // as linhas "nome · ○ Desligado" (os e-mails e a medição dos anúncios): o status desce para baixo do nome só quando os
  // dois não cabem juntos; o vão entre os dois continua o de sempre (gap-3 = gap-x-3 numa linha só)
  assert.match(estatisticas, /const LINHA_DE_STATUS = 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2';/);
  assert.match(estatisticas, /const NOME_DA_LINHA = 'grow basis-20';/);
  const linhas = estatisticas.match(
    /<li key=\{nome\} className=\{LINHA_DE_STATUS\}>\s*<span className=\{NOME_DA_LINHA\}>\{nome\}<\/span>\s*<span className=\{`shrink-0 text-small font-semibold /g,
  );
  assert.equal(linhas?.length, 2, 'as duas listas: Emails e Medicao');
  assert.doesNotMatch(estatisticas, /<span>\{nome\}<\/span>/);
});

/**
 * A letra, em px, de clamp(min(a rem, b vw), c vw, d rem) (agora) e de clamp(a rem, c vw, d rem) (antes), numa tela de
 * `largura` px com o html em `raiz` px (16 é a letra normal; 20 e 24, a letra em 125 e 150%, como o reteste mede).
 */
const letraAgora = (largura: number, raiz: number, [a, b, c, d]: number[]) =>
  Math.max(Math.min(a * raiz, (b * largura) / 100), Math.min((c * largura) / 100, d * raiz));
const letraAntes = (largura: number, raiz: number, [a, , c, d]: number[]) => Math.max(a * raiz, Math.min((c * largura) / 100, d * raiz));

test('o mínimo da letra dos números: igual a antes com a letra normal, em 390 px com 125% e no computador; menor só onde passava', () => {
  // os números de clamp(min(2.25rem,12vw),11vw,3.25rem) e clamp(min(1.125rem,5.8vw),5.2vw,1.5rem), conferidos no código
  const grande = [2.25, 12, 11, 3.25];
  const pequeno = [1.125, 5.8, 5.2, 1.5];
  assert.match(estatisticas, /text-\[clamp\(min\(2\.25rem,12vw\),11vw,3\.25rem\)\]/);
  assert.match(estatisticas, /text-\[clamp\(min\(1\.125rem,5\.8vw\),5\.2vw,1\.5rem\)\]/);
  const numeros: [string, number[]][] = [
    ['faturamento', grande],
    ['cartões', pequeno],
  ];
  for (const [nome, n] of numeros) {
    // a letra normal, do celular pequeno ao computador
    for (const largura of [320, 360, 375, 390, 412, 768, 1024, 1440])
      assert.equal(letraAgora(largura, 16, n), letraAntes(largura, 16, n), `${nome} ${largura}/100`);
    // 390 px com a letra em 125%, e o computador com qualquer letra
    assert.equal(letraAgora(390, 20, n), letraAntes(390, 20, n), `${nome} 390/125`);
    for (const raiz of [16, 20, 24]) assert.equal(letraAgora(1440, raiz, n), letraAntes(1440, raiz, n), `${nome} 1440/${raiz}`);
    // menor só no celular estreito com a letra grande, onde o número passava do cartão ou da tela
    for (const largura of [320, 360]) assert.ok(letraAgora(largura, 24, n) < letraAntes(largura, 24, n), `${nome} ${largura}/150`);
  }
  // O faturamento da bancada no reteste ("R$ 47.043,08") mede 6,07 vezes a letra (na réplica); um de seis dígitos, uns
  // 6,6. A direita do texto é a margem da página (1rem) mais o respiro do cartão (1.25rem) mais o número: agora cabe na
  // tela em 320, 360 e 390 px com a letra em 150%; antes passava em 320 e 360 (os 62 e 22 px do reteste)
  const direita = (largura: number, raiz: number, letra: number, ems: number) => raiz + 1.25 * raiz + ems * letra;
  for (const largura of [320, 360, 390]) {
    for (const ems of [6.07, 6.6]) assert.ok(direita(largura, 24, letraAgora(largura, 24, grande), ems) <= largura, `${largura} ${ems}`);
  }
  for (const largura of [320, 360]) assert.ok(direita(largura, 24, letraAntes(largura, 24, grande), 6.07) > largura, `antes, ${largura}`);
});

/* ------------------------------------------------------------------ */
/* As estatísticas com a letra grande (Pacote 15, reteste de 17/11)     */

const grafico = codigo('components', 'admin', 'GraficoColunas.tsx');

test('as estatísticas com a letra grande: abaixo do sm, só a primeira e a última data do eixo; a nota do número quebra dentro do cartão', () => {
  // Defeito 4 do reteste de 17/11: com a letra em 125 e 150%, as datas do eixo ficavam umas sobre as outras em 320 a 390 px
  // ("05/11" sobre "09/11"), e a nota "0% do faturamento" saía 19,8 px do cartão branco em 320 px com 150%
  assert.match(grafico, /^const DATA_DO_EIXO = 'absolute text-\[0\.75rem\] tabular-nums text-tinta-suave';$/m);
  assert.match(grafico, /const primeira = i === 0;\s*const ultima = i === colunas\.length - 1;/);
  // as duas pontas sempre; as do meio escondidas abaixo do sm e de volta do sm para cima (inline: absoluta, vira bloco)
  assert.match(
    grafico,
    /<span key=\{i\} className=\{primeira \|\| ultima \? DATA_DO_EIXO : `\$\{DATA_DO_EIXO\} hidden sm:inline`\} style=\{lugar\}>\s*\{c\.eixo\}\s*<\/span>/,
  );
  assert.equal(grafico.match(/\{c\.eixo\}/g)?.length, 1);
  // cada data no lugar de sempre: a primeira à esquerda, a última à direita, as do meio no centro da coluna delas
  assert.match(
    grafico,
    /const lugar = primeira\s*\? \{ left: 0 \}\s*: ultima\s*\? \{ right: 0 \}\s*: \{ left: `\$\{\(\(i \+ 0\.5\) \/ colunas\.length\) \* 100\}%`, transform: 'translateX\(-50%\)' \};/,
  );
  // o texto para o leitor de tela continua com todos os dados: o eixo já era escondido dele (aria-hidden); as setas e o
  // toque passam por todas as colunas, e o balão diz o valor, a outra medida e a data de cada uma
  assert.match(grafico, /<div className="relative mt-1 h-5" aria-hidden>/);
  assert.match(grafico, /aria-label=\{`\$\{nome\}\. Use as setas para ver cada coluna\.`\}/);
  assert.match(
    grafico,
    /<div\s+role="status"[\s\S]*?<p className="font-bold tabular-nums">\{coluna\.texto\}<\/p>\s*<p className="text-tinta-suave">\{coluna\.detalhe\}<\/p>\s*<p className="text-tinta-suave">\{coluna\.rotulo\}<\/p>/,
  );
  // a página dá as datas às mesmas colunas de antes (todas aparecem do sm para cima), e a tabela tem todo dia com venda
  assert.match(estatisticas, /\.\.\.\(comTexto\.has\(i\) \? \{ eixo: dataCurta\(p\.de\) \} : \{\}\),/);
  assert.match(estatisticas, /\{pontos\s*\.filter\(\(p\) => p\.pedidos\)/);

  // a nota embaixo do número quebra dentro da palavra que não cabe sozinha na linha
  const nota = classesDe(estatisticas, /\{nota && <p className="([^"]*)">\{nota\}<\/p>\}/, 'a nota do número');
  temTodas(nota, ['text-small', 'text-tinta-suave', '[overflow-wrap:anywhere]'], 'a nota do número');
  // o cartão do número não alarga com o texto (as colunas de grid-cols-2 são minmax(0, 1fr)): nada de min-w-0 a mais
  assert.match(estatisticas, /<section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Resumo">/);
  assert.match(
    estatisticas,
    /return \(\s*<div className="bg-white px-4 py-4 sm:px-5">\s*<p className="text-small text-tinta-suave">\{rotulo\}<\/p>/,
  );
});

test('a conta do eixo: o modelo dá as sobreposições do reteste, e abaixo do sm a primeira e a última data nunca se encostam', () => {
  // tudo em px, com o html em `raiz` px. A área do gráfico: a tela menos a margem da página (px-4), o respiro do cartão (p-5)
  // e a coluna dos valores (w-[4.25rem]) com a margem dela (mr-2)
  assert.match(estatisticas, /<main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">/);
  assert.match(estatisticas, /<section className="min-w-0 bg-white p-5">/);
  assert.match(grafico, /<div className="relative mr-2 h-44 w-\[4\.25rem\] shrink-0" aria-hidden>/);
  const area = (largura: number, raiz: number) => largura - 2 * raiz - 2 * 1.25 * raiz - (4.25 + 0.5) * raiz;
  // uma data ("05/11", em 0.75rem, com os algarismos de largura fixa): 2,547 vezes a letra, tirado da primeira sobreposição
  // do reteste (13 colunas em 98 px, em 320 px com 150%); as outras cinco medidas conferem com a mesma conta
  const data = (raiz: number) => 2.547 * 0.75 * raiz;
  // os 13 dias do reteste (05/11 a 17/11), com data nas colunas 0, 4, 8 e 12 (colunasComTexto); o trilho tem pelo menos 7
  // px por coluna
  const n = 13;
  const caixa = (i: number, largura: number, raiz: number): [number, number] => {
    const trilho = Math.max(area(largura, raiz), n * 7);
    const w = data(raiz);
    if (i === 0) return [0, w];
    if (i === n - 1) return [trilho - w, trilho];
    const centro = ((i + 0.5) / n) * trilho;
    return [centro - w / 2, centro + w / 2];
  };
  const sobre = (i: number, j: number, largura: number, raiz: number) => caixa(i, largura, raiz)[1] - caixa(j, largura, raiz)[0];
  const perto = (a: number, b: number, onde: string) => assert.ok(Math.abs(a - b) < 0.3, `${onde}: ${a} e ${b}`);
  perto(sobre(0, 4, 320, 24), 34.8, '05/11 sobre 09/11, 320/150');
  perto(sobre(4, 8, 320, 24), 15.7, '09/11 sobre 13/11, 320/150');
  perto(sobre(0, 4, 360, 24), 21, '05/11 sobre 09/11, 360/150');
  perto(sobre(4, 8, 360, 24), 3.4, '09/11 sobre 13/11, 360/150');
  perto(sobre(0, 4, 320, 20), 10.6, '05/11 sobre 09/11, 320/125');
  perto(sobre(0, 4, 390, 24), 10.6, '05/11 sobre 09/11, 390/150');
  // e nenhuma onde o reteste não viu nenhuma
  for (const [largura, raiz] of [
    [360, 20],
    [390, 20],
    [320, 16],
    [390, 16],
  ])
    assert.ok(sobre(0, 4, largura, raiz) < 0, `${largura}/${raiz}`);
  // agora, abaixo do sm, só a primeira (à esquerda) e a última (à direita): o trilho nunca é mais estreito que a área, e as
  // duas cabem lado a lado em 320, 360 e 390 px com a letra em 100, 125 e 150% (a folga menor, 6,3 px, em 320 com 150%)
  for (const largura of [320, 360, 390])
    for (const raiz of [16, 20, 24]) assert.ok(2 * data(raiz) < area(largura, raiz), `${largura}/${raiz}`);
  assert.ok(Math.abs(area(320, 24) - 2 * data(24) - 6.3) < 0.1);

  // a nota: em 320 com 150%, o cartão de meia tela (com o vão gap-3 entre os dois) deixa 79 px ao texto; a palavra saía 43,8
  // px do parágrafo e 19,8 do cartão (no meio, o respiro do cartão, px-4)
  assert.equal((320 - 2 * 24 - 0.75 * 24) / 2 - 2 * 24, 79);
  assert.ok(Math.abs(43.8 - 24 - 19.8) < 0.01);
});

/* ------------------------------------------------------------------ */
/* O número grande do faturamento no computador (Pacote 18, T2b)        */

test('o número grande do faturamento: do lg para cima a letra segue o cartão (@container e cqi); no celular, a de antes', () => {
  // T2b do reteste de 17-18/11: do lg para cima o cartão tem 1/3 da grade, mas a letra seguia a tela (11vw, e por isso
  // sempre os 3.25rem no computador), e R$ 58.517,68 passava 23,8 px do cartão em 1024 px já com a letra normal
  const cartao = classesDe(
    estatisticas,
    /<div className="([^"]*)">\s*<p className="text-small text-tinta-suave">Faturamento \(menos reembolsos\)<\/p>/,
    'o cartão do faturamento',
  );
  temTodas(
    cartao,
    ['@container', 'col-span-2', 'flex', 'flex-col', 'bg-white', 'px-5', 'py-5', 'lg:col-span-1', 'lg:row-span-2'],
    'o cartão',
  );
  const grande = classesDe(estatisticas, /Faturamento \(menos reembolsos\)<\/p>\s*<p className="([^"]*)">/, 'o faturamento');
  // no celular (abaixo do lg), a letra de antes (Pacotes 12 e 15); do lg para cima, 12cqi, nunca mais que os 3.25rem de antes
  temTodas(grande, ['whitespace-nowrap', 'text-[clamp(min(2.25rem,12vw),11vw,3.25rem)]', 'lg:text-[min(12cqi,3.25rem)]'], 'o faturamento');
  // desde o Pacote 19 (reteste de 22/11), entre as duas, o teto do cartão também abaixo do lg (os testes do fim do arquivo)
  assert.deepEqual(
    grande.filter((c) => c.includes('text-[')),
    [
      'text-[clamp(min(2.25rem,12vw),11vw,3.25rem)]',
      'max-lg:text-[min(clamp(min(2.25rem,12vw),11vw,3.25rem),14cqi)]',
      'lg:text-[min(12cqi,3.25rem)]',
    ],
  );
  // a grade e a página que a conta abaixo usa: max-w-7xl com px-4 e md:px-8; 2 colunas, 3 do lg para cima, com gap-3
  assert.match(estatisticas, /<main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">/);
  assert.match(estatisticas, /<section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Resumo">/);
  // o @container mais perto do número é o do cartão (nenhum outro na página)
  assert.equal(estatisticas.match(/@container/g)?.length, 1);
});

test('a conta do número grande no computador: o modelo dá as sobras do reteste; com 12cqi, R$ 60.405,28 e R$ 1.234.567,89 cabem', () => {
  // o cartão do lg para cima, com o html em `raiz` px: a página (max-w-7xl = 80rem, menos md:px-8 dos dois lados), 1/3 da
  // grade (menos os dois gap-3 de 0.75rem); dentro dele, o respiro px-5 (1.25rem) dos dois lados
  const cartao = (largura: number, raiz: number) => (Math.min(largura, 80 * raiz) - 2 * 2 * raiz - 2 * 0.75 * raiz) / 3;
  const dentro = (largura: number, raiz: number) => cartao(largura, raiz) - 2 * 1.25 * raiz;
  // a letra de antes (clamp(min(2.25rem,12vw),11vw,3.25rem): no computador, sempre os 3.25rem) e a de agora, lida da classe
  // do lg para cima (12cqi, 12% de dentro do cartão, nunca mais que 3.25rem)
  const antes = (largura: number, raiz: number) => Math.max(Math.min(2.25 * raiz, 0.12 * largura), Math.min(0.11 * largura, 3.25 * raiz));
  const doLg = estatisticas.match(/ lg:text-\[min\((\d+(?:\.\d+)?)cqi,(\d+(?:\.\d+)?)rem\)\]/);
  assert.ok(doLg, 'a letra do número do lg para cima');
  const [porCento, teto] = [Number(doLg[1]), Number(doLg[2])];
  assert.deepEqual([porCento, teto], [12, 3.25]);
  const agora = (largura: number, raiz: number) => Math.min((porCento / 100) * dentro(largura, raiz), teto * raiz);
  // A letra do painel é a do sistema (o layout do painel não carrega o Barlow): no Windows da bancada, o Segoe UI em negrito.
  // R$ 58.517,68 e R$ 60.405,28 medem 6,0723 vezes a letra (a bancada: 315,8 px com 52 px de letra), e R$ 1.234.567,89, 7,4937
  const numeros: [string, number][] = [
    ['R$ 60.405,28', 6.0723],
    ['R$ 1.234.567,89', 7.4937],
  ];
  // as medidas do reteste (telas/saida/057-t2-numero-grande-no-computador/resultado.json): a largura do cartão e quanto o
  // número passava dele, com a letra em 100, 125 e 150%
  const RETESTE: Record<number, [number, number][]> = {
    1024: [
      [312, 23.8],
      [304.7, 115],
      [297.3, 206.3],
    ],
    1280: [
      [397.3, 0],
      [390, 29.7],
      [382.7, 121],
    ],
    1366: [
      [397.3, 0],
      [418.7, 1],
      [411.3, 92.3],
    ],
    1440: [
      [397.3, 0],
      [443.3, 0],
      [436, 67.6],
    ],
  };
  const raizes = [16, 20, 24];
  for (const [largura, medidas] of Object.entries(RETESTE)) {
    raizes.forEach((raiz, n) => {
      const l = Number(largura);
      const onde = `${largura}/${raiz}`;
      const [larguraDoCartao, passava] = medidas[n];
      // (1) o modelo dá o cartão e a sobra que o reteste mediu com a letra de antes (a sobra conta da borda do cartão)
      assert.ok(Math.abs(cartao(l, raiz) - larguraDoCartao) < 0.1, onde);
      const sobra = Math.max(0, 1.25 * raiz + 6.0723 * antes(l, raiz) - cartao(l, raiz));
      assert.ok(Math.abs(sobra - passava) < 0.2, `${onde}: ${sobra}`);
      // (2) agora os dois números cabem dentro do cartão, sem chegar nem no respiro dele
      for (const [numero, vezes] of numeros) assert.ok(vezes * agora(l, raiz) <= dentro(l, raiz), `${numero} em ${onde}`);
    });
  }
  // com 12cqi, a largura do número é 12% de dentro do cartão vezes a medida dele: cabe qualquer número de até 8,33 vezes a
  // letra, em qualquer tela e letra (R$ 1.234.567,89 no Segoe UI mede 7,49; uma letra do sistema 10% mais larga ainda cabe)
  assert.ok((7.4937 * porCento) / 100 < 1 && (7.4937 * 1.1 * porCento) / 100 < 1);
  // a letra continua grande: no mínimo 28,5 px (1024 px com a letra em 150%) e 32,6 com a letra normal
  assert.equal(Math.round(agora(1024, 24) * 10) / 10, 28.5);
  assert.equal(Math.round(agora(1024, 16) * 10) / 10, 32.6);
});

/* ------------------------------------------------------------------ */
/* O painel e as estatísticas no reteste de 22/11 (Pacote 19)           */

test('o cabeçalho do painel: o bloco do título encolhe e a linha do pagamento online quebra em qualquer ponto', () => {
  // Com a chave da Stripe posta e o interruptor desligado, a linha diz "Stripe (teste), interruptor PAGAMENTO_ONLINE
  // desligado": a palavra "PAGAMENTO_ONLINE" não tinha onde quebrar, o bloco do título não encolhia abaixo dela e a página
  // rolava 19 px de lado em 320 px com a letra em 150% (o emblema de 3rem e o vão de 1rem, 96 px, mais a palavra, uns 195
  // px, contra os 272 px da tela menos a margem)
  assert.match(painel, /: 'interruptor PAGAMENTO_ONLINE desligado';/);
  const linha = classesDe(
    painel,
    /<p className="([^"]*)">\s*Pagamento online: \{textoPagamentoOnline\(\)\} · Pedidos em: \{ondeFicamAsReservas\(\)\}\s*<\/p>/,
    'a linha do pagamento online',
  );
  temTodas(linha, ['text-small', 'text-tinta-suave', '[overflow-wrap:anywhere]'], 'a linha do pagamento online');
  // o bloco do título (o título e a linha) pode ficar mais estreito que a palavra mais longa da linha
  const bloco = classesDe(
    painel,
    /<div className="([^"]*)">\s*<h1 className="text-2xl font-bold">Pedidos<\/h1>\s*<p className="[^"]*">\s*Pagamento online:/,
    'o bloco do título',
  );
  assert.deepEqual(bloco, ['min-w-0']);
  // nada na linha nem no título impede a quebra
  assert.doesNotMatch(linha.join(' '), /whitespace-nowrap|text-nowrap|truncate|break-normal/);
  // a conta: em 320 px com a letra em 150% (o html em 24 px), a página (px-4) deixa 272 px; o emblema (size-12) e o vão
  // (gap-4) levam 96; sobram 176 px para o bloco do título, menos que os cerca de 195 px da palavra. Por isso a linha tem
  // de poder quebrar dentro dela
  assert.match(painel, /<main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">/);
  assert.match(painel, /<img src="\/logo\/orla-nativa-emblema\.svg" alt="" width=\{48\} height=\{48\} className="size-12" \/>/);
  assert.match(
    painel,
    /<header className="flex flex-wrap items-center justify-between gap-4">\s*<div className="flex items-center gap-4">/,
  );
  const raiz = 24;
  const tela = 320 - 2 * raiz;
  assert.equal(tela, 272);
  assert.equal(tela - 3 * raiz - raiz, 176);
  assert.ok(176 < 195 && 3 * raiz + raiz + 195 - tela === 19, 'os 19 px que a página rolava de lado');
});

/** A letra do número grande com a regra só da tela, clamp(min(2.25rem,12vw),11vw,3.25rem), numa tela de `largura` px. */
const letraPelaTela = (largura: number, raiz: number) =>
  Math.max(Math.min(2.25 * raiz, 0.12 * largura), Math.min(0.11 * largura, 3.25 * raiz));
/** Abaixo do lg, o cartão do faturamento tem a tela menos a margem da página (px-4 dos dois lados). */
const cartaoNoCelular = (largura: number, raiz: number) => largura - 2 * raiz;
/** Dentro do cartão (sem o respiro px-5 dos dois lados): é o que o cqi mede. */
const dentroNoCelular = (largura: number, raiz: number) => cartaoNoCelular(largura, raiz) - 2 * 1.25 * raiz;
/**
 * Quantas vezes a letra mede cada número no Segoe UI em negrito (a letra do painel no Windows da bancada, no Chromium e no
 * WebKit): as medidas do conferente das telas no reteste de 22/11 (telas-conferencia/saida/90-c2-numero-maior-imitado).
 * Os algarismos têm todos a mesma largura ("R$ 100.000,00" e "R$ 987.654,32" mediram igual): "R$ 9.999.999,99" mede o
 * mesmo que "R$ 1.234.567,89", e "R$ 999.999,99", o mesmo que "R$ 100.000,00".
 */
const VEZES_A_LETRA = { 'R$ 99.999,99': 6.0723, 'R$ 999.999,99': 6.648, 'R$ 9.999.999,99': 7.4944 };

test('o número grande do faturamento no celular: a regra de antes na frente e, abaixo do lg, o teto de 14% de dentro do cartão', () => {
  const grande = classesDe(estatisticas, /Faturamento \(menos reembolsos\)<\/p>\s*<p className="([^"]*)">/, 'o faturamento');
  // a regra só da tela continua lá, sem variante: é o que vale no navegador que não conhece o cqi
  assert.ok(grande.includes('text-[clamp(min(2.25rem,12vw),11vw,3.25rem)]'), grande.join(' '));
  // abaixo do lg, a mesma regra, letra por letra, nunca mais que N cqi; do lg para cima, a do Pacote 18, sem mudar
  const doCelular = grande.filter((c) => c.startsWith('max-lg:'));
  assert.equal(doCelular.length, 1, grande.join(' '));
  const teto = doCelular[0].match(/^max-lg:text-\[min\((clamp\(min\(2\.25rem,12vw\),11vw,3\.25rem\)),(\d+(?:\.\d+)?)cqi\)\]$/);
  assert.ok(teto, doCelular[0]);
  assert.ok(grande.includes(`text-[${teto[1]}]`), 'a regra dentro do min é a da frente');
  assert.equal(Number(teto[2]), 14);
  assert.ok(grande.includes('lg:text-[min(12cqi,3.25rem)]'), grande.join(' '));
  // o cqi mede o cartão do faturamento: é ele o @container, e o número é filho direto dele
  assert.match(
    estatisticas,
    /<div className="@container col-span-2 [^"]*">\s*<p className="text-small text-tinta-suave">Faturamento \(menos reembolsos\)<\/p>\s*<p className="[^"]*max-lg:text-\[/,
  );
  assert.equal(estatisticas.match(/@container/g)?.length, 1);
  // abaixo do lg o cartão ocupa as duas colunas da grade, e a página tem px-4 de cada lado
  assert.match(estatisticas, /<main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">/);
  assert.match(
    estatisticas,
    /<div className="@container col-span-2 flex flex-col justify-center bg-white px-5 py-5 lg:col-span-1 lg:row-span-2">/,
  );
});

test('a conta do número grande no celular: o modelo dá as sobras do reteste; com 14cqi, R$ 9.999.999,99 fica dentro do cartão e a letra de 390 px não muda', () => {
  const N = 14;
  const agora = (largura: number, raiz: number) => Math.min(letraPelaTela(largura, raiz), (N / 100) * dentroNoCelular(largura, raiz));
  const raizes = [16, 20, 24];
  // as medidas do reteste de 22/11, com a letra em 100, 125 e 150%: a letra do número, a largura do cartão e quanto
  // "R$ 100.000,00" e "R$ 1.234.567,89" passavam dele (o número começa depois do respiro de 1.25rem)
  const RETESTE: Record<number, [number, number, number, number][]> = {
    320: [
      [36, 288, 0, 1.8],
      [38.4, 280, 0.3, 32.8],
      [38.4, 272, 13.3, 45.8],
    ],
    360: [
      [39.6, 328, 0, 0],
      [43.2, 320, 0, 28.7],
      [43.2, 312, 5.2, 41.7],
    ],
    390: [
      [42.9, 358, 0, 0],
      [45, 350, 0, 12.2],
      [46.8, 342, 0, 38.7],
    ],
  };
  const passa = (largura: number, raiz: number, letra: number, vezes: number) =>
    Math.max(0, 1.25 * raiz + vezes * letra - cartaoNoCelular(largura, raiz));
  for (const [texto, medidas] of Object.entries(RETESTE)) {
    const largura = Number(texto);
    raizes.forEach((raiz, n) => {
      const onde = `${largura}/${raiz}`;
      const [letra, cartao, passava100mil, passava1milhao] = medidas[n];
      // (1) o modelo dá a letra, o cartão e as duas sobras que o reteste mediu com a regra só da tela
      assert.ok(Math.abs(letraPelaTela(largura, raiz) - letra) < 0.05, onde);
      assert.equal(cartaoNoCelular(largura, raiz), cartao, onde);
      assert.ok(Math.abs(passa(largura, raiz, letraPelaTela(largura, raiz), VEZES_A_LETRA['R$ 999.999,99']) - passava100mil) < 0.1, onde);
      assert.ok(
        Math.abs(passa(largura, raiz, letraPelaTela(largura, raiz), VEZES_A_LETRA['R$ 9.999.999,99']) - passava1milhao) < 0.1,
        onde,
      );
      // (2) agora nenhum dos três passa do cartão (nem a página rola de lado: o cartão acaba antes da margem da página), com
      // pelo menos 7 px de folga até a borda no maior deles
      for (const [numero, vezes] of Object.entries(VEZES_A_LETRA))
        assert.equal(passa(largura, raiz, agora(largura, raiz), vezes), 0, `${numero} em ${onde}`);
      const folga = cartaoNoCelular(largura, raiz) - 1.25 * raiz - VEZES_A_LETRA['R$ 9.999.999,99'] * agora(largura, raiz);
      assert.ok(folga >= 7, `${onde}: ${folga}`);
      // e até R$ 999.999,99 o número nem entra no respiro do cartão
      assert.ok(VEZES_A_LETRA['R$ 999.999,99'] * agora(largura, raiz) <= dentroNoCelular(largura, raiz), onde);
      // a letra nunca cresce: é a de antes ou o teto
      assert.ok(agora(largura, raiz) <= letraPelaTela(largura, raiz), onde);
    });
  }
  // (3) com a letra normal, em 390 px a letra é a de antes para qualquer valor (o teto, 14% de 318 px, fica acima dos 42,9
  // px), e também nos outros celulares comuns, de 336 px para cima
  assert.equal(agora(390, 16), letraPelaTela(390, 16));
  assert.equal(Math.round(agora(390, 16) * 10) / 10, 42.9);
  assert.equal(Math.round((N / 100) * dentroNoCelular(390, 16) * 100) / 100, 44.52);
  for (const largura of [340, 360, 375, 390, 393, 412, 430, 768, 1023])
    assert.equal(agora(largura, 16), letraPelaTela(largura, 16), `${largura}/100`);
  // (a conta dá 336 px cravados: 14% de dentro do cartão empata com os 11vw; em 335 px o teto já segura)
  assert.ok((N / 100) * dentroNoCelular(335, 16) < letraPelaTela(335, 16));
  // só no celular mais estreito a letra normal encolhe, e pouco: em 320 px, de 36 para 34,7 px
  assert.equal(Math.round(agora(320, 16) * 10) / 10, 34.7);
  // (4) de onde sai o 14: as duas condições juntas deixam o teto entre 13,5 e 14,4 cqi. Menos que isso mexe na letra de
  // hoje em 390 px com a letra normal (13cqi dá 41,3 px, abaixo dos 42,9); mais que isso deixa R$ 9.999.999,99 passar do
  // cartão em 320 px com a letra normal. O 14 fica no meio, com folga dos dois lados
  const minimo = (letraPelaTela(390, 16) / dentroNoCelular(390, 16)) * 100;
  const maximo = Math.min(
    ...[320, 360, 390].flatMap((largura) =>
      raizes
        // onde a regra só da tela já cabe no cartão, o teto não precisa segurar nada
        .filter((raiz) => passa(largura, raiz, letraPelaTela(largura, raiz), VEZES_A_LETRA['R$ 9.999.999,99']) > 0)
        .map(
          (raiz) =>
            ((cartaoNoCelular(largura, raiz) - 1.25 * raiz) / VEZES_A_LETRA['R$ 9.999.999,99'] / dentroNoCelular(largura, raiz)) * 100,
        ),
    ),
  );
  assert.equal(Math.round(minimo * 100) / 100, 13.49);
  assert.equal(Math.round(maximo * 100) / 100, 14.42);
  assert.ok(minimo < N && N < maximo);
  assert.ok(0.13 * dentroNoCelular(390, 16) < letraPelaTela(390, 16), 'com 13cqi a letra de 390 px mudaria');
  assert.ok(
    passa(320, 16, Math.min(letraPelaTela(320, 16), 0.15 * dentroNoCelular(320, 16)), VEZES_A_LETRA['R$ 9.999.999,99']) > 0,
    'com 15cqi passaria em 320 px',
  );
  // (5) uma letra do sistema 2% mais larga que a da bancada ainda deixa R$ 9.999.999,99 dentro do cartão em toda a matriz
  for (const largura of [320, 360, 390])
    for (const raiz of raizes)
      assert.equal(passa(largura, raiz, agora(largura, raiz), VEZES_A_LETRA['R$ 9.999.999,99'] * 1.02), 0, `${largura}/${raiz}`);
});
