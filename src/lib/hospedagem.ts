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
