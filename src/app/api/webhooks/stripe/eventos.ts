import type Stripe from 'stripe';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import type { Json } from '../../../../lib/banco-tipos';
import { formatarCifra } from '../../../../lib/cifra.ts';
import { codigoValido } from '../../../../lib/codigo-reserva.ts';
import type { Reserva, StatusReserva } from '../../../../lib/reservas';

/**
 * O que o webhook da Stripe (POST /api/webhooks/stripe) decide sem rede nem banco: de que pedido o evento fala,
 * o resumo que fica guardado com o evento e o que uma cobrança reembolsada ou uma contestação significam para
 * o pedido. Testado em tests/webhook-stripe.test.ts. A regra geral continua a de src/lib/pagamento-stripe.ts: a
 * verdade é o objeto relido na Stripe, nunca o corpo do evento; a rota relê antes de chamar o que está aqui.
 */

/** Os eventos que o destino cadastrado na Stripe assina. Qualquer outro é respondido com 200 e ignorado. */
export const TIPOS_TRATADOS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'payment_intent.payment_failed',
  'charge.refunded',
  'refund.failed',
  'charge.dispute.created',
  'charge.dispute.closed',
] as const;
export type TipoTratado = (typeof TIPOS_TRATADOS)[number];

export const ehTipoTratado = (tipo: string): tipo is TipoTratado => (TIPOS_TRATADOS as readonly string[]).includes(tipo);

/** Um campo que a Stripe devolve como id ou, quando expandido, como objeto → o id. */
export const idDe = (valor: string | { id: string } | null | undefined): string | null =>
  typeof valor === 'string' ? valor : (valor?.id ?? null);

/** O código do pedido gravado numa metadata da Stripe (metadata.codigo), se for um código válido. */
export function codigoDaMetadata(metadata: Stripe.Metadata | null | undefined): string | null {
  const codigo = metadata?.codigo;
  return codigo && codigoValido(codigo) ? codigo : null;
}

/**
 * A sessão foi criada pelo site para ESTE pedido? Só quem tem a chave secreta grava metadata.codigo (o site, em
 * parametrosDaSessao); já o client_reference_id qualquer comprador escolhe no endereço de um link de pagamento da
 * conta. Por isso o webhook só aplica a um pedido a sessão que traz o código dele na metadata.
 */
export function sessaoDoPedido(sessao: Pick<Stripe.Checkout.Session, 'metadata'>, codigo: string): boolean {
  return codigoDaMetadata(sessao.metadata) === codigo;
}

/** De que o evento fala, pelo corpo (só para achar o pedido; o estado vem da releitura na Stripe). */
export interface AlvoDoEvento {
  tipo: string;
  /** 'checkout.session', 'payment_intent', 'charge', 'refund' ou 'dispute'. */
  objeto: string;
  id: string;
  /** O código do pedido, quando o objeto o traz (client_reference_id ou metadata.codigo). */
  codigo: string | null;
  /** O pagamento (pi_...) ligado ao objeto, para achar o pedido quando o código não vem no corpo. */
  paymentIntentId: string | null;
}

/** O objeto de qualquer evento tratado, só com os campos que servem para achar o pedido. */
interface ObjetoDoEvento {
  object: string;
  id: string;
  metadata?: Stripe.Metadata | null;
  client_reference_id?: string | null;
  payment_intent?: string | { id: string } | null;
}

export function alvoDoEvento(evento: Pick<Stripe.Event, 'type' | 'data'>): AlvoDoEvento {
  const o = evento.data.object as unknown as ObjetoDoEvento;
  const referencia =
    o.object === 'checkout.session' && o.client_reference_id && codigoValido(o.client_reference_id) ? o.client_reference_id : null;
  return {
    tipo: evento.type,
    objeto: o.object,
    id: o.id,
    codigo: referencia ?? codigoDaMetadata(o.metadata),
    paymentIntentId: o.object === 'payment_intent' ? o.id : idDe(o.payment_intent),
  };
}

/** Só valores simples (texto, número, sim/não) de algumas chaves: nunca objetos inteiros. */
function soSimples(o: Record<string, unknown>, chaves: readonly string[]): Record<string, string | number | boolean> {
  const saida: Record<string, string | number | boolean> = {};
  for (const chave of chaves) {
    const v = o[chave];
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') saida[chave] = v;
  }
  return saida;
}

/**
 * O resumo do evento que fica em pagamentos_eventos: ids e status, para conferir depois o que chegou. Nunca os
 * dados do cliente (nome, e-mail, endereço) nem do cartão: o corpo inteiro do evento não é guardado.
 */
export function resumoDoEvento(evento: Pick<Stripe.Event, 'type' | 'data' | 'livemode'>): Json {
  const o = evento.data.object as unknown as Record<string, unknown>;
  const base = { objeto: String(o.object), id: String(o.id), modoReal: evento.livemode };
  switch (o.object) {
    case 'checkout.session':
      return {
        ...base,
        ...soSimples(o, ['status', 'payment_status', 'amount_total', 'currency', 'client_reference_id']),
        paymentIntent: idDe(o.payment_intent as string | { id: string } | null),
      };
    case 'payment_intent': {
      const erro = o.last_payment_error as { code?: string; decline_code?: string } | null | undefined;
      return {
        ...base,
        ...soSimples(o, ['status', 'amount', 'currency']),
        codigoDaRecusa: erro?.decline_code ?? erro?.code ?? null,
      };
    }
    case 'charge':
      return {
        ...base,
        ...soSimples(o, ['status', 'amount', 'amount_refunded', 'refunded', 'currency']),
        paymentIntent: idDe(o.payment_intent as string | { id: string } | null),
      };
    case 'refund':
      return {
        ...base,
        ...soSimples(o, ['status', 'amount', 'currency', 'failure_reason']),
        paymentIntent: idDe(o.payment_intent as string | { id: string } | null),
        cobranca: idDe(o.charge as string | { id: string } | null),
      };
    case 'dispute':
      return {
        ...base,
        ...soSimples(o, ['status', 'amount', 'currency', 'reason']),
        paymentIntent: idDe(o.payment_intent as string | { id: string } | null),
        cobranca: idDe(o.charge as string | { id: string } | null),
      };
    default:
      return base;
  }
}

/* ------------------------------------------------------------------ */
/* Pagamentos que voltam ao cliente                                     */

/** O que interessa do pedido para saber de quem é um pagamento. */
type PedidoDoPagamento = Pick<Reserva, 'status' | 'paymentIntentId'>;

/**
 * O pagamento de uma sessão paga que o pedido não pode ficar: o pedido já estava pago (ou contestado) por outro
 * pagamento, numa segunda aba; foi cancelado (o cliente refez a compra, a equipe cancelou) e o QR de um Pix antigo
 * foi pago depois; ou já tinha sido devolvido. Esse dinheiro volta ao cliente (criarReembolso). Recebe o pedido
 * antes e depois de aplicarSessao e a leitura da sessão relida na Stripe; null quando o pagamento é o do pedido.
 * Não depende do histórico: um evento repetido (ou a nova tentativa depois de uma falha) acha o mesmo pagamento, e
 * a chave de idempotência do reembolso impede devolver duas vezes. Quando o pedido tem OUTRO pagamento registrado,
 * aplicarSessao não o troca e já devolve pagamentoRepetido; esta leitura cobre também o que sobra: o pedido
 * cancelado pago pelo pagamento que ele mesmo tinha (o Pix gerado antes de cancelar) ou sem nenhum registrado.
 */
export function pagamentoParaDevolver(
  antes: PedidoDoPagamento,
  depois: PedidoDoPagamento,
  leitura: { status: string; paymentIntentId?: string },
): string | null {
  const pi = leitura.paymentIntentId;
  if (leitura.status !== 'pago' || !pi) return null;
  switch (depois.status) {
    case 'pago':
    case 'contestado':
      // o pedido ficou com outro pagamento: este é o repetido
      return depois.paymentIntentId && depois.paymentIntentId !== pi ? pi : null;
    case 'cancelado':
      return pi;
    case 'reembolsado':
      // a releitura do próprio pagamento que já voltou não devolve de novo
      return antes.paymentIntentId !== pi ? pi : null;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Reembolsos                                                          */

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');

/**
 * Um reembolso "em vigor" devolveu ou ainda vai devolver o dinheiro: todos, menos o que falhou ou foi cancelado.
 * O que nasce pendente (o banco ainda não respondeu) conta desde já. A Stripe não manda outro aviso quando ele se
 * conclui, só quando falha (refund.failed): esperar o "concluído" deixaria o voucher sem a marca e o botão do
 * painel livre para devolver o mesmo item outra vez.
 */
export function reembolsoEmVigor(status: string | null | undefined): boolean {
  return status !== 'failed' && status !== 'canceled';
}

export interface ReembolsoDoItem {
  voucher: string;
  centavos: number;
  reembolsoId: string;
  /** A Stripe ainda não concluiu este reembolso: o dinheiro está a caminho do cliente. */
  pendente: boolean;
}

/** A linha do histórico do voucher reembolsado sozinho; diz quando o dinheiro ainda está a caminho. */
export function eventoDoItemReembolsado(item: ReembolsoDoItem): string {
  const linha = `Item ${item.voucher} reembolsado (${cifra(item.centavos)}) pela Stripe (${item.reembolsoId})`;
  return item.pendente ? `${linha}: o dinheiro ainda está a caminho do cliente` : linha;
}

/** O que a cobrança relida na Stripe (com os reembolsos dela) significa para o pedido. */
export interface PlanoDoReembolso {
  /** A cobrança é a do pagamento do pedido; false quando é a de um pagamento repetido (duas abas) que voltou ao cliente. */
  doPedido: boolean;
  /** Quanto já voltou ao cliente nesta cobrança, no total (charge.amount_refunded). */
  reembolsadoCentavos: number;
  /** O que esta leitura acrescenta ao que o pedido já tinha registrado. */
  novoCentavos: number;
  /** A cobrança inteira voltou (charge.refunded): o pedido vira reembolsado. */
  total: boolean;
  /** Os vouchers reembolsados um a um (reembolsos em vigor cuja referência é o código do voucher). */
  itens: ReembolsoDoItem[];
  /** A linha para o histórico do pedido; null quando não há nada novo a registrar. */
  evento: string | null;
}

/**
 * Lê a cobrança e os reembolsos relidos na Stripe. `vouchers` são os códigos dos itens do pedido;
 * `paymentIntentDoPedido` é o pagamento gravado no pedido (sem ele, a cobrança é tida como a do pedido);
 * `jaDevolvidoCentavos` é o que o pedido já registrava (reembolsoCentavos). O reembolso ainda pendente conta como
 * o concluído (reembolsoEmVigor); a linha do histórico diz "registrado" em vez de "confirmado" enquanto houver um.
 */
export function planoDoReembolso(
  cobranca: Pick<Stripe.Charge, 'id' | 'amount' | 'amount_refunded' | 'refunded' | 'payment_intent'>,
  reembolsos: Pick<Stripe.Refund, 'id' | 'amount' | 'status' | 'metadata'>[],
  vouchers: readonly string[],
  paymentIntentDoPedido: string | undefined,
  jaDevolvidoCentavos = 0,
): PlanoDoReembolso {
  const pi = idDe(cobranca.payment_intent);
  const doPedido = !paymentIntentDoPedido || !pi || pi === paymentIntentDoPedido;
  const reembolsadoCentavos = cobranca.amount_refunded;
  const total = cobranca.refunded || reembolsadoCentavos >= cobranca.amount;
  const emVigor = reembolsos.filter((re) => reembolsoEmVigor(re.status));
  const itens = emVigor.flatMap((re) => {
    const voucher = re.metadata?.referencia;
    return voucher && vouchers.includes(voucher)
      ? [{ voucher, centavos: re.amount, reembolsoId: re.id, pendente: re.status !== 'succeeded' }]
      : [];
  });
  if (!doPedido) {
    return {
      doPedido,
      reembolsadoCentavos,
      novoCentavos: 0,
      total: false,
      itens: [],
      evento: `Pagamento repetido (${pi}) devolvido ao cliente pela Stripe: ${cifra(reembolsadoCentavos)}`,
    };
  }
  const novoCentavos = Math.max(0, reembolsadoCentavos - jaDevolvidoCentavos);
  // com algum reembolso ainda pendente, a Stripe já registrou a devolução, mas o dinheiro não chegou ao cliente
  const situacao = emVigor.some((re) => re.status !== 'succeeded')
    ? 'registrado na Stripe (o dinheiro ainda está a caminho do cliente)'
    : 'confirmado pela Stripe';
  const evento = total
    ? `Reembolso total (${cifra(reembolsadoCentavos)}) ${situacao}`
    : novoCentavos > 0
      ? `Reembolso de ${cifra(novoCentavos)} ${situacao}: ${cifra(reembolsadoCentavos)} de ${cifra(cobranca.amount)} devolvidos`
      : null;
  return { doPedido, reembolsadoCentavos, novoCentavos, total, itens, evento };
}

/** A linha do histórico para um reembolso que falhou na Stripe (relido); null se ele não está falho. */
export function eventoDoReembolsoFalho(
  reembolso: Pick<Stripe.Refund, 'id' | 'amount' | 'status' | 'failure_reason' | 'metadata'>,
): string | null {
  if (reembolso.status !== 'failed') return null;
  const referencia = reembolso.metadata?.referencia;
  const doItem = referencia && codigoValido(referencia) ? ` do item ${referencia}` : '';
  const motivo = reembolso.failure_reason ?? 'motivo não informado';
  return `Aviso: o reembolso${doItem} de ${cifra(reembolso.amount)} falhou na Stripe (${reembolso.id}, ${motivo}): devolver por outro meio`;
}

/* ------------------------------------------------------------------ */
/* Contestações (chargeback)                                            */

export interface LeituraDaContestacao {
  /** Para onde o pedido vai, se podeMudar deixar: aberta → contestado; ganha → pago; perdida → reembolsado. */
  status?: Extract<StatusReserva, 'contestado' | 'pago' | 'reembolsado'>;
  /** Na contestação perdida, quanto saiu da conta. */
  reembolsoCentavos?: number;
  evento: string;
}

/** Os status em que a contestação (ou o alerta prévio) ainda está em aberto e a equipe precisa agir. */
const ABERTAS: readonly string[] = [
  'needs_response',
  'under_review',
  'warning_needs_response',
  'warning_under_review',
  'appeal_needs_response',
  'appeal_under_review',
];

/** O que a contestação relida na Stripe significa para o pedido. */
export function leituraDaContestacao(d: Pick<Stripe.Dispute, 'id' | 'amount' | 'status' | 'reason'>): LeituraDaContestacao {
  if (ABERTAS.includes(d.status)) {
    return { status: 'contestado', evento: `Contestação aberta na Stripe (${d.id}): ${cifra(d.amount)}, motivo "${d.reason}"` };
  }
  switch (d.status) {
    case 'won':
      return { status: 'pago', evento: `Contestação ${d.id} ganha: o valor voltou para a conta` };
    case 'lost':
      return {
        status: 'reembolsado',
        reembolsoCentavos: d.amount,
        evento: `Contestação ${d.id} perdida: ${cifra(d.amount)} devolvidos ao cliente`,
      };
    case 'warning_closed':
      return { status: 'pago', evento: `Alerta de contestação ${d.id} encerrado sem disputa` };
    case 'prevented':
      return { status: 'pago', evento: `Contestação ${d.id} evitada pela Stripe` };
    default:
      return { evento: `Contestação ${d.id}: ${d.status}` };
  }
}
