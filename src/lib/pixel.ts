'use client';

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq & { callMethod?: Fbq; queue?: unknown[]; loaded?: boolean; version?: string; push?: Fbq };
    _fbq?: unknown;
  }
}

/** Dispara um evento do Pixel da Meta (só funciona se o visitante aceitou os cookies). */
export function rastrear(evento: string, dados?: Record<string, unknown>, eventID?: string) {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  window.fbq('track', evento, dados ?? {}, eventID ? { eventID } : undefined);
}

export function carregarPixel(pixelId: string) {
  if (typeof window === 'undefined' || window.fbq) return;
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
  n('init', pixelId);
}
