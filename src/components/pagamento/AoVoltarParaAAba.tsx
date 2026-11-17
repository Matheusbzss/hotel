'use client';

import { useRouter } from 'next/navigation';
import type { Idioma } from '@/i18n/config';
import type { StatusReserva } from '@/lib/reservas';
import { useStatusDoPedido } from './useStatusDoPedido';

/**
 * A página do pedido que não espera pagamento (pago, contestado, reembolsado, cancelado, finalizar no WhatsApp) confere
 * o status quando o cliente volta para a aba: o pedido pode ter mudado com ela aberta (reembolso, contestação, pago no
 * painel). Sem relógio: parada, a aba não pergunta nada. Mudou, o servidor redesenha (router.refresh: a mesma página,
 * no mesmo documento, que já nasceu sem as tags de anúncio). Só depois de uma leitura que mudou: sem rede (o cliente
 * mostrando o voucher no cais), a pergunta falha em silêncio e a tela fica como está; um refresh sem rede cairia na
 * navegação do navegador e tiraria o voucher da tela. Não desenha nada. O gancho vem do arquivo dele
 * (./useStatusDoPedido.ts), não do CheckoutEmbutido.tsx: a página do pedido pago não leva o formulário da Stripe.
 */
export function AoVoltarParaAAba({
  codigo,
  token,
  idioma,
  status,
}: {
  /** Um código que GET /api/reservas/[codigo] aceita: o do primeiro voucher. */
  codigo: string;
  token: string;
  idioma: Idioma;
  /** O status desse voucher como a consulta o devolve (paraPublico): um voucher reembolsado sozinho não redesenha à toa. */
  status: StatusReserva;
}) {
  const router = useRouter();
  useStatusDoPedido(
    codigo,
    token,
    idioma,
    true,
    (lido) => {
      if (lido.status !== status) router.refresh();
    },
    'ao-voltar',
  );
  return null;
}
