// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { HORA_ENTRADA_CASA, sinalCentavos } from './diarias.ts';
import { ANTECEDENCIA_MINIMA_MINUTOS, agoraEmBuzios, paraMinutos } from './horarios.ts';
import type { StatusReserva } from './reservas';

/**
 * As formas de pagamento online e as regras que decidem quando cada uma aparece e quanto cobra. Só contas e
 * regras, sem rede nem banco: assim dá para testar (tests/formas-pagamento.test.ts). Nada aqui carrega o SDK
 * da Stripe no carregamento, então um componente do navegador pode importar mostrarWhatsApp; só
 * formasDisponiveis lê as variáveis de ambiente (PAGAMENTO_ONLINE e as chaves) e é só para o servidor.
 */

export type FormaPagamento = 'cartao' | 'pix';
export const FORMAS_PAGAMENTO: readonly FormaPagamento[] = ['cartao', 'pix'];
export const isFormaPagamento = (valor: unknown): valor is FormaPagamento => valor === 'cartao' || valor === 'pix';

/**
 * O interruptor do pagamento online (variável PAGAMENTO_ONLINE): 'desligado' (padrão), 'admin' (só quem tem
 * o cookie do /admin vê cartão e Pix) ou 'publico' (todo mundo). O dono liga para o público com um redeploy.
 */
export type ModoPagamentoOnline = 'desligado' | 'admin' | 'publico';
export function modoPagamentoOnline(): ModoPagamentoOnline {
  const valor = process.env.PAGAMENTO_ONLINE;
  return valor === 'admin' || valor === 'publico' ? valor : 'desligado';
}

export type TipoItem = 'passeio' | 'transfer' | 'casa';

/** O que um item precisa dizer para se saber quanto cobrar: os totais nas duas formas e, nas casas, o tipo. */
export interface ItemCobravel {
  tipo?: TipoItem;
  /** O total no cartão. */
  totalCentavos: number;
  /** O total no Pix (com o desconto). Sem ele, o Pix cobra o mesmo do cartão. */
  totalPixCentavos?: number;
}

/** O que um item precisa dizer para se saber se ainda dá tempo de pagar: a data e a hora em que começa. */
export interface ItemAgendado {
  tipo?: TipoItem;
  /** AAAA-MM-DD: a data do passeio, a da ida do transfer, a da entrada na casa. */
  data: string;
  /** Passeio: a hora escolhida. */
  horario?: { hora: string };
  /** Transfer: a hora da saída da ida. */
  transfer?: { ida: { hora: string } };
}

/** O total de um item na forma escolhida (sem a regra do sinal das casas). */
export function totalDoItem(item: ItemCobravel, forma: FormaPagamento): number {
  return forma === 'pix' ? (item.totalPixCentavos ?? item.totalCentavos) : item.totalCentavos;
}

/**
 * Quanto cobrar por um item na forma escolhida, em centavos: o total no passeio e no transfer; na casa, o
 * sinal de 50% sobre o total (sobre o total com o desconto, no Pix), arredondado em centavos.
 */
export function valorDoItem(item: ItemCobravel, forma: FormaPagamento): number {
  const total = totalDoItem(item, forma);
  return item.tipo === 'casa' ? sinalCentavos(total) : total;
}

/** O que a sessão de pagamento cobra: a soma dos itens na forma escolhida. */
export function valorACobrar(itens: ItemCobravel[], forma: FormaPagamento): number {
  return itens.reduce((soma, item) => soma + valorDoItem(item, forma), 0);
}

/** Quando o item começa: o horário do passeio, a saída da ida do transfer, a hora de entrada na casa. */
export function inicioDoItem(item: ItemAgendado): { data: string; hora: string } {
  const hora = item.tipo === 'casa' ? HORA_ENTRADA_CASA : item.transfer ? item.transfer.ida.hora : (item.horario?.hora ?? '00:00');
  return { data: item.data, hora };
}

/** Quantos dias de calendário vão de uma data (AAAA-MM-DD) até a outra. */
const diasEntre = (de: string, ate: string): number =>
  Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);

/**
 * Ainda dá tempo de pagar o item: ele começa pelo menos `antecedenciaMinutos` depois de agora, no fuso de
 * Búzios. A conta atravessa a virada do dia: às 23h30, o transfer da 0h30 de amanhã começa em 60 minutos,
 * e o Pix (que pede 120) já não vale para ele. Uma data que não dá para ler conta como fora do prazo.
 */
export function dentroDoPrazo(item: ItemAgendado, agora: Date, antecedenciaMinutos: number = ANTECEDENCIA_MINIMA_MINUTOS): boolean {
  const { data, hora } = inicioDoItem(item);
  const { data: hoje, minutos } = agoraEmBuzios(agora);
  if (data < hoje) return false;
  const faltam = diasEntre(hoje, data) * 24 * 60 + paraMinutos(hora) - minutos;
  return faltam >= antecedenciaMinutos;
}

/** O Pix pode ser oferecido: todos os itens começam com a antecedência mínima (a sessão e o QR valem 30 minutos). */
export function pixDisponivel(itens: ItemAgendado[], agora: Date = new Date()): boolean {
  return itens.length > 0 && itens.every((item) => dentroDoPrazo(item, agora, ANTECEDENCIA_MINIMA_MINUTOS));
}

/**
 * Quanto antes do serviço o cartão fecha: 30 minutos (decisão do dono de 11/11). É o tempo que a sessão de pagamento
 * dura (VALIDADE_SESSAO_MINUTOS, src/lib/stripe.ts; tests/formas-pagamento.test.ts confere que este número não fica
 * menor que aquele), então quem abre a tela no último minuto ainda paga antes de o serviço começar. No pior caso (o
 * minuto de folga da sessão e os segundos do relógio) o pagamento chega até uns 2 minutos depois do horário: aí o
 * histórico do pedido recebe AVISO_PAGO_DEPOIS_DO_HORARIO (src/lib/pagamento-stripe.ts), para a equipe ver no painel.
 */
export const ANTECEDENCIA_CARTAO_MINUTOS = 30;

/**
 * O cartão pode ser oferecido até 30 minutos antes do primeiro serviço; o prazo de 2 horas é só do Pix (FASE-4.md:
 * "Prazo do Pix: até 2 horas antes do início de qualquer serviço. Depois disso, só cartão."). Só pesa para o pedido
 * feito antes e pago depois: um pedido novo já exige as 2 horas de antecedência (src/lib/horarios.ts).
 */
export function cartaoDisponivel(itens: ItemAgendado[], agora: Date = new Date()): boolean {
  return itens.length > 0 && itens.every((item) => dentroDoPrazo(item, agora, ANTECEDENCIA_CARTAO_MINUTOS));
}

/**
 * O WhatsApp da equipe só aparece depois do pagamento aprovado: nunca em pendente, recusado, expirado,
 * cancelado, nem na volta do navegador antes do webhook. Páginas, PDF e e-mails passam por aqui.
 */
export const mostrarWhatsApp = (status: StatusReserva): boolean => status === 'pago';

/**
 * As formas que o checkout oferece agora: nenhuma com o interruptor desligado, só para o admin no modo
 * 'admin', e só com a Stripe configurada; de resto, cada forma entra se todos os itens ainda estão no prazo
 * dela (o Pix até 2 horas antes do primeiro serviço; o cartão até 30 minutos antes).
 */
export async function formasDisponiveis(
  itens: ItemAgendado[],
  agora: Date = new Date(),
  opcoes: { admin: boolean } = { admin: false },
): Promise<FormaPagamento[]> {
  const modo = modoPagamentoOnline();
  if (modo === 'desligado' || (modo === 'admin' && !opcoes.admin)) return [];
  // a Stripe (e o SDK dela) só é carregada aqui, no servidor: quem importa este arquivo no navegador não a leva junto
  const { stripeConfigurado } = await import('./stripe.ts');
  if (!stripeConfigurado()) return [];
  return FORMAS_PAGAMENTO.filter((forma) => (forma === 'pix' ? pixDisponivel(itens, agora) : cartaoDisponivel(itens, agora)));
}
