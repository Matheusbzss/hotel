/** O "·" preso às palavras dos dois lados por espaços que não quebram: a linha nunca começa nem termina nele. */
export const PONTO_PRESO = '\u00a0·\u00a0';

/** "por veículo · 2 pessoas" com cada "·" preso às palavras dos dois lados (ver PONTO_PRESO). */
export const semQuebraNoPonto = (texto: string) => texto.replaceAll(' · ', PONTO_PRESO);
