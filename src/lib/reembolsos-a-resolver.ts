// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { formatarCifra } from './cifra.ts';

/**
 * Os reembolsos que pedem uma ação da equipe, contados pelo histórico do pedido: sem coluna nova nem migração (o
 * histórico existe igual no banco, pedidos_historico, e nos arquivos do computador). Como na desistência
 * (src/lib/desistencia.ts), a pendência é uma linha "Aviso:" que o webhook da Stripe grava, e uma linha posterior a
 * fecha. Aqui ficam as frases (quem grava e quem lê usam as mesmas) e a leitura delas, sem rede nem banco
 * (tests/reembolsos-a-resolver.test.ts):
 * - o reembolso que a Stripe não conseguiu concluir (refund.failed): o valor e o voucher saem da própria linha;
 * - o reembolso de parte de um pedido com vários itens feito direto na Stripe, sem dizer de qual voucher;
 * - as três partes do que voltou ao cliente: pela mesma forma de pagamento, pendente e por outro meio.
 * O motivo da falha (o failure_reason da Stripe) fica só no histórico do painel: nunca vai para o cliente.
 */

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
/** Os centavos de uma cifra escrita por formatarCifra ("R$ 1.234,56" → 123456): ela sempre escreve os centavos. */
const centavosDaCifra = (texto: string): number => Number(texto.replace(/\D/g, ''));

/* ------------------------------------------------------------------ */
/* O reembolso que falhou                                              */

/** Um reembolso que a Stripe não conseguiu concluir (refund.failed), como o histórico do pedido conta. */
export interface ReembolsoFalho {
  /** re_… (cartão) ou pyr_… (Pix). */
  id: string;
  centavos: number;
  /** Só no reembolso de um voucher (o painel pediu a devolução daquele item). */
  voucher?: string;
  /** O failure_reason da Stripe, cru: só o painel vê. */
  motivo: string;
  /** A equipe já registrou no painel que devolveu por outro meio (a linha de fecho veio depois do aviso). */
  devolvido: boolean;
}

/** A linha que o webhook grava quando um reembolso do pedido falha: o mesmo texto de antes, sem mudar uma letra. */
export const linhaDoReembolsoFalho = (f: Pick<ReembolsoFalho, 'id' | 'centavos' | 'voucher' | 'motivo'>): string =>
  `Aviso: o reembolso${f.voucher ? ` do item ${f.voucher}` : ''} de ${cifra(f.centavos)} falhou na Stripe (${f.id}, ${f.motivo}): devolver por outro meio`;

/** O começo das linhas que a equipe grava no painel quando devolveu o dinheiro por outro meio. */
export const DEVOLVIDO_POR_OUTRO_MEIO = 'Devolução por outro meio registrada no painel';

/** A linha que fecha o aviso de um reembolso que falhou: a equipe devolveu esse dinheiro por outro meio. */
export const linhaDaDevolucaoPorOutroMeio = (f: Pick<ReembolsoFalho, 'id' | 'centavos' | 'voucher'>): string =>
  `${DEVOLVIDO_POR_OUTRO_MEIO}: ${cifra(f.centavos)}${f.voucher ? ` do item ${f.voucher}` : ''} (reembolso ${f.id}, que falhou na Stripe)`;

const FALHOU = /^Aviso: o reembolso(?: do item (\S+))? de (.+?) falhou na Stripe \(([^,()]+), (.+)\): devolver por outro meio$/;

/**
 * Os reembolsos do pedido que falharam, na ordem do histórico e um por id, cada um com a marca de já devolvido por
 * outro meio (a linha de fecho do mesmo reembolso, depois do aviso). As linhas da contestação com o reembolso a caminho
 * e da devolução de um pagamento repetido não entram: elas não pedem devolver por fora o dinheiro do pedido.
 */
export function reembolsosFalhos(historico: readonly { evento: string }[]): ReembolsoFalho[] {
  const falhos: ReembolsoFalho[] = [];
  historico.forEach((h, n) => {
    const m = FALHOU.exec(h.evento);
    if (!m || falhos.some((f) => f.id === m[3])) return;
    const fecho = `(reembolso ${m[3]},`;
    const devolvido = historico.slice(n + 1).some((d) => d.evento.startsWith(DEVOLVIDO_POR_OUTRO_MEIO) && d.evento.includes(fecho));
    falhos.push({ id: m[3], centavos: centavosDaCifra(m[2]), ...(m[1] ? { voucher: m[1] } : {}), motivo: m[4], devolvido });
  });
  return falhos;
}

/**
 * A contestação aberta com o reembolso ainda a caminho (failure_reason charge_for_pending_refund_disputed): o banco
 * devolve pela contestação, e devolver também por outro meio pagaria o cliente duas vezes. Fica fora de
 * reembolsosFalhos: nem "pendente" para o cliente, nem registro de devolução por fora.
 */
export const linhaDoReembolsoParadoPelaContestacao = (f: { id: string; centavos: number }): string =>
  `Aviso: o reembolso de ${cifra(f.centavos)} (${f.id}) não foi concluído porque o cliente abriu uma contestação no banco: não devolver por outro meio; aceitar ou responder a contestação no painel da Stripe`;

/**
 * A devolução de um pagamento repetido (outro pi_ do mesmo pedido, que o webhook devolve sozinho) que falhou: não é
 * dinheiro do pedido. Fica fora de reembolsosFalhos e das partes do reembolso do pedido.
 */
export const linhaDaDevolucaoRepetidaQueFalhou = (f: { id: string; centavos: number; pagamento: string; motivo: string }): string =>
  `Aviso: a devolução do pagamento repetido ${f.pagamento} (${cifra(f.centavos)}) falhou na Stripe (${f.id}, ${f.motivo}): devolver por outro meio`;

/* ------------------------------------------------------------------ */
/* O voucher devolvido por outro meio                                  */

/**
 * A linha de um voucher devolvido por outro meio no painel, depois de um reembolso que falhou (a Stripe não aceita
 * outro): o valor entra no que voltou ao cliente, por outro meio.
 */
export const linhaDoVoucherDevolvidoPorOutroMeio = (voucher: string, centavos: number): string =>
  `${DEVOLVIDO_POR_OUTRO_MEIO}: ${cifra(centavos)} do item ${voucher}`;

const VOUCHER_POR_FORA = new RegExp(`^${DEVOLVIDO_POR_OUTRO_MEIO}: (.+?) do item (\\S+)$`);

/** Os vouchers devolvidos por outro meio no painel, um por voucher (no banco a mesma linha pode voltar repetida). */
export function vouchersDevolvidosPorOutroMeio(historico: readonly { evento: string }[]): { voucher: string; centavos: number }[] {
  const lista: { voucher: string; centavos: number }[] = [];
  for (const h of historico) {
    const m = VOUCHER_POR_FORA.exec(h.evento);
    if (m && !lista.some((v) => v.voucher === m[2])) lista.push({ voucher: m[2], centavos: centavosDaCifra(m[1]) });
  }
  return lista;
}

/* ------------------------------------------------------------------ */
/* As partes do que voltou ao cliente                                  */

/** As três partes do que voltou, ou falta voltar, para o cliente. */
export interface PartesDoReembolso {
  /** Pela mesma forma de pagamento. */
  originalCentavos: number;
  /** A Stripe não conseguiu devolver e a equipe ainda não registrou a devolução por outro meio. */
  pendenteCentavos: number;
  /** A equipe registrou a devolução por outro meio. */
  outroMeioCentavos: number;
}

/**
 * Divide o que o pedido registra como devolvido (reembolsoCentavos: o que saiu ou tem de sair para o cliente; um
 * reembolso que falha continua contado) nas três partes. Por outro meio: os reembolsos falhos já devolvidos e os
 * vouchers devolvidos por fora, uma vez por voucher. Nunca negativo.
 */
export function partesDoReembolso(
  reembolsoCentavos: number,
  falhos: readonly Pick<ReembolsoFalho, 'centavos' | 'devolvido'>[],
  porFora: readonly { voucher: string; centavos: number }[] = [],
): PartesDoReembolso {
  const soma = (lista: readonly { centavos: number }[]) => lista.reduce((s, f) => s + f.centavos, 0);
  const vouchers = porFora.filter((v, n) => porFora.findIndex((o) => o.voucher === v.voucher) === n);
  const pendenteCentavos = soma(falhos.filter((f) => !f.devolvido));
  const outroMeioCentavos = soma(falhos.filter((f) => f.devolvido)) + soma(vouchers);
  return {
    originalCentavos: Math.max(0, reembolsoCentavos - pendenteCentavos - outroMeioCentavos),
    pendenteCentavos,
    outroMeioCentavos,
  };
}

/* ------------------------------------------------------------------ */
/* O reembolso de parte feito direto na Stripe, sem voucher            */

/** Um reembolso de parte de um pedido com vários itens feito direto na Stripe, sem dizer de qual voucher. */
export interface ReembolsoSemVoucher {
  id: string;
  centavos: number;
  /** A equipe já disse no painel de qual voucher foi (ou que foi um desconto), ou o pedido foi reembolsado inteiro. */
  resolvido: boolean;
}

/** A linha que o webhook grava (charge.refunded): nenhum voucher muda sozinho. */
export const linhaDoReembolsoSemVoucher = (f: Pick<ReembolsoSemVoucher, 'id' | 'centavos'>): string =>
  `Aviso: ${cifra(f.centavos)} devolvidos direto na Stripe (${f.id}), sem dizer de qual voucher: marcar no painel o voucher devolvido, ou anotar que nenhum voucher muda`;

/** O começo das duas linhas do painel que resolvem o aviso de um reembolso sem voucher. */
export const inicioDoReembolsoResolvido = (id: string): string => `Reembolso ${id} da Stripe`;
export const linhaDoVoucherLigado = (id: string, voucher: string): string =>
  `${inicioDoReembolsoResolvido(id)} ligado ao voucher ${voucher} no painel: o voucher deixa de valer, sem novo reembolso`;
export const linhaDoReembolsoSemMudarVoucher = (id: string): string =>
  `${inicioDoReembolsoResolvido(id)} anotado no painel como desconto: nenhum voucher muda`;

/** O começo da linha do reembolso do pedido inteiro: depois dele não há voucher para escolher. */
const REEMBOLSO_TOTAL = 'Reembolso total (';

const SEM_VOUCHER = /^Aviso: (.+?) devolvidos direto na Stripe \(([^()]+)\), sem dizer de qual voucher/;

/**
 * Os reembolsos sem voucher, um por id. Resolvido quando QUALQUER linha do histórico começa com
 * inicioDoReembolsoResolvido(id), e não só as que vêm depois do aviso (a linha do voucher ligado vem de atualizar_item,
 * com a hora do banco, e o aviso com a hora do servidor), ou quando o pedido tem a linha do reembolso total.
 */
export function reembolsosSemVoucher(historico: readonly { evento: string }[]): ReembolsoSemVoucher[] {
  const total = historico.some((h) => h.evento.startsWith(REEMBOLSO_TOTAL));
  const lista: ReembolsoSemVoucher[] = [];
  for (const h of historico) {
    const m = SEM_VOUCHER.exec(h.evento);
    if (!m || lista.some((s) => s.id === m[2])) continue;
    const inicio = inicioDoReembolsoResolvido(m[2]);
    lista.push({ id: m[2], centavos: centavosDaCifra(m[1]), resolvido: total || historico.some((d) => d.evento.startsWith(inicio)) });
  }
  return lista;
}

/* ------------------------------------------------------------------ */

/**
 * A linha `indice` do histórico é um aviso de reembolso que já foi fechado? true: o reembolso falho já devolvido por
 * outro meio, ou o reembolso sem voucher já resolvido; false: ainda pede uma ação da equipe; null: não é um desses
 * dois avisos (as outras linhas, inclusive a da contestação com o reembolso a caminho e a do pagamento repetido).
 */
export function avisoDeReembolsoFechado(historico: readonly { evento: string }[], indice: number): boolean | null {
  const linha = historico[indice]?.evento;
  if (linha === undefined) return null;
  const falho = FALHOU.exec(linha);
  if (falho) return reembolsosFalhos(historico).find((f) => f.id === falho[3])?.devolvido ?? false;
  const semVoucher = SEM_VOUCHER.exec(linha);
  if (semVoucher) return reembolsosSemVoucher(historico).find((s) => s.id === semVoucher[2])?.resolvido ?? false;
  return null;
}
