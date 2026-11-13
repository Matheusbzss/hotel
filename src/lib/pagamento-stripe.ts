import type Stripe from 'stripe';
import type { Json } from './banco-tipos';
import { mensagemDoErro } from './erros.ts';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { formatarCifra } from './cifra.ts';
import { inicioDoItem, type FormaPagamento } from './formas-pagamento.ts';
import { agoraEmBuzios, paraMinutos } from './horarios.ts';
import { provedorDaReserva } from './pedidos-painel.ts';
import type { Reserva, StatusReserva } from './reservas';
import { modoStripe, obterSessao } from './stripe.ts';

/**
 * O pedido e a Stripe: o que cada estado da sessão significa para o pedido, quais mudanças de status são
 * permitidas e como aplicá-las. É daqui que o webhook (POST /api/webhooks/stripe) e a consulta do servidor
 * (GET /api/reservas/[codigo]) partem. Regras que não mudam:
 * - a verdade é a sessão relida na Stripe (obterSessao), nunca o corpo do evento nem a volta do navegador;
 * - o pedido só vira pago aqui (aplicarSessao), e pedidoPago roda uma vez só, na mudança de verdade;
 * - cada evento da Stripe é processado uma vez (registrarEventoStripe).
 * O banco (src/lib/reservas.ts, banco.ts) e o aviso à Meta são carregados só na hora de usar: eles são
 * "server-only" e não abrem fora do Next, e as regras puras daqui (podeMudar, interpretarSessao) são
 * testadas em node (tests/stripe.test.ts).
 */

export type OrigemAtualizacao = 'webhook' | 'consulta';

/** As mudanças de status que a Stripe pode causar. Fora desta tabela, nada muda (o painel tem as regras dele). */
const TRANSICOES: Record<StatusReserva, readonly StatusReserva[]> = {
  pendente: ['pago', 'expirado', 'cancelado'],
  // o Pix pode cair depois de a sessão vencer; "pagar de novo" abre outra sessão
  expirado: ['pago', 'pendente'],
  pago: ['reembolsado', 'contestado'],
  // a contestação pode ser ganha (volta a pago) ou perdida (reembolsado)
  contestado: ['pago', 'reembolsado'],
  cancelado: [],
  reembolsado: [],
  // só pedidos antigos (checkout da Pagar.me): o painel cuida deles
  recusado: [],
  // o caminho do WhatsApp não passa pela Stripe
  aguardando_whatsapp: [],
};

export function podeMudar(de: StatusReserva, para: StatusReserva): boolean {
  return de !== para && TRANSICOES[de].includes(para);
}

/** O que a sessão relida na Stripe diz sobre o pagamento. */
export interface LeituraSessao {
  /** 'pago'; 'pendente' (aberta, ou Pix gerado e ainda não pago); 'expirado' (vencida, ou Pix não pago no prazo). */
  status: Extract<StatusReserva, 'pago' | 'pendente' | 'expirado'>;
  /** O decline_code (ou o code) da última recusa do cartão; no Pix vencido sem pagamento, 'pix_expirado'. */
  motivoCodigo?: string;
  cartao?: { bandeira: string; final: string; pais?: string };
  /** Quanto o cliente viu na moeda dele (Adaptive Pricing), na menor unidade da moeda. */
  apresentado?: { moeda: string; valorCentavos: number };
  pagoEm?: string;
  paymentIntentId?: string;
  /** O país do endereço informado na Stripe (ISO de 2 letras). */
  clientePais?: string;
  /** A forma que a sessão cobrou, pela metadata gravada na criação. */
  forma?: FormaPagamento;
  /** O total que a sessão cobrou, em centavos de real. */
  valorCentavos?: number;
  sessaoId: string;
}

/** Um campo que a Stripe devolve como id ou, quando expandido, como objeto. */
const expandido = <T>(valor: string | T | null | undefined): T | undefined => (valor && typeof valor === 'object' ? valor : undefined);
const iso = (unix: number) => new Date(unix * 1000).toISOString();

/** Traduz a sessão da Stripe (relida com obterSessao) para o status do pedido e os dados do pagamento. */
export function interpretarSessao(sessao: Stripe.Checkout.Session): LeituraSessao {
  const pi = expandido<Stripe.PaymentIntent>(sessao.payment_intent);
  const paymentIntentId = typeof sessao.payment_intent === 'string' ? sessao.payment_intent : pi?.id;
  const cobranca = expandido<Stripe.Charge>(pi?.latest_charge);
  const erro = pi?.last_payment_error;
  const motivo = erro?.decline_code ?? erro?.code;
  const forma = sessao.metadata?.forma;
  const comum: Pick<LeituraSessao, 'sessaoId' | 'paymentIntentId' | 'forma' | 'valorCentavos'> = {
    sessaoId: sessao.id,
    ...(paymentIntentId ? { paymentIntentId } : {}),
    ...(forma === 'pix' || forma === 'cartao' ? { forma } : {}),
    ...(typeof sessao.amount_total === 'number' ? { valorCentavos: sessao.amount_total } : {}),
  };

  if (sessao.payment_status === 'paid') {
    const cartao = cobranca?.payment_method_details?.card;
    const apresentado = sessao.presentment_details;
    const pais = sessao.customer_details?.address?.country;
    return {
      ...comum,
      status: 'pago',
      pagoEm: iso(cobranca?.created ?? pi?.created ?? sessao.created),
      ...(cartao
        ? { cartao: { bandeira: cartao.brand ?? '', final: cartao.last4 ?? '', ...(cartao.country ? { pais: cartao.country } : {}) } }
        : {}),
      ...(apresentado
        ? { apresentado: { moeda: apresentado.presentment_currency.toUpperCase(), valorCentavos: apresentado.presentment_amount } }
        : {}),
      ...(pais ? { clientePais: pais } : {}),
    };
  }
  if (sessao.status === 'expired') return { ...comum, status: 'expirado', ...(motivo ? { motivoCodigo: motivo } : {}) };
  if (sessao.status === 'complete') {
    // o cliente concluiu sem pagar na hora: é o Pix com o QR gerado (no cartão a sessão só fica completa com o
    // pagamento feito). Pagamento cancelado ou que falhou = o Pix venceu sem ser pago (async_payment_failed).
    // O motivo é sempre 'pix_expirado', nunca o código que a Stripe deixa no erro do pagamento: esse código cru
    // cairia na recusa genérica do cartão, e o cliente leria "cartão recusado" num pedido de Pix.
    if (pi && (pi.status === 'canceled' || pi.status === 'requires_payment_method')) {
      return { ...comum, status: 'expirado', motivoCodigo: 'pix_expirado' };
    }
    return { ...comum, status: 'pendente' };
  }
  // aberta: o cliente ainda está no formulário; se um cartão foi recusado, o motivo fica aqui
  return { ...comum, status: 'pendente', ...(motivo ? { motivoCodigo: motivo } : {}) };
}

/* ------------------------------------------------------------------ */

type Banco = typeof import('./banco.ts');

/**
 * O banco, quando é ele quem guarda os eventos. Sem o endereço do Supabase (os testes, o computador sem
 * .env.local) o banco.ts nem é carregado: ele é "server-only" e não abre fora do Next. Com o endereço, quem
 * decide é usarBanco() (chave configurada e, na Vercel ou com RESERVAS_NO_BANCO=1). A chave secreta só o
 * banco.ts lê.
 */
async function carregarBanco(): Promise<Banco | null> {
  if (!process.env.SUPABASE_URL) return null;
  const banco = await import('./banco.ts');
  return banco.usarBanco() ? banco : null;
}

/** O que fazer com uma entrega do webhook: é nova, já foi processada, ou outra entrega ainda cuida dela. */
export type EntregaDoEvento = 'novo' | 'repetido' | 'em-andamento';

/**
 * Quanto tempo uma entrega tem para terminar antes que outra assuma o evento. A função do webhook vive no máximo
 * 60 s (maxDuration da rota): 2 minutos sem a marca de processado querem dizer que ela foi cortada no meio.
 */
export const EVENTO_EM_ANDAMENTO_MS = 2 * 60_000;

/**
 * O que fazer com um evento que já estava registrado. Processado: é repetido (200 e nada). Registrado há pouco e
 * ainda sem a marca: outra entrega cuida dele. Registrado há 2 minutos ou mais e sem a marca: a entrega anterior
 * morreu no meio, e esta retoma o evento. Sem o banco, para ser testada em node (tests/stripe.test.ts).
 */
export function entregaRepetida(
  visto: { recebidoEm: number; processado: boolean },
  agora: number,
): 'repetido' | 'em-andamento' | 'retomar' {
  if (visto.processado) return 'repetido';
  return agora - visto.recebidoEm < EVENTO_EM_ANDAMENTO_MS ? 'em-andamento' : 'retomar';
}

const eventosVistos = new Map<string, { recebidoEm: number; processado: boolean }>();
/** Só no computador: o registro em memória não cresce para sempre. */
const MAXIMO_EVENTOS_EM_MEMORIA = 5000;

/**
 * Registra o evento do webhook ANTES de processá-lo e diz o que fazer com esta entrega (a Stripe reenvia por até
 * 3 dias, fora de ordem, e às vezes duas vezes ao mesmo tempo):
 * - 'novo': processar. Quando terminar, a rota chama concluirEventoStripe; se falhar, esquecerEventoStripe.
 * - 'repetido': uma entrega anterior já terminou o trabalho. A rota responde 200 e não faz nada.
 * - 'em-andamento': outra entrega registrou o evento há menos de 2 minutos e ainda não terminou. A rota NÃO
 *   responde 2xx, para a Stripe tentar de novo mais tarde.
 * Um evento registrado há 2 minutos ou mais e nunca concluído (a função foi cortada antes de terminar) é
 * retomado: esta entrega vira 'novo'. No banco é a tabela pagamentos_eventos (recebido_em e processado_em); no
 * computador, um registro em memória. O payload é só um resumo (ids e status).
 */
export async function registrarEventoStripe(
  eventoId: string,
  tipo: string,
  codigo: string | null,
  payload?: Json,
  agora: Date = new Date(),
): Promise<EntregaDoEvento> {
  const banco = await carregarBanco();
  if (!banco) {
    const visto = eventosVistos.get(eventoId);
    if (visto) {
      const entrega = entregaRepetida(visto, agora.getTime());
      if (entrega !== 'retomar') return entrega;
    } else if (eventosVistos.size >= MAXIMO_EVENTOS_EM_MEMORIA) eventosVistos.clear();
    eventosVistos.set(eventoId, { recebidoEm: agora.getTime(), processado: false });
    return 'novo';
  }
  const tabela = () => banco.supabase().from('pagamentos_eventos');
  const { error } = await tabela().insert({
    id: eventoId,
    tipo,
    pedido_codigo: codigo,
    payload: payload ?? null,
    recebido_em: agora.toISOString(),
  });
  if (!error) return 'novo';
  if (error.code !== '23505') throw new Error(`Banco de dados: ${error.message}`);

  // chave repetida: o evento já foi registrado por outra entrega
  const lido = await tabela().select('recebido_em, processado_em').eq('id', eventoId).maybeSingle();
  if (lido.error) throw new Error(`Banco de dados: ${lido.error.message}`);
  // sumiu entre o registro e a leitura: a outra entrega falhou e desfez o registro; a Stripe tenta de novo
  if (!lido.data) return 'em-andamento';
  const entrega = entregaRepetida(
    { recebidoEm: Date.parse(lido.data.recebido_em), processado: !!lido.data.processado_em },
    agora.getTime(),
  );
  if (entrega !== 'retomar') return entrega;

  // retoma o evento parado. Só uma entrega consegue: a que troca a hora primeiro tira a linha do filtro das outras
  const limite = new Date(agora.getTime() - EVENTO_EM_ANDAMENTO_MS).toISOString();
  const retomado = await tabela()
    .update({ recebido_em: agora.toISOString() })
    .eq('id', eventoId)
    .is('processado_em', null)
    .lte('recebido_em', limite)
    .select('id');
  if (retomado.error) throw new Error(`Banco de dados: ${retomado.error.message}`);
  return retomado.data.length ? 'novo' : 'em-andamento';
}

/**
 * Tira UM evento do registro, quando o processamento dele falhou: assim a nova tentativa da Stripe não é tomada
 * por repetida. Só este evento, na memória e na tabela pagamentos_eventos; os outros continuam registrados, e um
 * evento antigo que chegue de novo não é processado outra vez.
 */
export async function esquecerEventoStripe(eventoId: string): Promise<void> {
  eventosVistos.delete(eventoId);
  const banco = await carregarBanco();
  if (!banco) return;
  const { error } = await banco.supabase().from('pagamentos_eventos').delete().eq('id', eventoId);
  if (error) throw new Error(`Banco de dados: ${error.message}`);
}

/**
 * Marca o evento como processado, depois que o trabalho dele terminou: só a partir daí uma entrega repetida é
 * respondida como 'repetido'. Sem essa marca, a próxima entrega espera (em andamento) ou, passados 2 minutos,
 * retoma o evento.
 */
export async function concluirEventoStripe(eventoId: string, agora: Date = new Date()): Promise<void> {
  const visto = eventosVistos.get(eventoId);
  if (visto) visto.processado = true;
  const banco = await carregarBanco();
  if (!banco) return;
  const { error } = await banco.supabase().from('pagamentos_eventos').update({ processado_em: agora.toISOString() }).eq('id', eventoId);
  if (error) throw new Error(`Banco de dados: ${error.message}`);
}

/** Só para os testes: esquece todos os eventos em memória. */
export function zerarEventosEmMemoria(): void {
  eventosVistos.clear();
}

/* ------------------------------------------------------------------ */

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');

/**
 * Os dois avisos que um pagamento confirmado pode deixar no histórico. Começam com "Aviso:" (o painel destaca
 * a linha, ver ehAviso) e terminam no que a equipe faz em seguida, como os avisos de devolução.
 */
export const avisoDeValorDiferente = (recebidoCentavos: number, esperadoCentavos: number) =>
  `Aviso: a Stripe recebeu ${cifra(recebidoCentavos)} e o pedido esperava ${cifra(esperadoCentavos)}: conferir na Stripe e acertar a diferença com o cliente`;
export const AVISO_PAGO_DEPOIS_DO_HORARIO =
  'Aviso: o pagamento chegou depois do horário do serviço: ver com o parceiro se ainda dá para atender; se não der, reembolsar o cliente';

/**
 * O total que o pedido esperava receber na forma registrada (o do pedido inteiro, não só deste voucher).
 * Etapa 7 (casas com sinal): aí o valor esperado passa a ser o que foi cobrado de fato (o sinal), não o total do
 * pedido; trocar aqui junto com o valor mandado para a sessão, senão todo pagamento de casa gera o aviso de valor.
 */
function valorEsperado(r: Reserva): number {
  const total = r.pedido?.totalCentavos ?? r.totalCentavos;
  const totalPix = r.pedido ? r.pedido.totalPixCentavos : r.totalPixCentavos;
  return r.pagamento.metodo === 'pix' ? (totalPix ?? total) : total;
}

/** O serviço já começou (o pagamento chegou tarde demais para o parceiro). */
function horarioJaPassou(r: Reserva, agora: Date): boolean {
  const { data, hora } = inicioDoItem(r);
  const { data: hoje, minutos } = agoraEmBuzios(agora);
  return data < hoje || (data === hoje && paraMinutos(hora) < minutos);
}

/**
 * O pagamento a mais: a sessão foi paga, mas o pedido já não espera pagamento (não está pendente nem expirado) e
 * tem OUTRO pagamento registrado. É a segunda aba paga depois da primeira, ou o QR de um Pix antigo pago depois
 * de o pedido ser pago por outro meio, cancelado, reembolsado ou contestado. Esse dinheiro não entra no pedido:
 * volta ao cliente. Devolve o id do pagamento a devolver, ou undefined quando a sessão não foi paga, quando o
 * pagamento é o do próprio pedido ou quando o pedido ainda não tem nenhum registrado (aí não há "outro": segue
 * o caminho de sempre). Sem o banco, para ser testada em node (tests/stripe.test.ts).
 */
export function pagamentoAMais(
  pedido: Pick<Reserva, 'status' | 'paymentIntentId'>,
  leitura: Pick<LeituraSessao, 'status' | 'paymentIntentId'>,
): string | undefined {
  const pi = leitura.paymentIntentId;
  if (leitura.status !== 'pago' || !pi || podeAbrirSessao(pedido.status)) return undefined;
  return pedido.paymentIntentId && pedido.paymentIntentId !== pi ? pi : undefined;
}

export interface ResultadoSessao {
  /** A reserva depois da mudança (ou como estava), ou null se o pedido não existir. */
  reserva: Reserva | null;
  leitura: LeituraSessao;
  /** O pedido virou pago AGORA, nesta chamada (pedidoPago já rodou). */
  virouPago: boolean;
  /**
   * A sessão foi paga por um pagamento a mais (pagamentoAMais): o pedido não mudou e este pagamento tem de
   * voltar ao cliente (criarReembolso). Vem em toda chamada, não só na primeira: quem devolve é o webhook, e a
   * chave de idempotência do reembolso impede devolver duas vezes.
   */
  pagamentoRepetido?: string;
}

/**
 * Aplica ao pedido o que a sessão relida na Stripe diz: relê a reserva, confere podeMudar, grava o status, os
 * ids, o cartão (bandeira, 4 dígitos, país), a moeda apresentada e o histórico; devolve se virou pago. É a
 * única porta pela qual um pedido online vira pago. `codigo` é o do pedido (metadata.codigo) ou de um voucher.
 * Um pedido que já não espera pagamento não é mexido pela sessão paga por OUTRO pagamento: nem o pagamento
 * registrado nem o status mudam, e o resultado traz pagamentoRepetido. Um pedido contestado não volta a pago por
 * aqui, nem pela sessão do mesmo pagamento (é só o aviso de pago chegando de novo, fora de ordem): quem tira o
 * pedido de contestado é o fim da contestação (charge.dispute.closed, no webhook).
 */
export async function aplicarSessao(
  codigo: string,
  sessao: Stripe.Checkout.Session,
  origem: OrigemAtualizacao,
  agora: Date = new Date(),
): Promise<ResultadoSessao> {
  const { atualizarReserva, obterReservaDoPedido, registrar } = await import('./reservas.ts');
  const leitura = interpretarSessao(sessao);
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return { reserva: null, leitura, virouPago: false };

  const agoraIso = agora.toISOString();
  const quem = origem === 'webhook' ? 'webhook da Stripe' : 'consulta à Stripe';
  let virouPago = false;
  let virouExpirado = false;
  let repetido: string | undefined;

  // atualizarReserva pode chamar de novo em caso de conflito: tudo que decide o resultado nasce aqui dentro
  const reserva = await atualizarReserva(alvo.codigo, (r) => {
    virouPago = false;
    virouExpirado = false;
    repetido = undefined;
    r.pagamento.ultimaConsulta = agoraIso;
    const corrente = !r.pagamentoExternoId || r.pagamentoExternoId === sessao.id;

    // o pedido já não espera pagamento e tem OUTRO pagamento registrado (segunda aba, o QR de um Pix antigo pago
    // depois): nada muda no pedido, nem o pagamento registrado nem o status, e este dinheiro volta ao cliente
    const aMais = pagamentoAMais(r, leitura);
    if (aMais) {
      repetido = aMais;
      // a nota entra uma vez só no histórico; o resultado não depende dela (o reembolso tem chave de idempotência)
      if (r.historico.some((h) => h.evento.includes(aMais))) return origem === 'consulta' ? r : null;
      const nota =
        r.status === 'pago' || r.status === 'contestado' ? 'Pagamento repetido na Stripe' : `Pagamento na Stripe de um pedido ${r.status}`;
      return registrar(r, `${nota} (${aMais}): devolver ao cliente`);
    }
    if (leitura.status === 'pago') {
      // já estava pago por este mesmo pagamento: é o evento chegando de novo
      if (r.status === 'pago') return origem === 'consulta' ? r : null;
      // contestado não volta a pago por aqui, nem pela sessão do mesmo pagamento (é o aviso de pago chegando de
      // novo): só o fim da contestação (charge.dispute.closed, em contestacao() no webhook) tira o pedido daí
      if (r.status === 'contestado') return origem === 'consulta' ? r : null;
    }
    // uma sessão antiga do pedido (já trocada por outra) não muda nada, a não ser que tenha sido paga
    if (!corrente && leitura.status !== 'pago') return origem === 'consulta' ? r : null;

    let mudou = false;
    if (leitura.motivoCodigo && leitura.status !== 'pago' && r.pagamento.motivoCodigo !== leitura.motivoCodigo) {
      r.pagamento.motivoCodigo = leitura.motivoCodigo;
      mudou = true;
    }
    if (leitura.paymentIntentId && r.paymentIntentId !== leitura.paymentIntentId) {
      r.paymentIntentId = leitura.paymentIntentId;
      mudou = true;
    }
    if (!podeMudar(r.status, leitura.status)) return origem === 'consulta' || mudou ? r : null;

    r.status = leitura.status;
    if (leitura.status === 'pago') {
      virouPago = true;
      r.provedor = 'stripe';
      r.pagamentoExternoId = sessao.id;
      if (leitura.forma) r.pagamento.metodo = leitura.forma;
      r.pagamento.pagoEm = leitura.pagoEm ?? agoraIso;
      if (leitura.cartao) {
        r.pagamento.cartaoBandeira = leitura.cartao.bandeira;
        r.pagamento.cartaoFinal = leitura.cartao.final;
        if (leitura.cartao.pais) r.pagamento.cartaoPais = leitura.cartao.pais;
      }
      if (leitura.apresentado) r.pagamento.apresentado = leitura.apresentado;
      if (leitura.clientePais) r.cliente.pais = leitura.clientePais;
      // a recusa de uma tentativa anterior não interessa mais
      delete r.pagamento.motivoCodigo;
      registrar(r, `Pago (${quem})`);
      const esperado = valorEsperado(r);
      if (leitura.valorCentavos !== undefined && leitura.valorCentavos !== esperado) {
        registrar(r, avisoDeValorDiferente(leitura.valorCentavos, esperado));
      }
      // não reembolsa sozinho: a equipe confere com o parceiro
      if (horarioJaPassou(r, agora)) registrar(r, AVISO_PAGO_DEPOIS_DO_HORARIO);
      return r;
    }
    virouExpirado = leitura.status === 'expirado';
    const porque = leitura.motivoCodigo === 'pix_expirado' ? 'Pix não pago no prazo' : 'O tempo para pagar terminou';
    return registrar(r, `${leitura.status === 'expirado' ? porque : `Status ${leitura.status}`} (${quem})`);
  });

  if (virouPago && reserva) await pedidoPago(reserva, leitura);
  if (virouExpirado && reserva) await pedidoExpirou(reserva, leitura);
  return { reserva, leitura, virouPago, ...(repetido ? { pagamentoRepetido: repetido } : {}) };
}

/**
 * O que acontece UMA vez, quando o pedido vira pago de verdade (a mudança confirmada por atualizarReserva):
 * o evento de compra para a Meta, o e-mail com os vouchers (Etapa 6) e, na Etapa 7, o cadastro de hóspedes. Falhas
 * aqui nunca desfazem o pagamento: só ficam no registro do servidor.
 */
export async function pedidoPago(reserva: Reserva, dados: LeituraSessao): Promise<void> {
  try {
    const { avisarCompra } = await import('./avisar-compra.ts');
    await avisarCompra(reserva);
    await enviarConfirmacaoPorEmail(reserva, dados);
    await cadastrarHospedes(reserva, dados);
  } catch (e) {
    console.error(`[pagamento] falha nos avisos do pedido pago ${reserva.pedido?.codigo ?? reserva.codigo}: ${mensagemDoErro(e)}`);
  }
}

/**
 * Etapa 6: o e-mail do pagamento aprovado, com um voucher por item (src/lib/email/pedidos.ts). Sai depois da
 * resposta (after), para o webhook responder na hora; o mesmo e-mail não sai duas vezes (o histórico do pedido e a
 * chave de idempotência do Resend). Sem RESEND_API_KEY, nada sai.
 */
async function enviarConfirmacaoPorEmail(reserva: Reserva, _dados: LeituraSessao): Promise<void> {
  const { agendarEmailDoPedido } = await import('./email/pedidos.ts');
  agendarEmailDoPedido('pagamento-aprovado', reserva.pedido?.codigo ?? reserva.codigo);
}

/**
 * O pedido virou expirado (a sessão venceu, ou o Pix gerado não foi pago no prazo): no Pix, o e-mail com o link para
 * pagar de novo (Etapa 6), um por sessão vencida. O cartão que vence sem pagamento não manda nada: o cliente já
 * recebeu o link do pedido no e-mail do pedido recebido. Uma falha aqui não muda o pedido.
 */
async function pedidoExpirou(reserva: Reserva, dados: LeituraSessao): Promise<void> {
  if ((dados.forma ?? reserva.pagamento.metodo) !== 'pix') return;
  try {
    const { agendarEmailDoPedido } = await import('./email/pedidos.ts');
    agendarEmailDoPedido('pix-vencido', reserva.pedido?.codigo ?? reserva.codigo, { sessaoId: dados.sessaoId });
  } catch (e) {
    console.error(`[pagamento] falha ao agendar o e-mail do Pix vencido ${reserva.pedido?.codigo ?? reserva.codigo}: ${mensagemDoErro(e)}`);
  }
}

/** Etapa 7: o cadastro dos hóspedes da casa depois do sinal pago. Ainda não existe; o gancho fica aqui. */
async function cadastrarHospedes(_reserva: Reserva, _dados: LeituraSessao): Promise<void> {}

/**
 * A rede de segurança quando o webhook atrasa: relê a sessão corrente do pedido na Stripe e aplica o que ela
 * diz. Quem decide a hora, e segura as consultas repetidas, é conferirNaStripe (src/app/api/pedido/pedido-stripe.ts),
 * para a rota do status e para as páginas do pedido e da reserva. O navegador nunca decide: quem consulta é o
 * servidor. Devolve a reserva (mudada ou não), ou null se o pedido não existir.
 */
export async function sincronizarComStripe(codigo: string, agora: Date = new Date()): Promise<Reserva | null> {
  const { obterReservaDoPedido } = await import('./reservas.ts');
  const r = await obterReservaDoPedido(codigo);
  if (!r || provedorDaReserva(r) !== 'stripe' || !r.pagamentoExternoId || modoStripe() === 'desligado') return r;
  const sessao = await obterSessao(r.pagamentoExternoId);
  return (await aplicarSessao(codigo, sessao, 'consulta', agora)).reserva ?? r;
}

/**
 * O webhook payment_intent.payment_failed: guarda o motivo da recusa do cartão (decline_code) SEM mudar o
 * status; a página do pedido mostra o motivo em linguagem simples (src/lib/recusas.ts) e oferece o Pix. Num
 * pedido já pago não faz nada (a recusa é de uma tentativa anterior). Devolve null se o pedido não existir.
 */
export async function registrarRecusa(codigo: string, declineCode: string, paymentIntentId?: string): Promise<Reserva | null> {
  const { atualizarReserva, obterReservaDoPedido, registrar } = await import('./reservas.ts');
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return null;
  return atualizarReserva(alvo.codigo, (r) => {
    if (r.status === 'pago') return null;
    r.pagamento.motivoCodigo = declineCode;
    if (paymentIntentId) r.paymentIntentId = paymentIntentId;
    return registrar(r, `Cartão recusado (${declineCode})`);
  });
}

/* ------------------------------------------------------------------ */

/** Um pedido só abre uma sessão de pagamento enquanto está pendente ou expirado. */
export const podeAbrirSessao = (status: StatusReserva): boolean => status === 'pendente' || status === 'expirado';

const EVENTO_SESSAO = 'Sessão de pagamento criada';

/** O número da próxima tentativa de pagamento do pedido (a chave de idempotência da sessão): 1 na primeira. */
export const proximaTentativa = (r: Reserva): number => r.historico.filter((h) => h.evento.startsWith(EVENTO_SESSAO)).length + 1;

/**
 * O que a sessão recém-criada muda no pedido: ela passa a ser a corrente, a forma escolhida vira a forma do
 * pedido e um pedido expirado volta a pendente. Devolve a linha do histórico. A trava: num pedido que já não
 * abre sessão (pago em outra aba, cancelado no painel, reembolsado ou contestado enquanto a sessão nascia)
 * não mexe em nada e devolve null. Sem o banco, para ser testada em node (tests/stripe.test.ts).
 */
export function sessaoNovaNoPedido(r: Reserva, sessaoId: string, forma: FormaPagamento): string | null {
  if (!podeAbrirSessao(r.status)) return null;
  r.provedor = 'stripe';
  r.pagamentoExternoId = sessaoId;
  r.pagamento.metodo = forma;
  // a recusa da tentativa anterior não vale para a sessão nova
  delete r.pagamento.motivoCodigo;
  if (podeMudar(r.status, 'pendente')) r.status = 'pendente';
  return `${EVENTO_SESSAO}: ${forma === 'pix' ? 'Pix' : 'cartão'} (${sessaoId})`;
}

/** O que registrarSessaoCriada devolve: o pedido como ficou e a sessão que a nova tirou do lugar, se havia outra. */
export interface SessaoRegistrada {
  reserva: Reserva;
  /** A sessão que estava no pedido na hora de gravar (pode ser a de outro "Pagar" quase simultâneo), se era outra. */
  substituida?: string;
}

/**
 * Grava no pedido a sessão recém-criada (sessaoNovaNoPedido). Chamar logo depois de criarSessaoPagamento; a
 * sessão anterior, se ainda estava aberta, só é expirada depois (abrirSessaoDoPedido explica a ordem).
 * Só grava num pedido pendente ou expirado. Em qualquer outro status nada muda e o pedido volta COMO ESTÁ, com
 * a sessão que já tinha: quem chama confere se a sessão gravada é a nova e, se não for, expira a recém-criada.
 * Devolve também a sessão que a nova tirou do lugar, lida na MESMA gravação: com dois "Pagar" quase juntos ela é
 * a sessão do outro clique, que quem chama não conhecia e precisa fechar. Devolve null se o pedido não existir.
 */
export async function registrarSessaoCriada(
  codigo: string,
  sessao: Pick<Stripe.Checkout.Session, 'id'>,
  forma: FormaPagamento,
): Promise<SessaoRegistrada | null> {
  const { atualizarReserva, obterReservaDoPedido, registrar } = await import('./reservas.ts');
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return null;
  // num objeto, e não numa variável solta, para o TypeScript não achar que o valor nunca muda (ele muda lá dentro)
  const lido: { substituida?: string } = {};
  const reserva = await atualizarReserva(alvo.codigo, (r) => {
    // atualizarReserva pode chamar isto mais de uma vez (outra gravação no meio): vale a leitura da vez que gravou
    const corrente = r.pagamentoExternoId;
    // a trava de status fica no começo de sessaoNovaNoPedido: sem a linha do histórico, nada é gravado
    const evento = sessaoNovaNoPedido(r, sessao.id, forma);
    delete lido.substituida;
    if (evento && corrente && corrente !== sessao.id) lido.substituida = corrente;
    return evento ? registrar(r, evento) : null;
  });
  return reserva ? { reserva, ...lido } : null;
}
