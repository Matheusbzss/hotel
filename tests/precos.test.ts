import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarMargem, calcular } from '../src/lib/orcamento.ts';
import { CATEGORIAS, CIDADES, MARGEM_PERCENTUAL, PASSEIOS } from '../src/data/passeios.ts';

test('margem padrão é 10%', () => {
  assert.equal(MARGEM_PERCENTUAL, 10);
});

test('preço de venda = parceiro + 10% (exemplos do cliente)', () => {
  assert.equal(aplicarMargem(100, 10), 11000);
  assert.equal(aplicarMargem(265, 10), 29150);
  assert.equal(aplicarMargem(70, 10), 7700);
});

test('os 21 passeios têm os preços de parceiro da lista do cliente', () => {
  const esperado: Record<string, number> = {
    'full-day-buzios': 240,
    'city-tour-buzios': 190,
    'catamara-buzios': 110,
    'escuna-buzios': 70,
    'trolley-buzios': 100,
    'buggy-buzios': 100,
    'quadriciclo-buzios': 280,
    'lancha-buzios': 400,
    'jet-ski-buzios': 700,
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
  assert.equal(PASSEIOS.length, 21);
  for (const p of PASSEIOS) assert.equal(p.precoParceiro, esperado[p.slug], p.slug);
});

test('dados completos nos três idiomas', () => {
  const slugs = new Set<string>();
  for (const p of PASSEIOS) {
    assert.ok(!slugs.has(p.slug), `slug repetido ${p.slug}`);
    slugs.add(p.slug);
    assert.ok(CIDADES[p.cidade], p.slug);
    assert.ok(CATEGORIAS[p.categoria], p.slug);
    if (p.unidade !== 'pessoa') assert.ok((p.capacidadePorUnidade ?? 0) > 0, `${p.slug} sem capacidade`);
    for (const l of ['pt', 'en', 'es'] as const) {
      for (const campo of ['nome', 'resumo', 'descricao', 'duracao'] as const) assert.ok(p[campo][l]?.trim(), `${p.slug}.${campo}.${l}`);
      for (const campo of ['inclui', 'naoInclui', 'roteiro', 'levar'] as const) assert.ok(p[campo][l]?.length, `${p.slug}.${campo}.${l}`);
    }
  }
});

test('por pessoa: adultos + crianças', () => {
  const t = { unidade: 'pessoa' as const, precoAdultoCentavos: 7700, precoCriancaCentavos: 7700 };
  const o = calcular(t, 2, 1);
  assert.equal(o.totalCentavos, 23100);
  assert.equal(o.pessoas, 3);
});

test('por veículo: arredonda para cima pela capacidade', () => {
  const t = { unidade: 'veiculo' as const, capacidadePorUnidade: 2, precoAdultoCentavos: 30800, precoCriancaCentavos: 30800 };
  assert.equal(calcular(t, 1, 0).totalCentavos, 30800);
  assert.equal(calcular(t, 2, 0).totalCentavos, 30800);
  assert.equal(calcular(t, 3, 0).unidades, 2);
  assert.equal(calcular(t, 3, 0).totalCentavos, 61600);
  assert.equal(calcular(t, 2, 2).unidades, 2);
});
