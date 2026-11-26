'use client';

import { useEffect, useState } from 'react';

/**
 * A palavra do status na faixa escura do resumo (o código, os itens e os valores) das páginas do pedido e da reserva,
 * enquanto a tela de pagar está nelas. A página desenha a faixa com o status de quando abriu; no pedido vencido, "Pagar
 * de novo" abre uma sessão nova e o pedido volta a esperar o pagamento, mas a faixa continuava "Expirado" até a página
 * recarregar (R2 do reteste de 16-17/11). Agora a tela de pagar (PagarPedido, CheckoutEmbutido.tsx) avisa, com um evento
 * do navegador, quando o servidor abre a sessão nova, e a palavra passa a "Aguardando pagamento" (status.pendente). Um
 * evento, e não router.refresh: a tela de pagar tem a chave do status, e o redesenho desmontaria o formulário da Stripe
 * que acabou de abrir. A palavra não volta sozinha: o pedido só sai do "esperando o pagamento" com a página inteira
 * carregando (pago, vencido de novo, cancelado: a tela de pagar vai para a página do pedido), que já nasce com a palavra
 * certa. Este arquivo não importa nada além do React (a página do pedido o leva sem o pedaço do formulário da Stripe) e
 * não tem JSX: os testes rodam o aviso e a escuta em node (tests/paginas-do-cliente.test.ts).
 */

/** O evento do navegador: a tela de pagar abriu uma sessão nova para o pedido (o código dele vem no `detail`). */
export const EVENTO_SESSAO_NOVA = 'orla:sessao-nova';

/** A tela de pagar avisa a página: o servidor abriu uma sessão nova para o pedido. */
export function avisarSessaoNova(codigoPedido: string, alvo: EventTarget = window): void {
  alvo.dispatchEvent(new CustomEvent(EVENTO_SESSAO_NOVA, { detail: { codigo: codigoPedido } }));
}

/** Escuta o aviso de sessão nova deste pedido (o de outro pedido não conta). Devolve o que desliga a escuta. */
export function ouvirSessaoNova(codigoPedido: string, aoAbrir: () => void, alvo: EventTarget = window): () => void {
  const ouvinte = (e: Event) => {
    if (e instanceof CustomEvent && e.detail?.codigo === codigoPedido) aoAbrir();
  };
  alvo.addEventListener(EVENTO_SESSAO_NOVA, ouvinte);
  return () => alvo.removeEventListener(EVENTO_SESSAO_NOVA, ouvinte);
}

/**
 * A palavra: a de quando a página abriu (`texto`) até a tela de pagar avisar a sessão nova deste pedido; daí em diante,
 * `textoPendente` ("Aguardando pagamento").
 */
export function PalavraDoStatus({ codigo, texto, textoPendente }: { codigo: string; texto: string; textoPendente: string }): string {
  const [sessaoNova, setSessaoNova] = useState(false);
  useEffect(() => ouvirSessaoNova(codigo, () => setSessaoNova(true)), [codigo]);
  return sessaoNova ? textoPendente : texto;
}
