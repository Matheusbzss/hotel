/**
 * A frase da página de um pagamento contestado no banco (o título é o mesmo, pedido.contestadoTitulo). Pura, sem importar
 * nada: serve à página do pedido e roda nos testes em node (tests/paginas-do-cliente.test.ts).
 */

/** Os dois textos do dicionário (pedido.*) que a frase usa. */
export interface TextosDoContestado {
  /** Um voucher só: "… o voucher fica suspenso …". */
  contestadoTexto: string;
  /** Mais de um voucher: "… os vouchers ficam suspensos …". */
  contestadoTextoVarios: string;
}

/**
 * A frase pelo número de vouchers do que a página mostra. A página do pedido com mais de um voucher diz "os vouchers ficam
 * suspensos": a contestação é do pagamento, e ele cobre todos. Até o reteste de 22/11 (pergunta 16, com a resposta
 * recomendada) ela dizia "o voucher fica suspenso", no singular, mesmo com vários. Com um voucher só (a página da reserva,
 * que é a de um voucher, e o pedido de um item, que abre nela), a frase de sempre.
 */
export function textoDoContestado(textos: TextosDoContestado, vouchers: number): string {
  return vouchers > 1 ? textos.contestadoTextoVarios : textos.contestadoTexto;
}
