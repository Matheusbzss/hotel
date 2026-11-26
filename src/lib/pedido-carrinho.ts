import 'server-only';
import type { Idioma } from '@/i18n/config';
import { supabase, usarBanco } from './banco';
import type { CarrinhoGuardado, Conferida } from './carrinho-servidor';
import type { TrechoEscolhido } from './carrinho';
import { argsDePrenderDatas, type BloqueioDoSite } from './casas-banco';
import {
  bloqueiosDoSiteNoComputador,
  bloqueiosDoSiteQueCruzam,
  itensPresosNoComputador,
  prenderNoComputador,
  renomearNoComputador,
  renomearVistaNoComputador,
  soltarNoComputador,
} from './casas';
import type { FormaPagamento } from './formas-pagamento';
import type { Origem } from './origem';
import { obterOpcao, temOpcoes } from './precos';
import {
  ehCasa,
  listarReservas,
  obterPedido,
  obterReserva,
  type NovaReserva,
  type Reserva,
  type ReservaCasa,
  type ReservaPasseio,
  type TrechoTransfer,
} from './reservas';
import { codigoDoPedido } from './reservas-banco';
import { depoisDoNaoDeu, itensAPrender, type EstadiaDoPedido, type ReservaQueSegura, type TravaVista } from './trava-das-casas';

/**
 * O pedido do carrinho: a reserva de cada item (um voucher por item, um pagamento só) e, nas casas, o bloqueio
 * das datas enquanto o cliente paga. A sessão de pagamento do pedido fica em src/app/api/pedido/pedido-stripe.ts.
 */

/** O que o titular informa uma vez só no checkout do carrinho. */
export interface DadosDoPedido {
  idioma: Idioma;
  cliente: { nome: string; email: string; telefone: string };
  hospedagem?: ReservaPasseio['hospedagem'];
  observacoes?: string;
  origem: Origem;
  /**
   * A forma de pagamento online escolhida (cartão ou Pix): o pedido nasce pendente, para a Stripe cobrar. Sem
   * ela, o caminho de hoje: a equipe finaliza pelo WhatsApp, no Pix ou no cartão (nunca com casa: a rota recusa).
   */
  pagamento?: FormaPagamento;
}

/** O que o checkout pergunta de cada transfer. */
export interface ExtrasTransfer {
  vooIda: string;
  vooVolta: string;
  cadeirinhas: number[];
}

/**
 * A reserva de um item do carrinho, com os mesmos dados que o checkout de um item só grava. Com uma forma de
 * pagamento online, o pedido fica pendente até o webhook da Stripe confirmar; sem ela, espera o WhatsApp.
 * Na casa, a reserva guarda o total da estadia (no cartão e no Pix), o sinal das duas formas e as linhas da conta, do
 * jeito que a conferência do servidor fez agora (conferirCasa, src/lib/casa-no-carrinho.ts): nada disso é refeito depois.
 */
export function reservaDoItem(c: Extract<Conferida, { ok: true }>, dados: DadosDoPedido, extras?: ExtrasTransfer): NovaReserva {
  const comum = {
    idioma: dados.idioma,
    totalCentavos: c.totalCentavos,
    totalPixCentavos: c.totalPixCentavos,
    cliente: dados.cliente,
    observacoes: dados.observacoes,
    ...(dados.pagamento
      ? { status: 'pendente' as const, provedor: 'stripe' as const, pagamento: { metodo: dados.pagamento } }
      : { status: 'aguardando_whatsapp' as const, pagamento: { metodo: 'whatsapp' as const } }),
    ...(Object.keys(dados.origem).length ? { origem: dados.origem } : {}),
  };

  if ('casa' in c) {
    const casa: Omit<ReservaCasa, 'codigo' | 'token' | 'criadaEm' | 'atualizadaEm' | 'historico'> = {
      ...comum,
      tipo: 'casa',
      // o nome em português, como o dos passeios: o voucher e o painel leem daqui, mesmo se a casa sair do ar
      casa: { id: c.casa.id, slug: c.casa.slug, nome: c.casa.nome.pt, cidade: c.casa.cidade },
      data: c.escolha.entrada,
      saida: c.escolha.saida,
      hospedes: c.escolha.hospedes,
      sinalCentavos: c.sinalCentavos,
      sinalPixCentavos: c.sinalPixCentavos,
      linhas: c.linhas,
    };
    return casa;
  }

  if ('passeio' in c) {
    if (!dados.hospedagem) throw new Error('Passeio sem hospedagem');
    const { passeio: p, escolha: e, orc } = c;
    const opcao = temOpcoes(p) ? obterOpcao(p, e.opcao) : undefined;
    return {
      ...comum,
      passeio: {
        slug: p.slug,
        nome: p.nome.pt,
        cidade: p.cidade,
        unidade: p.unidade,
        ...(opcao ? { opcao: { id: opcao.id, nome: opcao.nome.pt } } : {}),
      },
      data: e.data,
      horario: { hora: e.hora, busca: c.busca },
      adultos: e.adultos,
      criancas: e.meia + e.gratis,
      criancasMeia: e.meia,
      criancasGratis: e.gratis,
      unidades: orc.unidades,
      hospedagem: dados.hospedagem,
      ...(e.sugestao ? { sugestao: true } : {}),
    };
  }

  const e = c.escolha;
  const trecho = (t: TrechoEscolhido, precoCentavos: number, voo = ''): TrechoTransfer => ({
    ...t,
    ...(voo ? { voo: voo.toUpperCase() } : {}),
    precoCentavos,
  });
  return {
    ...comum,
    tipo: 'transfer',
    data: e.ida.data,
    transfer: {
      veiculo: e.veiculo,
      ida: trecho(e.ida, c.trechosCentavos[0], extras?.vooIda),
      ...(e.volta ? { volta: trecho(e.volta, c.trechosCentavos[1], extras?.vooVolta) } : {}),
      passageiros: e.passageiros,
      malas: e.malas,
      cadeirinhas: extras?.cadeirinhas ?? [],
    },
  };
}

/* ------------------------------------------------------------------ */
/* As casas: o bloqueio das datas enquanto o cliente paga               */

/**
 * As datas de uma casa ficam presas em casas_bloqueios (origem 'site', a sessão de pagamento corrente como referência e o
 * item do pedido, item_pedido_id) desde a sessão de pagamento até o pedido vencer, ser cancelado ou ser devolvido. No
 * computador sem o banco (a cópia particular), a mesma regra num arquivo (src/lib/casas.ts, prenderNoComputador). O item
 * do pedido, no banco, é o id de itens_pedido; nos arquivos, o código do voucher.
 */

export class DatasIndisponiveis extends Error {
  constructor() {
    super('As datas desta casa acabaram de ser reservadas por outra pessoa.');
    this.name = 'DatasIndisponiveis';
  }
}

const erroDoBanco = (e: { message: string }) => new Error(`Banco de dados: ${e.message}`);

/**
 * Reserva as datas das casas do pedido pela função do banco prender_datas_casas (migração 20261125234456), com a
 * sessão de pagamento como referência: é o ÚNICO caminho que grava uma estadia do site em casas_bloqueios. A função
 * trava as casas, confere TODOS os bloqueios de cada uma (reserva do site, bloqueio à mão e calendário de fora), e
 * não só os do site, como a trava antiga, e grava tudo ou nada. Se alguma noite já estiver ocupada, ela devolve false
 * e aqui sai DatasIndisponiveis, sem nenhum bloqueio gravado. Nunca insira direto na tabela: a inserção direta
 * passaria por cima de um bloqueio à mão e, ao lado da função, as duas poderiam travar uma à outra. No computador sem o
 * banco, a trava no arquivo, com a mesma regra.
 */
export async function bloquearCasasDoPedido(estadias: BloqueioDoSite[], sessaoId: string): Promise<void> {
  if (!estadias.length) return;
  if (!usarBanco()) {
    if (!(await prenderNoComputador(estadias, sessaoId))) throw new DatasIndisponiveis();
    return;
  }
  const { data, error } = await supabase().rpc('prender_datas_casas', argsDePrenderDatas(estadias, sessaoId));
  if (error) throw new Error(`Banco de dados: ${error.message}`);
  if (data !== true) throw new DatasIndisponiveis();
}

/** Libera as datas presas a uma sessão de pagamento (ela venceu, ou o pedido foi cancelado). Devolve quantas saíram. */
export async function liberarBloqueiosDaSessao(sessaoId: string): Promise<number> {
  if (!usarBanco()) return soltarNoComputador({ referencia: sessaoId });
  const { data, error } = await supabase().from('casas_bloqueios').delete().eq('origem', 'site').eq('referencia', sessaoId).select('id');
  if (error) throw new Error(`Banco de dados: ${error.message}`);
  return data.length;
}

/** Os ids dos itens de casa (no banco, de itens_pedido) pelo código do voucher; nos arquivos, o próprio código. */
async function idsDosItens(vouchers: readonly string[]): Promise<Map<string, string>> {
  if (!vouchers.length) return new Map();
  if (!usarBanco()) return new Map(vouchers.map((v) => [v, v]));
  const { data, error } = await supabase()
    .from('itens_pedido')
    .select('id, voucher_codigo')
    .eq('tipo', 'casa')
    .in('voucher_codigo', [...vouchers]);
  if (error) throw erroDoBanco(error);
  return new Map(data.flatMap((l): [string, string][] => (l.voucher_codigo ? [[l.voucher_codigo, l.id]] : [])));
}

/** O voucher de casa que ainda vale: o cancelado ou devolvido sozinho (num pedido que continua pago) não prende nada. */
const casaQueVale = (v: ReservaCasa) => v.statusItem !== 'cancelado' && v.statusItem !== 'reembolsado';

/** Uma estadia de casa do pedido, com o voucher de onde veio. */
export interface EstadiaDoVoucher extends EstadiaDoPedido {
  voucher: string;
}

/**
 * As estadias de casa de um pedido, com o item de cada uma. Um voucher de casa sem o item no banco não deveria existir:
 * se existir, sai erro (prender sem ele deixaria a casa paga sem as datas presas).
 */
export async function estadiasDoPedido(
  vouchers: readonly Reserva[],
  { todas = false }: { todas?: boolean } = {},
): Promise<EstadiaDoVoucher[]> {
  const casas = vouchers.filter(ehCasa).filter((v) => todas || casaQueVale(v));
  if (!casas.length) return [];
  const ids = await idsDosItens(casas.map((c) => c.codigo));
  return casas.map((c) => {
    const itemPedidoId = ids.get(c.codigo);
    if (!itemPedidoId) throw new Error(`O voucher ${c.codigo} da casa não tem o item no banco.`);
    return { itemPedidoId, casaId: c.casa.id, inicio: c.data, fim: c.saida, voucher: c.codigo };
  });
}

/** Só a estadia, sem o voucher: é o que vai para a trava (a função do banco e o arquivo do computador). */
const paraATrava = ({ itemPedidoId, casaId, inicio, fim }: EstadiaDoPedido): EstadiaDoPedido => ({ itemPedidoId, casaId, inicio, fim });

/**
 * Os itens de casa do pedido que o carrinho virou: as noites deles são livres para o mesmo visitante enquanto o pedido
 * espera o pagamento (crítica de 26/11, furo 9: pela lista dos itens, nunca pela sessão de pagamento). Só é lido quando
 * o carrinho tem casa (src/lib/casas-carrinho.ts).
 */
export async function itensDeCasaDoCarrinho(c: Pick<CarrinhoGuardado, 'pedidoId' | 'pedido'>): Promise<string[]> {
  if (!c.pedidoId || !c.pedido) return [];
  if (!usarBanco()) return (await obterPedido(c.pedido.codigo)).filter(ehCasa).map((v) => v.codigo);
  const { data, error } = await supabase().from('itens_pedido').select('id').eq('pedido_id', c.pedidoId).eq('tipo', 'casa');
  if (error) throw erroDoBanco(error);
  return data.map((l) => l.id);
}

/** Passa para a sessão nova as estadias do site destes itens, conferindo as linhas: devolve os itens que voltaram. */
async function renomearPeloItem(itens: readonly string[], sessaoId: string): Promise<string[]> {
  if (!itens.length) return [];
  if (!usarBanco()) return renomearNoComputador(itens, sessaoId);
  const { data, error } = await supabase()
    .from('casas_bloqueios')
    .update({ referencia: sessaoId })
    .eq('origem', 'site')
    .in('item_pedido_id', [...itens])
    .select('item_pedido_id');
  if (error) throw erroDoBanco(error);
  return data.flatMap((l) => (l.item_pedido_id ? [l.item_pedido_id] : []));
}

/** Quais destes itens têm a estadia do site presa agora. */
async function itensComBloqueio(itens: readonly string[]): Promise<string[]> {
  if (!itens.length) return [];
  if (!usarBanco()) return itensPresosNoComputador(itens);
  const { data, error } = await supabase()
    .from('casas_bloqueios')
    .select('item_pedido_id')
    .eq('origem', 'site')
    .in('item_pedido_id', [...itens]);
  if (error) throw erroDoBanco(error);
  return data.flatMap((l) => (l.item_pedido_id ? [l.item_pedido_id] : []));
}

/**
 * Prende as datas das casas do pedido para a sessão de pagamento nova (o primeiro pagamento, a troca de forma e o "Pagar
 * de novo"), pelas correções do furo 1 da crítica de 26/11:
 * 1. renomeia pelo ITEM do pedido (item_pedido_id) e confere as linhas que voltaram: a estadia que o aviso de sessão
 *    vencida apagou no meio do caminho não volta, e é presa de novo (antes, a troca pela referência engolia o erro e não
 *    conferia nada);
 * 2. prende o que faltou SEMPRE por bloquearCasasDoPedido (a função do banco que confere todos os bloqueios);
 * 3. se ela disser que não deu, confere pelo item: preso por outro toque do mesmo cliente no meio-tempo (os dois toques no
 *    "Pagar de novo" levam a mesma sessão, furo 7) é sucesso, e passa para esta sessão; faltando, sai DatasIndisponiveis.
 * Qualquer outro erro (o banco fora do ar) segue para quem chamou: a sessão nova não pode chegar ao cliente sem as datas
 * presas. Devolve se o pedido tem casa (para a rota refazer o calendário). Com `todas` (o "Reativar" do pedido cancelado com
 * o pagamento parado, pacote 2), também os vouchers que o cancelamento deixou 'cancelado': todos voltam a valer juntos.
 */
export async function prenderDatasDoPedido(
  vouchers: readonly Reserva[],
  sessaoId: string,
  { todas = false }: { todas?: boolean } = {},
): Promise<boolean> {
  const estadias = await estadiasDoPedido(vouchers, { todas });
  if (!estadias.length) return false;
  const faltam = itensAPrender(
    estadias,
    await renomearPeloItem(
      estadias.map((e) => e.itemPedidoId),
      sessaoId,
    ),
  );
  if (!faltam.length) return true;
  try {
    await bloquearCasasDoPedido(faltam.map(paraATrava), sessaoId);
  } catch (e) {
    if (!(e instanceof DatasIndisponiveis)) throw e;
    if (depoisDoNaoDeu(faltam, await itensComBloqueio(faltam.map((f) => f.itemPedidoId))) === 'ocupadas') throw e;
    // presas por outro toque do mesmo cliente: seguem a sessão corrente, para sair junto com ela
    await renomearPeloItem(
      faltam.map((f) => f.itemPedidoId),
      sessaoId,
    );
  }
  return true;
}

/**
 * As estadias do pedido passam para a sessão que ficou como a corrente dele (dois "Pagar" quase juntos: cada toque
 * prende com a sua sessão, e a do outro pode ter ficado no pedido). Sem casa, nada.
 */
export async function acertarDatasParaASessao(vouchers: readonly Reserva[], sessaoId: string): Promise<void> {
  const estadias = await estadiasDoPedido(vouchers);
  await renomearPeloItem(
    estadias.map((e) => e.itemPedidoId),
    sessaoId,
  );
}

/**
 * Solta as datas das casas destes vouchers, pelo item do pedido (só as do site: o bloqueio à mão e o do calendário de fora
 * nunca saem por aqui). Para quando o pedido já não vale (cancelado ao refazer o pedido, por exemplo). Devolve quantas saíram.
 */
export async function liberarDatasDosVouchers(vouchers: readonly Reserva[]): Promise<number> {
  const itens = (await estadiasDoPedido(vouchers, { todas: true })).map((e) => e.itemPedidoId);
  if (!itens.length) return 0;
  if (!usarBanco()) return soltarNoComputador({ itens });
  const { data, error } = await supabase().from('casas_bloqueios').delete().eq('origem', 'site').in('item_pedido_id', itens).select('id');
  if (error) throw erroDoBanco(error);
  return data.length;
}

/**
 * As casas que valem deste pedido que estão SEM a estadia do site presa agora (os códigos dos vouchers), só lendo: nada é
 * preso nem solto. Revisão do pacote 2 (achado 3): o e-mail do pagamento aprovado (src/lib/email/pedidos.ts) só leva o
 * voucher da casa com as datas presas, e quem prende é sempre a conferência das rotas (conferirDatasDoPedidoPago), que
 * também refaz o calendário das páginas. Sem casa, nada.
 */
export async function casasSemATrava(vouchers: readonly Reserva[]): Promise<string[]> {
  const estadias = await estadiasDoPedido(vouchers);
  if (!estadias.length) return [];
  const presos = new Set(await itensComBloqueio(estadias.map((e) => e.itemPedidoId)));
  return estadias.filter((e) => !presos.has(e.itemPedidoId)).map((e) => e.voucher);
}

/**
 * Na virada para pago (o aviso da Stripe, nunca a página: crítica de 26/11, furo 1, correção 3, e furo 3): cada casa do
 * pedido tem a estadia do site presa? A que não tem (o pagamento que chegou depois de a sessão vencer, uma trava perdida)
 * é presa agora, com a sessão paga; se as noites já forem de outra pessoa, ela volta na lista `semTrava`, e quem chamou
 * deixa o "Aviso:" no histórico para a equipe (a reserva continua paga: a equipe decide). Devolve também se prendeu algo.
 */
export async function conferirDatasDoPedidoPago(
  vouchers: readonly Reserva[],
  sessaoId: string,
): Promise<{ prendeu: boolean; semTrava: ReservaCasa[] }> {
  const estadias = await estadiasDoPedido(vouchers);
  if (!estadias.length) return { prendeu: false, semTrava: [] };
  const faltam = itensAPrender(estadias, await itensComBloqueio(estadias.map((e) => e.itemPedidoId)));
  if (!faltam.length) return { prendeu: false, semTrava: [] };
  // uma de cada vez: a casa que dá para prender fica presa, mesmo que outra do mesmo pedido não dê
  const semTrava: ReservaCasa[] = [];
  let prendeu = false;
  for (const f of faltam) {
    try {
      await bloquearCasasDoPedido([paraATrava(f)], sessaoId);
      prendeu = true;
    } catch (e) {
      if (!(e instanceof DatasIndisponiveis)) throw e;
      if (depoisDoNaoDeu([f], await itensComBloqueio([f.itemPedidoId])) === 'presas') continue;
      const voucher = vouchers.filter(ehCasa).find((v) => v.codigo === f.voucher);
      if (voucher) semTrava.push(voucher);
    }
  }
  return { prendeu, semTrava };
}

/**
 * As reservas do site que seguram noites de uma casa entre `inicio` e a véspera de `fim`, com os status de agora (o do
 * pedido e o do item): é o que o "Bloquear datas" do painel confere antes de gravar (reservasQueImpedemOBloqueio,
 * src/lib/trava-das-casas.ts; crítica de 26/11, furo 6). A estadia cujo pedido não se acha mais fica de fora.
 */
export async function reservasDoSiteNasDatas(casaId: string, inicio: string, fim: string): Promise<ReservaQueSegura[]> {
  const bloqueios = await bloqueiosDoSiteQueCruzam(casaId, inicio, fim);
  if (!bloqueios.length) return [];
  // o voucher de cada item: no banco, pela tabela dos itens; nos arquivos, o item já é o código do voucher
  let voucherDoItem = new Map(bloqueios.map((b) => [b.itemPedidoId, b.itemPedidoId]));
  if (usarBanco()) {
    const { data, error } = await supabase()
      .from('itens_pedido')
      .select('id, voucher_codigo')
      .in(
        'id',
        bloqueios.map((b) => b.itemPedidoId),
      );
    if (error) throw erroDoBanco(error);
    voucherDoItem = new Map(data.flatMap((l): [string, string][] => (l.voucher_codigo ? [[l.id, l.voucher_codigo]] : [])));
  }
  const lista: ReservaQueSegura[] = [];
  for (const b of bloqueios) {
    const voucher = voucherDoItem.get(b.itemPedidoId);
    const r = voucher ? await obterReserva(voucher) : null;
    if (!r) continue;
    lista.push({
      voucher: r.codigo,
      pedido: r.pedido?.codigo ?? r.codigo,
      status: r.status,
      ...(r.statusItem ? { statusItem: r.statusItem } : {}),
      inicio: b.inicio,
      fim: b.fim,
    });
  }
  return lista;
}

/**
 * Já existe um pedido com casa esperando o pagamento (pendente) com este e-mail, fora o do próprio carrinho (que é
 * cancelado quando o cliente refaz o pedido)? No máximo um por e-mail (crítica de 26/11, furo 21): um pedido de Pix prende
 * as noites por até 61 minutos, e sem o limite dava para prender o Réveillon sem pagar. O e-mail chega minúsculo
 * (POST /api/pedido).
 */
export async function pedidoDeCasaEsperando(email: string, exceto?: string): Promise<boolean> {
  if (!usarBanco()) {
    return (await listarReservas()).some(
      (r) => ehCasa(r) && r.status === 'pendente' && r.cliente.email.toLowerCase() === email && codigoDoPedido(r) !== exceto,
    );
  }
  const { data: pedidos, error } = await supabase()
    .from('pedidos')
    .select('id, codigo')
    .eq('status', 'pendente')
    .eq('cliente_email', email)
    .limit(20);
  if (error) throw erroDoBanco(error);
  const ids = pedidos.filter((p) => p.codigo !== exceto).map((p) => p.id);
  if (!ids.length) return false;
  const { data: casas, error: erroItens } = await supabase()
    .from('itens_pedido')
    .select('pedido_id')
    .eq('tipo', 'casa')
    .in('pedido_id', ids)
    .limit(1);
  if (erroItens) throw erroDoBanco(erroItens);
  return casas.length > 0;
}

/* ------------------------------------------------------------------ */
/* A rede de segurança de hora em hora (pacote 2; src/lib/rede-das-casas.ts) */

/**
 * As travas do site das estadias que ainda não acabaram (a saída depois de `hoje`), com o item, a referência e a hora de
 * cada uma. A trava sem o item do pedido (não deveria existir: a função do banco sempre grava o item) fica de fora: sem ele
 * não dá para saber de quem é, e a rede nunca solta só pela referência.
 */
export async function travasDoSite(hoje: string): Promise<TravaVista[]> {
  if (!usarBanco()) {
    return (await bloqueiosDoSiteNoComputador())
      .filter((b) => b.fim > hoje)
      .map((b) => ({
        itemPedidoId: b.itemPedidoId,
        referencia: b.referencia,
        casaId: b.casaId,
        inicio: b.inicio,
        fim: b.fim,
        ...(b.criadoEm ? { criadoEm: b.criadoEm } : {}),
      }));
  }
  const { data, error } = await supabase()
    .from('casas_bloqueios')
    .select('casa_id, inicio, fim, referencia, item_pedido_id, criado_em')
    .eq('origem', 'site')
    .gt('fim', hoje);
  if (error) throw erroDoBanco(error);
  return data.flatMap((b) =>
    b.item_pedido_id
      ? [
          {
            itemPedidoId: b.item_pedido_id,
            referencia: b.referencia ?? '',
            casaId: b.casa_id,
            inicio: b.inicio,
            fim: b.fim,
            criadoEm: b.criado_em,
          },
        ]
      : [],
  );
}

/** O voucher de cada item (no banco, pela tabela dos itens; nos arquivos, o item já é o código do voucher). */
export async function vouchersDosItens(itens: readonly string[]): Promise<Map<string, string>> {
  if (!itens.length) return new Map();
  if (!usarBanco()) return new Map(itens.map((i) => [i, i]));
  const { data, error } = await supabase()
    .from('itens_pedido')
    .select('id, voucher_codigo')
    .in('id', [...new Set(itens)]);
  if (error) throw erroDoBanco(error);
  return new Map(data.flatMap((l): [string, string][] => (l.voucher_codigo ? [[l.id, l.voucher_codigo]] : [])));
}

/** Solta a trava vista pela rede, pelo item E pela referência que a rede viu (nunca só pelo item). Devolve quantas saíram. */
export async function soltarTravaVista(t: Pick<TravaVista, 'itemPedidoId' | 'referencia'>): Promise<number> {
  if (!usarBanco()) return soltarNoComputador({ pares: [{ item: t.itemPedidoId, referencia: t.referencia }] });
  const { data, error } = await supabase()
    .from('casas_bloqueios')
    .delete()
    .eq('origem', 'site')
    .eq('item_pedido_id', t.itemPedidoId)
    .eq('referencia', t.referencia)
    .select('id');
  if (error) throw erroDoBanco(error);
  return data.length;
}

/** Passa para a sessão `para` a trava vista pela rede, só se ela ainda estiver com a referência vista. Devolve quantas mudaram. */
export async function renomearTravaVista(t: Pick<TravaVista, 'itemPedidoId' | 'referencia'>, para: string): Promise<number> {
  if (!usarBanco()) return renomearVistaNoComputador(t.itemPedidoId, t.referencia, para);
  const { data, error } = await supabase()
    .from('casas_bloqueios')
    .update({ referencia: para })
    .eq('origem', 'site')
    .eq('item_pedido_id', t.itemPedidoId)
    .eq('referencia', t.referencia)
    .select('id');
  if (error) throw erroDoBanco(error);
  return data.length;
}

/** Os vouchers de casa cuja saída ainda não chegou (depois de `hoje`): a rede confere se os pagos têm a trava. */
export async function vouchersDeCasaAFrente(hoje: string): Promise<string[]> {
  if (!usarBanco()) return (await listarReservas()).filter((r) => ehCasa(r) && r.saida > hoje).map((r) => r.codigo);
  const { data, error } = await supabase().from('itens_pedido').select('voucher_codigo').eq('tipo', 'casa').gt('data_fim', hoje);
  if (error) throw erroDoBanco(error);
  return data.flatMap((l) => (l.voucher_codigo ? [l.voucher_codigo] : []));
}
