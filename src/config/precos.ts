/**
 * OS DOIS NÚMEROS QUE MUDAM OS PREÇOS DO SITE INTEIRO (passeios e transfer).
 * As casas de temporada têm as diárias próprias, em src/data/casas.ts.
 *
 * Os preços de cada passeio estão em src/data/passeios.ts e os do transfer em src/data/transfer.ts:
 * são os preços de VENDA, os que o cliente paga no cartão.
 */

/** Ajuste de todos os preços de venda, em %: -10 baixa tudo 10%; 0 deixa como está. */
export const AJUSTE_PRECOS_PORCENTO = 0;

/** Desconto para quem paga com Pix, em % do preço do cartão. */
export const DESCONTO_PIX_PORCENTO = 10;
