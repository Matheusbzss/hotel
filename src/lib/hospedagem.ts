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
 * Pacote 29: grava o hotel informado pela equipe numa hospedagem "a informar"; a que já tem hotel (ou não é de passeio)
 * volta como null, sem mudar. A cidade fica a que o cliente escolheu no checkout.
 */
export function hospedagemInformada(h: Hospedagem | undefined, hotel: string): Hospedagem | null {
  if (!h?.aInformar || !hotel) return null;
  return { cidade: h.cidade, hotel };
}
