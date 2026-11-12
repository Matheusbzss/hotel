import { z } from 'zod';
import type { IdiomaConteudo } from '@/i18n/conteudo';

/**
 * As avaliações reais (tabela avaliacoes), com o texto igual ao original. A origem fica guardada para o painel; o
 * link é opcional, e o dono decidiu mostrar as do Tripadvisor sem link. Nunca invente avaliação, nota ou cliente
 * (PRODUCT.md). As regras são puras (o teste tests/avaliacao.test.ts confere); a leitura do banco fica em
 * ./avaliacoes e entra aqui só pelo cache de avaliacoesDoSite, com os imports adiados, porque este arquivo
 * também roda nos testes (node puro, que não abre next/cache nem 'server-only').
 */

export const ORIGENS = ['google', 'tripadvisor', 'instagram', 'whatsapp', 'email', 'site'] as const;
export type Origem = (typeof ORIGENS)[number];

/** Sobre o quê a avaliação fala: da agência (entra na nota) ou da cidade (Rua das Pedras, Orla Bardot...). */
export const SOBRES = ['agencia', 'destino'] as const;
export type Sobre = (typeof SOBRES)[number];

/** A seção do site só aparece com pelo menos tantas publicadas, e mostra no máximo estas. */
export const MINIMO_NO_SITE = 3;
export const MAXIMO_NO_SITE = 6;

export interface Avaliacao {
  id: string;
  /** Como a pessoa assina: o primeiro nome, às vezes com a inicial. */
  nome: string;
  /** Só o que a pessoa informou: nunca deduzir pelo idioma. */
  pais?: string;
  cidade?: string;
  /** A foto de perfil, em public/avaliacoes/. */
  foto?: string;
  titulo?: string;
  /** O passeio que a avaliação cita: no cartão do passeio, essas vêm primeiro. */
  produtoSlug?: string;
  /** Sem o campo, 'agencia' (o padrão do banco). A avaliação da cidade ('destino') nunca entra na nota da agência. */
  sobre?: Sobre;
  /** O ponto da cidade comentado ("Rua das Pedras", "Orla Bardot"), quando sobre = 'destino'. */
  lugar?: string;
  /** Só quando a origem tem nota (Google, TripAdvisor): nunca inventada. */
  nota?: number;
  texto: string;
  /** O idioma do texto original: só pt, es ou en (uma avaliação em espanhol vale para o /es e o /es-ar). */
  idioma?: IdiomaConteudo;
  origem: Origem;
  origemUrl?: string;
  /** AAAA-MM-DD. Quando a origem só dá o mês, o dia 1: o site mostra só o mês e o ano. */
  data: string;
  publicada: boolean;
}

export const EsquemaAvaliacao = z.object({
  nome: z.string().trim().min(2).max(60),
  pais: z.string().trim().max(60).optional().default(''),
  cidade: z.string().trim().max(60).optional().default(''),
  titulo: z.string().trim().max(120).optional().default(''),
  produtoSlug: z.string().max(80).optional().default(''),
  nota: z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(1).max(5).optional()),
  texto: z.string().trim().min(3).max(1500),
  idioma: z.enum(['pt', 'es', 'en']),
  origem: z.enum(ORIGENS),
  /** Opcional, mas se vier precisa ser um link de verdade. */
  origemUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^(https?:\/\/\S+)?$/)
    .optional()
    .default(''),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** 'es-ar' conta como 'es': compara só a parte antes do traço. */
const idiomaBase = (idioma?: string) => idioma?.split('-')[0];

/** Avaliação da agência: sem o campo, 'agencia' (o padrão do banco). */
const daAgencia = (a: Avaliacao) => (a.sobre ?? 'agencia') === 'agencia';

/**
 * As que vão para a página: nenhuma enquanto não houver o mínimo publicado; primeiro as do idioma da página
 * ('es-ar' conta como 'es'), depois as outras, das mais novas para as mais antigas.
 */
export function opinioesDoSite(publicadas: Avaliacao[], idioma: string): Avaliacao[] {
  if (publicadas.length < MINIMO_NO_SITE) return [];
  const base = idiomaBase(idioma);
  return [...publicadas]
    .sort((a, b) => Number(idiomaBase(b.idioma) === base) - Number(idiomaBase(a.idioma) === base) || b.data.localeCompare(a.data))
    .slice(0, MAXIMO_NO_SITE);
}

/**
 * A nota do cartão "Opiniões sobre a Orla Nativa": a média só das avaliações da agência com nota (a da cidade
 * fica fora), arredondada PARA BAIXO com 1 casa (4,96 → 4,9, nunca 5,0), e a contagem das que entraram.
 * Com total 0 não há o que mostrar.
 */
export function notaDaAgencia(avaliacoes: Avaliacao[]): { media: number; total: number } {
  const notas = avaliacoes.flatMap((a) => (daAgencia(a) && a.nota ? [a.nota] : []));
  if (!notas.length) return { media: 0, total: 0 };
  const soma = notas.reduce((s, n) => s + n, 0);
  return { media: Math.floor((soma * 10) / notas.length) / 10, total: notas.length };
}

/**
 * As opiniões do cartão do passeio: só as da agência, com as que citam o passeio (produtoSlug) primeiro,
 * depois as do idioma da página ('es-ar' conta como 'es'), das mais novas para as mais antigas.
 * Nota menor nunca some: a ordem não olha a nota.
 */
export function ordenarParaPasseio(avaliacoes: Avaliacao[], slug: string, idioma: string): Avaliacao[] {
  const base = idiomaBase(idioma);
  return avaliacoes
    .filter(daAgencia)
    .sort(
      (a, b) =>
        Number(b.produtoSlug === slug) - Number(a.produtoSlug === slug) ||
        Number(idiomaBase(b.idioma) === base) - Number(idiomaBase(a.idioma) === base) ||
        b.data.localeCompare(a.data),
    );
}

/** A primeira frase do texto (até o primeiro ponto, exclamação, interrogação ou reticências); o texto inteiro sem pontuação. */
export function primeiraFrase(texto: string): string {
  const limpo = texto.trim();
  return limpo.match(/^[\s\S]*?[.!?…]+(?=\s|$)/)?.[0] ?? limpo;
}

/** O trecho curto do cartão: a primeira frase, cortada com reticências quando passa do limite. Só corta, nunca reescreve. */
export function trechoDaAvaliacao(texto: string, limite = 140): string {
  const frase = primeiraFrase(texto);
  if (frase.length <= limite) return frase;
  const corte = frase.slice(0, limite);
  const espaco = corte.lastIndexOf(' ');
  return `${(espaco > 0 ? corte.slice(0, espaco) : corte).trimEnd()}…`;
}

/**
 * As avaliações que viram trecho no cartão do passeio (decisão do dono em 08/11/2026): na ordem de
 * ordenarParaPasseio, mas primeiro as que têm a primeira frase inteira dentro do limite — frase cortada com
 * reticências só entra quando não há inteiras suficientes. Nunca reescreve nada.
 */
export function trechosDoCartao(avaliacoes: Avaliacao[], slug: string, idioma: string, quantos = 2, limite = 140): Avaliacao[] {
  const ordenadas = ordenarParaPasseio(avaliacoes, slug, idioma);
  const inteiras = ordenadas.filter((a) => primeiraFrase(a.texto).length <= limite);
  const cortadas = ordenadas.filter((a) => primeiraFrase(a.texto).length > limite);
  return [...inteiras, ...cortadas].slice(0, quantos);
}

/* ------------------------------------------------------------------ */
/* A leitura pelo cache (o jeito de src/lib/casas.ts)                  */

/** A etiqueta do cache: a rota do painel chama revalidateTag(TAG_AVALIACOES, 'max') ao publicar ou esconder. */
export const TAG_AVALIACOES = 'avaliacoes';

// os imports são adiados porque ./avaliacoes é só do servidor ('server-only') e o next/cache não abre no
// node puro dos testes; no servidor, o embrulho é criado uma vez e fica
let publicadasNoCache: (() => Promise<Avaliacao[]>) | undefined;

/** Para as páginas: as publicadas, pelo cache; quando o dono publica no painel, o site muda sem novo deploy. */
export async function avaliacoesDoSite(): Promise<Avaliacao[]> {
  if (!publicadasNoCache) {
    const { unstable_cache } = await import('next/cache');
    const { avaliacoesPublicadas } = await import('./avaliacoes');
    publicadasNoCache = unstable_cache(avaliacoesPublicadas, ['avaliacoes-publicadas'], { tags: [TAG_AVALIACOES] });
  }
  return publicadasNoCache();
}
