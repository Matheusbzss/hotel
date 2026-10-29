/** Cálculo do total de uma reserva (sem dependências: roda no navegador e no servidor). */

/** Preço do parceiro (em reais) + margem (%) → preço de venda em centavos. Ex.: 265 com 10% → 29150. */
export function aplicarMargem(precoParceiro: number, margem: number): number {
  return Math.round((Math.round(precoParceiro * 100) * (100 + margem)) / 100);
}

export interface RegraCriancas {
  /** Idade até a qual a criança não paga. `null` = todos pagam. */
  gratisAte: number | null;
  /** Idade até a qual a criança paga meia. */
  meiaAte?: number;
}

export interface TabelaPreco {
  unidade: 'pessoa' | 'veiculo' | 'embarcacao';
  capacidadePorUnidade?: number;
  /** Preço inteiro em centavos: por pessoa ou por veículo/embarcação. */
  precoCentavos: number;
  criancas: RegraCriancas;
}

export interface Pessoas {
  /** Adultos e crianças que pagam inteira. */
  adultos: number;
  /** Crianças que pagam meia. */
  criancasMeia: number;
  /** Crianças que não pagam. */
  criancasGratis: number;
}

export type TipoLinha = 'adulto' | 'meia' | 'gratis' | 'unidade';

export interface LinhaOrcamento {
  tipo: TipoLinha;
  quantidade: number;
  unitarioCentavos: number;
  subtotalCentavos: number;
}

export interface Orcamento {
  pessoas: number;
  /** Veículos/embarcações necessários (igual ao nº de pessoas quando a unidade é 'pessoa'). */
  unidades: number;
  totalCentavos: number;
  linhas: LinhaOrcamento[];
}

export interface FaixasIdade {
  /** Idades que não pagam: [de, até]. */
  gratis?: [number, number];
  /** Idades que pagam meia: [de, até]. */
  meia?: [number, number];
  /** Idade a partir da qual se paga inteira (0 = todas as idades). */
  inteiraDesde: number;
}

export function faixasIdade(regra: RegraCriancas): FaixasIdade {
  const gratis = regra.gratisAte !== null && regra.gratisAte >= 0 ? ([0, regra.gratisAte] as [number, number]) : undefined;
  const inicioMeia = gratis ? gratis[1] + 1 : 0;
  const meia = regra.meiaAte !== undefined && regra.meiaAte >= inicioMeia ? ([inicioMeia, regra.meiaAte] as [number, number]) : undefined;
  return { gratis, meia, inteiraDesde: meia ? meia[1] + 1 : inicioMeia };
}

const inteiro = (n: unknown) => Math.max(0, Math.floor(Number(n)) || 0);

/**
 * Ajusta as quantidades à regra do passeio: quem não tem faixa própria paga inteira.
 * Ex.: passeio sem meia → as crianças "meia" passam a pagar inteira. Nunca cobra a menos.
 */
export function normalizarPessoas(t: TabelaPreco, p: Partial<Pessoas>): Pessoas {
  const f = faixasIdade(t.criancas);
  let adultos = inteiro(p.adultos);
  let criancasMeia = inteiro(p.criancasMeia);
  let criancasGratis = inteiro(p.criancasGratis);
  if (!f.meia) {
    adultos += criancasMeia;
    criancasMeia = 0;
  }
  if (!f.gratis) {
    adultos += criancasGratis;
    criancasGratis = 0;
  }
  return { adultos, criancasMeia, criancasGratis };
}

export const precoMeiaCentavos = (precoCentavos: number) => Math.round(precoCentavos / 2);

export function calcular(t: TabelaPreco, entrada: Partial<Pessoas>): Orcamento {
  const { adultos, criancasMeia, criancasGratis } = normalizarPessoas(t, entrada);
  const pessoas = adultos + criancasMeia + criancasGratis;

  if (t.unidade === 'pessoa') {
    const meia = precoMeiaCentavos(t.precoCentavos);
    const linhas: LinhaOrcamento[] = [];
    if (adultos)
      linhas.push({ tipo: 'adulto', quantidade: adultos, unitarioCentavos: t.precoCentavos, subtotalCentavos: adultos * t.precoCentavos });
    if (criancasMeia)
      linhas.push({ tipo: 'meia', quantidade: criancasMeia, unitarioCentavos: meia, subtotalCentavos: criancasMeia * meia });
    if (criancasGratis) linhas.push({ tipo: 'gratis', quantidade: criancasGratis, unitarioCentavos: 0, subtotalCentavos: 0 });
    return { pessoas, unidades: pessoas, totalCentavos: linhas.reduce((s, l) => s + l.subtotalCentavos, 0), linhas };
  }

  // por veículo/embarcação: todos ocupam lugar, inclusive as crianças
  const cap = Math.max(1, t.capacidadePorUnidade ?? 1);
  const unidades = pessoas === 0 ? 0 : Math.ceil(pessoas / cap);
  return {
    pessoas,
    unidades,
    totalCentavos: unidades * t.precoCentavos,
    linhas: unidades
      ? [{ tipo: 'unidade', quantidade: unidades, unitarioCentavos: t.precoCentavos, subtotalCentavos: unidades * t.precoCentavos }]
      : [],
  };
}

export function formatarCentavos(centavos: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(centavos / 100);
}
