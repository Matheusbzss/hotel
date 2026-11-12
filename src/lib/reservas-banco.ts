import type { Idioma } from '@/i18n/config';
import type { Json, Tables } from './banco-tipos';
// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { provedorDaReserva } from './pedidos-painel.ts';
import type { Provedor, Reserva, ReservaPasseio, ReservaTransfer, StatusItem, StatusReserva } from './reservas';

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

/**
 * O voucher acompanha o pedido quando ele é cancelado ou reembolsado; nos outros casos fica ativo. Um item
 * com status próprio (reembolsado sozinho, usado) guarda-o em `statusItem`, que passa por cima deste.
 */
function statusDoItem(s: StatusReserva): StatusItem {
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
    cliente_pais: r.cliente.pais ?? null,
    metodo_pagamento: r.pagamento.metodo,
    pagamento: json(r.pagamento),
    subtotal_centavos: totalPedido,
    desconto_centavos: 0,
    total_centavos: totalPedido,
    total_pix_centavos: (r.pedido ? r.pedido.totalPixCentavos : r.totalPixCentavos) ?? null,
    moeda: 'BRL',
    origem_utm: json(r.origem ?? {}),
    observacoes: r.observacoes ?? null,
    pago_em: r.pagamento.pagoEm ?? null,
    provedor: provedorDaReserva(r),
    pagamento_externo_id: r.pagamentoExternoId ?? null,
    payment_intent_id: r.paymentIntentId ?? null,
    reembolso_centavos: r.reembolsoCentavos ?? 0,
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
    status: r.statusItem ?? statusDoItem(r.status),
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
            ...(r.sugestao ? { sugestao: true } : {}),
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
  const origem = p.origem_utm as NonNullable<Reserva['origem']>;
  const pagamento = p.pagamento as unknown as Reserva['pagamento'];
  const status = p.status as StatusReserva;
  const base = {
    codigo: voucher ?? p.codigo,
    token: p.token,
    criadaEm: iso(p.criado_em),
    atualizadaEm: iso(p.atualizado_em),
    idioma: p.idioma as Idioma,
    status,
    // os campos do pagamento online só entram quando dizem algo: as reservas antigas voltam como foram gravadas
    ...(p.provedor !== provedorDaReserva({ pagamento }) ? { provedor: p.provedor as Provedor } : {}),
    ...(p.pagamento_externo_id !== null ? { pagamentoExternoId: p.pagamento_externo_id } : {}),
    ...(p.payment_intent_id !== null ? { paymentIntentId: p.payment_intent_id } : {}),
    ...(p.reembolso_centavos > 0 ? { reembolsoCentavos: p.reembolso_centavos } : {}),
    ...(i.status !== statusDoItem(status) ? { statusItem: i.status as StatusItem } : {}),
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
    ...(Object.keys(origem).length ? { origem } : {}),
    ...(p.observacoes !== null ? { observacoes: p.observacoes } : {}),
    pagamento,
    historico: historico.map(({ em, evento }) => ({ em: iso(em), evento })).sort((a, b) => a.em.localeCompare(b.em)),
  };
  const cliente = {
    nome: p.cliente_nome,
    email: p.cliente_email,
    telefone: p.cliente_telefone,
    ...(p.cliente_pais !== null ? { pais: p.cliente_pais } : {}),
  };
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
    sugestao?: boolean;
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
    ...(d.sugestao ? { sugestao: true } : {}),
  };
  return passeio;
}

/**
 * Sem o banco não existe a linha do pedido: cada voucher é um arquivo, e o que é DO PEDIDO fica repetido em
 * todos. Esta função leva do voucher que acabou de ser gravado para um irmão (outro voucher do mesmo pedido) o
 * que é do pedido e muda depois da compra: o status, o pagamento, o provedor, a sessão e o pagamento na Stripe,
 * o valor reembolsado, o país de quem pagou, a hora da última mudança e o histórico. O irmão guarda o que é só
 * dele: o código, o statusItem (o passeio reembolsado sozinho continua reembolsado), a data, o preço e os dados
 * do passeio ou do transfer. No histórico entram os eventos que ele ainda não tinha, na ordem do tempo; repetir
 * a cópia não repete nada.
 * Devolve o irmão atualizado, sem mexer nos dois que recebeu, ou null quando a cópia não vale: não são dois
 * vouchers diferentes do mesmo pedido, ou o irmão foi gravado DEPOIS do voucher (duas gravações chegaram juntas
 * e esta cópia ficou para trás: vale o mais novo).
 * Não toca em disco (tests/reservas-banco.test.ts); quem lê e grava é levarAosIrmaos, em reservas.ts.
 */
export function copiarDoPedido(irmao: Reserva, gravada: Reserva): Reserva | null {
  if (!gravada.pedido || irmao.pedido?.codigo !== gravada.pedido.codigo || irmao.codigo === gravada.codigo) return null;
  if (irmao.atualizadaEm > gravada.atualizadaEm) return null;

  const copia = structuredClone(irmao);
  copia.atualizadaEm = gravada.atualizadaEm;
  copia.status = gravada.status;
  copia.pagamento = structuredClone(gravada.pagamento);
  // os campos que só existem quando dizem algo: sem valor no voucher gravado, saem do irmão também
  if (gravada.provedor !== undefined) copia.provedor = gravada.provedor;
  else delete copia.provedor;
  if (gravada.pagamentoExternoId !== undefined) copia.pagamentoExternoId = gravada.pagamentoExternoId;
  else delete copia.pagamentoExternoId;
  if (gravada.paymentIntentId !== undefined) copia.paymentIntentId = gravada.paymentIntentId;
  else delete copia.paymentIntentId;
  if (gravada.reembolsoCentavos !== undefined) copia.reembolsoCentavos = gravada.reembolsoCentavos;
  else delete copia.reembolsoCentavos;
  if (gravada.cliente.pais !== undefined) copia.cliente.pais = gravada.cliente.pais;
  else delete copia.cliente.pais;

  // o histórico é o do pedido: entram os eventos que o irmão ainda não tinha (a mesma hora e o mesmo texto)
  const chave = (h: EventoHistorico) => `${h.em} ${h.evento}`;
  const jaTem = new Set((irmao.historico ?? []).map(chave));
  const novos = (gravada.historico ?? []).filter((h) => !jaTem.has(chave(h)));
  copia.historico = [...(copia.historico ?? []), ...novos].sort((a, b) => a.em.localeCompare(b.em));
  return copia;
}
