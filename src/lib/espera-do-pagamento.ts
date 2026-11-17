import type { FormaPagamento } from './formas-pagamento';
import type { StatusReserva } from './reservas';

/**
 * A tela "Confirmando o pagamento…" do pedido pendente, nas páginas do pedido e da reserva (PagarPedido,
 * src/components/pagamento/CheckoutEmbutido.tsx). Este arquivo roda no navegador e nos testes (node puro), por isso só
 * importa tipos: nada de src/lib/formas-pagamento.ts com valor vai para o navegador por causa dele.
 */

/**
 * O que a tela mostra quando a espera dela (ESPERA_PARA_PAGAR_MS, 15 s) termina sem o pagamento chegar:
 * - 'pagar': o botão "Ainda não pagou? Pagar agora", para quem voltou sem pagar (alguma forma ainda vale), como sempre;
 * - 'esperar-o-pix': a tela continua em "Confirmando o pagamento…", e embaixo de "Se você já pagou…" entra a frase do
 *   Pix já gerado (pedido.pixGerado: pagar pelo app do banco, e a página se atualiza sozinha);
 * - 'sem-formas': o aviso de que o pedido não pode mais ser pago pelo site (pedido.semPrazo), com o e-mail da equipe.
 */
export type DepoisDaEspera = 'pagar' | 'esperar-o-pix' | 'sem-formas';

/**
 * A decisão. Com alguma forma valendo, o botão de pagar. Sem nenhuma, o pedido pendente de Pix continua esperando: o QR
 * que o cliente já gerou vale até a sessão acabar (desligar o pagamento online às pressas, o freio de emergência, não
 * fecha a sessão aberta na Stripe, e o aviso e a consulta do site continuam confirmando o Pix pago), e a consulta do
 * status (useStatusDoPedido) leva a página a "Reserva confirmada!" quando ele é pago, ou a "O tempo para pagar terminou"
 * quando a sessão acaba. Até o reteste de 17/11 (L5d), aos 15 s a tela trocava para "não pode mais ser pago pelo site",
 * com o QR valendo, pago normalmente minutos depois. No cartão, ou sem a forma do pedido, o aviso de sempre.
 */
export function depoisDaEspera(status: StatusReserva, formas: readonly FormaPagamento[], formaAtual?: FormaPagamento): DepoisDaEspera {
  if (formas.length > 0) return 'pagar';
  return status === 'pendente' && formaAtual === 'pix' ? 'esperar-o-pix' : 'sem-formas';
}
