import { z } from 'zod';
import type { Idioma } from '@/i18n/config';

/**
 * As avaliações reais (tabela avaliacoes), com o texto igual ao original. A origem fica guardada para o painel; o
 * link é opcional, e o dono decidiu mostrar as do Tripadvisor sem link. Nunca invente avaliação, nota ou cliente
 * (PRODUCT.md). Sem dependências de banco: o teste tests/avaliacao.test.ts confere as regras.
 */

export const ORIGENS = ['google', 'tripadvisor', 'instagram', 'whatsapp', 'email', 'site'] as const;
export type Origem = (typeof ORIGENS)[number];

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
  /** O passeio avaliado; sem ele, a avaliação é da agência. */
  produtoSlug?: string;
  /** Só quando a origem tem nota (Google, TripAdvisor): nunca inventada. */
  nota?: number;
  texto: string;
  idioma?: Idioma;
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

/**
 * As que vão para a página: nenhuma enquanto não houver o mínimo publicado; primeiro as do idioma da página,
 * depois as outras, das mais novas para as mais antigas.
 */
export function opinioesDoSite(publicadas: Avaliacao[], idioma: Idioma): Avaliacao[] {
  if (publicadas.length < MINIMO_NO_SITE) return [];
  return [...publicadas]
    .sort((a, b) => Number(b.idioma === idioma) - Number(a.idioma === idioma) || b.data.localeCompare(a.data))
    .slice(0, MAXIMO_NO_SITE);
}
