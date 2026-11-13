import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PONTO_PRESO, partesDoPonto, semQuebraNoPonto } from '../src/lib/ponto.ts';

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

test('partesDoPonto: o começo, a última palavra antes do "·" e a parte da direita', () => {
  assert.deepEqual(partesDoPonto(`Lancha Privada en Búzios${PONTO_PRESO}4 horas`), {
    comeco: 'Lancha Privada en',
    ultima: 'Búzios',
    direita: '4 horas',
  });
  assert.deepEqual(partesDoPonto(`Volta: qui., 26 de nov. de 2026${PONTO_PRESO}14h`), {
    comeco: 'Volta: qui., 26 de nov. de',
    ultima: '2026',
    direita: '14h',
  });
  // uma palavra só antes do "·": nada no começo
  assert.deepEqual(partesDoPonto(`Búzios${PONTO_PRESO}4 horas`), { comeco: '', ultima: 'Búzios', direita: '4 horas' });
  // sem o "·" preso, ou com mais de um: não se separa
  assert.equal(partesDoPonto('2 pessoas'), null);
  assert.equal(partesDoPonto('por veículo · 2 pessoas'), null);
  assert.equal(partesDoPonto(`a${PONTO_PRESO}b${PONTO_PRESO}c`), null);
});
