// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { fmt, type Idioma } from '../i18n/config.ts';
import {
  CIENTE_DOS_SETE_DIAS,
  ROTULO_DO_MOTIVO,
  avisoDosSeteDias,
  botaoDoCancelamento,
  confirmacaoDoCancelamento,
  continuamValendo,
  escolhasDoCancelamento,
  motivosQueCombinam,
  motivosQueNaoAparecem,
  planoDoCancelamento,
  reembolsoACaminhoDoSite,
  type EscolhaDoCancelamento,
} from './cancelar-sem-reembolso.ts';
import { formatarCifra } from './cifra.ts';
import { codigoValido } from './codigo-reserva.ts';
import { textosEmail } from './email/textos.ts';
import { TEXTO_DO_MOTIVO_MAXIMO, canceladoSemReembolso } from './sem-reembolso.ts';
import {
  botaoReembolsoDoVoucher,
  botaoVoucherPorFora,
  buscaDoPainel,
  confirmacaoDoReembolso,
  formaEProvedorNoPainel,
  provedorDaReserva,
  reembolsoNoPainel,
  valorDoVoucherPorFora,
  valorRecebido,
  voucherPago,
  type PedidoPainel,
} from './pedidos-painel.ts';
import { reembolsosFalhos, vouchersDevolvidosPorOutroMeio } from './reembolsos-a-resolver.ts';
import type { Reserva } from './reservas';
import type { LeituraDoSaldo, SaldoIndisponivel } from './saldo-stripe';

/**
 * A tela de resumo do painel antes de devolver dinheiro (Pacote 33, item 1; FASE-5, Etapa 2: "antes de confirmar, o
 * painel mostra o resumo e pede um segundo toque"). O "Reembolsar na Stripe…" do cartão do pedido leva a ela
 * (/admin/resumo/<pedido>): o que volta e o valor, os vouchers que deixam de valer, a forma de pagamento, o prazo da
 * Stripe, o e-mail que o cliente recebe e o saldo da Stripe lido na hora. O segundo toque é a caixa "Confirmo" e o botão,
 * que mandam para as MESMAS ações de antes da rota do painel ('reembolsar' e 'reembolsar_item', com os mesmos campos e
 * as mesmas frases): o caminho do dinheiro não muda. O que a tela oferece sai das regras de sempre do cartão do pedido
 * (reembolsoNoPainel e botaoReembolsoDoVoucher, src/lib/pedidos-painel.ts), que a rota confere de novo.
 *
 * Tudo aqui é montado sem rede nem banco, para os testes rodarem em node; quem lê o pedido e o saldo é a página
 * (src/app/admin/resumo/[codigo]/page.tsx). O painel é só em português; o assunto do e-mail vem no idioma do cliente.
 *
 * O "Cancelar sem reembolso…" (Pacote 33, passos 2 e 3 do plano) usa a mesma tela, com a outra família de ações
 * (ACOES_DO_RESUMO): telaDoCancelamento, com o aviso 'perigo' da trava dos 7 dias, a segunda caixa ('ciente') em
 * `confirmacoes` e o motivo em `campos`; o que ela oferece sai das regras de src/lib/cancelar-sem-reembolso.ts, que a rota
 * confere de novo. Ali a Stripe não entra: nem o saldo é lido.
 */

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');

/** Uma data e hora no horário de Brasília, para a equipe: "10/11/2026 14:32". */
const dataHora = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
const horaCompleta = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

/* ------------------------------------------------------------------ */
/* A escolha e os endereços                                            */

/**
 * As ações que a tela leva à rota do painel: as dos botões de antes, sem mudar nada ("com reembolso"), e, desde o
 * Pacote 33, as duas do cancelamento sem reembolso (o pedido inteiro e um voucher só).
 */
export const ACOES_DO_RESUMO = ['reembolsar', 'reembolsar_item', 'cancelar_sem_reembolso', 'cancelar_item_sem_reembolso'] as const;
export type AcaoDoResumo = (typeof ACOES_DO_RESUMO)[number];

/** O "com reembolso": tudo, ou um voucher só. */
export type EscolhaDoReembolso = { acao: 'reembolsar' } | { acao: 'reembolsar_item'; voucher: string };
/** O que a equipe escolheu: devolver (tudo ou um voucher) ou cancelar sem reembolso (o pedido inteiro ou um voucher). */
export type EscolhaDoResumo = EscolhaDoReembolso | EscolhaDoCancelamento;

/** A escolha é do cancelamento sem reembolso (a tela sem a Stripe). */
export const ehCancelamento = (e: EscolhaDoResumo): e is EscolhaDoCancelamento =>
  e.acao === 'cancelar_sem_reembolso' || e.acao === 'cancelar_item_sem_reembolso';

/** A escolha que veio no endereço da tela (?acao=…&voucher=…), ou null quando não é uma que a tela conhece. */
export function lerEscolhaDoResumo(q: Record<string, string | string[] | undefined>): EscolhaDoResumo | null {
  const acao = typeof q.acao === 'string' ? q.acao : '';
  if (acao === 'reembolsar' || acao === 'cancelar_sem_reembolso') return { acao };
  const voucher = typeof q.voucher === 'string' ? q.voucher.trim().toUpperCase() : '';
  if ((acao === 'reembolsar_item' || acao === 'cancelar_item_sem_reembolso') && codigoValido(voucher)) return { acao, voucher };
  return null;
}

/** O filtro de status e a busca em que a equipe estava no painel: vão e voltam com a tela. */
export interface VoltaDoPainel {
  filtro?: string;
  busca?: string;
}

/**
 * O filtro do painel que veio no endereço da tela: só com cara de filtro (letras minúsculas e hífen, como "pagas" e
 * "pagamentos-a-decidir"); o resto é filtro nenhum. O painel ignora o filtro que não conhece.
 */
export const filtroDoPainel = (valor: unknown): string => (typeof valor === 'string' && /^[a-z-]{1,40}$/.test(valor) ? valor : '');

/** O endereço do painel com o filtro e a busca (o "Voltar ao painel" da tela, sem ação nenhuma). */
export function enderecoDoPainel(volta: VoltaDoPainel): string {
  const q = new URLSearchParams();
  if (volta.filtro) q.set('status', volta.filtro);
  const busca = buscaDoPainel(volta.busca);
  if (busca) q.set('q', busca);
  const texto = q.toString();
  return texto ? `/admin?${texto}` : '/admin';
}

/**
 * O endereço da tela de resumo: o pedido no caminho e, pelo URLSearchParams, a escolha, o filtro (como `status`, o nome
 * que o painel usa) e a busca. Nunca o que veio de fora sem passar por aqui.
 */
export function enderecoDoResumo(pedido: string, escolha: EscolhaDoResumo, volta: VoltaDoPainel): string {
  const q = new URLSearchParams({ acao: escolha.acao });
  if ('voucher' in escolha) q.set('voucher', escolha.voucher);
  if (volta.filtro) q.set('status', volta.filtro);
  const busca = buscaDoPainel(volta.busca);
  if (busca) q.set('q', busca);
  return `/admin/resumo/${encodeURIComponent(pedido)}?${q}`;
}

/** Uma opção do alto da tela ("Tudo (R$ …)", "Só o voucher ON-… (R$ …)"), com o botão e a caixa "Confirmo" dela. */
export interface OpcaoDoReembolso {
  escolha: EscolhaDoReembolso;
  rotulo: string;
  centavos: number;
  /** O rótulo do botão do segundo toque: o mesmo de antes ("Reembolsar tudo (R$ …)", "Reembolsar só o voucher …"). */
  botao: string;
  /** A frase da caixa "Confirmo": a mesma de antes. */
  confirmacao: string;
}

/**
 * O que dá para devolver pela Stripe neste pedido, pela regra do cartão do pedido: tudo o que ainda resta do pagamento e,
 * no pedido com vários itens, cada voucher ativo que cabe no que resta (botaoReembolsoDoVoucher; o voucher que vale
 * mais do que resta fica de fora). Nada, quando o cartão do pedido não mostra o "Reembolsar na Stripe…".
 */
export function opcoesDoReembolso(p: PedidoPainel): OpcaoDoReembolso[] {
  const m = reembolsoNoPainel(p);
  if (m.tipo !== 'stripe') return [];
  const tudo: OpcaoDoReembolso = {
    escolha: { acao: 'reembolsar' },
    rotulo: `Tudo (${cifra(m.restanteCentavos)})`,
    centavos: m.restanteCentavos,
    botao: `Reembolsar tudo (${cifra(m.restanteCentavos)})`,
    confirmacao: confirmacaoDoReembolso(m.restanteCentavos),
  };
  const doVoucher = m.vouchers.flatMap((v): OpcaoDoReembolso[] => {
    const botao = botaoReembolsoDoVoucher(v.codigo, valorRecebido(v), m.restanteCentavos);
    return botao
      ? [
          {
            escolha: { acao: 'reembolsar_item', voucher: v.codigo },
            rotulo: `Só o voucher ${v.codigo} (${cifra(botao.centavos)})`,
            centavos: botao.centavos,
            botao: botao.rotulo,
            confirmacao: botao.confirmacao,
          },
        ]
      : [];
  });
  return [tudo, ...doVoucher];
}

const mesmaEscolha = (a: EscolhaDoResumo, b: EscolhaDoResumo): boolean =>
  a.acao === b.acao && ('voucher' in a ? 'voucher' in b && a.voucher === b.voucher : !('voucher' in b));

/** A opção escolhida, se ela ainda vale para o pedido como ele está agora; senão, null (a tela diz que não vale mais). */
export const opcaoEscolhida = (p: PedidoPainel, escolha: EscolhaDoResumo): OpcaoDoReembolso | null =>
  opcoesDoReembolso(p).find((o) => mesmaEscolha(o.escolha, escolha)) ?? null;

/* ------------------------------------------------------------------ */
/* O Pix pago há mais de 90 dias (Pacote 33, D1)                       */

/** A Stripe só aceita pedido de reembolso de Pix até 90 dias depois do pagamento (docs.stripe.com/payments/pix). */
export const PRAZO_DO_REEMBOLSO_DO_PIX_DIAS = 90;
const DIA_MS = 86_400_000;

/** Os dias inteiros desde o pagamento, ou null sem a hora do pagamento. */
export function diasDesdeOPagamento(pagoEm: string | undefined, agora: Date): number | null {
  const t = pagoEm ? Date.parse(pagoEm) : Number.NaN;
  return Number.isNaN(t) ? null : Math.floor((agora.getTime() - t) / DIA_MS);
}

/** O pagamento é um Pix pela Stripe pago há mais de 90 dias: a Stripe não aceita mais o pedido de reembolso dele. */
export function pixForaDoPrazoDaStripe(r: Pick<Reserva, 'provedor' | 'pagamento'>, agora: Date): boolean {
  if (provedorDaReserva(r) !== 'stripe' || r.pagamento.metodo !== 'pix') return false;
  const t = r.pagamento.pagoEm ? Date.parse(r.pagamento.pagoEm) : Number.NaN;
  return !Number.isNaN(t) && agora.getTime() - t > PRAZO_DO_REEMBOLSO_DO_PIX_DIAS * DIA_MS;
}

/**
 * Uma linha do histórico que cita um reembolso da Stripe: pedido, a caminho, concluído, falho, o e-mail dele. O id é re_…
 * no cartão e pyr_… no Pix (src/lib/reembolsos-a-resolver.ts).
 */
const CITA_REEMBOLSO_DA_STRIPE = /\b(?:re|pyr)_[A-Za-z0-9]/;

/**
 * A devolução por transferência do Pix pago há mais de 90 dias, que a política de cancelamento promete nesse caso
 * (src/content/legal/online.ts): a equipe transfere ao titular e registra no painel com o botão de sempre do voucher
 * devolvido por outro meio ('voucher_por_fora', que não chama a Stripe). Vale no pedido pago pela Stripe no Pix, fora do
 * prazo da Stripe, sem reembolso que falhou (esse já tem o caminho dele, com os mesmos botões), sem reembolso que o painel
 * pediu à Stripe e que ela ainda não confirmou, de qualquer data (reembolsoACaminhoDoSite, com os vouchers do pedido: o
 * "Reembolsar tudo" pedido no 89º dia, cujo aviso da Stripe ainda não foi processado, voltaria ao cliente junto com a
 * transferência), e sem nenhum reembolso da Stripe citado no histórico DEPOIS do fim do prazo: se a Stripe aceitou um
 * pedido de reembolso depois dos 90 dias (ao contrário do que a página dela diz), a equipe espera o resultado dele antes
 * de devolver por fora, para não devolver duas vezes. A tela de resumo e a rota do painel usam esta mesma regra (a rota de
 * novo dentro da trava, com o pedido relido; um voucher lido no começo e ainda 'ativo' só segura mais, nunca menos).
 */
export function transferenciaDoPixOferecida(
  r: Pick<Reserva, 'provedor' | 'pagamento' | 'status' | 'historico'>,
  agora: Date,
  vouchers: readonly Pick<Reserva, 'codigo' | 'statusItem'>[],
): boolean {
  if (r.status !== 'pago' || !pixForaDoPrazoDaStripe(r, agora) || reembolsosFalhos(r.historico).length) return false;
  if (reembolsoACaminhoDoSite(r, vouchers)) return false;
  const fimDoPrazo = Date.parse(r.pagamento.pagoEm ?? '') + PRAZO_DO_REEMBOLSO_DO_PIX_DIAS * DIA_MS;
  return !r.historico.some((h) => Date.parse(h.em) > fimDoPrazo && CITA_REEMBOLSO_DA_STRIPE.test(h.evento));
}

/* ------------------------------------------------------------------ */
/* A tela                                                              */

/** O tom de um aviso: vermelho (perigo), amarelo (atenção) ou cinza (informação). */
export type TomDoAviso = 'perigo' | 'atencao' | 'info';

export interface AvisoDoResumo {
  tom: TomDoAviso;
  texto: string;
}

/** Uma linha do resumo: o rótulo e o valor, com uma ou mais linhas de texto. */
export interface LinhaDoResumo {
  rotulo: string;
  valor: string[];
}

/**
 * Um campo do formulário além das caixas (nenhum no "com reembolso"; o motivo do "sem reembolso", passo 2 do plano):
 * uma escolha entre opções, ou um texto curto, cada um com uma frase de ajuda opcional embaixo. A rota confere tudo de novo.
 */
export type CampoDoResumo =
  | { tipo: 'escolha'; nome: string; rotulo: string; opcoes: { valor: string; rotulo: string }[]; ajuda?: string }
  | { tipo: 'texto'; nome: string; rotulo: string; maximo: number; ajuda?: string };

/** Um formulário da tela: o POST para a rota do painel, com as caixas de marcar obrigatórias e o botão. */
export interface FormularioDoResumo {
  /** A ação da rota (/api/admin/reservas/<codigoNaRota>). */
  acao: string;
  /** O código no endereço da rota, como nos botões do cartão do pedido. */
  codigoNaRota: string;
  /** O campo `voucher`, quando a ação é sobre um voucher só. */
  voucher?: string;
  /** As caixas que o navegador exige marcadas (a rota confere a 'confirmo' de novo); o valor de cada uma é "sim". */
  confirmacoes: { nome: string; texto: string }[];
  campos: CampoDoResumo[];
  botao: string;
  /** O botão em vermelho claro (devolver tudo), como o "Reembolsar tudo" de antes. */
  perigo: boolean;
  /** Uma frase embaixo do botão. */
  nota?: string;
}

/** Embaixo do botão da Stripe: o pedido só muda com a confirmação dela (o webhook charge.refunded). */
export const NOTA_DO_REEMBOLSO = 'O status do pedido muda quando a Stripe confirmar o reembolso.';

/** A tela quando não há o que mostrar: nada é feito, e o painel mostra o pedido como ele está. */
export const RESUMO_SEM_PEDIDO = 'Pedido não encontrado. Nada foi feito.';
export const RESUMO_NAO_VALE =
  'Esta opção não vale mais para este pedido, no status em que ele está agora. Nada foi feito: volte ao painel e veja o pedido.';
export const RESUMO_SEM_BANCO = 'Não deu para ler o pedido agora. Nada foi feito. Tente de novo em instantes.';

/** Uma parte a mais da tela, com o título, o texto e os formulários dela (a devolução por transferência do Pix). */
export interface SecaoDoResumo {
  titulo: string;
  texto: string[];
  formularios: FormularioDoResumo[];
}

export interface TelaDoResumo {
  titulo: string;
  subtitulo: string;
  tituloDasOpcoes: string;
  /** As opções do alto, com a escolhida marcada; vazia quando só há uma. */
  opcoes: { rotulo: string; href: string; atual: boolean }[];
  linhas: LinhaDoResumo[];
  avisos: AvisoDoResumo[];
  /** O segundo toque. null quando a Stripe não entra (já há devolução registrada por outro meio): `semFormulario` diz por quê. */
  formulario: FormularioDoResumo | null;
  semFormulario?: string;
  transferencia: SecaoDoResumo | null;
}

export interface ContextoDoResumo {
  agora: Date;
  /**
   * A leitura do saldo que a página fez (lerSaldoDaStripe, src/lib/saldo-stripe.ts); null quando a página nem leu, porque a
   * Stripe não entra neste pedido (devolucaoPelaStripe).
   */
  saldo: LeituraDoSaldo | null;
  /** Os e-mails automáticos estão ligados (a chave do Resend na Vercel). */
  emailLigado: boolean;
  /** O voucher como a página escreve: o passeio (ou o transfer) e a data. */
  descrever: (r: Reserva) => string;
  volta: VoltaDoPainel;
}

/** O idioma do pedido, como o painel escreve (o cliente recebe os e-mails nele). */
export const NOME_DO_IDIOMA: Record<Idioma, string> = {
  pt: 'português',
  en: 'inglês',
  es: 'espanhol (o neutro, com "tú")',
  'es-ar': 'espanhol da Argentina (com "vos")',
};

/** Por que o saldo não foi lido, dito à equipe; sempre com "o reembolso continua possível" (o saldo só avisa). */
export const SALDO_INDISPONIVEL: Record<SaldoIndisponivel, string> = {
  'sem-chave': 'Saldo indisponível: falta a chave do saldo (STRIPE_SALDO_KEY) na Vercel.',
  'chave-errada': 'Saldo indisponível: a chave do saldo (STRIPE_SALDO_KEY) não tem o formato de uma chave da Stripe.',
  'modo-diferente':
    'Saldo indisponível: a chave do saldo (STRIPE_SALDO_KEY) é de outro modo da Stripe (teste ou produção) que a chave dos pagamentos.',
  erro: 'Saldo indisponível agora: a Stripe não respondeu à leitura do saldo.',
  demora: 'Saldo indisponível agora: a Stripe demorou para responder à leitura do saldo.',
};
export const O_REEMBOLSO_CONTINUA = 'O reembolso continua possível: o saldo só avisa.';
/** O saldo que a página não leu (não acontece: ela lê sempre que a Stripe entra). */
export const SALDO_NAO_LIDO = 'Saldo indisponível: não foi lido agora.';

/**
 * O aviso quando o disponível não cobre o reembolso: diz "pode", e não "vai" (FASE-5 e a página da Stripe,
 * docs.stripe.com/refunds: sem saldo disponível, o reembolso no cartão fica pendente até entrar saldo, por até 45 dias,
 * e depois falha; o do Pix falha), porque no teste de 24/11 os dois passaram na hora, sem saldo. A equipe pode seguir.
 */
export function avisoDoSaldo(disponivelCentavos: number, centavos: number, forma: 'pix' | 'cartao'): string {
  const oQue =
    forma === 'pix'
      ? 'Sem saldo disponível, o reembolso no Pix pode falhar.'
      : 'Sem saldo disponível, o reembolso no cartão pode ficar pendente até entrar saldo (até 45 dias; depois disso, ele falha).';
  return (
    `O saldo disponível na Stripe (${cifra(disponivelCentavos)}) não cobre este reembolso (${cifra(centavos)}). ${oQue} ` +
    'No teste de 24/11, os reembolsos no cartão e no Pix passaram na hora, mesmo sem saldo. Se ele falhar, o painel avisa no topo ' +
    'e mostra como devolver por outro meio. Você pode seguir: o painel só avisa.'
  );
}

/**
 * O aviso vermelho do Pix pago há mais de 90 dias; com a devolução por transferência oferecida na tela, aponta para ela.
 */
export const avisoDoPixForaDoPrazo = (pagoEm: string, dias: number, comTransferencia: boolean): string =>
  `Este Pix foi pago em ${dataHora(pagoEm)}, há ${dias} dias. A Stripe só aceita pedido de reembolso de Pix até ` +
  `${PRAZO_DO_REEMBOLSO_DO_PIX_DIAS} dias depois do pagamento (docs.stripe.com/payments/pix): pela Stripe, este reembolso não ` +
  'deve passar. A política de cancelamento promete, nesse caso, devolver por transferência para uma conta que o cliente indicar' +
  (comTransferencia ? ' (veja "Devolver por transferência", embaixo).' : '.');

/** O e-mail na tela sem a Stripe: a devolução por outro meio não manda e-mail ao cliente (como hoje, depois de uma falha). */
export const SEM_EMAIL_NA_TRANSFERENCIA =
  'Na devolução por transferência, o site não manda e-mail ao cliente: avise-o pelo e-mail ou pelo WhatsApp do pedido.';

/**
 * A Stripe ainda entra neste pedido: nenhuma devolução registrada por outro meio. Depois de uma, a Stripe passa a ter
 * menos devolvido do que o pedido registra, e a rota do painel não pede outro reembolso dela (stripe-devolveu-menos): a
 * tela tira o botão da Stripe, o prazo, o e-mail do reembolso e o saldo, e a página nem lê o saldo.
 */
export const devolucaoPelaStripe = (p: Pick<PedidoPainel, 'itens'>): boolean =>
  vouchersDevolvidosPorOutroMeio(p.itens[0]?.historico ?? []).length === 0;

/** A chave do saldo que é a secreta completa: funciona, mas pode mais do que ler o saldo. */
export const AVISO_DA_CHAVE_COMPLETA =
  'A chave do saldo (STRIPE_SALDO_KEY) é uma chave secreta completa (sk_…). Troque, na Stripe, por uma chave restrita só com ' +
  '"Balance: Read" e cole na Vercel no lugar dela.';

/**
 * No lugar do botão da Stripe, depois de uma devolução registrada por outro meio: a Stripe passa a ter menos devolvido
 * do que o pedido registra, e a rota do painel não pede outro reembolso dela (stripe-devolveu-menos).
 */
export const SEM_STRIPE_DEPOIS_DE_OUTRO_MEIO =
  'Este pedido já tem devolução registrada por outro meio: o site não pede reembolso deste pagamento à Stripe.';
export const REGISTRE_OS_OUTROS = 'Registre os outros vouchers em "Devolver por transferência".';

/** "a, b e c". */
const emFrase = (itens: readonly string[]): string =>
  itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;

/** O e-mail que o cliente recebe, dito à equipe, com o assunto no idioma do cliente. */
function linhasDoEmail(p: PedidoPainel, opcao: OpcaoDoReembolso, continuam: readonly Reserva[], emailLigado: boolean): string[] {
  const r = p.itens[0];
  if (!emailLigado) {
    return [
      'Os e-mails automáticos estão desligados (falta a chave do Resend na Vercel): o cliente não recebe e-mail deste reembolso. Avise-o pelo e-mail ou pelo WhatsApp do pedido.',
    ];
  }
  const T = textosEmail(r.idioma).reembolso;
  const assunto = fmt(T.assunto, { codigo: p.codigo });
  const concluido = fmt(T.assuntoConcluido, { codigo: p.codigo });
  const oQueDiz =
    opcao.escolha.acao === 'reembolsar'
      ? 'diz que o pedido foi cancelado e que o valor volta pela mesma forma de pagamento, com o valor e o prazo da Stripe.'
      : `diz que o voucher ${opcao.escolha.voucher} foi cancelado e que o valor dele volta pela mesma forma de pagamento, com o valor e o prazo da Stripe` +
        (continuam.length
          ? `, e, em "O que continua valendo", os links ${continuam.length === 1 ? 'do voucher' : 'dos vouchers'} ${emFrase(continuam.map((v) => v.codigo))}.`
          : '.');
  return [
    `«${assunto}», para ${r.cliente.email}, em ${NOME_DO_IDIOMA[r.idioma]}.`,
    `Sai sozinho quando a Stripe registrar o reembolso: ${oQueDiz}`,
    `Se a Stripe deixar o reembolso pendente (por exemplo, sem saldo), esse e-mail diz que ele está a caminho, sem data, e sai outro, «${concluido}», quando ele terminar.`,
  ];
}

/**
 * A tela do "Reembolsar na Stripe…" para a escolha (tudo ou um voucher), ou null quando a escolha não vale mais para o
 * pedido como ele está agora (a página diz isso e volta ao painel, sem formulário). O formulário é o dos botões de antes:
 * 'reembolsar' no código do voucher que representa o pedido, ou 'reembolsar_item' no código do voucher, com o campo
 * `voucher`, a caixa "Confirmo" com a mesma frase e o mesmo rótulo do botão.
 */
export function telaDoReembolso(p: PedidoPainel, escolha: EscolhaDoResumo, c: ContextoDoResumo): TelaDoResumo | null {
  const opcao = opcaoEscolhida(p, escolha);
  const r = p.itens[0];
  if (!opcao || !r) return null;
  const todas = opcoesDoReembolso(p);
  const doItem = opcao.escolha.acao === 'reembolsar_item' ? opcao.escolha.voucher : undefined;
  const deixam = doItem ? p.itens.filter((v) => v.codigo === doItem) : p.itens.filter(voucherPago);
  const continuam = doItem ? p.itens.filter((v) => v.codigo !== doItem && voucherPago(v)) : [];
  const forma: 'pix' | 'cartao' = p.metodo === 'pix' ? 'pix' : 'cartao';
  const umVoucher = (v: Reserva) =>
    `${v.codigo} · ${c.descrever(v)} · ${cifra(valorRecebido(v))}${v.statusItem === 'usado' ? ' (já usado)' : ''}`;
  const restante = Math.max(0, p.recebidoCentavos - p.reembolsoCentavos);
  // Pacote 33: no "tudo", os vouchers cancelados antes sem reembolso: o dinheiro deles também volta (a equipe mudou de ideia)
  const canceladosAntes = doItem ? [] : p.itens.filter(canceladoSemReembolso);

  const volta = doItem
    ? `${cifra(opcao.centavos)}: só o voucher ${doItem}`
    : p.reembolsoCentavos > 0
      ? `${cifra(opcao.centavos)}: tudo o que ainda resta do pagamento (${cifra(p.reembolsoCentavos)} já voltaram ao cliente)`
      : `${cifra(opcao.centavos)}: o pedido inteiro`;
  const { forma: formaNoPainel } = formaEProvedorNoPainel(p);
  const pais = r.pagamento.cartaoPais ? ` · cartão ${r.pagamento.cartaoPais}` : '';
  const prazo = forma === 'pix' ? textosEmail('pt').reembolso.prazoPix : textosEmail('pt').reembolso.prazoCartao;
  // depois de uma devolução registrada por outro meio, nada de Stripe (a rota também recusa: stripe-devolveu-menos): sem o
  // botão dela, sem o prazo dela, sem o e-mail do reembolso (que só sai com um reembolso da Stripe) e sem o saldo
  const pelaStripe = devolucaoPelaStripe(p);

  // o Pix pago há mais de 90 dias: a devolução por transferência, se a regra deixa
  const transferencias = transferenciaDoPixOferecida(r, c.agora, p.itens)
    ? deixam.filter(voucherPago).flatMap((v): FormularioDoResumo[] => {
        const centavos = valorDoVoucherPorFora(valorRecebido(v), restante);
        if (centavos <= 0) return [];
        const botao = botaoVoucherPorFora(v.codigo, centavos);
        return [
          {
            acao: 'voucher_por_fora',
            codigoNaRota: r.codigo,
            voucher: v.codigo,
            confirmacoes: [{ nome: 'confirmo', texto: botao.confirmacao }],
            campos: [],
            botao: botao.rotulo,
            perigo: false,
          },
        ];
      })
    : [];

  // os avisos, na ordem: o vermelho do Pix fora do prazo, o amarelo do saldo que não cobre e a nota da chave completa
  const avisos: AvisoDoResumo[] = [];
  const dias = diasDesdeOPagamento(r.pagamento.pagoEm, c.agora);
  if (pixForaDoPrazoDaStripe(r, c.agora) && r.pagamento.pagoEm && dias !== null) {
    avisos.push({ tom: 'perigo', texto: avisoDoPixForaDoPrazo(r.pagamento.pagoEm, dias, transferencias.length > 0) });
  }
  let saldo: string[] = [];
  const lido = c.saldo;
  if (pelaStripe && lido?.estado === 'lido') {
    saldo = [
      `Disponível: ${cifra(lido.disponivelCentavos)}`,
      `A liberar: ${cifra(lido.aLiberarCentavos)}`,
      `Lido agora, às ${horaCompleta(lido.lidoEm)}.`,
    ];
    if (lido.disponivelCentavos < opcao.centavos) {
      avisos.push({ tom: 'atencao', texto: avisoDoSaldo(lido.disponivelCentavos, opcao.centavos, forma) });
    }
    if (lido.chaveCompleta) avisos.push({ tom: 'info', texto: AVISO_DA_CHAVE_COMPLETA });
  } else if (pelaStripe) {
    saldo = [lido?.estado === 'indisponivel' ? SALDO_INDISPONIVEL[lido.motivo] : SALDO_NAO_LIDO, O_REEMBOLSO_CONTINUA];
  }

  // o segundo toque: o formulário dos botões de antes, no mesmo endereço da rota, com o mesmo rótulo e a mesma caixa
  const formulario: FormularioDoResumo | null = !pelaStripe
    ? null
    : {
        acao: opcao.escolha.acao,
        codigoNaRota: doItem ?? r.codigo,
        ...(doItem ? { voucher: doItem } : {}),
        confirmacoes: [{ nome: 'confirmo', texto: opcao.confirmacao }],
        campos: [],
        botao: opcao.botao,
        perigo: !doItem,
        nota: NOTA_DO_REEMBOLSO,
      };

  return {
    titulo: 'Reembolsar na Stripe',
    subtitulo: `Pedido ${p.codigo} · ${r.cliente.nome}`,
    tituloDasOpcoes: 'O que devolver',
    opcoes:
      todas.length > 1
        ? todas.map((o) => ({
            rotulo: o.rotulo,
            href: enderecoDoResumo(p.codigo, o.escolha, c.volta),
            atual: mesmaEscolha(o.escolha, opcao.escolha),
          }))
        : [],
    linhas: [
      { rotulo: 'Volta ao cliente', valor: [volta] },
      ...(deixam.length ? [{ rotulo: deixam.length === 1 ? 'Deixa de valer' : 'Deixam de valer', valor: deixam.map(umVoucher) }] : []),
      ...(canceladosAntes.length
        ? [
            {
              rotulo: canceladosAntes.length === 1 ? 'Cancelado antes, sem reembolso' : 'Cancelados antes, sem reembolso',
              valor: canceladosAntes.map((v) => `${umVoucher(v)}: o valor dele também volta`),
            },
          ]
        : []),
      ...(continuam.length
        ? [{ rotulo: continuam.length === 1 ? 'Continua valendo' : 'Continuam valendo', valor: continuam.map(umVoucher) }]
        : []),
      {
        rotulo: 'Forma de pagamento',
        valor: [`${formaNoPainel}${pais}`, ...(r.pagamento.pagoEm ? [`Pago em ${dataHora(r.pagamento.pagoEm)}`] : [])],
      },
      ...(pelaStripe ? [{ rotulo: 'Prazo da Stripe para o dinheiro aparecer', valor: [prazo] }] : []),
      {
        rotulo: 'E-mail que o cliente recebe',
        valor: pelaStripe ? linhasDoEmail(p, opcao, continuam, c.emailLigado) : [SEM_EMAIL_NA_TRANSFERENCIA],
      },
      ...(pelaStripe ? [{ rotulo: 'Saldo da Stripe', valor: saldo }] : []),
    ],
    avisos,
    formulario,
    ...(formulario
      ? {}
      : {
          semFormulario: transferencias.length
            ? `${SEM_STRIPE_DEPOIS_DE_OUTRO_MEIO} ${REGISTRE_OS_OUTROS}`
            : SEM_STRIPE_DEPOIS_DE_OUTRO_MEIO,
        }),
    transferencia: transferencias.length
      ? {
          titulo: 'Devolver por transferência',
          texto: [
            'Transfira só para o titular do pedido, para uma conta que ele indicar, confirmando antes pelo e-mail ou pelo WhatsApp do pedido.',
            'Depois, registre aqui, um voucher por vez: o voucher deixa de valer e o valor entra no que voltou ao cliente. Nada é pedido à Stripe, e o site não manda e-mail ao cliente sobre esta devolução.',
          ],
          formularios: transferencias,
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* O "Cancelar sem reembolso…" (Pacote 33, passos 2 e 3 do plano)     */

/** O título da tela do cancelamento sem reembolso (também na tela sem o que confirmar). */
export const TITULO_DO_CANCELAMENTO = 'Cancelar sem reembolso';

/** O que volta ao cliente no cancelamento sem reembolso: nada (o pedido continua pago, e conta como venda: P3). */
export const NADA_VOLTA = 'Nada: nenhum dinheiro é devolvido. O pedido continua pago e continua contando como venda.';

/** Embaixo do botão do cancelamento sem reembolso. */
export const NOTA_DO_CANCELAMENTO = 'Nada é pedido à Stripe. Os vouchers cancelados deixam de valer na hora, e o pedido continua pago.';

/** O e-mail do cancelamento sem reembolso, dito à equipe, com o assunto no idioma do cliente. */
function linhasDoEmailSemReembolso(
  p: PedidoPainel,
  escolha: EscolhaDoCancelamento,
  continuam: readonly Reserva[],
  emailLigado: boolean,
): string[] {
  const r = p.itens[0];
  if (!emailLigado) {
    return [
      'Os e-mails automáticos estão desligados (falta a chave do Resend na Vercel): o cliente não recebe e-mail deste cancelamento. Avise-o pelo e-mail ou pelo WhatsApp do pedido.',
    ];
  }
  const S = textosEmail(r.idioma).semReembolso;
  const doPedido = escolha.acao === 'cancelar_sem_reembolso';
  const assunto = doPedido
    ? fmt(S.assuntoPedido, { codigo: p.codigo })
    : fmt(S.assuntoVoucher, { voucher: escolha.voucher, codigo: p.codigo });
  const diz = doPedido
    ? 'diz que o pedido foi cancelado pela equipe, sem reembolso, com o motivo escolhido abaixo e a regra da política de cancelamento, e lista os vouchers que deixam de valer.'
    : `diz que o voucher ${escolha.voucher} foi cancelado pela equipe, sem reembolso, com o motivo escolhido abaixo e a regra da política de cancelamento` +
      (continuam.length
        ? `, e, em "O que continua valendo", os links ${continuam.length === 1 ? 'do voucher' : 'dos vouchers'} ${emFrase(continuam.map((v) => v.codigo))}.`
        : '.');
  return [
    `«${assunto}», para ${r.cliente.email}, em ${NOME_DO_IDIOMA[r.idioma]}.`,
    `Sai logo depois da confirmação: ${diz}`,
    'Nenhuma opção de pedir estorno ou cancelamento, nem no e-mail nem na página do pedido; no rodapé, o link da política de cancelamento.',
  ];
}

/**
 * A tela do "Cancelar sem reembolso…" para a escolha (o pedido inteiro ou um voucher só), ou null quando a regra não deixa
 * (planoDoCancelamento, src/lib/cancelar-sem-reembolso.ts: o pedido pago pela Stripe, sem contestação e sem reembolso a
 * resolver ou a caminho; o voucher que ainda vale). A tela mostra os vouchers que deixam de valer, que nada é devolvido, a
 * forma de pagamento, o idioma da compra (decisão do dono de 25/11, P4: o texto do "outro" vai como a equipe escrever) e o
 * e-mail que o cliente recebe; dentro dos 7 dias do arrependimento, com o serviço por começar, ou com a desistência pedida
 * pelo site dentro dos 7 dias, o aviso vermelho e a caixa "Estou ciente". O formulário: o motivo (a escolha obrigatória,
 * só com os motivos que combinam com a data do serviço, motivosQueCombinam, e o texto curto, só com "outro"), a caixa
 * "Confirmo" e o botão, para as ações 'cancelar_sem_reembolso' e 'cancelar_item_sem_reembolso' da rota do painel. Nada da
 * Stripe.
 */
export function telaDoCancelamento(p: PedidoPainel, escolha: EscolhaDoCancelamento, c: ContextoDoResumo): TelaDoResumo | null {
  const plano = planoDoCancelamento(p.itens, escolha, c.agora);
  const r = p.itens[0];
  if (!plano.ok || !r) return null;
  const doItem = escolha.acao === 'cancelar_item_sem_reembolso' ? escolha.voucher : undefined;
  const codigos = plano.cancelar.map((v) => v.codigo);
  const continuam = continuamValendo(p.itens, plano.cancelar);
  const umVoucher = (v: Reserva) => `${v.codigo} · ${c.descrever(v)} · ${cifra(valorRecebido(v))}`;
  const { forma: formaNoPainel } = formaEProvedorNoPainel(p);
  const pais = r.pagamento.cartaoPais ? ` · cartão ${r.pagamento.cartaoPais}` : '';
  const escolhas = escolhasDoCancelamento(p.itens, c.agora);
  // só os motivos que combinam com a data do serviço (a rota confere de novo: motivo-fora-da-data)
  const motivos = motivosQueCombinam(plano.cancelar, c.agora);
  const semAlgumMotivo = motivosQueNaoAparecem(motivos);
  const formulario: FormularioDoResumo = {
    acao: escolha.acao,
    codigoNaRota: doItem ?? r.codigo,
    ...(doItem ? { voucher: doItem } : {}),
    confirmacoes: [
      { nome: 'confirmo', texto: confirmacaoDoCancelamento(codigos) },
      ...(plano.trava ? [{ nome: 'ciente', texto: CIENTE_DOS_SETE_DIAS }] : []),
    ],
    campos: [
      {
        tipo: 'escolha',
        nome: 'motivo',
        rotulo: 'Motivo',
        opcoes: motivos.map((m) => ({ valor: m, rotulo: ROTULO_DO_MOTIVO[m] })),
        ...(semAlgumMotivo ? { ajuda: semAlgumMotivo } : {}),
      },
      {
        tipo: 'texto',
        nome: 'texto',
        rotulo: 'Só com "Outro motivo": o texto que o cliente lê',
        maximo: TEXTO_DO_MOTIVO_MAXIMO,
        ajuda: `O cliente comprou em ${NOME_DO_IDIOMA[r.idioma]}: escreva nesse idioma. O texto vai ao cliente do jeito que você escrever, até ${TEXTO_DO_MOTIVO_MAXIMO} letras.`,
      },
    ],
    botao: botaoDoCancelamento(escolha),
    perigo: true,
    nota: NOTA_DO_CANCELAMENTO,
  };
  return {
    titulo: TITULO_DO_CANCELAMENTO,
    subtitulo: `Pedido ${p.codigo} · ${r.cliente.nome}`,
    tituloDasOpcoes: 'O que cancelar',
    opcoes:
      escolhas.length > 1
        ? escolhas.map((o) => ({
            // com mais de uma opção, a do pedido inteiro cancela os vouchers que ainda valem, um por opção de voucher
            rotulo: o.acao === 'cancelar_sem_reembolso' ? `O pedido inteiro (${escolhas.length - 1} vouchers)` : `Só o voucher ${o.voucher}`,
            href: enderecoDoResumo(p.codigo, o, c.volta),
            atual: mesmaEscolha(o, escolha),
          }))
        : [],
    linhas: [
      { rotulo: 'Volta ao cliente', valor: [NADA_VOLTA] },
      { rotulo: codigos.length === 1 ? 'Deixa de valer' : 'Deixam de valer', valor: plano.cancelar.map(umVoucher) },
      ...(continuam.length
        ? [{ rotulo: continuam.length === 1 ? 'Continua valendo' : 'Continuam valendo', valor: continuam.map(umVoucher) }]
        : []),
      {
        rotulo: 'Forma de pagamento',
        valor: [`${formaNoPainel}${pais}`, ...(r.pagamento.pagoEm ? [`Pago em ${dataHora(r.pagamento.pagoEm)}`] : [])],
      },
      { rotulo: 'Idioma da compra', valor: [NOME_DO_IDIOMA[r.idioma]] },
      { rotulo: 'E-mail que o cliente recebe', valor: linhasDoEmailSemReembolso(p, escolha, continuam, c.emailLigado) },
    ],
    avisos: plano.trava ? [{ tom: 'perigo', texto: avisoDosSeteDias(plano.trava) }] : [],
    formulario,
    transferencia: null,
  };
}
