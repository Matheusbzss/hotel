// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { LUGARES, VEICULOS, precoTrecho, trajetoDoLink, type IdLugar } from '../data/transfer.ts';
import type { Idioma } from '../i18n/config';
import { texto } from '../i18n/conteudo.ts';
import { formatarCifra } from './cifra.ts';
import { textoDolar } from './dolar.ts';
import { precoPixCentavos } from './orcamento.ts';
import { cartaoEmDestaque, rotuloPixComDesconto } from './preco-destaque.ts';

/** Os textos que a linha usa, todos do dicionário (nada escrito à mão). */
export interface TextosLinhaDoTrajeto {
  /** "hasta {n} personas" */
  ateNPessoas: string;
  noPix: string;
  noCartao: string;
  /** "con Pix (−{p}%)" */
  noPixComDesconto: string;
  /** "≈ US$ {v}" */
  dolar: string;
}

export interface LinhaDoTrajeto {
  /** "Aeropuerto de Galeão (GIG), Río → Búzios" */
  trajeto: string;
  /** "Auto ejecutivo, hasta 4 personas" */
  veiculo: string;
  /** O preço em destaque (src/lib/preco-destaque.ts): o do cartão em es, es-ar e en; o do Pix em pt. */
  grande: { valor: string; rotulo: string; dolar: string };
  /** O outro: o do Pix, com o desconto, em es, es-ar e en; o do cartão em pt. */
  embaixo: { valor: string; rotulo: string };
}

/**
 * Pacote 34 (ENT-05): com o trajeto no link (?saida=galeao&destino=buzios, o link do anúncio), a linha logo embaixo do
 * título da página do transfer: o trajeto e o preço do trecho no primeiro veículo (o carro), pela regra do preço em
 * destaque, com as mesmas contas do cartão do transfer (precoTrecho, precoPixCentavos e textoDolar) e só com textos que
 * já existem. É o preço de um trecho, só a ida (o "→" diz o sentido), como o do anúncio. Sem as duas pontas no link, ou
 * com o trajeto sob cotação, não há linha (null). Também não há linha quando o cartão abre com "Ida y vuelta" marcado
 * (a saída num aeroporto sem ?volta=nao, a regra do WidgetTransfer): o total dele seria o dobro do preço da linha, e o
 * cliente veria dois preços para o mesmo carro (revisão do Pacote 34). Os links dos anúncios levam o &volta=nao.
 */
export function linhaDoTrajeto(
  busca: string,
  idioma: Idioma,
  locale: string,
  dolar: number | null,
  T: TextosLinhaDoTrajeto,
): LinhaDoTrajeto | null {
  const { saida, destino, soIda } = trajetoDoLink(busca);
  if (!saida || !destino) return null;
  // o cartão marca a volta sozinho quando sai de um aeroporto (quem chega, volta), a não ser com ?volta=nao
  if (LUGARES[saida].aeroporto && !soIda) return null;
  const reais = precoTrecho(saida, destino, 'carro');
  if (reais === null) return null;
  const cartao = Math.round(reais * 100);
  const pix = precoPixCentavos(cartao);
  const nome = (l: IdLugar) => texto(LUGARES[l].nome, idioma);
  const carro = VEICULOS.carro;
  const linha = {
    trajeto: `${nome(saida)} → ${nome(destino)}`,
    veiculo: `${texto(carro.nome, idioma)}, ${T.ateNPessoas.replace('{n}', String(carro.capacidade))}`,
  };
  if (cartaoEmDestaque(locale)) {
    return {
      ...linha,
      grande: { valor: formatarCifra(cartao, locale), rotulo: T.noCartao, dolar: textoDolar(cartao, dolar, T.dolar, locale) },
      embaixo: { valor: formatarCifra(pix, locale), rotulo: rotuloPixComDesconto(T.noPixComDesconto) },
    };
  }
  return {
    ...linha,
    grande: { valor: formatarCifra(pix, locale), rotulo: T.noPix, dolar: textoDolar(pix, dolar, T.dolar, locale) },
    embaixo: { valor: formatarCifra(cartao, locale), rotulo: T.noCartao },
  };
}
