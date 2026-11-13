// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { segundosAteOInicio } from './formas-pagamento.ts';
import { provedorDaReserva } from './pedidos-painel.ts';
import type { Reserva } from './reservas';

/**
 * A desistência da compra pelo próprio site: o link "Desistir da compra" da página do pedido (Decreto 7.962/2013,
 * art. 5º, § 1º: o consumidor desiste pela mesma ferramenta usada na compra). O pedido de desistência vira uma linha
 * de aviso no histórico do pedido (o painel destaca as que começam com "Aviso:" e mostra no topo quantas esperam
 * resposta), a confirmação aparece na hora, na tela, e sai por e-mail para o cliente, com a data e a hora (§ 4º:
 * confirmação imediata do recebimento); a equipe recebe um aviso por e-mail. Nada é reembolsado sozinho: a equipe
 * responde por e-mail em até 1 dia útil e reembolsa pela política de cancelamento (no arrependimento dos 7 dias, pede o
 * estorno à Stripe em até 1 dia útil depois que o pedido chega). Aqui só as regras, sem rede nem banco
 * (tests/desistencia.test.ts); a rota é POST /api/pedido/[codigo]/desistir.
 */

/** O começo da linha que o pedido de desistência grava no histórico: é por ela que se sabe que ele já foi feito. */
export const AVISO_DESISTENCIA = 'Aviso: pedido de desistência pelo site';
/** O motivo que o cliente escreve (opcional) fica com no máximo isto de letras. */
export const MOTIVO_MAXIMO = 500;
/** O arrependimento do Código de Defesa do Consumidor (art. 49): 7 dias, contados aqui do pagamento. */
export const ARREPENDIMENTO_DIAS = 7;
/**
 * A linha que a equipe grava no painel quando respondeu ao pedido de desistência sem reembolso pelo site (fora dos 7
 * dias, a política não devolveu): o pedido sai da faixa do topo do painel.
 */
export const DESISTENCIA_RESPONDIDA = 'Desistência respondida pela equipe, sem reembolso pelo site';

/**
 * O motivo numa linha só, sem espaços sobrando e cortado no máximo. Ele vai para o histórico (o painel mostra) e para o
 * aviso por e-mail à equipe, entre « »: as aspas e os « » que o cliente escrever viram aspas simples (ninguém fecha o
 * trecho dele) e o "Aviso:" perde os dois-pontos (ninguém escreve uma linha que pareça um aviso do site).
 */
export function limparMotivo(motivo: string | undefined): string {
  return (motivo ?? '')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/[«»"“”„‟‹›]/g, "'")
    .replace(/aviso\s*:/giu, 'aviso')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MOTIVO_MAXIMO)
    .trim();
}

/** Uma data e hora no horário de Brasília, para a equipe: "10/11/2026 14:32". */
const dataHoraEmBrasilia = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

/**
 * O pedido de desistência chegou dentro dos 7 dias do arrependimento, contados da compra (o pagamento; sem a data dele,
 * a criação do pedido). null quando não há data que dê para ler.
 */
export function dentroDoArrependimento(compraEm: string | undefined, quando: Date): boolean | null {
  const t = compraEm ? Date.parse(compraEm) : Number.NaN;
  if (Number.isNaN(t)) return null;
  return quando.getTime() - t <= ARREPENDIMENTO_DIAS * 86_400_000;
}

/** O prazo dito à equipe (histórico e aviso por e-mail): dentro ou fora dos 7 dias, com a data da compra. */
export function prazoDoArrependimento(compraEm: string | undefined, quando: Date): string {
  const dentro = dentroDoArrependimento(compraEm, quando);
  if (dentro === null || !compraEm) return 'sem a data da compra: conferir os 7 dias do arrependimento no pedido';
  const data = dataHoraEmBrasilia(compraEm);
  return dentro
    ? `dentro dos 7 dias do arrependimento (compra em ${data}): reembolso integral`
    : `fora dos 7 dias do arrependimento (compra em ${data}): vale a política de cancelamento`;
}

/**
 * A linha do histórico: o aviso, o prazo do arrependimento (quando vem a data da compra), o que a equipe faz em
 * seguida e, no fim, o motivo que o cliente escreveu, entre « ».
 */
export function linhaDaDesistencia(motivo?: string, prazo?: { compraEm?: string; agora: Date }): string {
  const limpo = limparMotivo(motivo);
  const dias = prazo ? ` (${prazoDoArrependimento(prazo.compraEm, prazo.agora)})` : '';
  return (
    `${AVISO_DESISTENCIA}${dias}: responder ao cliente por e-mail em até 1 dia útil e reembolsar conforme a política de ` +
    `cancelamento, só pela forma original do pagamento${limpo ? `. Motivo escrito pelo cliente: «${limpo}»` : ''}`
  );
}

/** O pedido já tem um pedido de desistência: um só por pedido, o repetido só ouve que já foi recebido. */
export const desistenciaPedida = (r: Pick<Reserva, 'historico'>): boolean =>
  (r.historico ?? []).some((h) => h.evento.startsWith(AVISO_DESISTENCIA));

/** A equipe marcou no painel que respondeu ao pedido de desistência sem reembolso pelo site. */
export const desistenciaRespondida = (r: Pick<Reserva, 'historico'>): boolean =>
  (r.historico ?? []).some((h) => h.evento.startsWith(DESISTENCIA_RESPONDIDA));

/**
 * O pedido de desistência ainda espera a equipe: o pedido continua pago, nada voltou para o cliente e ninguém marcou
 * no painel que respondeu. É o que a faixa do topo do painel conta (funciona mesmo sem os e-mails ligados).
 */
export function desistenciaParaResponder(r: Pick<Reserva, 'status' | 'historico' | 'reembolsoCentavos'>): boolean {
  return r.status === 'pago' && !(r.reembolsoCentavos ?? 0) && desistenciaPedida(r) && !desistenciaRespondida(r);
}

/** A frase da faixa do topo do painel. */
export const avisoDasDesistencias = (n: number): string =>
  n === 1 ? '1 pedido de desistência para responder' : `${n} pedidos de desistência para responder`;

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
