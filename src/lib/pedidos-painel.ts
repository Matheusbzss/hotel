import type { MetodoPagamento, Reserva, StatusReserva } from './reservas';

/**
 * O pedido como o painel mostra: um pagamento e um voucher para cada item. Aqui só se agrupa e se soma,
 * sem tocar no banco: assim dá para testar (tests/estatisticas.test.ts).
 */

/** Quando o item acontece, para mostrar os itens de um pedido na ordem da viagem. */
export const quandoAcontece = (r: Reserva) => `${r.data} ${r.tipo === 'transfer' ? r.transfer.ida.hora : (r.horario?.hora ?? '')}`;

/**
 * O que entrou de fato: no Pix, o total com o desconto; no cartão, o total cheio. Na reserva paga no Pix
 * online, o `totalCentavos` já é o total com o desconto (ela não tem `totalPixCentavos`).
 */
export const valorRecebido = (r: Reserva) => (r.pagamento.metodo === 'pix' ? (r.totalPixCentavos ?? r.totalCentavos) : r.totalCentavos);

export interface PedidoPainel {
  /** O código do pedido. Com um item só, é o próprio voucher. */
  codigo: string;
  /** Um voucher por item, na ordem da viagem. O cliente, o pagamento e o histórico são os mesmos em todos. */
  itens: Reserva[];
  status: StatusReserva;
  criadoEm: string;
  pagoEm?: string;
  metodo: MetodoPagamento;
  totalCentavos: number;
  /** O total no Pix, quando a forma de pagamento ainda vai ser combinada pelo WhatsApp. */
  totalPixCentavos?: number;
  /** O total pela forma de pagamento registrada. */
  recebidoCentavos: number;
}

/** Junta os vouchers no pedido de cada um, do mais novo para o mais antigo. */
export function agruparPedidos(reservas: Reserva[]): PedidoPainel[] {
  const grupos = new Map<string, Reserva[]>();
  for (const r of reservas) {
    const codigo = r.pedido?.codigo ?? r.codigo;
    grupos.set(codigo, [...(grupos.get(codigo) ?? []), r]);
  }
  return [...grupos]
    .map(([codigo, vouchers]) => {
      const itens = vouchers.toSorted((a, b) => quandoAcontece(a).localeCompare(quandoAcontece(b)));
      const r = itens[0];
      return {
        codigo,
        itens,
        status: r.status,
        criadoEm: r.criadaEm,
        pagoEm: r.pagamento.pagoEm,
        metodo: r.pagamento.metodo,
        totalCentavos: r.pedido?.totalCentavos ?? r.totalCentavos,
        totalPixCentavos: r.pedido ? r.pedido.totalPixCentavos : r.totalPixCentavos,
        recebidoCentavos: itens.reduce((soma, i) => soma + valorRecebido(i), 0),
      };
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}
