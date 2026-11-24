// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { MARCA_DO_EMAIL, PREFIXO_DOS_AVISOS_DO_EMAIL_PAGO } from './email/marcas.ts';
import type { Reserva, StatusReserva } from './reservas';

/**
 * O e-mail do pagamento aprovado que nunca saiu (Pacote 25, achado B1 da revisão de 23/11). Raramente, a gravação que
 * marca o pedido como pago termina no banco, mas a resposta não chega em 10 s (o prazo de src/lib/banco.ts): o código
 * não chama pedidoPago, o webhook responde 500, o reenvio da Stripe acha o pedido já pago e não faz nada. O e-mail com
 * os vouchers não sai e o histórico não ganha nem o aviso de que ele estava saindo (AVISO_EMAIL_PAGO_SAINDO) nem a linha
 * do envio (MARCA_DO_EMAIL['pagamento-aprovado']). O caminho normal (aplicarSessao) não muda: o agendamento
 * /api/email/pendentes (vercel.json, a cada 15 minutos) olha os pedidos pagos e manda esse e-mail pelo código de sempre
 * (enviarEmailDoPedido, src/lib/email/pedidos.ts), que grava o aviso antes e não manda duas vezes (a linha no histórico e
 * a chave de idempotência do Resend). Aqui só a regra, sem banco nem rede, para os testes.
 */

/** Só os pedidos que viraram pagos nas últimas 48 horas. */
export const JANELA_DOS_PENDENTES_MS = 48 * 60 * 60 * 1000;
/** E só depois de 10 minutos parados: o caminho normal manda o e-mail em segundos e não pode correr junto. */
export const ESPERA_DOS_PENDENTES_MS = 10 * 60 * 1000;
/** No máximo estes por rodada (cada um gera os PDFs dos vouchers); o resto fica para a próxima, 15 minutos depois. */
export const PENDENTES_POR_RODADA = 10;

/** O que a lista dos pedidos pagos traz de cada pedido (listarPagosDesde, src/lib/reservas.ts): sem dado do cliente. */
export interface PedidoPagoRecente {
  /** O código do pedido (o do voucher, num pedido de um item só). */
  codigo: string;
  status: StatusReserva;
  /** A hora do pagamento (pagamento.pagoEm; no banco, pedidos.pago_em): a da cobrança na Stripe. */
  pagoEm?: string;
  /**
   * A hora em que a equipe reativou no painel o pedido com o pagamento parado (Pacote 22: pagamento.retido.decisao.em,
   * com a ação 'reativar'). Nesse pedido, a hora do pagamento é a da cobrança antiga, e ele virou pago só agora.
   */
  reativadoEm?: string;
  /** A última gravação do pedido (atualizadaEm; no banco, pedidos.atualizado_em). */
  atualizadaEm?: string;
  /** As linhas do histórico do pedido (só o texto). */
  eventos: readonly string[];
}

const instante = (iso: string | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

/**
 * A hora em que o pedido virou pago: a do pagamento ou, no pedido reativado no painel, a da reativação, a mais nova das
 * duas. NaN sem a hora do pagamento.
 */
export function virouPagoEm(p: Pick<PedidoPagoRecente, 'pagoEm' | 'reativadoEm'>): number {
  const pago = instante(p.pagoEm);
  const reativado = instante(p.reativadoEm);
  return Number.isNaN(pago) || Number.isNaN(reativado) ? pago : Math.max(pago, reativado);
}

/**
 * O pedido pago que não tem nenhum sinal do e-mail do pagamento aprovado: nem um dos avisos dele (o de que começou a
 * sair e o de que não saiu, os dois destacados no painel para a equipe), nem a linha do envio. Só o status pago (o
 * reembolsado, o cancelado, o contestado e os outros nunca), que virou pago nas últimas 48 horas (virouPagoEm: a hora
 * do pagamento ou a da reativação no painel), e quieto há 10 minutos: a hora em que virou pago e a última gravação do
 * pedido, as duas, há 10 minutos ou mais. A última gravação conta porque a hora do pagamento é a da cobrança na Stripe: o
 * pedido que virou pago depois (o aviso da Stripe que chegou atrasado) espera os mesmos 10 minutos a partir de quando
 * virou pago. Vale para o pedido da Stripe e para o do WhatsApp marcado como pago no painel: os dois recebem o mesmo
 * e-mail, pelo mesmo código, e a mesma falha do banco deixa os dois sem ele.
 */
export function faltaOEmailDoPagamento(p: PedidoPagoRecente, agora: Date): boolean {
  if (p.status !== 'pago') return false;
  const pago = virouPagoEm(p);
  if (Number.isNaN(pago)) return false;
  const ha = agora.getTime() - pago;
  if (ha > JANELA_DOS_PENDENTES_MS || ha < ESPERA_DOS_PENDENTES_MS) return false;
  const gravado = instante(p.atualizadaEm);
  if (!Number.isNaN(gravado) && agora.getTime() - gravado < ESPERA_DOS_PENDENTES_MS) return false;
  const marca = MARCA_DO_EMAIL['pagamento-aprovado'];
  return !p.eventos.some((e) => e.startsWith(PREFIXO_DOS_AVISOS_DO_EMAIL_PAGO) || e.startsWith(marca));
}

/**
 * Os pedidos desta rodada: os que faltam o e-mail (faltaOEmailDoPagamento), do que virou pago há mais tempo para o mais
 * novo (o que está esperando há mais tempo vai antes), um por código, no máximo `limite`. `fora`: quantos ficaram para a
 * próxima rodada.
 */
export function pedidosSemEmailDoPagamento(
  lista: readonly PedidoPagoRecente[],
  agora: Date,
  limite = PENDENTES_POR_RODADA,
): { escolhidos: PedidoPagoRecente[]; fora: number } {
  const vistos = new Set<string>();
  const faltam = lista
    .filter((p) => faltaOEmailDoPagamento(p, agora))
    .filter((p) => !vistos.has(p.codigo) && vistos.add(p.codigo))
    .sort((a, b) => virouPagoEm(a) - virouPagoEm(b));
  return { escolhidos: faltam.slice(0, limite), fora: Math.max(0, faltam.length - limite) };
}

/** A hora da reativação no painel do pagamento parado (Pacote 22), quando a decisão foi reativar. */
const reativacao = (pagamento: Reserva['pagamento']): string | undefined =>
  pagamento.retido?.decisao?.acao === 'reativar' ? pagamento.retido.decisao.em : undefined;

/**
 * Nos arquivos e no Blob (um arquivo por voucher, sem a linha do pedido): os pedidos pagos que viraram pagos desde
 * `desde` (virouPagoEm), um por código do pedido (o de vários itens aparece uma vez). O histórico do pedido é a união
 * das linhas de todos os vouchers dele: se a cópia de uma linha para um irmão falhou, a linha num voucher só já conta. No
 * banco, a consulta de listarPagosDesde (src/lib/reservas.ts) traz o mesmo, e o corte das 48 horas fica com
 * faltaOEmailDoPagamento.
 */
export function pagosDasReservas(
  reservas: readonly Pick<Reserva, 'codigo' | 'pedido' | 'status' | 'pagamento' | 'atualizadaEm' | 'historico'>[],
  desde: Date,
): PedidoPagoRecente[] {
  const linhas = new Map<string, string[]>();
  for (const r of reservas) {
    const codigo = r.pedido?.codigo ?? r.codigo;
    linhas.set(codigo, [...(linhas.get(codigo) ?? []), ...(r.historico ?? []).map((h) => h.evento)]);
  }
  const pedidos = new Map<string, PedidoPagoRecente>();
  for (const r of reservas) {
    const codigo = r.pedido?.codigo ?? r.codigo;
    const pagoEm = r.pagamento.pagoEm;
    if (pedidos.has(codigo) || r.status !== 'pago' || !pagoEm) continue;
    const reativadoEm = reativacao(r.pagamento);
    if (!(virouPagoEm({ pagoEm, reativadoEm }) >= desde.getTime())) continue;
    pedidos.set(codigo, {
      codigo,
      status: r.status,
      pagoEm,
      ...(reativadoEm ? { reativadoEm } : {}),
      atualizadaEm: r.atualizadaEm,
      eventos: [...new Set(linhas.get(codigo))],
    });
  }
  return [...pedidos.values()];
}
