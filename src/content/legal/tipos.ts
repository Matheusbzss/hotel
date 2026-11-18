export interface SecaoLegal {
  titulo: string;
  paragrafos: string[];
  lista?: string[];
  depois?: string[];
}

export interface DocumentoLegal {
  titulo: string;
  resumo: string;
  /** A descrição da página no Google, com até 160 caracteres (o resumo é maior). */
  descricao: string;
  secoes: SecaoLegal[];
}

/** Os três textos legais, com os nomes que textosLegais (src/content/legal/online.ts) e as páginas usam. */
export type TextoLegal = 'termos' | 'cancelamento' | 'privacidade';

/**
 * A data da última revisão de cada texto legal de hoje (AAAA-MM-DD), uma por documento: a página de cada um mostra a
 * dele em "Atualizado em". Mudou o texto de um deles, ou o que a página dele mostra (como o "Em resumo" da política de
 * cancelamento)? Troque só a data dele.
 * - termos: 2026-11-11, o domínio oficial orlanativa.online.
 * - cancelamento: 2026-11-13, a primeira linha do "Em resumo" (a tabela do topo): "O passeio for cancelado por chuva,
 *   vento ou mar".
 * - privacidade: 2026-11-14, o item 5 passou a dizer que o Google e a Meta usam cookies para medir e personalizar os
 *   anúncios e como desativar (e o topo e os itens 3 e 4 dizem o mesmo).
 */
export const ATUALIZADO_EM: Readonly<Record<TextoLegal, string>> = {
  termos: '2026-11-11',
  cancelamento: '2026-11-13',
  privacidade: '2026-11-14',
};
