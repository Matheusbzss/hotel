'use client';

import { useEffect, useRef } from 'react';
import { formatarCifra } from '@/lib/cifra';

/**
 * Valor que rola até o novo número quando o grupo ou a data mudam: 200 ms, desacelerando,
 * com atraso para escalonar uma lista. Com "reduzir movimento", troca na hora.
 */
export function Cifra({ centavos, locale, atraso = 0, className }: { centavos: number; locale: string; atraso?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const anterior = useRef(centavos);

  useEffect(() => {
    const el = ref.current;
    const de = anterior.current;
    anterior.current = centavos;
    if (!el || de === centavos || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (el) el.textContent = formatarCifra(centavos, locale);
      return;
    }
    let quadro = 0;
    const inicio = performance.now() + atraso;
    const passo = (agora: number) => {
      const p = Math.min(1, Math.max(0, (agora - inicio) / 200));
      const e = 1 - Math.pow(1 - p, 3);
      // durante a rolagem, reais inteiros; o valor exato no fim
      el.textContent = formatarCifra(p < 1 ? Math.round((de + (centavos - de) * e) / 100) * 100 : centavos, locale);
      if (p < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [centavos, locale, atraso]);

  return (
    <span ref={ref} className={className}>
      {formatarCifra(centavos, locale)}
    </span>
  );
}
