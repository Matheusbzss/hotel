import type { Metadata } from 'next';
import { EMPRESA } from '@/config/empresa';
import { IDIOMAS, IDIOMAS_GUIAS, HREFLANG, OG_LOCALE, rota, type Idioma, type IdiomaGuia } from '@/i18n/config';

type OpenGraph = NonNullable<Metadata['openGraph']>;

/**
 * O bloco Open Graph de uma página, com o que vale para o site inteiro já dentro: og:site_name, og:locale
 * (pt_BR, en_US, es_LA ou es_AR) e og:type 'website'. Toda página que define o próprio openGraph monta o bloco
 * por aqui, porque o Next SUBSTITUI o openGraph do layout pelo da página (campos aninhados não se mesclam) e,
 * sem isto, o nome do site e o idioma somem das prévias no WhatsApp e no Facebook.
 */
export function openGraphDaPagina(idioma: Idioma, pagina: OpenGraph): OpenGraph {
  return { siteName: EMPRESA.marca, locale: OG_LOCALE[idioma], type: 'website', ...pagina } as OpenGraph;
}

/** URL pública do site (domínio próprio em produção, URL da Vercel nas prévias). */
export function urlDoSite(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/**
 * canonical + hreflang de uma página em todos os idiomas (IDIOMAS): o /es-ar sai com hreflang es-AR e canonical
 * próprio, separado do /es; o x-default continua o português.
 */
export function alternates(idioma: Idioma, caminho: string) {
  const languages: Record<string, string> = {};
  for (const i of IDIOMAS) languages[HREFLANG[i]] = rota(i, caminho);
  languages['x-default'] = rota('pt', caminho);
  return { canonical: rota(idioma, caminho), languages };
}

/** canonical próprio e o par de hreflang (es e es-AR) de um guia: os guias não têm versão em português nem em inglês. */
export function alternatesGuia(idioma: IdiomaGuia, caminho: string) {
  return {
    canonical: rota(idioma, caminho),
    languages: Object.fromEntries(IDIOMAS_GUIAS.map((i) => [HREFLANG[i], rota(i, caminho)])),
  };
}
