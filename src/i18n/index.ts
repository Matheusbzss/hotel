import type { Idioma } from './config.ts';
import pt, { type Dicionario } from './pt.ts';
import en from './en.ts';
import es from './es.ts';
import { ajustesAR, type DeepPartial } from './es-ar.ts';

/**
 * Mescla profunda: objetos aninhados se mesclam chave a chave; listas (arrays) e textos substituem inteiros.
 * Nunca muda os dois objetos de entrada. É feita UMA vez, na carga do módulo.
 */
export function mesclar<T>(base: T, ajustes: NoInfer<DeepPartial<T>> | undefined): T {
  if (ajustes === undefined) return base;
  if (!ehObjeto(base) || !ehObjeto(ajustes)) return ajustes as T;
  const saida: Record<string, unknown> = { ...base };
  for (const [chave, valor] of Object.entries(ajustes)) {
    if (valor === undefined) continue;
    const atual = base[chave];
    saida[chave] = ehObjeto(atual) && ehObjeto(valor) ? mesclar<Record<string, unknown>>(atual, valor) : valor;
  }
  return saida as T;
}

/** Um objeto comum: não é lista, nem texto, nem null. */
function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const DICIONARIOS: Record<Idioma, Dicionario> = { pt, en, es, 'es-ar': mesclar(es, ajustesAR) };

/** O dicionário completo do idioma: o 'es-ar' é o 'es' com as frases de src/i18n/es-ar.ts por cima. */
export function dicionario(idioma: Idioma): Dicionario {
  return DICIONARIOS[idioma];
}

export type { Dicionario };
