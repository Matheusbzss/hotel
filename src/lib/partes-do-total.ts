import type { FormaPagamento } from './formas-pagamento';

/** Um valor do total em aberto: sem `forma`, o total vai sozinho, sem "no Pix" nem "no cartão". */
export interface ParteDoTotal {
  centavos: number;
  forma?: FormaPagamento;
}

/**
 * Os valores que a tela mostra enquanto o pagamento está em aberto, na ordem: o do Pix (com desconto) e o do cartão.
 * Sem `formas` (o pedido fechado pelo WhatsApp), os dois continuam valendo. No pagamento online, `formas` são as
 * que ainda dão tempo: passado o prazo do Pix, sobra só o valor do cartão; sem forma nenhuma, ou num pedido sem
 * valor no Pix, o total vai sozinho. Só contas, sem rede nem ambiente: serve às páginas do servidor e ao navegador.
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
