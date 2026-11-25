import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESCONTO_PIX_PORCENTO } from '../src/config/precos.ts';
import { dicionario } from '../src/i18n/index.ts';
import { precoPixCentavos } from '../src/lib/orcamento.ts';
import { cartaoEmDestaque, rotuloPixComDesconto } from '../src/lib/preco-destaque.ts';

test('o preço grande: o do cartão em espanhol e inglês, o do Pix em português (opção D1-A, 25/11)', () => {
  for (const x of ['es', 'es-ar', 'es-AR', 'en', 'en-US']) assert.equal(cartaoEmDestaque(x), true, x);
  for (const x of ['pt', 'pt-BR']) assert.equal(cartaoEmDestaque(x), false, x);
});

test('a linha do Pix diz o desconto de verdade, nos quatro idiomas', () => {
  // o desconto do rótulo é o mesmo que a conta do preço no Pix faz (R$ 77,00 no cartão → R$ 69,30 no Pix)
  assert.equal(precoPixCentavos(7700), 6930);
  assert.equal(Math.round((1 - precoPixCentavos(7700) / 7700) * 100), DESCONTO_PIX_PORCENTO);
  const esperado = { pt: 'no Pix (−10%)', es: 'con Pix (−10%)', 'es-ar': 'con Pix (−10%)', en: 'with Pix (−10%)' } as const;
  for (const idioma of ['pt', 'es', 'es-ar', 'en'] as const) {
    const rotulo = rotuloPixComDesconto(dicionario(idioma).preco.noPixComDesconto);
    assert.equal(rotulo, esperado[idioma].replace('10', String(DESCONTO_PIX_PORCENTO)), idioma);
    assert.ok(rotulo.startsWith(dicionario(idioma).preco.noPix), idioma);
  }
});
