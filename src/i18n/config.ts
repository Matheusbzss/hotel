import { caminhoInterno, caminhoPublico } from './enderecos.ts';

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

/**
 * Monta o caminho público de uma página no idioma: português fica sem prefixo; espanhol e inglês têm o prefixo
 * e o endereço traduzido (src/i18n/enderecos.ts). Recebe sempre o caminho em português: `/passeios/escuna-buzios`.
 */
export function rota(idioma: Idioma, caminho: string): string {
  const limpo = caminho.startsWith('/') ? caminho : `/${caminho}`;
  if (idioma === 'pt') return limpo;
  const [, trilha, depois] = limpo.match(/^([^?#]*)(.*)$/s) as RegExpMatchArray;
  const publico = caminhoPublico(idioma, trilha);
  return `/${idioma}${publico === '/' ? '' : publico}${depois}`;
}

/** O caminho em português de um endereço público, em qualquer idioma: `/es/paseos` → `/passeios`. */
export function semIdioma(caminho: string): string {
  const m = caminho.match(/^\/(en|es|pt)(\/.*)?$/);
  if (!m) return caminho;
  return m[1] === 'pt' ? m[2] || '/' : caminhoInterno(m[1] as Exclude<Idioma, 'pt'>, m[2] || '/');
}

/** Substitui {chaves} em textos traduzidos. */
export function fmt(texto: string, vars: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
