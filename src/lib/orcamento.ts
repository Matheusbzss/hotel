/** Cálculo do total de uma reserva (sem dependências: roda no navegador e no servidor). */

/** Preço do parceiro (em reais) + margem (%) → preço de venda em centavos. Ex.: 265 com 10% → 29150. */
export function aplicarMargem(precoParceiro: number, margem: number): number {
  return Math.round((Math.round(precoParceiro * 100) * (100 + margem)) / 100);
}

export interface TabelaPreco {
  unidade: 'pessoa' | 'veiculo' | 'embarcacao';
  capacidadePorUnidade?: number;
  precoAdultoCentavos: number;
  precoCriancaCentavos: number;
}

export interface Orcamento {
  pessoas: number;
  /** Veículos/embarcações necessários (igual ao nº de pessoas quando a unidade é 'pessoa'). */
  unidades: number;
  totalCentavos: number;
  linhas: { tipo: 'adulto' | 'crianca' | 'unidade'; quantidade: number; unitarioCentavos: number; subtotalCentavos: number }[];
}

export function calcular(t: TabelaPreco, adultos: number, criancas: number): Orcamento {
  const a = Math.max(0, Math.floor(adultos) || 0);
  const c = Math.max(0, Math.floor(criancas) || 0);
  const pessoas = a + c;
  if (t.unidade === 'pessoa') {
    const linhas: Orcamento['linhas'] = [];
    if (a)
      linhas.push({ tipo: 'adulto', quantidade: a, unitarioCentavos: t.precoAdultoCentavos, subtotalCentavos: a * t.precoAdultoCentavos });
    if (c)
      linhas.push({
        tipo: 'crianca',
        quantidade: c,
        unitarioCentavos: t.precoCriancaCentavos,
        subtotalCentavos: c * t.precoCriancaCentavos,
      });
    return { pessoas, unidades: pessoas, totalCentavos: a * t.precoAdultoCentavos + c * t.precoCriancaCentavos, linhas };
  }
  const cap = Math.max(1, t.capacidadePorUnidade ?? 1);
  const unidades = pessoas === 0 ? 0 : Math.ceil(pessoas / cap);
  return {
    pessoas,
    unidades,
    totalCentavos: unidades * t.precoAdultoCentavos,
    linhas: unidades
      ? [
          {
            tipo: 'unidade',
            quantidade: unidades,
            unitarioCentavos: t.precoAdultoCentavos,
            subtotalCentavos: unidades * t.precoAdultoCentavos,
          },
        ]
      : [],
  };
}

export function formatarCentavos(centavos: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(centavos / 100);
}
