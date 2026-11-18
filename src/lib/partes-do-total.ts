import type { FormaPagamento } from './formas-pagamento';
import type { StatusReserva } from './reservas';

/** Um valor do total em aberto: sem `forma`, o total vai sozinho, sem "no Pix" nem "no cartão". */
export interface ParteDoTotal {
  centavos: number;
  forma?: FormaPagamento;
}

/**
 * Os valores que a tela mostra enquanto o pagamento está em aberto, na ordem: o do Pix (com desconto) e o do cartão.
 * Sem `formas` (o pedido fechado pelo WhatsApp), os dois continuam valendo. No pagamento online, `formas` são as
 * que a faixa mostra (formasDaFaixa): as que ainda dão tempo e, no pedido de Pix, o Pix da sessão que ele já tem
 * (pendente) ou o que o cliente escolheu (vencido, sem forma que valha); passado o prazo do Pix, sobra só o valor do
 * cartão; sem forma nenhuma, ou num pedido sem valor no Pix, o total vai sozinho.
 * Só contas, sem rede nem ambiente: serve às páginas do servidor e ao navegador.
 */
export function partesDoTotal(totalCentavos: number, totalPixCentavos?: number, formas?: readonly FormaPagamento[]): ParteDoTotal[] {
  const vale = (forma: FormaPagamento) => !formas || formas.includes(forma);
  const partes: ParteDoTotal[] = [];
  if (totalPixCentavos) {
    if (vale('pix')) partes.push({ centavos: totalPixCentavos, forma: 'pix' });
    if (vale('cartao')) partes.push({ centavos: totalCentavos, forma: 'cartao' });
  }
  return partes.length ? partes : [{ centavos: totalCentavos }];
}

/** O pagamento online em aberto, como a faixa precisa: as formas que o servidor liberou agora e a do pedido. */
export interface FormasEmAberto {
  /** As formas que ainda valem agora (formasDoPagamento). */
  formas: readonly FormaPagamento[];
  /** A forma da sessão que o pedido tem (metodo_pagamento). */
  formaAtual?: FormaPagamento;
}

/**
 * As formas cujo valor a faixa do total mostra (o `formas` de partesDoTotal), a regra única das duas páginas (a do pedido
 * e a da reserva, StatusReserva): as que ainda valem e, quando o pedido é de Pix e o Pix já não está entre elas, também o
 * Pix, em dois casos:
 * - pendente: é o Pix já gerado. Com o pagamento online desligado às pressas (o freio de emergência) ou passado o prazo do
 *   Pix, o QR que o cliente tem na mão continua valendo até a sessão acabar, e a faixa mostrava só o valor do cartão, sem o
 *   "no Pix" (L5d do reteste de 17/11): "R$ 138,60 no Pix" (com o cartão valendo, o do Pix e o do cartão);
 * - vencido, sem nenhuma forma valendo (o freio, ou passado o prazo de todas): o valor da forma que o cliente escolheu, com
 *   o rótulo, "Expirado R$ 138,60 no Pix". Até o Pacote 17 (reteste de 17-18/11) a faixa dizia "Expirado R$ 154,00", o
 *   total do cartão. Vencido com alguma forma valendo, só as que valem, como sempre (o QR morreu com a sessão).
 * O pedido de cartão nunca ganha forma: sem forma que valha, o total vai sozinho, "R$ 154,00", sem o "no cartão" (como
 * antes do Pacote 14), porque o "no cartão" ao lado de "Este pedido não pode mais ser pago pelo site" convidava a tentar
 * pagar onde não dá. Sem o pagamento online (o pedido do WhatsApp, ou fechado), undefined: partesDoTotal faz como sempre.
 * Nos outros estados e sem a forma do pedido, só as que valem, como antes.
 */
export function formasDaFaixa(status: StatusReserva, pagamento: FormasEmAberto | null | undefined): readonly FormaPagamento[] | undefined {
  if (!pagamento) return undefined;
  const { formas, formaAtual } = pagamento;
  if (formaAtual !== 'pix' || formas.includes('pix')) return formas;
  if (status === 'pendente') return [...formas, 'pix'];
  return status === 'expirado' && formas.length === 0 ? ['pix'] : formas;
}
