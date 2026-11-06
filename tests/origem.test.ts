import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escreverOrigem, lerOrigem, origemDoLink, soCampanha, textoDaOrigem } from '../src/lib/origem.ts';

test('lê os parâmetros do link do anúncio', () => {
  assert.deepEqual(origemDoLink('?utm_source=meta&utm_medium=pago&utm_campaign=verao-buzios'), {
    utm_source: 'meta',
    utm_medium: 'pago',
    utm_campaign: 'verao-buzios',
  });
  assert.deepEqual(origemDoLink('?utm_source=google&gclid=Cj0KCQiA-abc_123'), { utm_source: 'google', gclid: 'Cj0KCQiA-abc_123' });
  // nome de campanha com acento e espaço
  assert.equal(origemDoLink('?utm_campaign=ver%C3%A3o%20em%20B%C3%BAzios')?.utm_campaign, 'verão em Búzios');
});

test('visita sem anúncio não tem origem', () => {
  assert.equal(origemDoLink(''), null);
  assert.equal(origemDoLink('?mudar=123&utm_source='), null);
  assert.equal(origemDoLink('?gclid=curto'), null);
});

test('o que vem do link não passa do tamanho, nem traz quebra de linha', () => {
  const o = origemDoLink(`?utm_campaign=${'a'.repeat(300)}&utm_source=meta%0Aoutra`);
  assert.equal(o?.utm_campaign?.length, 120);
  assert.equal(o?.utm_source, 'meta outra');
});

test('o cookie vai e volta, e só passa o que tem o formato certo', () => {
  const o = { utm_source: 'meta', utm_campaign: 'verão', gclid: 'Cj0KCQiA-abc_123' };
  assert.deepEqual(lerOrigem(escreverOrigem(o)), o);
  assert.deepEqual(lerOrigem(undefined), {});
  assert.deepEqual(lerOrigem('não é json'), {});
  assert.deepEqual(lerOrigem(encodeURIComponent('[1,2]')), {});
  // um cookie mexido à mão não traz campo de fora nem o aceite dos cookies
  assert.deepEqual(lerOrigem(escreverOrigem({ utm_source: 'meta', medicao: true, fbp: 'x', gclid: '<script>' } as never)), { utm_source: 'meta' });
});

test('os carrinhos e as cotações guardam só a campanha', () => {
  assert.deepEqual(soCampanha({ utm_source: 'meta', utm_medium: 'pago', gclid: 'abc', fbp: 'x', medicao: true }), { utm_source: 'meta', utm_medium: 'pago' });
  assert.deepEqual(soCampanha({}), {});
});

test('o texto do painel', () => {
  assert.equal(textoDaOrigem({ utm_source: 'meta', utm_campaign: 'verao' }), 'meta · verao');
  assert.equal(textoDaOrigem({ utm_source: 'google' }), 'google');
  assert.equal(textoDaOrigem({}), '');
  assert.equal(textoDaOrigem(undefined), '');
});
