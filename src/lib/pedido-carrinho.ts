import 'server-only';
import type { Idioma } from '@/i18n/config';
import { supabase, usarBanco } from './banco';
import type { Conferida } from './carrinho-servidor';
import type { TrechoEscolhido } from './carrinho';
import { linhaDeBloqueioDoSite, type BloqueioDoSite } from './casas-banco';
import type { FormaPagamento } from './formas-pagamento';
import type { Origem } from './origem';
import { obterOpcao, temOpcoes } from './precos';
import type { NovaReserva, ReservaPasseio, TrechoTransfer } from './reservas';

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
   * ela, o caminho de hoje: a equipe finaliza pelo WhatsApp, no Pix ou no cartão.
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
 * As três funções abaixo valem para a Etapa 7 (a reserva de casas pelo site): hoje o carrinho só tem passeios
 * e transfers, então nenhum pedido chama bloquearCasasDoPedido. A liberação e a troca de sessão já estão
 * ligadas no webhook e no "pagar de novo", para nenhum bloqueio ficar preso quando as casas entrarem.
 * No computador (sem o banco) não há bloqueio: o calendário das casas de .data/casas/ não é mexido.
 */

export class DatasIndisponiveis extends Error {
  constructor() {
    super('As datas desta casa acabaram de ser reservadas por outra pessoa.');
    this.name = 'DatasIndisponiveis';
  }
}

/**
 * Reserva as datas das casas do pedido em casas_bloqueios, com a sessão de pagamento como referência. Tudo ou
 * nada: se alguma estadia esbarrar numa já vendida pelo site (trava do banco, código 23P01), lança
 * DatasIndisponiveis e nenhum bloqueio fica.
 */
export async function bloquearCasasDoPedido(estadias: BloqueioDoSite[], sessaoId: string): Promise<void> {
  if (!estadias.length || !usarBanco()) return;
  const { error } = await supabase()
    .from('casas_bloqueios')
    .insert(estadias.map((e) => linhaDeBloqueioDoSite(e, sessaoId)));
  if (!error) return;
  if (error.code === '23P01') throw new DatasIndisponiveis();
  throw new Error(`Banco de dados: ${error.message}`);
}

/** Libera as datas presas a uma sessão de pagamento (ela venceu, ou o pedido foi cancelado). Devolve quantas saíram. */
export async function liberarBloqueiosDaSessao(sessaoId: string): Promise<number> {
  if (!usarBanco()) return 0;
  const { data, error } = await supabase().from('casas_bloqueios').delete().eq('origem', 'site').eq('referencia', sessaoId).select('id');
  if (error) throw new Error(`Banco de dados: ${error.message}`);
  return data.length;
}

/** O cliente vai pagar de novo: os bloqueios passam a seguir a sessão nova, para não serem liberados quando a antiga vencer. */
export async function renomearBloqueiosDaSessao(antiga: string, nova: string): Promise<void> {
  if (!usarBanco() || antiga === nova) return;
  const { error } = await supabase().from('casas_bloqueios').update({ referencia: nova }).eq('origem', 'site').eq('referencia', antiga);
  if (error) throw new Error(`Banco de dados: ${error.message}`);
}
