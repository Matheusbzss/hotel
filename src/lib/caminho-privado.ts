import { semIdioma } from '../i18n/config.ts';

/**
 * As pastas das páginas particulares: o endereço delas leva o token do cliente (?t=...), que abre o pedido e o
 * voucher. Página nova com o token no endereço entra nesta lista.
 */
const PASTAS_PRIVADAS = ['pedido', 'reserva'];

/**
 * Diz se o caminho é de uma página particular (pedido ou voucher), em qualquer idioma: /pedido/ABC,
 * /es/pedido/ABC, /pt/reserva/ABC. As tags de anúncio nunca rodam nessas páginas (src/lib/pixel.ts).
 */
export function caminhoPrivado(caminho: string): boolean {
  const [trilha] = caminho.split(/[?#]/);
  const pasta = semIdioma(trilha).split('/')[1] ?? '';
  return PASTAS_PRIVADAS.includes(pasta.toLowerCase());
}
