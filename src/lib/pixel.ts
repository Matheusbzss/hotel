'use client';

import { caminhoPrivado } from './caminho-privado.ts';
import { COOKIE_MEDICAO, COOKIE_ORIGEM, IDADE_COOKIE_ORIGEM, escreverOrigem, lerOrigem, origemDoLink, type Origem } from './origem.ts';

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq & { callMethod?: Fbq; queue?: unknown[]; loaded?: boolean; version?: string; push?: Fbq };
    _fbq?: unknown;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Os eventos do site com o nome que o Google usa. */
const NOMES_NO_GOOGLE: Record<string, string> = {
  PageView: 'page_view',
  ViewContent: 'view_item',
  AddToCart: 'add_to_cart',
  InitiateCheckout: 'begin_checkout',
  AddPaymentInfo: 'add_payment_info',
  Purchase: 'purchase',
  Contact: 'generate_lead',
};

function dadosParaOGoogle(dados?: Record<string, unknown>, eventID?: string) {
  const ids = dados?.content_ids;
  return {
    ...(dados?.value !== undefined ? { value: dados.value, currency: dados.currency } : {}),
    ...(Array.isArray(ids) ? { items: ids.map((id) => ({ item_id: id })) } : {}),
    ...(eventID ? { transaction_id: eventID } : {}),
  };
}

type Evento = [evento: string, dados?: Record<string, unknown>, eventID?: string];

/**
 * Os eventos da abertura da página (ver o passeio, abrir o checkout, a compra) acontecem antes de as tags
 * carregarem. Eles esperam aqui e saem depois do aceite dos cookies; sem o aceite, nunca saem.
 */
const EVENTOS_EM_ESPERA: Evento[] = [];
const MAXIMO_EM_ESPERA = 50;

/**
 * As páginas do pedido e do voucher levam no endereço o token do cliente (?t=...), e as tags de anúncio mandam
 * o endereço da página para a Meta e o Google. Por isso, num documento que está ou já esteve numa página
 * particular, as tags não carregam e nenhum evento sai; o "não" vale até a página ser recarregada por inteiro.
 * A compra é medida pelo servidor, sem o endereço da página: src/lib/avisar-compra.ts (Meta) e o arquivo
 * diário do Google (src/lib/conversoes.ts).
 */
let documentoParticular = false;
/** As tags já foram postas neste documento. Não se olha window.fbq: bloqueador de anúncio cria um de mentira. */
let tagsNoDocumento = false;

/** Diz se as tags de anúncio podem carregar e receber eventos neste documento. */
export function tagsLiberadas(caminho?: string): boolean {
  if (typeof window === 'undefined') return false;
  if (caminhoPrivado(window.location.pathname) || (caminho !== undefined && caminhoPrivado(caminho))) documentoParticular = true;
  return !documentoParticular;
}

/** Diz se as tags de anúncio já foram carregadas neste documento. */
export const tagsCarregadas = (): boolean => tagsNoDocumento;

/**
 * Dispara um evento no Pixel da Meta e na tag do Google (só funcionam se o visitante aceitou os cookies). Nas
 * páginas do pedido e do voucher o evento é descartado, nem fica em espera.
 */
export function rastrear(...[evento, dados, eventID]: Evento) {
  if (typeof window === 'undefined' || !tagsLiberadas()) return;
  if (!window.fbq && !window.gtag) {
    if (EVENTOS_EM_ESPERA.length < MAXIMO_EM_ESPERA) EVENTOS_EM_ESPERA.push([evento, dados, eventID]);
    return;
  }
  window.fbq?.('track', evento, dados ?? {}, eventID ? { eventID } : undefined);
  const nome = NOMES_NO_GOOGLE[evento];
  if (nome) window.gtag?.('event', nome, dadosParaOGoogle(dados, eventID));
}

/** Solta os eventos que esperavam as tags. */
export function soltarEventos() {
  EVENTOS_EM_ESPERA.splice(0).forEach((e) => rastrear(...e));
}

export function carregarPixel(pixelId: string) {
  if (typeof window === 'undefined' || window.fbq || !tagsLiberadas()) return;
  const n = function (...args: unknown[]) {
    if (n.callMethod) n.callMethod(...args);
    else n.queue!.push(args);
  } as NonNullable<Window['fbq']>;
  window.fbq = n;
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  tagsNoDocumento = true;
  n('init', pixelId);
}

export function carregarGoogle(id: string) {
  if (typeof window === 'undefined' || window.gtag || !tagsLiberadas()) return;
  window.dataLayer = window.dataLayer ?? [];
  // a tag do Google lê o objeto "arguments" de cada chamada, não uma lista
  window.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer?.push(arguments);
  };
  window.gtag('js', new Date());
  // a visita é contada pelo evento PageView, a cada troca de página
  window.gtag('config', id, { send_page_view: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(s);
  tagsNoDocumento = true;
}

const lerCookie = (nome: string) =>
  document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${nome}=`))
    ?.slice(nome.length + 1);

const gravarCookie = (nome: string, valor: string, idade: number) => {
  document.cookie = `${nome}=${valor}; path=/; max-age=${idade}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
};

/** O código do clique no Google espera aqui, só nesta aba, até o visitante aceitar os cookies. */
const CLIQUE_NA_ABA = 'on_clique';

/**
 * Guarda de onde o cliente veio, para o servidor ler no carrinho, no pedido e na cotação. A campanha fica
 * sempre e o último anúncio é o que vale; o código do clique só fica com o aceite dos cookies.
 */
export function guardarOrigem(aceitou: boolean) {
  try {
    const doLink = origemDoLink(location.search);
    const guardada = lerCookie(COOKIE_ORIGEM);
    if (doLink?.gclid) sessionStorage.setItem(CLIQUE_NA_ABA, doLink.gclid);
    else if (doLink) sessionStorage.removeItem(CLIQUE_NA_ABA);
    const { gclid, ...campanha } = doLink ?? lerOrigem(guardada);
    const clique = aceitou ? (sessionStorage.getItem(CLIQUE_NA_ABA) ?? gclid) : undefined;
    const nova: Origem = { ...campanha, ...(clique ? { gclid: clique } : {}) };
    const texto = escreverOrigem(nova);
    if (texto !== guardada && (guardada || Object.keys(nova).length)) gravarCookie(COOKIE_ORIGEM, texto, IDADE_COOKIE_ORIGEM);
  } catch {}
}

/** Avisa o servidor da escolha sobre os cookies, que fica no navegador. */
export function marcarMedicao(aceitou: boolean) {
  if (aceitou) gravarCookie(COOKIE_MEDICAO, 'sim', 60 * 60 * 24 * 365);
  else if (lerCookie(COOKIE_MEDICAO)) gravarCookie(COOKIE_MEDICAO, '', 0);
}
