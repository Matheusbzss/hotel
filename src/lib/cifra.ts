/** "R$ 154" quando não há centavos, "R$ 291,50" quando há. Serve no servidor e no navegador. */
export function formatarCifra(centavos: number, locale: string): string {
  const inteiro = centavos % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: inteiro ? 0 : 2,
    maximumFractionDigits: inteiro ? 0 : 2,
  }).format(centavos / 100);
}
