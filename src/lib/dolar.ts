/**
 * O preço aproximado em dólar das páginas em espanhol e inglês ("≈ US$ 14"), para quem pensa em dólar.
 * A cotação é a PTAX de venda do Banco Central (oficial, grátis e sem cadastro), buscada no máximo uma
 * vez por dia. Se o Banco Central não responder, o site só não mostra o dólar.
 */

const PTAX = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';
/** A página com a cotação é refeita no máximo uma vez por dia. */
export const DOLAR_REVALIDA_SEGUNDOS = 60 * 60 * 24;

const mmddaaaa = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${d.getUTCFullYear()}`;

/** Reais por dólar (ex.: 5.42), ou null sem cotação. */
export async function cotacaoDolar(agora: Date = new Date()): Promise<number | null> {
  // dez dias cobrem fim de semana e feriado: vale a última cotação do período
  const inicio = new Date(agora.getTime() - 10 * 864e5);
  const url =
    `${PTAX}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${mmddaaaa(inicio)}'&@dataFinalCotacao='${mmddaaaa(agora)}'&$format=json&$select=cotacaoVenda`;
  try {
    const res = await fetch(url, { next: { revalidate: DOLAR_REVALIDA_SEGUNDOS }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const dados = (await res.json()) as { value?: { cotacaoVenda?: number }[] };
    const ultima = dados.value?.at(-1)?.cotacaoVenda;
    // uma cotação fora disso é erro de leitura, não o dólar
    return typeof ultima === 'number' && ultima > 1 && ultima < 20 ? ultima : null;
  } catch {
    return null;
  }
}

/** "≈ US$ 14" a partir do preço em centavos de real; vazio sem cotação. */
export function textoDolar(centavos: number, cotacao: number | null, modelo: string, locale: string): string {
  if (!cotacao) return '';
  const dolares = Math.max(1, Math.round(centavos / 100 / cotacao));
  return modelo.replace('{v}', dolares.toLocaleString(locale));
}
