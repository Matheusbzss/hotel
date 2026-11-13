import type { EscolhaItem, EscolhaTransfer } from '@/lib/carrinho';

/**
 * As sugestões do carrinho e do checkout: a tabela aprovada pelo dono (FASE-3.md, Etapa 3). Quem pegou passeio
 * de barco vê passeio por terra e o contrário, nunca o que o passeio já inclui. Sem dependências: o teste
 * tests/sugestoes.test.ts confere a tabela com o catálogo.
 */

/** Até quantas sugestões aparecem por vez. */
export const MAXIMO_SUGESTOES = 3;

export const SUGESTOES_PASSEIO: Record<string, string[]> = {
  // Búzios
  'escuna-buzios': ['buggy-buzios', 'quadriciclo-buzios', 'city-tour-buzios'],
  'catamara-buzios': ['buggy-buzios', 'quadriciclo-buzios', 'city-tour-buzios'],
  'buggy-buzios': ['escuna-buzios', 'catamara-buzios', 'lancha-buzios'],
  'quadriciclo-buzios': ['escuna-buzios', 'catamara-buzios', 'jet-ski-buzios'],
  'city-tour-buzios': ['escuna-buzios', 'catamara-buzios', 'jet-ski-buzios'],
  'trolley-buzios': ['escuna-buzios', 'catamara-buzios', 'lancha-buzios'],
  'lancha-buzios': ['buggy-buzios', 'quadriciclo-buzios', 'trolley-buzios'],
  'jet-ski-buzios': ['escuna-buzios', 'buggy-buzios', 'quadriciclo-buzios'],
  'helicoptero-buzios': ['escuna-buzios', 'lancha-buzios', 'buggy-buzios'],
  'full-day-buzios': ['full-day-arraial-do-cabo', 'full-day-cabo-frio', 'city-tour-rio-de-janeiro'],
  // Arraial do Cabo
  'barco-arraial-do-cabo': ['mergulho-arraial-do-cabo', 'buggy-arraial-do-cabo', 'quadriciclo-arraial-do-cabo'],
  'full-day-arraial-do-cabo': ['mergulho-arraial-do-cabo', 'buggy-arraial-do-cabo', 'quadriciclo-arraial-do-cabo'],
  'city-tour-arraial-do-cabo': ['barco-arraial-do-cabo', 'mergulho-arraial-do-cabo', 'lancha-privativa-arraial-do-cabo'],
  'mergulho-arraial-do-cabo': ['barco-arraial-do-cabo', 'buggy-arraial-do-cabo', 'quadriciclo-arraial-do-cabo'],
  'mergulho-credenciado-arraial-do-cabo': ['barco-arraial-do-cabo', 'buggy-arraial-do-cabo', 'quadriciclo-arraial-do-cabo'],
  'buggy-arraial-do-cabo': ['barco-arraial-do-cabo', 'mergulho-arraial-do-cabo', 'lancha-privativa-arraial-do-cabo'],
  'quadriciclo-arraial-do-cabo': ['barco-arraial-do-cabo', 'mergulho-arraial-do-cabo', 'lancha-privativa-arraial-do-cabo'],
  'lancha-privativa-arraial-do-cabo': ['buggy-arraial-do-cabo', 'quadriciclo-arraial-do-cabo', 'mergulho-arraial-do-cabo'],
  // Cabo Frio
  'catamara-cabo-frio': ['buggy-cabo-frio', 'quadriciclo-cabo-frio', 'city-tour-cabo-frio'],
  'escuna-cabo-frio': ['buggy-cabo-frio', 'quadriciclo-cabo-frio', 'city-tour-cabo-frio'],
  'lancha-privativa-cabo-frio': ['buggy-cabo-frio', 'quadriciclo-cabo-frio', 'city-tour-cabo-frio'],
  'city-tour-cabo-frio': ['catamara-cabo-frio', 'escuna-cabo-frio', 'lancha-privativa-cabo-frio'],
  'buggy-cabo-frio': ['catamara-cabo-frio', 'escuna-cabo-frio', 'lancha-privativa-cabo-frio'],
  'quadriciclo-cabo-frio': ['catamara-cabo-frio', 'escuna-cabo-frio', 'lancha-privativa-cabo-frio'],
  'full-day-cabo-frio': ['buggy-cabo-frio', 'quadriciclo-cabo-frio', 'full-day-arraial-do-cabo'],
  // Rio de Janeiro
  'city-tour-rio-de-janeiro': ['full-day-buzios', 'full-day-arraial-do-cabo', 'full-day-cabo-frio'],
};

/** No transfer, os passeios da cidade da Região dos Lagos do trajeto. */
export const SUGESTOES_TRANSFER: Record<string, string[]> = {
  buzios: ['escuna-buzios', 'buggy-buzios', 'city-tour-buzios'],
  'arraial-do-cabo': ['barco-arraial-do-cabo', 'buggy-arraial-do-cabo', 'mergulho-arraial-do-cabo'],
  'cabo-frio': ['catamara-cabo-frio', 'escuna-cabo-frio', 'buggy-cabo-frio'],
};

const doTransfer = (e: EscolhaTransfer) => SUGESTOES_TRANSFER[e.ida.destino.lugar] ?? SUGESTOES_TRANSFER[e.ida.saida.lugar] ?? [];

/**
 * As sugestões do carrinho, em ordem: primeiro as do último item adicionado, depois as dos anteriores, sem
 * repetir e sem o que já está no carrinho.
 */
export function sugestoesDoCarrinho(escolhas: EscolhaItem[]): string[] {
  const noCarrinho = escolhas.flatMap((e) => (e.tipo === 'passeio' ? [e.slug] : []));
  const lista = [...escolhas].reverse().flatMap((e) => (e.tipo === 'passeio' ? (SUGESTOES_PASSEIO[e.slug] ?? []) : doTransfer(e)));
  return [...new Set(lista)].filter((s) => !noCarrinho.includes(s));
}
