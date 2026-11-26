'use client';

import { useEffect } from 'react';

/**
 * O carrinho deste navegador já virou um pedido PAGO (o cliente pagou o Pix no app do banco e a aba recarregou): a
 * página segue sozinha para o pedido, com o botão por garantia. Sempre com a página inteira carregando
 * (window.location), nunca pela navegação interna do site: a página do pedido leva o token no endereço e nasce sem as
 * tags de anúncio (src/lib/pixel.ts). O endereço não entra em nenhum href da tela.
 */
export function PedidoPago({ href, codigo, texto, botao }: { href: string; codigo: string; texto: string; botao: string }) {
  useEffect(() => {
    // replace: o "voltar" do navegador não cai de novo nesta tela
    window.location.replace(href);
  }, [href]);
  // o código do pedido nunca quebra no hífen ("ON-" numa linha e o resto na outra), nem com a letra grande
  const [antes, depois = ''] = texto.split('{codigo}');
  return (
    <div className="max-w-[44ch]">
      <p className="text-lead" role="status">
        {antes}
        <span className="numeros whitespace-nowrap">{codigo}</span>
        {depois}
      </p>
      <button type="button" className="botao mt-6" onClick={() => window.location.assign(href)}>
        {botao}
      </button>
    </div>
  );
}
