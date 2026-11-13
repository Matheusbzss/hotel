import 'server-only';
import { eventoDeCompra } from './conversoes';
import { agruparPedidos } from './pedidos-painel';
import { obterPedido, type Reserva } from './reservas';
import { urlDoSite } from './site';
import { mensagemDoErro } from './erros.ts';

const VERSAO_DA_API = 'v25.0';

/**
 * Avisa a Meta de uma venda paga, pela API de Conversões. A compra pelo WhatsApp acontece no painel, não
 * no navegador do cliente: sem isso, a Meta nunca saberia. Só vale para quem aceitou os cookies, e uma falha
 * aqui nunca atrapalha marcar o pedido como pago.
 */
export async function avisarCompra(r: Reserva): Promise<void> {
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixel || !token) return;
  try {
    const [pedido] = agruparPedidos(r.pedido ? await obterPedido(r.pedido.codigo) : [r]);
    if (!pedido?.itens[0].origem?.medicao) return;
    const codigoDeTeste = process.env.META_TEST_EVENT_CODE;
    const resposta = await fetch(`https://graph.facebook.com/${VERSAO_DA_API}/${pixel}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [eventoDeCompra(pedido, urlDoSite(), new Date())],
        access_token: token,
        ...(codigoDeTeste ? { test_event_code: codigoDeTeste } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) console.error(`[conversoes] a Meta recusou a compra ${pedido.codigo}: ${await resposta.text()}`);
  } catch (e) {
    console.error(`[conversoes] falha ao avisar a compra ${r.codigo}: ${mensagemDoErro(e)}`);
  }
}
