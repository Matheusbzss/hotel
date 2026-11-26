/**
 * O preço aproximado em dólar das páginas em espanhol e inglês ("≈ US$ 35,81"), para quem pensa em dólar.
 * A cotação é a PTAX de venda do Banco Central, que o agendamento /api/cambio/atualizar busca em dia útil
 * e guarda no banco (tabela cambio_dolar). O site lê só o valor guardado: a mesma rota, chamada sem o
 * segredo do agendamento, devolve a cotação guardada (dado público), e a resposta fica um dia no cache
 * com a etiqueta 'cambio', refeita na hora quando o agendamento grava cotação nova.
 *
 * Este arquivo também roda no navegador (os widgets usam textoDolar) e nos testes (node puro), por isso
 * ele não importa nada: nem src/lib/banco.ts (a chave secreta só pode ser lida lá, ver tests/banco.test.ts),
 * nem next/cache, nem módulos com o atalho "@/".
 */

/** A cotação guardada vale um dia no cache; o agendamento refaz na hora com revalidateTag('cambio', 'max'). */
export const DOLAR_REVALIDA_SEGUNDOS = 60 * 60 * 24;
/** Cotação com data de mais de 7 dias não vale: melhor sem dólar do que com dólar velho. */
export const DOLAR_VALIDADE_DIAS = 7;
/** A etiqueta do cache da cotação. */
export const TAG_CAMBIO = 'cambio';

export interface CotacaoDolar {
  /** Reais por dólar (ex.: 5.5013). */
  taxa: number;
  /** A data da cotação no Banco Central (AAAA-MM-DD). */
  data: string;
}

/** Uma taxa fora da faixa de 1 a 20 reais por dólar é erro de leitura, não o dólar. */
export function taxaDolarValida(taxa: unknown): taxa is number {
  return typeof taxa === 'number' && Number.isFinite(taxa) && taxa > 1 && taxa < 20;
}

/** Dias corridos desde a data da cotação (AAAA-MM-DD); NaN quando a data não presta. */
export function idadeDaCotacaoDias(data: string, agora: Date = new Date()): number {
  return Math.floor((agora.getTime() - Date.parse(`${data}T00:00:00Z`)) / 864e5);
}

/** A regra dos 7 dias: vencida (ou com data que não presta), a cotação não aparece. */
export function cotacaoVencida(data: string, agora: Date = new Date()): boolean {
  return !(idadeDaCotacaoDias(data, agora) <= DOLAR_VALIDADE_DIAS);
}

/** O endereço do próprio site, como em src/lib/site.ts (sem importar: ver o comentário lá em cima). */
function urlPropria(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/** A cotação guardada com a data dela (para a nota "cotação de X" nas telas), ou null sem cotação que valha. */
export async function cotacaoDolarComData(agora: Date = new Date()): Promise<CotacaoDolar | null> {
  try {
    const resposta = await fetch(`${urlPropria()}/api/cambio/atualizar`, {
      next: { revalidate: DOLAR_REVALIDA_SEGUNDOS, tags: [TAG_CAMBIO] },
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { taxa?: number; data?: string };
    // a idade é conferida fora do cache: a cotação parada some sozinha quando vence
    if (!dados.data || !taxaDolarValida(dados.taxa) || cotacaoVencida(dados.data, agora)) return null;
    return { taxa: dados.taxa, data: dados.data };
  } catch {
    return null;
  }
}

/** Reais por dólar (ex.: 5.5013), ou null sem cotação. */
export async function cotacaoDolar(agora: Date = new Date()): Promise<number | null> {
  return (await cotacaoDolarComData(agora))?.taxa ?? null;
}

/** "≈ US$ 35,81" a partir do preço em centavos de real, sempre com os centavos; vazio sem cotação. */
export function textoDolar(centavos: number, cotacao: number | null, modelo: string, locale: string): string {
  if (!cotacao) return '';
  const centavosDolar = Math.round(centavos / cotacao);
  return modelo.replace('{v}', (centavosDolar / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
}
