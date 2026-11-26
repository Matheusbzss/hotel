import type Stripe from 'stripe';
import type { Json } from './banco-tipos';
import { mensagemDoErro } from './erros.ts';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { formatarCifra } from './cifra.ts';
import { segundosAteOInicio, type FormaPagamento, type ItemAgendado } from './formas-pagamento.ts';
import { avisoDoPagamentoRetido, pedidoNuncaPago, provedorDaReserva, valorEsperadoDoPedido } from './pedidos-painel.ts';
import { PIX_EXPIRADO } from './recusas.ts';
import type { Reserva, StatusReserva } from './reservas';
import { expirarSessao, limiteDoToqueDoPix, modoStripe, obterSessao } from './stripe.ts';

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
  /**
   * 'pago'; 'pendente' (aberta, ou Pix gerado e ainda não pago); 'expirado' (vencida, Pix não pago no prazo, ou o tempo
   * de gerar o Pix acabou).
   */
  status: Extract<StatusReserva, 'pago' | 'pendente' | 'expirado'>;
  /**
   * O decline_code (ou o code) da última recusa do cartão; no Pix vencido sem pagamento, 'pix_expirado'
   * (PIX_EXPIRADO). Num Pix, nunca o código cru do erro: ele cairia na recusa genérica do cartão.
   */
  motivoCodigo?: string;
  /**
   * A sessão continua aberta na Stripe e tem de ser fechada (aplicarSessao fecha, depois de gravar o pedido): o Pix
   * dela venceu sem pagamento, ou o tempo de gerar o Pix acabou. Só no Pix.
   */
  fecharSessao?: true;
  cartao?: { bandeira: string; final: string; pais?: string };
  /** Quanto o cliente viu na moeda dele (Adaptive Pricing), na menor unidade da moeda. */
  apresentado?: { moeda: string; valorCentavos: number };
  /**
   * Só no pago: a hora da cobrança que deu certo (latest_charge.created, com status 'succeeded'). Sem ela na leitura (ainda
   * sem cobrança, ou com a cobrança de uma tentativa anterior que falhou), nada: aplicarSessao grava a hora em que o site
   * viu o pagamento, nunca a da criação do pagamento ou da sessão.
   */
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

/**
 * A folga da regra do QR que promete mais que a sessão: na bancada o QR veio com 1 s a mais que o configurado, e a
 * sessão nasce na Stripe uns instantes depois do `agora` do servidor. Um toque nos últimos segundos da folga da sessão
 * não a fecha à toa.
 */
const TOLERANCIA_DO_QR_SEGUNDOS = 5;

/**
 * Traduz a sessão da Stripe (relida com obterSessao) para o status do pedido e os dados do pagamento. `agora` só conta
 * no Pix com a sessão aberta (o tempo de tocar em "Continuar"); o cartão não depende dele.
 */
export function interpretarSessao(sessao: Stripe.Checkout.Session, agora: Date = new Date()): LeituraSessao {
  const pi = expandido<Stripe.PaymentIntent>(sessao.payment_intent);
  const paymentIntentId = typeof sessao.payment_intent === 'string' ? sessao.payment_intent : pi?.id;
  const cobranca = expandido<Stripe.Charge>(pi?.latest_charge);
  const erro = pi?.last_payment_error;
  const motivo = erro?.decline_code ?? erro?.code;
  const forma = sessao.metadata?.forma;
  // só o site escreve a metadata, e a sessão do Pix só aceita Pix
  const pix = forma === 'pix';
  // a tentativa de Pix que morreu sem pagamento. Com a sessão aberta, o erro está no pagamento; depois que a sessão
  // fecha, a Stripe cancela o pagamento e apaga o erro, mas a cobrança que falhou continua em latest_charge (medido em
  // 16/11). A sessão fechada com o QR ainda vivo não deixa cobrança falha: aí não houve Pix vencido
  const pixNaoPago = pix && Boolean(erro || (cobranca?.status === 'failed' && cobranca.payment_method_details?.type === 'pix'));
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
      // a hora do pagamento é só a da cobrança. Logo depois de um Pix a leitura ainda pode vir sem ela (a consulta da página
      // chega antes): aí fica sem hora, e aplicarSessao grava a hora em que o site viu o pagamento. A criação do pagamento
      // e a da sessão são de quando o cliente abriu o formulário ou gerou o QR, até 30 minutos antes (reteste de 17-18/11:
      // ON-KEG69N gravou 20:50:24 para a cobrança das 20:53:27). E só a da cobrança que deu certo: latest_charge é a última
      // cobrança que o pagamento criou, e a de uma tentativa anterior que falhou continua nele (o QR do Pix que venceu e foi
      // gerado de novo, o cartão recusado antes do aprovado). Se a leitura da sessão paga chegar antes de a cobrança paga
      // tomar o lugar dela, a hora da falha não vira a hora do pagamento: fica sem hora, como a leitura sem cobrança
      ...(cobranca?.status === 'succeeded' && cobranca.created ? { pagoEm: iso(cobranca.created) } : {}),
      ...(cartao
        ? { cartao: { bandeira: cartao.brand ?? '', final: cartao.last4 ?? '', ...(cartao.country ? { pais: cartao.country } : {}) } }
        : {}),
      ...(apresentado
        ? { apresentado: { moeda: apresentado.presentment_currency.toUpperCase(), valorCentavos: apresentado.presentment_amount } }
        : {}),
      ...(pais ? { clientePais: pais } : {}),
    };
  }
  if (sessao.status === 'expired') {
    // no Pix, nunca o código cru do erro: ou "Pix não pago no prazo" (houve uma tentativa que morreu), ou nada
    if (pix) return { ...comum, status: 'expirado', ...(pixNaoPago ? { motivoCodigo: PIX_EXPIRADO } : {}) };
    return { ...comum, status: 'expirado', ...(motivo ? { motivoCodigo: motivo } : {}) };
  }
  if (sessao.status === 'complete') {
    // o cliente concluiu sem pagar na hora: seria o Pix com o QR gerado (no cartão a sessão só fica completa com o
    // pagamento feito). No modo de teste nunca aconteceu: a sessão do Pix fica aberta com o QR na tela e só fica
    // completa já paga (15/11). Fica por garantia, se a produção mandar os avisos async_payment_*: pagamento cancelado
    // ou que falhou = o Pix venceu sem ser pago. O motivo é sempre 'pix_expirado', nunca o código que a Stripe deixa
    // no erro do pagamento: esse código cru cairia na recusa genérica do cartão.
    if (pi && (pi.status === 'canceled' || pi.status === 'requires_payment_method')) {
      return { ...comum, status: 'expirado', motivoCodigo: PIX_EXPIRADO };
    }
    return { ...comum, status: 'pendente' };
  }
  if (pix) {
    // aberta, no Pix: o cliente está no formulário, com ou sem o QR na tela
    // 1) o QR venceu (ou a tentativa falhou) e ninguém gerou outro: Pix não pago no prazo. A prova é o erro ou a cobrança
    // de Pix que falhou, não o estado sozinho; com outro QR já na tela o pagamento está em requires_action
    if (pi?.status === 'requires_payment_method' && pixNaoPago) {
      return { ...comum, status: 'expirado', motivoCodigo: PIX_EXPIRADO, fecharSessao: true };
    }
    // 2) ninguém gerou o Pix dentro do tempo de tocar em "Continuar": o tempo para pagar terminou
    const limite = limiteDoToqueDoPix(sessao);
    const semTentativa = !pi || pi.status === 'requires_payment_method' || pi.status === 'canceled';
    if (limite !== null && semTentativa && Math.floor(agora.getTime() / 1000) >= limite) {
      return { ...comum, status: 'expirado', fecharSessao: true };
    }
    // 3) rede de segurança: um QR gerado tarde demais, que promete valer até depois do fim da sessão. Compara dois
    // horários da própria Stripe, com a folga de poucos segundos
    const qrAte = pi?.status === 'requires_action' ? pi.next_action?.pix_display_qr_code?.expires_at : undefined;
    if (typeof qrAte === 'number' && qrAte > sessao.expires_at + TOLERANCIA_DO_QR_SEGUNDOS) {
      return { ...comum, status: 'expirado', fecharSessao: true };
    }
    // no Pix, nunca um motivo de recusa: o Pix não é recusado
    return { ...comum, status: 'pendente' };
  }
  // aberta, no cartão: o cliente ainda está no formulário; se um cartão foi recusado, o motivo fica aqui
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
 * O que o pedido esperava receber na forma registrada (o do pedido inteiro, não só deste voucher). Desde a Etapa 7, no pedido
 * com casa, é o que ele cobra hoje (pagamento.cobrar: o sinal da casa mais o resto), o mesmo valor que a sessão cobra
 * (valorDoItem): o sinal pago não dá o aviso de valor diferente (valorEsperadoDoPedido, src/lib/pedidos-painel.ts).
 */
const valorEsperado = (r: Reserva): number => valorEsperadoDoPedido(r);

/**
 * Grava no pedido o que a Stripe recebeu (pagamento.recebidoCentavos) quando difere do que ele esperava, e devolve a linha
 * do aviso; com o valor igual, nada é gravado (e um valor antigo sai). Desde o Pacote 23, é com este número que o painel, a
 * rota do painel, as estatísticas e as páginas do cliente dizem quanto foi pago e quanto ainda dá para devolver
 * (recebidoPelaStripe, src/lib/pedidos-painel.ts). Sem o valor na leitura, nada muda.
 */
export function anotarValorRecebido(r: Reserva, recebidoCentavos: number | undefined): string | undefined {
  if (recebidoCentavos === undefined) return undefined;
  const esperado = valorEsperado(r);
  if (recebidoCentavos === esperado) {
    delete r.pagamento.recebidoCentavos;
    return undefined;
  }
  r.pagamento.recebidoCentavos = recebidoCentavos;
  return avisoDeValorDiferente(recebidoCentavos, esperado);
}

/**
 * O serviço já começou (o pagamento chegou tarde demais para o parceiro): a partir de 1 segundo depois do horário, na
 * mesma conta em segundos do corte do cartão (segundosAteOInicio, src/lib/formas-pagamento.ts, negativo quando o item já
 * começou; cartaoDisponivel). No horário cravado ainda não. Até o reteste de 17-18/11 (Pacote 17) a conta era em minutos
 * inteiros e só acusava a partir do minuto seguinte ao do horário: o pagamento que chegava entre o horário e 59 s depois,
 * que é o pior caso do cartão desde que o corte conta segundos, não deixava o aviso. Uma data ou hora que não dá para
 * ler (NaN) não acusa. Sem o banco, para ser testada em node (tests/stripe.test.ts).
 */
export function horarioJaPassou(r: ItemAgendado, agora: Date): boolean {
  return segundosAteOInicio(r, agora) < 0;
}

/**
 * O pagamento chegou depois do horário do serviço: o primeiro serviço do pedido já começou, ou seja, algum dos itens que
 * o pagamento cobre já começou (horarioJaPassou em cada um). Os itens são todos os vouchers do pedido, os mesmos de quem
 * decide os prazos de pagar (itensPagaveis nas páginas e na rota de pagar; o primeiro serviço, em validadeDoPix e
 * cartaoDisponivel). Até o reteste de 22/11 (sobra do revisor do Pacote 17) o aviso olhava só o voucher que representa o
 * pedido: num pedido de vários itens, se o serviço mais cedo fosse de outro voucher, o pagamento que chegasse depois dele
 * não deixava o aviso. Um item com a data ou a hora que não dá para ler não acusa, e não esconde os outros. Sem item
 * nenhum, não acusa. Sem o banco, para ser testada em node (tests/stripe.test.ts).
 */
export function pagoDepoisDoHorario(itens: readonly ItemAgendado[], agora: Date): boolean {
  return itens.some((item) => horarioJaPassou(item, agora));
}

/**
 * O pagamento a mais: a sessão foi paga, mas o pedido já não espera pagamento (não está pendente nem expirado) e
 * tem OUTRO pagamento registrado. É a segunda aba paga depois da primeira, ou o QR de um Pix antigo pago depois
 * de o pedido ser pago por outro meio, cancelado, reembolsado ou contestado. Esse dinheiro não entra no pedido:
 * volta ao cliente. Também o segundo pagamento de um pedido cancelado que já tem um parado (Pacote 22: o parado é o
 * pagamento registrado do pedido); o primeiro, num pedido cancelado e nunca pago, fica parado (pagamentoParaReter, que
 * aplicarSessao confere antes desta). Devolve o id do pagamento a devolver, ou undefined quando a sessão não foi paga, quando o
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

/**
 * O pagamento que chega para um pedido cancelado (Pacote 22, decisão do dono de 23/11/2026): não volta sozinho ao cliente.
 * 'reter': a sessão paga é de um pedido CANCELADO que nunca foi pago (pedidoNuncaPago: sem a hora do pagamento e sem linha
 * de pago no histórico), sem nada devolvido e sem pagamento parado: o dinheiro fica parado na Stripe e a equipe decide no
 * painel se devolve ou reativa o pedido. 'ja-retido': é o mesmo pagamento já parado (o aviso de novo, ou junto com a
 * consulta): nada muda. undefined: o caminho de sempre, com as regras de hoje: o pagamento repetido de um pedido pago
 * continua voltando sozinho, um SEGUNDO pagamento com um já parado volta sozinho (pagamentoAMais: o parado é o pagamento
 * registrado do pedido), e o pedido cancelado depois de pago, reembolsado ou contestado fica com as regras dele. A leitura
 * sem o valor cobrado também segue o caminho de sempre (sem valor a equipe não teria o que decidir), e o pedido que não é
 * da Stripe (provedorDaReserva: o do WhatsApp) também, porque só o da Stripe tem a decisão no painel. Sem o banco, para
 * ser testada em node (tests/pagamento-retido.test.ts).
 */
export function pagamentoParaReter(
  pedido: Pick<Reserva, 'status' | 'pagamento' | 'historico' | 'reembolsoCentavos' | 'provedor'>,
  leitura: Pick<LeituraSessao, 'status' | 'paymentIntentId' | 'valorCentavos'>,
): 'reter' | 'ja-retido' | undefined {
  const pi = leitura.paymentIntentId;
  if (leitura.status !== 'pago' || !pi || pedido.status !== 'cancelado') return undefined;
  // só o pedido da Stripe fica parado: é a mesma condição do painel (os botões, a faixa, a frase e o e-mail à equipe);
  // num pedido do WhatsApp cancelado o pagamento volta sozinho, como hoje
  if (provedorDaReserva(pedido) !== 'stripe') return undefined;
  const retido = pedido.pagamento.retido;
  if (retido) return retido.paymentIntentId === pi ? 'ja-retido' : undefined;
  if (!pedidoNuncaPago(pedido) || (pedido.reembolsoCentavos ?? 0) > 0) return undefined;
  return typeof leitura.valorCentavos === 'number' && leitura.valorCentavos > 0 ? 'reter' : undefined;
}

/**
 * Grava no pedido o pagamento parado (pagamento.retido, no JSON do pagamento: sem migração, nos arquivos e no banco) com
 * o que a sessão paga relida disse (o valor, o pagamento, a forma, a hora da cobrança ou, sem ela, `agoraIso`, o cartão,
 * a moeda apresentada e o país), e o pagamento do pedido passa a ser ele (assim um segundo pagamento é "a mais" e volta
 * sozinho, e a devolução pedida pela equipe é contada no pedido). O status não muda: o pedido continua cancelado, e os
 * vouchers com ele. Devolve a linha do aviso para o histórico. Só para a leitura que pagamentoParaReter deu como 'reter'.
 */
export function reterPagamento(r: Reserva, leitura: LeituraSessao, sessaoId: string, agoraIso: string): string {
  const pi = leitura.paymentIntentId ?? '';
  const valorCentavos = leitura.valorCentavos ?? 0;
  r.pagamento.retido = {
    paymentIntentId: pi,
    sessaoId,
    valorCentavos,
    ...(leitura.forma ? { forma: leitura.forma } : {}),
    pagoEm: leitura.pagoEm ?? agoraIso,
    ...(leitura.cartao ? { cartao: leitura.cartao } : {}),
    ...(leitura.apresentado ? { apresentado: leitura.apresentado } : {}),
    ...(leitura.clientePais ? { clientePais: leitura.clientePais } : {}),
  };
  r.paymentIntentId = pi;
  return avisoDoPagamentoRetido(valorCentavos, pi);
}

/**
 * A reativação do pedido com o pagamento parado (a ação "Reativar o pedido (fica pago)" do painel): o pedido vira pago
 * com esse pagamento, como um pagamento normal (a forma, o pagamento, a sessão, a hora da cobrança, o cartão, a moeda
 * apresentada e o país), os vouchers voltam a valer com ele e a decisão fica gravada. Devolve as linhas do histórico: a
 * da decisão e os avisos que um pagamento normal deixaria (o valor diferente do esperado e o pagamento depois do horário
 * do serviço, contado agora, na reativação: se o serviço já começou, a equipe confere com o parceiro). Quem chama confere
 * a regra (acaoDoRetidoOferecida) dentro da trava de versão e relê o pagamento na Stripe antes. Sem o banco, para ser
 * testada em node.
 */
export function reativarPedidoRetido(
  r: Reserva,
  itensDoPedido: readonly ItemAgendado[],
  agora: Date,
  linhaDaDecisao: (paymentIntentId: string, centavos: number) => string,
): string[] {
  const retido = r.pagamento.retido;
  if (!retido) return [];
  r.status = 'pago';
  r.provedor = 'stripe';
  r.pagamentoExternoId = retido.sessaoId;
  r.paymentIntentId = retido.paymentIntentId;
  if (retido.forma) r.pagamento.metodo = retido.forma;
  r.pagamento.pagoEm = retido.pagoEm;
  if (retido.cartao) {
    r.pagamento.cartaoBandeira = retido.cartao.bandeira;
    r.pagamento.cartaoFinal = retido.cartao.final;
    if (retido.cartao.pais) r.pagamento.cartaoPais = retido.cartao.pais;
  }
  if (retido.apresentado) r.pagamento.apresentado = retido.apresentado;
  if (retido.clientePais) r.cliente.pais = retido.clientePais;
  delete r.pagamento.motivoCodigo;
  retido.decisao = { acao: 'reativar', em: agora.toISOString() };
  const linhas = [linhaDaDecisao(retido.paymentIntentId, retido.valorCentavos)];
  const aviso = anotarValorRecebido(r, retido.valorCentavos);
  if (aviso) linhas.push(aviso);
  if (pagoDepoisDoHorario([r, ...itensDoPedido], agora)) linhas.push(AVISO_PAGO_DEPOIS_DO_HORARIO);
  return linhas;
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
  /**
   * A sessão foi paga pelo pagamento parado de um pedido cancelado (pagamentoParaReter, Pacote 22): ele NÃO volta sozinho.
   * Vem em toda chamada desse pagamento, para quem chama não o devolver.
   */
  pagamentoRetido?: string;
}

/**
 * Aplica ao pedido o que a sessão relida na Stripe diz: relê a reserva, confere podeMudar, grava o status, os
 * ids, o cartão (bandeira, 4 dígitos, país), a moeda apresentada e o histórico; devolve se virou pago. É a
 * única porta pela qual um pedido online vira pago. `codigo` é o do pedido (metadata.codigo) ou de um voucher.
 * Um pedido que já não espera pagamento não é mexido pela sessão paga por OUTRO pagamento: nem o pagamento
 * registrado nem o status mudam, e o resultado traz pagamentoRepetido. Um pedido contestado não volta a pago por
 * aqui, nem pela sessão do mesmo pagamento (é só o aviso de pago chegando de novo, fora de ordem): quem tira o
 * pedido de contestado é o fim da contestação (charge.dispute.closed, no webhook).
 * Quando a leitura pede (fecharSessao: o Pix venceu sem pagamento, ou o tempo de gerar o Pix acabou), a sessão é
 * fechada na Stripe DEPOIS de o pedido ser gravado: fechada, a Stripe apaga o erro do pagamento, então o motivo tem de
 * ser decidido nesta leitura.
 * Na transição para pago, o pagamento que chegou depois do horário do serviço deixa AVISO_PAGO_DEPOIS_DO_HORARIO no
 * histórico do pedido, uma vez: a conta olha o serviço mais cedo entre todos os itens do pedido (pagoDepoisDoHorario),
 * lidos logo antes da gravação, e não só o voucher que representa o pedido.
 * Desde o Pacote 22 (decisão do dono de 23/11/2026), o pagamento que chega para um pedido CANCELADO e nunca pago não
 * volta sozinho: fica parado (pagamentoParaReter, reterPagamento), uma vez só, com o aviso destacado no histórico, o
 * resultado traz pagamentoRetido (quem chama não devolve) e sai o e-mail à equipe; a equipe decide no painel.
 */
export async function aplicarSessao(
  codigo: string,
  sessao: Stripe.Checkout.Session,
  origem: OrigemAtualizacao,
  agora: Date = new Date(),
): Promise<ResultadoSessao> {
  const { atualizarReserva, obterPedido, obterReservaDoPedido, registrar } = await import('./reservas.ts');
  const leitura = interpretarSessao(sessao, agora);
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return { reserva: null, leitura, virouPago: false };

  // os outros itens que o pagamento cobre, para o aviso do pagamento que chega depois do horário (pagoDepoisDoHorario):
  // o serviço mais cedo do pedido pode ser de outro voucher, não o que representa o pedido. Lidos antes da trava, só com a
  // sessão paga e o pedido de vários itens (a data e a hora de um item não mudam depois que o pedido é criado). Se a
  // leitura falhar, o pagamento é aplicado do mesmo jeito, e o aviso olha só o voucher que representa o pedido, como antes
  const pedidoDeVarios = leitura.status === 'pago' ? alvo.pedido?.codigo : undefined;
  const itensDoPedido: ItemAgendado[] = pedidoDeVarios
    ? await obterPedido(pedidoDeVarios).catch((e) => {
        console.error(`[pagamento] não deu para ler os itens do pedido ${pedidoDeVarios} para o aviso do horário: ${mensagemDoErro(e)}`);
        return [];
      })
    : [];

  const agoraIso = agora.toISOString();
  const quem = origem === 'webhook' ? 'webhook da Stripe' : 'consulta à Stripe';
  let virouPago = false;
  let virouExpirado = false;
  let repetido: string | undefined;
  let retido: string | undefined;

  // atualizarReserva pode chamar de novo em caso de conflito: tudo que decide o resultado nasce aqui dentro
  const reserva = await atualizarReserva(alvo.codigo, (r) => {
    virouPago = false;
    virouExpirado = false;
    repetido = undefined;
    retido = undefined;
    r.pagamento.ultimaConsulta = agoraIso;
    const corrente = !r.pagamentoExternoId || r.pagamentoExternoId === sessao.id;

    // o pagamento que chega para um pedido cancelado e nunca pago (Pacote 22): não volta sozinho. Fica parado na Stripe,
    // gravado no pedido uma vez só, com a linha do aviso; a equipe decide no painel. O mesmo pagamento de novo (o aviso
    // repetido, a consulta) não grava nada
    const retencao = pagamentoParaReter(r, leitura);
    if (retencao) {
      retido = leitura.paymentIntentId;
      if (retencao === 'ja-retido') return origem === 'consulta' ? r : null;
      return registrar(r, reterPagamento(r, leitura, sessao.id, agoraIso));
    }

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
      // o valor diferente do esperado fica gravado no pedido (pagamento.recebidoCentavos) junto com o aviso: é o que entrou
      const aviso = anotarValorRecebido(r, leitura.valorCentavos);
      if (aviso) registrar(r, aviso);
      // não reembolsa sozinho: a equipe confere com o parceiro. O aviso olha o serviço mais cedo do pedido: o voucher que o
      // representa e os outros itens que o pagamento cobre; uma vez só, nesta transição, no histórico do pedido
      if (pagoDepoisDoHorario([r, ...itensDoPedido], agora)) registrar(r, AVISO_PAGO_DEPOIS_DO_HORARIO);
      return r;
    }
    virouExpirado = leitura.status === 'expirado';
    const porque = leitura.motivoCodigo === PIX_EXPIRADO ? 'Pix não pago no prazo' : 'O tempo para pagar terminou';
    return registrar(r, `${leitura.status === 'expirado' ? porque : `Status ${leitura.status}`} (${quem})`);
  });

  // a leitura pediu para fechar a sessão: fecha na Stripe, para o formulário dela não gerar outro QR. O aviso de sessão
  // vencida que isso provoca (checkout.session.expired) relê a sessão e não muda nada. Fecha sempre que a leitura
  // pedir, mesmo sem mudança no pedido; já fechada, expirarSessao devolve false. Se o fechamento falhar, o pedido já
  // está certo, mas a consulta não relê pedido expirado (deveSincronizar, src/app/api/pedido/pedido-stripe.ts): a
  // sessão fica aberta até vencer sozinha (até 61 minutos). Se o cliente gerar outro QR nela e pagar, o pedido vai de
  // expirado para pago pela porta de sempre; "Pagar de novo" cria a sessão nova e fecha a antiga.
  if (leitura.fecharSessao) {
    await expirarSessao(sessao.id).catch((e) =>
      console.error(`[pagamento] não deu para fechar a sessão do pedido ${codigo}: ${mensagemDoErro(e)}`),
    );
  }

  if (virouPago && reserva) await pedidoPago(reserva, leitura);
  if (virouExpirado && reserva) await pedidoExpirou(reserva, leitura);
  if (retido && reserva) await pagamentoFicouRetido(reserva, retido);
  return {
    reserva,
    leitura,
    virouPago,
    ...(repetido ? { pagamentoRepetido: repetido } : {}),
    ...(retido ? { pagamentoRetido: retido } : {}),
  };
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
  const { agendarAvisoDoPedidoPago, agendarEmailDoPedido } = await import('./email/pedidos.ts');
  agendarEmailDoPedido('pagamento-aprovado', reserva.pedido?.codigo ?? reserva.codigo);
  // Pacote 28: o aviso à equipe do pedido pago, um por pedido (src/lib/email/pedidos.ts)
  agendarAvisoDoPedidoPago(reserva.pedido?.codigo ?? reserva.codigo);
}

/**
 * O pedido virou expirado (a sessão venceu, o Pix gerado não foi pago no prazo ou o tempo de gerar o Pix acabou; nos
 * dois últimos a sessão é fechada logo antes, em aplicarSessao): no Pix, o e-mail com o link para
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

/**
 * O pagamento ficou parado num pedido cancelado (Pacote 22): o e-mail à equipe, depois da resposta, um por pagamento (a
 * linha do e-mail no histórico e a chave de idempotência; agendado de novo a cada aviso do mesmo pagamento, ele só sai uma
 * vez e não sai se a equipe já decidiu). Nenhum e-mail ao cliente agora. Uma falha aqui não muda o pedido.
 */
async function pagamentoFicouRetido(reserva: Reserva, paymentIntentId: string): Promise<void> {
  try {
    const { agendarAvisoDoPagamentoRetido } = await import('./email/pedidos.ts');
    agendarAvisoDoPagamentoRetido(reserva.pedido?.codigo ?? reserva.codigo, paymentIntentId);
  } catch (e) {
    console.error(
      `[pagamento] falha ao agendar o aviso à equipe do pagamento parado ${reserva.pedido?.codigo ?? reserva.codigo}: ${mensagemDoErro(e)}`,
    );
  }
}

/** Etapa 7: o cadastro dos hóspedes da casa depois do sinal pago. Ainda não existe; o gancho fica aqui. */
async function cadastrarHospedes(_reserva: Reserva, _dados: LeituraSessao): Promise<void> {}

/**
 * A rede de segurança quando o webhook atrasa: relê a sessão corrente do pedido na Stripe e aplica o que ela
 * diz, pela mesma aplicarSessao do webhook (inclusive expirar o Pix vencido e o Pix sem toque depois dos 30
 * minutos, fechando a sessão). Quem decide a hora, e segura as consultas repetidas, é conferirNaStripe
 * (src/app/api/pedido/pedido-stripe.ts), para a rota do status e para as páginas do pedido e da reserva. O
 * navegador nunca decide: quem consulta é o servidor. Devolve a reserva (mudada ou não), ou null se o pedido não
 * existir.
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
 * pedido e um pedido expirado volta a pendente. Devolve a linha do histórico. Devolve null, sem mexer em nada, em dois
 * casos. A trava: num pedido que já não abre sessão (pago em outra aba, cancelado no painel, reembolsado ou contestado
 * enquanto a sessão nascia). E a sessão que já é a corrente do pedido: dois "Pagar" no mesmo segundo levam a mesma chave
 * de idempotência, e a Stripe devolve aos dois a MESMA sessão (criarSessaoPagamento, src/lib/stripe.ts); a primeira
 * gravação já fez tudo, e a segunda só repetia a linha "Sessão de pagamento criada" no histórico (e pulava um número da
 * tentativa; reteste de 16-17/11, R10). Sem o banco, para ser testada em node (tests/stripe.test.ts).
 */
export function sessaoNovaNoPedido(r: Reserva, sessaoId: string, forma: FormaPagamento): string | null {
  if (!podeAbrirSessao(r.status)) return null;
  if (r.pagamentoExternoId === sessaoId) return null;
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
 * Se a sessão gravada já é esta (o outro de dois "Pagar" no mesmo segundo recebeu da Stripe a mesma sessão e gravou
 * primeiro), também nada é gravado: o pedido volta como está, sem a linha repetida no histórico (atualizarReserva não
 * grava quando a mudança devolve null, nos arquivos, no Blob e no banco). Para quem chama, a sessão ficou gravada
 * (sessaoFicouGravada, com o pedido pendente) e não há outra a fechar por causa dela.
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
    // a trava de status e a sessão que já é a corrente ficam no começo de sessaoNovaNoPedido: sem a linha do histórico,
    // nada é gravado e o pedido volta como está
    const evento = sessaoNovaNoPedido(r, sessao.id, forma);
    delete lido.substituida;
    if (evento && corrente && corrente !== sessao.id) lido.substituida = corrente;
    return evento ? registrar(r, evento) : null;
  });
  return reserva ? { reserva, ...lido } : null;
}

/* ------------------------------------------------------------------ */
/* A sessão anterior, na hora de trocar (Pacote 34, P1)                */

/**
 * O que a sessão anterior virou depois que o site tentou fechá-la para abrir outra no mesmo pedido (o cartão depois do
 * Pix, o Pix depois do cartão recusado, o "Pagar de novo"), pela sessão relida na Stripe:
 * - 'paga': o cliente pagou essa sessão pouco antes (o Pix pago no app do banco enquanto ele tocava em "Pagar com cartão",
 *   ou o cartão pago em outra aba). É o pagamento do pedido: a sessão nova não pode chegar ao cliente;
 * - 'fechada': ela já tinha vencido (ou foi fechada por outro toque), e nenhum pagamento passa mais por ela;
 * - 'aberta': ela continua aberta (a Stripe não conseguiu fechá-la) ou pode ainda receber o pagamento (concluída sem
 *   pagar, como um Pix que ainda vai cair). Abrir outra forma agora deixaria o cliente pagar duas vezes.
 * Sem o banco, para ser testada em node (tests/troca-de-forma.test.ts).
 */
export type AnteriorDepoisDeFechar = 'paga' | 'fechada' | 'aberta';

export function anteriorDepoisDeFechar(lida: Pick<Stripe.Checkout.Session, 'status' | 'payment_status'>): AnteriorDepoisDeFechar {
  if (lida.payment_status === 'paid') return 'paga';
  if (lida.status === 'expired') return 'fechada';
  return 'aberta';
}

const EVENTO_TROCA_DESFEITA = 'Troca de forma desfeita';

/**
 * O pedido volta para a sessão anterior quando a troca não pôde terminar porque a Stripe não confirmou que ela fechou
 * (anteriorDepoisDeFechar deu 'aberta'): a sessão nova, recém-gravada e já fechada na Stripe, sai, e a anterior volta a
 * ser a corrente, com a forma dela. Assim a página continua acompanhando a sessão que o cliente ainda pode pagar (o QR do
 * Pix na tela), e o aviso da Stripe de um pagamento nela vale como sempre. Só se a sessão corrente ainda for a nova e o
 * pedido ainda esperar o pagamento: outro toque que gravou depois, ou o pedido pago no meio-tempo, ficam como estão.
 * Devolve a linha do histórico, ou null sem mexer em nada. Sem o banco, para ser testada em node.
 */
export function sessaoAnteriorDeVolta(r: Reserva, nova: string, anterior: string, forma?: FormaPagamento): string | null {
  if (r.pagamentoExternoId !== nova || !podeAbrirSessao(r.status)) return null;
  r.pagamentoExternoId = anterior;
  if (forma) r.pagamento.metodo = forma;
  return `${EVENTO_TROCA_DESFEITA}: a sessão anterior (${anterior}) não pôde ser fechada na Stripe; a nova (${nova}) foi fechada e o pedido continua com a anterior`;
}

/** Grava sessaoAnteriorDeVolta no pedido (o mesmo caminho de registrarSessaoCriada, ao contrário). */
export async function devolverSessaoAnterior(
  codigo: string,
  nova: string,
  anterior: string,
  forma?: FormaPagamento,
): Promise<Reserva | null> {
  const { atualizarReserva, obterReservaDoPedido, registrar } = await import('./reservas.ts');
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return null;
  return atualizarReserva(alvo.codigo, (r) => {
    const linha = sessaoAnteriorDeVolta(r, nova, anterior, forma);
    return linha ? registrar(r, linha) : null;
  });
}
