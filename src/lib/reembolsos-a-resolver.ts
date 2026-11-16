// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { formatarCifra } from './cifra.ts';

/**
 * Os reembolsos que pedem uma ação da equipe, contados pelo histórico do pedido: sem coluna nova nem migração (o
 * histórico existe igual no banco, pedidos_historico, e nos arquivos do computador). Como na desistência
 * (src/lib/desistencia.ts), a pendência é uma linha "Aviso:" que o webhook da Stripe grava, e uma linha posterior a
 * fecha. Aqui ficam as frases (quem grava e quem lê usam as mesmas) e a leitura delas, sem rede nem banco
 * (tests/reembolsos-a-resolver.test.ts):
 * - o reembolso que a Stripe não conseguiu concluir (refund.failed): o valor e o voucher saem da própria linha, e uma
 *   contestação aberta ou perdida depois dela suspende ou fecha a devolução por outro meio (o cliente não recebe duas vezes);
 * - o reembolso de parte de um pedido com vários itens feito direto na Stripe, sem dizer de qual voucher;
 * - as três partes do que voltou ao cliente: pela mesma forma de pagamento, pendente e por outro meio, como a equipe lê
 *   e como o cliente lê (partesDoReembolso), e o que diz respeito a cada página do cliente (partesDaPagina).
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
  /**
   * Uma contestação do pagamento do pedido nas linhas DEPOIS da falha (só na falha ainda não devolvida por outro meio):
   * 'aberta' enquanto a contestação aberta depois da falha não termina, e aí a equipe não devolve por fora agora (o
   * banco pode devolver pela contestação, e o cliente receberia duas vezes); 'perdida' quando o banco já devolveu ao
   * cliente, e aí não sobra nada a devolver. Ganha, evitada ou o alerta encerrado sem disputa: o dinheiro ficou com a
   * empresa, e a falha volta a pedir a devolução por outro meio (sem o campo).
   */
  contestacao?: 'aberta' | 'perdida';
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

/*
 * As linhas que o webhook grava para uma contestação (leituraDaContestacao e aplicarContestacao, em
 * src/app/api/webhooks/stripe/eventos.ts; tests/reembolsos-a-resolver.test.ts confere com as de verdade): a aberta (também
 * o pedido de informação do banco) e o fim, ganha, perdida, evitada ou o alerta encerrado sem disputa. A contestação de
 * outro pagamento do mesmo pedido termina com "(pagamento repetido pi_…)" e não conta: ela não devolve o dinheiro do pedido.
 */
const CONTESTACAO_ABERTA = /^Contestação aberta na Stripe \(([^()\s]+)\): /;
const CONTESTACAO_TERMINADA = /^(?:Contestação (\S+) (ganha|perdida|evitada)\b|Alerta de contestação (\S+) encerrado\b)/;
const DE_OUTRO_PAGAMENTO = /\(pagamento repetido [^()\s]+\)$/;

/**
 * O que as linhas de contestação DEPOIS da falha dizem dela: 'perdida' (o banco devolveu ao cliente), 'aberta' (uma
 * contestação aberta depois da falha que ainda não terminou) ou nada. Uma linha gravada antes da falha não conta.
 */
function contestacaoDepoisDaFalha(depois: readonly { evento: string }[]): ReembolsoFalho['contestacao'] {
  const abertas = new Set<string>();
  for (const { evento } of depois) {
    if (DE_OUTRO_PAGAMENTO.test(evento)) continue;
    const aberta = CONTESTACAO_ABERTA.exec(evento);
    if (aberta) {
      abertas.add(aberta[1]);
      continue;
    }
    const fim = CONTESTACAO_TERMINADA.exec(evento);
    if (!fim) continue;
    // o banco já devolveu ao cliente pela contestação: devolver também por outro meio pagaria duas vezes
    if (fim[2] === 'perdida') return 'perdida';
    // ganha, evitada ou encerrada sem disputa: o dinheiro ficou com a empresa
    abertas.delete(fim[1] ?? fim[3]);
  }
  return abertas.size ? 'aberta' : undefined;
}

/**
 * Os reembolsos do pedido que falharam, na ordem do histórico e um por id, cada um com a marca de já devolvido por
 * outro meio (a linha de fecho do mesmo reembolso, depois do aviso) e, se ainda não foi devolvido, a contestação aberta
 * ou perdida depois dele. As linhas da contestação com o reembolso a caminho e da devolução de um pagamento repetido
 * não entram: elas não pedem devolver por fora o dinheiro do pedido.
 */
export function reembolsosFalhos(historico: readonly { evento: string }[]): ReembolsoFalho[] {
  const falhos: ReembolsoFalho[] = [];
  historico.forEach((h, n) => {
    const m = FALHOU.exec(h.evento);
    if (!m || falhos.some((f) => f.id === m[3])) return;
    const depois = historico.slice(n + 1);
    const fecho = `(reembolso ${m[3]},`;
    const devolvido = depois.some((d) => d.evento.startsWith(DEVOLVIDO_POR_OUTRO_MEIO) && d.evento.includes(fecho));
    // a devolução que a equipe já registrou vale sobre a contestação: o dinheiro já saiu por outro meio
    const contestacao = devolvido ? undefined : contestacaoDepoisDaFalha(depois);
    falhos.push({
      id: m[3],
      centavos: centavosDaCifra(m[2]),
      ...(m[1] ? { voucher: m[1] } : {}),
      motivo: m[4],
      devolvido,
      ...(contestacao ? { contestacao } : {}),
    });
  });
  return falhos;
}

/**
 * A falha que a equipe ainda tem de devolver por outro meio: nem devolvida, nem com uma contestação aberta ou perdida
 * depois dela. Só ela pede a faixa, a frase vermelha, o "Falta devolver", o botão de registrar e o e-mail com o
 * "devolva por outro meio" (src/lib/pedidos-painel.ts).
 */
export const falhaADevolverPorOutroMeio = (f: Pick<ReembolsoFalho, 'devolvido' | 'contestacao'>): boolean => !f.devolvido && !f.contestacao;

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

/** Quem lê as partes do reembolso: a equipe (o painel) ou o cliente (as páginas do pedido e do voucher). */
export type LeitorDoReembolso = 'equipe' | 'cliente';

/**
 * Divide o que o pedido registra como devolvido (reembolsoCentavos: o que saiu ou tem de sair para o cliente; um
 * reembolso que falha continua contado) nas três partes. Por outro meio: os reembolsos falhos já devolvidos e os
 * vouchers devolvidos por fora, uma vez por voucher. Nunca negativo. A falha com uma contestação depois dela: para a
 * equipe, nunca é pendente (aberta, não se devolve por fora agora, como no reembolso parado pela contestação; perdida, o
 * banco já devolveu); para o cliente, só a perdida sai do pendente (o banco devolveu a ele) e a aberta continua
 * pendente, porque ele nunca lê que o dinheiro voltou quando não voltou.
 */
export function partesDoReembolso(
  reembolsoCentavos: number,
  falhos: readonly Pick<ReembolsoFalho, 'centavos' | 'devolvido' | 'contestacao'>[],
  porFora: readonly { voucher: string; centavos: number }[] = [],
  leitor: LeitorDoReembolso = 'equipe',
): PartesDoReembolso {
  const soma = (lista: readonly { centavos: number }[]) => lista.reduce((s, f) => s + f.centavos, 0);
  const vouchers = porFora.filter((v, n) => porFora.findIndex((o) => o.voucher === v.voucher) === n);
  const pendente = (f: Pick<ReembolsoFalho, 'devolvido' | 'contestacao'>) =>
    leitor === 'cliente' ? !f.devolvido && f.contestacao !== 'perdida' : falhaADevolverPorOutroMeio(f);
  const pendenteCentavos = soma(falhos.filter(pendente));
  const outroMeioCentavos = soma(falhos.filter((f) => f.devolvido)) + soma(vouchers);
  return {
    originalCentavos: Math.max(0, reembolsoCentavos - pendenteCentavos - outroMeioCentavos),
    pendenteCentavos,
    outroMeioCentavos,
  };
}

/* ------------------------------------------------------------------ */
/* O que cada página do cliente mostra                                 */

/** Uma página do cliente: a do pedido (ou a do voucher de um pedido de um item só) ou a de um voucher de um pedido com vários itens. */
export interface PaginaDoCliente {
  /** A página é a de um voucher de um pedido com vários itens (o voucher tem `pedido`). */
  voucherDePedido: boolean;
  /** O código do voucher da página (ou o do pedido). */
  codigo: string;
}

/**
 * O que diz respeito à página. Na do voucher de um pedido com vários itens: o que é daquele voucher e o que é do pedido
 * inteiro, sem voucher (a página aberta pelo "Ver o voucher" do e-mail também diz a verdade quando o reembolso do pedido
 * inteiro falha: é o dinheiro do pedido); o reembolso de outro voucher, não. Na do pedido (ou do pedido de um item), tudo.
 */
export function falhasDaPagina<T extends { voucher?: string }>(pagina: PaginaDoCliente, lista: readonly T[]): T[] {
  return pagina.voucherDePedido ? lista.filter((f) => !f.voucher || f.voucher === pagina.codigo) : [...lista];
}

/**
 * As três partes que a página do cliente mostra, lidas como o cliente lê (partesDoReembolso com 'cliente'), só quando um
 * reembolso que falhou na Stripe, ou um voucher devolvido por outro meio, diz respeito à página e muda o que ela diz
 * (algo pendente ou devolvido por outro meio); senão undefined, e a página mostra o texto de sempre. Só os três valores:
 * nunca o id do reembolso nem o motivo. Na página do voucher de um pedido com vários itens, nada do valor devolvido do
 * pedido conta como deste voucher (`originalCentavos` 0).
 */
export function partesDaPagina(
  pagina: PaginaDoCliente,
  reembolsoCentavos: number,
  historico: readonly { evento: string }[],
): PartesDoReembolso | undefined {
  const falhos = falhasDaPagina(pagina, reembolsosFalhos(historico));
  const porFora = falhasDaPagina(pagina, vouchersDevolvidosPorOutroMeio(historico));
  if (!falhos.length && !porFora.length) return undefined;
  const partes = partesDoReembolso(pagina.voucherDePedido ? 0 : reembolsoCentavos, falhos, porFora, 'cliente');
  return partes.pendenteCentavos > 0 || partes.outroMeioCentavos > 0 ? partes : undefined;
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
 * outro meio, ou com uma contestação aberta ou perdida depois dele (a linha diz "devolver por outro meio", e agora não
 * se devolve: o painel mostra no pedido a frase do reembolso parado pela contestação), ou o reembolso sem voucher já
 * resolvido; false: ainda pede uma ação da equipe; null: não é um desses dois avisos (as outras linhas, inclusive a da
 * contestação com o reembolso a caminho e a do pagamento repetido).
 */
export function avisoDeReembolsoFechado(historico: readonly { evento: string }[], indice: number): boolean | null {
  const linha = historico[indice]?.evento;
  if (linha === undefined) return null;
  const falho = FALHOU.exec(linha);
  if (falho) {
    const f = reembolsosFalhos(historico).find((x) => x.id === falho[3]);
    return f ? !falhaADevolverPorOutroMeio(f) : false;
  }
  const semVoucher = SEM_VOUCHER.exec(linha);
  if (semVoucher) return reembolsosSemVoucher(historico).find((s) => s.id === semVoucher[2])?.resolvido ?? false;
  return null;
}
