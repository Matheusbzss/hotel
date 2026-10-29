import { CRIANCAS_PADRAO, MARGEM_PERCENTUAL, type OpcaoPasseio, type Passeio, type PoliticaCriancas } from '@/data/passeios';
import { LOCALE_INTL, type Idioma } from '@/i18n/config';
import { aplicarMargem, calcular, formatarCentavos, type Orcamento, type Pessoas, type TabelaPreco } from './orcamento';

export type { Orcamento, Pessoas, TabelaPreco };

/** Preço de venda em centavos: preço do parceiro + margem. Ex.: 265 → 29150 (R$ 291,50). */
export function precoVendaCentavos(precoParceiro: number, margem: number = MARGEM_PERCENTUAL): number {
  return aplicarMargem(precoParceiro, margem);
}

/** As opções do passeio; quem não tem opções ganha uma só, com o preço do próprio passeio. */
export function opcoesPasseio(p: Passeio): OpcaoPasseio[] {
  if (p.opcoes?.length) return p.opcoes;
  return [{ id: 'padrao', nome: p.duracao, precoParceiro: p.precoParceiro }];
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
  return Math.min(...opcoesPasseio(p).map((o) => precoVendaCentavos(o.precoParceiro)));
}

function tabela(p: Passeio, precoParceiro: number, comMargem: boolean): TabelaPreco {
  return {
    unidade: p.unidade,
    capacidadePorUnidade: p.capacidadePorUnidade,
    precoCentavos: comMargem ? precoVendaCentavos(precoParceiro) : Math.round(precoParceiro * 100),
    criancas: regraCriancas(p),
  };
}

export function tabelaPreco(p: Passeio, opcao: OpcaoPasseio = opcoesPasseio(p)[0]): TabelaPreco {
  return tabela(p, opcao.precoParceiro, true);
}

export function calcularOrcamento(p: Passeio, opcao: OpcaoPasseio, pessoas: Partial<Pessoas>): Orcamento {
  return calcular(tabelaPreco(p, opcao), pessoas);
}

/** Custo do parceiro (sem margem) para o mesmo orçamento — controle interno. */
export function custoParceiroCentavos(p: Passeio, opcao: OpcaoPasseio, pessoas: Partial<Pessoas>): number {
  return calcular(tabela(p, opcao.precoParceiro, false), pessoas).totalCentavos;
}

export function formatarPreco(centavos: number, idioma: Idioma = 'pt'): string {
  return formatarCentavos(centavos, LOCALE_INTL[idioma]);
}
