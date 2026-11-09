import { caminhoInterno, caminhoPublico } from './enderecos.ts';

/**
 * Os idiomas do site. 'es' é o espanhol neutro (com "tú"), para chilenos e os demais; 'es-ar' é o espanhol
 * da Argentina (com "vos"), com os MESMOS endereços do 'es', só com o prefixo /es-ar. Os dados com três idiomas
 * (passeios, transfer, casas) valem para os dois: src/i18n/conteudo.ts escolhe a versão.
 */
export const IDIOMAS = ['pt', 'en', 'es', 'es-ar'] as const;
export type Idioma = (typeof IDIOMAS)[number];
export const IDIOMA_PADRAO: Idioma = 'pt';

export function isIdioma(valor: string): valor is Idioma {
  return (IDIOMAS as readonly string[]).includes(valor);
}

/** Os guias de viagem (src/data/guias.ts) só existem nas duas versões do espanhol, cada uma no seu endereço. */
export const IDIOMAS_GUIAS = ['es', 'es-ar'] as const satisfies readonly Idioma[];
export type IdiomaGuia = (typeof IDIOMAS_GUIAS)[number];

export function isIdiomaGuia(valor: string): valor is IdiomaGuia {
  return (IDIOMAS_GUIAS as readonly string[]).includes(valor);
}

/**
 * Os prefixos de idioma como aparecem no endereço, do mais comprido para o mais curto, para o /es-ar casar
 * antes do /es (senão /es-ar/paseos viraria es + /-ar/paseos). Pronto para entrar numa expressão regular.
 */
export const PREFIXOS_IDIOMA = [...IDIOMAS].sort((a, b) => b.length - a.length).join('|');
const PREFIXO = new RegExp(`^\\/(${PREFIXOS_IDIOMA})(\\/.*)?$`);

/** Formatação de números e datas por idioma. As duas versões do espanhol escrevem como a Argentina (R$ 1.197,00). */
export const LOCALE_INTL: Record<Idioma, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-AR', 'es-ar': 'es-AR' };
export const HREFLANG: Record<Idioma, string> = { pt: 'pt-BR', en: 'en', es: 'es', 'es-ar': 'es-AR' };
export const OG_LOCALE: Record<Idioma, string> = { pt: 'pt_BR', en: 'en_US', es: 'es_LA', 'es-ar': 'es_AR' };

/**
 * Monta o caminho público de uma página no idioma: português fica sem prefixo; os outros têm o prefixo
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
  const m = caminho.match(PREFIXO);
  if (!m) return caminho;
  return m[1] === 'pt' ? m[2] || '/' : caminhoInterno(m[1] as Exclude<Idioma, 'pt'>, m[2] || '/');
}

/** Substitui {chaves} em textos traduzidos. */
export function fmt(texto: string, vars: Record<string, string | number>): string {
  return texto.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}
