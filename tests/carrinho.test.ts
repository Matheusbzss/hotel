import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totaisDoCarrinho, type ItemVisivel } from '../src/lib/carrinho.ts';

const item = (totalCentavos: number, totalPixCentavos: number): ItemVisivel => ({
  id: String(totalCentavos),
  tipo: 'passeio',
  titulo: 'Passeio de teste',
  foto: '',
  detalhes: [],
  href: '',
  totalCentavos,
  totalPixCentavos,
  escolha: { tipo: 'passeio', slug: 'teste', data: '2026-12-01', hora: '09:00', adultos: 2, meia: 0, gratis: 0 },
});

test('o total do carrinho soma cada item, no cartão e no Pix', () => {
  assert.deepEqual(totaisDoCarrinho([item(23100, 20790), item(160000, 144000)]), { totalCentavos: 183100, totalPixCentavos: 164790 });
});

test('carrinho vazio: total zero', () => {
  assert.deepEqual(totaisDoCarrinho([]), { totalCentavos: 0, totalPixCentavos: 0 });
});
