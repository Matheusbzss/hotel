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
} from '../src/data/transfer.ts';

const SEM_MALAS = { grandes: 0, medias: 0, mao: 0 };

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

test('os aeroportos estão na lista', () => {
  assert.equal(LUGARES.galeao.aeroporto, true);
  assert.equal(LUGARES['santos-dumont'].aeroporto, true);
  assert.equal(LUGARES['aeroporto-cabo-frio'].aeroporto, true);
  assert.equal(LUGARES.buzios.aeroporto, undefined);
});
