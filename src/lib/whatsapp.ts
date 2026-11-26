import { EMPRESA } from '../config/empresa.ts';
import type { Dicionario } from '../i18n/pt.ts';

/**
 * O link do WhatsApp da equipe (o número de EMPRESA.whatsapp), com a mensagem já escrita. Importa só os dados da empresa,
 * sem o atalho "@/", para os testes em node puro. Nenhum componente do navegador importa este arquivo: o link chega
 * pronto do servidor (os dados da empresa não vão para o JavaScript do navegador).
 */
export function linkWhatsApp(mensagem?: string): string {
  const base = `https://wa.me/${EMPRESA.whatsapp}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}

/** O botão do WhatsApp embaixo da mensagem do robô: o link já montado e o rótulo do botão. */
export interface WhatsAppDoRobo {
  href: string;
  rotulo: string;
}

/**
 * O botão do WhatsApp de quem a proteção contra robôs confundiu com robô (Pacote 21, decisão do dono de 23/11/2026): a
 * única exceção à regra "o WhatsApp da equipe só depois do pagamento" (mostrarWhatsApp, src/lib/formas-pagamento.ts),
 * e só junto da mensagem comum.robo (o 403 'robo'). O link leva só a saudação do idioma (comum.roboSaudacao): nada do
 * que o cliente digitou, nem o pedido, nem o carrinho. O rótulo é o "Chamar no WhatsApp" do voucher (reserva.chamarWhatsapp).
 */
export function whatsappDoRobo(d: Dicionario): WhatsAppDoRobo {
  return { href: linkWhatsApp(d.comum.roboSaudacao), rotulo: d.reserva.chamarWhatsapp };
}
