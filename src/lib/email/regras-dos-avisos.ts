// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { formatarCifra } from '../cifra.ts';
import { pedidoNuncaPago, provedorDaReserva, voucherPago } from '../pedidos-painel.ts';
import { linhaDoReembolsoSemMudarVoucher, linhaDoVoucherLigado } from '../reembolsos-a-resolver.ts';
import type { Reserva } from '../reservas';
import type { ResultadoEnvio } from './enviar';
import {
  FINAL_DO_CANCELAMENTO_DO_VENCIDO,
  MARCA_DO_AVISO_DO_PEDIDO_PAGO,
  MARCA_DO_EMAIL_DO_CANCELAMENTO,
  marcaDoEmailDoReembolso,
  type VersaoDoEmailDoReembolso,
} from './marcas.ts';

/**
 * Pacote 28 (FASE-5, Etapa 2, primeira parte): quando sai cada um dos três avisos novos, decidido sem rede nem banco, para
 * os testes rodarem em node. Quem busca o pedido, relê o reembolso na Stripe e envia é src/lib/email/pedidos.ts; quem
 * grava as linhas do histórico é o webhook (src/app/api/webhooks/stripe/route.ts). Nada aqui muda dinheiro, status ou
 * voucher: são só avisos pendurados no que já acontece.
 * - O e-mail do reembolso ao cliente: um por reembolso que a Stripe registrou para o pagamento do pedido (o pedido
 *   inteiro, um voucher, ou parte do valor), com o valor, a forma e o prazo da página oficial da Stripe. O reembolso
 *   ainda pendente na Stripe ganha o e-mail "a caminho", sem data; quando ele termina (refund.updated), o "concluído".
 * - O e-mail do pedido cancelado pela equipe no painel, sem dinheiro a devolver.
 * - O aviso à equipe do pedido pago.
 */

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');

/* ------------------------------------------------------------------ */
/* As linhas do histórico do reembolso que termina depois               */

// O id vai como "(reembolso re_…, R$ …)", e nunca como "(re_…)": essa forma quer dizer, para o painel e o webhook, que a
// linha é a do próprio reembolso (reembolsoNoHistorico, avisosDeReembolsoSemVoucher), e estas linhas não mudam nada disso.

/** Gravada pelo charge.refunded quando a Stripe registra o reembolso, mas ele ainda não foi concluído (o dinheiro não saiu). */
export const linhaDoReembolsoPendente = (id: string, centavos: number): string =>
  `Reembolso ainda pendente na Stripe (reembolso ${id}, ${cifra(centavos)}): o dinheiro ainda não saiu para o cliente`;
/** Gravada pelo refund.updated quando o reembolso pendente termina. */
export const linhaDoReembolsoConcluido = (id: string, centavos: number): string =>
  `Reembolso concluído na Stripe (reembolso ${id}, ${cifra(centavos)}): o dinheiro saiu para o cliente`;
/** Gravada pelo refund.updated quando o reembolso é cancelado na Stripe. Não começa com "Aviso:" (nada a fechar no painel). */
export const linhaDoReembolsoCancelado = (id: string, centavos: number): string =>
  `Reembolso cancelado na Stripe (reembolso ${id}, ${cifra(centavos)}): este dinheiro não voltou ao cliente, e o pedido continua contando o valor como devolvido`;

const cita = (evento: string, inicio: string, id: string) => evento.startsWith(inicio) && evento.includes(`(reembolso ${id},`);
const linhas = (historicos: readonly (readonly { evento: string }[])[]) => historicos.flat().map((h) => h.evento);

/**
 * O reembolso ficou pendente na Stripe, pelo que o pedido registra: a linha que o charge.refunded grava desde o Pacote 28
 * ou, nos vouchers reembolsados sozinhos (também antes dele), a linha do voucher com "o dinheiro ainda está a caminho do
 * cliente" (eventoDoItemReembolsado, que fica no histórico do próprio voucher). Lê os históricos de todos os vouchers.
 */
export function reembolsoFicouPendente(historicos: readonly (readonly { evento: string }[])[], id: string): boolean {
  return linhas(historicos).some(
    (e) => cita(e, 'Reembolso ainda pendente na Stripe', id) || e.includes(`(${id}): o dinheiro ainda está a caminho do cliente`),
  );
}

export const reembolsoConcluidoNoHistorico = (historicos: readonly (readonly { evento: string }[])[], id: string): boolean =>
  linhas(historicos).some((e) => cita(e, 'Reembolso concluído na Stripe', id));

/* ------------------------------------------------------------------ */
/* O e-mail do reembolso ao cliente                                     */

/** O reembolso relido na Stripe, só com o que a regra usa. */
export interface ReembolsoDoAviso {
  id: string;
  /** Em centavos. */
  amount: number;
  /** succeeded, pending, requires_action, failed ou canceled. */
  status: string | null;
  /** metadata.referencia: o código de um voucher, "total", "pagamento-repetido" ou nada (feito direto na Stripe). */
  referencia?: string;
  /** O pagamento (pi_…) do reembolso. */
  paymentIntentId?: string | null;
  /** Quando a Stripe criou o reembolso (segundos, como na Stripe). */
  created?: number;
}

/** A parte do pedido que o reembolso cobre. */
export type AlcanceDoReembolso =
  /**
   * O pedido inteiro voltou (Reembolsar tudo, ou feito direto na Stripe deixando o pedido reembolsado), ou o pagamento
   * parado de um pedido cancelado foi devolvido.
   */
  | { tipo: 'pedido' }
  /** Um voucher deixou de valer (também o último de um pedido com vários itens: aí nada continua valendo). */
  | { tipo: 'voucher'; voucher: string }
  /** Parte do valor, sem nenhum voucher mudar (feito direto na Stripe num pedido de um item, ou anotado como desconto). */
  | { tipo: 'parte' };

export type PlanoDoEmailDoReembolso =
  | {
      sai: true;
      versao: VersaoDoEmailDoReembolso;
      centavos: number;
      forma: 'pix' | 'cartao';
      alcance: AlcanceDoReembolso;
      /** Os vouchers que continuam valendo (o pedido pago com parte devolvida), na ordem do pedido. */
      aindaValem: string[];
    }
  | { sai: false; motivo: string };

type PedidoDoAviso = Pick<Reserva, 'status' | 'paymentIntentId' | 'historico' | 'pagamento' | 'provedor' | 'reembolsoCentavos'>;
type VoucherDoAviso = Pick<Reserva, 'codigo' | 'statusItem' | 'historico'>;

/** A referência da devolução de um pagamento que o pedido não pode ficar (REFERENCIA_DEVOLUCAO, eventos.ts). */
const DEVOLUCAO_DE_OUTRO_PAGAMENTO = 'pagamento-repetido';

/** Quanto tempo depois de criado um reembolso ainda ganha o e-mail pelo charge.refunded (os de antes do Pacote 28 não). */
export const JANELA_DO_EMAIL_DO_REEMBOLSO_MS = 72 * 3600 * 1000;

/**
 * Os reembolsos de uma cobrança relida que o charge.refunded manda avisar: em vigor (pendentes ou concluídos), criados
 * nas últimas 72 horas (um reembolso novo de um pedido antigo não faz sair, dias depois, o e-mail de um reembolso de
 * antes), e que não são a devolução de um pagamento a mais. O resto da regra (o pedido, o alcance, um e-mail só) é de
 * planoDoEmailDoReembolso, na hora do envio.
 */
export function reembolsosParaAvisar<T extends Pick<ReembolsoDoAviso, 'id' | 'status' | 'created' | 'referencia'>>(
  reembolsos: readonly T[],
  agora: Date,
): T[] {
  return reembolsos.filter(
    (re) =>
      re.status !== 'failed' &&
      re.status !== 'canceled' &&
      re.referencia !== DEVOLUCAO_DE_OUTRO_PAGAMENTO &&
      typeof re.created === 'number' &&
      agora.getTime() - re.created * 1000 <= JANELA_DO_EMAIL_DO_REEMBOLSO_MS,
  );
}

/**
 * A parte do pedido que o reembolso cobre, ou null quando ainda não se sabe (o reembolso de parte feito direto na Stripe
 * num pedido com vários itens: a equipe diz no painel de qual voucher foi, ou que foi um desconto, e o e-mail sai aí).
 */
function alcanceDoReembolso(
  pedido: PedidoDoAviso,
  vouchers: readonly VoucherDoAviso[],
  reembolso: ReembolsoDoAviso,
): AlcanceDoReembolso | null {
  const { referencia, id } = reembolso;
  // a referência vem antes do status (revisão, achado B1): o reembolso do último voucher, que leva o pedido inteiro a
  // reembolsado, continua sendo o daquele voucher, e dois reembolsos de voucher nunca viram dois e-mails de pedido inteiro
  if (referencia && referencia !== 'total' && vouchers.some((v) => v.codigo === referencia))
    return { tipo: 'voucher', voucher: referencia };
  if (referencia === 'total' || pedido.status === 'reembolsado' || pedido.status === 'cancelado') return { tipo: 'pedido' };
  if (vouchers.length < 2) return { tipo: 'parte' };
  const todas = linhas(vouchers.map((v) => v.historico).concat([pedido.historico]));
  const ligado = vouchers.find((v) => todas.includes(linhaDoVoucherLigado(id, v.codigo)));
  if (ligado) return { tipo: 'voucher', voucher: ligado.codigo };
  if (todas.includes(linhaDoReembolsoSemMudarVoucher(id))) return { tipo: 'parte' };
  return null;
}

/**
 * Se o e-mail do reembolso sai agora, e em que versão, pelo pedido (o voucher que o representa, com o histórico onde
 * ficam as marcas), pelos vouchers dele e pelo reembolso relido na Stripe:
 * - não sai: o reembolso que falhou ou foi cancelado (a equipe resolve: o aviso do refund.failed); a devolução de um
 *   pagamento a mais (outra aba, um pedido cancelado sem pagamento dele: não é reembolso do pedido); o reembolso de outro
 *   pagamento; o pedido que não é da Stripe; o pedido contestado (o banco decide), pendente, expirado ou cancelado sem o
 *   pagamento parado ser o deste reembolso; o reembolso de parte de um pedido com vários itens que a equipe ainda não ligou
 *   a um voucher;
 * - um e-mail só por reembolso: sem marca, "confirmado" (já concluído na Stripe) ou "a caminho" (pendente, sem data);
 *   com a marca do "a caminho", o "concluído" só depois de o pedido registrar que ele terminou (a linha do refund.updated,
 *   linhaDoReembolsoConcluido) e uma vez; com a marca do "confirmado" ou do "concluído", nada.
 */
export function planoDoEmailDoReembolso(
  pedido: PedidoDoAviso,
  vouchers: readonly VoucherDoAviso[],
  reembolso: ReembolsoDoAviso,
): PlanoDoEmailDoReembolso {
  const naoSai = (motivo: string): PlanoDoEmailDoReembolso => ({ sai: false, motivo });
  const { id, status } = reembolso;
  if (status === 'failed' || status === 'canceled' || !status) return naoSai('o reembolso falhou ou foi cancelado: a equipe resolve');
  if (reembolso.referencia === DEVOLUCAO_DE_OUTRO_PAGAMENTO) return naoSai('devolução de um pagamento a mais');
  if (provedorDaReserva(pedido) !== 'stripe') return naoSai('pedido fora da Stripe');
  const pi = reembolso.paymentIntentId;
  if (pedido.paymentIntentId && pi && pi !== pedido.paymentIntentId) return naoSai('reembolso de outro pagamento');
  if (pedido.status === 'cancelado') {
    // só o pagamento parado do pedido cancelado (Pacote 22) devolvido; o resto é a devolução de um pagamento que não era dele
    const retido = pedido.pagamento.retido?.paymentIntentId;
    if (!retido || (pi && pi !== retido)) return naoSai('pedido cancelado sem pagamento dele');
  } else if (pedido.status !== 'pago' && pedido.status !== 'reembolsado') {
    return naoSai(`pedido ${pedido.status}`);
  }
  const alcance = alcanceDoReembolso(pedido, vouchers, reembolso);
  if (!alcance) return naoSai('a equipe ainda não disse de qual voucher foi');

  const marcas = pedido.historico.map((h) => h.evento);
  const tem = (versao: VersaoDoEmailDoReembolso) => marcas.some((e) => e.startsWith(marcaDoEmailDoReembolso(versao, id)));
  let versao: VersaoDoEmailDoReembolso;
  if (tem('confirmado') || tem('concluido')) return naoSai('o e-mail deste reembolso já saiu');
  if (tem('a-caminho')) {
    const historicos = [pedido.historico, ...vouchers.map((v) => v.historico)];
    if (status !== 'succeeded' || !reembolsoConcluidoNoHistorico(historicos, id)) return naoSai('ainda a caminho');
    versao = 'concluido';
  } else {
    versao = status === 'succeeded' ? 'confirmado' : 'a-caminho';
  }
  const metodo = pedido.pagamento.retido?.forma ?? pedido.pagamento.metodo;
  const forma = metodo === 'pix' ? 'pix' : 'cartao';
  const aindaValem = pedido.status === 'pago' ? vouchers.filter((v) => voucherPago(v)).map((v) => v.codigo) : [];
  return { sai: true, versao, centavos: reembolso.amount, forma, alcance, aindaValem };
}

/* ------------------------------------------------------------------ */
/* O e-mail do pedido cancelado pela equipe                             */

/** As linhas que o cancelamento no painel grava: o pedido da Stripe (cancelarPedidoAberto) e a ação manual. */
export const LINHAS_DO_CANCELAMENTO_NO_PAINEL: readonly string[] = ['Cancelado no admin', 'Cancelada no admin'];

/**
 * O e-mail "Pedido cancelado" sai agora? Só no pedido que a equipe cancelou no painel (a linha do cancelamento no
 * painel no histórico) e que está cancelado, sem dinheiro a devolver: nem um pagamento parado na Stripe (o que chegou
 * no instante do cancelamento: a equipe decide antes, e o e-mail do reembolso ou do pagamento aprovado cobre), nem um
 * valor já devolvido. Os cancelamentos automáticos do site (o cliente refez o pedido, a sessão de pagamento não pôde ser
 * criada) nunca gravam essa linha; o Pix vencido nem é cancelamento (vira expirado, com o e-mail dele). Uma vez por
 * pedido. `nadaCobrado`: o pedido nunca foi pago (o e-mail diz "Nada foi cobrado").
 * Pacote 29 (decisão do dono de 25/11): o pedido que já tinha vencido sem pagamento quando a equipe cancelou (a linha do
 * cancelamento com o final " (já estava vencido)", linhaDoCancelamento em src/lib/email/marcas.ts) não recebe o e-mail:
 * cancelar foi só arrumação do painel. O pedido que ainda esperava o pagamento continua recebendo.
 */
export function emailDoCancelamentoSai(
  r: Pick<Reserva, 'status' | 'historico' | 'pagamento' | 'reembolsoCentavos'>,
): { sai: true; nadaCobrado: boolean } | { sai: false; motivo: string } {
  if (r.status !== 'cancelado') return { sai: false, motivo: `pedido ${r.status}` };
  if (r.historico.some((h) => LINHAS_DO_CANCELAMENTO_NO_PAINEL.some((l) => h.evento === `${l}${FINAL_DO_CANCELAMENTO_DO_VENCIDO}`))) {
    return { sai: false, motivo: 'o pedido já estava vencido quando a equipe cancelou' };
  }
  if (!r.historico.some((h) => LINHAS_DO_CANCELAMENTO_NO_PAINEL.includes(h.evento))) {
    return { sai: false, motivo: 'não foi cancelado no painel' };
  }
  if (r.pagamento.retido) return { sai: false, motivo: 'pagamento parado na Stripe: a equipe decide' };
  if ((r.reembolsoCentavos ?? 0) > 0) return { sai: false, motivo: 'com reembolso: o e-mail do reembolso cobre' };
  if (r.historico.some((h) => h.evento.startsWith(MARCA_DO_EMAIL_DO_CANCELAMENTO))) return { sai: false, motivo: 'já saiu' };
  return { sai: true, nadaCobrado: pedidoNuncaPago(r) };
}

/* ------------------------------------------------------------------ */
/* O aviso à equipe do pedido pago                                      */

/** O aviso do pedido pago sai agora: o pedido está pago e o aviso ainda não saiu (um por pedido). */
export const avisoDoPedidoPagoSai = (r: Pick<Reserva, 'status' | 'historico'>): boolean =>
  r.status === 'pago' && !r.historico.some((h) => h.evento.startsWith(MARCA_DO_AVISO_DO_PEDIDO_PAGO));

/* ------------------------------------------------------------------ */
/* O e-mail novo que não saiu (revisão, achados M1 e B3)                */

const MOTIVO_DO_ENVIO: Record<'cota' | 'recusado' | 'falha', string> = {
  cota: 'a cota de e-mails acabou',
  recusado: 'o Resend recusou',
  falha: 'o Resend não respondeu',
};

/**
 * Por que o e-mail novo não saiu, em português, para o aviso do histórico (avisoDoEmailDoReembolsoQueNaoSaiu e os outros,
 * ./marcas.ts); null quando não há o que avisar: saiu, a mesma chave já tinha saído (repetido) ou o e-mail está desligado
 * de propósito (sem RESEND_API_KEY, como no computador).
 */
export function motivoDoEnvioQueNaoSaiu(resultado: ResultadoEnvio): string | null {
  if (resultado.enviado || resultado.motivo === 'repetido' || resultado.motivo === 'desligado') return null;
  return MOTIVO_DO_ENVIO[resultado.motivo];
}

/**
 * A marca que o e-mail do reembolso grava depois do envio (achado B3). Saiu agora: a versão que saiu. A mesma chave
 * (reembolso/re_…) já tinha sido usada: o Resend não diz qual versão saiu antes (o "a caminho" ou o "confirmado"), então
 * fica a marca do "a caminho", que ainda deixa sair o "concluído" (outra chave) quando o reembolso terminar. O pior caso
 * é um "concluído" a mais, nunca o cliente sem a notícia de que o dinheiro voltou.
 */
export function versaoParaMarcar(versao: VersaoDoEmailDoReembolso, resultado: ResultadoEnvio): VersaoDoEmailDoReembolso {
  if (!resultado.enviado && resultado.motivo === 'repetido' && versao !== 'concluido') return 'a-caminho';
  return versao;
}

/**
 * Achado B5: na hora do envio, o reembolso relido já concluído na Stripe, que o pedido registrou como pendente e ainda
 * não como concluído, ganha a linha "Reembolso concluído na Stripe" (a mesma do refund.updated), antes de a regra decidir
 * a versão: o histórico da equipe não fica dizendo "pendente" de um reembolso que já terminou.
 */
export function linhaDoConcluidoQueFalta(
  historicos: readonly (readonly { evento: string }[])[],
  reembolso: Pick<ReembolsoDoAviso, 'id' | 'amount' | 'status'>,
): string | null {
  if (reembolso.status !== 'succeeded') return null;
  if (!reembolsoFicouPendente(historicos, reembolso.id) || reembolsoConcluidoNoHistorico(historicos, reembolso.id)) return null;
  return linhaDoReembolsoConcluido(reembolso.id, reembolso.amount);
}
