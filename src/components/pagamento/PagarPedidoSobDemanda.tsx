'use client';

import dynamic from 'next/dynamic';

/**
 * A tela de pagar (PagarPedido, ./CheckoutEmbutido.tsx) carregada só quando aparece, para a página do pedido
 * (src/app/[locale]/pedido/[codigo]/page.tsx). Ela só é desenhada no pedido em aberto pela Stripe (pendente ou expirado),
 * mas a importação direta levava o pedaço do formulário da Stripe (@stripe/react-stripe-js e o carregador do Stripe.js,
 * uns 10 KB com gzip) também ao pedido pago, que nunca o usa (E11 do reteste de 17/11). O dynamic tem de morar num
 * arquivo do navegador: chamado por um componente do servidor (a página), ele não separa o pedaço
 * (node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md). Como sempre, a tela é desenhada no servidor (o ssr do
 * dynamic, sem `loading`, que poria uma caixa de espera no lugar): o HTML do pedido em aberto é o mesmo de antes, e no
 * navegador ela se liga quando o pedaço chega (o Next já o pede no HTML da página que desenha a tela). O mesmo nome de
 * antes: a página só trocou de onde importa.
 */
export const PagarPedido = dynamic(() => import('./CheckoutEmbutido').then((m) => m.PagarPedido));
