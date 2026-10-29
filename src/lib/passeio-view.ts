import { CATEGORIAS, CIDADES, type Passeio } from '@/data/passeios';
import { fmt, rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { faixasIdade, type TabelaPreco } from './orcamento';
import { opcoesPasseio, precoAPartirCentavos, precoVendaCentavos, regraCriancas, tabelaPreco, temOpcoes } from './precos';

/** "por pessoa", "por veículo (até 2 pessoas)"… */
export function rotuloUnidade(p: Passeio, d: Dicionario): string {
  if (p.unidade === 'pessoa') return d.comum.porPessoa;
  const n = p.capacidadePorUnidade ?? 1;
  return fmt(p.unidade === 'veiculo' ? d.comum.porVeiculo : d.comum.porEmbarcacao, { n });
}

export const nomeCidade = (p: Passeio, idioma: Idioma) => CIDADES[p.cidade].nome[idioma];
export const nomeCategoria = (p: Passeio, idioma: Idioma) => CATEGORIAS[p.categoria].nome[idioma];

/** Frases sobre crianças: "Até 5 anos não pagam. De 6 a 10 anos pagam meia." */
export function regrasCriancas(p: Passeio, d: Dicionario): string[] {
  const R = d.comum.regras;
  const regra = regraCriancas(p);
  const frases: string[] = [];
  if (p.unidade !== 'pessoa') {
    const unidade = p.unidade === 'veiculo' ? d.comum.veiculo : d.comum.embarcacao;
    frases.push(fmt(R.porUnidade, { unidade, n: p.capacidadePorUnidade ?? 1 }));
  } else {
    const f = faixasIdade(regra);
    if (f.gratis) frases.push(fmt(R.gratis, { ate: f.gratis[1] }));
    if (f.meia) frases.push(fmt(R.meia, { de: f.meia[0], ate: f.meia[1] }));
    if (f.gratis || f.meia) frases.push(fmt(R.inteira, { n: f.inteiraDesde }));
    else frases.push(R.todosPagam);
  }
  if (regra.idadeMinima) frases.push(fmt(R.idadeMinima, { n: regra.idadeMinima }));
  return frases;
}

/** Contadores de pessoas que o passeio pede, conforme as faixas de idade. */
export interface FaixaContador {
  campo: 'adultos' | 'criancasMeia' | 'criancasGratis';
  rotulo: string;
  ajuda?: string;
}

export function contadoresPessoas(t: TabelaPreco, d: Dicionario): FaixaContador[] {
  const F = d.comum.faixas;
  // por veículo/embarcação: o preço não muda com a idade, então só "pessoas"
  if (t.unidade !== 'pessoa') return [{ campo: 'adultos', rotulo: F.pessoas }];
  const f = faixasIdade(t.criancas);
  const lista: FaixaContador[] = [
    {
      campo: 'adultos',
      rotulo: f.gratis || f.meia ? F.adultos : F.pessoas,
      ajuda: f.inteiraDesde > 0 ? fmt(F.aPartirDe, { n: f.inteiraDesde }) : F.todasIdades,
    },
  ];
  if (f.meia) lista.push({ campo: 'criancasMeia', rotulo: fmt(F.meia, { de: f.meia[0], ate: f.meia[1] }), ajuda: F.meiaAjuda });
  if (f.gratis) lista.push({ campo: 'criancasGratis', rotulo: fmt(F.gratis, { ate: f.gratis[1] }), ajuda: F.gratisAjuda });
  return lista;
}

/** Passeio sem faixa de criança (todos pagam igual): os textos dizem "pessoas". */
export function semFaixas(p: Passeio): boolean {
  if (p.unidade !== 'pessoa') return true;
  const f = faixasIdade(regraCriancas(p));
  return !f.gratis && !f.meia;
}

/** Dados de preço de um passeio, prontos para os componentes do navegador. */
export interface PrecoPasseio {
  slug: string;
  nome: string;
  href: string;
  cidade: Passeio['cidade'];
  cidadeNome: string;
  duracao: string;
  aPartirCentavos: number;
  temOpcoes: boolean;
  unidadeCurta: string;
  idadeMinima?: number;
  /** Tabela da opção mais barata, para o total do grupo. */
  tabela: TabelaPreco;
}

export function precoPasseio(p: Passeio, idioma: Idioma, d: Dicionario): PrecoPasseio {
  const opcoes = opcoesPasseio(p);
  const maisBarata = opcoes.reduce((a, b) => (precoVendaCentavos(b.precoParceiro) < precoVendaCentavos(a.precoParceiro) ? b : a));
  const cap = p.capacidadePorUnidade ?? 1;
  return {
    slug: p.slug,
    nome: p.nome[idioma],
    href: rota(idioma, `/passeios/${p.slug}`),
    cidade: p.cidade,
    cidadeNome: nomeCidade(p, idioma),
    duracao: p.duracao[idioma],
    aPartirCentavos: precoAPartirCentavos(p),
    temOpcoes: temOpcoes(p),
    unidadeCurta:
      p.unidade === 'pessoa'
        ? d.comum.porPessoa
        : `${p.unidade === 'veiculo' ? d.comum.porVeiculoCurto : d.comum.porEmbarcacaoCurto} · ${cap} ${cap === 1 ? d.comum.pessoa : d.comum.pessoas}`,
    idadeMinima: regraCriancas(p).idadeMinima,
    tabela: tabelaPreco(p, maisBarata),
  };
}
