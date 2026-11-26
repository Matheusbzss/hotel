/**
 * As garantias embaixo do botão de pagar do checkout (Pacote 27): só frases que o site já mostra no quadro ao lado do
 * Reservar de cada passeio (passeio.garantiasOnline: cancelamento grátis, reembolso pelo tempo e voucher na hora, e
 * passeio.pagoSeguroOnline: o pagamento seguro), na mesma ordem, com os ícones de lá (ICONES,
 * src/components/passeio/Confianca.tsx). Nenhuma frase nova.
 *
 * - O cancelamento grátis até 24 h antes vale sempre: para o passeio e para o transfer.
 * - O reembolso quando o tempo cancela é só do passeio: o carrinho só de transfer não mostra.
 * - O voucher na hora só com o pagamento pelo site (o botão "Pagar"); pelo WhatsApp, o voucher sai quando a equipe
 *   confirma o pagamento, então a linha não aparece.
 * - Pacote 34 (P7): o pagamento seguro, com o escudo, também só com o pagamento pelo site. É a resposta à dúvida "é seguro
 *   pôr meu cartão num site do Brasil?", ali onde ela aparece: no botão de pagar.
 */

export type GarantiaDoCheckout = 'cancelar' | 'chuva' | 'voucher' | 'pagamento';

export function garantiasDoCheckout(
  /** passeio.garantiasOnline: [cancelamento grátis, reembolso pelo tempo, voucher na hora]. */
  frases: readonly string[],
  {
    temPasseio,
    voucherNaHora,
    pagoSeguro = '',
  }: {
    temPasseio: boolean;
    /** O pagamento é pelo site (o botão "Pagar"): o voucher na hora e o pagamento seguro valem. */
    voucherNaHora: boolean;
    /** passeio.pagoSeguroOnline: "Pago seguro con Pix o tarjeta". */
    pagoSeguro?: string;
  },
): [GarantiaDoCheckout, string][] {
  const [cancelar, chuva, voucher] = frases;
  const todas: [GarantiaDoCheckout, string | undefined, boolean][] = [
    ['cancelar', cancelar, true],
    ['chuva', chuva, temPasseio],
    ['voucher', voucher, voucherNaHora],
    ['pagamento', pagoSeguro, voucherNaHora],
  ];
  return todas.flatMap(([icone, frase, vale]) => (vale && frase ? [[icone, frase] as [GarantiaDoCheckout, string]] : []));
}
