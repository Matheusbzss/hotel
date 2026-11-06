import { EMPRESA } from '@/config/empresa';

/** Link de e-mail com assunto e texto prontos — é o contato do site antes da reserva. */
export function linkEmail(assunto: string, mensagem?: string): string {
  const partes = [`subject=${encodeURIComponent(assunto)}`];
  if (mensagem) partes.push(`body=${encodeURIComponent(mensagem)}`);
  return `mailto:${EMPRESA.email}?${partes.join('&')}`;
}
