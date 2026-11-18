/** Texto das pessoas de uma reserva: "2 adultos + 1 criança (meia)". Sem dependências: roda no navegador. */

export interface QuantidadesReserva {
  adultos: number;
  /** Total de crianças com desconto (reservas antigas só têm este campo). */
  criancas?: number;
  criancasMeia?: number;
  criancasGratis?: number;
}

export interface RotulosPessoas {
  pessoa: string;
  pessoas: string;
  adulto: string;
  adultos: string;
  crianca: string;
  criancas: string;
  criancaMeia: string;
  criancasMeia: string;
  criancaGratis: string;
  criancasGratis: string;
}

const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * @param semFaixas passeio sem preço de criança (todos pagam igual): diz "pessoas" em vez de "adultos".
 */
export function textoPessoas(q: QuantidadesReserva, r: RotulosPessoas, semFaixas = false): string {
  const detalhado = q.criancasMeia !== undefined || q.criancasGratis !== undefined;
  const meia = detalhado ? (q.criancasMeia ?? 0) : 0;
  const gratis = detalhado ? (q.criancasGratis ?? 0) : 0;
  const criancas = detalhado ? 0 : (q.criancas ?? 0);
  const partes: string[] = [];
  if (q.adultos)
    partes.push(semFaixas && !meia && !gratis && !criancas ? qtd(q.adultos, r.pessoa, r.pessoas) : qtd(q.adultos, r.adulto, r.adultos));
  if (meia) partes.push(qtd(meia, r.criancaMeia, r.criancasMeia));
  if (gratis) partes.push(qtd(gratis, r.criancaGratis, r.criancasGratis));
  if (criancas) partes.push(qtd(criancas, r.crianca, r.criancas));
  return partes.join(' + ');
}
