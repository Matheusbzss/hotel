'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import type { Idioma } from '@/i18n/config';
import { leituraMudou, useStatusDoPedido, type LeituraQueRedesenha } from './useStatusDoPedido';

/** Um voucher do pedido como a página o mostrou ao abrir: o código e o que a consulta devolve dele (paraPublico). */
export type VoucherDaPagina = { codigo: string } & LeituraQueRedesenha;

/**
 * A página do pedido que não espera pagamento (pago, contestado, reembolsado, cancelado, finalizar no WhatsApp) confere
 * os vouchers quando o cliente volta para a aba: o pedido pode ter mudado com ela aberta (reembolso, contestação, pago no
 * painel). Cada voucher é perguntado ao servidor e comparado com o que a página mostrou ao abrir (leituraMudou: o status
 * dele, o valor devolvido e as partes de um reembolso que falhou). Até o reteste de 16-17/11 (R5) só o primeiro voucher
 * era perguntado, só pelo status: o reembolso de outro voucher sozinho e a devolução por outro meio registrada pela
 * equipe não redesenhavam a página. Sem relógio: parada, a aba não pergunta nada. Mudou, o servidor redesenha
 * (router.refresh: a mesma página, no mesmo documento, que já nasceu sem as tags de anúncio), uma vez só por volta,
 * mesmo com vários vouchers mudados (o pedido inteiro reembolsado). Só depois de uma leitura que mudou: sem rede (o
 * cliente mostrando o voucher no cais), a pergunta falha em silêncio e a tela fica como está; um refresh sem rede cairia
 * na navegação do navegador e tiraria o voucher da tela. Não desenha nada. O gancho vem do arquivo dele
 * (./useStatusDoPedido.ts), não do CheckoutEmbutido.tsx: a página do pedido pago não leva o formulário da Stripe.
 */
export function AoVoltarParaAAba({
  token,
  idioma,
  vouchers,
}: {
  token: string;
  idioma: Idioma;
  /** Todos os vouchers do pedido, com os valores de quando a página abriu (paraPublico de cada um). */
  vouchers: VoucherDaPagina[];
}) {
  const router = useRouter();
  // a trava do redesenho: vários vouchers mudados na mesma volta pedem um redesenho só. Ela solta quando a página
  // redesenhada chega (os valores novos, numa lista nova)
  const redesenhando = useRef(false);
  useEffect(() => {
    redesenhando.current = false;
  }, [vouchers]);
  const redesenhar = useCallback(() => {
    if (redesenhando.current) return;
    redesenhando.current = true;
    router.refresh();
  }, [router]);
  return (
    <>
      {vouchers.map((v) => (
        <ConfereOVoucher key={v.codigo} voucher={v} token={token} idioma={idioma} aoMudar={redesenhar} />
      ))}
    </>
  );
}

/** Um voucher: a pergunta dele ao servidor quando o cliente volta para a aba (na hora), comparada com o que a página mostrou. */
function ConfereOVoucher({
  voucher,
  token,
  idioma,
  aoMudar,
}: {
  voucher: VoucherDaPagina;
  token: string;
  idioma: Idioma;
  aoMudar: () => void;
}) {
  useStatusDoPedido(
    voucher.codigo,
    token,
    idioma,
    true,
    (lido) => {
      if (leituraMudou(lido, voucher)) aoMudar();
    },
    'ao-voltar',
  );
  return null;
}
