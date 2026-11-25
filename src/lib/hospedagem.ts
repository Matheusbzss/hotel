// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import type { CidadeHospedagem } from './validacao.ts';

/**
 * Onde o cliente dos passeios vai ficar, uma vez só para todos os passeios do pedido. `aInformar`: o cliente marcou
 * "Ainda não sei" no checkout (ainda não reservou a hospedagem); o hotel fica vazio e a equipe pede o nome pelo WhatsApp
 * antes do passeio (o painel mostra "a informar"). O transfer não usa isto: o endereço de busca dele é obrigatório no
 * próprio formulário do transfer, antes de ir para o carrinho, porque o motorista precisa saber aonde ir.
 */
export interface Hospedagem {
  cidade: CidadeHospedagem;
  hotel: string;
  aInformar?: true;
}

/** O que o checkout manda: a cidade, o nome digitado e se o cliente marcou "Ainda não sei". */
export interface HospedagemDoCheckout {
  cidade: CidadeHospedagem;
  hotel: string;
  aInformar?: boolean;
}

/**
 * A hospedagem que vai para o pedido, ou null quando falta o hotel (sem "Ainda não sei", o nome continua obrigatório).
 * Com "Ainda não sei", o nome digitado antes de marcar é descartado: o pedido nunca leva meio nome.
 */
export function hospedagemDoCheckout(h: HospedagemDoCheckout): Hospedagem | null {
  if (h.aInformar) return { cidade: h.cidade, hotel: '', aInformar: true };
  const hotel = h.hotel.trim();
  return hotel ? { cidade: h.cidade, hotel } : null;
}

/** O nome do hotel como o voucher, a página do pedido, a mensagem do WhatsApp e o painel mostram: o digitado, ou o "a informar" do idioma. */
export const nomeDoHotel = (h: Pick<Hospedagem, 'hotel' | 'aInformar'>, aInformar: string): string => (h.aInformar ? aInformar : h.hotel);

/** O maior nome de hotel que o checkout e o painel aceitam (o mesmo limite do campo do checkout). */
export const MAXIMO_NOME_DO_HOTEL = 120;

/** Pacote 29: a linha do histórico quando a equipe grava no painel o hotel que estava "a informar" (seguida do nome). */
export const LINHA_DO_HOTEL_INFORMADO = 'Hotel informado no painel';

/**
 * Pacote 29: o nome que a equipe digitou no painel para o hotel "a informar", limpo (sem espaços sobrando nem caracteres
 * de controle), ou '' quando não serve: vazio ou maior que o limite. Nada é cortado sem a equipe ver: o nome comprido
 * demais volta como erro, e o campo do painel já não deixa passar do limite.
 */
export function hotelDoPainel(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  // os caracteres de controle (quebras de linha, tabulações) viram espaço
  const semControle = [...valor].map((c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('');
  const limpo = semControle.replace(/\s+/g, ' ').trim();
  return limpo.length > 0 && limpo.length <= MAXIMO_NOME_DO_HOTEL ? limpo : '';
}

/**
 * O hotel que o painel já gravou no pedido: o da primeira linha "Hotel informado no painel: …" do histórico, ou null.
 * No banco, o histórico e a trava de versão são do pedido inteiro, então todos os passeios leem a mesma resposta.
 */
export function hotelJaInformado(historico: readonly { evento: string }[] | undefined): string | null {
  const comeco = `${LINHA_DO_HOTEL_INFORMADO}: `;
  const linha = (historico ?? []).find((e) => e.evento.startsWith(comeco));
  return linha ? linha.evento.slice(comeco.length) : null;
}

/** O que "Gravar o hotel" faz num passeio (passoDoHotel). */
export type PassoDoHotel =
  | { tipo: 'gravar'; hospedagem: Hospedagem; linha?: string }
  | { tipo: 'ja-estava' }
  | { tipo: 'outro-hotel' }
  | { tipo: 'nao-vale' };

/**
 * Pacote 29: o que "Gravar o hotel" faz num passeio, decidido com o passeio relido dentro da trava de versão (a rota do
 * painel). A hospedagem é uma só por pedido: o primeiro hotel gravado vale para todos os passeios.
 * - A hospedagem a informar recebe o hotel, na cidade que o cliente escolheu no checkout. A linha do histórico ("Hotel
 *   informado no painel: …") vai só se o pedido ainda não tem hotel gravado; com o mesmo hotel já gravado (outro passeio
 *   do pedido, ou o segundo toque), o passeio recebe o hotel sem outra linha.
 * - O pedido que já tem OUTRO hotel gravado no painel ('outro-hotel', segunda revisão do Pacote 29): outra pessoa da
 *   equipe, ou outra aba, gravou no meio-tempo. Nada muda e a rota avisa; sem isto, dois nomes ao mesmo tempo podiam
 *   deixar um hotel em cada passeio do mesmo pedido, e as duas respostas diziam que deu certo.
 * - O passeio que já tem este mesmo hotel é o segundo toque ('ja-estava', a rota volta como deu certo); com outro hotel
 *   no passeio, 'outro-hotel' também. Sem nome, a ação não vale.
 */
export function passoDoHotel(h: Hospedagem, historico: readonly { evento: string }[] | undefined, hotel: string): PassoDoHotel {
  if (!hotel) return { tipo: 'nao-vale' };
  if (!h.aInformar) return h.hotel === hotel ? { tipo: 'ja-estava' } : { tipo: 'outro-hotel' };
  const jaInformado = hotelJaInformado(historico);
  if (jaInformado !== null && jaInformado !== hotel) return { tipo: 'outro-hotel' };
  return {
    tipo: 'gravar',
    hospedagem: { cidade: h.cidade, hotel },
    ...(jaInformado === null ? { linha: `${LINHA_DO_HOTEL_INFORMADO}: ${hotel}` } : {}),
  };
}
