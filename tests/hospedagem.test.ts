import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dicionario } from '../src/i18n/index.ts';
import { hospedagemDoCheckout, nomeDoHotel } from '../src/lib/hospedagem.ts';

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('o hotel continua obrigatório, a não ser que o cliente marque "Ainda não sei" (opção D2-A, 25/11)', () => {
  assert.deepEqual(hospedagemDoCheckout({ cidade: 'buzios', hotel: '  Pousada do Sol  ' }), { cidade: 'buzios', hotel: 'Pousada do Sol' });
  assert.equal(hospedagemDoCheckout({ cidade: 'buzios', hotel: '' }), null);
  assert.equal(hospedagemDoCheckout({ cidade: 'buzios', hotel: '   ', aInformar: false }), null);
  assert.deepEqual(hospedagemDoCheckout({ cidade: 'cabo-frio', hotel: '', aInformar: true }), {
    cidade: 'cabo-frio',
    hotel: '',
    aInformar: true,
  });
  // o nome digitado antes de marcar não vai pela metade
  assert.deepEqual(hospedagemDoCheckout({ cidade: 'buzios', hotel: 'Pous', aInformar: true }), {
    cidade: 'buzios',
    hotel: '',
    aInformar: true,
  });
});

test('o hotel "a informar" aparece com o texto de cada idioma, e o nome digitado aparece como sempre', () => {
  const esperado = { pt: 'A informar', es: 'Por confirmar', 'es-ar': 'Por confirmar', en: 'To be confirmed' } as const;
  for (const idioma of ['pt', 'es', 'es-ar', 'en'] as const) {
    const d = dicionario(idioma);
    assert.equal(nomeDoHotel({ hotel: '', aInformar: true }, d.reserva.hotelAInformar), esperado[idioma], idioma);
    assert.equal(nomeDoHotel({ hotel: 'Pousada do Sol' }, d.reserva.hotelAInformar), 'Pousada do Sol', idioma);
    assert.ok(d.checkout.hotelNaoSei.length > 0, idioma);
    assert.match(d.checkout.hotelNaoSeiAjuda, /WhatsApp/, idioma);
  }
  assert.equal(dicionario('es-ar').checkout.hotelNaoSei, 'Todavía no lo sé');
  assert.equal(dicionario('pt').checkout.hotelNaoSei, 'Ainda não sei');
  assert.equal(dicionario('en').checkout.hotelNaoSei, 'I don’t know yet');
});

test('o servidor, o checkout, o voucher, a página do pedido e o painel usam a mesma regra', () => {
  const api = ler('src/app/api/pedido/route.ts');
  assert.match(api, /hospedagemDoCheckout\(e\.hospedagem\)/);
  assert.match(api, /if \(hospedagem === null\) return erro\('hospedagem\.hotel'\)/);
  assert.match(api, /if \('passeio' in c && !hospedagem\) return erro\('hospedagem'\)/);
  const form = ler('src/components/carrinho/FormularioCarrinho.tsx');
  assert.match(form, /if \(!hotelAInformar && hotel\.trim\(\)\.length < 2\) e\.hotel = C\.erros\.obrigatorio;/);
  assert.match(form, /hotelAInformar\s+\? \{ cidade: cidadeHosp, hotel: '', aInformar: true \}/);
  assert.equal(ler('src/lib/pdf-voucher.ts').match(/nomeDoHotel\(reserva\.hospedagem, d\.reserva\.hotelAInformar\)/g)?.length, 2);
  assert.match(ler('src/lib/reserva-publica.ts'), /hotel: nomeDoHotel\(r\.hospedagem, d\.reserva\.hotelAInformar\)/);
  const painel = ler('src/app/admin/page.tsx');
  assert.match(painel, /r\.hospedagem\.aInformar \?/);
  assert.match(painel, /pedir pelo WhatsApp antes do passeio/);
});
