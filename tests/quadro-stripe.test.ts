import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LARGURA_MINIMA_STRIPE, escalaDoQuadro } from '../src/lib/quadro-stripe.ts';

// A caixa do Pix (e do cartão) no celular (Pacote 10, 16/11; T1, T2, pix#3 e telas#2 do teste de 15/11; o dono escolheu a
// opção B). O formulário da Stripe não encolhe abaixo de uma largura (412 px na caixa do Pix antes do QR, 322 no cartão), e
// um celular comum tem 390: a direita do formulário ficava escondida. Na opção B o quadro vai de ponta a ponta no celular
// e, quando nem assim cabe, é desenhado com a largura que a Stripe pede e encolhido só o necessário. Aqui, a conta da
// escala; as classes e o vigia de tamanho do componente estão em tests/telas-pagamento.test.ts.

/** A escala com 4 casas, como o desenho escreveu os números (390/412 ≈ 0,9466). */
const quatroCasas = (n: number) => Math.round(n * 10_000) / 10_000;

test('as larguras que a Stripe pede: 412 px no Pix e 322 no cartão', () => {
  assert.deepEqual(LARGURA_MINIMA_STRIPE, { pix: 412, cartao: 322 });
});

test('o Pix encolhe só o necessário: 95% num celular comum, 87% no Android mais comum, 78% no celular pequeno', () => {
  // as escalas do desenho, medidas na bancada com a opção B (0,947 / 0,874 / 0,777)
  assert.equal(quatroCasas(escalaDoQuadro(390, LARGURA_MINIMA_STRIPE.pix)), 0.9466);
  assert.equal(quatroCasas(escalaDoQuadro(360, LARGURA_MINIMA_STRIPE.pix)), 0.8738);
  assert.equal(quatroCasas(escalaDoQuadro(320, LARGURA_MINIMA_STRIPE.pix)), 0.7767);
  // exatamente a largura que sobra dividida pela que a Stripe pede
  assert.equal(escalaDoQuadro(390, 412), 390 / 412);
  // um celular de largura fracionária (411,43 px): a régua é medida com getBoundingClientRect, sem arredondar
  assert.equal(escalaDoQuadro(411.43, 412), 411.43 / 412);
  // de 412 px para cima (alguns Android grandes, e o computador) o quadro não encolhe
  assert.equal(escalaDoQuadro(412, 412), 1);
  assert.equal(escalaDoQuadro(430, 412), 1);
  assert.equal(escalaDoQuadro(643, 412), 1);
});

test('o cartão só encolhe abaixo de 322 px: 99,4% em 320 e nada em 360', () => {
  assert.equal(quatroCasas(escalaDoQuadro(320, LARGURA_MINIMA_STRIPE.cartao)), 0.9938);
  assert.equal(escalaDoQuadro(322, LARGURA_MINIMA_STRIPE.cartao), 1);
  assert.equal(escalaDoQuadro(360, LARGURA_MINIMA_STRIPE.cartao), 1);
  assert.equal(escalaDoQuadro(390, LARGURA_MINIMA_STRIPE.cartao), 1);
});

test('largura que não dá para ler ou mínima 0: escala 1, sem dividir por zero nem devolver NaN', () => {
  for (const largura of [0, -1, -390, Number.NaN]) assert.equal(escalaDoQuadro(largura, 412), 1, String(largura));
  for (const minima of [0, -412, Number.NaN]) assert.equal(escalaDoQuadro(390, minima), 1, String(minima));
  assert.equal(escalaDoQuadro(Number.POSITIVE_INFINITY, 412), 1);
  // a saída do portão do 3D Secure (comentário de LARGURA_MINIMA_STRIPE): com a mínima do cartão em 0, ele nunca encolhe
  assert.equal(escalaDoQuadro(320, 0), 1);
});

test('de 200 a 1500 px: a escala fica entre 0 e 1 e o quadro encolhido nunca passa da largura que sobra', () => {
  // o arredondamento do ponto flutuante pode passar uns 3e-14 px (207/322 × 322, por exemplo): a folga de um bilionésimo
  // de pixel não muda nada na tela
  const FOLGA_DO_ARREDONDAMENTO = 1e-9;
  for (const minima of [LARGURA_MINIMA_STRIPE.pix, LARGURA_MINIMA_STRIPE.cartao]) {
    // de quarto em quarto de pixel, para pegar as larguras fracionárias
    for (let largura = 200; largura <= 1500; largura += 0.25) {
      const escala = escalaDoQuadro(largura, minima);
      const onde = `largura ${largura}, mínima ${minima}: ${escala}`;
      assert.ok(escala > 0 && escala <= 1, onde);
      assert.ok(escala * minima <= largura + FOLGA_DO_ARREDONDAMENTO, onde);
      if (largura >= minima) assert.equal(escala, 1, onde);
      // quando encolhe, ocupa a largura que sobra inteira: nem cortado, nem menor que o necessário
      else assert.ok(Math.abs(escala * minima - largura) <= FOLGA_DO_ARREDONDAMENTO, onde);
    }
  }
});
