import type { Idioma } from '@/i18n/config';
import type { Json, Tables } from './banco-tipos';
import type { Reserva, ReservaPasseio, ReservaTransfer, StatusReserva } from './reservas';

/**
 * A reserva como o site usa (o mesmo JSON que ficava no Blob) ↔ as linhas do banco: um pedido, um item
 * (o voucher) e o histórico. Com um item só, o voucher tem o código do pedido; no pedido do carrinho com
 * vários itens, cada voucher tem o seu código e a reserva guarda os dados do pedido em `pedido`.
 * Aqui só se traduz, sem tocar no banco: assim dá para testar que nada se perde na ida e na volta
 * (tests/reservas-banco.test.ts).
 */

export type LinhaPedido = Tables<'pedidos'>;
export type LinhaItem = Tables<'itens_pedido'>;
// "type", e não "interface": assim o evento vai direto como JSON para as funções do banco
export type EventoHistorico = {
  em: string;
  evento: string;
};

export interface LinhasReserva {
  pedido: LinhaPedido;
  item: LinhaItem;
  historico: EventoHistorico[];
}

const json = (v: unknown) => v as Json;

/** O voucher acompanha o pedido quando ele é cancelado ou reembolsado; nos outros casos fica ativo. */
function statusDoItem(s: StatusReserva): string {
  return s === 'cancelado' || s === 'reembolsado' ? s : 'ativo';
}

/** Reserva → linhas completas (com todas as colunas), prontas para as funções criar_reserva e atualizar_reserva. */
export function paraLinhas(
  r: Reserva,
  ids: { pedido: string; item: string } = { pedido: crypto.randomUUID(), item: crypto.randomUUID() },
): LinhasReserva {
  const totalPedido = r.pedido?.totalCentavos ?? r.totalCentavos;
  const pedido: LinhaPedido = {
    id: ids.pedido,
    codigo: r.pedido?.codigo ?? r.codigo,
    token: r.token,
    status: r.status,
    idioma: r.idioma,
    cliente_nome: r.cliente.nome,
    cliente_email: r.cliente.email,
    cliente_telefone: r.cliente.telefone,
    cliente_documento_tipo: r.tipo === 'transfer' ? null : (r.cliente.documentoTipo ?? null),
    cliente_documento: r.tipo === 'transfer' ? null : (r.cliente.documento ?? null),
    cliente_pais: null,
    metodo_pagamento: r.pagamento.metodo,
    pagamento: json(r.pagamento),
    subtotal_centavos: totalPedido,
    desconto_centavos: 0,
    total_centavos: totalPedido,
    total_pix_centavos: (r.pedido ? r.pedido.totalPixCentavos : r.totalPixCentavos) ?? null,
    moeda: 'BRL',
    origem_utm: {},
    observacoes: r.observacoes ?? null,
    pago_em: r.pagamento.pagoEm ?? null,
    criado_em: r.criadaEm,
    atualizado_em: r.atualizadaEm,
  };
  const comum = {
    id: ids.item,
    pedido_id: ids.pedido,
    data: r.data,
    data_fim: null,
    preco_centavos: r.totalCentavos,
    sinal_centavos: null,
    voucher_codigo: r.codigo,
    status: statusDoItem(r.status),
    criado_em: r.criadaEm,
  };
  // no pedido com vários itens, o preço do item no Pix (o total do pedido fica na linha do pedido)
  const pix = r.pedido && r.totalPixCentavos !== undefined ? { pixCentavos: r.totalPixCentavos } : {};
  const item: LinhaItem =
    r.tipo === 'transfer'
      ? {
          ...comum,
          tipo: 'transfer',
          produto_slug: 'transfer',
          produto_nome: 'Transfer privado',
          cidade: null,
          opcao: null,
          horario: r.transfer.ida.hora,
          pessoas: json({ passageiros: r.transfer.passageiros }),
          unidades: 1,
          detalhes: json({
            veiculo: r.transfer.veiculo,
            ida: r.transfer.ida,
            ...(r.transfer.volta ? { volta: r.transfer.volta } : {}),
            malas: r.transfer.malas,
            cadeirinhas: r.transfer.cadeirinhas,
            ...pix,
          }),
        }
      : {
          ...comum,
          tipo: 'passeio',
          produto_slug: r.passeio.slug,
          produto_nome: r.passeio.nome,
          cidade: r.passeio.cidade,
          opcao: r.passeio.opcao ? json(r.passeio.opcao) : null,
          horario: r.horario?.hora ?? null,
          pessoas: json({
            adultos: r.adultos,
            criancas: r.criancas,
            ...(r.criancasMeia !== undefined ? { criancasMeia: r.criancasMeia } : {}),
            ...(r.criancasGratis !== undefined ? { criancasGratis: r.criancasGratis } : {}),
          }),
          unidades: r.unidades,
          detalhes: json({
            unidade: r.passeio.unidade,
            hospedagem: r.hospedagem,
            ...(r.horario ? { horario: r.horario } : {}),
            ...pix,
          }),
        };
  return { pedido, item, historico: (r.historico ?? []).map(({ em, evento }) => ({ em, evento })) };
}

/** O banco devolve as datas como "2026-11-03 10:00:00+00"; o site usa "2026-11-03T10:00:00.000Z". */
const iso = (t: string) => new Date(t).toISOString();

/** Linhas do banco → reserva. As reservas de passeio antigas, sem "tipo", voltam com tipo "passeio". */
export function deLinhas(p: LinhaPedido, i: LinhaItem, historico: EventoHistorico[]): Reserva {
  // o voucher com código próprio é um dos itens de um pedido do carrinho
  const voucher = i.voucher_codigo && i.voucher_codigo !== p.codigo ? i.voucher_codigo : null;
  const pix = voucher ? (i.detalhes as { pixCentavos?: number }).pixCentavos : (p.total_pix_centavos ?? undefined);
  const base = {
    codigo: voucher ?? p.codigo,
    token: p.token,
    criadaEm: iso(p.criado_em),
    atualizadaEm: iso(p.atualizado_em),
    idioma: p.idioma as Idioma,
    status: p.status as StatusReserva,
    data: i.data,
    totalCentavos: voucher ? i.preco_centavos : p.total_centavos,
    ...(pix !== undefined ? { totalPixCentavos: pix } : {}),
    ...(voucher
      ? {
          pedido: {
            codigo: p.codigo,
            totalCentavos: p.total_centavos,
            ...(p.total_pix_centavos !== null ? { totalPixCentavos: p.total_pix_centavos } : {}),
          },
        }
      : {}),
    ...(p.observacoes !== null ? { observacoes: p.observacoes } : {}),
    pagamento: p.pagamento as unknown as Reserva['pagamento'],
    historico: historico.map(({ em, evento }) => ({ em: iso(em), evento })).sort((a, b) => a.em.localeCompare(b.em)),
  };
  const cliente = { nome: p.cliente_nome, email: p.cliente_email, telefone: p.cliente_telefone };
  const pessoas = i.pessoas as Record<string, number>;

  if (i.tipo === 'transfer') {
    const d = i.detalhes as unknown as Omit<ReservaTransfer['transfer'], 'passageiros'>;
    const transfer: ReservaTransfer = {
      ...base,
      tipo: 'transfer',
      cliente,
      transfer: {
        veiculo: d.veiculo,
        ida: d.ida,
        ...(d.volta ? { volta: d.volta } : {}),
        passageiros: pessoas.passageiros,
        malas: d.malas,
        cadeirinhas: d.cadeirinhas,
      },
    };
    return transfer;
  }

  const d = i.detalhes as unknown as {
    unidade: ReservaPasseio['passeio']['unidade'];
    hospedagem: ReservaPasseio['hospedagem'];
    horario?: ReservaPasseio['horario'];
  };
  const passeio: ReservaPasseio = {
    ...base,
    tipo: 'passeio',
    passeio: {
      slug: i.produto_slug,
      nome: i.produto_nome,
      cidade: i.cidade ?? '',
      unidade: d.unidade,
      ...(i.opcao ? { opcao: i.opcao as unknown as NonNullable<ReservaPasseio['passeio']['opcao']> } : {}),
    },
    ...(d.horario ? { horario: d.horario } : {}),
    adultos: pessoas.adultos,
    criancas: pessoas.criancas,
    ...(pessoas.criancasMeia !== undefined ? { criancasMeia: pessoas.criancasMeia } : {}),
    ...(pessoas.criancasGratis !== undefined ? { criancasGratis: pessoas.criancasGratis } : {}),
    unidades: i.unidades,
    cliente: {
      ...cliente,
      // o checkout do carrinho pede só nome, e-mail e WhatsApp
      ...(p.cliente_documento !== null
        ? { documentoTipo: p.cliente_documento_tipo as ReservaPasseio['cliente']['documentoTipo'], documento: p.cliente_documento }
        : {}),
    },
    hospedagem: d.hospedagem,
  };
  return passeio;
}
