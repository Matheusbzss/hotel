import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOLAR_VALIDADE_DIAS, cotacaoVencida, idadeDaCotacaoDias, taxaDolarValida, textoDolar } from '../src/lib/dolar.ts';

// o "≈ US$ {v}" vem do dicionário (preco.dolar); aqui se confere a parte numérica, sempre com os centavos
test('dólar com centavos: R$ 197,00 a 5,5013 → US$ 35,81', () => {
  assert.equal(textoDolar(19700, 5.5013, '≈ US$ {v}', 'es-AR'), '≈ US$ 35,81');
  assert.equal(textoDolar(19700, 5.5013, '≈ US$ {v}', 'en-US'), '≈ US$ 35.81');
  // Math.round nos centavos de dólar: 19700 / 5,5 = 3581,8... centavos → US$ 35,82
  assert.equal(textoDolar(19700, 5.5, '{v}', 'en-US'), '35.82');
  // sem o antigo mínimo de US$ 1: valor pequeno aparece de verdade
  assert.equal(textoDolar(100, 5, '{v}', 'en-US'), '0.20');
  // sem cotação, sem dólar
  assert.equal(textoDolar(19700, null, '≈ US$ {v}', 'es-AR'), '');
});

test('a cotação vale por 7 dias; depois disso o dólar some', () => {
  assert.equal(DOLAR_VALIDADE_DIAS, 7);
  const agora = new Date('2026-11-07T15:00:00Z');
  assert.equal(idadeDaCotacaoDias('2026-11-07', agora), 0);
  assert.equal(idadeDaCotacaoDias('2026-11-05', agora), 2);
  assert.equal(cotacaoVencida('2026-10-31', agora), false); // 7 dias: ainda vale
  assert.equal(cotacaoVencida('2026-10-30', agora), true); // 8 dias: vencida
  assert.equal(cotacaoVencida('data-que-nao-presta', agora), true);
});

test('faixa da taxa: só entre 1 e 20 reais por dólar', () => {
  assert.equal(taxaDolarValida(5.5013), true);
  assert.equal(taxaDolarValida(1.01), true);
  assert.equal(taxaDolarValida(19.99), true);
  assert.equal(taxaDolarValida(1), false);
  assert.equal(taxaDolarValida(20), false);
  assert.equal(taxaDolarValida(0.9), false);
  assert.equal(taxaDolarValida(25), false);
  assert.equal(taxaDolarValida(NaN), false);
  assert.equal(taxaDolarValida('5.5'), false);
  assert.equal(taxaDolarValida(null), false);
});
