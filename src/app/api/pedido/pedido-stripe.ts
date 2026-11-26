import Stripe from 'stripe';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { LOCALE_INTL, fmt, rota, type Idioma } from '../../../i18n/config.ts';
import type { EscolhaItem } from '../../../lib/carrinho';
import { linhaDoCancelamento } from '../../../lib/email/marcas.ts';
import type { FormaPagamento, ItemAgendado } from '../../../lib/formas-pagamento';
import {
  anteriorDepoisDeFechar,
  aplicarSessao,
  devolverSessaoAnterior,
  interpretarSessao,
  podeAbrirSessao,
  proximaTentativa,
  registrarSessaoCriada,
  sincronizarComStripe,
  type SessaoRegistrada,
} from '../../../lib/pagamento-stripe.ts';
import { provedorDaReserva } from '../../../lib/pedidos-painel.ts';
import type { ReservaPublica } from '../../../lib/reserva-publica';
import type { Reserva, StatusReserva } from '../../../lib/reservas';
import { criarSessaoPagamento, expirarSessao, modoStripe, obterSessao, type ItemDaSessao } from '../../../lib/stripe.ts';
import { formatarDataIso } from '../../../lib/validacao.ts';

/**
 * A sessão de pagamento de um pedido, para as rotas POST /api/pedido, POST /api/pedido/[codigo]/pagar e GET
 * /api/reservas/[codigo] e para as páginas do pedido e da reserva: como cada voucher entra na sessão, para onde
 * a Stripe devolve o cliente, quando o servidor confere a sessão por conta própria (e com que freios) e como uma
 * sessão nova substitui a anterior. As regras puras ficam em cima (testadas em tests/pedido-stripe.test.ts); as
 * funções que falam com o banco e com a Stripe carregam esses módulos só na hora de usar, porque eles são
 * "server-only" e não abrem fora do Next.
 */

/* ------------------------------------------------------------------ */
/* Regras puras                                                        */

/**
 * O que o voucher gravado diz de quando começa (o horário do passeio ou a saída da ida do transfer) e, na casa, o sinal
 * guardado na compra nas duas formas.
 */
type QuandoComeca = { horario?: { hora: string }; transfer?: { ida: { hora: string } }; sinalCentavos?: number; sinalPixCentavos?: number };

/**
 * Um voucher como entra na sessão da Stripe: o nome do item e uma linha com a data, a hora e as pessoas, no
 * idioma do cliente (os textos vêm de paraPublico, que já traduz). O valor é o do servidor, nas duas formas. A data e
 * a hora em que começa vão junto (do voucher gravado, não do texto da tela): o QR do Pix não passa do prazo do Pix.
 * A casa cobra só o sinal (valorDoItem, com o sinal guardado), com o nome "Mansão Geribá Vista Mar: sinal de 50%" e a
 * linha "4 diárias, de qui 10/12 a seg 14/12 · 12 hóspedes".
 */
export function itemDaSessao(
  r: Pick<Reserva, 'codigo' | 'tipo' | 'totalCentavos' | 'totalPixCentavos' | 'data'> & QuandoComeca,
  p: Pick<ReservaPublica, 'passeioNome' | 'opcaoNome' | 'data' | 'horario' | 'transfer' | 'pessoasTexto' | 'casa'>,
  idioma: Idioma,
  modeloDataHora: string,
): ItemDaSessao {
  if (r.tipo === 'casa' && p.casa) {
    return {
      voucher: r.codigo,
      nome: p.casa.nomeDoSinal,
      descricao: `${p.casa.periodo} · ${p.pessoasTexto}`,
      tipo: 'casa',
      totalCentavos: r.totalCentavos,
      ...(r.totalPixCentavos !== undefined ? { totalPixCentavos: r.totalPixCentavos } : {}),
      ...(r.sinalCentavos !== undefined ? { sinalCentavos: r.sinalCentavos } : {}),
      ...(r.sinalPixCentavos !== undefined ? { sinalPixCentavos: r.sinalPixCentavos } : {}),
      // a entrada: a hora das 15h e o prazo de pagar (a meia-noite do dia da entrada) vêm de formas-pagamento.ts
      data: r.data,
    };
  }
  const nome = p.transfer
    ? `${p.passeioNome}: ${p.transfer.ida.saida} → ${p.transfer.ida.destino}`
    : p.opcaoNome
      ? `${p.passeioNome} · ${p.opcaoNome}`
      : p.passeioNome;
  const data = formatarDataIso(p.data, LOCALE_INTL[idioma]);
  const hora = p.transfer?.ida.hora ?? p.horario?.texto;
  const quando = hora ? fmt(modeloDataHora, { data, hora }) : data;
  return {
    voucher: r.codigo,
    nome,
    descricao: `${quando} · ${p.pessoasTexto}`,
    tipo: r.tipo ?? 'passeio',
    totalCentavos: r.totalCentavos,
    ...(r.totalPixCentavos !== undefined ? { totalPixCentavos: r.totalPixCentavos } : {}),
    data: r.data,
    ...(r.transfer ? { transfer: { ida: { hora: r.transfer.ida.hora } } } : r.horario ? { horario: { hora: r.horario.hora } } : {}),
  };
}

/**
 * A página para onde a Stripe devolve o cliente ao terminar: a do pedido (vários itens) ou a da reserva (um
 * item só), com o token do link privado. A página nunca decide o status por essa volta: ela lê o banco.
 */
export function urlDeRetorno(base: string, idioma: Idioma, codigo: string, token: string, umItem: boolean): string {
  const pagina = umItem ? rota(idioma, `/reserva/${codigo}`) : rota(idioma, `/pedido/${codigo}`);
  return `${base}${pagina}?t=${encodeURIComponent(token)}`;
}

/**
 * Um item do carrinho (já conferido) como a escolha da forma de pagamento precisa: a data e a hora em que começa. A casa:
 * a data da entrada (a hora das 15h e o prazo de pagar, a meia-noite do dia da entrada, vêm de formas-pagamento.ts).
 */
export function itemAgendado(escolha: EscolhaItem): ItemAgendado {
  if (escolha.tipo === 'casa') return { tipo: 'casa', data: escolha.entrada };
  return escolha.tipo === 'passeio'
    ? { tipo: 'passeio', data: escolha.data, horario: { hora: escolha.hora } }
    : { tipo: 'transfer', data: escolha.ida.data, transfer: { ida: { hora: escolha.ida.hora } } };
}

/** O cliente está pagando há pelo menos isto antes de o servidor conferir a sessão por conta própria. */
export const ESPERA_ANTES_DE_CONSULTAR_MS = 60_000;
/** E entre uma consulta à Stripe e a seguinte (a página pergunta a cada 4 s; a Stripe, só de 10 em 10 s). */
export const INTERVALO_ENTRE_CONSULTAS_MS = 10_000;
/** O mesmo prefixo que registrarSessaoCriada grava no histórico (src/lib/pagamento-stripe.ts). */
const EVENTO_SESSAO = 'Sessão de pagamento criada';

/** Desde quando o pedido espera o pagamento desta sessão: a criação da sessão corrente ou, sem ela no histórico, a do pedido. */
export function pendenteDesde(r: Pick<Reserva, 'historico' | 'criadaEm'>): string {
  const sessao = r.historico.findLast((h) => h.evento.startsWith(EVENTO_SESSAO));
  return sessao?.em ?? r.criadaEm;
}

/** Quem pede a consulta: a página (o cliente abriu, recarregou ou voltou da Stripe) ou a pergunta de status a cada 4 s. */
export type OrigemDaConsulta = 'pagina' | 'status';

/**
 * É hora de o servidor conferir a sessão na Stripe por conta própria (a rede de segurança se o webhook atrasar)?
 * Só num pedido da Stripe pendente, e no máximo a cada 10 s por pedido, venha o pedido de onde vier. A pergunta
 * de status (GET /api/reservas/[codigo], a cada 4 s) ainda espera o cliente estar pagando há 60 s. A página
 * carregada não espera: quem volta da Stripe em menos de um minuto, com o webhook atrasado, tem de ver o pedido
 * pago. O navegador nunca decide: quem consulta é o servidor.
 */
export function deveSincronizar(r: Reserva, agora: Date = new Date(), origem: OrigemDaConsulta = 'status'): boolean {
  if (r.status !== 'pendente' || provedorDaReserva(r) !== 'stripe' || !r.pagamentoExternoId) return false;
  const espera = origem === 'pagina' ? 0 : ESPERA_ANTES_DE_CONSULTAR_MS;
  if (agora.getTime() - Date.parse(pendenteDesde(r)) < espera) return false;
  const ultima = r.pagamento.ultimaConsulta ? Date.parse(r.pagamento.ultimaConsulta) : 0;
  return agora.getTime() - ultima >= INTERVALO_ENTRE_CONSULTAS_MS;
}

/** Consultas à Stripe por IP e por minuto, somando a pergunta de status e as páginas do pedido e da reserva. */
export const CONSULTAS_POR_IP = 30;
const JANELA_DAS_CONSULTAS_SEGUNDOS = 60;
/** A hora (ms) da última consulta que ESTA máquina começou, por código do pedido. */
const consultasEmCurso = new Map<string, number>();
const MAXIMO_CONSULTAS_EM_MEMORIA = 5000;

/**
 * Reserva a vez de consultar este pedido nesta máquina: de várias chamadas ao mesmo tempo, só a primeira passa, e a
 * seguinte só depois do intervalo. É a trava de quem roda sem o banco (lá a gravação não é atômica) e poupa
 * gravações com ele. Entre máquinas diferentes quem garante é a trava de versão do pedido (conferirNaStripe).
 */
export function reservarConsulta(pedido: string, agoraMs: number): boolean {
  const ultima = consultasEmCurso.get(pedido);
  if (ultima !== undefined && Math.abs(agoraMs - ultima) < INTERVALO_ENTRE_CONSULTAS_MS) return false;
  if (consultasEmCurso.size >= MAXIMO_CONSULTAS_EM_MEMORIA) {
    for (const [codigo, em] of consultasEmCurso) {
      if (agoraMs - em >= INTERVALO_ENTRE_CONSULTAS_MS) consultasEmCurso.delete(codigo);
    }
  }
  consultasEmCurso.set(pedido, agoraMs);
  return true;
}

/** Só para os testes: esquece as consultas em memória. */
export function zerarConsultasEmMemoria(): void {
  consultasEmCurso.clear();
}

/**
 * A sessão recém-criada ficou gravada como a corrente do pedido? registrarSessaoCriada não grava num pedido que
 * já saiu de pendente ou expirado (pago em outra aba, cancelado enquanto a sessão nascia): ele volta como está,
 * com a sessão que tinha. Aí a sessão nova tem de ser expirada na Stripe, porque ninguém a acompanharia.
 */
export function sessaoFicouGravada(gravada: Pick<Reserva, 'status' | 'pagamentoExternoId'>, sessaoId: string): boolean {
  return gravada.pagamentoExternoId === sessaoId && gravada.status === 'pendente';
}

/**
 * As sessões que a nova tirou do lugar e que têm de ser fechadas: a que o pedido tinha quando o "Pagar" começou e
 * a que estava nele na hora de gravar. Quase sempre é a mesma. São duas quando o cliente apertou "Pagar" duas
 * vezes quase juntas (cartão numa aba, Pix na outra): a segunda é a sessão do outro clique, que este não conhecia
 * e que, aberta, ainda aceitaria um pagamento. Na ordem em que devem ser fechadas, sem repetir e sem a própria nova.
 */
export function sessoesSubstituidas(lidaNoComeco: string | undefined, naHoraDeGravar: string | undefined, nova: string): string[] {
  return [...new Set([lidaNoComeco, naHoraDeGravar])].filter((id): id is string => !!id && id !== nova);
}

/**
 * As sessões que o cancelamento fecha depois de gravar o pedido como cancelado (segunda revisão do Pacote 29): a que o
 * pedido tinha dentro da trava, na volta que gravou, e a da leitura do começo. Quase sempre é a mesma. São duas quando o
 * cliente apertou "Pagar de novo" quase junto com o "Cancelar" da equipe: a sessão nova dele, que o cancelamento não
 * conhecia, ficava aberta e ainda aceitaria um pagamento. Na ordem em que fecham (a da trava primeiro: é a que o cliente
 * pode estar usando agora; terceira conferência), sem repetir.
 */
export function sessoesDoCancelamento(naTrava: string | undefined, lidaNoComeco: string | undefined): string[] {
  return [...new Set([naTrava, lidaNoComeco])].filter((id): id is string => !!id);
}

/* ------------------------------------------------------------------ */
/* Com o banco e com a Stripe                                          */

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Os vouchers de um pedido, pelo código do pedido ou de um dos vouchers, na ordem da viagem. Nenhum, se não existir. */
export async function vouchersDoPedido(codigo: string): Promise<Reserva[]> {
  const { obterPedido, obterReservaDoPedido } = await import('../../../lib/reservas.ts');
  const r = await obterReservaDoPedido(codigo);
  if (!r) return [];
  if (!r.pedido) return [r];
  const todos = await obterPedido(r.pedido.codigo);
  return todos.length ? todos : [r];
}

export interface OpcoesDaConsulta {
  origem: OrigemDaConsulta;
  /** O IP de quem pediu, para o teto por IP. */
  ip: string | null;
  agora?: Date;
}

/**
 * A consulta à Stripe que o servidor faz por conta própria (rota do status e páginas do pedido e da reserva). A
 * hora da consulta é gravada ANTES de ir à Stripe, com a trava de versão do pedido: de várias chamadas ao mesmo
 * tempo, só uma consulta. Acima do teto por IP a consulta é pulada sem erro: o webhook continua sendo o caminho
 * principal. Devolve o pedido relido se a consulta foi feita, ou null se não era a hora.
 */
export async function conferirNaStripe(r: Reserva, { origem, ip, agora = new Date() }: OpcoesDaConsulta): Promise<Reserva | null> {
  if (modoStripe() === 'desligado' || !deveSincronizar(r, agora, origem)) return null;
  const pedido = r.pedido?.codigo ?? r.codigo;
  if (!reservarConsulta(pedido, agora.getTime())) return null;
  const { chaveDoLimite, permitir } = await import('../../../lib/limite-ip.ts');
  if (!(await permitir(chaveDoLimite('consulta-stripe', ip), CONSULTAS_POR_IP, JANELA_DAS_CONSULTAS_SEGUNDOS, agora))) return null;
  const { atualizarReserva } = await import('../../../lib/reservas.ts');
  const trava = { minha: false };
  await atualizarReserva(r.codigo, (atual) => {
    trava.minha = deveSincronizar(atual, agora, origem);
    if (!trava.minha) return null;
    atual.pagamento.ultimaConsulta = agora.toISOString();
    return atual;
  });
  if (!trava.minha) return null;
  return sincronizarComStripe(pedido, agora);
}

export interface SessaoAberta {
  codigo: string;
  sessaoId: string;
  /** O que o navegador usa para montar o checkout embutido. */
  clientSecret: string;
  forma: FormaPagamento;
}

/** A linha do pedido cancelado porque as noites da casa ficaram de outra pessoa (o 409 'datas'). */
export const EVENTO_DATAS_OCUPADAS = 'Cancelado: as datas da casa não estavam mais livres';
/** A linha do pedido cancelado porque o banco não conseguiu prender as datas da casa no primeiro pagamento (o 503 'banco'). */
export const EVENTO_TRAVA_FALHOU = 'Cancelado: não deu para prender as datas da casa (erro do banco)';
/** A linha do pedido que volta a vencido porque o banco não conseguiu prender as datas no "Pagar de novo" (o 503 'banco'). */
export const EVENTO_SESSAO_SEM_TRAVA =
  'Sessão de pagamento fechada: não deu para prender as datas da casa (erro do banco); o cliente pode tentar de novo';

/**
 * As noites de uma casa do pedido já são de outra pessoa (DatasIndisponiveis, na hora de prender): o pedido foi cancelado
 * (EVENTO_DATAS_OCUPADAS), a sessão nova fechou sem chegar ao cliente e a rota responde 409 'datas'.
 */
export class DatasDaCasaOcupadas extends Error {
  constructor(codigo: string) {
    super(`As datas da casa do pedido ${codigo} não estavam mais livres: o pedido foi cancelado.`);
    this.name = 'DatasDaCasaOcupadas';
  }
}

/**
 * O banco não conseguiu prender as datas da casa (fora do ar, tempo esgotado): a sessão nova fechou sem chegar ao cliente
 * e a rota responde 503 'banco' (furo 1 da crítica de 26/11, correção 2: nunca segue com a sessão sem as datas presas).
 */
export class DatasNaoPresas extends Error {
  constructor(codigo: string) {
    super(`As datas da casa do pedido ${codigo} não puderam ser presas: a sessão nova foi fechada.`);
    this.name = 'DatasNaoPresas';
  }
}

/** O pedido não aceita mais pagamento (pago em outra aba, cancelado): a rota responde 409 com o status. */
export class PedidoFechado extends Error {
  status: StatusReserva;
  constructor(status: StatusReserva) {
    super(`O pedido não aceita mais pagamento (status ${status}).`);
    this.name = 'PedidoFechado';
    this.status = status;
  }
}

/**
 * A Stripe não confirmou que a sessão anterior fechou (Pacote 34, P1): a nova não chega ao cliente, o pedido continua com
 * a anterior (devolverSessaoAnterior) e a rota responde como a Stripe fora do ar (502 'stripe'). O cliente continua na
 * tela de antes (o QR do Pix, o formulário do cartão) e pode tentar de novo.
 */
export class SessaoAnteriorAberta extends Error {
  constructor(codigo: string, sessao: string) {
    super(`A sessão anterior ${sessao} do pedido ${codigo} não pôde ser fechada: a troca de forma foi desfeita.`);
    this.name = 'SessaoAnteriorAberta';
  }
}

/** O que fecharSessaoAnterior descobriu: a sessão paga vem junto (é ela que vira o pagamento do pedido). */
export type DepoisDeFechar =
  { estado: 'fechada' } | { estado: 'paga'; lida: Stripe.Checkout.Session } | { estado: 'aberta'; forma?: FormaPagamento };

/** As duas chamadas à Stripe de fecharSessaoAnterior (os testes passam as de mentira). */
export interface ChamadasDaStripe {
  expirar: (id: string) => Promise<boolean>;
  reler: (id: string) => Promise<Stripe.Checkout.Session>;
}

/**
 * Fecha a sessão anterior na Stripe e confere, pela Stripe, se ela fechou mesmo (Pacote 34, P1). Fechou agora: pronto.
 * Não estava mais aberta, ou a Stripe deu erro: a sessão é relida, e o que ela diz decide (anteriorDepoisDeFechar): paga
 * pouco antes, vencida, ou ainda aberta. Se nem a releitura responder, ela conta como aberta: sem a certeza de que o Pix
 * morreu, o cartão não abre. Uma sessão que não existe nesta conta da Stripe não recebe pagamento nenhum: fechada.
 * Testada em tests/troca-de-forma.test.ts, com a Stripe de mentira.
 */
export async function fecharSessaoAnterior(
  id: string,
  codigo: string,
  { expirar, reler }: ChamadasDaStripe = { expirar: expirarSessao, reler: obterSessao },
): Promise<DepoisDeFechar> {
  const fechou = await expirar(id).catch((e) => {
    console.error(`[pedido] não deu para expirar a sessão anterior do pedido ${codigo}: ${mensagem(e)}`);
    return 'erro' as const;
  });
  if (fechou === true) return { estado: 'fechada' };
  let lida: Stripe.Checkout.Session;
  try {
    lida = await reler(id);
  } catch (e) {
    if (e instanceof Stripe.errors.StripeInvalidRequestError && e.code === 'resource_missing') return { estado: 'fechada' };
    console.error(`[pedido] não deu para reler a sessão anterior do pedido ${codigo}: ${mensagem(e)}`);
    return { estado: 'aberta' };
  }
  const estado = anteriorDepoisDeFechar(lida);
  if (estado === 'paga') return { estado, lida };
  if (estado === 'fechada') return { estado };
  const forma = lida.metadata?.forma;
  return { estado, ...(forma === 'pix' || forma === 'cartao' ? { forma } : {}) };
}

/**
 * Abre uma sessão de pagamento para o pedido (a primeira, ou uma nova: cartão recusado → Pix, "pagar de novo"):
 * cria a sessão com um item por voucher no idioma do cliente, grava-a como a corrente (registrarSessaoCriada: o
 * pedido expirado volta a pendente), passa para ela os bloqueios de casa e só então expira a anterior, se ainda
 * estava aberta (e também a de outro "Pagar" quase simultâneo, se a gravação a encontrou no pedido:
 * sessoesSubstituidas). A ordem importa: com a sessão nova já gravada, o aviso de sessão vencida da anterior (webhook
 * checkout.session.expired) fala de uma sessão que não é mais a do pedido e não muda nada. Expirando antes, o
 * aviso podia chegar no meio da troca e pôr o pedido em "expirado" (e soltar as datas da casa) com o cliente já
 * no formulário novo, que fecharia sozinho. Desde o Pacote 34 (P1, a troca do Pix para o cartão), a sessão nova só
 * volta ao cliente depois que a Stripe confirma que cada anterior fechou: se uma delas foi paga pouco antes (o Pix pago
 * no app do banco no instante da troca), esse pagamento é aplicado ao pedido, a nova fecha e sai PedidoFechado; se a
 * Stripe não confirmar o fechamento, a nova fecha, o pedido volta para a anterior e sai SessaoAnteriorAberta. Assim o
 * cliente nunca fica com duas formas abertas para pagar o mesmo pedido.
 * Só para pedido pendente ou expirado; lança erro se a Stripe falhar (a rota decide o que fazer com o pedido).
 * Se o pedido for pago ou cancelado enquanto a sessão nasce, ele não aceita a sessão nova: ela é expirada na
 * Stripe e sai PedidoFechado (a rota responde 409 'status').
 */
export async function abrirSessaoDoPedido(
  vouchers: Reserva[],
  forma: FormaPagamento,
  agora: Date = new Date(),
  {
    seATravaFalhar = 'vencer',
  }: {
    /**
     * O que fazer com o pedido quando o banco não consegue prender as datas da casa: 'cancelar' (o primeiro pagamento, na
     * criação do pedido: o cliente refaz pelo carrinho) ou 'vencer' (o "Pagar de novo" e a troca de forma: o pedido volta
     * a vencido, sem o e-mail do Pix vencido, e o cliente pode tentar de novo).
     */
    seATravaFalhar?: 'cancelar' | 'vencer';
  } = {},
): Promise<SessaoAberta> {
  const [r] = vouchers;
  if (!r) throw new Error('Pedido sem itens.');
  const codigo = r.pedido?.codigo ?? r.codigo;
  if (!podeAbrirSessao(r.status)) throw new PedidoFechado(r.status);
  const { paraPublico } = await import('../../../lib/reserva-publica.ts');
  const { dicionario } = await import('../../../i18n/index.ts');
  const { urlDoSite } = await import('../../../lib/site.ts');
  const { DatasIndisponiveis, acertarDatasParaASessao, liberarDatasDosVouchers, prenderDatasDoPedido } =
    await import('../../../lib/pedido-carrinho.ts');

  const d = dicionario(r.idioma);
  const dados = {
    pedido: { codigo, email: r.cliente.email },
    itens: vouchers.map((v) => itemDaSessao(v, paraPublico(v, r.idioma), r.idioma, d.horario.dataHora)),
    forma,
    idioma: r.idioma,
    returnUrl: urlDeRetorno(urlDoSite(), r.idioma, codigo, r.token, vouchers.length === 1),
    tentativa: proximaTentativa(r),
    agora,
  };
  let sessao: Stripe.Checkout.Session;
  try {
    sessao = await criarSessaoPagamento(dados);
  } catch (e) {
    // a mesma tentativa já foi usada com outros parâmetros (uma gravação anterior falhou no meio): vai para a seguinte
    if (!(e instanceof Stripe.errors.StripeIdempotencyError)) throw e;
    sessao = await criarSessaoPagamento({ ...dados, tentativa: dados.tentativa + 1 });
  }
  const fecharNova = () => expirarSessao(sessao.id).catch(() => false);
  if (!sessao.client_secret) {
    await fecharNova();
    throw new Error('A Stripe não devolveu o client_secret da sessão.');
  }
  let registro: SessaoRegistrada | null;
  try {
    registro = await registrarSessaoCriada(codigo, sessao, forma);
    if (!registro) throw new Error(`O pedido ${codigo} sumiu antes de gravar a sessão.`);
  } catch (e) {
    // uma sessão que o pedido não conhece ninguém acompanharia: ela fecha antes de o erro seguir
    await fecharNova();
    throw e;
  }
  const gravada = registro.reserva;
  if (!sessaoFicouGravada(gravada, sessao.id)) {
    // o pedido foi pago (em outra aba) ou cancelado enquanto a sessão nova nascia: ele não a aceitou e continua
    // com a sessão que tinha. A nova não pode ficar aberta: se fosse paga, ninguém a acompanharia
    await fecharNova();
    throw new PedidoFechado(gravada.status);
  }

  // as anteriores deixam de aceitar pagamento: fechar a sessão cancela o pagamento pendente dela e MATA o QR de um Pix já
  // gerado (visto em 15/11). Primeiro a sessão lida no começo, depois a que a gravação encontrou (a de outro "Pagar" quase
  // simultâneo). Pacote 34 (P1, a troca do Pix para o cartão): a sessão nova só chega ao cliente com a certeza, pela
  // Stripe, de que cada anterior fechou (fecharSessaoAnterior). Antes, um Pix pago no instante da troca, ou uma sessão que
  // a Stripe não conseguia fechar, deixava o cliente pagar de novo com a outra forma, e o segundo pagamento só voltava
  // depois, pela devolução automática
  const anteriores = sessoesSubstituidas(r.pagamentoExternoId, registro.substituida, sessao.id);
  const depois: (DepoisDeFechar & { anterior: string })[] = [];
  for (const anterior of anteriores) depois.push({ anterior, ...(await fecharSessaoAnterior(anterior, codigo)) });

  // paga pouco antes (o Pix pago no app do banco enquanto o cliente tocava em "Pagar com cartão"): é o pagamento do
  // pedido. Ele entra pela mesma porta do aviso da Stripe (aplicarSessao), a sessão nova fecha sem nunca ter chegado ao
  // cliente e a rota responde 409 'status': a tela vai para a página do pedido, que mostra o pedido pago.
  // A ordem importa (revisão do Pacote 34): primeiro o pedido passa para a sessão anterior, e só depois a nova fecha.
  // Fechando antes, o aviso de sessão vencida da nova (ainda a do pedido) podia chegar no meio e pôr o pedido em
  // "expirado". O client_secret da nova nunca saiu do servidor: ela aberta por mais um instante não deixa ninguém pagar
  const paga = depois.find((d) => d.estado === 'paga');
  if (paga?.estado === 'paga') {
    try {
      const aplicada = await aplicarSessao(codigo, paga.lida, 'consulta');
      throw new PedidoFechado(aplicada.reserva?.status ?? 'pago');
    } finally {
      await fecharNova();
    }
  }
  // a Stripe não confirmou que a anterior fechou: o pedido volta para a anterior (a que o cliente ainda pode pagar), a
  // nova fecha (nessa ordem, pelo mesmo motivo de cima) e a troca fica para outro toque
  const aberta = depois.findLast((d) => d.estado === 'aberta');
  if (aberta?.estado === 'aberta') {
    const metodoDoComeco = r.pagamento.metodo === 'pix' || r.pagamento.metodo === 'cartao' ? r.pagamento.metodo : undefined;
    const formaAnterior = aberta.forma ?? (aberta.anterior === r.pagamentoExternoId ? metodoDoComeco : undefined);
    await devolverSessaoAnterior(codigo, sessao.id, aberta.anterior, formaAnterior).catch((e) =>
      console.error(`[pedido] não deu para devolver o pedido ${codigo} à sessão anterior: ${mensagem(e)}`),
    );
    await fecharNova();
    throw new SessaoAnteriorAberta(codigo, aberta.anterior);
  }

  // com as anteriores fechadas, as datas das casas ficam presas para a sessão nova (Etapa 7; crítica de 26/11, furo 1): os
  // bloqueios do pedido passam para ela pelo ITEM do pedido, conferindo as linhas, e o que não voltou é preso de novo pela
  // função do banco (prenderDatasDoPedido). Nada segue com a sessão sem as datas presas:
  // - as noites já são de outra pessoa: o pedido é cancelado ANTES de a nova fechar (cancelarPedidoAberto grava primeiro;
  //   furo 14: fechando antes, o aviso da sessão vencida punha o pedido em vencido e mandava o e-mail do Pix vencido de um
  //   QR que o cliente nunca viu), e sai DatasDaCasaOcupadas (409 'datas');
  // - o banco falhou: o pedido é cancelado (o primeiro pagamento) ou volta a vencido ("Pagar de novo"), a nova fecha e sai
  //   DatasNaoPresas (503 'banco').
  // O calendário das páginas é refeito pela rota (calendarioMudou só nas rotas: furo 3)
  let temCasa: boolean;
  try {
    temCasa = await prenderDatasDoPedido(vouchers, sessao.id);
  } catch (e) {
    if (e instanceof DatasIndisponiveis) {
      const cancelado = await cancelarPedidoAberto(codigo, EVENTO_DATAS_OCUPADAS).catch((e2) => {
        console.error(`[pedido] não deu para cancelar o pedido ${codigo} com as datas ocupadas: ${mensagem(e2)}`);
        return null;
      });
      await fecharNova();
      if (cancelado?.status === 'cancelado') {
        await liberarDatasDosVouchers(vouchers).catch((e2) =>
          console.error(`[pedido] não deu para soltar as datas do pedido cancelado ${codigo}: ${mensagem(e2)}`),
        );
      }
      throw new DatasDaCasaOcupadas(codigo);
    }
    console.error(`[pedido] não deu para prender as datas da casa do pedido ${codigo}: ${mensagem(e)}`);
    if (seATravaFalhar === 'cancelar') {
      await cancelarPedidoAberto(codigo, EVENTO_TRAVA_FALHOU).catch((e2) =>
        console.error(`[pedido] não deu para cancelar o pedido ${codigo} sem as datas presas: ${mensagem(e2)}`),
      );
    } else {
      await voltarAVencido(codigo, sessao.id).catch((e2) =>
        console.error(`[pedido] não deu para pôr o pedido ${codigo} em vencido sem as datas presas: ${mensagem(e2)}`),
      );
    }
    await fecharNova();
    // o que a renomeação tiver passado para a sessão nova não fica preso a uma sessão fechada
    await liberarDatasDosVouchers(vouchers).catch((e2) =>
      console.error(`[pedido] não deu para soltar as datas do pedido ${codigo}: ${mensagem(e2)}`),
    );
    throw new DatasNaoPresas(codigo);
  }

  // dois "Pagar" quase juntos (o cartão numa aba, o Pix na outra): cada um prende com a sua sessão, e as datas têm de seguir
  // a que ficou no pedido, para sair junto com ela quando vencer
  if (temCasa) {
    const { obterReservaDoPedido } = await import('../../../lib/reservas.ts');
    const atual = await obterReservaDoPedido(codigo).catch(() => null);
    if (atual?.pagamentoExternoId && atual.pagamentoExternoId !== sessao.id && podeAbrirSessao(atual.status)) {
      await acertarDatasParaASessao(vouchers, atual.pagamentoExternoId).catch((e) =>
        console.error(`[pedido] não deu para passar as datas da casa para a sessão corrente do pedido ${codigo}: ${mensagem(e)}`),
      );
    }
  }
  return { codigo, sessaoId: sessao.id, clientSecret: sessao.client_secret, forma };
}

/**
 * O "Pagar de novo" que não conseguiu prender as datas da casa (o banco falhou): o pedido volta a vencido, ANTES de a
 * sessão nova fechar. Assim o aviso da sessão vencida não muda mais nada (o pedido já está vencido) e não sai o e-mail do
 * Pix vencido de um QR que o cliente nunca viu; a página mostra "Pagar de novo", e ele pode tentar outra vez. Só se a
 * sessão corrente ainda for a nova e o pedido ainda esperar o pagamento.
 */
async function voltarAVencido(codigo: string, sessaoId: string): Promise<void> {
  const { atualizarReserva, obterReservaDoPedido, registrar } = await import('../../../lib/reservas.ts');
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return;
  await atualizarReserva(alvo.codigo, (x) => {
    if (x.pagamentoExternoId !== sessaoId || x.status !== 'pendente') return null;
    x.status = 'expirado';
    return registrar(x, EVENTO_SESSAO_SEM_TRAVA);
  });
}

/**
 * Cancela um pedido da Stripe que ainda não foi pago (pendente ou expirado): grava o status e, depois, expira a sessão
 * aberta, para o cliente não pagar um pedido cancelado, e libera as datas de casa presas a ela. Num pedido em outro
 * status não faz nada e devolve-o como está; null se o pedido não existir.
 *
 * A ordem (segunda revisão do Pacote 29): primeiro gravar, depois fechar. Antes a sessão fechava primeiro; se a gravação
 * falhasse depois disso (erro do banco, tempo esgotado), o aviso da Stripe da sessão fechada virava o pedido para
 * expirado, e o segundo toque da equipe em "Cancelar" o lia como "já estava vencido": o cliente que esperava para pagar
 * ficava sem o e-mail "Pedido cancelado". Agora o fechamento daqui só acontece com o pedido já cancelado (o aviso dele não
 * muda mais nada), e o pedido só fica expirado pelo prazo da própria Stripe. Fecha também a sessão que o pedido tinha
 * dentro da trava: a de um "Pagar de novo" do cliente quase no mesmo instante ficava aberta. O pagamento que chegar entre
 * a gravação e o fechamento fica parado na Stripe para a equipe decidir (Pacote 22), como o que chegava, antes, no
 * instante do fechamento; e o que chegou no mesmo instante, com o aviso da Stripe ainda a caminho, é aplicado aqui mesmo
 * (fecharSessoes), antes de quem cancelou agendar o e-mail "Pedido cancelado".
 *
 * A gravação que falha (terceira conferência do Pacote 29): o pedido é relido. Já cancelado (a gravação entrou e a
 * resposta do banco se perdeu, ou outro "Cancelar" gravou no meio-tempo), segue como deu certo e as sessões fecham. Ainda
 * em aberto, o erro segue e nada fecha, a não ser com `fecharMesmoSemGravar` (o cancelamento automático de quem refez o
 * pedido: o pedido novo é o que vale, e um pagamento neste ainda deixaria dois pedidos pagos do mesmo carrinho). No painel,
 * a equipe vê o erro e repete, com o pedido ainda esperando o pagamento de verdade. O cancelamento automático tenta gravar
 * duas vezes antes de desistir (conferência final): uma falha do banco costuma ser passageira, e com o pedido cancelado o
 * aviso da sessão que fecha não muda mais nada. Só se as duas falharem a sessão fecha com o pedido ainda em aberto, e o
 * aviso dela o deixa vencido (no Pix, com o e-mail do Pix vencido), como antes da ordem nova.
 */
export async function cancelarPedidoAberto(
  codigo: string,
  evento: string,
  { fecharMesmoSemGravar = false }: { fecharMesmoSemGravar?: boolean } = {},
): Promise<Reserva | null> {
  const { atualizarReserva, obterReservaDoPedido, registrar } = await import('../../../lib/reservas.ts');
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return null;
  if (!podeAbrirSessao(alvo.status)) return alvo;
  // a sessão do pedido relido dentro da trava, na volta que gravou
  let sessaoNaTrava: string | undefined;
  const gravar = () =>
    atualizarReserva(alvo.codigo, (x) => {
      sessaoNaTrava = undefined;
      if (!podeAbrirSessao(x.status)) return null;
      sessaoNaTrava = x.pagamentoExternoId;
      // Pacote 29: o pedido que já tinha vencido sem pagamento ganha o final " (já estava vencido)" na linha; cancelado no
      // painel, ele não recebe o e-mail "Pedido cancelado" (emailDoCancelamentoSai, decisão do dono de 25/11). Vencido é o
      // que estava expirado na leitura do começo (alvo) E continua expirado aqui dentro da trava: o pedido que o cliente
      // reabriu no meio-tempo ("Pagar de novo") esperava o pagamento, e esse cliente ainda recebe o e-mail
      const linha = linhaDoCancelamento(evento, alvo.status, x.status);
      x.status = 'cancelado';
      return registrar(x, linha);
    });
  let r: Reserva | null;
  try {
    r = await gravar().catch((e) => {
      if (!fecharMesmoSemGravar) throw e;
      return gravar();
    });
  } catch (e) {
    const relido = await obterReservaDoPedido(codigo).catch(() => null);
    if (relido?.status !== 'cancelado') {
      if (fecharMesmoSemGravar && (!relido || podeAbrirSessao(relido.status))) {
        await fecharSessoes(codigo, sessoesDoCancelamento(relido?.pagamentoExternoId, alvo.pagamentoExternoId), false);
      }
      throw e;
    }
    r = relido;
    sessaoNaTrava = relido.pagamentoExternoId;
  }
  if (r?.status !== 'cancelado') return r;
  await fecharSessoes(codigo, sessoesDoCancelamento(sessaoNaTrava, alvo.pagamentoExternoId), true);
  return r;
}

/**
 * Fecha na Stripe as sessões que o cancelamento deixa para trás e, com `liberar` (o pedido cancelado), solta as datas de
 * casa presas a elas. A sessão que já não estava aberta (expirarSessao devolve false) venceu, ou foi paga no mesmo instante
 * do "Cancelar" com o aviso da Stripe ainda a caminho: ela é relida na hora e, paga, aplicada pela mesma porta do aviso
 * (aplicarSessao). No pedido cancelado, o pagamento fica parado (Pacote 22) e a equipe é avisada ANTES de quem cancelou
 * agendar o e-mail "Pedido cancelado", cuja regra (emailDoCancelamentoSai) já encontra o parado e não escreve "Nada foi
 * cobrado" (terceira conferência do Pacote 29). Um erro da Stripe só fica no registro do servidor: a sessão vence sozinha,
 * e um pagamento nela fica parado do mesmo jeito.
 */
async function fecharSessoes(codigo: string, sessoes: readonly string[], liberar: boolean): Promise<void> {
  const { liberarBloqueiosDaSessao } = await import('../../../lib/pedido-carrinho.ts');
  for (const sessao of sessoes) {
    const fechou = await expirarSessao(sessao).catch((e) => {
      console.error(`[pedido] não deu para expirar a sessão do pedido ${codigo}: ${mensagem(e)}`);
      return 'erro' as const;
    });
    if (fechou === false) {
      try {
        const lida = await obterSessao(sessao);
        if (interpretarSessao(lida).status === 'pago') await aplicarSessao(codigo, lida, 'consulta');
      } catch (e) {
        console.error(`[pedido] não deu para reler a sessão já fechada do pedido ${codigo}: ${mensagem(e)}`);
      }
    }
    if (liberar) {
      await liberarBloqueiosDaSessao(sessao).catch((e) =>
        console.error(`[pedido] não deu para liberar as datas do pedido ${codigo}: ${mensagem(e)}`),
      );
    }
  }
}
