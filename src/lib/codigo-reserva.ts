import { randomBytes, randomInt } from 'node:crypto';

/** Os códigos e as senhas de link das reservas (sem banco aqui: os testes usam este arquivo direto). */

const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Gera um código no formato ON-7K3P9Q (sem 0/O/1/I para não confundir). */
export function gerarCodigo(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return `ON-${s}`;
}

export function gerarToken(): string {
  return randomBytes(18).toString('base64url');
}

/** Aceita também o prefixo VH- das reservas feitas antes da troca de marca. */
export function codigoValido(codigo: string): boolean {
  return /^(ON|VH)-[2-9A-HJ-NP-Z]{6}$/.test(codigo);
}
