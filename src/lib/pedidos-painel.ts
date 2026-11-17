// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { formatarCifra } from './cifra.ts';
import { AVISO_EMAIL_PAGO_SAINDO, MARCA_DO_EMAIL, marcaDoAvisoDeReembolsoFalho } from './email/marcas.ts';
import { PIX_EXPIRADO, chaveDaRecusa, type ChaveRecusa } from './recusas.ts';
import {
  avisoDeReembolsoFechado,
  falhaADevolverPorOutroMeio,
  partesDoReembolso,
  reembolsosFalhos,
  reembolsosSemVoucher,
  vouchersDevolvidosPorOutroMeio,
  type ReembolsoFalho,
  type ReembolsoSemVoucher,
} from './reembolsos-a-resolver.ts';
import type { MetodoPagamento, Provedor, Reserva, StatusReserva } from './reservas';

/**
 * O pedido como o painel mostra: um pagamento e um voucher para cada item. Aqui só se agrupa e se soma,
 * sem tocar no banco: assim dá para testar (tests/estatisticas.test.ts).
 */

/** Quando o item acontece, para mostrar os itens de um pedido na ordem da viagem. */
export const quandoAcontece = (r: Reserva) => `${r.data} ${r.tipo === 'transfer' ? r.transfer.ida.hora : (r.horario?.hora ?? '')}`;

/**
 * Quem processou o pagamento. As reservas gravadas antes da coluna `provedor` não têm o campo: pelo WhatsApp
 * é a equipe; com uma forma online escolhida foi o checkout antigo (Pagar.me). O pagamento pela Stripe sempre
 * grava `provedor: 'stripe'`.
 */
export const provedorDaReserva = (r: { provedor?: Provedor; pagamento: { metodo: MetodoPagamento } }): Provedor =>
  r.provedor ?? (r.pagamento.metodo === 'whatsapp' ? 'whatsapp' : 'pagarme');

/**
 * O que entrou de fato: no Pix, o total com o desconto; no cartão, o total cheio. Na reserva paga no Pix
 * online, o `totalCentavos` já é o total com o desconto (ela não tem `totalPixCentavos`).
 */
export const valorRecebido = (r: Reserva) => (r.pagamento.metodo === 'pix' ? (r.totalPixCentavos ?? r.totalCentavos) : r.totalCentavos);

/**
 * As linhas do histórico que pedem uma ação da equipe começam com "Aviso:": a Stripe não devolveu um pagamento,
 * o valor recebido difere do esperado, o pagamento chegou depois do horário do serviço. O painel destaca essas
 * linhas e já abre o histórico do pedido que tem alguma.
 */
export const ehAviso = (evento: string) => evento.startsWith('Aviso:');

/**
 * A linha do reembolso parado por uma contestação (o webhook grava, linhaDoReembolsoParadoPelaContestacao em
 * src/lib/reembolsos-a-resolver.ts): o valor e o id do reembolso.
 */
const PARADO_PELA_CONTESTACAO =
  /^Aviso: o reembolso de (.+?) \(([^()]+)\) não foi concluído porque o cliente abriu uma contestação no banco/;
/**
 * As linhas que o webhook grava quando a contestação termina: ganha, perdida, evitada ou o alerta encerrado sem disputa
 * (leituraDaContestacao, src/app/api/webhooks/stripe/eventos.ts; tests/painel-avisos.test.ts confere com as de verdade).
 */
const FIM_DA_CONTESTACAO = /^(?:Contestação \S+ (?:ganha|perdida|evitada)\b|Alerta de contestação \S+ encerrado)/;
/** Depois da linha `indice`, alguma contestação terminou. */
const contestacaoTerminaDepois = (historico: readonly { evento: string }[], indice: number): boolean =>
  historico.slice(indice + 1).some((h) => FIM_DA_CONTESTACAO.test(h.evento));

/**
 * O aviso da linha `indice` do histórico ainda pede uma ação: toda linha "Aviso:", menos as que já foram fechadas:
 * - o e-mail do pagamento aprovado que estava saindo (AVISO_EMAIL_PAGO_SAINDO, src/lib/email/marcas.ts) e saiu: a linha
 *   do envio veio depois dela. Se o envio falhou ou a função foi cortada no meio, ela continua destacada;
 * - o reembolso que falhou, depois que a equipe registra no painel a devolução por outro meio, e o reembolso feito direto
 *   na Stripe sem voucher, depois que a equipe diz de qual voucher foi ou que foi um desconto (avisoDeReembolsoFechado,
 *   src/lib/reembolsos-a-resolver.ts);
 * - o reembolso parado por uma contestação, depois que a contestação termina (ganha, perdida, evitada ou o alerta
 *   encerrado): é a mesma regra da faixa do topo (reembolsosParadosPelaContestacao, mais abaixo).
 */
export function avisoAberto(historico: readonly { evento: string }[], indice: number): boolean {
  const linha = historico[indice]?.evento ?? '';
  if (!ehAviso(linha)) return false;
  const fechado = avisoDeReembolsoFechado(historico, indice);
  if (fechado !== null) return !fechado;
  if (PARADO_PELA_CONTESTACAO.test(linha)) return !contestacaoTerminaDepois(historico, indice);
  if (!linha.startsWith(AVISO_EMAIL_PAGO_SAINDO)) return true;
  return !historico.slice(indice + 1).some((h) => h.evento.startsWith(MARCA_DO_EMAIL['pagamento-aprovado']));
}

/**
 * As ações recusadas do painel voltam com ?erro=<código> e a página troca o código por uma frase fixa desta lista.
 * Nunca se mostra o texto que vem no endereço: um link montado por outra pessoa não escreve na faixa vermelha
 * do painel. O que a Stripe respondeu fica só no registro do servidor.
 */
export const ERROS_DO_PAINEL = {
  'nao-encontrado': 'Pedido não encontrado.',
  'sem-pagamento-stripe': 'Este pedido não tem pagamento na Stripe para reembolsar.',
  'status-nao-reembolsa': 'Este pedido não pode ser reembolsado no status em que está.',
  'voucher-de-fora': 'Este voucher não faz parte do pedido.',
  'item-ja-devolvido': 'Este item já foi reembolsado ou cancelado.',
  'item-com-reembolso': 'Este item já tem um reembolso na Stripe, concluído ou a caminho do cliente. Não foi pedido outro.',
  'stripe-falhou': 'O reembolso pode não ter sido feito. Confira o pagamento no painel da Stripe antes de tentar de novo.',
  'acao-desconhecida': 'Ação desconhecida.',
  'so-pelo-aviso': 'Pedido da Stripe só vira pago pelo aviso da própria Stripe, nunca à mão.',
  'ja-pago': 'Este pedido já foi pago: use "Reembolsar" em vez de cancelar.',
  'acao-nao-vale': 'Esta ação não vale para este pedido no status em que ele está.',
  'stripe-devolveu-menos':
    'A Stripe tem menos dinheiro devolvido neste pagamento do que o site registra: um reembolso falhou ou foi cancelado lá. O site não pediu outro. Veja o aviso no pedido ou confira no painel da Stripe.',
  'contestado-nao-reembolsa':
    'Este pagamento está contestado: o reembolso não é feito pelo site enquanto a contestação estiver aberta. Veja no painel da Stripe o que fazer. Nada foi devolvido agora.',
  'reembolso-sem-voucher':
    'A Stripe já devolveu parte deste pedido por fora do site, sem dizer de qual voucher. Diga primeiro de qual voucher foi; nada foi devolvido agora.',
  'falta-confirmar': 'Marque a caixa de confirmação antes de continuar. Nada foi feito.',
  'nada-a-devolver':
    'Este pagamento não tem mais nada a devolver: o site já registra como devolvido tudo o que entrou. Nada foi pedido à Stripe.',
  'voucher-maior-que-o-resto':
    'Este voucher vale mais do que ainda resta deste pagamento: devolver só ele levaria tudo o que resta, e a Stripe trataria como reembolso total, com o pedido inteiro e todos os vouchers passando a reembolsado. Se é isso, use "Reembolsar tudo". Nada foi pedido à Stripe.',
} as const;

export type ErroDoPainel = keyof typeof ERROS_DO_PAINEL;

/** A frase do código que veio no endereço; o código que o painel não conhece não mostra nada. */
export const fraseDoErro = (codigo: string | undefined): string =>
  codigo && Object.hasOwn(ERROS_DO_PAINEL, codigo) ? ERROS_DO_PAINEL[codigo as ErroDoPainel] : '';

/**
 * A contestação muda com a forma de pagamento. No cartão, a loja responde no painel da Stripe dentro do prazo que
 * ela mostra; sem resposta, o banco pode decidir a favor do cliente (a contestação é perdida; o pedido de informação do
 * banco pode virar contestação). No Pix não há resposta nem recurso: o banco decide e, se aceitar, a Stripe tira
 * o valor da conta (docs.stripe.com/payments/pix). O painel não manda "responder" o que não tem resposta.
 */
export const contestacoesAbertas = (pedidos: { status: StatusReserva; metodo: MetodoPagamento }[]) => {
  const abertas = pedidos.filter((p) => p.status === 'contestado');
  const pix = abertas.filter((p) => p.metodo === 'pix').length;
  return { cartao: abertas.length - pix, pix };
};

/** As faixas de alerta do topo do painel: uma para o cartão, outra para o Pix, só quando há contestação aberta. */
export const avisosDeContestacao = ({ cartao, pix }: { cartao: number; pix: number }): string[] => {
  const avisos: string[] = [];
  const noCartao = cartao === 1 ? '1 pagamento contestado' : `${cartao} pagamentos contestados`;
  const noPix = pix === 1 ? '1 Pix contestado' : `${pix} Pix contestados`;
  if (cartao > 0) avisos.push(`${noCartao} no cartão: responder no painel da Stripe, dentro do prazo`);
  if (pix > 0) avisos.push(`${noPix}: não dá para responder, a decisão é do banco`);
  return avisos;
};

/**
 * O que a equipe faz com um pedido contestado, dito no próprio pedido. No cartão, o status contestado vem tanto da
 * contestação quanto do pedido de informação do banco (inquiry; cartão de teste 4000 0000 0000 1976), e a frase vale
 * para os dois: sem resposta, a contestação é perdida e o pedido de informação pode virar contestação, então "a
 * contestação é perdida" não era exato no segundo (reteste de 16-17/11, R9).
 */
export const oQueFazerNaContestacao = (metodo: MetodoPagamento): string =>
  metodo === 'pix'
    ? 'No Pix não dá para responder nem recorrer. O banco decide; se aceitar, a Stripe tira o valor da conta.'
    : 'Responda no painel da Stripe dentro do prazo que ela mostra. Sem resposta, o banco pode decidir a favor do cliente.';

/**
 * O motivo guardado no pedido (pagamento.motivoCodigo), dito à equipe em português. Só o painel lê isto: para o
 * cliente, fraude, cartão perdido, roubado e bloqueio saem sempre como o texto geral (src/lib/recusas.ts).
 * O motivo é da forma registrada no pedido: no cartão, o código que o banco ou a Stripe devolveu; o Pix não é
 * recusado, só vence sem pagamento ('pix_expirado', de interpretarSessao em src/lib/pagamento-stripe.ts).
 */
export interface MotivoNoPainel {
  /** O começo da linha no histórico do pedido. */
  rotulo: string;
  /** O motivo, com o que a equipe precisa saber junto. */
  frase: string;
  /** Curto, para ficar ao lado da forma de pagamento escolhida. */
  resumo: string;
  /** O código como a Stripe mostra, para procurar no painel dela. O Pix vencido não tem. */
  codigo?: string;
}

const RECUSA_PARA_A_EQUIPE: Record<ChaveRecusa, string> = {
  saldo: 'sem saldo ou sem limite',
  dados: 'algum dado do cartão não confere',
  internacional: 'o cartão não aceita esta compra',
  autenticacao: 'a confirmação pedida pelo banco não foi concluída',
  vencido: 'cartão vencido',
  processamento: 'falha passageira na comunicação com o banco',
  generica: 'motivo não informado',
};

/** O que só a equipe vê: o cliente lê o texto geral e a equipe não repassa o motivo. */
const SO_A_EQUIPE_VE = new Map<string, string>([
  ['fraudulent', 'suspeita de fraude'],
  ['lost_card', 'cartão dado como perdido'],
  ['stolen_card', 'cartão dado como roubado'],
  // nestes três a frase fica no que o código garante: houve um bloqueio
  ['merchant_blacklist', 'bloqueio do cartão ou da compra'],
  ['pickup_card', 'bloqueio do cartão ou da compra'],
  ['restricted_card', 'bloqueio do cartão ou da compra'],
]);

const ROTULO_CARTAO = 'Última recusa do cartão';
const ROTULO_PIX = 'Última tentativa no Pix';

export function motivoNoPainel(motivoCodigo: string, metodo: MetodoPagamento): MotivoNoPainel {
  const codigo = motivoCodigo.trim().toLowerCase();
  if (codigo === PIX_EXPIRADO) return { rotulo: ROTULO_PIX, frase: 'o Pix não foi pago no prazo', resumo: 'não foi pago no prazo' };
  // outro código num pedido de Pix não é recusa de cartão: fica o código, sem inventar o motivo
  if (metodo === 'pix') return { rotulo: ROTULO_PIX, frase: 'o Pix não foi concluído', resumo: 'não foi concluído', codigo };
  const reservado = SO_A_EQUIPE_VE.get(codigo);
  if (reservado) {
    return {
      rotulo: ROTULO_CARTAO,
      frase: `${reservado} (não diga o motivo ao cliente)`,
      resumo: `recusado: ${reservado} (não diga ao cliente)`,
      codigo,
    };
  }
  // a confirmação do banco que falhou vem como código de erro, não de recusa: a tabela de src/lib/recusas.ts já o
  // conhece, e a equipe lê a mesma frase da autenticação
  const chave = chaveDaRecusa(codigo);
  const frase = RECUSA_PARA_A_EQUIPE[chave];
  const dica = chave === 'internacional' ? ' (costuma ser compra internacional não liberada)' : '';
  return { rotulo: ROTULO_CARTAO, frase: `${frase}${dica}`, resumo: `recusado: ${frase}`, codigo };
}

export interface PedidoPainel {
  /** O código do pedido. Com um item só, é o próprio voucher. */
  codigo: string;
  /** Um voucher por item, na ordem da viagem. O cliente, o pagamento e o histórico são os mesmos em todos. */
  itens: Reserva[];
  status: StatusReserva;
  criadoEm: string;
  pagoEm?: string;
  metodo: MetodoPagamento;
  provedor: Provedor;
  totalCentavos: number;
  /** O total no Pix, quando a forma de pagamento ainda vai ser combinada pelo WhatsApp. */
  totalPixCentavos?: number;
  /** O total pela forma de pagamento registrada. */
  recebidoCentavos: number;
  /** Quanto já voltou para o cliente (reembolso total ou de um item só). */
  reembolsoCentavos: number;
}

/** Junta os vouchers no pedido de cada um, do mais novo para o mais antigo. */
export function agruparPedidos(reservas: Reserva[]): PedidoPainel[] {
  const grupos = new Map<string, Reserva[]>();
  for (const r of reservas) {
    const codigo = r.pedido?.codigo ?? r.codigo;
    grupos.set(codigo, [...(grupos.get(codigo) ?? []), r]);
  }
  return [...grupos]
    .map(([codigo, vouchers]) => {
      const itens = vouchers.toSorted((a, b) => quandoAcontece(a).localeCompare(quandoAcontece(b)));
      const r = itens[0];
      return {
        codigo,
        itens,
        status: r.status,
        criadoEm: r.criadaEm,
        pagoEm: r.pagamento.pagoEm,
        metodo: r.pagamento.metodo,
        provedor: provedorDaReserva(r),
        totalCentavos: r.pedido?.totalCentavos ?? r.totalCentavos,
        totalPixCentavos: r.pedido ? r.pedido.totalPixCentavos : r.totalPixCentavos,
        recebidoCentavos: itens.reduce((soma, i) => soma + valorRecebido(i), 0),
        reembolsoCentavos: r.reembolsoCentavos ?? 0,
      };
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

/* ------------------------------------------------------------------ */
/* Os reembolsos no painel (16/11, depois do teste de 15/11)           */

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
/** Os centavos de uma cifra escrita por formatarCifra ("R$ 1.234,56" → 123456): ela sempre escreve os centavos. */
const centavosDaCifra = (texto: string): number => Number(texto.replace(/\D/g, ''));

/** Um voucher ainda pago: nem cancelado nem reembolsado sozinho (o painel e a rota dele usam a mesma regra). */
export const voucherPago = (v: Pick<Reserva, 'statusItem'>): boolean => v.statusItem !== 'cancelado' && v.statusItem !== 'reembolsado';
/**
 * Um voucher ativo (nem usado): os que o painel oferece para reembolsar pela Stripe, um por um (como antes), e para ligar
 * a um reembolso feito direto na Stripe.
 */
export const voucherAtivo = (v: Pick<Reserva, 'statusItem'>): boolean => (v.statusItem ?? 'ativo') === 'ativo';

/** Os status de um voucher que o painel escreve ao lado dele. */
const ROTULO_DO_VOUCHER = { reembolsado: 'Reembolsado', cancelado: 'Cancelado', usado: 'Usado' } as const;

/**
 * O que o painel escreve ao lado de cada voucher de um pedido com vários itens ("Voucher ON-… · R$ … · Reembolsado"): o
 * status de verdade do voucher, pela regra da página do cliente (statusDoVoucher, src/lib/reserva-publica.ts). O item
 * reembolsado ou cancelado sozinho mostra o próprio status; sem status próprio (ou "ativo", como o banco relê o item que
 * não mudou), o voucher acompanha o pedido, e o pedido reembolsado ou cancelado inteiro vale para ele também. Antes o
 * painel só lia o status do item: num pedido de dois itens com um voucher devolvido sozinho e o resto depois ("Reembolsar
 * tudo" ou a contestação perdida), o outro voucher aparecia sem "Reembolsado", embora o PDF dele já levasse à página da
 * reserva (reteste de 16-17/11, R7). O voucher usado num pedido que continua valendo mostra "Usado". Nos outros casos, nada: o status do
 * pedido, no alto do cartão, já diz.
 */
export function statusDoVoucherNoPainel(v: Pick<Reserva, 'status' | 'statusItem'>): string | undefined {
  if (v.statusItem === 'reembolsado' || v.statusItem === 'cancelado') return ROTULO_DO_VOUCHER[v.statusItem];
  if (v.status === 'reembolsado' || v.status === 'cancelado') return ROTULO_DO_VOUCHER[v.status];
  return v.statusItem === 'usado' ? ROTULO_DO_VOUCHER.usado : undefined;
}

/**
 * O motivo da falha de um reembolso (o failure_reason da Stripe: docs.stripe.com/refunds, "Handle failed refunds") em
 * português, para a equipe. A linha do histórico continua com o código cru: é ela que a leitura usa.
 */
const MOTIVO_DO_REEMBOLSO_FALHO = new Map<string, string>([
  ['expired_or_canceled_card', 'cartão vencido ou cancelado'],
  ['lost_or_stolen_card', 'cartão dado como perdido ou roubado'],
  ['declined', 'recusado pelo banco'],
  ['insufficient_funds', 'faltou saldo na conta da Stripe por mais de 45 dias'],
  ['merchant_request', 'cancelado a pedido da empresa'],
  ['charge_for_pending_refund_disputed', 'o cliente abriu uma contestação com o reembolso a caminho'],
]);

const codigoDoMotivo = (codigo: string | null | undefined): string => (codigo ?? '').trim().toLowerCase();

/** O motivo em português; o que a lista não conhece (unknown, vazio, um código novo) fica "motivo não informado". */
export const motivoDoReembolsoFalho = (codigo: string | null | undefined): string =>
  MOTIVO_DO_REEMBOLSO_FALHO.get(codigoDoMotivo(codigo)) ?? 'motivo não informado';

/** O cartão dado como perdido ou roubado: quem pede a devolução por fora pode não ser o titular. */
const perdidoOuRoubado = (codigo: string | null | undefined): boolean => codigoDoMotivo(codigo) === 'lost_or_stolen_card';

/**
 * O lembrete do cartão dado como perdido ou roubado, igual ao do e-mail à equipe (emailAvisoDoReembolsoFalho,
 * src/lib/email/mensagens.ts): o motivo nunca vai para o cliente.
 */
export const NAO_DIGA_O_MOTIVO = 'Não diga o motivo ao cliente.';

/**
 * A frase vermelha de um reembolso que falhou e ainda não foi devolvido por outro meio. No cartão dado como perdido ou
 * roubado, mais uma: não dizer o motivo ao cliente e confirmar que quem pede é o titular do cartão.
 */
export function frasesDoReembolsoFalho(f: Pick<ReembolsoFalho, 'centavos' | 'voucher' | 'motivo'>): string[] {
  const doVoucher = f.voucher ? ` do voucher ${f.voucher}` : '';
  const frase = `O reembolso de ${cifra(f.centavos)}${doVoucher} falhou na Stripe (${motivoDoReembolsoFalho(f.motivo)}): o cliente não recebeu. Devolva por outro meio (um Pix, por exemplo) só para o titular do pedido, confirmando antes pelo e-mail ou WhatsApp do pedido, e registre abaixo.`;
  return perdidoOuRoubado(f.motivo)
    ? [frase, `${NAO_DIGA_O_MOTIVO} Antes de devolver por outro meio, confirme que quem pede é o titular do cartão.`]
    : [frase];
}

/** Um reembolso parado porque o cliente abriu uma contestação com ele a caminho (charge_for_pending_refund_disputed). */
export interface ReembolsoParado {
  id: string;
  centavos: number;
  /** A contestação já terminou: uma linha do fim dela veio depois do aviso. */
  encerrado: boolean;
}

/** Os reembolsos parados por uma contestação, um por id, na ordem do histórico. */
export function reembolsosParadosPelaContestacao(historico: readonly { evento: string }[]): ReembolsoParado[] {
  const lista: ReembolsoParado[] = [];
  historico.forEach((h, n) => {
    const m = PARADO_PELA_CONTESTACAO.exec(h.evento);
    if (!m || lista.some((p) => p.id === m[2])) return;
    lista.push({ id: m[2], centavos: centavosDaCifra(m[1]), encerrado: contestacaoTerminaDepois(historico, n) });
  });
  return lista;
}

/** A frase vermelha do reembolso parado: o banco devolve pela contestação, e devolver também por fora pagaria duas vezes. */
export const fraseDoReembolsoParado = (centavos: number): string =>
  `O reembolso de ${cifra(centavos)} não foi concluído porque o cliente abriu uma contestação no banco. Não devolva por outro meio: o banco devolve pela contestação. Aceite ou responda a contestação no painel da Stripe.`;

/**
 * Os reembolsos que falharam na Stripe e, depois da falha, o cliente abriu uma contestação que ainda não terminou: o
 * painel trata como o reembolso parado pela contestação (a mesma frase e a mesma faixa), sem "devolva por outro meio" e
 * sem botão de registrar, até ela terminar (perdida: nada mais a devolver; ganha: a falha volta a pedir a devolução).
 */
const falhasParadasPelaContestacao = (historico: readonly { evento: string }[]): ReembolsoFalho[] =>
  reembolsosFalhos(historico).filter((f) => f.contestacao === 'aberta');

/**
 * As frases vermelhas do reembolso que falhou e, depois, teve uma contestação aberta: a do reembolso parado pela
 * contestação (não devolver por outro meio) e, no cartão dado como perdido ou roubado, "Não diga o motivo ao cliente.",
 * como o e-mail à equipe diz no mesmo caso (Pacote 11, 16/11).
 */
const frasesDaFalhaParadaPelaContestacao = (f: Pick<ReembolsoFalho, 'centavos' | 'motivo'>): string[] =>
  perdidoOuRoubado(f.motivo) ? [fraseDoReembolsoParado(f.centavos), NAO_DIGA_O_MOTIVO] : [fraseDoReembolsoParado(f.centavos)];

/** A frase vermelha do reembolso de parte feito direto na Stripe, sem dizer de qual voucher. */
export const fraseDoReembolsoSemVoucher = (centavos: number): string =>
  `A Stripe devolveu ${cifra(centavos)} deste pedido por fora do site, sem dizer de qual voucher. Diga abaixo de qual voucher foi: isso não devolve dinheiro de novo.`;

/**
 * No lugar da caixa "Reembolsar na Stripe…" do pedido contestado. Vale também no pedido de informação do banco, em que
 * a Stripe ainda aceita reembolso: a equipe decide no painel dela.
 */
export const SEM_REEMBOLSO_NA_CONTESTACAO =
  'Sem botão de reembolso: com a contestação aberta, o reembolso não é feito pelo site. Veja no painel da Stripe o que fazer.';

/** Embaixo dos botões de registrar, no pedido ainda pago que já teve um reembolso que falhou. */
export const SEM_REEMBOLSO_DEPOIS_DA_FALHA = 'Depois de um reembolso que falhou, o site não pede outro reembolso deste pagamento à Stripe.';

/** O botão que só anota o reembolso feito direto na Stripe como desconto: nenhum voucher muda, nenhum dinheiro sai. */
export const NENHUM_VOUCHER = 'Nenhum voucher: foi só um desconto';

/** A caixa de marcar dos botões que devolvem dinheiro pela Stripe (decisão do dono de 16/11: confirmar antes). */
export const confirmacaoDoReembolso = (centavos: number): string =>
  `Confirmo: devolver ${cifra(centavos)} ao cliente. Não dá para desfazer.`;
export const confirmacaoDoReembolsoDoVoucher = (centavos: number, voucher: string): string =>
  `Confirmo: devolver ${cifra(centavos)} do voucher ${voucher}. Não dá para desfazer.`;

/** Os botões que só registram (nenhum chama a Stripe), cada um com o rótulo e a caixa de confirmar. */
export const botaoDevolvidoPorFora = (centavos: number) => ({
  rotulo: `Registrar: ${cifra(centavos)} devolvidos por outro meio`,
  confirmacao: `Confirmo: o cliente já recebeu ${cifra(centavos)} por outro meio.`,
});
export const botaoVoucherPorFora = (voucher: string, centavos: number) => ({
  rotulo: `Registrar: voucher ${voucher} (${cifra(centavos)}) devolvido por outro meio`,
  confirmacao: `Confirmo: o cliente já recebeu ${cifra(centavos)} por outro meio. O voucher deixa de valer.`,
});
export const botaoVoucherDaStripe = (voucher: string, centavos: number) => ({
  rotulo: `Foi o voucher ${voucher} (${cifra(centavos)}): marcar como devolvido`,
  confirmacao: `Confirmo: o voucher ${voucher} deixa de valer. Nenhum dinheiro é devolvido agora.`,
});

/**
 * Quanto de um voucher ainda dá para devolver por outro meio: o valor dele, nunca mais do que ainda resta do pagamento
 * (o que entrou menos o que já voltou ou tem de voltar), nem negativo. Assim o pedido nunca registra mais devolvido do
 * que recebeu, nem depois de um desconto feito direto na Stripe. É a conta do voucher devolvido por outro meio (a rota
 * e o painel); o reembolso de um voucher pela Stripe nunca é limitado assim (voucherCabeNoQueResta).
 */
export const valorADevolver = (valorCentavos: number, restanteCentavos: number): number =>
  Math.max(0, Math.min(valorCentavos, restanteCentavos));

/** Quanto o voucher devolvido por outro meio soma ao que voltou ao cliente: valorADevolver (o painel e a rota usam esta). */
export const valorDoVoucherPorFora = valorADevolver;

/**
 * O voucher pode ser reembolsado sozinho pela Stripe: tem valor e cabe no que ainda resta do pagamento. O que vale mais
 * do que resta nunca sai "limitado ao resto": devolver só ele levaria tudo o que resta, a Stripe trataria como reembolso
 * total (a cobrança inteira devolvida) e o pedido inteiro, com TODOS os vouchers, passaria a reembolsado
 * (planoDoReembolso, src/app/api/webhooks/stripe/eventos.ts). Nesse caso só o "Reembolsar tudo (R$ …)" do painel diz o
 * efeito de verdade. O botão do painel e a rota usam esta mesma regra (a rota recusa com voucher-maior-que-o-resto antes
 * de qualquer chamada à Stripe).
 */
export const voucherCabeNoQueResta = (valorCentavos: number, restanteCentavos: number): boolean =>
  valorCentavos > 0 && valorCentavos <= restanteCentavos;

/**
 * O botão "Reembolsar só o voucher …" do pedido pago pela Stripe: o valor inteiro do voucher, e só quando ele cabe no
 * que ainda resta do pagamento (voucherCabeNoQueResta); a caixa "Confirmo" leva o mesmo valor do botão. Senão, null: o
 * botão não aparece. No ON-4KPC6F do teste de 15/11 (R$ 396,00 pagos e R$ 308,00 já devolvidos), o botão oferecia os
 * R$ 242,00 de um voucher e a Stripe recusou com um erro genérico; limitado aos R$ 88,00 que restavam (Pacote 5), ele
 * devolveria tudo o que restava e invalidaria todos os vouchers, sem dizer isso. Desde o Pacote 11, esse voucher fica
 * sem botão, e o "Reembolsar tudo (R$ 88,00)" do mesmo pedido diz o efeito real.
 */
export function botaoReembolsoDoVoucher(
  voucher: string,
  valorCentavos: number,
  restanteCentavos: number,
): { centavos: number; rotulo: string; confirmacao: string } | null {
  if (!voucherCabeNoQueResta(valorCentavos, restanteCentavos)) return null;
  return {
    centavos: valorCentavos,
    rotulo: `Reembolsar só o voucher ${voucher} (${cifra(valorCentavos)})`,
    confirmacao: confirmacaoDoReembolsoDoVoucher(valorCentavos, voucher),
  };
}

/**
 * O que o cartão do pedido mostra sobre reembolso, numa regra só (testada em tests/painel-avisos.test.ts):
 * - nenhum: não é da Stripe, sem pagamento, nada mais a devolver, ou um status sem reembolso;
 * - contestado: sem botão de reembolso (a frase SEM_REEMBOLSO_NA_CONTESTACAO no lugar);
 * - falhou: o pedido pago ou reembolsado teve um reembolso que falhou na Stripe (por devolver ou já devolvido por outro
 *   meio): nenhum botão da Stripe; um "Registrar" por reembolso ainda por devolver (`pendentes`: sem a falha com uma
 *   contestação aberta ou perdida depois dela, que não se devolve por fora) e, com o pedido pago, um "voucher devolvido
 *   por outro meio" por voucher ainda pago (`vouchersPagos`). Só as linhas de reembolsosFalhos contam: a devolução falha
 *   de um pagamento repetido não tira os botões de um pedido saudável;
 * - stripe: os botões de sempre ("Reembolsar tudo" e, no pedido com vários itens, um por voucher ativo, pelo valor do
 *   voucher, só quando ele cabe no que ainda resta do pagamento: botaoReembolsoDoVoucher; o voucher que vale mais do
 *   que resta fica sem botão, porque devolvê-lo levaria tudo o que resta e invalidaria todos os vouchers).
 * Nos dois últimos, `semVoucher` traz os reembolsos de parte feitos direto na Stripe sem voucher, ainda por resolver (só
 * no pedido pago com vários itens). Enquanto houver algum, nenhum botão por voucher aparece (o reembolso pode ter sido de
 * um deles): primeiro a equipe diz de qual voucher foi.
 */
export type ReembolsoNoPainel =
  | { tipo: 'nenhum' }
  | { tipo: 'contestado' }
  | {
      tipo: 'falhou';
      pendentes: ReembolsoFalho[];
      vouchersPagos: Reserva[];
      restanteCentavos: number;
      semVoucher: ReembolsoSemVoucher[];
    }
  | { tipo: 'stripe'; restanteCentavos: number; vouchers: Reserva[]; semVoucher: ReembolsoSemVoucher[] };

export function reembolsoNoPainel(p: PedidoPainel): ReembolsoNoPainel {
  const r = p.itens[0];
  if (p.provedor !== 'stripe' || !r?.paymentIntentId) return { tipo: 'nenhum' };
  if (p.status === 'contestado') return { tipo: 'contestado' };
  if (p.status !== 'pago' && p.status !== 'reembolsado') return { tipo: 'nenhum' };
  const pago = p.status === 'pago';
  const varios = p.itens.length > 1;
  const semVoucher = pago && varios ? reembolsosSemVoucher(r.historico).filter((s) => !s.resolvido) : [];
  const restanteCentavos = Math.max(0, p.recebidoCentavos - p.reembolsoCentavos);
  const falhos = reembolsosFalhos(r.historico);
  if (falhos.length) {
    const vouchersPagos = pago && !semVoucher.length && restanteCentavos > 0 ? p.itens.filter(voucherPago) : [];
    return { tipo: 'falhou', pendentes: falhos.filter(falhaADevolverPorOutroMeio), vouchersPagos, restanteCentavos, semVoucher };
  }
  if (!pago || restanteCentavos <= 0) return { tipo: 'nenhum' };
  const vouchers = varios && !semVoucher.length ? p.itens.filter(voucherAtivo) : [];
  return { tipo: 'stripe', restanteCentavos, vouchers, semVoucher };
}

/** As pendências de reembolso de um pedido: cada uma é uma faixa do topo. */
function pendenciasDoReembolso(p: PedidoPainel): { falhos: boolean; semVoucher: boolean; parados: boolean } {
  const m = reembolsoNoPainel(p);
  const historico = p.itens[0]?.historico ?? [];
  const parado =
    reembolsosParadosPelaContestacao(historico).some((x) => !x.encerrado) || falhasParadasPelaContestacao(historico).length > 0;
  return {
    falhos: m.tipo === 'falhou' && m.pendentes.length > 0,
    semVoucher: (m.tipo === 'falhou' || m.tipo === 'stripe') && m.semVoucher.length > 0,
    // o pedido contestado já entra na faixa das contestações
    parados: p.status !== 'contestado' && parado,
  };
}

/**
 * O pedido tem um reembolso para a equipe resolver: um que falhou e ainda não foi devolvido por outro meio, um feito
 * direto na Stripe sem dizer de qual voucher, ou um parado por uma contestação que ainda não terminou (a contestação
 * aberta com o reembolso a caminho, ou aberta depois de o reembolso falhar). É o filtro "Reembolsos a resolver", para
 * onde as três faixas levam.
 */
export function reembolsoParaResolver(p: PedidoPainel): boolean {
  const d = pendenciasDoReembolso(p);
  return d.falhos || d.semVoucher || d.parados;
}

/** Quantos pedidos entram em cada faixa dos reembolsos (as contas são por pedido, como a das desistências). */
export function contarReembolsosAResolver(pedidos: readonly PedidoPainel[]): { falhos: number; semVoucher: number; parados: number } {
  const conta = { falhos: 0, semVoucher: 0, parados: 0 };
  for (const p of pedidos) {
    const d = pendenciasDoReembolso(p);
    if (d.falhos) conta.falhos++;
    if (d.semVoucher) conta.semVoucher++;
    if (d.parados) conta.parados++;
  }
  return conta;
}

/** As faixas do topo dos reembolsos que pedem uma ação da equipe; só as que têm algum pedido. */
export const avisosDeReembolso = ({ falhos, semVoucher, parados }: { falhos: number; semVoucher: number; parados: number }): string[] => {
  const naoDevolveu =
    falhos === 1 ? '1 reembolso que a Stripe não conseguiu devolver' : `${falhos} reembolsos que a Stripe não conseguiu devolver`;
  const direto =
    semVoucher === 1 ? '1 reembolso feito direto na Stripe, sem voucher' : `${semVoucher} reembolsos feitos direto na Stripe, sem voucher`;
  const parado = parados === 1 ? '1 reembolso parado por contestação' : `${parados} reembolsos parados por contestação`;
  const avisos: string[] = [];
  if (falhos > 0) avisos.push(`${naoDevolveu}: devolver por outro meio e registrar`);
  if (semVoucher > 0) avisos.push(`${direto}: dizer de qual voucher foi`);
  if (parados > 0) avisos.push(`${parado}: aceitar ou responder no painel da Stripe`);
  return avisos;
};

/**
 * As frases vermelhas do pedido sobre reembolso, embaixo do status: os que falharam e ainda não foram devolvidos por
 * outro meio, os feitos direto na Stripe sem voucher e os parados por uma contestação que ainda não terminou (a aberta
 * com o reembolso a caminho, e a aberta depois de o reembolso falhar: a mesma frase, "não devolva por outro meio", e,
 * nesta, no cartão dado como perdido ou roubado, também "Não diga o motivo ao cliente.").
 */
export function frasesDoReembolsoNoPainel(p: PedidoPainel): string[] {
  const m = reembolsoNoPainel(p);
  const historico = p.itens[0]?.historico ?? [];
  return [
    ...(m.tipo === 'falhou' ? m.pendentes.flatMap((f) => frasesDoReembolsoFalho(f)) : []),
    ...(m.tipo === 'falhou' || m.tipo === 'stripe' ? m.semVoucher.map((s) => fraseDoReembolsoSemVoucher(s.centavos)) : []),
    ...reembolsosParadosPelaContestacao(historico)
      .filter((x) => !x.encerrado)
      .map((x) => fraseDoReembolsoParado(x.centavos)),
    ...falhasParadasPelaContestacao(historico).flatMap(frasesDaFalhaParadaPelaContestacao),
  ];
}

/**
 * O que o valor do pedido diz do dinheiro devolvido (partesDoReembolso, como a equipe lê): o que chegou ao cliente, com a
 * parte por outro meio entre parênteses, e, em vermelho, o que falta devolver porque o reembolso falhou na Stripe. A
 * falha com uma contestação aberta ou perdida depois dela não entra no "Falta devolver" (não se devolve por fora).
 */
export function devolucaoNoPainel(p: Pick<PedidoPainel, 'itens' | 'reembolsoCentavos'>): { reembolsado?: string; falta?: string } {
  const historico = p.itens[0]?.historico ?? [];
  const partes = partesDoReembolso(p.reembolsoCentavos, reembolsosFalhos(historico), vouchersDevolvidosPorOutroMeio(historico));
  const chegou = partes.originalCentavos + partes.outroMeioCentavos;
  const porFora = partes.outroMeioCentavos > 0 ? ` (${cifra(partes.outroMeioCentavos)} por outro meio)` : '';
  return {
    ...(chegou > 0 ? { reembolsado: `Reembolsado ${cifra(chegou)}${porFora}` } : {}),
    ...(partes.pendenteCentavos > 0 ? { falta: `Falta devolver ${cifra(partes.pendenteCentavos)}: o reembolso falhou na Stripe` } : {}),
  };
}

/** O que o e-mail à equipe diz de um reembolso que falhou (enviarAvisoDoReembolsoFalho, src/lib/email/pedidos.ts). */
export interface AvisoDoReembolsoFalho {
  centavos: number;
  /** O motivo em português (motivoDoReembolsoFalho). */
  motivo: string;
  /**
   * O cliente abriu uma contestação (com o reembolso a caminho, depois de ele falhar, ou o pedido já está contestado):
   * NÃO devolver por outro meio.
   */
  contestacao: boolean;
  /** O cartão dado como perdido ou roubado: não dizer o motivo ao cliente. */
  naoDizerOMotivo: boolean;
}

/**
 * O aviso por e-mail à equipe de um reembolso que falhou, lido da linha que o webhook gravou no histórico, ou null: o
 * e-mail deste reembolso já saiu (marcaDoAvisoDeReembolsoFalho), a equipe já registrou a devolução por outro meio, o
 * banco já devolveu ao cliente pela contestação perdida depois da falha, a contestação do reembolso parado já terminou,
 * ou não há linha de falha deste reembolso (a devolução falha de um pagamento repetido fica só no histórico). Com uma
 * contestação aberta depois da falha, ou com o pedido já contestado na hora de montar o e-mail (`status`), o aviso manda
 * NÃO devolver por outro meio (`contestacao`), como no reembolso parado pela contestação. Um e-mail por reembolso, sem
 * nenhum dado do cartão.
 */
export function avisoDoReembolsoFalho(
  historico: readonly { evento: string }[],
  reembolsoId: string,
  status: StatusReserva,
): AvisoDoReembolsoFalho | null {
  const marca = marcaDoAvisoDeReembolsoFalho(reembolsoId);
  if (historico.some((h) => h.evento.startsWith(marca))) return null;
  const falho = reembolsosFalhos(historico).find((f) => f.id === reembolsoId);
  if (falho) {
    if (falho.devolvido || falho.contestacao === 'perdida') return null;
    return {
      centavos: falho.centavos,
      motivo: motivoDoReembolsoFalho(falho.motivo),
      contestacao: falho.contestacao === 'aberta' || status === 'contestado',
      naoDizerOMotivo: perdidoOuRoubado(falho.motivo),
    };
  }
  const parado = reembolsosParadosPelaContestacao(historico).find((x) => x.id === reembolsoId);
  if (!parado || parado.encerrado) return null;
  return {
    centavos: parado.centavos,
    motivo: motivoDoReembolsoFalho('charge_for_pending_refund_disputed'),
    contestacao: true,
    naoDizerOMotivo: false,
  };
}
