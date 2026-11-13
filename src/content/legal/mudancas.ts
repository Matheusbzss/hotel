import { frasesDoDocumento, type ParAR } from './argentino.ts';
import type { DocumentoLegal, SecaoLegal } from './tipos.ts';

/**
 * O que muda de um texto legal para outra versão dele (a do pagamento online, src/content/legal/online.ts), escrito
 * como diferença sobre o texto de hoje: frases inteiras trocadas, frases novas logo depois de uma frase que já existe e
 * seções novas. Assim o que não muda continua igual nas duas versões, palavra por palavra, e quem ler vê só o que
 * muda. Como comAjustesAR (argentino.ts), FALHA ALTO na carga se uma frase ou seção de referência não existir: quem
 * editar o texto de hoje sem mexer aqui descobre na hora, em vez de deixar a outra versão com a frase velha.
 */
export interface MudancasDoDocumento {
  /** [a frase de hoje, inteira, a frase da outra versão] */
  trocas?: readonly (readonly [antiga: string, nova: string])[];
  /** [uma frase de hoje, inteira, as frases que entram logo depois dela, no mesmo bloco: parágrafos, lista ou "depois"] */
  depois?: readonly (readonly [frase: string, novas: readonly string[]])[];
  /**
   * [o título de hoje de uma seção, a seção nova que entra logo depois dela]. O número do título das seções segue a
   * ordem nova ("5. …" vira "6. …" depois de uma seção nova): as referências no texto ("veja o item 10") vão nas trocas.
   */
  secoes?: readonly (readonly [depoisDa: string, secao: SecaoLegal])[];
}

/**
 * Duas listas de mudanças sobre o mesmo texto, juntas (a privacidade do pagamento online = as do pagamento + as dos
 * e-mails). As frases novas depois de uma mesma frase entram juntas, na ordem das listas; comMudancas continua falhando
 * alto se as duas trocarem a mesma frase.
 */
export function juntarMudancas(...listas: MudancasDoDocumento[]): MudancasDoDocumento {
  const depois = new Map<string, string[]>();
  for (const [frase, novas] of listas.flatMap((m) => m.depois ?? [])) depois.set(frase, [...(depois.get(frase) ?? []), ...novas]);
  return {
    trocas: listas.flatMap((m) => m.trocas ?? []),
    depois: [...depois],
    secoes: listas.flatMap((m) => m.secoes ?? []),
  };
}

/** O título com o número da posição: "5. Cancelamento" na 6ª posição vira "6. Cancelamento". */
const comNumero = (titulo: string, numero: number) => titulo.replace(/^\d+\./, `${numero}.`);

/** O documento com as mudanças aplicadas (o original não muda). */
export function comMudancas(doc: DocumentoLegal, m: MudancasDoDocumento): DocumentoLegal {
  const existentes = new Set(frasesDoDocumento(doc));
  const titulos = new Set(doc.secoes.map((s) => s.titulo));
  const trocas = new Map<string, string>();
  for (const [antiga, nova] of m.trocas ?? []) {
    if (trocas.has(antiga)) throw new Error(`Troca repetida para a frase: "${antiga}"`);
    if (antiga === nova) throw new Error(`Troca sem efeito (a frase nova é igual): "${antiga}"`);
    trocas.set(antiga, nova);
  }
  const depois = new Map<string, readonly string[]>();
  for (const [frase, novas] of m.depois ?? []) {
    if (depois.has(frase)) throw new Error(`Frases novas repetidas depois de: "${frase}"`);
    depois.set(frase, novas);
  }
  const orfas = [...trocas.keys(), ...depois.keys()].filter((frase) => !existentes.has(frase));
  const secoesOrfas = (m.secoes ?? []).map(([titulo]) => titulo).filter((titulo) => !titulos.has(titulo));
  if (orfas.length || secoesOrfas.length) {
    throw new Error(
      `Mudança sem frase ou seção igual no texto de hoje:\n${[...orfas, ...secoesOrfas].map((frase) => `- "${frase}"`).join('\n')}`,
    );
  }

  const bloco = (frases: string[]) => frases.flatMap((frase) => [trocas.get(frase) ?? frase, ...(depois.get(frase) ?? [])]);
  const secao = (s: SecaoLegal): SecaoLegal => ({
    titulo: trocas.get(s.titulo) ?? s.titulo,
    paragrafos: bloco(s.paragrafos),
    ...(s.lista && { lista: bloco(s.lista) }),
    ...(s.depois && { depois: bloco(s.depois) }),
  });
  const secoes = doc.secoes.flatMap((s) => [
    secao(s),
    ...(m.secoes ?? []).filter(([titulo]) => titulo === s.titulo).map(([, nova]) => nova),
  ]);
  return {
    titulo: trocas.get(doc.titulo) ?? doc.titulo,
    descricao: trocas.get(doc.descricao) ?? doc.descricao,
    resumo: trocas.get(doc.resumo) ?? doc.resumo,
    secoes: secoes.map((s, i) => ({ ...s, titulo: comNumero(s.titulo, i + 1) })),
  };
}

/**
 * Os pares argentinos que continuam valendo na outra versão: os do texto de hoje, menos os das frases trocadas (a
 * frase nova, se tiver "tú", traz o par dela). comAjustesAR confere o resto: um par de frase que não existe falha.
 */
export function paresQueFicam(pares: readonly ParAR[], m: MudancasDoDocumento): ParAR[] {
  const trocadas = new Set((m.trocas ?? []).map(([antiga]) => antiga));
  return pares.filter(([neutra]) => !trocadas.has(neutra));
}
