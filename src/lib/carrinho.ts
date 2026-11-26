import type { IdLugar, Malas, Veiculo } from '@/data/transfer';

/**
 * O carrinho: o que o cliente escolheu em cada item fica guardado (tabela carrinhos, com o código no
 * cookie). O preço e o texto de cada item são calculados de novo no servidor, a partir do catálogo e
 * da tabela de preços: nunca vêm do navegador.
 */

export type EscolhaPasseio = {
  tipo: 'passeio';
  slug: string;
  opcao?: string;
  /** AAAA-MM-DD e HH:MM */
  data: string;
  hora: string;
  adultos: number;
  meia: number;
  gratis: number;
  /** O cliente pegou pela sugestão do carrinho (para medir quanto as sugestões vendem). */
  sugestao?: true;
};

export type TrechoEscolhido = {
  saida: { lugar: IdLugar; endereco?: string };
  destino: { lugar: IdLugar; endereco?: string };
  data: string;
  hora: string;
};

export type EscolhaTransfer = {
  tipo: 'transfer';
  veiculo: Veiculo;
  ida: TrechoEscolhido;
  volta?: TrechoEscolhido;
  passageiros: number;
  malas: Malas;
};

export type EscolhaItem = EscolhaPasseio | EscolhaTransfer;

/** O que fica guardado no carrinho: a escolha e um id para mudar ou tirar. */
export interface ItemCarrinho {
  id: string;
  escolha: EscolhaItem;
}

/** Até quantos itens cabem num carrinho (um pedido). */
export const MAXIMO_ITENS = 12;

/** Como cada item aparece no carrinho, já calculado no servidor. */
export interface ItemVisivel {
  id: string;
  tipo: 'passeio' | 'transfer';
  titulo: string;
  foto: string;
  /** As linhas de baixo do título: data e hora, quem vai, o veículo. */
  detalhes: string[];
  /** Onde o cliente muda o item: a página do passeio ou do transfer, já com o que ele escolheu. */
  href: string;
  totalCentavos: number;
  totalPixCentavos: number;
  /** O que o cliente escolheu: é o que preenche a página de novo quando ele toca em "Mudar". */
  escolha: EscolhaItem;
  /**
   * Só no passeio com taxa paga no local (temTaxaNoLocal, src/data/passeios.ts): o checkout avisa, perto do total, que
   * as taxas municipais ou de embarque não estão incluídas.
   */
  taxaNoLocal?: true;
  /** Só no transfer: o que o checkout pergunta deste item. */
  transfer?: {
    /** Os trechos com aeroporto, com o rótulo do número do voo. */
    voos: { trecho: 'ida' | 'volta'; rotulo: string }[];
    passageiros: number;
  };
}

/** Um passeio sugerido, já com o preço para o grupo do carrinho. */
export interface SugestaoVisivel {
  slug: string;
  nome: string;
  foto: string;
  href: string;
  /** Os horários do passeio ("HH:MM") e o rótulo: saída ou busca na hospedagem. */
  horas: string[];
  rotuloHorario: string;
  /** Uma só, quando o passeio não tem opções. O id só vai para o carrinho quando há mais de uma. */
  opcoes: { id: string; nome: string; totalCentavos: number; totalPixCentavos: number }[];
  /** O mesmo grupo do último item do carrinho, nas regras deste passeio. */
  pessoas: { adultos: number; meia: number; gratis: number };
  pessoasTexto: string;
  /** A data que já vem marcada: o dia seguinte ao do último item (AAAA-MM-DD). */
  data: string;
}

export function totaisDoCarrinho(itens: ItemVisivel[]) {
  return {
    totalCentavos: itens.reduce((s, i) => s + i.totalCentavos, 0),
    totalPixCentavos: itens.reduce((s, i) => s + i.totalPixCentavos, 0),
  };
}
