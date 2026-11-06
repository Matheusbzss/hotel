import { createHash } from 'node:crypto';
import type { PedidoPainel } from './pedidos-painel';

/**
 * O que vai para a Meta e para o Google quando uma venda é paga. Aqui só se monta o texto, sem tocar na
 * rede: assim dá para testar (tests/conversoes.test.ts).
 */

/** O nome da conversão no Google Ads: precisa ser igual ao cadastrado lá. */
export const CONVERSAO_GOOGLE = 'Compra no site';
/** O Google só aceita cliques de até 90 dias. */
const DIAS_NO_ARQUIVO = 90;

const sha256 = (valor: string) => createHash('sha256').update(valor).digest('hex');

const produtoDe = (i: PedidoPainel['itens'][number]) => (i.tipo === 'transfer' ? 'transfer' : i.passeio.slug);

/**
 * O evento de compra da API de Conversões. O event_id é o código do pedido, o mesmo do Pixel: se o navegador
 * também avisar, a Meta conta uma vez só. O e-mail e o telefone vão embaralhados (hash), como a Meta pede.
 */
export function eventoDeCompra(p: PedidoPainel, site: string, agora: Date) {
  const r = p.itens[0];
  const o = r.origem ?? {};
  return {
    event_name: 'Purchase',
    event_time: Math.floor(agora.getTime() / 1000),
    event_id: p.codigo,
    action_source: 'website',
    event_source_url: `${site}/checkout`,
    user_data: {
      em: [sha256(r.cliente.email.trim().toLowerCase())],
      ph: [sha256(r.cliente.telefone.replace(/\D/g, ''))],
      ...(o.fbp ? { fbp: o.fbp } : {}),
      ...(o.fbc ? { fbc: o.fbc } : {}),
      ...(o.navegador ? { client_user_agent: o.navegador } : {}),
    },
    custom_data: {
      currency: 'BRL',
      value: p.recebidoCentavos / 100,
      content_ids: p.itens.map(produtoDe),
      content_type: 'product',
      num_items: p.itens.length,
      order_id: p.codigo,
    },
  };
}

/**
 * O arquivo que o Google busca todo dia: as vendas pagas que vieram de um clique no Google, com o valor que
 * entrou. O código do pedido evita contar a mesma venda duas vezes, e o arquivo traz sempre os últimos 90 dias.
 */
export function arquivoDoGoogle(pedidos: PedidoPainel[], agora: Date): string {
  const limite = agora.getTime() - DIAS_NO_ARQUIVO * 86_400_000;
  const linhas = pedidos.flatMap((p) => {
    const gclid = p.itens[0].origem?.gclid;
    const pagoEm = p.pagoEm ?? p.criadoEm;
    if (p.status !== 'pago' || !gclid || Date.parse(pagoEm) < limite) return [];
    const quando = new Date(pagoEm).toISOString().replace(/\.\d{3}Z$/, 'Z');
    return [[gclid, CONVERSAO_GOOGLE, quando, (p.recebidoCentavos / 100).toFixed(2), 'BRL', p.codigo].join(',')];
  });
  return [['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency', 'Order ID'].join(','), ...linhas, ''].join('\n');
}
