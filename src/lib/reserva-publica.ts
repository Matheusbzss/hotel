import { timingSafeEqual } from 'node:crypto';
import type { PagamentoOnlineCarrinho, TextosPagamentoOnline } from '@/components/carrinho/FormularioCarrinho';
import type { TextosPagarPedido } from '@/components/pagamento/CheckoutEmbutido';
import type { TextosDesistencia } from '@/components/pagamento/DesistirDaCompra';
import { DESCONTO_PIX_PORCENTO } from '@/config/precos';
import { obterPasseio } from '@/data/passeios';
import { dicionario, type Dicionario } from '@/i18n';
import { fmt, rota, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import type { ItemVisivel } from './carrinho';
import { formasDoPagamento, valorACobrar, type FormaPagamento, type ItemCobravel, type ItemPagavel } from './formas-pagamento';
import { formatarHora } from './horarios';
import { semFaixas } from './passeio-view';
import { provedorDaReserva, valorRecebido } from './pedidos-painel';
import { textoPessoas } from './pessoas';
import { chaveDaRecusa, type ChaveRecusa } from './recusas';
import { ehTransfer, type Provedor, type Reserva, type StatusReserva } from './reservas';
import { transferVisivel, type TransferVisivel } from './transfer-view';
import { NOME_CIDADE_HOSPEDAGEM } from './validacao';
import { mensagemDoErro } from './erros.ts';

/**
 * Dados da reserva que podem aparecer para o cliente (com o link secreto). Nunca saem daqui: o token, o
 * histórico, os ids da Stripe, o motivo cru da recusa (só a chave do texto, sem revelar fraude ou cartão
 * roubado) e qualquer dado do cartão além da bandeira e dos 4 últimos dígitos.
 */
export interface ReservaPublica {
  codigo: string;
  /** O status deste voucher: o do pedido ou, se o item foi cancelado ou reembolsado sozinho, o do item. */
  status: StatusReserva;
  tipo: 'passeio' | 'transfer';
  /** No transfer, "transfer" (o código do produto no Pixel). */
  passeioSlug: string;
  /** No transfer, "Transfer privado". */
  passeioNome: string;
  data: string;
  /** A hora no idioma da página ("9h", "9am") e se é a da busca na hospedagem. */
  horario?: { texto: string; busca: boolean };
  adultos: number;
  criancas: number;
  /** "2 adultos + 1 criança (meia)", ou "4 passageiros" no transfer, no idioma da página. */
  pessoasTexto: string;
  /** Opção escolhida (ex.: "2 horas"), quando o passeio tem opções. */
  opcaoNome?: string;
  unidades: number;
  /** Em aberto, o total no cartão; pago, o que entrou (no Pix, com o desconto). */
  totalCentavos: number;
  /** O total no Pix, enquanto o pagamento está em aberto (pelo WhatsApp, pendente ou expirado). */
  totalPixCentavos?: number;
  nome: string;
  hotel: string;
  cidadeHospedagem: string;
  /** Só no transfer: veículo, trechos, malas e cadeirinhas, já no idioma da página. */
  transfer?: TransferVisivel;
  metodo: Reserva['pagamento']['metodo'];
  /** A forma de pagamento online escolhida (cartão ou Pix); ausente no caminho do WhatsApp. */
  forma?: FormaPagamento;
  /** Quem processa o pagamento: a Stripe, a equipe pelo WhatsApp ou o checkout antigo. */
  provedor: Provedor;
  /** Só no voucher de um pedido do carrinho com vários itens. */
  pedidoCodigo?: string;
  cartaoBandeira?: string;
  cartaoFinal?: string;
  /**
   * A última recusa do cartão, enquanto o pedido não está pago, já como a chave do texto (recusa.<chave>):
   * nunca o decline_code cru. O Pix vencido sem pagamento não é recusa: aparece só como status expirado.
   */
  recusa?: ChaveRecusa;
  /** Quanto o cliente viu na moeda dele (Adaptive Pricing), na menor unidade dela. */
  apresentado?: { moeda: string; valorCentavos: number };
  /** Quanto já voltou para o cliente, em centavos (reembolso total ou de um item só). */
  reembolsoCentavos?: number;
}

/** O motivo que pagamento-stripe.ts grava quando o Pix gerado não foi pago no prazo: não é recusa de cartão. */
const PIX_EXPIRADO = 'pix_expirado';

/** A chave do texto da última recusa do cartão, ou nada (pedido pago, sem recusa, ou o Pix que venceu). */
export function recusaDoPedido(status: StatusReserva, motivoCodigo: string | undefined): ChaveRecusa | undefined {
  if (status === 'pago' || !motivoCodigo || motivoCodigo === PIX_EXPIRADO) return undefined;
  return chaveDaRecusa(motivoCodigo);
}

/** O link privado do pedido (a página do pedido leva sozinha à da reserva quando ele tem um item só). */
export const linkDoPedido = (idioma: Idioma, codigo: string, token: string): string =>
  `${rota(idioma, `/pedido/${codigo}`)}?t=${encodeURIComponent(token)}`;

export function tokenConfere(reserva: Reserva, token: string | undefined | null): boolean {
  if (!token) return false;
  const a = Buffer.from(reserva.token);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** O status que o cliente vê neste voucher: um item cancelado ou reembolsado sozinho mostra o próprio status. */
export function statusDoVoucher(r: Pick<Reserva, 'status' | 'statusItem'>): StatusReserva {
  return r.statusItem === 'cancelado' || r.statusItem === 'reembolsado' ? r.statusItem : r.status;
}

/** O pagamento ainda está em aberto: as duas formas (Pix com desconto e cartão) continuam valendo. */
export const pagamentoEmAberto = (status: StatusReserva): boolean =>
  status === 'aguardando_whatsapp' || status === 'pendente' || status === 'expirado';

export type { ItemPagavel };

/** Os vouchers de um pedido como itens pagáveis (para "pagar de novo" na página do pedido). */
export function itensPagaveis(reservas: Reserva[]): ItemPagavel[] {
  return reservas.map((r) => ({
    tipo: r.tipo ?? 'passeio',
    data: r.data,
    totalCentavos: r.totalCentavos,
    ...(r.totalPixCentavos !== undefined ? { totalPixCentavos: r.totalPixCentavos } : {}),
    ...(ehTransfer(r) ? { transfer: { ida: { hora: r.transfer.ida.hora } } } : r.horario ? { horario: { hora: r.horario.hora } } : {}),
  }));
}

/** Os itens do carrinho como itens pagáveis: é com eles que a página do checkout pergunta formasDisponiveis. */
export function itensPagaveisDoCarrinho(
  itens: Pick<ItemVisivel, 'tipo' | 'escolha' | 'totalCentavos' | 'totalPixCentavos'>[],
): ItemPagavel[] {
  return itens.map((i) => ({
    tipo: i.tipo,
    totalCentavos: i.totalCentavos,
    totalPixCentavos: i.totalPixCentavos,
    ...(i.escolha.tipo === 'transfer'
      ? { data: i.escolha.ida.data, transfer: { ida: { hora: i.escolha.ida.hora } } }
      : { data: i.escolha.data, horario: { hora: i.escolha.hora } }),
  }));
}

/** Quanto cada forma cobra pelos itens, em centavos (nas casas, o sinal): o que a escolha cartão x Pix mostra. */
export function totaisDasFormas(itens: ItemCobravel[]): { cartaoCentavos: number; pixCentavos: number } {
  return { cartaoCentavos: valorACobrar(itens, 'cartao'), pixCentavos: valorACobrar(itens, 'pix') };
}

/* ------------------------------------------------------------------ */
/* Os textos das telas de pagamento, a partir do dicionário             */

/** O texto do pedido ou do voucher reembolsado por inteiro (a página do pedido e a da reserva). */
export const textoReembolsado = (d: Dicionario): string => d.pedido.reembolsadoTexto;

/**
 * Os textos da tela de pagar um pedido em aberto (página do pedido e da reserva), nas chaves checkout.*, pedido.* e recusa.*.
 * `varios`: o pedido tem mais de um item, e cada item tem o seu voucher; a frase de espera fala em "vouchers".
 */
export function textosDoPagamento(d: Dicionario, varios = false): TextosPagarPedido {
  const C = d.checkout;
  const P = d.pedido;
  return {
    formaPagamento: C.formaPagamento,
    cartao: C.cartao,
    pix: C.pix,
    cartaoAvista: C.cartaoAvista,
    pixExplicacao: C.pixExplicacao,
    pixApps: C.pixApps,
    pixRecebedor: C.pixRecebedor,
    descontoPix: d.preco.descontoPix,
    semPixPrazo: P.semPixPrazo,
    semPixLimite: P.semPixLimite,
    dolar: d.preco.dolar,
    pagar: C.pagar,
    pagamento: C.pagamento,
    seguro: C.seguro,
    processando: C.processando,
    erroGenerico: C.erros.generico,
    confirmando: P.confirmando,
    confirmandoTexto: P.confirmandoTexto,
    atualizaSozinho: varios ? P.atualizaSozinho : d.reserva.atualizaSozinho,
    pagarAgora: P.pagar,
    pagarDeNovo: P.pagarDeNovo,
    tempoEsgotado: P.tempoEsgotado,
    tempoEsgotadoTexto: P.tempoEsgotadoTexto,
    semPrazo: P.semPrazo,
    recusadoTitulo: P.recusadoTitulo,
    recusadoPix: fmt(P.recusadoPix, { p: DESCONTO_PIX_PORCENTO }),
    dicaInternacional: P.dicaInternacional,
    tentarOutroCartao: P.tentarOutroCartao,
    recusa: d.recusa,
  };
}

/**
 * Os textos que o checkout do carrinho precisa além dos que já recebe (checkout.*, carrinho.*, preco.*) quando o
 * pagamento online está liberado: os de pedido.* e recusa.* do checkout embutido.
 */
export function textosDoPagamentoOnline(d: Dicionario): TextosPagamentoOnline {
  const P = d.pedido;
  return {
    codigoPedido: P.codigo,
    recusadoTitulo: P.recusadoTitulo,
    recusadoPix: fmt(P.recusadoPix, { p: DESCONTO_PIX_PORCENTO }),
    dicaInternacional: P.dicaInternacional,
    tentarOutroCartao: P.tentarOutroCartao,
    semPixPrazo: P.semPixPrazo,
    semPixLimite: P.semPixLimite,
    pixRecebedor: d.checkout.pixRecebedor,
    recusa: d.recusa,
  };
}

/** Os textos do link "Desistir da compra" e da confirmação dele (chaves pedido.desistir*), na página do pedido pago. */
export function textosDaDesistencia(d: Dicionario): TextosDesistencia {
  const P = d.pedido;
  return {
    link: P.desistirLink,
    texto: P.desistirTexto,
    motivo: P.desistirMotivo,
    confirmar: P.desistirConfirmar,
    politica: P.desistirPolitica,
    recebido: P.desistirRecebido,
    repetido: P.desistirRepetido,
    voltar: d.comum.voltar,
    processando: d.checkout.processando,
    erro: d.checkout.erros.generico,
  };
}

/**
 * O que a página do checkout entrega ao FormularioCarrinho, decidido aqui no servidor: as formas de pagamento
 * online que valem agora para estes itens (o interruptor PAGAMENTO_ONLINE, a Stripe e o prazo de cada forma: o
 * Pix até 2 h antes do primeiro serviço e dentro do limite de valor de um Pix, o cartão até 30 minutos antes; vazio = o
 * caminho do WhatsApp de hoje), o motivo de o Pix ficar de fora e, se o carrinho já virou um pedido que ainda espera
 * o pagamento (pendente ou expirado), o link privado dele para "continuar o pagamento".
 */
export async function pagamentoDoCheckout(
  idioma: Idioma,
  itens: ItemVisivel[],
  pedido: { codigo: string; token: string; status: StatusReserva } | undefined,
  admin: boolean,
  agora: Date = new Date(),
): Promise<{ pagamentoOnline?: PagamentoOnlineCarrinho; pedidoAberto?: { href: string } }> {
  // qualquer falha aqui deixa o checkout no caminho do WhatsApp, que sempre funciona
  const { formas, semPix } = itens.length
    ? await formasDoPagamento(itensPagaveisDoCarrinho(itens), agora, { admin }).catch((e) => {
        console.error(`[checkout] não deu para decidir as formas de pagamento: ${mensagemDoErro(e)}`);
        return { formas: [], semPix: undefined };
      })
    : { formas: [], semPix: undefined };
  const aberto = pedido !== undefined && (pedido.status === 'pendente' || pedido.status === 'expirado');
  return {
    ...(formas.length
      ? { pagamentoOnline: { formas, ...(semPix ? { semPix } : {}), textos: textosDoPagamentoOnline(dicionario(idioma)) } }
      : {}),
    ...(aberto ? { pedidoAberto: { href: linkDoPedido(idioma, pedido.codigo, pedido.token) } } : {}),
  };
}

export function paraPublico(r: Reserva, idioma: Idioma): ReservaPublica {
  const d = dicionario(idioma);
  const status = statusDoVoucher(r);
  const emAberto = pagamentoEmAberto(status);
  const pagamento = {
    status,
    // em aberto, os dois totais (a forma ainda não está fechada); pago no Pix, o cliente vê o que pagou, com o desconto
    totalCentavos: emAberto ? r.totalCentavos : valorRecebido(r),
    totalPixCentavos: emAberto ? r.totalPixCentavos : undefined,
    nome: r.cliente.nome,
    metodo: r.pagamento.metodo,
    forma: r.pagamento.metodo === 'whatsapp' ? undefined : r.pagamento.metodo,
    provedor: provedorDaReserva(r),
    pedidoCodigo: r.pedido?.codigo,
    cartaoBandeira: r.pagamento.cartaoBandeira,
    cartaoFinal: r.pagamento.cartaoFinal,
    // a recusa de uma tentativa anterior não interessa depois de pago; fraude e cartão roubado viram 'generica'
    recusa: recusaDoPedido(r.status, r.pagamento.motivoCodigo),
    apresentado: r.pagamento.apresentado,
    reembolsoCentavos: r.reembolsoCentavos,
  };
  if (ehTransfer(r)) {
    const transfer = transferVisivel(r, idioma, d);
    return {
      codigo: r.codigo,
      tipo: 'transfer',
      passeioSlug: 'transfer',
      passeioNome: d.transfer.titulo,
      data: r.data,
      adultos: r.transfer.passageiros,
      criancas: 0,
      pessoasTexto: transfer.passageiros,
      unidades: 1,
      hotel: '',
      cidadeHospedagem: '',
      transfer,
      ...pagamento,
    };
  }
  const p = obterPasseio(r.passeio.slug);
  const opcao = r.passeio.opcao ? p?.opcoes?.find((o) => o.id === r.passeio.opcao?.id) : undefined;
  return {
    codigo: r.codigo,
    tipo: 'passeio',
    passeioSlug: r.passeio.slug,
    passeioNome: p ? texto(p.nome, idioma) : r.passeio.nome,
    data: r.data,
    horario: r.horario ? { texto: formatarHora(r.horario.hora, idioma), busca: r.horario.busca } : undefined,
    adultos: r.adultos,
    criancas: r.criancas,
    pessoasTexto: textoPessoas(r, d.comum.rotulos, p ? semFaixas(p) : false),
    opcaoNome: (opcao && texto(opcao.nome, idioma)) ?? r.passeio.opcao?.nome,
    unidades: r.unidades,
    hotel: r.hospedagem.hotel,
    cidadeHospedagem: NOME_CIDADE_HOSPEDAGEM[r.hospedagem.cidade],
    ...pagamento,
  };
}
