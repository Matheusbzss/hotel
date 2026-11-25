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
 * Pacote 28: o e-mail do reembolso ao cliente, um por reembolso (re_…), em três versões: "confirmado" (o reembolso já
 * concluído na Stripe), "a caminho" (registrado, ainda pendente, sem data) e "concluído" (o que estava a caminho terminou).
 * O id vai como "(reembolso re_…)", nunca como "(re_…)": essa forma é a das linhas do próprio reembolso.
 */
export type VersaoDoEmailDoReembolso = 'confirmado' | 'a-caminho' | 'concluido';
const NOME_DA_VERSAO: Record<VersaoDoEmailDoReembolso, string> = {
  confirmado: 'reembolso confirmado',
  'a-caminho': 'reembolso a caminho',
  concluido: 'reembolso concluído',
};
export const marcaDoEmailDoReembolso = (versao: VersaoDoEmailDoReembolso, reembolsoId: string): string =>
  `E-mail ao cliente: ${NOME_DA_VERSAO[versao]} (reembolso ${reembolsoId})`;

/** Pacote 28: o e-mail do pedido cancelado pela equipe no painel, sem dinheiro a devolver (um por pedido). */
export const MARCA_DO_EMAIL_DO_CANCELAMENTO = 'E-mail ao cliente: pedido cancelado';

/** Pacote 28: o aviso à equipe (EMAIL_RESPOSTA) do pedido que ficou pago (um por pedido). Não começa com "Aviso:". */
export const MARCA_DO_AVISO_DO_PEDIDO_PAGO = 'E-mail à equipe: aviso do pedido pago';

/**
 * Pacote 28 (revisão, achado M1): o e-mail novo que não saiu (o Resend fora do ar ou recusando, a cota do dia, a Stripe
 * que não respondeu na hora de conferir o reembolso) fica como aviso no histórico, destacado no painel: hoje ele é a única
 * notícia que o cliente reembolsado recebe. O aviso fecha sozinho quando a marca do mesmo e-mail aparece depois dele (um
 * envio seguinte saiu: avisoDoEnvioFechado). O id do reembolso vai como "(reembolso re_…;", nunca como "(re_…)".
 */
export const avisoDoEmailDoReembolsoQueNaoSaiu = (reembolsoId: string, motivo: string, versao?: VersaoDoEmailDoReembolso): string =>
  `Aviso: o e-mail ao cliente do ${versao ? NOME_DA_VERSAO[versao] : 'reembolso'} não saiu (reembolso ${reembolsoId}; ${motivo}): avisar o cliente pelo e-mail ou WhatsApp do pedido`;
export const avisoDoEmailDoCancelamentoQueNaoSaiu = (motivo: string): string =>
  `Aviso: o e-mail ao cliente do pedido cancelado não saiu (${motivo}): avisar o cliente pelo e-mail ou WhatsApp do pedido`;
export const avisoDoAvisoDoPedidoPagoQueNaoSaiu = (motivo: string): string =>
  `Aviso: o e-mail à equipe do pedido pago não saiu (${motivo}): o pedido está pago, conferir os itens no painel`;

const AVISO_DO_REEMBOLSO_QUE_NAO_SAIU = /^Aviso: o e-mail ao cliente do reembolso[^(]* não saiu \(reembolso ([^;\s]+);/;

/**
 * As marcas que fecham o aviso de um e-mail novo que não saiu (a linha `linha`), ou null quando a linha não é um desses
 * avisos. O painel (avisoAberto, src/lib/pedidos-painel.ts) fecha o aviso quando uma delas aparece depois dele.
 */
export function marcasQueFechamOAviso(linha: string): string[] | null {
  const reembolso = AVISO_DO_REEMBOLSO_QUE_NAO_SAIU.exec(linha);
  if (reembolso) return (['confirmado', 'a-caminho', 'concluido'] as const).map((v) => marcaDoEmailDoReembolso(v, reembolso[1]));
  if (linha.startsWith('Aviso: o e-mail ao cliente do pedido cancelado não saiu')) return [MARCA_DO_EMAIL_DO_CANCELAMENTO];
  if (linha.startsWith('Aviso: o e-mail à equipe do pedido pago não saiu')) return [MARCA_DO_AVISO_DO_PEDIDO_PAGO];
  return null;
}

/** O aviso da linha `indice` é o de um e-mail novo que não saiu e já foi fechado por um envio seguinte; null: outro aviso. */
export function avisoDoEnvioFechado(historico: readonly { evento: string }[], indice: number): boolean | null {
  const marcas = marcasQueFechamOAviso(historico[indice]?.evento ?? '');
  if (!marcas) return null;
  return historico.slice(indice + 1).some((h) => marcas.some((m) => h.evento.startsWith(m)));
}

/** Algum e-mail do site sobre este reembolso já saiu para o cliente (qualquer das três versões). */
export const emailDoReembolsoJaSaiu = (historico: readonly { evento: string }[], reembolsoId: string): boolean =>
  (['confirmado', 'a-caminho', 'concluido'] as const).some((v) =>
    historico.some((h) => h.evento.startsWith(marcaDoEmailDoReembolso(v, reembolsoId))),
  );

/**
 * O começo comum dos dois avisos do e-mail do pagamento aprovado: o de que ele começou a sair (AVISO_EMAIL_PAGO_SAINDO)
 * e o de que ele não saiu (gravado por src/lib/email/pedidos.ts). Qualquer um dos dois no histórico já está destacado no
 * painel: o agendamento do e-mail que não saiu (src/lib/emails-pendentes.ts) deixa esse pedido para a equipe.
 */
export const PREFIXO_DOS_AVISOS_DO_EMAIL_PAGO = 'Aviso: o e-mail do pagamento aprovado';

/**
 * Gravado ANTES de mandar o e-mail do pagamento aprovado: se a função for cortada no meio (o tempo da rota acabou) ou
 * o envio falhar, o aviso fica no histórico e o painel destaca. Quando o e-mail sai, a linha MARCA_DO_EMAIL do pagamento
 * aprovado vem logo depois e o painel para de destacar (avisoAberto, src/lib/pedidos-painel.ts).
 */
export const AVISO_EMAIL_PAGO_SAINDO =
  'Aviso: o e-mail do pagamento aprovado começou a sair; se a linha "E-mail ao cliente: pagamento aprovado" não aparecer logo depois, ele não saiu: mandar ao cliente o link do pedido';
