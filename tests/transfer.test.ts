import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LUGARES,
  cabeNaVan,
  cabeNoCarro,
  menorPrecoDaZona,
  precoTrecho,
  primeiroDiaTransfer,
  totalTransfer,
  transferComAntecedencia,
} from '../src/data/transfer.ts';
import { ANTECEDENCIA_MINIMA_MINUTOS, ANTECEDENCIA_TRANSFER_MINUTOS } from '../src/lib/horarios.ts';

const SEM_MALAS = { grandes: 0, medias: 0, mao: 0 };

/** A hora de Búzios (UTC-3 o ano todo) como um instante: as('2026-11-15T22:00') são as 22h00 de 15/11 em Búzios. */
const as = (dataHora: string) => new Date(`${dataHora}:00-03:00`);

test('preços fixos por trecho e por veículo (tabela da Etapa 6)', () => {
  for (const rio of ['galeao', 'santos-dumont', 'rio-de-janeiro'] as const) {
    for (const lagos of ['buzios', 'cabo-frio', 'arraial-do-cabo'] as const) {
      assert.equal(precoTrecho(rio, lagos, 'carro'), 800);
      assert.equal(precoTrecho(lagos, rio, 'carro'), 800);
      assert.equal(precoTrecho(rio, lagos, 'van'), 1200);
    }
  }
  for (const lagos of ['buzios', 'cabo-frio', 'arraial-do-cabo'] as const) {
    assert.equal(precoTrecho('aeroporto-cabo-frio', lagos, 'carro'), 300);
    assert.equal(precoTrecho(lagos, 'aeroporto-cabo-frio', 'van'), 500);
  }
});

test('o resto é sob cotação', () => {
  assert.equal(precoTrecho('buzios', 'cabo-frio', 'carro'), null);
  assert.equal(precoTrecho('buzios', 'buzios', 'carro'), null);
  assert.equal(precoTrecho('galeao', 'rio-de-janeiro', 'van'), null);
  assert.equal(precoTrecho('galeao', 'aeroporto-cabo-frio', 'carro'), null);
  assert.equal(precoTrecho('outra-cidade', 'buzios', 'carro'), null);
});

test('ida e volta custa o dobro; um trecho sob cotação leva tudo para cotação', () => {
  const ida = { saida: 'galeao' as const, destino: 'buzios' as const };
  const volta = { saida: 'buzios' as const, destino: 'galeao' as const };
  assert.equal(totalTransfer([ida, volta], 'carro'), 1600);
  assert.equal(totalTransfer([ida, volta], 'van'), 2400);
  assert.equal(
    totalTransfer(
      [
        { saida: 'aeroporto-cabo-frio', destino: 'arraial-do-cabo' },
        { saida: 'arraial-do-cabo', destino: 'aeroporto-cabo-frio' },
      ],
      'carro',
    ),
    600,
  );
  assert.equal(totalTransfer([ida, { saida: 'buzios', destino: 'cabo-frio' }], 'carro'), null);
});

test('o "a partir de" de cada cidade', () => {
  assert.equal(menorPrecoDaZona('buzios'), 300);
  assert.equal(menorPrecoDaZona('rio'), 800);
  assert.equal(menorPrecoDaZona('outra'), null);
});

test('malas e pessoas no carro: 3 médias, ou 2 grandes e 2 de mão, até 4 pessoas', () => {
  assert.equal(cabeNoCarro(4, { grandes: 0, medias: 3, mao: 0 }), true);
  assert.equal(cabeNoCarro(4, { grandes: 2, medias: 0, mao: 2 }), true);
  assert.equal(cabeNoCarro(4, { grandes: 3, medias: 0, mao: 0 }), false);
  assert.equal(cabeNoCarro(4, { grandes: 2, medias: 0, mao: 3 }), false);
  assert.equal(cabeNoCarro(5, SEM_MALAS), false);
});

test('na van: até 17 pessoas, 1 grande e 1 de mão por pessoa', () => {
  assert.equal(cabeNaVan(17, { grandes: 17, medias: 0, mao: 17 }), true);
  assert.equal(cabeNaVan(10, { grandes: 11, medias: 0, mao: 0 }), false);
  assert.equal(cabeNaVan(18, SEM_MALAS), false);
});

test('transfer só a partir de amanhã', () => {
  assert.equal(primeiroDiaTransfer('2026-11-02'), '2026-11-03');
  assert.equal(primeiroDiaTransfer('2026-12-31'), '2027-01-01');
});

// Pacote 6 (decisão do dono de 16/11): "de amanhã em diante" não bastava. Às 23h50 o site aceitava (e, com o cartão
// ligado, cobrava na hora) um transfer da 0h10 do dia seguinte: o achado pix#2 do teste de 15/11.
test('transfer: a ida precisa de 2 horas de antecedência, também perto da meia-noite', () => {
  assert.equal(ANTECEDENCIA_TRANSFER_MINUTOS, 120);
  // às 21h59 e às 22h00 o transfer da 0h de amanhã ainda entra (121 e 120 minutos); às 22h01, não (119)
  assert.equal(transferComAntecedencia('2026-11-16', '00:00', as('2026-11-15T21:59')), true);
  assert.equal(transferComAntecedencia('2026-11-16', '00:00', as('2026-11-15T22:00')), true);
  assert.equal(transferComAntecedencia('2026-11-16', '00:00', as('2026-11-15T22:01')), false);
  // às 23h50: a 0h10 (20 minutos) e a 1h49 (119) não; a 1h50 (120), sim
  assert.equal(transferComAntecedencia('2026-11-16', '00:10', as('2026-11-15T23:50')), false);
  assert.equal(transferComAntecedencia('2026-11-16', '01:49', as('2026-11-15T23:50')), false);
  assert.equal(transferComAntecedencia('2026-11-16', '01:50', as('2026-11-15T23:50')), true);
  // de dia nada muda: às 10h, o transfer das 9h de amanhã entra
  assert.equal(transferComAntecedencia('2026-11-16', '09:00', as('2026-11-15T10:00')), true);
});

test('transfer: a conta da antecedência atravessa a virada do mês e do ano, no fuso de Búzios', () => {
  // 31/12 às 23h30: o transfer da 0h30 de 01/01 começa em 60 minutos (não); o da 1h30, em 120 (sim)
  assert.equal(transferComAntecedencia('2027-01-01', '00:30', as('2026-12-31T23:30')), false);
  assert.equal(transferComAntecedencia('2027-01-01', '01:30', as('2026-12-31T23:30')), true);
  // 30/11 às 23h: a 0h59 de 01/12 (119 minutos) não; a 1h (120), sim
  assert.equal(transferComAntecedencia('2026-12-01', '00:59', as('2026-11-30T23:00')), false);
  assert.equal(transferComAntecedencia('2026-12-01', '01:00', as('2026-11-30T23:00')), true);
  // o relógio do servidor em UTC: 1h00 e 1h01 UTC de 16/11 são 22h00 e 22h01 de 15/11 em Búzios
  assert.equal(transferComAntecedencia('2026-11-16', '00:00', new Date('2026-11-16T01:00:00Z')), true);
  assert.equal(transferComAntecedencia('2026-11-16', '00:00', new Date('2026-11-16T01:01:00Z')), false);
});

test('transfer: data ou hora que não dá para ler, ou que já passou, nunca passa na antecedência', () => {
  const agora = as('2026-11-15T10:00');
  for (const data of ['amanhã', '2026-13-45', '', '2026-11-14']) assert.equal(transferComAntecedencia(data, '10:00', agora), false, data);
  for (const hora of ['', 'xx:yy']) assert.equal(transferComAntecedencia('2026-11-16', hora, agora), false, hora);
});

test('a antecedência do transfer: em horas inteiras (a frase mostra horas) e nunca menor que a de qualquer serviço', () => {
  assert.equal(ANTECEDENCIA_TRANSFER_MINUTOS % 60, 0);
  assert.ok(ANTECEDENCIA_TRANSFER_MINUTOS >= ANTECEDENCIA_MINIMA_MINUTOS);
});

test('os aeroportos estão na lista', () => {
  assert.equal(LUGARES.galeao.aeroporto, true);
  assert.equal(LUGARES['santos-dumont'].aeroporto, true);
  assert.equal(LUGARES['aeroporto-cabo-frio'].aeroporto, true);
  assert.equal(LUGARES.buzios.aeroporto, undefined);
});
