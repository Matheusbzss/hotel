'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';

/** Galeria de fotos com rolagem por gesto (celular) e botões (desktop). */
export function Galeria({
  fotos,
  alt,
  textos,
}: {
  fotos: string[];
  alt: string;
  textos: { galeria: string; anterior: string; proxima: string };
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [atual, setAtual] = useState(0);

  const irPara = (i: number) => {
    const el = trilho.current;
    if (!el) return;
    const alvo = Math.max(0, Math.min(fotos.length - 1, i));
    el.scrollTo({ left: alvo * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <section aria-label={textos.galeria} className="relative">
      <div
        ref={trilho}
        className="sem-barra flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtual(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {fotos.map((src, i) => (
          <div key={src} className="relative h-full w-full shrink-0 snap-start">
            <Image
              src={src}
              alt={`${alt} — ${i + 1}/${fotos.length}`}
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              priority={i === 0}
              quality={80}
              className="object-cover"
            />
          </div>
        ))}
      </div>
      {fotos.length > 1 && (
        <>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2" aria-hidden="true">
            {fotos.map((src, i) => (
              <span key={src} className={`size-2.5 rounded-full ${i === atual ? 'bg-white' : 'bg-white/50'}`} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => irPara(atual - 1)}
            disabled={atual === 0}
            aria-label={textos.anterior}
            className="absolute left-3 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-tinta disabled:opacity-0 md:flex"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
              <path d="M10.8 5.3 12.2 6.7 7.9 11H20v2H7.9l4.3 4.3-1.4 1.4L4 12z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => irPara(atual + 1)}
            disabled={atual === fotos.length - 1}
            aria-label={textos.proxima}
            className="absolute right-3 top-1/2 hidden size-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-tinta disabled:opacity-0 md:flex"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
              <path d="M13.2 5.3 11.8 6.7 16.1 11H4v2h12.1l-4.3 4.3 1.4 1.4L20 12z" />
            </svg>
          </button>
        </>
      )}
    </section>
  );
}
