import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PONTO_PRESO, semQuebraNoPonto } from '../src/lib/ponto.ts';

const NBSP = '\u00a0';

test('o "·" fica preso às palavras dos dois lados por espaços que não quebram', () => {
  assert.equal(PONTO_PRESO, `${NBSP}·${NBSP}`);
  assert.equal(semQuebraNoPonto('por veículo · 2 pessoas'), `por veículo${NBSP}·${NBSP}2 pessoas`);
  // cada "·" do texto, não só o primeiro
  assert.equal(
    semQuebraNoPonto('Contém dados do Copernicus · Praias: © OpenStreetMap · 2025'),
    `Contém dados do Copernicus${NBSP}·${NBSP}Praias: © OpenStreetMap${NBSP}·${NBSP}2025`,
  );
});

test('texto sem " · " passa igual', () => {
  assert.equal(semQuebraNoPonto('por pessoa'), 'por pessoa');
  assert.equal(semQuebraNoPonto(''), '');
  // o "·" sem espaço dos dois lados não é separador: fica como está
  assert.equal(semQuebraNoPonto('a·b'), 'a·b');
});
