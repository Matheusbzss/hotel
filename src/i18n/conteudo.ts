import type { Idioma } from './config';

/**
 * Os idiomas em que o CONTEÚDO é escrito (passeios, transfer, casas, textos alternativos das fotos, avaliações).
 * O espanhol da Argentina ('es-ar') não é um idioma de conteúdo: ele lê o espanhol ('es') e só troca a frase
 * quando o dado traz uma versão própria em `'es-ar'`.
 */
export type IdiomaConteudo = 'pt' | 'en' | 'es';

/** Um dado nos três idiomas de conteúdo, com a versão argentina só onde a frase muda. */
export type Traduzido<T> = { pt: T; en: T; es: T; 'es-ar'?: T };

/** O idioma de conteúdo que serve a página: 'es-ar' lê o 'es'. */
export function idiomaDeConteudo(idioma: Idioma): IdiomaConteudo {
  return idioma === 'es-ar' ? 'es' : idioma;
}

/**
 * O texto (ou lista, ou qualquer valor) de um dado traduzido, no idioma da página. É o que TODO leitor de dado
 * com três idiomas usa no lugar de `dado[idioma]`: em 'es-ar' devolve a versão argentina se ela existir, senão o 'es'.
 */
export function texto<T>(t: Traduzido<T>, idioma: Idioma): T {
  if (idioma === 'es-ar' && t['es-ar'] !== undefined) return t['es-ar'];
  return t[idiomaDeConteudo(idioma)];
}

/** O mesmo para um dado opcional ou incompleto (ex.: o título de busca que só alguns passeios têm). */
export function textoOpcional<T>(t: Partial<Traduzido<T>> | undefined, idioma: Idioma): T | undefined {
  if (!t) return undefined;
  if (idioma === 'es-ar' && t['es-ar'] !== undefined) return t['es-ar'];
  return t[idiomaDeConteudo(idioma)];
}
