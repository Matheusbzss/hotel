'use client';

import { useEffect, useState } from 'react';

/**
 * Barra fixa do celular com o preço e o atalho para a reserva. Some quando o cartão de reserva,
 * os outros passeios ou o rodapé aparecem, para não cobrir nada.
 */
export function BarraReservaMovel({ rotuloPreco, preco, rotuloBotao }: { rotuloPreco: string; preco: string; rotuloBotao: string }) {
  const [oculta, setOculta] = useState(false);

  useEffect(() => {
    const alvos = ['#reservar', '#outros-passeios', 'footer'].map((s) => document.querySelector(s)).filter(Boolean) as Element[];
    if (!alvos.length || !('IntersectionObserver' in window)) return;
    const visiveis = new Set<Element>();
    const io = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) visiveis.add(e.target);
        else visiveis.delete(e.target);
      }
      setOculta(visiveis.size > 0);
    });
    alvos.forEach((a) => io.observe(a));
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`tom-campo fixed inset-x-0 bottom-0 z-30 transition-transform duration-300 lg:hidden ${oculta ? 'translate-y-full' : ''}`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-hidden={oculta}
    >
      <div className="moldura flex h-[76px] items-center justify-between gap-4">
        <p className="leading-tight">
          <span className="block text-small">{rotuloPreco}</span>
          <span className="numeros block text-lead font-semibold">{preco}</span>
        </p>
        <a href="#reservar" className="botao" tabIndex={oculta ? -1 : undefined}>
          {rotuloBotao}
        </a>
      </div>
    </div>
  );
}
