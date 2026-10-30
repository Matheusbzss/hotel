'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';

/**
 * Um quadro fixo cujo conteúdo muda: as fotos se revezam sozinhas e um toque passa para a próxima.
 * Com movimento reduzido, a foto só muda com o toque.
 */
export function QuadroFotos({ fotos, rotuloProxima }: { fotos: { src: string; legenda: string }[]; rotuloProxima: string }) {
  const [atual, setAtual] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setAtual((i) => (i + 1) % fotos.length), 3200);
    return () => window.clearInterval(t);
  }, [pausado, fotos.length]);

  const proxima = () => setAtual((i) => (i + 1) % fotos.length);

  return (
    <figure className="mx-auto w-[72vw] max-w-[30rem] md:w-full">
      <button
        type="button"
        onClick={proxima}
        onMouseEnter={() => setPausado(true)}
        onMouseLeave={() => setPausado(false)}
        onFocus={() => setPausado(true)}
        onBlur={() => setPausado(false)}
        aria-label={`${rotuloProxima}: ${fotos[(atual + 1) % fotos.length].legenda}`}
        className="relative block aspect-[4/5] w-full overflow-hidden bg-mar-2"
      >
        {fotos.map((f, i) => (
          <Image
            key={f.src}
            src={f.src}
            alt={f.legenda}
            fill
            sizes="(min-width: 768px) 30rem, 72vw"
            className={`object-cover transition-opacity duration-700 ${i === atual ? 'opacity-100' : 'opacity-0'}`}
            aria-hidden={i !== atual}
            loading={i === 0 ? 'eager' : 'lazy'}
          />
        ))}
      </button>
      <figcaption className="mt-4 text-center text-small text-(--tinta-suave)" aria-live="polite">
        {fotos[atual].legenda}
      </figcaption>
    </figure>
  );
}
