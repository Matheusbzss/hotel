import Stripe from 'stripe';
import type { Idioma } from '../i18n/config';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { texto, type Traduzido } from '../i18n/conteudo.ts';
import { PIX_EXPIRA_SEGUNDOS, validadeDoPix, valorDoItem, type FormaPagamento, type ItemAgendado } from './formas-pagamento.ts';

/**
 * A Stripe no servidor: o cliente oficial, a sessão de pagamento embutida (cartão ou Pix), a releitura da
 * sessão, o reembolso e a assinatura do webhook. Nenhuma regra sobre o pedido fica aqui: isso é de
 * src/lib/pagamento-stripe.ts. O valor cobrado vem sempre dos totais calculados no servidor.
 *
 * Variáveis (só no servidor, nunca no código nem no git):
 *   STRIPE_SECRET_KEY                   chave restrita (rk_test_… no modo teste, rk_live_… em produção)
 *   STRIPE_WEBHOOK_SECRET               assinatura do webhook (whsec_…), uma por destino
 *   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  pk_test_/pk_live_, a única que vai ao navegador (checkout embutido)
 */

/** A versão da API, fixa na do pacote `stripe` instalado: a leitura dos campos da sessão depende dela. */
export const VERSAO_API_STRIPE = '2026-10-28.endive' as const;
/**
 * A sessão vale 30 minutos (decisão do dono). É o mínimo da Stripe: o expires_at da sessão vai de 30 minutos a 24 horas
 * depois da criação ("It can be anywhere from 30 minutes to 24 hours after Checkout Session creation").
 */
export const VALIDADE_SESSAO_MINUTOS = 30;
/** Um minuto de folga: a Stripe conta os 30 minutos a partir da criação, e o relógio daqui pode estar à frente. */
const FOLGA_SEGUNDOS = 60;
/**
 * O QR do Pix vale 30 minutos, ou menos perto do prazo do Pix (validadeDoPix, src/lib/formas-pagamento.ts, a regra
 * única do prazo). A constante mora lá, porque formas-pagamento.ts não pode carregar o SDK da Stripe.
 */
export { PIX_EXPIRA_SEGUNDOS };

export type ModoStripe = 'desligado' | 'teste' | 'producao';

/** As duas chaves de que o checkout precisa: a do servidor e a pública do navegador. */
export function stripeConfigurado(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

/** Pelo prefixo da chave do servidor, sem mostrar o valor: rk_live_/sk_live_ é produção; qualquer outra chave é teste. */
export function modoStripe(): ModoStripe {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) return 'desligado';
  return /^(rk|sk)_live_/.test(chave) ? 'producao' : 'teste';
}

let cliente: Stripe | null = null;

/** O cliente da Stripe, criado na primeira vez que é preciso (a chave só é lida aí). */
export function stripe(): Stripe {
  if (cliente) return cliente;
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) throw new Error('STRIPE_SECRET_KEY não configurada.');
  cliente = new Stripe(chave, {
    apiVersion: VERSAO_API_STRIPE,
    typescript: true,
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: 'Orla Nativa (site)' },
  });
  return cliente;
}

/** A Stripe não tem espanhol argentino: /es e /es-ar vão para o espanhol da América Latina. */
const LOCALES: Record<Idioma, Stripe.Checkout.SessionCreateParams.Locale> = { pt: 'pt-BR', en: 'en', es: 'es-419', 'es-ar': 'es-419' };

export function localeStripe(idioma: Idioma): Stripe.Checkout.SessionCreateParams.Locale {
  return LOCALES[idioma];
}

/**
 * Um item do pedido como entra na sessão: um line_item por voucher. Ele diz também quando começa (a data e a hora, de
 * ItemAgendado): é com isso que a sessão do Pix sabe até quando o QR pode valer (validadeDoPix).
 */
export interface ItemDaSessao extends ItemAgendado {
  /** O código do voucher deste item. */
  voucher: string;
  /** O nome nos três idiomas (texto() escolhe), ou já traduzido para o idioma do cliente. */
  nome: string | Traduzido<string>;
  /** Uma linha a mais embaixo do nome (data e hora, pessoas), já no idioma do cliente. */
  descricao?: string;
  /** O total no cartão. */
  totalCentavos: number;
  /** O total no Pix (com o desconto). */
  totalPixCentavos?: number;
}

/**
 * O pedido não pode mais abrir um Pix: o prazo dele passou entre a escolha da forma e a sessão. A rota de pagar responde
 * 403 'forma' (como quando o prazo passa antes); a de criar o pedido trata como qualquer falha da sessão (502).
 */
export class PixForaDoPrazo extends Error {
  constructor(codigo: string) {
    super(`O prazo do Pix do pedido ${codigo} passou: a sessão do Pix não foi criada.`);
    this.name = 'PixForaDoPrazo';
  }
}

export interface DadosDaSessao {
  pedido: { codigo: string; email: string };
  itens: ItemDaSessao[];
  forma: FormaPagamento;
  idioma: Idioma;
  /** A página do pedido com o token: /[locale]/pedido/[codigo]?t=TOKEN (um item só: /reserva/[codigo]?t=TOKEN). */
  returnUrl: string;
  /** O número desta tentativa de pagamento do pedido (1, 2, …): entra na chave de idempotência. */
  tentativa: number;
  /** Para os testes; na vida real, agora. */
  agora?: Date;
}

/** O nome do item como a Stripe mostra, no idioma do cliente. */
export const nomeDoItem = (item: ItemDaSessao, idioma: Idioma): string =>
  typeof item.nome === 'string' ? item.nome : texto(item.nome, idioma);

/**
 * Os parâmetros da sessão, separados da chamada à Stripe para dar para testar sem rede. No Pix, o QR vale o que
 * validadeDoPix diz para estes itens agora (30 minutos, ou só até o prazo do Pix); fora do prazo, PixForaDoPrazo: as
 * rotas só pedem o Pix quando ele aparece entre as formas, com o mesmo `agora`, então isso só acontece se a regra mudar.
 */
export function parametrosDaSessao(d: DadosDaSessao): Stripe.Checkout.SessionCreateParams {
  const { codigo } = d.pedido;
  const agora = d.agora ?? new Date();
  const pix = d.forma === 'pix';
  const validadePix = pix ? validadeDoPix(d.itens, agora) : null;
  if (pix && validadePix === null) throw new PixForaDoPrazo(codigo);
  return {
    ui_mode: 'embedded_page',
    mode: 'payment',
    currency: 'brl',
    // um line_item por voucher, com o preço do item na forma escolhida (nas casas, o sinal), em centavos
    line_items: d.itens.map((item) => ({
      quantity: 1,
      price_data: {
        currency: 'brl',
        unit_amount: valorDoItem(item, d.forma),
        product_data: {
          name: nomeDoItem(item, d.idioma).slice(0, 250),
          ...(item.descricao ? { description: item.descricao.slice(0, 500) } : {}),
          metadata: { voucher: item.voucher },
        },
      },
    })),
    // Nesta versão da API a lista fixa `payment_method_types` saiu da criação da sessão; o que existe é este
    // filtro sobre as formas ligadas no painel da Stripe (Configurações → Formas de pagamento, em produção e
    // no modo teste). "card" inclui as carteiras (Apple Pay e Google Pay). Como a Stripe não permite dois
    // totais numa sessão, cartão e Pix são sessões diferentes do mesmo pedido. A conferir no modo teste: o
    // Adaptive Pricing (a moeda do cliente) continua ativo com o filtro só de cartão.
    allowed_payment_method_types: [pix ? 'pix' : 'card'],
    // Só no cartão: o Link (a carteira da própria Stripe, que guarda os dados do cliente para a próxima compra)
    // não aparece, mesmo que volte a ser ligado no painel. Apple Pay e Google Pay seguem como estão, porque vêm
    // com "card". O Pix não leva o campo. A conferir no modo teste: a tela embutida do cartão abrir sem o Link.
    ...(pix ? {} : { wallet_options: { link: { display: 'never' } } }),
    locale: localeStripe(d.idioma),
    customer_email: d.pedido.email,
    client_reference_id: codigo,
    metadata: { codigo, vouchers: d.itens.map((item) => item.voucher).join(','), idioma: d.idioma, forma: d.forma },
    payment_intent_data: {
      // o PaymentIntent não herda a metadata da sessão: sem isto o webhook de cartão recusado não acha o pedido
      metadata: { codigo },
      // na fatura do cartão: "ORLANATIVA* ON-ABC123" (o prefixo é o descritor da conta); o Pix ignora descritores
      ...(pix ? {} : { statement_descriptor_suffix: codigo }),
    },
    // o QR do Pix: 30 minutos, ou só até o prazo do Pix (2 horas antes do primeiro serviço), contados de quando o QR aparece
    ...(validadePix !== null ? { payment_method_options: { pix: { expires_after_seconds: validadePix } } } : {}),
    expires_at: Math.floor(agora.getTime() / 1000) + VALIDADE_SESSAO_MINUTOS * 60 + FOLGA_SEGUNDOS,
    return_url: d.returnUrl,
    redirect_on_completion: 'if_required',
  };
}

/**
 * Cria a sessão de pagamento embutida. A chave de idempotência "<código>-<tentativa>" faz a Stripe devolver a
 * mesma sessão se a chamada se repetir; com parâmetros diferentes na mesma tentativa ela recusa
 * (StripeIdempotencyError), e aí é tentar de novo com a tentativa seguinte.
 */
export async function criarSessaoPagamento(d: DadosDaSessao): Promise<Stripe.Checkout.Session> {
  return stripe().checkout.sessions.create(parametrosDaSessao(d), { idempotencyKey: `${d.pedido.codigo}-${d.tentativa}` });
}

/** Fecha uma sessão ainda aberta (antes de abrir outra para o mesmo pedido). Devolve false se ela já não estava aberta. */
export async function expirarSessao(id: string): Promise<boolean> {
  try {
    await stripe().checkout.sessions.expire(id);
    return true;
  } catch (e) {
    if (e instanceof Stripe.errors.StripeInvalidRequestError) return false;
    throw e;
  }
}

/** Relê a sessão na Stripe, com o pagamento e a cobrança (bandeira, 4 dígitos, país): é a verdade sobre o pagamento. */
export function obterSessao(id: string): Promise<Stripe.Checkout.Session> {
  return stripe().checkout.sessions.retrieve(id, { expand: ['payment_intent', 'payment_intent.latest_charge'] });
}

/**
 * Devolve o dinheiro pela Stripe: tudo (sem `centavos`) ou uma parte (um item). `referencia` entra na chave
 * de idempotência: no reembolso de um item, passe o código do voucher, para dois itens do mesmo preço não
 * virarem um reembolso só. O status do pedido muda só pelo webhook charge.refunded, nunca aqui.
 */
export function criarReembolso(
  paymentIntentId: string,
  centavos?: number,
  referencia: string = centavos === undefined ? 'total' : String(centavos),
): Promise<Stripe.Refund> {
  return stripe().refunds.create(
    { payment_intent: paymentIntentId, ...(centavos !== undefined ? { amount: centavos } : {}), metadata: { referencia } },
    { idempotencyKey: `reembolso-${paymentIntentId}-${referencia}` },
  );
}

/**
 * Os reembolsos já pedidos para um pagamento (concluídos, a caminho do cliente ou falhos), relidos na Stripe.
 * O painel confere esta lista antes de devolver um item: a chave de idempotência só protege por 24 horas.
 */
export async function reembolsosDoPagamento(paymentIntentId: string): Promise<Stripe.Refund[]> {
  const lista = await stripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  return lista.data;
}

/**
 * Confere a assinatura do webhook e devolve o evento; lança erro se a assinatura não bater (a rota responde
 * 400). O corpo tem de ser o texto cru (await request.text()), nunca o JSON já lido.
 */
export function construirEvento(corpo: string | Buffer, assinatura: string): Stripe.Event {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  if (!segredo) throw new Error('STRIPE_WEBHOOK_SECRET não configurada.');
  return stripe().webhooks.constructEvent(corpo, assinatura, segredo);
}

/**
 * O endereço no painel da Stripe: a página do pagamento para pi_… e ch_…; a busca para os outros ids
 * (sessão cs_…, reembolso re_…). Em modo teste, com /test/ no caminho.
 */
export function linkPainelStripe(id: string, modo: ModoStripe = modoStripe()): string {
  const base = `https://dashboard.stripe.com/${modo === 'producao' ? '' : 'test/'}`;
  if (/^(pi|ch|py)_/.test(id)) return `${base}payments/${encodeURIComponent(id)}`;
  return `${base}search?query=${encodeURIComponent(id)}`;
}
