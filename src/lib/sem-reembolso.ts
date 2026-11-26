import type { Reserva } from './reservas';

/**
 * O cancelamento SEM reembolso feito pela equipe no painel (Pacote 33; FASE-5, Etapa 2, passos 2 e 3 do plano de 25/11),
 * como fica gravado e como é lido de volta. O pedido pago pela Stripe continua 'pago' (o dinheiro ficou) e só os vouchers
 * ficam 'cancelado' (o status do item, que já existe: itens_pedido.status). Nunca o status 'cancelado' no pedido pago: se a
 * Stripe reentregasse o aviso do pagamento, o site devolveria o dinheiro sozinho (pagamentoParaDevolver,
 * src/app/api/webhooks/stripe/eventos.ts), e uma contestação do pedido não apareceria na faixa do painel. O motivo fica no
 * JSON do pagamento (pagamento.semReembolso), nos arquivos e no banco, sem migração, como o pagamento parado.
 *
 * Aqui só a forma do que foi gravado e a leitura dela, sem regra de painel nem de rota: o painel (src/lib/pedidos-painel.ts),
 * a página do cliente (src/lib/reserva-publica.ts), os e-mails e as regras do cancelamento (src/lib/cancelar-sem-reembolso.ts)
 * leem daqui. Sem import de código (só tipos), para nenhum deles depender de outro.
 */

/** Os motivos que a equipe escolhe (FASE-5: "fora da política, não compareceu, ou outro, com um texto curto"). */
export const MOTIVOS_SEM_REEMBOLSO = ['fora-da-politica', 'nao-compareceu', 'outro'] as const;
export type MotivoSemReembolso = (typeof MOTIVOS_SEM_REEMBOLSO)[number];

/** O texto do motivo "outro", que vai ao cliente do jeito que a equipe escrever (decisão do dono de 25/11, P4): até isto. */
export const TEXTO_DO_MOTIVO_MAXIMO = 200;

/** Um cancelamento sem reembolso, como fica no JSON do pagamento: um por toque no painel. */
export interface CancelamentoSemReembolso {
  /** O pedido inteiro (todos os vouchers que ainda valiam) ou um voucher só. */
  alcance: 'pedido' | 'voucher';
  /** Os vouchers que deixaram de valer neste cancelamento (um voucher só entra em um cancelamento). */
  vouchers: string[];
  motivo: MotivoSemReembolso;
  /** Só no "outro": o texto que o cliente lê, já limpo (limparTextoDoMotivo). */
  texto?: string;
  /** Quando a equipe cancelou. */
  em: string;
  /** O painel avisou da trava dos 7 dias do arrependimento, e a equipe marcou "Estou ciente" para seguir. */
  avisoDosSeteDias?: true;
}

/** O valor é um dos motivos que o painel oferece (o formulário manda texto livre; só estes três valem). */
export const ehMotivoSemReembolso = (valor: unknown): valor is MotivoSemReembolso =>
  typeof valor === 'string' && (MOTIVOS_SEM_REEMBOLSO as readonly string[]).includes(valor);

const ehCancelamento = (c: unknown): c is CancelamentoSemReembolso => {
  if (!c || typeof c !== 'object') return false;
  const x = c as Record<string, unknown>;
  return (
    (x.alcance === 'pedido' || x.alcance === 'voucher') &&
    Array.isArray(x.vouchers) &&
    x.vouchers.every((v) => typeof v === 'string') &&
    ehMotivoSemReembolso(x.motivo) &&
    typeof x.em === 'string' &&
    (x.texto === undefined || typeof x.texto === 'string')
  );
};

/** Os cancelamentos sem reembolso gravados no pedido, na ordem, só os que têm a forma certa (o JSON vem do banco). */
export function cancelamentosSemReembolso(pagamento: Pick<Reserva['pagamento'], 'semReembolso'> | undefined): CancelamentoSemReembolso[] {
  const lista: unknown = pagamento?.semReembolso;
  return Array.isArray(lista) ? lista.filter(ehCancelamento) : [];
}

/** O cancelamento sem reembolso que lista o voucher, se há um. */
export const cancelamentoDoVoucher = (
  pagamento: Pick<Reserva['pagamento'], 'semReembolso'> | undefined,
  codigo: string,
): CancelamentoSemReembolso | undefined => cancelamentosSemReembolso(pagamento).find((c) => c.vouchers.includes(codigo));

/** O voucher como as regras daqui o leem. */
export type VoucherDoCancelamento = Pick<Reserva, 'codigo' | 'status' | 'statusItem' | 'pagamento'>;

/**
 * O voucher foi cancelado sem reembolso: ele está 'cancelado' e um cancelamento gravado o lista. No pedido que depois foi
 * reembolsado inteiro (a equipe mudou de ideia e usou "Reembolsar tudo", ou uma contestação perdida), não: todo o dinheiro
 * voltou, e o voucher é reembolsado como os outros (statusDoVoucher, src/lib/reserva-publica.ts).
 */
export const canceladoSemReembolso = (v: VoucherDoCancelamento): boolean =>
  v.statusItem === 'cancelado' && v.status !== 'reembolsado' && cancelamentoDoVoucher(v.pagamento, v.codigo) !== undefined;

/**
 * O pedido inteiro está cancelado sem reembolso: ainda 'pago' (o dinheiro ficou: decisão do dono de 25/11, P3, ele continua
 * contando como venda), nenhum voucher valendo (todos cancelados ou reembolsados sozinhos) e pelo menos um cancelado sem
 * reembolso. É o estado do passo 2 do plano: o selo "Cancelado sem reembolso" do painel e o "Pedido cancelado" das
 * páginas do cliente. Recebe os vouchers do pedido (o primeiro representa o pedido).
 */
export function pedidoCanceladoSemReembolso(vouchers: readonly VoucherDoCancelamento[]): boolean {
  const [r] = vouchers;
  return (
    r !== undefined &&
    r.status === 'pago' &&
    vouchers.every((v) => v.statusItem === 'cancelado' || v.statusItem === 'reembolsado') &&
    vouchers.some(canceladoSemReembolso)
  );
}

/**
 * O texto do motivo "outro" numa linha só, sem espaços sobrando e cortado no máximo. Ele vai ao cliente (o e-mail e a
 * página do pedido) do jeito que a equipe escrever, e ao histórico do pedido entre « »: as aspas e os « » viram aspas
 * simples (ninguém fecha o trecho no histórico). Qualquer coisa que não seja texto vira texto nenhum.
 */
export function limparTextoDoMotivo(texto: unknown): string {
  if (typeof texto !== 'string') return '';
  return texto
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/[«»"“”„‟‹›]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TEXTO_DO_MOTIVO_MAXIMO)
    .trim();
}
