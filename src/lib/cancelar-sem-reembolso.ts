// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { AVISO_DESISTENCIA, dentroDoArrependimento } from './desistencia.ts';
import { segundosAteOInicio, type ItemAgendado } from './formas-pagamento.ts';
import { hojeEmBuzios } from './validacao.ts';
import { agruparPedidos, provedorDaReserva, reembolsoParaResolver, voucherAtivo, voucherPago, type ErroDoPainel } from './pedidos-painel.ts';
import { reembolsosFalhos } from './reembolsos-a-resolver.ts';
import type { Reserva } from './reservas';
import {
  cancelamentoDoVoucher,
  cancelamentosSemReembolso,
  ehMotivoSemReembolso,
  limparTextoDoMotivo,
  MOTIVOS_SEM_REEMBOLSO,
  type CancelamentoSemReembolso,
  type MotivoSemReembolso,
} from './sem-reembolso.ts';

/**
 * As regras do "Cancelar sem reembolso…" do painel (Pacote 33; FASE-5, Etapa 2, passos 2 e 3 do plano de 25/11), sem rede
 * nem banco, para os testes rodarem em node. Quem desenha a tela de resumo é src/lib/resumo-do-painel.ts e
 * src/app/admin/resumo/[codigo]/page.tsx; quem grava é a rota do painel (src/app/api/admin/reservas/[codigo]/route.ts),
 * pelas MESMAS regras daqui, conferidas de novo dentro da trava de versão do pedido. Nada aqui devolve dinheiro: nenhuma
 * chamada à Stripe, e o caminho do dinheiro de sempre (o "com reembolso") não muda.
 * - O que vale: o pedido pago pela Stripe, sem contestação, sem reembolso a resolver (o que falhou, o feito direto na
 *   Stripe sem voucher, o parado por uma contestação) e sem reembolso pedido à Stripe ainda sem a confirmação dela (o
 *   e-mail "sem reembolso" não pode sair num pedido cujo dinheiro está voltando). O pedido inteiro cancela todos os
 *   vouchers que ainda valem; um voucher só, num pedido com vários itens, cancela só ele (os outros continuam valendo).
 * - Como grava: o pedido continua 'pago' e cada voucher vira 'cancelado'; o motivo fica no JSON do pagamento
 *   (src/lib/sem-reembolso.ts).
 * - A trava da lei (art. 49 do Código de Defesa do Consumidor): a compra feita há até 7 dias, contados do pagamento como na
 *   desistência pelo site (dentroDoArrependimento, src/lib/desistencia.ts), com o serviço ainda por começar: o aviso
 *   vermelho de que o cliente tem direito ao dinheiro de volta e a segunda caixa, "Estou ciente". Também depois do 7º dia,
 *   quando o cliente já pediu a desistência pelo site dentro dos 7 dias (o direito exercido no prazo: travaPelaDesistencia),
 *   respondida ou não. A mesma trava vale no botão "Desistência respondida, sem reembolso" quando a desistência chegou
 *   dentro dos 7 dias (travaDaDesistencia).
 * - O motivo combina com a data do serviço (motivosQueCombinam): "não compareceu" só depois do início, e "fora da
 *   política" (menos de 24 horas) só a menos de 24 horas do início ou depois dele.
 * - Na casa de temporada (Etapa 7, pacote 2), a regra é a das casas e não a dos passeios: "fora da política" só com a entrada
 *   a menos de 30 dias (dias de calendário, no horário de Brasília) e fora dos 7 dias do arrependimento, ou com a estadia já
 *   começada; o painel diz o que a regra manda (linhasDaRegraDasCasas), e o histórico, o e-mail e a página do pedido levam o
 *   motivo e a regra das casas. Nada aqui devolve dinheiro: o reembolso continua só pelo "Reembolsar" com o "Confirmo".
 */

export const ACOES_SEM_REEMBOLSO = ['cancelar_sem_reembolso', 'cancelar_item_sem_reembolso'] as const;
export type AcaoSemReembolso = (typeof ACOES_SEM_REEMBOLSO)[number];

/** O que a equipe escolheu: o pedido inteiro, ou um voucher só. */
export type EscolhaDoCancelamento = { acao: 'cancelar_sem_reembolso' } | { acao: 'cancelar_item_sem_reembolso'; voucher: string };

const DIA_MS = 86_400_000;

/** "a, b e c". */
export const emFrase = (itens: readonly string[]): string =>
  itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;

/** Uma data e hora no horário de Brasília, para a equipe: "10/11/2026 14:32". */
const dataHora = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

/* ------------------------------------------------------------------ */
/* A trava dos 7 dias                                                  */

/** A compra, para os 7 dias: o pagamento ou, sem a data dele, a criação do pedido (como na desistência pelo site). */
export const compraDoPedido = (r: Pick<Reserva, 'pagamento' | 'criadaEm'>): string => r.pagamento.pagoEm ?? r.criadaEm;

/**
 * A trava dos 7 dias que vale agora: a data da compra e os dias inteiros desde ela (null quando não dá para ler). Na
 * trava que vem da desistência pedida pelo site (travaPelaDesistencia), `desistenciaEm` é a hora em que ela chegou, e
 * `dias` conta da compra até essa hora.
 */
export interface TravaDosSeteDias {
  compraEm: string;
  dias: number | null;
  desistenciaEm?: string;
}

const diasEntre = (de: string, ate: Date): number | null => {
  const t = Date.parse(de);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((ate.getTime() - t) / DIA_MS));
};

/**
 * A trava da lei no cancelamento sem reembolso: a compra feita há até 7 dias (contados do pagamento) e algum dos vouchers
 * a cancelar ainda por começar. Na dúvida, avisa: a data da compra que não dá para ler e o início que não dá para ler
 * (segundosAteOInicio devolve NaN) contam como dentro e por começar. null: sem trava (fora dos 7 dias, ou tudo já começou).
 */
export function travaDosSeteDias(
  r: Pick<Reserva, 'pagamento' | 'criadaEm'>,
  aCancelar: readonly ItemAgendado[],
  agora: Date,
): TravaDosSeteDias | null {
  const compraEm = compraDoPedido(r);
  if (dentroDoArrependimento(compraEm, agora) === false) return null;
  if (!aCancelar.some((v) => !(segundosAteOInicio(v, agora) <= 0))) return null;
  return { compraEm, dias: diasEntre(compraEm, agora) };
}

/**
 * A trava que vem do pedido de desistência pelo site (o link "Desistir da compra"): ele chegou dentro dos 7 dias da compra,
 * ou seja, o cliente exerceu o direito do art. 49 no prazo. Vale mesmo depois do 7º dia e com uma parte do pedido já
 * devolvida, respondido ou não: o cancelamento sem reembolso que vem depois nega um direito já pedido. O link "Desistir da
 * compra" só aparece antes do serviço, então o serviço ainda não tinha começado quando ela chegou. Na dúvida (a data que
 * não dá para ler), avisa. `dias`: os dias inteiros entre a compra e a chegada da desistência; `desistenciaEm`: a chegada.
 */
export function travaPelaDesistencia(r: Pick<Reserva, 'pagamento' | 'criadaEm' | 'historico'>): TravaDosSeteDias | null {
  const linha = r.historico.find((h) => h.evento.startsWith(AVISO_DESISTENCIA));
  if (!linha) return null;
  const compraEm = compraDoPedido(r);
  const chegou = new Date(linha.em);
  if (dentroDoArrependimento(compraEm, chegou) === false) return null;
  return { compraEm, dias: Number.isNaN(chegou.getTime()) ? null : diasEntre(compraEm, chegou), desistenciaEm: linha.em };
}

/**
 * A mesma trava no botão "Desistência respondida, sem reembolso" (o pedido de desistência pelo site respondido sem
 * devolver nada): a desistência chegou dentro dos 7 dias da compra (travaPelaDesistencia). Só no "sem reembolso" (nada
 * devolvido do pedido): o outro rótulo do botão ("o resto do pedido segue pago") é o da desistência de uma parte, já
 * reembolsada.
 */
export function travaDaDesistencia(r: Pick<Reserva, 'pagamento' | 'criadaEm' | 'historico' | 'reembolsoCentavos'>): TravaDosSeteDias | null {
  return (r.reembolsoCentavos ?? 0) > 0 ? null : travaPelaDesistencia(r);
}

const haDias = (dias: number | null): string =>
  dias === null ? '' : dias === 0 ? ', há menos de 1 dia' : dias === 1 ? ', há 1 dia' : `, há ${dias} dias`;

/** A data e a hora de Brasília, ou o aviso de que ela não dá para ler (nunca o erro do formatador). */
const quando = (iso: string): string => (Number.isNaN(Date.parse(iso)) ? 'data que não dá para ler' : dataHora(iso));

/**
 * O aviso vermelho da tela de resumo do "Cancelar sem reembolso…": a compra dentro dos 7 dias com o serviço por começar,
 * ou a desistência pedida pelo site dentro dos 7 dias (com as duas datas: depois do 7º dia, "paga há 9 dias" ao lado de
 * "dentro dos 7 dias" confundiria).
 */
export const avisoDosSeteDias = (t: TravaDosSeteDias): string =>
  t.desistenciaEm !== undefined
    ? `Atenção: a desistência que o cliente pediu pelo site chegou dentro dos 7 dias do arrependimento (compra paga em ${quando(t.compraEm)}, ` +
      `desistência em ${quando(t.desistenciaEm)}; art. 49 do Código de Defesa do Consumidor), antes do serviço: o cliente tem direito ao ` +
      'dinheiro de volta. Você pode seguir sem reembolso, mas precisa marcar também "Estou ciente", e o histórico do pedido registra que o ' +
      'painel avisou.'
    : `Atenção: esta compra foi paga em ${quando(t.compraEm)}${haDias(t.dias)}, e o serviço ainda não começou. Dentro dos 7 dias do ` +
      'arrependimento (art. 49 do Código de Defesa do Consumidor), o cliente tem direito ao dinheiro de volta. Você pode seguir sem ' +
      'reembolso, mas precisa marcar também "Estou ciente", e o histórico do pedido registra que o painel avisou.';

/** O aviso vermelho do botão "Desistência respondida, sem reembolso" no cartão do pedido. */
export const avisoDaDesistenciaNosSeteDias = (t: TravaDosSeteDias): string =>
  `Atenção: esta desistência chegou dentro dos 7 dias do arrependimento (compra paga em ${quando(t.compraEm)}; art. 49 do ` +
  'Código de Defesa do Consumidor), antes do serviço: o cliente tem direito ao dinheiro de volta. Para responder sem reembolso, ' +
  'marque "Estou ciente"; o histórico do pedido registra que o painel avisou.';

/** A segunda caixa, a da trava (nome do campo: `ciente`). */
export const CIENTE_DOS_SETE_DIAS =
  'Estou ciente: dentro dos 7 dias do arrependimento, o cliente tem direito ao dinheiro de volta, e mesmo assim sigo sem reembolso.';

/** O começo da linha do histórico que registra que o painel avisou da trava e a equipe seguiu. Não começa com "Aviso:". */
export const INICIO_DA_TRAVA_DOS_SETE_DIAS = 'Trava dos 7 dias';

/**
 * A linha do histórico da trava: o painel avisou que o cliente tem direito ao dinheiro de volta, e a equipe seguiu. No
 * cancelamento sem reembolso pela trava da desistência pedida pelo site (`desistenciaEm`), as duas datas.
 */
export function linhaDaTravaDosSeteDias(t: TravaDosSeteDias, onde: 'cancelamento' | 'desistencia'): string {
  if (onde === 'cancelamento' && t.desistenciaEm !== undefined) {
    return (
      `${INICIO_DA_TRAVA_DOS_SETE_DIAS}: o painel avisou que a desistência pedida pelo site chegou dentro dos 7 dias do arrependimento ` +
      `(compra paga em ${quando(t.compraEm)}, desistência em ${quando(t.desistenciaEm)}), antes do serviço, e que o cliente tem direito ao ` +
      'dinheiro de volta; a equipe marcou "Estou ciente" e seguiu com o cancelamento sem reembolso'
    );
  }
  const oQue =
    onde === 'desistencia' ? 'a desistência chegou dentro dos 7 dias do arrependimento' : 'a compra está dentro dos 7 dias do arrependimento';
  const seguiu = onde === 'desistencia' ? 'respondeu sem reembolso' : 'seguiu com o cancelamento sem reembolso';
  return `${INICIO_DA_TRAVA_DOS_SETE_DIAS}: o painel avisou que ${oQue} (paga em ${quando(t.compraEm)}), com o serviço ainda por começar, e que o cliente tem direito ao dinheiro de volta; a equipe marcou "Estou ciente" e ${seguiu}`;
}

/* ------------------------------------------------------------------ */
/* O que vale                                                          */

const SOLICITADO_TOTAL = /^Reembolso total \(.+?\) solicitado na Stripe \(([^()]+)\):/;
const SOLICITADO_DO_ITEM = /^Reembolso do item (\S+) \(.+?\) solicitado na Stripe \(([^()]+)\):/;

/**
 * O pedido tem um reembolso que o painel pediu à Stripe (as linhas linhaDoReembolsoSolicitado) e que ainda não foi
 * confirmado: o "Reembolsar tudo" com o pedido ainda pago, ou o "Reembolsar só o voucher …" com o voucher ainda valendo. O
 * que falhou ou foi cancelado na Stripe não conta. Enquanto houver um, nada de "sem reembolso": o dinheiro está voltando.
 */
export function reembolsoACaminhoDoSite(
  r: Pick<Reserva, 'status' | 'historico'>,
  vouchers: readonly Pick<Reserva, 'codigo' | 'statusItem'>[],
): boolean {
  const falhos = new Set(reembolsosFalhos(r.historico).map((f) => f.id));
  const cancelado = (id: string) => r.historico.some((h) => h.evento.startsWith(`Reembolso cancelado na Stripe (reembolso ${id},`));
  const valendo = (id: string) => !falhos.has(id) && !cancelado(id);
  return r.historico.some((h) => {
    const total = SOLICITADO_TOTAL.exec(h.evento);
    if (total) return r.status === 'pago' && valendo(total[1]);
    const doItem = SOLICITADO_DO_ITEM.exec(h.evento);
    return Boolean(doItem && valendo(doItem[2]) && vouchers.some((v) => v.codigo === doItem[1] && voucherAtivo(v)));
  });
}

/** O plano do cancelamento: os vouchers que deixam de valer e a trava dos 7 dias; ou o erro do painel. */
export type PlanoDoCancelamento =
  | { ok: true; cancelar: Reserva[]; trava: TravaDosSeteDias | null }
  | { ok: false; erro: ErroDoPainel };

/**
 * A regra única do "Cancelar sem reembolso…": o cartão do pedido mostra o botão por ela, a tela de resumo mostra as
 * opções por ela e a rota confere de novo, antes e dentro da trava de versão. Recebe os vouchers do pedido (o primeiro
 * representa o pedido: status, pagamento e histórico). O pedido inteiro cancela todos os vouchers que ainda valem (nem
 * usados, nem cancelados, nem reembolsados); um voucher só vale num pedido com vários itens, e só o voucher que ainda
 * vale. A trava: a da compra dentro dos 7 dias com o serviço por começar ou, sem ela, a da desistência pedida pelo site
 * dentro dos 7 dias (travaPelaDesistencia), que vale também depois do 7º dia.
 */
export function planoDoCancelamento(vouchers: readonly Reserva[], escolha: EscolhaDoCancelamento, agora: Date): PlanoDoCancelamento {
  const r = vouchers[0];
  if (!r) return { ok: false, erro: 'nao-encontrado' };
  if (provedorDaReserva(r) !== 'stripe' || !r.paymentIntentId || r.status !== 'pago') return { ok: false, erro: 'cancelamento-nao-vale' };
  const pedido = agruparPedidos([...vouchers])[0];
  if (pedido && reembolsoParaResolver(pedido)) return { ok: false, erro: 'reembolso-a-resolver' };
  if (reembolsoACaminhoDoSite(r, vouchers)) return { ok: false, erro: 'reembolso-a-caminho' };
  let cancelar: Reserva[];
  if (escolha.acao === 'cancelar_item_sem_reembolso') {
    const item = vouchers.find((v) => v.codigo === escolha.voucher);
    if (!item) return { ok: false, erro: 'voucher-de-fora' };
    if (vouchers.length < 2) return { ok: false, erro: 'cancelamento-nao-vale' };
    if (!voucherAtivo(item)) return { ok: false, erro: 'item-ja-devolvido' };
    cancelar = [item];
  } else {
    cancelar = vouchers.filter(voucherAtivo);
    if (!cancelar.length) return { ok: false, erro: 'nada-a-cancelar' };
  }
  return { ok: true, cancelar, trava: travaDosSeteDias(r, cancelar, agora) ?? travaPelaDesistencia(r) };
}

/**
 * As opções da tela de resumo: o pedido inteiro e, num pedido com vários itens em que ainda valem dois vouchers ou mais,
 * cada voucher que ainda vale (com um voucher só valendo, "o pedido inteiro" e "só o voucher" fariam o mesmo). Nenhuma,
 * quando a regra não deixa cancelar.
 */
export function escolhasDoCancelamento(vouchers: readonly Reserva[], agora: Date): EscolhaDoCancelamento[] {
  const tudo: EscolhaDoCancelamento = { acao: 'cancelar_sem_reembolso' };
  const plano = planoDoCancelamento(vouchers, tudo, agora);
  if (!plano.ok) return [];
  if (vouchers.length < 2 || plano.cancelar.length < 2) return [tudo];
  return [tudo, ...plano.cancelar.map((v): EscolhaDoCancelamento => ({ acao: 'cancelar_item_sem_reembolso', voucher: v.codigo }))];
}

/* ------------------------------------------------------------------ */
/* O motivo                                                            */

/** O motivo como o painel escreve na escolha da tela de resumo (nos passeios e no transfer). */
export const ROTULO_DO_MOTIVO: Record<MotivoSemReembolso, string> = {
  'fora-da-politica': 'Fora da política: o cancelamento foi pedido com menos de 24 horas de antecedência',
  'nao-compareceu': 'Não compareceu no horário e no local combinados',
  outro: 'Outro motivo (escreva abaixo)',
};

/* ------------------------------------------------------------------ */
/* A regra das casas (Etapa 7, pacote 2)                               */

/**
 * Qual política de cancelamento vale para os vouchers a cancelar: a dos passeios e do transfer (24 horas, item 6 da
 * política), a das casas de temporada (30 dias e os 7 dias do arrependimento: CANCELAMENTO_DAS_CASAS, src/data/regras-casas.ts)
 * ou as duas (o pedido inteiro com casa e passeio). Decidida pelos vouchers, nunca guardada: o voucher não muda de tipo.
 */
export type RegraDoCancelamento = 'passeios' | 'casas' | 'as-duas';

export function regraDosVouchers(vouchers: readonly Pick<ItemAgendado, 'tipo'>[]): RegraDoCancelamento {
  const casas = vouchers.filter((v) => v.tipo === 'casa').length;
  if (!casas) return 'passeios';
  return casas === vouchers.length ? 'casas' : 'as-duas';
}

/** Até quantos dias antes da entrada a casa se cancela com o sinal de volta (decisão do dono de 25/11/2026). */
export const ANTECEDENCIA_DAS_CASAS_DIAS = 30;

/**
 * Os dias de calendário de hoje até a entrada na casa, pelas datas no horário de Brasília (o de Búzios): a conta da regra dos
 * 30 dias. Hoje 26/11 e a entrada 26/12: 30 dias (ainda devolve o sinal); a entrada 25/12: 29 dias. Negativo depois da
 * entrada; NaN quando a data não dá para ler.
 */
export function diasAteAEntrada(entrada: string, agora: Date): number {
  const hoje = Date.parse(`${hojeEmBuzios(agora)}T12:00:00Z`);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(entrada) ? Date.parse(`${entrada}T12:00:00Z`) : Number.NaN;
  return Math.round((dia - hoje) / DIA_MS);
}

/** O voucher como a regra do motivo lê: quando começa e, na casa, a compra (os 7 dias do arrependimento). */
export type ItemDoMotivo = ItemAgendado & Partial<Pick<Reserva, 'pagamento' | 'criadaEm'>>;

/**
 * "Fora da política" combina com esta casa: a entrada é daqui a menos de 30 dias (ou a estadia já começou) e a compra não
 * está dentro dos 7 dias do arrependimento com a estadia ainda por começar (aí a devolução é total). Na dúvida (a data que
 * não dá para ler), deixa passar, como nos passeios.
 */
function foraDaPoliticaDaCasa(v: ItemDoMotivo, agora: Date): boolean {
  const comecou = segundosAteOInicio(v, agora) <= 0;
  if (comecou) return true;
  const dias = diasAteAEntrada(v.data, agora);
  if (dias >= ANTECEDENCIA_DAS_CASAS_DIAS) return false;
  const compra = v.pagamento ? compraDoPedido({ pagamento: v.pagamento, criadaEm: v.criadaEm ?? '' }) : undefined;
  return dentroDoArrependimento(compra, agora) !== true;
}

/** O motivo como o painel escreve, com a regra que vale para os vouchers a cancelar (a das casas, a dos passeios ou as duas). */
export function rotuloDoMotivo(m: MotivoSemReembolso, regra: RegraDoCancelamento): string {
  if (m !== 'fora-da-politica' || regra === 'passeios') return ROTULO_DO_MOTIVO[m];
  return regra === 'casas'
    ? 'Fora da política: o cancelamento foi pedido a menos de 30 dias da entrada na casa, fora dos 7 dias da compra'
    : 'Fora da política: no passeio, com menos de 24 horas de antecedência; na casa, a menos de 30 dias da entrada, fora dos 7 dias da compra';
}

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * A linha da tela de resumo do "Cancelar sem reembolso…" que diz à equipe o que a regra das casas manda agora, uma por casa
 * a cancelar, e de quando a conta é feita (crítica de 26/11, furo 16): os dias de calendário até a entrada, contados de hoje,
 * no horário de Brasília. Se o cliente pediu antes, vale o dia da mensagem dele (item 8 da política). Ela não decide nada:
 * quem decide é a equipe, e só "Outro motivo" fica quando a regra manda devolver.
 */
export function linhasDaRegraDasCasas(aCancelar: readonly (ItemDoMotivo & { codigo?: string })[], agora: Date): string[] {
  const hoje = hojeEmBuzios(agora);
  return aCancelar
    .filter((v) => v.tipo === 'casa')
    .map((v) => {
      const dias = diasAteAEntrada(v.data, agora);
      const quem = v.codigo ? `${v.codigo}: ` : '';
      const conta = `dias de calendário até a entrada (${dataBr(v.data)}), contados de hoje, ${dataBr(hoje)}, no horário de Brasília; se o cliente pediu o cancelamento antes, conte do dia da mensagem dele`;
      if (segundosAteOInicio(v, agora) <= 0) {
        return `${quem}a estadia já começou (entrada em ${dataBr(v.data)} às 15h): pela regra das casas, a agência fica com o sinal e não cobra o restante.`;
      }
      const compra = v.pagamento ? compraDoPedido({ pagamento: v.pagamento, criadaEm: v.criadaEm ?? '' }) : undefined;
      if (dentroDoArrependimento(compra, agora) === true) {
        return `${quem}a compra está dentro dos 7 dias do arrependimento e a entrada ainda não chegou: pela lei e pela regra das casas, a devolução é total (faltam ${dias} dias, ${conta}).`;
      }
      if (Number.isNaN(dias)) return `${quem}não deu para ler a data da entrada: confira a regra das casas no pedido.`;
      const manda =
        dias >= ANTECEDENCIA_DAS_CASAS_DIAS
          ? 'pela regra das casas, o cancelamento devolve o sinal inteiro'
          : 'pela regra das casas, a agência fica com o sinal e não cobra o restante';
      return `${quem}faltam ${dias === 1 ? '1 dia' : `${dias} dias`} para a entrada (${conta}): ${manda}.`;
    });
}

/** O motivo que veio no formulário, ou o erro do painel. O texto só vale (e só é exigido) com "outro". */
export type MotivoDoFormulario = { ok: true; motivo: MotivoSemReembolso; texto?: string } | { ok: false; erro: ErroDoPainel };

export function motivoDoFormulario(motivo: unknown, texto: unknown): MotivoDoFormulario {
  if (!ehMotivoSemReembolso(motivo)) return { ok: false, erro: 'falta-motivo' };
  const limpo = limparTextoDoMotivo(texto);
  if (motivo === 'outro') return limpo ? { ok: true, motivo, texto: limpo } : { ok: false, erro: 'falta-texto-do-motivo' };
  // o texto escrito com outro motivo não vai ao cliente: melhor dizer do que sumir com ele em silêncio
  if (limpo) return { ok: false, erro: 'texto-sem-outro' };
  return { ok: true, motivo };
}

/** A antecedência do item 3 da política de cancelamento (24 horas ou mais: reembolso integral), em segundos. */
const ANTECEDENCIA_DA_POLITICA_S = 24 * 3600;

/**
 * Os motivos que combinam com a data do serviço dos vouchers a cancelar, na ordem do painel: "outro" sempre; "não
 * compareceu" só com todos os serviços já começados; "fora da política" (o cancelamento pedido com menos de 24 horas de
 * antecedência) só com todos começando em menos de 24 horas ou já começados. Com um serviço ainda a 24 horas ou mais,
 * todo pedido de cancelamento feito até agora veio com pelo menos 24 horas de antecedência (o horário da mensagem do
 * cliente é o que conta, item 8 da política), e o item 3 dá reembolso integral: o e-mail diria ao cliente um motivo
 * impossível. O início que não dá para ler (segundosAteOInicio devolve NaN) deixa passar. A tela mostra só estes, e a rota
 * confere de novo (motivo-fora-da-data).
 * Na casa de temporada (Etapa 7, pacote 2), "fora da política" segue a regra das casas e não a das 24 horas: só com a
 * entrada a menos de 30 dias (dias de calendário, no horário de Brasília) e fora dos 7 dias do arrependimento, ou com a
 * estadia já começada (foraDaPoliticaDaCasa). Com a entrada a 30 dias ou mais, todo pedido feito até agora veio com essa
 * antecedência, e a regra devolve o sinal; dentro dos 7 dias da compra, antes da entrada, a devolução é total.
 */
export function motivosQueCombinam(aCancelar: readonly ItemDoMotivo[], agora: Date): MotivoSemReembolso[] {
  const faltam = aCancelar.map((v) => segundosAteOInicio(v, agora));
  return MOTIVOS_SEM_REEMBOLSO.filter((m) =>
    m === 'nao-compareceu'
      ? faltam.every((s) => !(s > 0))
      : m === 'fora-da-politica'
        ? aCancelar.every((v, i) => (v.tipo === 'casa' ? foraDaPoliticaDaCasa(v, agora) : !(faltam[i] >= ANTECEDENCIA_DA_POLITICA_S)))
        : true,
  );
}

export const motivoCombinaComAData = (motivo: MotivoSemReembolso, aCancelar: readonly ItemDoMotivo[], agora: Date): boolean =>
  motivosQueCombinam(aCancelar, agora).includes(motivo);

/**
 * A frase da tela de resumo quando algum motivo da política não aparece (a data do serviço não deixa), para a equipe
 * entender por que a lista é mais curta; undefined quando os três aparecem. Na casa, a regra das casas (30 dias e os 7 dias).
 */
export function motivosQueNaoAparecem(valem: readonly MotivoSemReembolso[], regra: RegraDoCancelamento = 'passeios'): string | undefined {
  if (!valem.includes('fora-da-politica')) {
    if (regra === 'casas') {
      return '"Fora da política" e "Não compareceu" não aparecem: a entrada na casa é daqui a 30 dias ou mais, ou a compra ainda está dentro dos 7 dias do arrependimento, e, pela regra das casas, o cancelamento nesses casos devolve o sinal inteiro.';
    }
    if (regra === 'as-duas') {
      return '"Fora da política" e "Não compareceu" não aparecem: algum serviço ainda começa daqui a 24 horas ou mais, ou a entrada na casa é daqui a 30 dias ou mais (ou a compra ainda está dentro dos 7 dias do arrependimento), e, pela política, o cancelamento nesses casos tem reembolso.';
    }
    return '"Fora da política" e "Não compareceu" não aparecem: o serviço ainda começa daqui a 24 horas ou mais, e, pela política (item 3), o cancelamento pedido com 24 horas ou mais de antecedência tem reembolso integral.';
  }
  if (!valem.includes('nao-compareceu')) return '"Não compareceu" só aparece depois do horário de início do serviço.';
  return undefined;
}

/** As frases do motivo e da regra que as páginas do cliente usam (as chaves pedido.motivo* e pedido.regra* do dicionário). */
export type TextosDoMotivo = Record<
  | 'motivoForaDaPolitica'
  | 'motivoForaDaPoliticaCasa'
  | 'motivoNaoCompareceu'
  | 'motivoOutro'
  | 'regraSemReembolso'
  | 'regraSemReembolsoCasa'
  | 'regraGeralSemReembolso',
  string
>;

/**
 * O motivo e a regra do voucher cancelado sem reembolso, no idioma da página do cliente (paraPublico,
 * src/lib/reserva-publica.ts): a regra do item 6 da política de cancelamento, com a ressalva do começo dele (fora das
 * situações dos itens 2, 4 e 5, o cancelamento com menos de 24 horas e o não comparecimento não dão direito a reembolso),
 * nos dois motivos da política; no "outro", o texto como a equipe escreveu e que as regras estão na política. Os mesmos
 * textos do e-mail (src/lib/email/textos.ts, semReembolso). Na casa de temporada (`casa`; Etapa 7, pacote 2), o motivo e a
 * regra das casas: a menos de 30 dias da entrada, fora dos 7 dias da compra, o sinal não volta e o restante não é cobrado.
 */
export function frasesDoCancelamentoSemReembolso(
  P: TextosDoMotivo,
  c: Pick<CancelamentoSemReembolso, 'motivo' | 'texto'>,
  casa = false,
): { motivo: string; regra: string } {
  const motivo =
    c.motivo === 'outro'
      ? P.motivoOutro.replace('{texto}', () => c.texto ?? '')
      : c.motivo === 'nao-compareceu'
        ? P.motivoNaoCompareceu
        : casa
          ? P.motivoForaDaPoliticaCasa
          : P.motivoForaDaPolitica;
  return { motivo, regra: c.motivo === 'outro' ? P.regraGeralSemReembolso : casa ? P.regraSemReembolsoCasa : P.regraSemReembolso };
}

/** O motivo como o histórico do pedido escreve, com a regra que vale para os vouchers cancelados. */
function motivoNoHistorico(m: MotivoSemReembolso, regra: RegraDoCancelamento): string {
  if (m === 'nao-compareceu') return 'não compareceu no horário e no local combinados';
  if (m === 'outro') return 'outro';
  if (regra === 'casas') return 'fora da política das casas (o cancelamento foi pedido a menos de 30 dias da entrada, fora dos 7 dias da compra)';
  if (regra === 'as-duas') {
    return 'fora da política (no passeio, com menos de 24 horas de antecedência; na casa, a menos de 30 dias da entrada, fora dos 7 dias da compra)';
  }
  return 'fora da política (o cancelamento foi pedido com menos de 24 horas de antecedência)';
}

/* ------------------------------------------------------------------ */
/* A gravação                                                          */

/** O cancelamento a gravar (no JSON do pagamento), com a escolha, os vouchers, o motivo e a trava. */
export function registroDoCancelamento(
  escolha: EscolhaDoCancelamento,
  vouchers: readonly string[],
  motivo: { motivo: MotivoSemReembolso; texto?: string },
  agora: Date,
  comTrava: boolean,
): CancelamentoSemReembolso {
  return {
    alcance: escolha.acao === 'cancelar_sem_reembolso' ? 'pedido' : 'voucher',
    vouchers: [...vouchers],
    motivo: motivo.motivo,
    ...(motivo.motivo === 'outro' && motivo.texto ? { texto: motivo.texto } : {}),
    em: agora.toISOString(),
    ...(comTrava ? { avisoDosSeteDias: true as const } : {}),
  };
}

/** O começo da linha do histórico do cancelamento sem reembolso. Não começa com "Aviso:": nada a resolver depois. */
export const INICIO_DO_CANCELAMENTO_SEM_REEMBOLSO = 'Cancelado sem reembolso no painel';

/**
 * A linha do histórico: o alcance, os vouchers que deixam de valer, que nada é devolvido e o motivo (no "fora da política",
 * com a regra dos vouchers cancelados: a dos passeios, a das casas ou as duas).
 */
export function linhaDoCancelamentoSemReembolso(c: CancelamentoSemReembolso, regra: RegraDoCancelamento = 'passeios'): string {
  const quais =
    c.vouchers.length === 1 ? `o voucher ${c.vouchers[0]} deixa de valer` : `os vouchers ${emFrase(c.vouchers)} deixam de valer`;
  const motivo = c.motivo === 'outro' ? `outro, escrito para o cliente: «${c.texto ?? ''}»` : motivoNoHistorico(c.motivo, regra);
  return `${INICIO_DO_CANCELAMENTO_SEM_REEMBOLSO} (${c.alcance === 'pedido' ? 'o pedido inteiro' : 'um voucher só'}): ${quais}, e nada é devolvido ao cliente. Motivo: ${motivo}`;
}

/**
 * A primeira gravação do cancelamento, dentro da trava de versão, no primeiro voucher a cancelar (relido): o cancelamento
 * entra no JSON do pagamento (o que é do pedido: nos arquivos, levado aos outros vouchers; no banco, a linha do pedido), o
 * voucher fica 'cancelado' e saem as linhas do histórico (a do cancelamento e, com a trava, a do aviso). O status do pedido
 * NÃO muda. Devolve as linhas para quem grava registrar. `regra`: a política dos vouchers cancelados (regraDosVouchers).
 */
export function aplicarCancelamento(
  r: Reserva,
  registro: CancelamentoSemReembolso,
  trava: TravaDosSeteDias | null,
  regra: RegraDoCancelamento = 'passeios',
): string[] {
  const antes: unknown = r.pagamento.semReembolso;
  r.pagamento.semReembolso = [...(Array.isArray(antes) ? (antes as CancelamentoSemReembolso[]) : []), registro];
  if (registro.vouchers.includes(r.codigo)) r.statusItem = 'cancelado';
  return [linhaDoCancelamentoSemReembolso(registro, regra), ...(trava ? [linhaDaTravaDosSeteDias(trava, 'cancelamento')] : [])];
}

/** Um voucher com o que é do pedido (status, pagamento, histórico, valores, ids) tirado de outro voucher relido. */
const comOPedidoDe = (v: Reserva, r: Reserva): Reserva =>
  ({
    ...v,
    status: r.status,
    pagamento: r.pagamento,
    historico: r.historico,
    reembolsoCentavos: r.reembolsoCentavos,
    paymentIntentId: r.paymentIntentId,
    pagamentoExternoId: r.pagamentoExternoId,
    provedor: r.provedor,
  }) as Reserva;

/** O que a conferência dentro da trava decide: gravar (com a trava dos 7 dias de agora), repetida, ou o erro. */
export type ConferenciaNaTrava = { resultado: 'gravar'; trava: TravaDosSeteDias | null } | { resultado: 'repetida' } | { resultado: ErroDoPainel };

/**
 * A conferência dentro da trava de versão, com o primeiro voucher a cancelar relido (`r`: o que é do pedido está nele) e
 * os vouchers lidos no começo da requisição: a mesma regra (planoDoCancelamento) com o pedido de agora, os mesmos vouchers
 * do cancelamento a gravar e a caixa "Estou ciente" quando a trava vale. Repetida: outro toque já gravou um cancelamento
 * que lista algum destes vouchers (o duplo toque, a aba antiga): nada a gravar, e a volta é a de sucesso.
 */
export function conferirNaTrava(
  r: Reserva,
  vouchers: readonly Reserva[],
  escolha: EscolhaDoCancelamento,
  registro: CancelamentoSemReembolso,
  agora: Date,
  ciente: boolean,
): ConferenciaNaTrava {
  if (registro.vouchers.some((v) => cancelamentoDoVoucher(r.pagamento, v))) return { resultado: 'repetida' };
  const agoraDoPedido = vouchers.map((v) => (v.codigo === r.codigo ? r : comOPedidoDe(v, r)));
  if (!agoraDoPedido.some((v) => v.codigo === r.codigo)) return { resultado: 'acao-nao-vale' };
  const plano = planoDoCancelamento(agoraDoPedido, escolha, agora);
  if (!plano.ok) return { resultado: plano.erro };
  const mesmos = plano.cancelar.map((v) => v.codigo);
  if (mesmos.length !== registro.vouchers.length || mesmos.some((c) => !registro.vouchers.includes(c))) return { resultado: 'acao-nao-vale' };
  if (plano.trava && !ciente) return { resultado: 'falta-ciente' };
  return { resultado: 'gravar', trava: plano.trava };
}

/* ------------------------------------------------------------------ */
/* O toque repetido e a gravação que ficou pela metade                 */

/**
 * O voucher que um cancelamento já gravado lista e que ainda vale, no pedido pago: a gravação ficou pela metade (a função
 * cortada entre a primeira gravação e a dos outros vouchers) ou outro toque ainda está gravando. É completado (o voucher
 * fica 'cancelado'), sem outro cancelamento. Conferido de novo dentro da trava do próprio voucher (voucherACompletar).
 */
export const voucherACompletar = (x: Reserva): boolean =>
  x.status === 'pago' && voucherAtivo(x) && cancelamentoDoVoucher(x.pagamento, x.codigo) !== undefined;

/** Os vouchers do pedido a completar (o primeiro voucher representa o pedido: é dele o JSON do pagamento lido). */
export function vouchersACompletar(vouchers: readonly Reserva[]): Reserva[] {
  const r = vouchers[0];
  if (!r || r.status !== 'pago') return [];
  return vouchers.filter((v) => voucherAtivo(v) && cancelamentoDoVoucher(r.pagamento, v.codigo) !== undefined);
}

/** Os cancelamentos que listam estes vouchers, um por cancelamento (para o e-mail de cada um sair, uma vez). */
export function cancelamentosDosVouchers(r: Pick<Reserva, 'pagamento'>, vouchers: readonly Pick<Reserva, 'codigo'>[]): CancelamentoSemReembolso[] {
  return cancelamentosSemReembolso(r.pagamento).filter((c) => vouchers.some((v) => c.vouchers.includes(v.codigo)));
}

/**
 * A escolha já está feita (o duplo toque, a aba antiga): o pedido inteiro já tem um cancelamento do pedido inteiro, ou o
 * voucher já está num cancelamento. A rota volta como a que deu certo, sem gravar outro.
 */
export function cancelamentoJaFeito(r: Pick<Reserva, 'pagamento'>, escolha: EscolhaDoCancelamento): CancelamentoSemReembolso | undefined {
  const lista = cancelamentosSemReembolso(r.pagamento);
  return escolha.acao === 'cancelar_sem_reembolso'
    ? lista.find((c) => c.alcance === 'pedido')
    : lista.find((c) => c.vouchers.includes(escolha.voucher));
}

/** O e-mail de um cancelamento: o "Pedido cancelado" do pedido inteiro ou o "Voucher cancelado" de um voucher só. */
export type AlcanceDoEmailSemReembolso = { tipo: 'pedido' } | { tipo: 'voucher'; voucher: string };

export const alcanceDoEmail = (c: CancelamentoSemReembolso): AlcanceDoEmailSemReembolso =>
  c.alcance === 'pedido' ? { tipo: 'pedido' } : { tipo: 'voucher', voucher: c.vouchers[0] ?? '' };

/** Os textos do painel para a confirmação do cancelamento (a caixa "Confirmo") e o botão. */
export const confirmacaoDoCancelamento = (vouchers: readonly string[]): string =>
  vouchers.length === 1
    ? `Confirmo: o voucher ${vouchers[0]} deixa de valer, e nada é devolvido ao cliente.`
    : `Confirmo: os vouchers ${emFrase(vouchers)} deixam de valer, e nada é devolvido ao cliente.`;

export const botaoDoCancelamento = (escolha: EscolhaDoCancelamento): string =>
  escolha.acao === 'cancelar_sem_reembolso' ? 'Cancelar sem reembolso' : `Cancelar só o voucher ${escolha.voucher} sem reembolso`;

/** Os vouchers que continuam valendo depois do cancelamento de um voucher só (os outros ainda pagos). */
export const continuamValendo = (vouchers: readonly Reserva[], cancelar: readonly Reserva[]): Reserva[] =>
  vouchers.filter((v) => voucherPago(v) && !cancelar.includes(v));

export { MOTIVOS_SEM_REEMBOLSO };
