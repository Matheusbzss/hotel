import type { DocumentoLegal, SecaoLegal } from './tipos.ts';

/**
 * Um par [frase no espanhol neutro, a mesma frase no espanhol da Argentina]. Sempre frases INTEIRAS: o título,
 * a descrição, o resumo, um parágrafo ou um item de lista, exatamente como estão no documento neutro.
 */
export type ParAR = readonly [neutra: string, argentina: string];

/** Todas as frases de um documento legal, na ordem em que aparecem na página. */
export function frasesDoDocumento(doc: DocumentoLegal): string[] {
  return [
    doc.titulo,
    doc.descricao,
    doc.resumo,
    ...doc.secoes.flatMap((s) => [s.titulo, ...s.paragrafos, ...(s.lista ?? []), ...(s.depois ?? [])]),
  ];
}

/**
 * O documento no espanhol da Argentina: o neutro (com "tú") com cada frase de `pares` trocada pela versão
 * argentina (com "vos"). Roda uma vez, na carga do módulo, e FALHA ALTO se um par repetir a frase neutra, se os
 * dois lados forem iguais ou se a frase neutra não existir no documento: assim, quem editar uma frase do neutro sem
 * mexer no par correspondente descobre na hora, em vez de deixar a frase argentina órfã em silêncio.
 */
export function comAjustesAR(neutro: DocumentoLegal, pares: readonly ParAR[]): DocumentoLegal {
  const trocas = new Map<string, string>();
  for (const [neutra, argentina] of pares) {
    if (trocas.has(neutra)) throw new Error(`Ajuste argentino repetido para a frase: "${neutra}"`);
    if (neutra === argentina) throw new Error(`Ajuste argentino igual ao neutro (par sem efeito): "${neutra}"`);
    trocas.set(neutra, argentina);
  }
  const existentes = new Set(frasesDoDocumento(neutro));
  const orfas = [...trocas.keys()].filter((frase) => !existentes.has(frase));
  if (orfas.length) {
    throw new Error(`Ajuste argentino sem frase igual no espanhol neutro:\n${orfas.map((frase) => `- "${frase}"`).join('\n')}`);
  }
  const troca = (frase: string) => trocas.get(frase) ?? frase;
  return {
    titulo: troca(neutro.titulo),
    descricao: troca(neutro.descricao),
    resumo: troca(neutro.resumo),
    secoes: neutro.secoes.map((s): SecaoLegal => ({
      titulo: troca(s.titulo),
      paragrafos: s.paragrafos.map(troca),
      ...(s.lista && { lista: s.lista.map(troca) }),
      ...(s.depois && { depois: s.depois.map(troca) }),
    })),
  };
}
