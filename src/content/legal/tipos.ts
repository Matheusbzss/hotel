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

/**
 * Data da última revisão dos textos legais (AAAA-MM-DD), uma só para os três textos de hoje. 2026-11-14: o item 5 da
 * Política de Privacidade passou a dizer que o Google e a Meta usam cookies para os anúncios e como desativar.
 */
export const ATUALIZADO_EM = '2026-11-14';
