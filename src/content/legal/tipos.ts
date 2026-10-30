export interface SecaoLegal {
  titulo: string;
  paragrafos: string[];
  lista?: string[];
  depois?: string[];
}

export interface DocumentoLegal {
  titulo: string;
  resumo: string;
  secoes: SecaoLegal[];
}

/** Data da última revisão dos textos legais (AAAA-MM-DD). */
export const ATUALIZADO_EM = '2026-10-30';
