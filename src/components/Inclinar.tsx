'use client';

import Link from 'next/link';
import { useRef, type ReactNode } from 'react';

/**
 * Cartão com profundidade: inclina até 6 graus seguindo o mouse ou o dedo e sobe 2 px;
 * volta ao soltar. Com "reduzir movimento" ou toque de rolagem, nada se mexe.
 */
export function CartaoInclinavel({ href, rotulo, children }: { href: string; rotulo: string; children: ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const quadro = useRef(0);

  function inclinar(e: React.PointerEvent<HTMLAnchorElement>) {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(quadro.current);
    quadro.current = requestAnimationFrame(() => {
      el.style.setProperty('--ry', `${(nx * 12).toFixed(2)}deg`);
      el.style.setProperty('--rx', `${(-ny * 10).toFixed(2)}deg`);
      el.style.setProperty('--ty', '-2px');
      el.setAttribute('data-inclinado', '');
    });
  }
  function soltar() {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(quadro.current);
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
    el.style.removeProperty('--ty');
    el.removeAttribute('data-inclinado');
  }

  return (
    <Link
      ref={ref}
      href={href}
      aria-label={rotulo}
      className="cartao group"
      onPointerMove={(e) => e.pointerType === 'mouse' && inclinar(e)}
      onPointerDown={(e) => e.pointerType !== 'mouse' && inclinar(e)}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onPointerLeave={soltar}
    >
      {children}
    </Link>
  );
}
