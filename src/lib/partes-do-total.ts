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
 * que a faixa mostra (formasDaFaixa): as que ainda dão tempo e, no pedido pendente, a da sessão que ele já tem; passado
 * o prazo do Pix, sobra só o valor do cartão; sem forma nenhuma, ou num pedido sem valor no Pix, o total vai sozinho.
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
 * e a da reserva, StatusReserva): as que ainda valem e, enquanto o pedido está pendente, também a forma da sessão que ele
 * tem, quando ela já não está entre as que valem. É o Pix já gerado: com o pagamento online desligado às pressas (o freio
 * de emergência) ou passado o prazo do Pix, o QR que o cliente tem na mão continua valendo até a sessão acabar, e a faixa
 * mostrava só o valor do cartão, sem o "no Pix" (L5d do reteste de 17/11). Sem o pagamento online (o pedido do WhatsApp,
 * ou fechado), undefined: partesDoTotal faz como sempre. Nos outros estados (vencido) e sem a forma do pedido, só as que
 * valem, como antes.
 */
export function formasDaFaixa(status: StatusReserva, pagamento: FormasEmAberto | null | undefined): readonly FormaPagamento[] | undefined {
  if (!pagamento) return undefined;
  const { formas, formaAtual } = pagamento;
  return status === 'pendente' && formaAtual && !formas.includes(formaAtual) ? [...formas, formaAtual] : formas;
}
