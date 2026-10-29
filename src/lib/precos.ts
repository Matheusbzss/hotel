import { MARGEM_PERCENTUAL, type Passeio } from '@/data/passeios';
import { LOCALE_INTL, type Idioma } from '@/i18n/config';
import { aplicarMargem, calcular, formatarCentavos, type Orcamento, type TabelaPreco } from './orcamento';

export type { Orcamento, TabelaPreco };

/** Preço de venda em centavos: preço do parceiro + margem. Ex.: 265 → 29150 (R$ 291,50). */
export function precoVendaCentavos(precoParceiro: number, margem: number = MARGEM_PERCENTUAL): number {
  return aplicarMargem(precoParceiro, margem);
}

export function precoAdultoCentavos(p: Passeio): number {
  return precoVendaCentavos(p.precoParceiro);
}

export function precoCriancaCentavos(p: Passeio): number {
  return precoVendaCentavos(p.precoCriancaParceiro ?? p.precoParceiro);
}

export function tabelaPreco(p: Passeio): TabelaPreco {
  return {
    unidade: p.unidade,
    capacidadePorUnidade: p.capacidadePorUnidade,
    precoAdultoCentavos: precoAdultoCentavos(p),
    precoCriancaCentavos: precoCriancaCentavos(p),
  };
}

export function calcularOrcamento(p: Passeio, adultos: number, criancas: number): Orcamento {
  return calcular(tabelaPreco(p), adultos, criancas);
}

/** Custo do parceiro (sem margem) para o mesmo orçamento — controle interno. */
export function custoParceiroCentavos(p: Passeio, adultos: number, criancas: number): number {
  return calcular(
    {
      unidade: p.unidade,
      capacidadePorUnidade: p.capacidadePorUnidade,
      precoAdultoCentavos: Math.round(p.precoParceiro * 100),
      precoCriancaCentavos: Math.round((p.precoCriancaParceiro ?? p.precoParceiro) * 100),
    },
    adultos,
    criancas,
  ).totalCentavos;
}

export function formatarPreco(centavos: number, idioma: Idioma = 'pt'): string {
  return formatarCentavos(centavos, LOCALE_INTL[idioma]);
}
