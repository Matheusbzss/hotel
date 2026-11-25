// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { formatarCifra } from './cifra.ts';
import {
  AVISO_EMAIL_PAGO_SAINDO,
  MARCA_DO_EMAIL,
  avisoDoEnvioFechado,
  marcaDoAvisoDeReembolsoFalho,
  marcaDoAvisoDoPagamentoRetido,
} from './email/marcas.ts';
import { PIX_EXPIRADO, chaveDaRecusa, type ChaveRecusa } from './recusas.ts';
import {
  avisoDeReembolsoFechado,
  falhaADevolverPorOutroMeio,
  partesDaPagina,
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
 * O total que o pedido esperava receber na forma registrada: o do pedido inteiro, não só deste voucher (no Pix, o total
 * com o desconto). É a conta do aviso de valor diferente (aplicarSessao e reativarPedidoRetido, src/lib/pagamento-stripe.ts).
 */
export function valorEsperadoDoPedido(r: Pick<Reserva, 'totalCentavos' | 'totalPixCentavos' | 'pedido' | 'pagamento'>): number {
  const total = r.pedido?.totalCentavos ?? r.totalCentavos;
  const totalPix = r.pedido ? r.pedido.totalPixCentavos : r.totalPixCentavos;
  return r.pagamento.metodo === 'pix' ? (totalPix ?? total) : total;
}

/** A linha do aviso de valor diferente (avisoDeValorDiferente, src/lib/pagamento-stripe.ts), lida de volta: o recebido. */
const AVISO_DE_VALOR_DIFERENTE = /^Aviso: a Stripe recebeu (.+?) e o pedido esperava .+?: conferir na Stripe/;

/**
 * O que a Stripe recebeu de verdade pelo pedido inteiro, só quando é DIFERENTE do que o pedido esperava
 * (valorEsperadoDoPedido); undefined quando é igual ou quando não há o que ler. Só acontece com uma sessão criada fora do
 * site (o site sempre cobra o valor do pedido): ON-HHPGZR e ON-6EJT3U receberam R$ 100,00 por R$ 154,00; ON-R4MM9Q, R$ 386,00
 * por R$ 396,00, e foi reativado (retestes de 23/11). De onde vem, na ordem:
 * - o pagamento parado de um pedido cancelado (pagamento.retido, Pacote 22): o valor que a sessão paga cobrou, que também
 *   é o pagamento do pedido reativado com ele;
 * - pagamento.recebidoCentavos, que aplicarSessao e reativarPedidoRetido gravam quando o valor difere (Pacote 23; no JSON
 *   `pagamento`, nos arquivos e no banco, sem migração);
 * - para os pedidos pagos antes do Pacote 23, a última linha do aviso "Aviso: a Stripe recebeu R$ … e o pedido esperava
 *   R$ …" do histórico.
 * Com o valor igual ao esperado, nada muda em lugar nenhum: quem usa esta função cai na conta de sempre.
 */
export function recebidoPelaStripe(
  r: Pick<Reserva, 'totalCentavos' | 'totalPixCentavos' | 'pedido' | 'pagamento' | 'historico'>,
): number | undefined {
  let lido: number | undefined;
  for (const h of r.historico) {
    const m = AVISO_DE_VALOR_DIFERENTE.exec(h.evento);
    if (m) lido = centavosDaCifra(m[1]);
  }
  const recebido = r.pagamento.retido?.valorCentavos ?? r.pagamento.recebidoCentavos ?? lido;
  return recebido !== undefined && recebido !== valorEsperadoDoPedido(r) ? recebido : undefined;
}

/**
 * O que entrou pelo pedido inteiro (os vouchers dele; o pagamento e o histórico são os do primeiro): o que a Stripe recebeu
 * de verdade quando difere do esperado (recebidoPelaStripe) ou, como sempre, a soma do que cada voucher vale na forma paga
 * (valorRecebido). É o número de tudo o que diz quanto foi PAGO ou quanto ainda dá para DEVOLVER: o valor do cartão do
 * painel, "Reembolsar tudo", o limite de "Reembolsar só o voucher", o resto da rota do painel, as estatísticas e as
 * páginas do cliente (paraPublico e a página do pedido).
 */
export function recebidoDoPedido(itens: readonly Reserva[]): number {
  const diferente = itens[0] ? recebidoPelaStripe(itens[0]) : undefined;
  return diferente ?? itens.reduce((soma, i) => soma + valorRecebido(i), 0);
}

/**
 * O total que a página do cliente mostra no pedido fechado, quando a Stripe recebeu um valor diferente do esperado; undefined
 * no resto (a conta de sempre). O pedido cancelado fica de fora: enquanto a equipe decide o pagamento parado, a página
 * nunca diz o valor dele (Pacote 22), e o pedido cancelado mostra o que ele custava.
 */
export const recebidoNaPaginaDoCliente = (
  r: Pick<Reserva, 'status' | 'totalCentavos' | 'totalPixCentavos' | 'pedido' | 'pagamento' | 'historico'>,
): number | undefined => (r.status === 'cancelado' ? undefined : recebidoPelaStripe(r));

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
 *   encerrado): é a mesma regra da faixa do topo (reembolsosParadosPelaContestacao, mais abaixo);
 * - o e-mail novo do Pacote 28 que não saiu (o reembolso, o pedido cancelado, o aviso do pedido pago), depois que um envio
 *   seguinte do mesmo e-mail sai (a marca dele vem depois do aviso).
 */
export function avisoAberto(historico: readonly { evento: string }[], indice: number): boolean {
  const linha = historico[indice]?.evento ?? '';
  if (!ehAviso(linha)) return false;
  // o pagamento que chegou para o pedido cancelado (Pacote 22): aberto até a linha da decisão da equipe sobre ele, ou até
  // uma linha do charge.refunded (planoDoReembolso, eventos.ts): num pedido cancelado com o parado, o pagamento do pedido
  // é o parado, e o reembolso feito direto na Stripe (ou confirmado antes da linha da decisão) também o fecha
  const retido = AVISO_DO_PAGAMENTO_RETIDO.exec(linha);
  if (retido) {
    const decisao = inicioDaDecisaoDoRetido(retido[1]);
    return !historico
      .slice(indice + 1)
      .some((h) => h.evento.startsWith(decisao) || h.evento.startsWith('Reembolso total (') || h.evento.startsWith('Reembolso de '));
  }
  const fechado = avisoDeReembolsoFechado(historico, indice);
  if (fechado !== null) return !fechado;
  if (PARADO_PELA_CONTESTACAO.test(linha)) return !contestacaoTerminaDepois(historico, indice);
  // o e-mail novo do Pacote 28 que não saiu (o reembolso, o pedido cancelado, o pedido pago à equipe): aberto até a marca
  // do mesmo e-mail aparecer depois dele (avisoDoEnvioFechado, src/lib/email/marcas.ts)
  const envio = avisoDoEnvioFechado(historico, indice);
  if (envio !== null) return !envio;
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
  // o pagamento parado de um pedido cancelado (Pacote 22): a reativação relê o pagamento na Stripe antes de gravar
  'stripe-fora': 'Não deu para conferir o pagamento na Stripe agora. Nada foi feito. Tente de novo em instantes.',
  'voucher-maior-que-o-resto':
    'Este voucher vale mais do que ainda resta deste pagamento: devolver só ele levaria tudo o que resta, e a Stripe trataria como reembolso total, com o pedido inteiro e todos os vouchers passando a reembolsado. Se é isso, use "Reembolsar tudo". Nada foi pedido à Stripe.',
  // Pacote 29: o campo "Gravar o hotel" do pedido com o hotel a informar
  'hotel-invalido': 'Escreva o nome do hotel ou da pousada (até 120 letras). Nada foi gravado.',
  // segunda revisão do Pacote 29: outra pessoa da equipe (ou outra aba) gravou outro nome no meio-tempo
  'hotel-ja-informado': 'Este pedido já tem um hotel gravado no painel (veja o histórico do pedido). Nada foi mudado.',
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
  /**
   * O que entrou: o total pela forma de pagamento registrada ou, quando a Stripe recebeu um valor diferente do esperado, o
   * que ela recebeu de verdade (recebidoDoPedido). `totalCentavos` continua sendo o que o pedido custa.
   */
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
        recebidoCentavos: recebidoDoPedido(itens),
        reembolsoCentavos: r.reembolsoCentavos ?? 0,
      };
    })
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

/** Quem cobrou, como o painel escreve embaixo da forma de pagamento. */
export const ROTULO_DO_PROVEDOR: Record<Provedor, string> = {
  stripe: 'Stripe',
  pagarme: 'Pagar.me (checkout antigo)',
  whatsapp: 'WhatsApp',
};

/**
 * As duas linhas embaixo do valor do pedido fechado (pago, cancelado, reembolsado, contestado): a forma de pagamento
 * ("Pix", o cartão com a bandeira e o final, ou "WhatsApp", quando a equipe ainda não anotou Pix nem cartão) e quem cobrou
 * (ROTULO_DO_PROVEDOR). Sem a segunda quando ela repetiria a primeira: no pedido do WhatsApp cancelado antes de pagar, o
 * cartão escrevia "WhatsApp" duas vezes (rodada com o banco de 17/11, cenário K). Pago pelo WhatsApp, continua "Pix" (ou
 * "Cartão") e, embaixo, "WhatsApp".
 */
export function formaEProvedorNoPainel(p: Pick<PedidoPainel, 'itens' | 'metodo' | 'provedor'>): { forma: string; provedor?: string } {
  const g = p.itens[0]?.pagamento;
  // a Stripe manda a bandeira em minúsculas ("visa", "mastercard")
  const bandeira = g?.cartaoBandeira ? g.cartaoBandeira.charAt(0).toUpperCase() + g.cartaoBandeira.slice(1) : '';
  const forma =
    p.metodo === 'pix'
      ? 'Pix'
      : p.metodo === 'cartao'
        ? `Cartão ${bandeira} ${g?.cartaoFinal ? `•••• ${g.cartaoFinal}` : ''}`.replace(/\s+/g, ' ').trim()
        : 'WhatsApp';
  const provedor = ROTULO_DO_PROVEDOR[p.provedor];
  return provedor === forma ? { forma } : { forma, provedor };
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

/**
 * Os status de um voucher que o painel escreve ao lado dele. "Reembolso pendente" é a mesma palavra que o cliente lê
 * (pedido.reembolsoPendenteTitulo, em português: o painel é só em português).
 */
const ROTULO_DO_VOUCHER = {
  reembolsado: 'Reembolsado',
  reembolsoPendente: 'Reembolso pendente',
  cancelado: 'Cancelado',
  usado: 'Usado',
} as const;

/**
 * O voucher como o painel lê para escrever o status dele: o status do pedido e o do item e, para o reembolso que falhou,
 * o que a página do cliente usa (o código, o pedido, o valor devolvido e o histórico; sem eles, nenhum reembolso falhou).
 */
export type VoucherNoPainel = Pick<Reserva, 'status' | 'statusItem'> &
  Partial<Pick<Reserva, 'codigo' | 'pedido' | 'reembolsoCentavos' | 'historico'>>;

/**
 * O dinheiro deste voucher ainda não voltou ao cliente: um reembolso que falhou na Stripe e diz respeito a ele (o do
 * próprio voucher ou o do pedido inteiro) ainda está pendente, pela conta da página do cliente (partesDaPagina, a mesma
 * que paraPublico faz para a página do voucher, src/lib/reserva-publica.ts, lida como o cliente lê). A falha deixa de
 * estar pendente quando a equipe registra a devolução por outro meio ou quando a contestação aberta depois dela é perdida
 * (o banco devolveu ao cliente); com a contestação ainda aberta, continua pendente, como o cliente lê.
 */
const reembolsoPendente = (v: VoucherNoPainel): boolean =>
  (partesDaPagina({ voucherDePedido: Boolean(v.pedido), codigo: v.codigo ?? '' }, v.reembolsoCentavos ?? 0, v.historico ?? [])
    ?.pendenteCentavos ?? 0) > 0;

/**
 * O que o painel escreve ao lado de cada voucher de um pedido com vários itens ("Voucher ON-… · R$ … · Reembolsado"): o
 * status de verdade do voucher, pela regra da página do cliente (statusDoVoucher, src/lib/reserva-publica.ts). O item
 * reembolsado ou cancelado sozinho mostra o próprio status; sem status próprio (ou "ativo", como o banco relê o item que
 * não mudou), o voucher acompanha o pedido, e o pedido reembolsado ou cancelado inteiro vale para ele também. Antes o
 * painel só lia o status do item: num pedido de dois itens com um voucher devolvido sozinho e o resto depois ("Reembolsar
 * tudo" ou a contestação perdida), o outro voucher aparecia sem "Reembolsado", embora o PDF dele já levasse à página da
 * reserva (reteste de 16-17/11, R7). O voucher reembolsado cujo reembolso falhou na Stripe e ainda não voltou ao cliente
 * mostra "Reembolso pendente", como a página do cliente (reembolsoPendente): antes o painel escrevia "Reembolsado" ao
 * lado do "Falta devolver R$ …: o reembolso falhou na Stripe" do mesmo cartão (o ON-A8RVZN do reteste de 17/11). O voucher
 * usado num pedido que continua valendo mostra "Usado". Nos outros casos, nada: o status do pedido, no alto do cartão, já
 * diz.
 */
export function statusDoVoucherNoPainel(v: VoucherNoPainel): string | undefined {
  const status =
    v.statusItem === 'reembolsado' || v.statusItem === 'cancelado'
      ? v.statusItem
      : v.status === 'reembolsado' || v.status === 'cancelado'
        ? v.status
        : undefined;
  if (status === 'reembolsado' && reembolsoPendente(v)) return ROTULO_DO_VOUCHER.reembolsoPendente;
  if (status) return ROTULO_DO_VOUCHER[status];
  return v.statusItem === 'usado' ? ROTULO_DO_VOUCHER.usado : undefined;
}

/** O status do pedido inteiro como o selo do cartão do painel escreve (o painel é só em português). */
export const ROTULO_DO_STATUS: Record<StatusReserva, string> = {
  pendente: 'Aguardando pagamento',
  pago: 'Pago',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  expirado: 'Tempo esgotado',
  aguardando_whatsapp: 'Finalizar no WhatsApp',
  reembolsado: 'Reembolsado',
  contestado: 'Contestado',
};

/**
 * O selo do pedido, no alto do cartão do painel (no pedido de um item, é o único rótulo dele): o status do pedido
 * inteiro. O pedido reembolsado com algum voucher em "Reembolso pendente" (statusDoVoucherNoPainel, a mesma conta: um
 * reembolso que falhou na Stripe e o dinheiro ainda não voltou ao cliente, como a página do cliente lê) mostra "Reembolso
 * pendente". Antes o selo dizia "Reembolsado" ao lado de "Falta devolver R$ …: o reembolso falhou na Stripe", e o cliente
 * lia "Reembolso pendente" (o ON-SZA5W6 do reteste de 17-18/11, defeito 6: o Pacote 15 tinha consertado só as linhas dos
 * vouchers). Quando a falha deixa de estar pendente (a devolução por outro meio registrada, ou a contestação aberta depois
 * dela perdida), o selo volta a "Reembolsado". A cor do selo continua a do status do pedido.
 */
export function seloDoPedidoNoPainel(p: Pick<PedidoPainel, 'status' | 'itens'>): string {
  if (p.status === 'reembolsado' && p.itens.some((i) => statusDoVoucherNoPainel(i) === ROTULO_DO_VOUCHER.reembolsoPendente)) {
    return ROTULO_DO_VOUCHER.reembolsoPendente;
  }
  return ROTULO_DO_STATUS[p.status];
}

/**
 * As linhas do histórico que dizem que o dinheiro do pedido entrou: as das ações manuais do painel ("Marcada como paga no
 * admin", "… no Pix, no admin", "… no cartão, no admin": ACOES_MANUAIS, src/app/api/admin/reservas/[codigo]/route.ts),
 * a da Stripe ("Pago (webhook da Stripe)", "Pago (consulta à Stripe)": aplicarSessao, src/lib/pagamento-stripe.ts) e a
 * do checkout antigo ("Status pago (webhook Pagar.me)").
 */
const LINHA_DE_PAGO = /^(?:Marcada como paga\b|Pago \(|Status pago \()/;

/**
 * O pedido nunca foi pago: não está pago, não tem a hora do pagamento (pagamento.pagoEm, que o site grava sempre que um
 * pedido vira pago: à mão no painel, pela Stripe e, antes, pelo checkout antigo) e nenhuma linha do histórico diz que ele
 * chegou a ser pago. O pedido pago e depois cancelado tem as duas coisas.
 */
export const pedidoNuncaPago = (r: Pick<Reserva, 'status' | 'pagamento' | 'historico'>): boolean =>
  r.status !== 'pago' && !r.pagamento.pagoEm && !r.historico.some((h) => LINHA_DE_PAGO.test(h.evento));

/**
 * O pedido fora da Stripe (o do WhatsApp, ou um do checkout antigo) que nunca foi pago, como o do WhatsApp cancelado
 * antes de a equipe marcar "Pago no Pix" ou "Pago no cartão" (o ON-5NHDBL do reteste de 17-18/11, pergunta 11, com a
 * resposta recomendada): o painel escreve "não pago" junto do valor, que em letra grande parecia dinheiro recebido, e não
 * oferece "Marcar reembolsado" (não há o que devolver); a rota do painel recusa essa ação feita por uma aba antiga
 * (acao-nao-vale). O pedido pago pelo WhatsApp, mesmo cancelado depois, fica como sempre. O pedido da Stripe fica de fora:
 * nele o painel nunca oferece "Marcar reembolsado", e o pagamento que chega depois do cancelamento fica só numa linha do
 * histórico ("Pagamento na Stripe de um pedido cancelado (…): devolver ao cliente") ou, desde o Pacote 22, fica parado na
 * Stripe à espera da equipe (pagamento.retido), sem a hora do pagamento: ali "não pago" seria falso.
 */
export const naoPagoNoPainel = (p: Pick<PedidoPainel, 'provedor' | 'itens'>): boolean =>
  p.provedor !== 'stripe' && p.itens[0] !== undefined && pedidoNuncaPago(p.itens[0]);

/** O que o painel escreve junto do valor do pedido que nunca foi pago (naoPagoNoPainel). */
export const NAO_PAGO = 'não pago';

/**
 * O motivo da falha de um reembolso (o failure_reason da Stripe: docs.stripe.com/refunds, "Handle failed refunds") em
 * português, para a equipe. A linha do histórico continua com o código cru: é ela que a leitura usa.
 */
const MOTIVO_DO_REEMBOLSO_FALHO = new Map<string, string>([
  ['expired_or_canceled_card', 'cartão vencido ou cancelado'],
  ['lost_or_stolen_card', 'cartão dado como perdido ou roubado'],
  ['declined', 'recusado pelo banco'],
  ['insufficient_funds', 'faltou saldo disponível na conta da Stripe'],
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
  // o pagamento que chegou com o pedido cancelado e que a equipe mandou devolver (Pacote 22): o pedido continua cancelado,
  // e a devolução que falhar na Stripe segue o caminho de sempre ("Falta devolver …", o botão de registrar e a faixa)
  const devolucaoDoRetido = p.status === 'cancelado' && r.pagamento.retido?.decisao?.acao === 'devolver';
  if (p.status !== 'pago' && p.status !== 'reembolsado' && !devolucaoDoRetido) return { tipo: 'nenhum' };
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

/* ------------------------------------------------------------------ */
/* O toque repetido nos botões do painel (rodada com o banco de 17/11)  */

// Os botões do painel são formulários simples: o duplo toque, ou uma aba antiga do painel, manda a mesma ação duas vezes.
// A rota confere de novo, dentro da trava de versão do pedido, com estas regras, e a segunda vez não grava nada (a volta
// ao painel é a de sempre). A primeira grava exatamente como antes.

/**
 * A ação manual do painel ("Pago no Pix", "Pago no cartão", "Marcar como pago", "Cancelar", "Marcar reembolsado") que não
 * muda nada: o pedido já está no status dela e, quando ela diz a forma, já com essa forma. Nada é gravado: nem a linha de
 * novo, nem o aviso de compra, nem o e-mail. Na rodada com o banco de 17/11, o "Pago no Pix" mandado duas vezes gravou
 * "Marcada como paga no Pix, no admin" duas vezes. Trocar a forma ("Pago no Pix" e depois "Corrigir: foi no cartão") ou o
 * status ("Cancelar" num pedido do WhatsApp já pago) é mudança e grava a linha, como sempre.
 */
export const acaoManualRepetida = (
  r: { status: StatusReserva; pagamento: { metodo: MetodoPagamento } },
  acao: { status: StatusReserva; metodo?: MetodoPagamento },
): boolean => r.status === acao.status && (!acao.metodo || r.pagamento.metodo === acao.metodo);

/** A idade mínima da linha do voucher devolvido por outro meio para outro clique completar a marca do voucher. */
export const ESPERA_PARA_COMPLETAR_O_VOUCHER_MS = 60_000;

/**
 * "Registrar: voucher ON-… (R$ …) devolvido por outro meio" grava duas vezes: primeiro, com a trava de versão do pedido,
 * a linha do pedido e o valor (uma vez só); depois, a marca do voucher (atualizar_item, que sempre grava a linha dele). A
 * marca sai só pela requisição que gravou a linha do pedido (`escreveu`). Quem acha a linha já gravada (o duplo toque, a
 * aba antiga) não marca de novo, a não ser que ela tenha mais de 60 segundos (`linhaEm`) e o voucher ainda esteja pago
 * (nem reembolsado nem cancelado): aí a função foi cortada entre as duas gravações, e este clique completa, sem somar o
 * valor de novo. Na rodada com o banco de 17/11, o duplo clique gravou "Item ON-… marcado como devolvido no painel (por
 * outro meio)" duas vezes. Uma hora que não dá para ler, ou no futuro, não completa.
 */
export function marcaOVoucherPorFora(
  gravacao: { escreveu?: boolean; linhaEm?: string },
  agora: Date,
  voucher: Pick<Reserva, 'statusItem'>,
): boolean {
  if (gravacao.escreveu) return true;
  if (gravacao.linhaEm === undefined || !voucherPago(voucher)) return false;
  return agora.getTime() - Date.parse(gravacao.linhaEm) > ESPERA_PARA_COMPLETAR_O_VOUCHER_MS;
}

/**
 * "Foi o voucher ON-… (R$ …): marcar como devolvido" ainda vale, relido dentro da trava de versão (a rota grava a marca do
 * voucher e a linha juntas, numa gravação só): o pedido pago, o voucher ativo e o reembolso feito direto na Stripe ainda
 * sem dono. O segundo toque, a aba antiga do painel, ou o botão de outro voucher para o mesmo reembolso, acham o reembolso
 * já ligado (a linha linhaDoVoucherLigado começa com inicioDoReembolsoResolvido, src/lib/reembolsos-a-resolver.ts) e não
 * gravam nada: um reembolso, um voucher. Antes, cada toque chamava atualizar_item, e dois toques rápidos passavam pelas
 * conferências da rota antes de o primeiro chegar ao banco.
 */
export const voucherDaStripeAindaLiga = (r: Pick<Reserva, 'status' | 'statusItem' | 'historico'>, reembolsoId: string): boolean =>
  r.status === 'pago' && voucherAtivo(r) && reembolsosSemVoucher(r.historico).some((s) => s.id === reembolsoId && !s.resolvido);

/* ------------------------------------------------------------------ */
/* As ações manuais pelo status de partida (reteste de 22/11)          */

/** Os pedidos cuja forma de pagamento ainda não fechou: os dois totais (Pix e cartão) continuam valendo. */
export const EM_ABERTO: readonly StatusReserva[] = ['aguardando_whatsapp', 'pendente', 'expirado', 'recusado'];

/**
 * As ações manuais do painel, na ordem em que os botões aparecem (as chaves de ACOES_MANUAIS, em
 * src/app/api/admin/reservas/[codigo]/route.ts; um teste confere que são as mesmas).
 */
export const ACOES_MANUAIS_DO_PAINEL = ['pago_pix', 'pago_cartao', 'marcar_pago', 'cancelar', 'reembolsado'] as const;
export type AcaoManualDoPainel = (typeof ACOES_MANUAIS_DO_PAINEL)[number];

/**
 * A ação manual que o painel oferece a partir do estado em que o pedido está (o voucher que o representa: o status, quem
 * cobrou, a forma e o histórico). É a regra única dos botões "Pago no Pix", "Pago no cartão", "Marcar como pago",
 * "Corrigir: foi no Pix", "Corrigir: foi no cartão", "Cancelar" e "Marcar reembolsado": a página do painel monta os botões
 * por ela (Acoes, src/app/admin/page.tsx) e a rota do painel a confere de novo dentro da trava de versão do pedido, com
 * o pedido relido. Assim a aba antiga do painel não faz o que a tela de agora não oferece: no reteste de 22/11, o "Pago
 * no Pix" de uma aba aberta antes do cancelamento marcou como pago um pedido do WhatsApp já cancelado (ON-ZELYQN), e o
 * e-mail do pagamento aprovado, com o voucher, foi agendado (no ar, sairia para o cliente). A regra:
 * - 'pago_pix' e 'pago_cartao': no pedido do WhatsApp em aberto (EM_ABERTO, com a forma ainda por decidir:
 *   pagamento.metodo 'whatsapp', que um pedido da Stripe nunca tem), em que a forma de pagamento só se decide agora; e no
 *   pedido pago fora da Stripe e fora do checkout antigo (sem pagamento.pedidoId), só para a OUTRA forma (os botões
 *   "Corrigir": marcou errado, dá para trocar);
 * - 'marcar_pago': no pedido em aberto que não é do WhatsApp nem da Stripe (o checkout antigo). Pela Stripe ninguém
 *   marca pago à mão: só o aviso dela (ou a consulta à sessão) muda o status;
 * - 'cancelar': em qualquer pedido que não está cancelado nem reembolsado, menos o pago ou contestado pela Stripe (esse
 *   se desfaz com o reembolso, não com o cancelamento);
 * - 'reembolsado': fora da Stripe, no pedido pago ou no cancelado que chegou a ser pago (pedidoNuncaPago: no do WhatsApp
 *   cancelado antes de pagar não há o que devolver).
 * Uma ação que a lista não conhece nunca é oferecida.
 */
export function acaoManualOferecida(r: Pick<Reserva, 'status' | 'provedor' | 'pagamento' | 'historico'>, acao: string): boolean {
  const stripe = provedorDaReserva(r) === 'stripe';
  const emAberto = EM_ABERTO.includes(r.status);
  const metodo = r.pagamento.metodo;
  // marcou errado: dá para trocar, menos no pagamento online, que veio do sistema de pagamento
  const corrige = r.status === 'pago' && !stripe && !r.pagamento.pedidoId;
  switch (acao) {
    case 'pago_pix':
      return (emAberto && metodo === 'whatsapp') || (corrige && metodo !== 'pix');
    case 'pago_cartao':
      return (emAberto && metodo === 'whatsapp') || (corrige && metodo !== 'cartao');
    case 'marcar_pago':
      return emAberto && metodo !== 'whatsapp' && !stripe;
    case 'cancelar':
      return r.status !== 'cancelado' && r.status !== 'reembolsado' && !(stripe && (r.status === 'pago' || r.status === 'contestado'));
    case 'reembolsado':
      return !stripe && (r.status === 'pago' || r.status === 'cancelado') && !pedidoNuncaPago(r);
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* O pagamento que chega para um pedido cancelado (Pacote 22, 23/11)    */

// Decisão do dono de 23/11/2026: o pagamento que chega para um pedido que a equipe já cancelou e que nunca foi pago não
// volta sozinho ao cliente. O dinheiro fica parado na Stripe (pagamento.retido, gravado por aplicarSessao, a porta única,
// src/lib/pagamento-stripe.ts) e a equipe decide no painel: devolver ao cliente ou reativar o pedido. Cancelar no painel
// já fecha a sessão e cancela o Pix do QR: isto só acontece numa corrida (o cliente paga no instante do cancelamento) ou
// com uma sessão criada fora do site.

/** A linha destacada do histórico, escrita uma vez, quando o pagamento fica parado. */
export const avisoDoPagamentoRetido = (centavos: number, paymentIntentId: string): string =>
  `Aviso: chegou um pagamento de ${cifra(centavos)} para este pedido cancelado (${paymentIntentId}): decidir no painel se devolve o dinheiro ou reativa o pedido`;
/** A mesma linha, lida de volta: o id do pagamento. */
const AVISO_DO_PAGAMENTO_RETIDO = /^Aviso: chegou um pagamento de .+? para este pedido cancelado \(([^()]+)\): decidir no painel/;

/** O começo das duas linhas da decisão da equipe sobre o pagamento parado: elas fecham o aviso (avisoAberto). */
export const inicioDaDecisaoDoRetido = (paymentIntentId: string): string => `Decisão sobre o pagamento ${paymentIntentId}`;
/** A equipe mandou devolver: a linha do pedido à Stripe, com o id do reembolso (como as outras devoluções pedidas). */
export const linhaDaDevolucaoDoRetido = (paymentIntentId: string, centavos: number, reembolsoId: string): string =>
  `${inicioDaDecisaoDoRetido(paymentIntentId)}: devolver ${cifra(centavos)} ao cliente. Devolução solicitada na Stripe (${reembolsoId}); o pedido continua cancelado`;
/** A equipe reativou o pedido: ele fica pago com este pagamento, e os vouchers voltam a valer. */
export const linhaDaReativacao = (paymentIntentId: string, centavos: number): string =>
  `${inicioDaDecisaoDoRetido(paymentIntentId)}: pedido reativado no painel, pago com este pagamento (${cifra(centavos)}); os vouchers voltam a valer`;

/** As duas ações do pagamento parado, na ordem dos botões do painel. */
export const ACOES_DO_PAGAMENTO_RETIDO = ['devolver_retido', 'reativar_retido'] as const;
export type AcaoDoPagamentoRetido = (typeof ACOES_DO_PAGAMENTO_RETIDO)[number];

/** O pedido como a regra do pagamento parado o lê (o voucher que representa o pedido). */
export type PedidoComPagamentoRetido = Pick<Reserva, 'status' | 'provedor' | 'pagamento' | 'reembolsoCentavos'>;

/**
 * A regra única das duas ações do pagamento parado: a página do painel monta os botões por ela e a rota do painel a
 * confere de novo dentro da trava de versão, com o pedido relido (como acaoManualOferecida). Só no pedido da Stripe ainda
 * cancelado, com o pagamento parado e sem nada devolvido a ele (um reembolso feito direto na Stripe também encerra a
 * escolha):
 * - 'reativar_retido': enquanto a equipe não decidiu nada;
 * - 'devolver_retido': enquanto não decidiu nada e também na devolução começada sem a resposta da Stripe (a função
 *   cortada no meio, ou o segundo toque de quem começou): o mesmo botão completa, com a mesma chave de idempotência, e a
 *   Stripe devolve o mesmo reembolso.
 * As duas se excluem: reativado, nada de devolver; devolução começada, nada de reativar. Uma ação desconhecida nunca vale.
 */
export function acaoDoRetidoOferecida(r: PedidoComPagamentoRetido, acao: string): boolean {
  const retido = r.pagamento.retido;
  if (!retido || r.status !== 'cancelado' || provedorDaReserva(r) !== 'stripe' || (r.reembolsoCentavos ?? 0) > 0) return false;
  const d = retido.decisao;
  switch (acao) {
    case 'devolver_retido':
      return !d || (d.acao === 'devolver' && !d.reembolsoId);
    case 'reativar_retido':
      return !d;
    default:
      return false;
  }
}

/**
 * A ação já está feita (o duplo toque, ou a aba antiga, depois de ela dar certo): a devolução com o reembolso já gravado,
 * ou o pedido já reativado com este pagamento. A rota volta como a que deu certo, sem gravar nada.
 */
export function acaoDoRetidoRepetida(r: Pick<Reserva, 'pagamento'>, acao: string): boolean {
  const d = r.pagamento.retido?.decisao;
  if (acao === 'devolver_retido') return d?.acao === 'devolver' && Boolean(d.reembolsoId);
  if (acao === 'reativar_retido') return d?.acao === 'reativar';
  return false;
}

/**
 * O pedido reativado no painel e pago pelo pagamento que estava parado (Pacote 22): é nele que o toque repetido em
 * "Reativar o pedido (fica pago)" refaz a volta dos vouchers irmãos que ficaram 'cancelado' (Pacote 25, achado B3).
 */
export const pagoPeloRetidoReativado = (r: Pick<Reserva, 'status' | 'paymentIntentId' | 'pagamento'>): boolean =>
  r.status === 'pago' &&
  r.pagamento.retido?.decisao?.acao === 'reativar' &&
  Boolean(r.paymentIntentId) &&
  r.paymentIntentId === r.pagamento.retido.paymentIntentId;

/**
 * Os vouchers do pedido reativado que ainda estão 'cancelado' (relidos depois de o pedido ficar pago): no banco, cancelar
 * levou todos os itens a 'cancelado' e gravar o pedido como pago só muda o item do voucher gravado. Os outros voltam a
 * valer na reativação, um por um; o que falhou continua aqui e volta no toque repetido.
 */
export const irmaosAindaCancelados = <T extends Pick<Reserva, 'codigo' | 'statusItem'>>(releitura: readonly T[], gravado: string): T[] =>
  releitura.filter((v) => v.codigo !== gravado && v.statusItem === 'cancelado');

/**
 * "Devolver R$ … ao cliente", passo 1, dentro da trava de versão e ANTES de pedir à Stripe: marca a decisão de devolver
 * (sem o reembolso ainda), para a reativação não valer mais. 'gravar': esta requisição marcou (gravar o pedido);
 * 'ja-marcada': a devolução já estava começada (o segundo toque de quem começou, ou a volta depois de uma falha no meio):
 * nada a gravar, e a requisição segue (a Stripe devolve o mesmo reembolso pela chave de idempotência); 'nao-vale': a regra
 * não vale mais com o pedido relido (reativado, devolvido, outro pagamento): nada a gravar, e nada é pedido à Stripe.
 */
export function marcarDevolucaoDoRetido(
  r: PedidoComPagamentoRetido,
  paymentIntentId: string,
  agoraIso: string,
): 'gravar' | 'ja-marcada' | 'nao-vale' {
  const retido = r.pagamento.retido;
  if (!retido || retido.paymentIntentId !== paymentIntentId || !acaoDoRetidoOferecida(r, 'devolver_retido')) return 'nao-vale';
  if (retido.decisao) return 'ja-marcada';
  retido.decisao = { acao: 'devolver', em: agoraIso };
  return 'gravar';
}

/**
 * A Stripe não devolveu (a rede, a Stripe fora do ar, a recusa): tira a marca da devolução começada, se ela ainda está sem
 * o reembolso, e o pedido volta à escolha (os dois botões). true: houve o que gravar.
 */
export function desfazerDevolucaoDoRetido(r: Pick<Reserva, 'pagamento'>, paymentIntentId: string): boolean {
  const retido = r.pagamento.retido;
  if (!retido || retido.paymentIntentId !== paymentIntentId || retido.decisao?.acao !== 'devolver' || retido.decisao.reembolsoId) {
    return false;
  }
  delete retido.decisao;
  return true;
}

/**
 * "Devolver R$ … ao cliente", passo 2, dentro da trava, com o reembolso que a Stripe devolveu: grava o id do reembolso na
 * decisão e a linha do pedido à Stripe (linhaDaDevolucaoDoRetido), uma vez só. Devolve a linha a registrar, '' quando só
 * a decisão muda (a linha já estava lá), ou null quando não há nada a gravar: o segundo toque (o mesmo reembolso já
 * gravado) e o pedido reativado no meio-tempo.
 */
export function concluirDevolucaoDoRetido(
  r: Pick<Reserva, 'pagamento' | 'historico'>,
  paymentIntentId: string,
  reembolso: { id: string; centavos: number },
  agoraIso: string,
): string | null {
  const retido = r.pagamento.retido;
  if (!retido || retido.paymentIntentId !== paymentIntentId || retido.decisao?.acao === 'reativar') return null;
  const anotado = r.historico.some((h) => h.evento.includes(`(${reembolso.id})`));
  if (retido.decisao?.reembolsoId === reembolso.id && anotado) return null;
  retido.decisao = { acao: 'devolver', em: retido.decisao?.em ?? agoraIso, reembolsoId: reembolso.id };
  return anotado ? '' : linhaDaDevolucaoDoRetido(paymentIntentId, reembolso.centavos, reembolso.id);
}

/** O pedido tem um pagamento parado esperando a decisão da equipe (a frase vermelha, a faixa e os botões). */
export const pagamentoRetidoADecidir = (r: PedidoComPagamentoRetido): boolean => acaoDoRetidoOferecida(r, 'devolver_retido');

/** A frase vermelha do cartão do pedido com o pagamento parado. */
export const fraseDoPagamentoRetido = (centavos: number): string =>
  `Este pedido estava cancelado e recebeu um pagamento de ${cifra(centavos)}. O dinheiro está parado na Stripe: escolha devolver ao cliente ou reativar o pedido.`;

/** Os dois botões, cada um com a caixa de confirmar (a de devolver é a mesma dos outros reembolsos). */
export const botaoDevolverRetido = (centavos: number) => ({
  rotulo: `Devolver ${cifra(centavos)} ao cliente`,
  confirmacao: confirmacaoDoReembolso(centavos),
});
export const BOTAO_REATIVAR_RETIDO = {
  rotulo: 'Reativar o pedido (fica pago)',
  confirmacao: 'Confirmo: o pedido volta a valer, pago, e o cliente recebe o e-mail com os vouchers.',
} as const;

/** Quantos pedidos têm um pagamento parado esperando a decisão (a faixa do topo). */
export const contarPagamentosRetidos = (pedidos: readonly Pick<PedidoPainel, 'itens'>[]): number =>
  pedidos.filter((p) => p.itens[0] !== undefined && pagamentoRetidoADecidir(p.itens[0])).length;

/** A faixa do topo do painel; nenhuma sem pedido. */
export const avisoDosPagamentosRetidos = (n: number): string | null =>
  n <= 0
    ? null
    : n === 1
      ? '1 pedido cancelado recebeu pagamento: decidir se devolve ou reativa'
      : `${n} pedidos cancelados receberam pagamento: decidir se devolve ou reativa`;

/**
 * O e-mail à equipe do pagamento parado (enviarAvisoDoPagamentoRetido, src/lib/email/pedidos.ts), lido do pedido: o
 * valor, ou null quando o e-mail deste pagamento já saiu (marcaDoAvisoDoPagamentoRetido), o pagamento parado do pedido é
 * outro ou já não há o que decidir (a equipe decidiu antes de o e-mail sair). Um por pagamento.
 */
export function avisoDoPagamentoRetidoPorEmail(
  r: PedidoComPagamentoRetido & Pick<Reserva, 'historico'>,
  paymentIntentId: string,
): { centavos: number } | null {
  const marca = marcaDoAvisoDoPagamentoRetido(paymentIntentId);
  if (r.historico.some((h) => h.evento.startsWith(marca))) return null;
  const retido = r.pagamento.retido;
  if (!retido || retido.paymentIntentId !== paymentIntentId || !pagamentoRetidoADecidir(r)) return null;
  return { centavos: retido.valorCentavos };
}

/* ------------------------------------------------------------------ */
/* A volta ao painel depois de uma ação (reteste de 22/11)             */

/**
 * O máximo de letras da busca do painel: a caixa "Buscar pedido, voucher, nome, hotel…" não aceita mais que isto
 * (maxLength), e é onde a rota corta a busca que volta no endereço. Cabe o maior campo que a busca compara (o e-mail do
 * pedido, até 160 letras).
 */
export const BUSCA_DO_PAINEL_MAXIMO = 160;

/**
 * A busca do painel como ela vale: sem os espaços das pontas e cortada no máximo que a caixa aceita. Qualquer coisa que
 * não seja texto (o campo que não veio, um arquivo num formulário montado à mão) é busca nenhuma.
 */
export const buscaDoPainel = (valor: unknown): string => (typeof valor === 'string' ? valor.trim().slice(0, BUSCA_DO_PAINEL_MAXIMO) : '');

/**
 * O endereço para onde a rota das ações do painel volta, com sucesso ou com erro: o painel, com o filtro de status e a
 * busca em que a equipe estava e, na ação recusada, o código do erro (ERROS_DO_PAINEL). Até o reteste de 22/11 a volta só
 * levava o filtro: depois de cada ação o painel voltava sem a busca, desenhava a lista inteira e a equipe tinha de buscar
 * o pedido de novo para ver o resultado. Tudo é escrito pelo URLSearchParams, nunca colado no endereço: uma busca com
 * "&", "#", espaços ou acentos volta inteira e não vira outro parâmetro. O caminho é sempre /admin, no mesmo site de
 * `base`.
 */
export function voltaAoPainel(base: string | URL, volta: { filtro?: string; busca?: string; erro?: ErroDoPainel }): URL {
  const endereco = new URL('/admin', base);
  if (volta.filtro) endereco.searchParams.set('status', volta.filtro);
  const busca = buscaDoPainel(volta.busca);
  if (busca) endereco.searchParams.set('q', busca);
  if (volta.erro) endereco.searchParams.set('erro', volta.erro);
  return endereco;
}
