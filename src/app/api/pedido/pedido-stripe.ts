import Stripe from 'stripe';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { LOCALE_INTL, fmt, rota, type Idioma } from '../../../i18n/config.ts';
import type { EscolhaItem } from '../../../lib/carrinho';
import type { FormaPagamento, ItemAgendado } from '../../../lib/formas-pagamento';
import {
  podeAbrirSessao,
  proximaTentativa,
  registrarSessaoCriada,
  sincronizarComStripe,
  type SessaoRegistrada,
} from '../../../lib/pagamento-stripe.ts';
import { provedorDaReserva } from '../../../lib/pedidos-painel.ts';
import type { ReservaPublica } from '../../../lib/reserva-publica';
import type { Reserva, StatusReserva } from '../../../lib/reservas';
import { criarSessaoPagamento, expirarSessao, modoStripe, type ItemDaSessao } from '../../../lib/stripe.ts';
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

/** O que o voucher gravado diz de quando começa: o horário do passeio ou a saída da ida do transfer. */
type QuandoComeca = { horario?: { hora: string }; transfer?: { ida: { hora: string } } };

/**
 * Um voucher como entra na sessão da Stripe: o nome do item e uma linha com a data, a hora e as pessoas, no
 * idioma do cliente (os textos vêm de paraPublico, que já traduz). O valor é o do servidor, nas duas formas. A data e
 * a hora em que começa vão junto (do voucher gravado, não do texto da tela): o QR do Pix não passa do prazo do Pix.
 */
export function itemDaSessao(
  r: Pick<Reserva, 'codigo' | 'tipo' | 'totalCentavos' | 'totalPixCentavos' | 'data'> & QuandoComeca,
  p: Pick<ReservaPublica, 'passeioNome' | 'opcaoNome' | 'data' | 'horario' | 'transfer' | 'pessoasTexto'>,
  idioma: Idioma,
  modeloDataHora: string,
): ItemDaSessao {
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

/** Um item do carrinho (já conferido) como a escolha da forma de pagamento precisa: a data e a hora em que começa. */
export function itemAgendado(escolha: EscolhaItem): ItemAgendado {
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
 * Abre uma sessão de pagamento para o pedido (a primeira, ou uma nova: cartão recusado → Pix, "pagar de novo"):
 * cria a sessão com um item por voucher no idioma do cliente, grava-a como a corrente (registrarSessaoCriada: o
 * pedido expirado volta a pendente), passa para ela os bloqueios de casa e só então expira a anterior, se ainda
 * estava aberta (e também a de outro "Pagar" quase simultâneo, se a gravação a encontrou no pedido:
 * sessoesSubstituidas). A ordem importa: com a sessão nova já gravada, o aviso de sessão vencida da anterior (webhook
 * checkout.session.expired) fala de uma sessão que não é mais a do pedido e não muda nada. Expirando antes, o
 * aviso podia chegar no meio da troca e pôr o pedido em "expirado" (e soltar as datas da casa) com o cliente já
 * no formulário novo, que fecharia sozinho. Se o cliente pagar a anterior nesse meio segundo, o webhook trata
 * como pagamento em duas abas (fecha a outra sessão ou devolve o pagamento repetido).
 * Só para pedido pendente ou expirado; lança erro se a Stripe falhar (a rota decide o que fazer com o pedido).
 * Se o pedido for pago ou cancelado enquanto a sessão nasce, ele não aceita a sessão nova: ela é expirada na
 * Stripe e sai PedidoFechado (a rota responde 409 'status').
 */
export async function abrirSessaoDoPedido(vouchers: Reserva[], forma: FormaPagamento, agora: Date = new Date()): Promise<SessaoAberta> {
  const [r] = vouchers;
  if (!r) throw new Error('Pedido sem itens.');
  const codigo = r.pedido?.codigo ?? r.codigo;
  if (!podeAbrirSessao(r.status)) throw new PedidoFechado(r.status);
  const { paraPublico } = await import('../../../lib/reserva-publica.ts');
  const { dicionario } = await import('../../../i18n/index.ts');
  const { urlDoSite } = await import('../../../lib/site.ts');
  const { renomearBloqueiosDaSessao } = await import('../../../lib/pedido-carrinho.ts');

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

  // primeiro a sessão lida no começo, depois a que a gravação encontrou (a de outro "Pagar" quase simultâneo): com
  // dois cliques, em qualquer ordem de chegada, os bloqueios de casa terminam na sessão que ficou no pedido e a
  // outra fecha. (Três cliques ao mesmo tempo ainda poderiam deixar um bloqueio numa sessão fechada; hoje nenhum
  // pedido tem bloqueio de casa, isso chega na Etapa 7.)
  for (const anterior of sessoesSubstituidas(r.pagamentoExternoId, registro.substituida, sessao.id)) {
    await renomearBloqueiosDaSessao(anterior, sessao.id).catch((e) =>
      console.error(`[pedido] não deu para passar os bloqueios de casa para a sessão nova do pedido ${codigo}: ${mensagem(e)}`),
    );
    // a anterior, se ainda aberta, deixa de aceitar pagamento. O QR de um Pix já gerado não se fecha: se ele for pago,
    // vale como o pagamento do pedido e o webhook fecha esta sessão nova
    await expirarSessao(anterior).catch((e) =>
      console.error(`[pedido] não deu para expirar a sessão anterior do pedido ${codigo}: ${mensagem(e)}`),
    );
  }
  return { codigo, sessaoId: sessao.id, clientSecret: sessao.client_secret, forma };
}

/**
 * Cancela um pedido da Stripe que ainda não foi pago (pendente ou expirado): expira a sessão aberta, para o
 * cliente não pagar um pedido cancelado, grava o status e libera as datas de casa presas à sessão. Num pedido
 * em outro status não faz nada e devolve-o como está; null se o pedido não existir.
 */
export async function cancelarPedidoAberto(codigo: string, evento: string): Promise<Reserva | null> {
  const { atualizarReserva, obterReservaDoPedido, registrar } = await import('../../../lib/reservas.ts');
  const { liberarBloqueiosDaSessao } = await import('../../../lib/pedido-carrinho.ts');
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return null;
  if (!podeAbrirSessao(alvo.status)) return alvo;
  const sessao = alvo.pagamentoExternoId;
  if (sessao)
    await expirarSessao(sessao).catch((e) => console.error(`[pedido] não deu para expirar a sessão do pedido ${codigo}: ${mensagem(e)}`));
  const r = await atualizarReserva(alvo.codigo, (r) => {
    if (!podeAbrirSessao(r.status)) return null;
    r.status = 'cancelado';
    return registrar(r, evento);
  });
  if (r?.status === 'cancelado' && sessao) {
    await liberarBloqueiosDaSessao(sessao).catch((e) =>
      console.error(`[pedido] não deu para liberar as datas do pedido ${codigo}: ${mensagem(e)}`),
    );
  }
  return r;
}
