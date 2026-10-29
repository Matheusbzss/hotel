import { linkWhatsApp } from '@/lib/whatsapp';
import { IconeWhatsApp } from './IconeWhatsApp';

export function WhatsAppFlutuante({ rotulo, mensagem }: { rotulo: string; mensagem: string }) {
  return (
    <a
      href={linkWhatsApp(mensagem)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={rotulo}
      data-evento="Contact"
      className="fixed right-4 z-40 flex size-14 items-center justify-center bg-whats text-mar shadow-[0_10px_30px_rgba(4,24,33,0.35)] transition-transform hover:scale-105 active:scale-95 md:right-6"
      style={{ bottom: 'calc(1rem + var(--barra-inferior) + env(safe-area-inset-bottom))' }}
    >
      <IconeWhatsApp className="size-8" />
    </a>
  );
}
