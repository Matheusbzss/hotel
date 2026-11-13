// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { segundosAteOInicio } from './formas-pagamento.ts';
import { provedorDaReserva } from './pedidos-painel.ts';
import type { Reserva } from './reservas';

/**
 * A desistência da compra pelo próprio site: o link "Desistir da compra" da página do pedido (Decreto 7.962/2013,
 * art. 5º, § 1º: o consumidor desiste pela mesma ferramenta usada na compra). O pedido de desistência vira uma linha
 * de aviso no histórico do pedido (o painel destaca as que começam com "Aviso:") e a confirmação aparece na hora, na
 * tela (§ 4º: confirmação imediata do recebimento). Nada é reembolsado sozinho: a equipe responde por e-mail e
 * reembolsa pela política de cancelamento (no arrependimento dos 7 dias, pede o estorno à Stripe assim que o pedido
 * chega). Aqui só as regras, sem rede nem banco (tests/desistencia.test.ts); a rota é POST /api/pedido/[codigo]/desistir.
 */

/** O começo da linha que o pedido de desistência grava no histórico: é por ela que se sabe que ele já foi feito. */
export const AVISO_DESISTENCIA = 'Aviso: pedido de desistência pelo site';
/** O motivo que o cliente escreve (opcional) fica com no máximo isto de letras. */
export const MOTIVO_MAXIMO = 500;

/** O motivo numa linha só, sem espaços sobrando e cortado no máximo. */
export function limparMotivo(motivo: string | undefined): string {
  return (motivo ?? '').replace(/\s+/g, ' ').trim().slice(0, MOTIVO_MAXIMO).trim();
}

/** A linha do histórico: o aviso, o motivo (se veio) e o que a equipe faz em seguida, como os outros avisos. */
export function linhaDaDesistencia(motivo?: string): string {
  const limpo = limparMotivo(motivo);
  return `${AVISO_DESISTENCIA}${limpo ? ` (motivo: "${limpo}")` : ''}: responder ao cliente por e-mail em até 1 dia útil e reembolsar conforme a política de cancelamento`;
}

/** O pedido já tem um pedido de desistência: um só por pedido, o repetido só ouve que já foi recebido. */
export const desistenciaPedida = (r: Pick<Reserva, 'historico'>): boolean =>
  (r.historico ?? []).some((h) => h.evento.startsWith(AVISO_DESISTENCIA));

/**
 * O pedido aceita o pedido de desistência pelo site: pago pela Stripe, com o primeiro serviço ainda por começar (os
 * vouchers cancelados ou reembolsados sozinhos não contam). Depois disso, o link some: o serviço já aconteceu, ou o
 * pedido já foi devolvido.
 */
export function podeDesistir(vouchers: Reserva[], agora: Date = new Date()): boolean {
  const [r] = vouchers;
  if (!r || r.status !== 'pago' || provedorDaReserva(r) !== 'stripe') return false;
  const ativos = vouchers.filter((v) => v.statusItem !== 'cancelado' && v.statusItem !== 'reembolsado');
  if (!ativos.length) return false;
  // NaN (uma data que não dá para ler) também fecha o link
  return Math.min(...ativos.map((v) => segundosAteOInicio(v, agora))) > 0;
}

/** O que a página do pedido mostra: o link de desistir, o aviso de que o pedido de desistência já chegou, ou nada. */
export type EstadoDesistencia = 'disponivel' | 'pedida';

export function estadoDaDesistencia(vouchers: Reserva[], agora: Date = new Date()): EstadoDesistencia | null {
  if (!podeDesistir(vouchers, agora)) return null;
  return desistenciaPedida(vouchers[0]) ? 'pedida' : 'disponivel';
}
