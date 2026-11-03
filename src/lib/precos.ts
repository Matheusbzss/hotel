import { CRIANCAS_PADRAO, type OpcaoPasseio, type Passeio, type PoliticaCriancas } from '@/data/passeios';
import { LOCALE_INTL, type Idioma } from '@/i18n/config';
import { calcular, formatarCentavos, precoComAjuste, type Orcamento, type Pessoas, type TabelaPreco } from './orcamento';

export type { Orcamento, Pessoas, TabelaPreco };

/** Preço de venda em centavos, com o ajuste geral de src/config/precos.ts. Ex.: 291.5 → 29150 (R$ 291,50). */
export function precoVendaCentavos(preco: number): number {
  return precoComAjuste(preco);
}

/** As opções do passeio; quem não tem opções ganha uma só, com o preço do próprio passeio. */
export function opcoesPasseio(p: Passeio): OpcaoPasseio[] {
  if (p.opcoes?.length) return p.opcoes;
  return [{ id: 'padrao', nome: p.duracao, preco: p.preco }];
}

export const temOpcoes = (p: Passeio) => (p.opcoes?.length ?? 0) > 1;

/** Opção escolhida; sem id, a primeira. Id que não existe → undefined. */
export function obterOpcao(p: Passeio, id?: string | null): OpcaoPasseio | undefined {
  const opcoes = opcoesPasseio(p);
  if (!id) return opcoes[0];
  return opcoes.find((o) => o.id === id);
}

export const regraCriancas = (p: Passeio): PoliticaCriancas => p.criancas ?? CRIANCAS_PADRAO;

/** Menor preço de venda do passeio (o "a partir de"). */
export function precoAPartirCentavos(p: Passeio): number {
  return Math.min(...opcoesPasseio(p).map((o) => precoVendaCentavos(o.preco)));
}

export function tabelaPreco(p: Passeio, opcao: OpcaoPasseio = opcoesPasseio(p)[0]): TabelaPreco {
  return {
    unidade: p.unidade,
    capacidadePorUnidade: p.capacidadePorUnidade,
    precoCentavos: precoVendaCentavos(opcao.preco),
    criancas: regraCriancas(p),
  };
}

export function calcularOrcamento(p: Passeio, opcao: OpcaoPasseio, pessoas: Partial<Pessoas>): Orcamento {
  return calcular(tabelaPreco(p, opcao), pessoas);
}

export function formatarPreco(centavos: number, idioma: Idioma = 'pt'): string {
  return formatarCentavos(centavos, LOCALE_INTL[idioma]);
}
