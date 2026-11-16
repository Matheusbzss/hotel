/**
 * O quadro do formulário da Stripe (o checkout embutido) no celular. Este arquivo roda no navegador (CheckoutEmbutido) e
 * nos testes (node puro), por isso não importa nada: nem módulos com o atalho "@/".
 */

/**
 * A largura abaixo da qual o formulário da Stripe não encolhe, por forma de pagamento. Medida na bancada em 15 e 16/11/2026,
 * em Chromium e WebKit (docs/pagamentos-stripe.md, "Fluxo do cliente", item 3).
 *
 * - Pix: 412 px. É teto da própria Stripe, vale em qualquer aparelho: o bloco do pagamento dela (`div.App-Payment`) tem
 *   `max-width: 412px` e `min-width: auto`, e a linha do passo antes do QR ("Um código QR será exibido…", 404 px) não deixa
 *   o bloco encolher.
 * - Cartão: 322 px. Não há teto: é a largura que o formulário pediu com as fontes do Windows da bancada (321,3 no espanhol,
 *   288 no inglês, 281 no português). No iPhone a fonte é outra e o espanhol pode pedir alguns pixels a mais: se o aparelho
 *   de verdade mostrar o cartão cortado, subir para 336 (em 360 px nada muda; em 320 a escala vai a 95%).
 * - Saída do portão do 3D Secure: se o desafio do banco (ou uma carteira) falhar com o quadro encolhido em 320 px, o cartão
 *   deixa de encolher (`cartao: 0`; com a mínima 0, escalaDoQuadro devolve 1) e fica só o quadro de ponta a ponta, com 1 px
 *   escondido no espanhol em 320.
 *
 * Se a Stripe mudar o desenho, a medida muda: refazer depois de atualizar o Stripe.js ou a versão da API ("Ordem de
 * publicação" em docs/pagamentos-stripe.md).
 */
export const LARGURA_MINIMA_STRIPE = { pix: 412, cartao: 322 } as const;

/**
 * A escala do quadro: 1 quando ele cabe; senão, a largura que sobra dividida pela que a Stripe pede (entre 0 e 1), para o
 * quadro desenhado com a largura mínima ocupar exatamente a largura que sobra. Largura que não dá para ler (0, negativa,
 * NaN) ou mínima 0: 1, sem nunca dividir por zero nem devolver NaN.
 */
export function escalaDoQuadro(larguraDisponivel: number, larguraMinima: number): number {
  if (!(larguraDisponivel > 0) || !(larguraMinima > 0)) return 1;
  return larguraDisponivel < larguraMinima ? larguraDisponivel / larguraMinima : 1;
}
