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

// o código do produto: o slug do passeio ou da casa; o transfer é "transfer"
const produtoDe = (i: PedidoPainel['itens'][number]) => (i.tipo === 'transfer' ? 'transfer' : i.tipo === 'casa' ? i.casa.slug : i.passeio.slug);

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

/** O usuário que o painel mostra para o Google entrar no arquivo (qualquer um serve: só a senha é conferida). */
export const USUARIO_DO_ARQUIVO_GOOGLE = 'orlanativa';
/** O nome fixo do arquivo quando o Google entra com usuário e senha, como o Data Manager pede. */
export const ARQUIVO_GOOGLE_COM_SENHA = 'compras.csv';

/**
 * A senha do cabeçalho "Authorization: Basic …" que o Google manda ao buscar o arquivo pelo Data Manager, que pede
 * usuário e senha (support.google.com/google-ads-data-manager/answer/14605515, lido em 26/11). O usuário pode ser
 * qualquer um; só a senha conta. Sem o cabeçalho, ou com ele mal formado, null.
 */
export function senhaDoBasic(cabecalho: string | null): string | null {
  const m = /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(cabecalho ?? '');
  if (!m) return null;
  const texto = Buffer.from(m[1], 'base64').toString('utf8');
  const doisPontos = texto.indexOf(':');
  return doisPontos < 0 ? null : texto.slice(doisPontos + 1);
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
    // a hora em UTC com o fuso escrito como o Google documenta ("2026-11-02T15:00:30+0000"); o "Z" no fim não está na
    // lista de formatos aceitos da importação de cliques (support.google.com/google-ads/answer/7014069, lido em 26/11)
    const quando = new Date(pagoEm).toISOString().replace(/\.\d{3}Z$/, '+0000');
    return [[gclid, CONVERSAO_GOOGLE, quando, (p.recebidoCentavos / 100).toFixed(2), 'BRL', p.codigo].join(',')];
  });
  return [['Google Click ID', 'Conversion Name', 'Conversion Time', 'Conversion Value', 'Conversion Currency', 'Order ID'].join(','), ...linhas, ''].join('\n');
}
