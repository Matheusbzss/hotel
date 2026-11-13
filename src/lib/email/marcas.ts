/**
 * As linhas que os e-mails gravam no histórico do pedido (o painel mostra, em português, para a equipe). Ficam aqui,
 * sem import nenhum, para o painel (src/lib/pedidos-painel.ts) e os testes lerem as mesmas frases que o envio grava
 * (src/lib/email/pedidos.ts).
 */

export type TipoEmailDoPedido = 'pedido-recebido' | 'pagamento-aprovado' | 'pix-vencido' | 'link-do-pedido' | 'desistencia-recebida';

/** A linha do histórico de cada envio. */
export const MARCA_DO_EMAIL: Record<TipoEmailDoPedido, string> = {
  'pedido-recebido': 'E-mail ao cliente: pedido recebido',
  'pagamento-aprovado': 'E-mail ao cliente: pagamento aprovado, com os vouchers',
  'pix-vencido': 'E-mail ao cliente: Pix vencido',
  'link-do-pedido': 'E-mail ao cliente: link do pedido (pedido em "Consultar meu pedido")',
  'desistencia-recebida': 'E-mail ao cliente: confirmação do pedido de desistência',
};

/** O aviso da desistência que foi para a equipe (EMAIL_RESPOSTA). */
export const MARCA_DO_AVISO_A_EQUIPE = 'E-mail à equipe: aviso do pedido de desistência';

/**
 * Gravado ANTES de mandar o e-mail do pagamento aprovado: se a função for cortada no meio (o tempo da rota acabou) ou
 * o envio falhar, o aviso fica no histórico e o painel destaca. Quando o e-mail sai, a linha MARCA_DO_EMAIL do pagamento
 * aprovado vem logo depois e o painel para de destacar (avisoAberto, src/lib/pedidos-painel.ts).
 */
export const AVISO_EMAIL_PAGO_SAINDO =
  'Aviso: o e-mail do pagamento aprovado começou a sair; se a linha "E-mail ao cliente: pagamento aprovado" não aparecer logo depois, ele não saiu: mandar ao cliente o link do pedido';
