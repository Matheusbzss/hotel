import { timingSafeEqual } from 'node:crypto';
import type { PagamentoOnlineCarrinho, TextosPagamentoOnline } from '@/components/carrinho/FormularioCarrinho';
import type { TextosPagarPedido } from '@/components/pagamento/CheckoutEmbutido';
import type { TextosDesistencia } from '@/components/pagamento/DesistirDaCompra';
import { DESCONTO_PIX_PORCENTO } from '@/config/precos';
import { obterPasseio } from '@/data/passeios';
import { dicionario, type Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, rota, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { nomeDoHotel } from './hospedagem';
import { itensDaConta, type ItemVisivel } from './carrinho';
import { linhasDoItemDaCasa } from './casa-no-carrinho';
import { SINAL_PORCENTO } from './diarias';
import {
  formasDoPagamento,
  pagamentoOnlineAberto,
  valorACobrar,
  type FormaPagamento,
  type ItemCobravel,
  type ItemPagavel,
} from './formas-pagamento';
import type { TextosDoReembolso } from './frases-do-reembolso';
import { formatarHora } from './horarios';
import { semFaixas } from './passeio-view';
import { pagamentoRetidoADecidir, provedorDaReserva, recebidoNaPaginaDoCliente, valorRecebido } from './pedidos-painel';
import { textoPessoas } from './pessoas';
import { partesDaPagina, type PartesDoReembolso } from './reembolsos-a-resolver';
import { recusaParaOCliente, type ChaveRecusa } from './recusas';
import { ehCasa, ehTransfer, type MetodoPagamento, type Provedor, type Reserva, type ReservaCasa, type StatusReserva } from './reservas';
import { frasesDoCancelamentoSemReembolso } from './cancelar-sem-reembolso';
import { canceladoSemReembolso, cancelamentoDoVoucher } from './sem-reembolso';
import { transferVisivel, type TransferVisivel } from './transfer-view';
import { NOME_CIDADE_HOSPEDAGEM } from './validacao';
import { whatsappDoRobo } from './whatsapp';
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
  tipo: 'passeio' | 'transfer' | 'casa';
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
  /** Só na casa: as datas, as diárias, os hóspedes e os valores (a estadia, o sinal pago no site e o que fica para a chegada). */
  casa?: CasaPublica;
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
   * nunca o decline_code cru. Num pedido de Pix, nunca: o Pix não é recusado, vence sem pagamento e aparece só como
   * status expirado.
   */
  recusa?: ChaveRecusa;
  /** Quanto o cliente viu na moeda dele (Adaptive Pricing), na menor unidade dela. */
  apresentado?: { moeda: string; valorCentavos: number };
  /** Quanto já voltou para o cliente, em centavos (reembolso total ou de um item só). */
  reembolsoCentavos?: number;
  /**
   * Só quando um reembolso que falhou na Stripe (ou um voucher devolvido por outro meio) diz respeito a esta página e
   * muda o que ela diz: o que voltou pela mesma forma de pagamento, o pendente e o devolvido por outro meio
   * (partesDaPagina, src/lib/reembolsos-a-resolver.ts; no voucher de um pedido com vários itens, o daquele voucher e o
   * do pedido inteiro). Só os três valores: nunca o id do reembolso nem o motivo da falha.
   */
  reembolsoPartes?: PartesDoReembolso;
  /**
   * Só no pedido cancelado que recebeu um pagamento ainda à espera da decisão da equipe (Pacote 22,
   * pagamentoRetidoADecidir): a página mostra pedido.pagamentoRetido no lugar do texto do cancelado. Nunca o valor, o id
   * do pagamento nem o que a equipe vai decidir.
   */
  pagamentoRetido?: true;
  /**
   * Só no voucher que a equipe cancelou sem reembolso (Pacote 33, src/lib/sem-reembolso.ts): o motivo e a regra da política
   * de cancelamento, já no idioma da página (o texto do motivo "outro" vai como a equipe escreveu). Nada do painel além disso:
   * nem a hora, nem a trava dos 7 dias.
   */
  semReembolso?: { motivo: string; regra: string };
}

/** A casa como as páginas, o checkout embutido e a sessão da Stripe mostram, já no idioma da página. */
export interface CasaPublica {
  /** A entrada (às 15h) e a saída (até as 12h), AAAA-MM-DD. */
  entrada: string;
  saida: string;
  noites: number;
  hospedes: number;
  /** "4 diárias, de qui 10/12 a seg 14/12". */
  periodo: string;
  /** O nome do item na Stripe: "Mansão Geribá Vista Mar: sinal de 50%" (casas.itemNaStripe). */
  nomeDoSinal: string;
  totalCentavos: number;
  totalPixCentavos: number;
  /** O sinal guardado na compra, nas duas formas, e o que se paga na chegada (o total menos o sinal da mesma forma). */
  sinalCentavos: number;
  sinalPixCentavos: number;
  chegadaCentavos: number;
  chegadaPixCentavos: number;
}

/** A casa de um voucher, para as telas: as linhas do carrinho (as diárias com as datas, os hóspedes) e os valores guardados. */
export function casaPublica(r: ReservaCasa, idioma: Idioma, d: Dicionario): CasaPublica {
  // a primeira linha do carrinho: as diárias com as datas (as outras, os hóspedes e o sinal, a tela escreve do jeito dela)
  const [periodo] = linhasDoItemDaCasa(
    { entrada: r.data, saida: r.saida, hospedes: r.hospedes },
    idioma,
    LOCALE_INTL[idioma],
    {
      ajusteResultado: d.casas.ajusteResultado,
      nDiarias: d.casas.nDiarias,
      umaDiaria: d.casas.umaDiaria,
      hospede: d.casas.linha.hospede,
      hospedes: d.casas.linha.hospedes,
      sinalHoje: d.carrinho.casaSinalHoje,
    },
    SINAL_PORCENTO,
  );
  const totalPix = r.totalPixCentavos ?? r.totalCentavos;
  const noites = r.linhas.reduce((s, l) => s + l.noites, 0);
  return {
    entrada: r.data,
    saida: r.saida,
    noites,
    hospedes: r.hospedes,
    periodo,
    nomeDoSinal: fmt(d.casas.itemNaStripe, { casa: r.casa.nome, p: SINAL_PORCENTO }),
    totalCentavos: r.totalCentavos,
    totalPixCentavos: totalPix,
    sinalCentavos: r.sinalCentavos,
    sinalPixCentavos: r.sinalPixCentavos,
    chegadaCentavos: r.totalCentavos - r.sinalCentavos,
    chegadaPixCentavos: totalPix - r.sinalPixCentavos,
  };
}

/**
 * A chave do texto da última recusa do cartão, ou nada: pedido pago, sem recusa, o Pix que venceu ou um pedido de Pix,
 * venha o código que vier (recusaParaOCliente, src/lib/recusas.ts). A forma é a registrada no pedido.
 */
export function recusaDoPedido(
  status: StatusReserva,
  motivoCodigo: string | undefined,
  metodo: MetodoPagamento | undefined,
): ChaveRecusa | undefined {
  return recusaParaOCliente(status, motivoCodigo, metodo);
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

/**
 * O status que o cliente vê neste voucher: um item cancelado ou reembolsado sozinho mostra o próprio status. No pedido
 * reembolsado inteiro, todo voucher é reembolsado (Pacote 33): também o que a equipe tinha cancelado sem reembolso antes e
 * depois devolveu com "Reembolsar tudo" (todo o dinheiro voltou).
 */
export function statusDoVoucher(r: Pick<Reserva, 'status' | 'statusItem'>): StatusReserva {
  if (r.status === 'reembolsado') return r.status;
  return r.statusItem === 'cancelado' || r.statusItem === 'reembolsado' ? r.statusItem : r.status;
}

/** O pagamento ainda está em aberto: as duas formas (Pix com desconto e cartão) continuam valendo. */
export const pagamentoEmAberto = (status: StatusReserva): boolean =>
  status === 'aguardando_whatsapp' || status === 'pendente' || status === 'expirado';

export type { ItemPagavel };

/**
 * Os vouchers de um pedido como itens pagáveis (para "pagar de novo" na página do pedido). A casa leva o sinal guardado na
 * compra (crítica de 26/11, furo 19): o "Pagar de novo" e o reembolso de um voucher cobram e devolvem o número guardado.
 */
export function itensPagaveis(reservas: Reserva[]): ItemPagavel[] {
  return reservas.map((r) => ({
    tipo: r.tipo ?? 'passeio',
    data: r.data,
    totalCentavos: r.totalCentavos,
    ...(r.totalPixCentavos !== undefined ? { totalPixCentavos: r.totalPixCentavos } : {}),
    ...(ehCasa(r)
      ? { sinalCentavos: r.sinalCentavos, sinalPixCentavos: r.sinalPixCentavos }
      : ehTransfer(r)
        ? { transfer: { ida: { hora: r.transfer.ida.hora } } }
        : r.horario
          ? { horario: { hora: r.horario.hora } }
          : {}),
  }));
}

/**
 * Os itens do carrinho como itens pagáveis: é com eles que a página do checkout pergunta formasDisponiveis. A casa leva a
 * data da entrada e o sinal das duas formas; a casa indisponível (alguma noite ficou ocupada) fica de fora, como na conta.
 */
export function itensPagaveisDoCarrinho(
  itens: Pick<ItemVisivel, 'tipo' | 'escolha' | 'totalCentavos' | 'totalPixCentavos' | 'casa' | 'indisponivel'>[],
): ItemPagavel[] {
  return itensDaConta(itens).map((i) => ({
    tipo: i.tipo,
    totalCentavos: i.totalCentavos,
    totalPixCentavos: i.totalPixCentavos,
    ...(i.escolha.tipo === 'casa'
      ? { data: i.escolha.entrada, ...(i.casa ? { sinalCentavos: i.casa.sinalCentavos, sinalPixCentavos: i.casa.sinalPixCentavos } : {}) }
      : i.escolha.tipo === 'transfer'
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
 * Os textos das frases do reembolso (frasesDoReembolso, src/lib/frases-do-reembolso.ts), nas chaves pedido.*: o de
 * sempre, o parcial, o que a Stripe não conseguiu devolver e o que a equipe devolveu de outro jeito. A página do pedido
 * e a da reserva usam os mesmos.
 */
export const textosDoReembolso = (d: Dicionario): TextosDoReembolso => ({
  reembolsadoTexto: textoReembolsado(d),
  reembolsadoParcial: d.pedido.reembolsadoParcial,
  reembolsoFalhou: d.pedido.reembolsoFalhou,
  reembolsoOutroMeio: d.pedido.reembolsoOutroMeio,
});

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
    pixDeFora: C.pixDeFora,
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
    semStripe: C.semStripe,
    tentarDeNovo: d.reserva.tentarNovamente,
    robo: d.comum.robo,
    roboWhatsapp: whatsappDoRobo(d),
    confirmando: P.confirmando,
    confirmandoTexto: P.confirmandoTexto,
    pixGerado: P.pixGerado,
    atualizaSozinho: varios ? P.atualizaSozinho : d.reserva.atualizaSozinho,
    pagarAgora: P.pagar,
    pagarDeNovo: P.pagarDeNovo,
    tempoEsgotado: P.tempoEsgotado,
    tempoEsgotadoTexto: P.tempoEsgotadoTexto,
    semPrazo: P.semPrazo,
    recusadoTitulo: P.recusadoTitulo,
    recusadoPix: fmt(P.recusadoPix, { p: DESCONTO_PIX_PORCENTO }),
    recusadoPixComApp: fmt(P.recusadoPixComApp, { p: DESCONTO_PIX_PORCENTO }),
    dicaInternacional: P.dicaInternacional,
    tentarOutroCartao: P.tentarOutroCartao,
    pagarComCartao: P.pagarComCartao,
    pixNoCelular: C.pixNoCelular,
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
    pagarComCartao: P.pagarComCartao,
    recusadoPixComApp: fmt(P.recusadoPixComApp, { p: DESCONTO_PIX_PORCENTO }),
    pixGerado: P.pixGerado,
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
 * o pagamento (pendente ou expirado), o link privado dele para "continuar o pagamento". Se o carrinho virou um pedido
 * PAGO (o cliente pagou o Pix no app do banco e a aba recarregou), `pedidoPago`: o checkout leva ao pedido, em vez de
 * dizer que o carrinho está vazio. Só nesta carga: o cookie do carrinho que virou pedido fechado some logo depois
 * (GET /api/carrinho). Reembolsado, contestado e cancelado continuam como antes. `pagamentoLigado`: o pagamento online
 * vale para este visitante, seja qual for o carrinho (pagamentoOnlineAberto). Com ele, o formulário que ficou sem formas
 * e tem itens (a página guardada que abriu com o carrinho vazio) pede a página de novo ao servidor, uma vez a cada
 * volta à página (src/lib/releitura-do-checkout.ts; Pacote 26).
 */
export async function pagamentoDoCheckout(
  idioma: Idioma,
  itens: ItemVisivel[],
  pedido: { codigo: string; token: string; status: StatusReserva } | undefined,
  admin: boolean,
  agora: Date = new Date(),
): Promise<{
  pagamentoOnline?: PagamentoOnlineCarrinho;
  pagamentoLigado: boolean;
  pedidoAberto?: { href: string };
  pedidoPago?: { codigo: string; href: string };
}> {
  // qualquer falha aqui deixa o checkout no caminho do WhatsApp, que sempre funciona
  const { formas, semPix } = itens.length
    ? await formasDoPagamento(itensPagaveisDoCarrinho(itens), agora, { admin }).catch((e) => {
        console.error(`[checkout] não deu para decidir as formas de pagamento: ${mensagemDoErro(e)}`);
        return { formas: [], semPix: undefined };
      })
    : { formas: [], semPix: undefined };
  // decidido aqui, nunca no navegador; uma falha deixa desligado, e o formulário fica como hoje
  const pagamentoLigado = await pagamentoOnlineAberto({ admin }).catch(() => false);
  const aberto = pedido !== undefined && (pedido.status === 'pendente' || pedido.status === 'expirado');
  const pago = pedido !== undefined && pedido.status === 'pago';
  return {
    ...(formas.length
      ? { pagamentoOnline: { formas, ...(semPix ? { semPix } : {}), textos: textosDoPagamentoOnline(dicionario(idioma)) } }
      : {}),
    pagamentoLigado,
    ...(aberto ? { pedidoAberto: { href: linkDoPedido(idioma, pedido.codigo, pedido.token) } } : {}),
    ...(pago ? { pedidoPago: { codigo: pedido.codigo, href: linkDoPedido(idioma, pedido.codigo, pedido.token) } } : {}),
  };
}

export function paraPublico(r: Reserva, idioma: Idioma): ReservaPublica {
  const d = dicionario(idioma);
  const status = statusDoVoucher(r);
  const emAberto = pagamentoEmAberto(status);
  // o reembolso que falhou (ou já devolvido por outro meio) que diz respeito a esta página: só os três valores
  const reembolsoPartes = partesDaPagina({ voucherDePedido: Boolean(r.pedido), codigo: r.codigo }, r.reembolsoCentavos ?? 0, r.historico);
  // Pacote 33: o voucher cancelado pela equipe sem reembolso (o cancelamento que o lista, src/lib/sem-reembolso.ts)
  const semReembolso = canceladoSemReembolso(r) ? cancelamentoDoVoucher(r.pagamento, r.codigo) : undefined;
  const pagamento = {
    status,
    // em aberto, os dois totais (a forma ainda não está fechada); pago no Pix, o cliente vê o que pagou, com o desconto. No
    // pedido de um item em que a Stripe recebeu um valor diferente do esperado (Pacote 23), o que ela recebeu de verdade:
    // assim a faixa ("Pago R$ …", "Reembolsado R$ …") e a frase do reembolso parcial contam com o mesmo número. O voucher
    // de um pedido com vários itens mostra o valor dele, como sempre (a página do pedido mostra o total recebido)
    totalCentavos: emAberto ? r.totalCentavos : ((r.pedido ? undefined : recebidoNaPaginaDoCliente(r)) ?? valorRecebido(r)),
    totalPixCentavos: emAberto ? r.totalPixCentavos : undefined,
    nome: r.cliente.nome,
    metodo: r.pagamento.metodo,
    forma: r.pagamento.metodo === 'whatsapp' ? undefined : r.pagamento.metodo,
    provedor: provedorDaReserva(r),
    pedidoCodigo: r.pedido?.codigo,
    cartaoBandeira: r.pagamento.cartaoBandeira,
    cartaoFinal: r.pagamento.cartaoFinal,
    // a recusa de uma tentativa anterior não interessa depois de pago; fraude e cartão roubado viram 'generica'; num
    // pedido de Pix nenhum código vira texto de cartão recusado
    recusa: recusaDoPedido(r.status, r.pagamento.motivoCodigo, r.pagamento.metodo),
    apresentado: r.pagamento.apresentado,
    reembolsoCentavos: r.reembolsoCentavos,
    ...(reembolsoPartes ? { reembolsoPartes } : {}),
    // o pagamento que chegou com o pedido cancelado, enquanto a equipe decide (Pacote 22)
    ...(status === 'cancelado' && pagamentoRetidoADecidir(r) ? { pagamentoRetido: true as const } : {}),
    // o voucher que a equipe cancelou sem reembolso (Pacote 33): o motivo e a regra, no idioma da página
    ...(semReembolso ? { semReembolso: frasesDoCancelamentoSemReembolso(d.pedido, semReembolso) } : {}),
  };
  if (ehCasa(r)) {
    const casa = casaPublica(r, idioma, d);
    return {
      codigo: r.codigo,
      tipo: 'casa',
      passeioSlug: r.casa.slug,
      passeioNome: r.casa.nome,
      data: r.data,
      adultos: r.hospedes,
      criancas: 0,
      pessoasTexto: r.hospedes === 1 ? d.casas.linha.hospede : fmt(d.casas.linha.hospedes, { n: r.hospedes }),
      unidades: 1,
      hotel: '',
      cidadeHospedagem: '',
      casa,
      ...pagamento,
      // na casa, a faixa mostra o que se paga pelo site: em aberto, o sinal nas duas formas; pago, o sinal pago (valorRecebido)
      ...(emAberto ? { totalCentavos: r.sinalCentavos, totalPixCentavos: r.sinalPixCentavos } : {}),
    };
  }
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
    hotel: nomeDoHotel(r.hospedagem, d.reserva.hotelAInformar),
    cidadeHospedagem: NOME_CIDADE_HOSPEDAGEM[r.hospedagem.cidade],
    ...pagamento,
  };
}
