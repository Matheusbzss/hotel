'use client';

import { useEffect } from 'react';
import { rastrear } from '@/lib/pixel';

/** Evento de compra no Pixel da Meta, uma única vez por pedido, com o total do carrinho inteiro. */
export function CompraPedido({ codigo, centavos, produtos }: { codigo: string; centavos: number; produtos: string[] }) {
  useEffect(() => {
    const chave = `vh_compra_${codigo}`;
    try {
      if (localStorage.getItem(chave)) return;
      localStorage.setItem(chave, '1');
    } catch {}
    rastrear(
      'Purchase',
      { value: centavos / 100, currency: 'BRL', content_ids: produtos, content_type: 'product', num_items: produtos.length },
      codigo,
    );
  }, [codigo, centavos, produtos]);
  return null;
}
