/**
 * As garantias embaixo do botão de pagar do checkout (Pacote 27): só frases que o site já mostra no quadro ao lado do
 * Reservar de cada passeio (passeio.garantiasOnline: cancelamento grátis, reembolso pelo tempo e voucher na hora), na
 * mesma ordem, com os ícones de lá (ICONES, src/components/passeio/Confianca.tsx). Nenhuma frase nova.
 *
 * - O cancelamento grátis até 24 h antes vale sempre: para o passeio e para o transfer.
 * - O reembolso quando o tempo cancela é só do passeio: o carrinho só de transfer não mostra.
 * - O voucher na hora só com o pagamento pelo site (o botão "Pagar"); pelo WhatsApp, o voucher sai quando a equipe
 *   confirma o pagamento, então a linha não aparece.
 */

export type GarantiaDoCheckout = 'cancelar' | 'chuva' | 'voucher';

export function garantiasDoCheckout(
  /** passeio.garantiasOnline: [cancelamento grátis, reembolso pelo tempo, voucher na hora]. */
  frases: readonly string[],
  { temPasseio, voucherNaHora }: { temPasseio: boolean; voucherNaHora: boolean },
): [GarantiaDoCheckout, string][] {
  const [cancelar, chuva, voucher] = frases;
  const todas: [GarantiaDoCheckout, string | undefined, boolean][] = [
    ['cancelar', cancelar, true],
    ['chuva', chuva, temPasseio],
    ['voucher', voucher, voucherNaHora],
  ];
  return todas.flatMap(([icone, frase, vale]) => (vale && frase ? [[icone, frase] as [GarantiaDoCheckout, string]] : []));
}
