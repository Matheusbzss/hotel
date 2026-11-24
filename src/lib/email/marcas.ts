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

/** O aviso à equipe (EMAIL_RESPOSTA) de um reembolso que a Stripe não conseguiu concluir: um por reembolso. */
export const MARCA_DO_AVISO_DE_REEMBOLSO_FALHO = 'E-mail à equipe: aviso do reembolso que falhou';
/** A linha do histórico do aviso de um reembolso (re_… ou pyr_…), que impede o segundo e-mail do mesmo reembolso. */
export const marcaDoAvisoDeReembolsoFalho = (reembolsoId: string): string => `${MARCA_DO_AVISO_DE_REEMBOLSO_FALHO} (${reembolsoId})`;

/**
 * O aviso à equipe (EMAIL_RESPOSTA) de um pagamento que chegou para um pedido cancelado e ficou parado na Stripe (Pacote
 * 22): um por pagamento (pi_…). Não começa com "Aviso:": a linha não é destacada no painel.
 */
export const MARCA_DO_AVISO_DO_PAGAMENTO_RETIDO = 'E-mail à equipe: aviso do pagamento que chegou com o pedido cancelado';
export const marcaDoAvisoDoPagamentoRetido = (paymentIntentId: string): string =>
  `${MARCA_DO_AVISO_DO_PAGAMENTO_RETIDO} (${paymentIntentId})`;

/**
 * Gravado ANTES de mandar o e-mail do pagamento aprovado: se a função for cortada no meio (o tempo da rota acabou) ou
 * o envio falhar, o aviso fica no histórico e o painel destaca. Quando o e-mail sai, a linha MARCA_DO_EMAIL do pagamento
 * aprovado vem logo depois e o painel para de destacar (avisoAberto, src/lib/pedidos-painel.ts).
 */
/**
 * O começo comum dos dois avisos do e-mail do pagamento aprovado: o de que ele começou a sair (AVISO_EMAIL_PAGO_SAINDO)
 * e o de que ele não saiu (gravado por src/lib/email/pedidos.ts). Qualquer um dos dois no histórico já está destacado no
 * painel: o agendamento do e-mail que não saiu (src/lib/emails-pendentes.ts) deixa esse pedido para a equipe.
 */
export const PREFIXO_DOS_AVISOS_DO_EMAIL_PAGO = 'Aviso: o e-mail do pagamento aprovado';

export const AVISO_EMAIL_PAGO_SAINDO =
  'Aviso: o e-mail do pagamento aprovado começou a sair; se a linha "E-mail ao cliente: pagamento aprovado" não aparecer logo depois, ele não saiu: mandar ao cliente o link do pedido';
