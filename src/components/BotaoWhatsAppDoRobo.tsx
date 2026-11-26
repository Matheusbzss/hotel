import type { WhatsAppDoRobo } from '@/lib/whatsapp';
import { IconeWhatsApp } from './IconeWhatsApp';

/**
 * O botão do WhatsApp da equipe embaixo da mensagem de quem a proteção contra robôs confundiu com robô (comum.robo, o 403
 * 'robo'; Pacote 21). Os quatro formulários (fechar o pedido, pagar de novo e o "Pague com Pix" do cartão recusado,
 * orçamento e mensagem, consultar meu pedido) o mostram só junto dessa mensagem, e ele some com ela. O link chega pronto
 * do servidor (whatsappDoRobo, src/lib/whatsapp.ts): o número é o dos dados da empresa e a mensagem, só a saudação.
 * As classes são as dos outros botões do WhatsApp; o min-w-0 deixa o botão na largura da coluna quando o formulário é uma
 * grade (sem ele, a palavra "WhatsApp" com a letra grande alargaria a coluna), e o texto quebra dentro dele.
 */
export function BotaoWhatsAppDoRobo({ whatsapp }: { whatsapp: WhatsAppDoRobo }) {
  return (
    <a
      href={whatsapp.href}
      target="_blank"
      rel="noopener noreferrer"
      className="botao botao-whats w-full min-w-0 sm:w-auto"
      data-evento="Contact"
    >
      <IconeWhatsApp className="size-5" />
      {whatsapp.rotulo}
    </a>
  );
}
