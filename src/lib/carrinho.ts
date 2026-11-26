import type { IdLugar, Malas, Veiculo } from '@/data/transfer';

/**
 * O carrinho: o que o cliente escolheu em cada item fica guardado (tabela carrinhos, com o código no cookie). O preço e o
 * texto de cada item são calculados de novo no servidor, a partir do catálogo e da tabela de preços (nas casas, da tabela
 * da casa no banco e das noites ocupadas de agora): nunca vêm do navegador.
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

/**
 * Uma casa de temporada (Etapa 7): a casa, a entrada e a saída (AAAA-MM-DD; a noite da saída não conta, como nas
 * reservas) e os hóspedes. A conta é a da página da casa (contaEstadia, src/lib/estadia.ts), refeita no servidor com as
 * noites ocupadas de agora (src/lib/casa-no-carrinho.ts).
 */
export type EscolhaCasa = {
  tipo: 'casa';
  slug: string;
  entrada: string;
  saida: string;
  hospedes: number;
};

export type EscolhaItem = EscolhaPasseio | EscolhaTransfer | EscolhaCasa;

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
  tipo: 'passeio' | 'transfer' | 'casa';
  titulo: string;
  foto: string;
  /** As linhas de baixo do título: data e hora, quem vai, o veículo; na casa, as diárias, os hóspedes e o sinal. */
  detalhes: string[];
  /** Onde o cliente muda o item: a página do passeio, do transfer ou da casa, já com o que ele escolheu. */
  href: string;
  /** O total do item no cartão (na casa, o da estadia inteira: hoje se paga só o sinal, `casa.sinalCentavos`). */
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
  /** Só na casa: o sinal que se paga hoje e o que fica para a chegada, nas duas formas. */
  casa?: {
    noites: number;
    hospedes: number;
    sinalCentavos: number;
    sinalPixCentavos: number;
    chegadaCentavos: number;
    chegadaPixCentavos: number;
  };
  /**
   * Só na casa que alguém reservou enquanto ela estava no carrinho (alguma noite ficou ocupada): ela continua no carrinho,
   * com o aviso e o "Mudar" para escolher outras datas, mas fica fora da conta e do pedido (crítica de 26/11, furo 8).
   */
  indisponivel?: true;
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

/**
 * O que um item cobra HOJE, na forma: o total no passeio e no transfer; na casa, o sinal (a mesma regra de valorDoItem,
 * src/lib/formas-pagamento.ts, que a sessão da Stripe cobra; tests/reserva-casa.test.ts confere que as duas dão o mesmo
 * número). Mora aqui, sem importar aquele arquivo, porque este também vai para o navegador.
 */
export function cobradoHoje(i: Pick<ItemVisivel, 'totalCentavos' | 'totalPixCentavos' | 'casa'>, forma: 'cartao' | 'pix'): number {
  if (i.casa) return forma === 'pix' ? i.casa.sinalPixCentavos : i.casa.sinalCentavos;
  return forma === 'pix' ? i.totalPixCentavos : i.totalCentavos;
}

/** Os itens que entram na conta e no pedido: a casa que ficou indisponível fica de fora (continua na lista, com o aviso). */
export const itensDaConta = <T extends Pick<ItemVisivel, 'indisponivel'>>(itens: readonly T[]): T[] => itens.filter((i) => !i.indisponivel);

/** O carrinho tem casa: o total vira "A pagar hoje" (o sinal da casa mais o resto) e entram as regras das casas. */
export const temCasa = (itens: readonly Pick<ItemVisivel, 'tipo'>[]): boolean => itens.some((i) => i.tipo === 'casa');

/**
 * O que o carrinho cobra hoje, nas duas formas: a soma do que cada item cobra (cobradoHoje). No passeio e no transfer é o
 * total, o mesmo número de antes; na casa, o sinal. A casa indisponível fica de fora.
 */
export function totaisDoCarrinho(itens: ItemVisivel[]) {
  const daConta = itensDaConta(itens);
  return {
    totalCentavos: daConta.reduce((s, i) => s + cobradoHoje(i, 'cartao'), 0),
    totalPixCentavos: daConta.reduce((s, i) => s + cobradoHoje(i, 'pix'), 0),
  };
}
