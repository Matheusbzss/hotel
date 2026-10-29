import type { Idioma } from './config';
import pt, { type Dicionario } from './pt';
import en from './en';
import es from './es';

const DICIONARIOS: Record<Idioma, Dicionario> = { pt, en, es };

export function dicionario(idioma: Idioma): Dicionario {
  return DICIONARIOS[idioma];
}

export type { Dicionario };
