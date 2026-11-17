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
    /<div className="flex flex-wrap items-start justify-between gap-3 lg:col-span-12">\s*<Acoes p=\{p\} filtro=\{filtro\} \/>/,
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
