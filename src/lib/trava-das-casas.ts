/**
 * A TRAVA DAS DATAS DAS CASAS enquanto o cliente paga (Etapa 7), nas regras que não tocam no banco: a decisão de
 * prenderDatasDoPedido (src/lib/pedido-carrinho.ts) depois de renomear os bloqueios pelo item do pedido, e a trava no
 * arquivo do computador (a cópia particular roda sem banco). Os testes estão em tests/reserva-casa.test.ts.
 *
 * O caminho no banco (crítica de 26/11, furo 1, o alto): os bloqueios do pedido passam para a sessão nova pelo ITEM
 * (item_pedido_id), conferindo as linhas que voltaram; o item que não voltou é preso de novo pela função do banco
 * prender_datas_casas (bloquearCasasDoPedido, o caminho único). Se ela disser que não deu, a conferência pelo item
 * decide: o item que já tem o bloqueio do site foi preso por outro toque do mesmo cliente (os dois toques no "Pagar de
 * novo" levam a mesma sessão: furo 7), e é sucesso; faltando algum, as datas são de outra pessoa.
 */

/** Uma estadia de casa de um pedido, como a trava precisa: o item, a casa e as datas (a noite da saída fica livre). */
export interface EstadiaDoPedido {
  /** No banco, o id de itens_pedido; nos arquivos do computador, o código do voucher. */
  itemPedidoId: string;
  casaId: string;
  inicio: string;
  fim: string;
}

/** Os itens que a renomeação pelo item não achou: são os que ainda precisam ser presos. */
export function itensAPrender<T extends Pick<EstadiaDoPedido, 'itemPedidoId'>>(itens: readonly T[], renomeados: readonly string[]): T[] {
  const ja = new Set(renomeados);
  return itens.filter((i) => !ja.has(i.itemPedidoId));
}

/**
 * A prender_datas_casas disse que não deu: os itens que faltavam têm, agora, o bloqueio do site (outro toque do mesmo
 * cliente prendeu no meio-tempo) ou não (as noites são de outra pessoa)?
 */
export function depoisDoNaoDeu(
  faltavam: readonly Pick<EstadiaDoPedido, 'itemPedidoId'>[],
  comBloqueio: readonly string[],
): 'presas' | 'ocupadas' {
  const tem = new Set(comBloqueio);
  return faltavam.every((i) => tem.has(i.itemPedidoId)) ? 'presas' : 'ocupadas';
}

/* ------------------------------------------------------------------ */
/* A trava no arquivo do computador                                    */

/** Uma estadia do site presa no arquivo do computador (.data/casas-bloqueios-do-site.json), como uma linha de casas_bloqueios. */
export interface BloqueioNoArquivo extends EstadiaDoPedido {
  id: string;
  /** A sessão de pagamento corrente (cs_…), como a referência no banco. */
  referencia: string;
}

const cruza = (a: { inicio: string; fim: string }, b: { inicio: string; fim: string }) => a.inicio < b.fim && b.inicio < a.fim;

/**
 * A mesma regra de prender_datas_casas, no arquivo: cada estadia é conferida contra TODOS os bloqueios da casa (os do
 * cadastro e os do calendário de fora, `daCasa`), contra as estadias do site já presas no arquivo e contra as outras
 * estadias do mesmo pedido; tudo ou nada. Devolve a lista nova, ou null sem mudar nada se alguma noite estiver ocupada.
 */
export function prenderNoArquivo(
  atuais: readonly BloqueioNoArquivo[],
  daCasa: (casaId: string) => readonly { inicio: string; fim: string }[],
  estadias: readonly EstadiaDoPedido[],
  referencia: string,
  novoId: () => string,
): BloqueioNoArquivo[] | null {
  if (!referencia.trim()) throw new Error('prenderNoArquivo: falta a referência (a sessão de pagamento).');
  for (const [i, e] of estadias.entries()) {
    if (!(e.fim > e.inicio)) throw new Error('prenderNoArquivo: estadia com a saída antes da entrada.');
    if (daCasa(e.casaId).some((b) => cruza(b, e))) return null;
    if (atuais.some((b) => b.casaId === e.casaId && cruza(b, e))) return null;
    if (estadias.some((o, j) => j > i && o.casaId === e.casaId && cruza(o, e))) return null;
  }
  return [...atuais, ...estadias.map((e) => ({ ...e, id: novoId(), referencia }))];
}

/* ------------------------------------------------------------------ */
/* O aviso à equipe                                                    */

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * A linha do histórico do pedido pago sem as datas de uma casa presas (a conferência do aviso da Stripe não conseguiu
 * prender: as noites já são de outra reserva ou de um bloqueio). Começa com "Aviso:", e o painel destaca e abre o histórico
 * do pedido (ehAviso, src/lib/pedidos-painel.ts). Só para a equipe, em português. Uma por voucher.
 */
export const avisoDasDatasNaoPresas = (v: { codigo: string; casa: { nome: string }; data: string; saida: string }): string =>
  `Aviso: as datas da casa ${v.casa.nome} (entrada ${dataBr(v.data)}, saída ${dataBr(v.saida)}, voucher ${v.codigo}) não ficaram presas para este pedido pago: outra reserva ou um bloqueio ocupa essas noites. Conferir o calendário da casa no painel antes de confirmar com o cliente`;
