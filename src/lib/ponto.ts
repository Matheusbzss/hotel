/** O "·" preso às palavras dos dois lados por espaços que não quebram: a linha nunca começa nem termina nele. */
export const PONTO_PRESO = '\u00a0·\u00a0';

/** "por veículo · 2 pessoas" com cada "·" preso às palavras dos dois lados (ver PONTO_PRESO). */
export const semQuebraNoPonto = (texto: string) => texto.replaceAll(' · ', PONTO_PRESO);

/**
 * "Lancha Privada en Búzios · 4 horas" (com o "·" preso, PONTO_PRESO) em três partes: o começo ("Lancha Privada en"),
 * a última palavra antes do "·" ("Búzios") e a parte da direita ("4 horas"). Texto sem o "·" preso, ou com mais de
 * um, não se separa (null).
 */
export function partesDoPonto(texto: string): { comeco: string; ultima: string; direita: string } | null {
  const partes = texto.split(PONTO_PRESO);
  if (partes.length !== 2) return null;
  const [esquerda, direita] = partes;
  const corte = esquerda.lastIndexOf(' ');
  return { comeco: corte < 0 ? '' : esquerda.slice(0, corte), ultima: esquerda.slice(corte + 1), direita };
}
