import { EMPRESA } from '@/config/empresa';

export function linkWhatsApp(mensagem?: string): string {
  const base = `https://wa.me/${EMPRESA.whatsapp}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}
