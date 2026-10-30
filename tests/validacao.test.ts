import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cartaoValido,
  cpfValido,
  dataPasseioValida,
  passaporteValido,
  somarDias,
  telefoneValido,
  validadeCartaoValida,
} from '../src/lib/validacao.ts';
import { codigoValido, gerarCodigo } from '../src/lib/reservas.ts';

test('CPF', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('52998224725'), true);
  assert.equal(cpfValido('111.111.111-11'), false);
  assert.equal(cpfValido('529.982.247-26'), false);
  assert.equal(cpfValido('123'), false);
});

test('passaporte', () => {
  assert.equal(passaporteValido('AAB123456'), true);
  assert.equal(passaporteValido('X1234567'), true);
  assert.equal(passaporteValido('12'), false);
});

test('telefone internacional', () => {
  assert.equal(telefoneValido('55', '21 99050-2377'), true);
  assert.equal(telefoneValido('55', '2199050'), false);
  assert.equal(telefoneValido('54', '9 11 1234 5678'), true);
  assert.equal(telefoneValido('1', '212 555 0100'), true);
});

test('data do passeio: de hoje até 1 ano', () => {
  const agora = new Date('2026-10-29T15:00:00Z');
  assert.equal(dataPasseioValida('2026-10-29', agora), true);
  assert.equal(dataPasseioValida('2026-10-28', agora), false);
  assert.equal(dataPasseioValida(somarDias('2026-10-29', 400), agora), false);
  assert.equal(dataPasseioValida('2026-02-30', agora), false);
});

test('cartão (Luhn) e validade', () => {
  assert.equal(cartaoValido('4000 0000 0000 0010'), true);
  assert.equal(cartaoValido('4000 0000 0000 0011'), false);
  const agora = new Date('2026-10-29T00:00:00Z');
  assert.equal(validadeCartaoValida(10, 26, agora), true);
  assert.equal(validadeCartaoValida(9, 26, agora), false);
  assert.equal(validadeCartaoValida(13, 30, agora), false);
});

test('código do voucher: formato ON-XXXXXX e sem repetição na amostra', () => {
  const vistos = new Set<string>();
  for (let i = 0; i < 20000; i++) {
    const c = gerarCodigo();
    assert.ok(c.startsWith('ON-'), c);
    assert.ok(codigoValido(c), c);
    assert.ok(!/[01IO]/.test(c.slice(3)), c);
    vistos.add(c);
  }
  assert.ok(vistos.size > 19990);
  // reservas feitas antes da troca de marca continuam abrindo
  assert.ok(codigoValido('VH-7K3P9Q'));
  assert.ok(!codigoValido('XX-7K3P9Q'));
});
