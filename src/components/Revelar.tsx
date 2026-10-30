'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Entrada das seções: as partes de cada bloco `.entrar` sobem quando ele aparece na tela.
 * Sem JavaScript (ou sem IntersectionObserver), tudo já aparece normalmente.
 */
export function Revelar() {
  const caminho = usePathname();
  useEffect(() => {
    const alvos = document.querySelectorAll<HTMLElement>('.entrar:not(.dentro)');
    // o que já está na tela não pisca: entra como visível
    alvos.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('dentro');
    });
    document.documentElement.classList.add('js');
    if (!('IntersectionObserver' in window)) {
      alvos.forEach((el) => el.classList.add('dentro'));
      return;
    }
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add('dentro');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    alvos.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [caminho]);
  return null;
}
