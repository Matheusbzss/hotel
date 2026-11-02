'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Dá profundidade à foto do topo: ela se move de leve com a inclinação do celular, o mouse e a rolagem
 * (no máximo 14 px), sempre suavizada. Com "reduzir movimento", fica parada.
 */
export function Profundidade({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let alvoX = 0;
    let alvoY = 0;
    let x = 0;
    let y = 0;
    let rolagem = 0;
    let quadro = 0;
    let visivel = true;

    const desenhar = () => {
      x += (alvoX - x) * 0.08;
      y += (alvoY - y) * 0.08;
      el.style.setProperty('--px', `${x.toFixed(2)}px`);
      el.style.setProperty('--py', `${(y + rolagem).toFixed(2)}px`);
      quadro = Math.abs(alvoX - x) + Math.abs(alvoY - y) > 0.05 ? requestAnimationFrame(desenhar) : 0;
    };
    const pedir = () => {
      if (!quadro && visivel) quadro = requestAnimationFrame(desenhar);
    };
    const mouse = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      alvoX = ((e.clientX / window.innerWidth) * 2 - 1) * -14;
      alvoY = ((e.clientY / window.innerHeight) * 2 - 1) * -10;
      pedir();
    };
    const giro = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      alvoX = Math.max(-1, Math.min(1, e.gamma / 25)) * -14;
      alvoY = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * -10;
      pedir();
    };
    const rolar = () => {
      // a foto desce um pouco mais devagar que a página: parece estar atrás do texto
      rolagem = Math.min(window.scrollY, window.innerHeight) * 0.18;
      pedir();
    };
    const io = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
    });
    io.observe(el);
    window.addEventListener('pointermove', mouse, { passive: true });
    window.addEventListener('scroll', rolar, { passive: true });
    // no iPhone a permissão do giroscópio só pode ser pedida num toque
    const Permissao = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
    const pedirGiro = async () => {
      try {
        if ((await Permissao?.()) === 'granted') window.addEventListener('deviceorientation', giro);
      } catch {
        // sem permissão: a foto segue o toque e a rolagem
      }
    };
    const raiz = el.closest('.topo-foto');
    if (Permissao) raiz?.addEventListener('pointerdown', pedirGiro, { once: true });
    else window.addEventListener('deviceorientation', giro);
    return () => {
      cancelAnimationFrame(quadro);
      io.disconnect();
      window.removeEventListener('pointermove', mouse);
      window.removeEventListener('scroll', rolar);
      window.removeEventListener('deviceorientation', giro);
      raiz?.removeEventListener('pointerdown', pedirGiro);
    };
  }, []);

  return (
    <div ref={ref} className="foto" aria-hidden="true">
      {children}
    </div>
  );
}
