/**
 * A lista de passeios (/passeios) com o filtro por cidade e por tipo (?cidade=…&tipo=…): quais passeios aparecem e o
 * texto do topo. Funções puras, sem React (os testes rodam no node puro: tests/lista-passeios.test.ts).
 */

export interface ItemDaLista {
  cidade: string;
  categoria: string;
}

/** Os passeios que o filtro mostra: vazio é "todas" (ou "todos"). */
export function filtrarPasseios<T extends ItemDaLista>(itens: T[], cidade: string, tipo: string): T[] {
  return itens.filter((i) => (!cidade || i.cidade === cidade) && (!tipo || i.categoria === tipo));
}

export interface TextosDaLista {
  /** O texto de sempre, já com o número de passeios ("26 paseos en Búzios, Arraial do Cabo y Cabo Frio, con…"). */
  geral: string;
  /** "{n} paseos en {lugares}, con reserva online y cancelación gratis hasta 24 h antes." */
  filtrado: string;
  /** "1 paseo en {lugares}, con reserva online y cancelación gratis hasta 24 h antes." */
  filtradoUm: string;
}

/**
 * Pacote 34 (ENT-08): o texto do topo da lista. Sem filtro, o de sempre. Com filtro, conta só os passeios mostrados e
 * diz só as cidades deles, na ordem da lista de cidades ("10 paseos en Búzios, con…"). Antes, a lista filtrada por
 * Búzios mostrava 10 passeios embaixo de "26 paseos en Búzios, Arraial do Cabo y Cabo Frio". Quando o filtro não acha
 * nenhum, o de sempre (a lista mostra o "nenhum passeio" com o botão de limpar).
 */
export function textoDaLista(
  itens: ItemDaLista[],
  filtro: { cidade: string; tipo: string },
  cidades: { valor: string; rotulo: string }[],
  locale: string,
  T: TextosDaLista,
): string {
  if (!filtro.cidade && !filtro.tipo) return T.geral;
  const visiveis = filtrarPasseios(itens, filtro.cidade, filtro.tipo);
  if (!visiveis.length) return T.geral;
  const mostradas = cidades.filter((c) => visiveis.some((i) => i.cidade === c.valor));
  // em português, a preposição vai com o lugar: "em Búzios, Arraial do Cabo e no Rio de Janeiro", "1 passeio no Rio de
  // Janeiro" (o Rio pede o artigo; revisão do Pacote 34); por isso o texto em pt não traz o "em" antes de {lugares}
  const lugares = /^pt\b/i.test(locale)
    ? mostradas.map((c, i) => (c.valor === 'rio-de-janeiro' ? `no ${c.rotulo}` : i === 0 ? `em ${c.rotulo}` : c.rotulo))
    : mostradas.map((c) => c.rotulo);
  // em inglês, sem a vírgula antes do "and", como no texto de sempre ("Búzios, Arraial do Cabo and Cabo Frio")
  const lista = new Intl.ListFormat(/^en\b/i.test(locale) ? 'en-GB' : locale, { type: 'conjunction' }).format(lugares);
  return (visiveis.length === 1 ? T.filtradoUm : T.filtrado).replace('{n}', String(visiveis.length)).replace('{lugares}', lista);
}
