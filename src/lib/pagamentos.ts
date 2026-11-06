import { interpretarPedido, obterPedido, pagarmeConfigurado } from './pagarme';
import { atualizarReserva, registrar, type Reserva, type StatusReserva } from './reservas';

/** Status que não voltam atrás (exceto pago → reembolsado). */
const FINAIS: StatusReserva[] = ['pago', 'reembolsado', 'cancelado'];

function podeMudar(de: StatusReserva, para: StatusReserva): boolean {
  if (de === para) return false;
  if (de === 'pago') return para === 'reembolsado';
  if (FINAIS.includes(de)) return false;
  return true;
}

/** Consulta o pedido na Pagar.me e atualiza a reserva. A Pagar.me é sempre a fonte da verdade. */
export async function sincronizarReserva(reserva: Reserva, origem: 'webhook' | 'consulta'): Promise<Reserva> {
  if (!reserva.pagamento.pedidoId || !pagarmeConfigurado()) return reserva;
  const pedido = await obterPedido(reserva.pagamento.pedidoId);
  if (pedido.code && pedido.code !== reserva.codigo) return reserva;
  const info = interpretarPedido(pedido);
  const atualizada = await atualizarReserva(reserva.codigo, (r) => {
    const mudou = podeMudar(r.status, info.status);
    r.pagamento.ultimaConsulta = new Date().toISOString();
    if (!mudou) return origem === 'consulta' ? r : null;
    r.status = info.status;
    if (info.pagoEm || info.status === 'pago') r.pagamento.pagoEm = info.pagoEm ?? new Date().toISOString();
    if (info.cartaoFinal) r.pagamento.cartaoFinal = info.cartaoFinal;
    if (info.cartaoBandeira) r.pagamento.cartaoBandeira = info.cartaoBandeira;
    if (info.motivo && info.status === 'recusado') r.pagamento.motivo = info.motivo;
    return registrar(r, `Status ${info.status} (${origem === 'webhook' ? 'webhook Pagar.me' : 'consulta à Pagar.me'})`);
  });
  return atualizada ?? reserva;
}
