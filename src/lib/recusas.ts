/**
 * O motivo da recusa do cartão, como a Stripe manda (`decline_code` do PaymentIntent, ou o `code` do erro
 * quando não há decline_code), traduzido para a chave do dicionário que a página do pedido mostra em
 * linguagem simples nos 4 idiomas (`recusa.<chave>`). A falha da confirmação do banco (3D Secure) só vem no
 * `code` (payment_intent_authentication_failure, sem decline_code: visto em 15/11).
 * Tabela oficial: https://docs.stripe.com/declines/codes (lida em 09/11/2026; relida em 16/11/2026, com a
 * auditoria de 12 cartões de teste). Só entram aqui códigos conferidos.
 * Fraude, cartão perdido ou roubado e bloqueios NUNCA são revelados: aparecem como recusa genérica, como a
 * Stripe pede. "internacional" é o caso do cartão de fora que o banco não liberou para compras no exterior.
 */

/** O motivo gravado quando o Pix gerado não foi pago no prazo (src/lib/pagamento-stripe.ts): não é recusa de cartão. */
export const PIX_EXPIRADO = 'pix_expirado';

export type ChaveRecusa = 'saldo' | 'dados' | 'internacional' | 'generica' | 'autenticacao' | 'vencido' | 'processamento';

/** As chaves que o dicionário precisa ter em `recusa.*` (pt, en, es e es-ar onde mudar). */
export const CHAVES_RECUSA: readonly ChaveRecusa[] = [
  'saldo',
  'dados',
  'internacional',
  'generica',
  'autenticacao',
  'vencido',
  'processamento',
];

const POR_CODIGO = new Map<string, ChaveRecusa>([
  // sem saldo ou limite estourado: outra forma de pagamento (o Pix)
  ['insufficient_funds', 'saldo'],
  ['card_velocity_exceeded', 'saldo'],
  ['withdrawal_count_limit_exceeded', 'saldo'],
  // o cartão não aceita este tipo de compra, esta moeda ou compras de fora: ligar para o banco
  ['card_not_supported', 'internacional'],
  ['transaction_not_allowed', 'internacional'],
  ['currency_not_supported', 'internacional'],
  ['expired_card', 'vencido'],
  // a confirmação do banco (3D Secure): o banco pediu e ela não foi feita (códigos de recusa), ou foi feita e falhou. A
  // falha chega como CÓDIGO DE ERRO do pagamento (last_payment_error.code, sem decline_code): visto em 15/11
  ['authentication_required', 'autenticacao'],
  ['authentication_not_handled', 'autenticacao'],
  ['payment_intent_authentication_failure', 'autenticacao'],
  // falha passageira: tentar de novo
  ['processing_error', 'processamento'],
  ['issuer_not_available', 'processamento'],
  ['try_again_later', 'processamento'],
  ['reenter_transaction', 'processamento'],
  ['approve_with_id', 'processamento'],
  // fraude, cartão perdido/roubado, bloqueio: o cliente não pode saber o motivo
  ['fraudulent', 'generica'],
  ['lost_card', 'generica'],
  ['stolen_card', 'generica'],
  ['merchant_blacklist', 'generica'],
  ['pickup_card', 'generica'],
  ['restricted_card', 'generica'],
  // começam com "invalid_", mas não são dado digitado errado: a conta do cartão e o valor da compra (o mapa vem antes
  // da regra do prefixo, em chaveDaRecusa)
  ['invalid_account', 'generica'],
  ['invalid_amount', 'generica'],
]);

/** A chave do dicionário para um `decline_code`. Código desconhecido, vazio ou ausente → recusa genérica. */
export function chaveDaRecusa(declineCode: string | null | undefined): ChaveRecusa {
  if (!declineCode) return 'generica';
  const codigo = declineCode.trim().toLowerCase();
  const conhecida = POR_CODIGO.get(codigo);
  if (conhecida) return conhecida;
  // número, CVC, validade, CEP ou endereço errados: corrigir e tentar de novo
  if (codigo.startsWith('incorrect_') || codigo.startsWith('invalid_')) return 'dados';
  return 'generica';
}

/**
 * A chave do texto da recusa do cartão que o cliente lê, ou nada: pedido pago, sem recusa, Pix vencido, ou pedido cuja
 * forma é o Pix (o Pix não é recusado: vence sem pagamento; nenhum código guardado num pedido de Pix é recusa de cartão).
 */
export function recusaParaOCliente(status: string, motivoCodigo: string | undefined, metodo: string | undefined): ChaveRecusa | undefined {
  if (status === 'pago' || !motivoCodigo || motivoCodigo === PIX_EXPIRADO || metodo === 'pix') return undefined;
  return chaveDaRecusa(motivoCodigo);
}

/**
 * A dica do cartão de fora do Brasil (`pedido.dicaInternacional`: conferir no app do banco se as compras
 * internacionais estão liberadas) acompanha toda recusa de cartão, menos a "internacional": ali o motivo já diz a
 * mesma coisa, e as duas frases juntas se repetem (decisão do dono de 11/11).
 */
export const mostrarDicaInternacional = (chave: ChaveRecusa): boolean => chave !== 'internacional';
