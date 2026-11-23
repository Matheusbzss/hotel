import type Stripe from 'stripe';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import type { Json } from '../../../../lib/banco-tipos';
import { formatarCifra } from '../../../../lib/cifra.ts';
import { codigoValido } from '../../../../lib/codigo-reserva.ts';
import { podeAbrirSessao, podeMudar } from '../../../../lib/pagamento-stripe.ts';
import {
  linhaDaDevolucaoRepetidaQueFalhou,
  linhaDoReembolsoFalho,
  linhaDoReembolsoParadoPelaContestacao,
  linhaDoReembolsoSemVoucher,
} from '../../../../lib/reembolsos-a-resolver.ts';
import type { Reserva, StatusReserva } from '../../../../lib/reservas';

/**
 * O que o webhook da Stripe (POST /api/webhooks/stripe) decide sem rede nem banco: de que pedido o evento fala,
 * o resumo que fica guardado com o evento e o que uma cobrança reembolsada, um reembolso que falhou ou uma contestação
 * significam para o pedido. Testado em tests/webhook-stripe.test.ts. A regra geral continua a de
 * src/lib/pagamento-stripe.ts: a verdade é o objeto relido na Stripe, nunca o corpo do evento; a rota relê antes de
 * chamar o que está aqui. A Stripe não garante a ordem dos avisos: o pedido tem de terminar igual em qualquer ordem
 * (a contestação antes do pago, o reembolso que falha antes do aviso dele). A sequência da contestação mora aqui
 * (aplicarContestacao), com o banco e a Stripe passados de fora pela rota, para as duas ordens serem provadas em node.
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

/** O que interessa do pedido para saber de quem é um pagamento (o pagamento parado de um pedido cancelado, Pacote 22). */
type PedidoDoPagamento = Pick<Reserva, 'status' | 'paymentIntentId'> & { pagamento?: Pick<Reserva['pagamento'], 'retido'> };

/**
 * O pagamento de uma sessão paga que o pedido não pode ficar: o pedido já estava pago (ou contestado) por outro
 * pagamento, numa segunda aba; foi cancelado (o cliente refez a compra, a equipe cancelou) e o QR de um Pix antigo
 * foi pago depois; ou já tinha sido devolvido. Esse dinheiro volta ao cliente (criarReembolso). Recebe o pedido
 * antes e depois de aplicarSessao e a leitura da sessão relida na Stripe; null quando o pagamento é o do pedido.
 * Não depende do histórico: um evento repetido (ou a nova tentativa depois de uma falha) acha o mesmo pagamento, e
 * a chave de idempotência do reembolso impede devolver duas vezes. Quando o pedido tem OUTRO pagamento registrado,
 * aplicarSessao não o troca e já devolve pagamentoRepetido; esta leitura cobre também o que sobra: o pedido
 * cancelado pago pelo pagamento que ele mesmo tinha (o Pix gerado antes de cancelar) ou sem nenhum registrado. Desde o
 * Pacote 22 (23/11), o pedido cancelado e nunca pago guarda esse pagamento parado (pagamento.retido, aplicarSessao) e
 * ele não volta por aqui: a equipe decide no painel; o pagamento parado é o registrado do pedido, e outro volta.
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
      // o pagamento parado do pedido cancelado (Pacote 22) não volta sozinho: a equipe decide no painel. Um outro volta
      return depois.pagamento?.retido?.paymentIntentId === pi ? null : pi;
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

/** A referência (e a chave de idempotência) da devolução de um pagamento que o pedido não pode ficar (route.ts). */
export const REFERENCIA_DEVOLUCAO = 'pagamento-repetido';

/**
 * As referências que o site grava num reembolso (metadata.referencia, criarReembolso em src/lib/stripe.ts) além do
 * código de um voucher do pedido: o pedido inteiro ("Reembolsar tudo" no painel) e a devolução de um pagamento a mais.
 */
export const REFERENCIAS_DO_SITE: readonly string[] = ['total', REFERENCIA_DEVOLUCAO];

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
  /** Os reembolsos em vigor que o site não pediu (feitos direto na Stripe); vazio quando a cobrança não é a do pedido. */
  foraDoSite: ReembolsoForaDoSite[];
  /** A linha para o histórico do pedido; null quando não há nada novo a registrar. */
  evento: string | null;
}

/** Um reembolso em vigor que o site não pediu: feito direto no painel da Stripe (ou pela Stripe CLI). */
export interface ReembolsoForaDoSite {
  reembolsoId: string;
  centavos: number;
}

/**
 * Os reembolsos em vigor que o site não pediu: sem referência, ou com uma que não é o código de um voucher do pedido
 * nem uma das do site (REFERENCIAS_DO_SITE). O que falhou ou foi cancelado não entra (não devolveu nada).
 */
export function reembolsosForaDoSite(
  reembolsos: readonly Pick<Stripe.Refund, 'id' | 'amount' | 'status' | 'metadata'>[],
  vouchers: readonly string[],
): ReembolsoForaDoSite[] {
  return reembolsos
    .filter((re) => {
      const referencia = re.metadata?.referencia;
      const doSite = !!referencia && (vouchers.includes(referencia) || REFERENCIAS_DO_SITE.includes(referencia));
      return reembolsoEmVigor(re.status) && !doSite;
    })
    .map((re) => ({ reembolsoId: re.id, centavos: re.amount }));
}

/** Quanto a Stripe tem como devolvido, ou a caminho, nos reembolsos de um pagamento (os em vigor). */
export const devolvidoNaStripe = (reembolsos: readonly Pick<Stripe.Refund, 'amount' | 'status'>[]): number =>
  reembolsos.filter((re) => reembolsoEmVigor(re.status)).reduce((soma, re) => soma + re.amount, 0);

/**
 * A Stripe tem MENOS devolvido do que o site registra (reembolsoCentavos): um reembolso falhou ou foi cancelado lá.
 * Aí o site não pede outro: "Reembolsar tudo" vai à Stripe sem valor e devolveria mais do que o painel mostra. A
 * comparação é de um lado só, de propósito: com MAIS na Stripe (o segundo clique antes de o aviso chegar), o pedido
 * segue e a chave de idempotência do reembolso cuida.
 */
export const stripeDevolveuMenos = (reembolsos: readonly Pick<Stripe.Refund, 'amount' | 'status'>[], registradoCentavos: number): boolean =>
  devolvidoNaStripe(reembolsos) < registradoCentavos;

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
      foraDoSite: [],
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
  return { doPedido, reembolsadoCentavos, novoCentavos, total, itens, foraDoSite: reembolsosForaDoSite(reembolsos, vouchers), evento };
}

/** O que a cobrança relida muda no pedido: o valor que voltou, o status no reembolso total e a linha do histórico. */
export interface MudancaDoReembolso {
  status?: 'reembolsado';
  reembolsoCentavos?: number;
  evento: string;
}

/**
 * O que a cobrança relida (planoDoReembolso) muda no pedido como ele está agora; null quando não há nada novo (a mesma
 * leitura chegando de novo). A devolução de um pagamento repetido só entra no histórico, uma vez. O valor nunca desce:
 * a releitura depois de um reembolso que falhou (amount_refunded menor) não desfaz o que o pedido já registra.
 */
export function mudancaDoReembolso(
  pedido: Pick<Reserva, 'status' | 'historico' | 'reembolsoCentavos'>,
  plano: Pick<PlanoDoReembolso, 'doPedido' | 'total' | 'reembolsadoCentavos' | 'evento'>,
): MudancaDoReembolso | null {
  const { evento } = plano;
  if (!evento) return null;
  if (!plano.doPedido) return pedido.historico.some((h) => h.evento === evento) ? null : { evento };
  const jaTinha = pedido.reembolsoCentavos ?? 0;
  const viraReembolsado = plano.total && podeMudar(pedido.status, 'reembolsado');
  // a mesma leitura chegando de novo (dois eventos para o mesmo reembolso): nada novo
  if (jaTinha >= plano.reembolsadoCentavos && !viraReembolsado) return null;
  return {
    ...(viraReembolsado ? { status: 'reembolsado' as const } : {}),
    reembolsoCentavos: Math.max(jaTinha, plano.reembolsadoCentavos),
    evento,
  };
}

/** Os vouchers que a cobrança relida manda marcar como reembolsados (o reembolso de um item), menos os já marcados. */
export const itensParaMarcar = (
  plano: Pick<PlanoDoReembolso, 'total' | 'itens'>,
  vouchers: readonly Pick<Reserva, 'codigo' | 'statusItem'>[],
): ReembolsoDoItem[] =>
  plano.total ? [] : plano.itens.filter((item) => vouchers.some((v) => v.codigo === item.voucher && v.statusItem !== 'reembolsado'));

/**
 * As linhas de aviso dos reembolsos de parte feitos direto na Stripe num pedido com vários itens (sem a referência de
 * um voucher, o site não sabe de qual foi), uma por reembolso e uma vez só. Nenhum voucher muda sozinho: a equipe diz
 * no painel de qual voucher foi, ou que foi um desconto. No pedido de um item, ou no reembolso total, não há o que
 * perguntar.
 */
export function avisosDeReembolsoSemVoucher(
  pedido: Pick<Reserva, 'historico'>,
  plano: Pick<PlanoDoReembolso, 'doPedido' | 'total' | 'foraDoSite'>,
  quantosVouchers: number,
): string[] {
  if (!plano.doPedido || plano.total || quantosVouchers < 2) return [];
  return plano.foraDoSite
    .filter((f) => !pedido.historico.some((h) => h.evento.includes(`(${f.reembolsoId})`)))
    .map((f) => linhaDoReembolsoSemVoucher({ id: f.reembolsoId, centavos: f.centavos }));
}

/** O reembolso relido na Stripe, com o que a linha e o efeito dele usam. */
type ReembolsoRelido = Pick<Stripe.Refund, 'id' | 'amount' | 'status' | 'failure_reason' | 'metadata'> &
  Partial<Pick<Stripe.Refund, 'payment_intent'>>;

/**
 * A linha do histórico para um reembolso que falhou na Stripe (relido); null se ele não está falho. São três:
 * - a contestação aberta com o reembolso a caminho (charge_for_pending_refund_disputed), de qualquer pagamento: o banco
 *   devolve pela contestação, e a linha diz para NÃO devolver por outro meio (devolver também pagaria duas vezes);
 * - a devolução de um pagamento repetido (o reembolso é de outro pagamento, não o do pedido): uma linha própria, que
 *   não mexe nas contas nem nos botões do pedido;
 * - as outras: a linha de antes, sem mudar uma letra (linhaDoReembolsoFalho, que o painel e a página do cliente leem
 *   de volta, src/lib/reembolsos-a-resolver.ts).
 */
export function eventoDoReembolsoFalho(reembolso: ReembolsoRelido, paymentIntentDoPedido?: string): string | null {
  if (reembolso.status !== 'failed') return null;
  const { id, amount: centavos } = reembolso;
  if (reembolso.failure_reason === 'charge_for_pending_refund_disputed') return linhaDoReembolsoParadoPelaContestacao({ id, centavos });
  const motivo = reembolso.failure_reason ?? 'motivo não informado';
  const pagamento = idDe(reembolso.payment_intent);
  if (paymentIntentDoPedido && pagamento && pagamento !== paymentIntentDoPedido) {
    return linhaDaDevolucaoRepetidaQueFalhou({ id, centavos, pagamento, motivo });
  }
  const referencia = reembolso.metadata?.referencia;
  return linhaDoReembolsoFalho({ id, centavos, ...(referencia && codigoValido(referencia) ? { voucher: referencia } : {}), motivo });
}

/** O que o reembolso falho do site aplica ao pedido quando o aviso dele (charge.refunded) ainda não foi tratado. */
export interface EfeitoDoReembolso {
  /**
   * O que muda no pedido; ausente quando o status e o valor já são esses (o charge.refunded já tinha contado este
   * reembolso). `evento`, a linha com o id do reembolso, só quando ela ainda não está no histórico.
   */
  pedido?: { status?: 'reembolsado'; reembolsoCentavos: number; evento?: string };
  /** O voucher do reembolso, que ainda vale e passa a reembolsado (atualizarItem, depois do pedido), com a linha dele. */
  voucher?: { codigo: string; evento: string };
}

/**
 * O reembolso que o site pediu (a referência é um voucher do pedido, ou "total") e que falhou ANTES de o pedido
 * registrar o aviso dele: o charge.refunded voltou pelo reenvio da Stripe depois da falha, e a releitura da cobrança
 * (o reembolso falho fora de amount_refunded e de reembolsoEmVigor) não aplica mais nada. Aqui está exatamente o que o
 * charge.refunded teria aplicado se este reembolso ainda estivesse valendo, calculado com a cobrança relida na Stripe
 * (`cobranca`), para o pedido terminar igual em qualquer ordem:
 * - o valor devolvido é o amount_refunded mais este reembolso, limitado ao valor cobrado, e o que o pedido registra
 *   nunca desce (o charge.refunded que gravou o valor e caiu antes de marcar o voucher não faz somar duas vezes);
 * - o reembolso que cobre o resto da cobrança (o total, ou o do último voucher) leva o pedido pago a reembolsado, e aí
 *   os vouchers seguem o pedido, como no reembolso total; senão, o voucher do reembolso vira reembolsado.
 * As travas: só o reembolso do site e do pagamento do pedido; "total" só com o pedido pago (nunca o contestado: aí vale
 * o que a contestação decidir); o voucher só com o pedido pago ou contestado e o voucher ainda valendo. O voucher não
 * volta a valer: a devolução foi pedida porque o serviço não vai acontecer; o que falhou foi o caminho do dinheiro.
 * Rodar de novo não muda nada (o valor pelo maior; a linha com o id do reembolso, uma vez); o voucher que ficou para trás
 * (a função cortada entre as duas gravações) volta na repetição. null: nada a aplicar.
 */
export function efeitoDoReembolsoDoSite(
  pedido: Pick<Reserva, 'status' | 'historico' | 'reembolsoCentavos' | 'paymentIntentId'>,
  vouchers: readonly Pick<Reserva, 'codigo' | 'statusItem'>[],
  reembolso: Pick<Stripe.Refund, 'id' | 'amount' | 'metadata'> & Partial<Pick<Stripe.Refund, 'payment_intent'>>,
  cobranca: Pick<Stripe.Charge, 'amount' | 'amount_refunded'>,
): EfeitoDoReembolso | null {
  const pagamento = idDe(reembolso.payment_intent);
  if (pedido.paymentIntentId && pagamento && pagamento !== pedido.paymentIntentId) return null;
  const referencia = reembolso.metadata?.referencia;
  const voucher = referencia === 'total' ? undefined : vouchers.find((v) => v.codigo === referencia);
  if (referencia === 'total') {
    // o reembolsado já registrou; o contestado fica com o que a contestação decidir
    if (pedido.status !== 'pago') return null;
  } else {
    // não é do site; ou o voucher já não vale (reembolsado ou cancelado sozinho, ou com o pedido inteiro)
    if (!voucher || (pedido.status !== 'pago' && pedido.status !== 'contestado')) return null;
    if (voucher.statusItem === 'reembolsado' || voucher.statusItem === 'cancelado') return null;
  }
  // o que o charge.refunded teria lido com este reembolso ainda em vigor (a cobrança relida já não o conta)
  const devolvido = Math.min(cobranca.amount, cobranca.amount_refunded + reembolso.amount);
  const jaTinha = pedido.reembolsoCentavos ?? 0;
  const reembolsoCentavos = Math.max(jaTinha, devolvido);
  const status = devolvido >= cobranca.amount && pedido.status === 'pago' ? ('reembolsado' as const) : undefined;
  const valor = cifra(reembolso.amount);
  const evento = `Reembolso de ${valor} (${reembolso.id}) aplicado ao pedido pelo aviso de falha: o aviso do reembolso não tinha chegado`;
  const anotado = pedido.historico.some((h) => h.evento === evento);
  const efeito: EfeitoDoReembolso = {};
  if (status || reembolsoCentavos !== jaTinha) {
    efeito.pedido = { ...(status ? { status } : {}), reembolsoCentavos, ...(anotado ? {} : { evento }) };
  }
  // com o pedido inteiro reembolsado, os vouchers seguem o pedido (como no charge.refunded total)
  if (voucher && !status) {
    efeito.voucher = {
      codigo: voucher.codigo,
      evento: `Item ${voucher.codigo} reembolsado (${valor}) pelo aviso de falha do reembolso (${reembolso.id}): o aviso do reembolso não tinha chegado`,
    };
  }
  return efeito.pedido || efeito.voucher ? efeito : null;
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

/**
 * A contestação relida pressupõe um pagamento (aberta, ganha ou perdida), e o pedido ainda espera pagamento (pendente
 * ou expirado): o aviso de pago ainda não foi tratado. Com o cartão 4000 0000 0000 0259 os dois avisos chegam no mesmo
 * segundo, em qualquer ordem.
 */
export const contestacaoPedePagoAntes = (pedido: Pick<Reserva, 'status'>, leitura: Pick<LeituraDaContestacao, 'status'>): boolean =>
  Boolean(leitura.status) && podeAbrirSessao(pedido.status);

/** O que a contestação relida muda no pedido. */
export interface MudancaDaContestacao {
  status?: LeituraDaContestacao['status'];
  reembolsoCentavos?: number;
  /** A linha do histórico, quando ainda não está gravada. */
  evento?: string;
}

/**
 * O que a contestação relida muda no pedido como ele está agora; null quando não há nada novo (o aviso repetido).
 * - A linha já gravada não impede a mudança de status: a "Contestação aberta" anotada num pedido que depois ficou pago
 *   é consertada sem repetir a linha.
 * - Na perdida, o valor da contestação é SOMADO ao que já tinha voltado (depois de um reembolso de parte, a Stripe abre
 *   a contestação pelo resto: cartão de teste 4000 0084 0000 0795), limitado ao valor cobrado (`cobradoCentavos`, a
 *   cobrança relida na Stripe) e só na primeira vez, com a linha ainda não gravada: o aviso repetido não soma de novo.
 *   O valor que o pedido já registra nunca desce.
 * - O pedido que ainda espera pagamento (pendente ou expirado: a sessão do pagamento não foi achada, não é do site ou
 *   não está paga) só ganha a linha: ele só vira pago pela porta de sempre (aplicarSessao), nunca pela contestação
 *   ganha, evitada ou com o alerta encerrado, e a perdida não grava valor devolvido num pedido que nunca foi pago.
 * `doPedido` falso (a contestação de outro pagamento do mesmo pedido): só a linha, com " (pagamento repetido pi_…)".
 */
export function mudancaDaContestacao(
  pedido: Pick<Reserva, 'status' | 'historico' | 'reembolsoCentavos'>,
  leitura: LeituraDaContestacao,
  doPedido: boolean,
  evento: string,
  cobradoCentavos?: number,
): MudancaDaContestacao | null {
  const anotado = pedido.historico.some((h) => h.evento === evento);
  const emDia = doPedido && !podeAbrirSessao(pedido.status);
  const status = emDia && leitura.status && podeMudar(pedido.status, leitura.status) ? leitura.status : undefined;
  const jaTinha = pedido.reembolsoCentavos ?? 0;
  const somado = jaTinha + (leitura.reembolsoCentavos ?? 0);
  const reembolso =
    emDia && leitura.reembolsoCentavos && !anotado ? Math.max(jaTinha, Math.min(somado, cobradoCentavos ?? somado)) : undefined;
  const mudaReembolso = reembolso !== undefined && reembolso !== jaTinha;
  if (anotado && !status && !mudaReembolso) return null;
  return { ...(status ? { status } : {}), ...(mudaReembolso ? { reembolsoCentavos: reembolso } : {}), ...(anotado ? {} : { evento }) };
}

/** O pedido como a contestação o lê e o muda. */
type PedidoDaContestacao = Pick<Reserva, 'codigo' | 'status' | 'historico' | 'reembolsoCentavos' | 'paymentIntentId'>;

/**
 * O que a contestação usa de fora. A rota passa as funções de verdade (o banco e a Stripe); os testes, um pedido em
 * memória: assim as duas ordens dos avisos são provadas em node, sem depender da sorte de a Stripe entregar trocado.
 */
export interface PassosDaContestacao<P extends PedidoDaContestacao> {
  /** Relê o pedido (obterReservaDoPedido). */
  lerPedido(codigo: string): Promise<P | null>;
  /** A sessão de pagamento (cs_…) de um pagamento, procurada na Stripe (sessaoDoPagamento), ou null. */
  acharSessao(paymentIntentId: string): Promise<string | null>;
  /**
   * Faz com a sessão o que o aviso de pago faria, pela porta de sempre (sessaoMudou → aplicarSessao, com a sessão
   * relida na Stripe). Devolve true quando a sessão é a que o site criou para o pedido e a Stripe a dá como paga.
   */
  aplicarPago(sessaoId: string, paymentIntentId: string): Promise<boolean>;
  /** Grava com a trava de versão (atualizarReserva): `alterar` devolve null quando não há nada a gravar. */
  gravar(codigo: string, alterar: (r: P) => P | null): Promise<P | null>;
  /** Acrescenta a linha ao histórico (registrar). */
  registrar(r: P, evento: string): P;
}

/**
 * A contestação relida na Stripe aplicada ao pedido, com o mesmo fim em qualquer ordem dos avisos. Quando ela
 * pressupõe um pagamento que o pedido ainda não registra (contestacaoPedePagoAntes), faz antes o que o aviso de pago
 * faria: acha a sessão do pagamento contestado e passa pela porta de sempre; só então aplica a contestação
 * (mudancaDaContestacao, com o pedido relido). Lança erro (a rota responde 500 e a Stripe entrega de novo) só quando a
 * sessão achada é do pedido e está paga e, mesmo assim, o pedido continua esperando pagamento. Sessão de fora do site,
 * não paga ou nenhuma: só a linha no histórico, como antes. Devolve o resultado para o registro do servidor.
 */
export async function aplicarContestacao<P extends PedidoDaContestacao>(
  codigo: string,
  disputa: Pick<Stripe.Dispute, 'id' | 'amount' | 'status' | 'reason' | 'payment_intent'>,
  cobradoCentavos: number | undefined,
  passos: PassosDaContestacao<P>,
): Promise<string> {
  let alvo = await passos.lerPedido(codigo);
  if (!alvo) return 'pedido não encontrado';
  const leitura = leituraDaContestacao(disputa);
  const pi = idDe(disputa.payment_intent);
  let pagoAntes = false;
  if (pi && contestacaoPedePagoAntes(alvo, leitura)) {
    const sessaoId = await passos.acharSessao(pi);
    if (sessaoId) {
      const pagaDoPedido = await passos.aplicarPago(sessaoId, pi);
      alvo = (await passos.lerPedido(codigo)) ?? alvo;
      // a Stripe diz que a sessão do pedido está paga e o pedido ainda não registra: nada é gravado, a Stripe entrega de novo
      if (pagaDoPedido && podeAbrirSessao(alvo.status)) {
        throw new Error(`contestação ${disputa.id} de um pagamento que o pedido ${codigo} ainda não registra`);
      }
      pagoAntes = pagaDoPedido;
    }
  }
  await passos.gravar(alvo.codigo, (r) => {
    // o pagamento do pedido como está agora: a contestação de outro pagamento do mesmo pedido (duas abas) só anota
    const doPedido = !r.paymentIntentId || !pi || pi === r.paymentIntentId;
    const evento = doPedido ? leitura.evento : `${leitura.evento} (pagamento repetido ${pi})`;
    const m = mudancaDaContestacao(r, leitura, doPedido, evento, cobradoCentavos);
    if (!m) return null;
    const pedido: PedidoDaContestacao = r;
    if (m.status) pedido.status = m.status;
    if (m.reembolsoCentavos !== undefined) pedido.reembolsoCentavos = m.reembolsoCentavos;
    return m.evento ? passos.registrar(r, m.evento) : r;
  });
  // no registro do servidor fica quando a contestação chegou antes do aviso de pago e o pagamento entrou por ela
  return `contestação ${disputa.status}${pagoAntes ? ' (o pago entrou antes, pela própria contestação)' : ''}`;
}
