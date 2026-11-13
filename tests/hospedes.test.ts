import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_PARA_APAGAR_HOSPEDES,
  EsquemaHospede,
  EsquemaHospedes,
  apagarHospedesEm,
  hospedeDeLinha,
  linhaDeHospede,
} from '../src/lib/hospedes.ts';
import type { Tables } from '../src/lib/banco-tipos.ts';

// hóspedes fictícios, só para conferir as regras

test('o cadastro sai 30 dias depois da saída', () => {
  assert.equal(DIAS_PARA_APAGAR_HOSPEDES, 30);
  assert.equal(apagarHospedesEm('2027-01-02'), '2027-02-01');
  assert.equal(apagarHospedesEm('2027-02-10'), '2027-03-12');
});

test('cada hóspede: nome completo, tipo e número do documento e, se vier de carro, a placa', () => {
  const ok = EsquemaHospede.parse({ nome: '  Ana   Pérez ', documentoTipo: 'dni', documentoNumero: ' 30.123.456 ', placa: ' ab 123 cd ' });
  assert.deepEqual(ok, { nome: 'Ana Pérez', documentoTipo: 'dni', documentoNumero: '30.123.456', placa: 'AB123CD' });
  assert.equal(EsquemaHospede.safeParse({ nome: 'Jo', documentoTipo: 'dni', documentoNumero: '123' }).success, false);
  assert.equal(EsquemaHospede.safeParse({ nome: 'João Silva', documentoTipo: 'cnh', documentoNumero: '123' }).success, false);
  assert.equal(EsquemaHospede.safeParse({ nome: 'João Silva', documentoTipo: 'rut', documentoNumero: '12.345.678-5' }).success, true);
  assert.equal(EsquemaHospede.safeParse({ nome: 'João Silva', documentoTipo: 'cpf', documentoNumero: '123<script>' }).success, false);
  assert.equal(
    EsquemaHospede.safeParse({ nome: 'João Silva', documentoTipo: 'cpf', documentoNumero: '12345678900', placa: 'X1' }).success,
    false,
  );
  assert.equal(
    EsquemaHospede.safeParse({ nome: 'João Silva', documentoTipo: 'passaporte', documentoNumero: 'AB123456', placa: '' }).success,
    true,
  );
  assert.equal(EsquemaHospedes.safeParse([]).success, false);
});

test('o hóspede vira a linha da tabela e volta igual', () => {
  const h = EsquemaHospede.parse({ nome: 'Ana Pérez', documentoTipo: 'dni', documentoNumero: '30123456', placa: '' });
  const linha = linhaDeHospede('item', h, 2);
  assert.deepEqual(linha, {
    item_pedido_id: 'item',
    ordem: 2,
    nome: 'Ana Pérez',
    documento_tipo: 'dni',
    documento_numero: '30123456',
    placa: null,
  });
  const volta = hospedeDeLinha({ ...linha, id: 'id', criado_em: '', atualizado_em: '' } as Tables<'casas_hospedes'>);
  assert.deepEqual(volta, { nome: 'Ana Pérez', documentoTipo: 'dni', documentoNumero: '30123456' });
});
