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
      className="fixed right-4 z-40 flex size-16 items-center justify-center rounded-full bg-whats text-white shadow-[0_8px_24px_rgba(11,59,92,0.28)] transition-transform hover:scale-105 active:scale-95 md:right-6"
      style={{ bottom: 'calc(1rem + var(--barra-inferior) + env(safe-area-inset-bottom))' }}
    >
      <IconeWhatsApp className="size-9" />
    </a>
  );
}
