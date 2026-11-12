// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { chaveDaRecusa, type ChaveRecusa } from './recusas.ts';
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
} as const;

export type ErroDoPainel = keyof typeof ERROS_DO_PAINEL;

/** A frase do código que veio no endereço; o código que o painel não conhece não mostra nada. */
export const fraseDoErro = (codigo: string | undefined): string =>
  codigo && Object.hasOwn(ERROS_DO_PAINEL, codigo) ? ERROS_DO_PAINEL[codigo as ErroDoPainel] : '';

/**
 * A contestação muda com a forma de pagamento. No cartão, a loja responde no painel da Stripe dentro do prazo que
 * ela mostra; sem resposta, perde. No Pix não há resposta nem recurso: o banco decide e, se aceitar, a Stripe tira
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

/** O que a equipe faz com um pedido contestado, dito no próprio pedido. */
export const oQueFazerNaContestacao = (metodo: MetodoPagamento): string =>
  metodo === 'pix'
    ? 'No Pix não dá para responder nem recorrer. O banco decide; se aceitar, a Stripe tira o valor da conta.'
    : 'Responda no painel da Stripe dentro do prazo que ela mostra. Sem resposta, a contestação é perdida.';

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

const PIX_VENCIDO = 'pix_expirado';
const ROTULO_CARTAO = 'Última recusa do cartão';
const ROTULO_PIX = 'Última tentativa no Pix';

export function motivoNoPainel(motivoCodigo: string, metodo: MetodoPagamento): MotivoNoPainel {
  const codigo = motivoCodigo.trim().toLowerCase();
  if (codigo === PIX_VENCIDO) return { rotulo: ROTULO_PIX, frase: 'o Pix não foi pago no prazo', resumo: 'não foi pago no prazo' };
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
  // a confirmação do banco que falhou vem como código de erro, não de recusa: para a equipe é a mesma frase
  const chave = codigo === 'payment_intent_authentication_failure' ? 'autenticacao' : chaveDaRecusa(codigo);
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
