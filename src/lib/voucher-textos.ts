import type { IdiomaConteudo } from '../i18n/conteudo';

/**
 * Os textos fixos do voucher em PDF, fora de src/lib/pdf-voucher.ts para os testes lerem direto (aquele módulo carrega
 * o pdf-lib e usa o atalho "@/", que o node dos testes não resolve). Imports relativos, como nos demais dados.
 *
 * Os avisos: o do horário (busca na hospedagem ou ponto de encontro) entra em segundo, vindo do dicionário.
 * Em pt, en e es (espanhol neutro, com "tú"); a lista argentina ('es-ar', com "vos") entra inteira porque o
 * primeiro aviso muda ("Presentá"). Quem lê usa texto() de src/i18n/conteudo.ts.
 */
export const AVISOS_VOUCHER: Record<IdiomaConteudo, readonly string[]> & { 'es-ar'?: readonly string[] } = {
  pt: [
    'Apresente este voucher no celular ou impresso no dia do passeio.',
    'Cancelamento com 24h de antecedência: reembolso integral.',
    'Cancelado por chuva, mau tempo ou mar: reembolso integral ou nova data, à sua escolha.',
  ],
  en: [
    'Show this voucher on your phone or printed on the day of the tour.',
    'Cancellation at least 24h in advance: full refund.',
    'Cancelled due to rain, bad weather or sea conditions: full refund or a new date, your choice.',
  ],
  es: [
    'Presenta este voucher en el celular o impreso el día del paseo.',
    'Cancelación con 24 h de anticipación: reembolso total.',
    'Cancelado por lluvia, mal tiempo o mar: reembolso total o nueva fecha, a tu elección.',
  ],
  'es-ar': [
    'Presentá este voucher en el celular o impreso el día del paseo.',
    'Cancelación con 24 h de anticipación: reembolso total.',
    'Cancelado por lluvia, mal tiempo o mar: reembolso total o nueva fecha, a tu elección.',
  ],
};

/** O título do bloco de avisos. */
export const IMPORTANTE_VOUCHER: Record<IdiomaConteudo, string> & { 'es-ar'?: string } = {
  pt: 'Importante',
  en: 'Important',
  es: 'Importante',
};
