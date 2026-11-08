/**
 * Preço sempre com os centavos: "R$ 197,00", "R$ 291,50" (decisão do dono em 07/11/2026, nunca "R$ 197").
 * narrowSymbol deixa "R$" em todos os idiomas (sem ele, o espanhol da Argentina escreveria "BRL").
 * Serve no servidor e no navegador.
 */
export function formatarCifra(centavos: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centavos / 100);
}
