import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ehDiaInteiro, faixaDuracao, horasCurtas, horasDoTexto } from '../src/lib/duracao.ts';
import { PASSEIOS } from '../src/data/passeios.ts';

test('lê as durações do cadastro', () => {
  assert.equal(horasDoTexto('2h30'), 2.5);
  assert.equal(horasDoTexto('3 horas'), 3);
  assert.equal(horasDoTexto('2 ou 4 horas'), 2);
  assert.equal(horasDoTexto('30 minutos ou 1 hora'), 0.5);
  assert.equal(horasDoTexto('Cerca de 10 minutos de voo'), 10 / 60);
  assert.equal(horasDoTexto('Cerca de 6 horas (10h às 16h)'), 6);
  assert.equal(horasDoTexto('Cerca de 3 h 30 (com traslado)'), 3.5);
  assert.equal(horasDoTexto('Dia inteiro (cerca de 9 horas)'), 9);
});

test('faixa de cor pela parte do dia que o passeio ocupa', () => {
  assert.equal(faixaDuracao(0.5), 'd1');
  assert.equal(faixaDuracao(2.5), 'd2');
  assert.equal(faixaDuracao(4), 'd3');
  assert.equal(faixaDuracao(7), 'd4');
  assert.equal(faixaDuracao(9), 'd5');
  assert.equal(faixaDuracao(6, true), 'd5');
});

test('texto curto da célula de horas', () => {
  assert.equal(horasCurtas(0.5, 'día'), '30 min');
  assert.equal(horasCurtas(2.5, 'día'), '2h30');
  assert.equal(horasCurtas(3, 'día'), '3 h');
  assert.equal(horasCurtas(9, 'día', true), 'día');
});

test('todo passeio ativo tem uma duração legível', () => {
  for (const p of PASSEIOS) {
    const h = horasDoTexto(p.duracao.pt);
    assert.ok(h !== null || ehDiaInteiro(p.duracao.pt), `${p.slug}: "${p.duracao.pt}"`);
  }
});
