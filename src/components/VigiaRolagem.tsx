'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Marca <html data-rolou> quando a foto do topo da página inicial sai de baixo do menu:
 * a cápsula de vidro passa de translúcida (texto branco) para vidro claro (texto escuro).
 */
export function VigiaRolagem() {
  const caminho = usePathname();
  useEffect(() => {
    const raiz = document.documentElement;
    const foto = document.querySelector('.topo-foto, .topo-passeio');
    if (!foto) {
      raiz.removeAttribute('data-rolou');
      return;
    }
    // só conta quando o fim da foto passa por cima do menu; abaixo da tela (janela baixa, antes de rolar) não
    const io = new IntersectionObserver(([e]) => raiz.toggleAttribute('data-rolou', !e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 72)), {
      // a cápsula tem 64 px: troca quando sobra menos que isso da foto
      rootMargin: '-72px 0px 0px 0px',
      threshold: 0,
    });
    // observa só o fim da foto
    const marco = document.createElement('div');
    marco.style.cssText = 'position:absolute;left:0;right:0;bottom:0;height:1px;pointer-events:none';
    foto.appendChild(marco);
    io.observe(marco);
    return () => {
      io.disconnect();
      marco.remove();
      raiz.removeAttribute('data-rolou');
    };
  }, [caminho]);
  return null;
}
