// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { HORA_ENTRADA_CASA, sinalCentavos } from './diarias.ts';
import { cotacaoDolar, taxaDolarValida } from './dolar.ts';
import { ANTECEDENCIA_MINIMA_MINUTOS, agoraEmBuzios, paraMinutos } from './horarios.ts';
import type { StatusReserva } from './reservas';

/**
 * As formas de pagamento online e as regras que decidem quando cada uma aparece e quanto cobra. Só contas e
 * regras, sem rede nem banco: assim dá para testar (tests/formas-pagamento.test.ts). Nada aqui carrega o SDK
 * da Stripe no carregamento, então um componente do navegador pode importar mostrarWhatsApp; só
 * formasDoPagamento (e formasDisponiveis, que a usa) lê as variáveis de ambiente (PAGAMENTO_ONLINE e as chaves) e a
 * cotação do dólar, e é só para o servidor.
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

/**
 * O pagamento online está no ar para todo mundo (PAGAMENTO_ONLINE=publico): os textos legais, a FAQ das formas de
 * pagamento e de segurança e os avisos do WhatsApp passam para a versão do pagamento online (src/lib/textos-do-site.ts).
 * No modo 'admin' o público ainda vê o caminho do WhatsApp, então os textos continuam os de hoje. As páginas legais e a
 * inicial são estáticas: o valor é lido no build, e o dono liga com um novo deploy.
 */
export const pagamentoOnlineNoAr = (): boolean => modoPagamentoOnline() === 'publico';

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

/**
 * Um item do pedido como a escolha da forma de pagamento precisa: os totais nas duas formas e quando começa. Um voucher
 * gravado (Reserva) já tem esse formato.
 */
export type ItemPagavel = ItemCobravel & ItemAgendado;

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

/**
 * Quantos segundos faltam, agora, para o item começar, no fuso de Búzios (negativo se já começou). Uma data ou hora
 * que não dá para ler dá NaN, que nenhuma comparação aceita: nunca libera pagamento.
 */
export function segundosAteOInicio(item: ItemAgendado, agora: Date): number {
  const { data, hora } = inicioDoItem(item);
  const { data: hoje, minutos } = agoraEmBuzios(agora);
  const faltamMinutos = diasEntre(hoje, data) * 24 * 60 + paraMinutos(hora) - minutos;
  // agoraEmBuzios conta minutos inteiros: os segundos do minuto corrente saem aqui (o fuso de Búzios é de horas inteiras)
  return faltamMinutos * 60 - agora.getUTCSeconds();
}

/** O QR do Pix vale 30 minutos (FASE-4.md, Etapa 5, item 2), o mesmo tempo da sessão de pagamento (src/lib/stripe.ts). */
export const PIX_EXPIRA_SEGUNDOS = 30 * 60;
/** Com menos que isto até o prazo do Pix, o QR não dá tempo de pagar: o Pix nem é oferecido e fica só o cartão. */
export const PIX_VALIDADE_MINIMA_SEGUNDOS = 10 * 60;

/**
 * Quantos segundos o QR do Pix vale se for gerado agora, ou null quando o Pix não deve ser oferecido. O Pix vale até
 * 2 horas antes do primeiro serviço do pedido (ANTECEDENCIA_MINIMA_MINUTOS). O QR dura 30 minutos, ou só até esse
 * prazo quando falta menos que isso; com menos de 10 minutos, null (só o cartão). É a regra única do prazo do Pix:
 * pixDisponivel (o que a tela oferece) e os parâmetros da sessão (expires_after_seconds, src/lib/stripe.ts) fazem esta
 * mesma conta, com o mesmo `agora`.
 * A Stripe aceita de 60 a 1.209.600 segundos e conta a partir de quando o cliente toca em pagar e o QR aparece, não da
 * criação da sessão (referência da API da Stripe, criação da Checkout Session, payment_method_options.pix.
 * expires_after_seconds: "The number of seconds after PaymentIntent confirmation when the Pix expires"). Quem demora
 * para tocar em pagar leva esse tempo a mais: no máximo os 31 minutos da sessão (com a folga), e o QR ainda vence pelo
 * menos 89 minutos antes do serviço.
 */
export function validadeDoPix(itens: ItemAgendado[], agora: Date = new Date()): number | null {
  if (!itens.length) return null;
  const ate = Math.min(...itens.map((item) => segundosAteOInicio(item, agora))) - ANTECEDENCIA_MINIMA_MINUTOS * 60;
  // NaN (uma data que não dá para ler) também cai aqui
  if (!(ate >= PIX_VALIDADE_MINIMA_SEGUNDOS)) return null;
  return Math.min(PIX_EXPIRA_SEGUNDOS, ate);
}

/** O Pix pode ser oferecido: o QR, gerado agora, ainda vale pelo menos 10 minutos antes do prazo do Pix (validadeDoPix). */
export function pixDisponivel(itens: ItemAgendado[], agora: Date = new Date()): boolean {
  return validadeDoPix(itens, agora) !== null;
}

/**
 * O limite de um Pix na Stripe: o equivalente a US$ 3.000 em reais por pagamento, também para as empresas do Brasil
 * (docs.stripe.com/payments/pix, "Transaction limits": "The default per-payment maximum is the BRL equivalent of
 * 3,000 USD, including for businesses in Brazil"). O pedido inteiro é um pagamento só.
 */
export const PIX_LIMITE_DOLARES = 3000;
/**
 * A folga sobre a cotação guardada (a PTAX do Banco Central, src/lib/dolar.ts): a Stripe converte pela taxa dela, e o
 * dólar mexe de um dia para o outro. Com 10%, o site oferece o Pix até o equivalente a US$ 2.700,00.
 */
export const PIX_MARGEM_DO_LIMITE = 0.1;
/**
 * Sem cotação que valha (vencida ou fora do ar): um teto fixo em reais, que cabe no limite da Stripe enquanto o dólar
 * valer mais de R$ 3,34. O maior pedido de hoje (o sinal da Geribá no Réveillon, R$ 4.950,00 no Pix) cabe nele.
 */
export const PIX_TETO_SEM_COTACAO_CENTAVOS = 1_000_000;
/** Os dólares que o site aceita num Pix: o limite da Stripe menos a folga. */
const DOLARES_QUE_CABEM = Math.round(PIX_LIMITE_DOLARES * (1 - PIX_MARGEM_DO_LIMITE));
/** Até aqui o valor no Pix cabe com qualquer cotação que valha (mais de R$ 1,00 por dólar): nem precisa buscá-la. */
const CABE_COM_QUALQUER_COTACAO_CENTAVOS = DOLARES_QUE_CABEM * 100;

/** Até quanto o site aceita num Pix, em centavos de real: pela cotação do dólar, com a folga; sem cotação, o teto fixo. */
export function limiteDoPixCentavos(cotacao: number | null | undefined): number {
  return taxaDolarValida(cotacao) ? Math.floor(DOLARES_QUE_CABEM * cotacao * 100) : PIX_TETO_SEM_COTACAO_CENTAVOS;
}

/** O valor no Pix do pedido (nas casas, o sinal) cabe no limite de um Pix. Um valor que não dá para ler não cabe. */
export function pixCabeNoLimite(itens: ItemCobravel[], cotacao: number | null | undefined): boolean {
  return valorACobrar(itens, 'pix') <= limiteDoPixCentavos(cotacao);
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
 * Por que o Pix não aparece, para a frase da tela: o prazo (o primeiro serviço começa em menos de 2 horas e 10 minutos)
 * ou o limite de valor de um Pix.
 */
export type MotivoSemPix = 'prazo' | 'limite';

/** As formas que valem agora e, quando o Pix fica de fora, o motivo. */
export interface FormasDoPagamento {
  formas: FormaPagamento[];
  semPix?: MotivoSemPix;
}

/**
 * A regra das formas, sem rede nem variável de ambiente: o cartão até 30 minutos antes do primeiro serviço; o Pix
 * enquanto o QR ainda vale 10 minutos antes do prazo dele (validadeDoPix) e o valor no Pix cabe no limite de um Pix
 * (pixCabeNoLimite, com a cotação do dólar). Fora do prazo, o motivo é o prazo, mesmo que o valor também passe do limite.
 */
export function escolherFormas(itens: ItemPagavel[], agora: Date, cotacao: number | null | undefined): FormasDoPagamento {
  const semPix: MotivoSemPix | undefined = !pixDisponivel(itens, agora) ? 'prazo' : !pixCabeNoLimite(itens, cotacao) ? 'limite' : undefined;
  const cartao = cartaoDisponivel(itens, agora);
  const formas = FORMAS_PAGAMENTO.filter((forma) => (forma === 'pix' ? !semPix : cartao));
  return semPix ? { formas, semPix } : { formas };
}

/**
 * As formas que o checkout oferece agora, com o motivo quando o Pix fica de fora: nenhuma com o interruptor desligado,
 * só para o admin no modo 'admin', e só com a Stripe configurada; de resto, escolherFormas (o Pix até 2 horas antes do
 * primeiro serviço e dentro do limite de valor; o cartão até 30 minutos antes). A cotação do dólar, para o limite do
 * Pix, só é buscada quando o valor no Pix pode passar dele; `opcoes.cotacao` a fixa (os testes).
 */
export async function formasDoPagamento(
  itens: ItemPagavel[],
  agora: Date = new Date(),
  opcoes: { admin: boolean; cotacao?: number | null } = { admin: false },
): Promise<FormasDoPagamento> {
  const modo = modoPagamentoOnline();
  if (modo === 'desligado' || (modo === 'admin' && !opcoes.admin)) return { formas: [] };
  // a Stripe (e o SDK dela) só é carregada aqui, no servidor: quem importa este arquivo no navegador não a leva junto
  const { stripeConfigurado } = await import('./stripe.ts');
  if (!stripeConfigurado()) return { formas: [] };
  let cotacao = opcoes.cotacao;
  if (cotacao === undefined) {
    const podePassar = pixDisponivel(itens, agora) && !(valorACobrar(itens, 'pix') <= CABE_COM_QUALQUER_COTACAO_CENTAVOS);
    cotacao = podePassar ? await cotacaoDolar(agora) : null;
  }
  return escolherFormas(itens, agora, cotacao);
}

/** Só a lista de formas de formasDoPagamento (quem não mostra o motivo de o Pix ficar de fora). */
export async function formasDisponiveis(
  itens: ItemPagavel[],
  agora: Date = new Date(),
  opcoes: { admin: boolean; cotacao?: number | null } = { admin: false },
): Promise<FormaPagamento[]> {
  return (await formasDoPagamento(itens, agora, opcoes)).formas;
}
