export const IDIOMAS = ['pt', 'en', 'es'] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_PADRAO: Idioma = 'pt';

export function isIdioma(valor: string): valor is Idioma {
  return (IDIOMAS as readonly string[]).includes(valor);
}

/** Formatação de números e datas por idioma. */
export const LOCALE_INTL: Record<Idioma, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-AR' };
export const HREFLANG: Record<Idioma, string> = { pt: 'pt-BR', en: 'en', es: 'es' };
export const OG_LOCALE: Record<Idioma, string> = { pt: 'pt_BR', en: 'en_US', es: 'es_AR' };

/** Monta o caminho público de uma página no idioma: português fica sem prefixo. */
export function rota(idioma: Idioma, caminho: string): string {
  const limpo = caminho.startsWith('/') ? caminho : `/${caminho}`;
  if (idioma === IDIOMA_PADRAO) return limpo;
  return limpo === '/' ? `/${idioma}` : `/${idioma}${limpo}`;
}

/** Remove o prefixo de idioma de um caminho público. */
export function semIdioma(caminho: string): string {
  const m = caminho.match(/^\/(en|es|pt)(\/.*)?$/);
  return m ? m[2] || '/' : caminho;
}

/** Substitui {chaves} em textos traduzidos. */
export function fmt(texto: string, vars: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
