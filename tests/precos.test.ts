import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarMargem, calcular, faixasIdade, normalizarPessoas, type TabelaPreco } from '../src/lib/orcamento.ts';
import { textoPessoas } from '../src/lib/pessoas.ts';
import { CATEGORIAS, CIDADES, CRIANCAS_PADRAO, MARGEM_PERCENTUAL, PASSEIOS } from '../src/data/passeios.ts';

test('margem padrão é 10%', () => {
  assert.equal(MARGEM_PERCENTUAL, 10);
});

test('preço de venda = parceiro + 10% (exemplos do cliente)', () => {
  assert.equal(aplicarMargem(100, 10), 11000);
  assert.equal(aplicarMargem(265, 10), 29150);
  assert.equal(aplicarMargem(70, 10), 7700);
});

test('os 21 passeios da lista do parceiro mantêm o preço da lista', () => {
  const esperado: Record<string, number> = {
    'full-day-buzios': 240,
    'city-tour-buzios': 190,
    'catamara-buzios': 110,
    'escuna-buzios': 70,
    'trolley-buzios': 100,
    'buggy-buzios': 100,
    'quadriciclo-buzios': 280,
    'helicoptero-buzios': 450,
    'full-day-arraial-do-cabo': 265,
    'city-tour-arraial-do-cabo': 240,
    'barco-arraial-do-cabo': 90,
    'mergulho-arraial-do-cabo': 250,
    'buggy-arraial-do-cabo': 150,
    'quadriciclo-arraial-do-cabo': 250,
    'city-tour-cabo-frio': 230,
    'catamara-cabo-frio': 100,
    'buggy-cabo-frio': 150,
    'quadriciclo-cabo-frio': 270,
    'city-tour-rio-de-janeiro': 380,
  };
  for (const [slug, preco] of Object.entries(esperado)) {
    const p = PASSEIOS.find((x) => x.slug === slug);
    assert.ok(p, slug);
    assert.equal(p.precoParceiro, preco, slug);
    assert.equal(p.origemPreco, 'parceiro', slug);
  }
  // lancha (R$ 400) e jet ski (R$ 700) da lista viraram opções por tempo
  const lancha = PASSEIOS.find((x) => x.slug === 'lancha-buzios')!;
  assert.deepEqual(
    lancha.opcoes?.map((o) => o.precoParceiro),
    [800, 1600],
  );
  const jet = PASSEIOS.find((x) => x.slug === 'jet-ski-buzios')!;
  assert.ok(jet.opcoes?.some((o) => o.precoParceiro === 700));
});

test('catálogo com 26 passeios, incluindo lanchas em Arraial e Cabo Frio', () => {
  assert.equal(PASSEIOS.length, 26);
  for (const slug of ['lancha-privativa-arraial-do-cabo', 'lancha-privativa-cabo-frio', 'escuna-cabo-frio', 'full-day-cabo-frio']) {
    const p = PASSEIOS.find((x) => x.slug === slug);
    assert.ok(p, slug);
    assert.equal(p.origemPreco, 'pesquisa', slug);
  }
});

test('dados completos nos três idiomas', () => {
  const slugs = new Set<string>();
  for (const p of PASSEIOS) {
    assert.ok(!slugs.has(p.slug), `slug repetido ${p.slug}`);
    slugs.add(p.slug);
    assert.ok(CIDADES[p.cidade], p.slug);
    assert.ok(CATEGORIAS[p.categoria], p.slug);
    if (p.unidade !== 'pessoa') assert.ok((p.capacidadePorUnidade ?? 0) > 0, `${p.slug} sem capacidade`);
    if (p.opcoes) {
      assert.ok(p.opcoes.length >= 2, `${p.slug}: opções`);
      assert.equal(p.precoParceiro, Math.min(...p.opcoes.map((o) => o.precoParceiro)), `${p.slug}: preço = opção mais barata`);
    }
    for (const l of ['pt', 'en', 'es'] as const) {
      for (const campo of ['nome', 'resumo', 'descricao', 'duracao'] as const) assert.ok(p[campo][l]?.trim(), `${p.slug}.${campo}.${l}`);
      for (const campo of ['inclui', 'naoInclui', 'roteiro', 'levar'] as const) assert.ok(p[campo][l]?.length, `${p.slug}.${campo}.${l}`);
      for (const o of p.opcoes ?? []) assert.ok(o.nome[l]?.trim(), `${p.slug}.opcao.${o.id}.${l}`);
    }
  }
});

const ESCUNA: TabelaPreco = { unidade: 'pessoa', precoCentavos: 7700, criancas: { gratisAte: 5, meiaAte: 10 } };

test('faixas de idade: até 5 grátis, 6 a 10 meia, 11+ inteira', () => {
  assert.deepEqual(faixasIdade({ gratisAte: 5, meiaAte: 10 }), { gratis: [0, 5], meia: [6, 10], inteiraDesde: 11 });
  assert.deepEqual(faixasIdade(CRIANCAS_PADRAO), { gratis: [0, 5], meia: undefined, inteiraDesde: 6 });
  assert.deepEqual(faixasIdade({ gratisAte: null }), { gratis: undefined, meia: undefined, inteiraDesde: 0 });
});

test('por pessoa: adulto inteira, criança meia, criança pequena grátis', () => {
  const o = calcular(ESCUNA, { adultos: 2, criancasMeia: 1, criancasGratis: 1 });
  assert.equal(o.totalCentavos, 2 * 7700 + 3850);
  assert.equal(o.pessoas, 4);
  assert.deepEqual(
    o.linhas.map((l) => [l.tipo, l.quantidade, l.subtotalCentavos]),
    [
      ['adulto', 2, 15400],
      ['meia', 1, 3850],
      ['gratis', 1, 0],
    ],
  );
});

test('sem meia no passeio: a criança de 6 a 10 paga inteira; sem grátis: todos pagam', () => {
  const buggy: TabelaPreco = { unidade: 'pessoa', precoCentavos: 11000, criancas: { gratisAte: 5 } };
  assert.equal(calcular(buggy, { adultos: 2, criancasMeia: 1, criancasGratis: 1 }).totalCentavos, 3 * 11000);
  const helicoptero: TabelaPreco = { unidade: 'pessoa', precoCentavos: 49500, criancas: { gratisAte: null } };
  assert.deepEqual(normalizarPessoas(helicoptero, { adultos: 1, criancasMeia: 1, criancasGratis: 1 }), {
    adultos: 3,
    criancasMeia: 0,
    criancasGratis: 0,
  });
  assert.equal(calcular(helicoptero, { adultos: 1, criancasMeia: 1, criancasGratis: 1 }).totalCentavos, 3 * 49500);
});

test('por veículo/embarcação: arredonda para cima, contando as crianças', () => {
  const quad: TabelaPreco = { unidade: 'veiculo', capacidadePorUnidade: 2, precoCentavos: 30800, criancas: { gratisAte: null } };
  assert.equal(calcular(quad, { adultos: 1 }).totalCentavos, 30800);
  assert.equal(calcular(quad, { adultos: 2 }).totalCentavos, 30800);
  assert.equal(calcular(quad, { adultos: 3 }).unidades, 2);
  assert.equal(calcular(quad, { adultos: 3 }).totalCentavos, 61600);
  assert.equal(calcular(quad, { adultos: 2, criancasGratis: 1 }).unidades, 2);
  const lancha: TabelaPreco = { unidade: 'embarcacao', capacidadePorUnidade: 6, precoCentavos: 88000, criancas: { gratisAte: null } };
  assert.equal(calcular(lancha, { adultos: 4, criancasMeia: 2 }).unidades, 1);
  assert.equal(calcular(lancha, { adultos: 7 }).totalCentavos, 176000);
});

test('texto das pessoas para voucher e WhatsApp', () => {
  const r = {
    pessoa: 'pessoa',
    pessoas: 'pessoas',
    adulto: 'adulto',
    adultos: 'adultos',
    crianca: 'criança',
    criancas: 'crianças',
    criancaMeia: 'criança (meia)',
    criancasMeia: 'crianças (meia)',
    criancaGratis: 'criança (grátis)',
    criancasGratis: 'crianças (grátis)',
  };
  assert.equal(textoPessoas({ adultos: 2, criancasMeia: 1, criancasGratis: 0 }, r), '2 adultos + 1 criança (meia)');
  assert.equal(textoPessoas({ adultos: 3, criancasMeia: 0, criancasGratis: 0 }, r, true), '3 pessoas');
  // reserva antiga, só com o total de crianças
  assert.equal(textoPessoas({ adultos: 1, criancas: 2 }, r), '1 adulto + 2 crianças');
});
