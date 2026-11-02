'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export interface TextosGaleria {
  galeria: string;
  verFotos: string;
  anterior: string;
  proxima: string;
  fechar: string;
  fotoDe: string;
}

const preencher = (t: string, v: Record<string, number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));

/**
 * As fotos do passeio de borda a borda, no espaço que o pai der (o topo da página do passeio):
 * deslize para ver a próxima; tocar numa foto, ou em "Ver as fotos" no computador, abre a tela cheia.
 */
export function GaleriaPasseio({ fotos, alt, textos: T }: { fotos: string[]; alt: string; textos: TextosGaleria }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [atual, setAtual] = useState(0);
  const [aberta, setAberta] = useState(0);

  const abrir = (i: number) => {
    setAberta(i);
    dialogo.current?.showModal();
  };
  const passo = (n: number) => setAberta((i) => (i + n + fotos.length) % fotos.length);

  useEffect(() => {
    const el = dialogo.current;
    if (!el) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') passo(1);
      if (e.key === 'ArrowLeft') passo(-1);
    };
    el.addEventListener('keydown', tecla);
    return () => el.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fotos.length]);

  const altFoto = (i: number) => `${alt} — ${preencher(T.fotoDe, { i: i + 1, n: fotos.length })}`;
  const seta = (dir: 'esq' | 'dir') => (
    <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
      <path
        d={
          dir === 'esq'
            ? 'M10.8 5.3 12.2 6.7 7.9 11H20v2H7.9l4.3 4.3-1.4 1.4L4 12z'
            : 'M13.2 5.3 11.8 6.7 16.1 11H4v2h12.1l-4.3 4.3 1.4 1.4L20 12z'
        }
      />
    </svg>
  );

  return (
    <section aria-label={T.galeria} className="absolute inset-0">
      <div
        className="sem-barra absolute inset-0 flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => setAtual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
      >
        {fotos.map((src, i) => (
          <button key={src} type="button" onClick={() => abrir(i)} className="relative h-full w-full shrink-0 snap-start">
            <Image src={src} alt={altFoto(i)} fill sizes="100vw" priority={i === 0} quality={80} className="object-cover" />
          </button>
        ))}
      </div>
      {fotos.length > 1 && (
        <p
          className="numeros vidro vidro-escuro absolute right-3 top-20 rounded-full px-3 py-1.5 text-small md:right-6 md:top-24"
          aria-hidden="true"
        >
          {atual + 1}/{fotos.length}
        </p>
      )}
      {fotos.length > 1 && (
        <button
          type="button"
          onClick={() => abrir(atual)}
          className="etiqueta vidro vidro-escuro absolute bottom-6 right-6 hidden min-h-11 md:inline-flex"
        >
          {preencher(T.verFotos, { n: fotos.length })}
        </button>
      )}

      <dialog
        ref={dialogo}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-mar p-0 text-brilho backdrop:bg-mar"
        aria-label={T.galeria}
        onClick={(e) => e.target === dialogo.current && dialogo.current?.close()}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-(--margem) py-3">
            <p className="numeros text-small">{preencher(T.fotoDe, { i: aberta + 1, n: fotos.length })}</p>
            <button type="button" onClick={() => dialogo.current?.close()} className="botao min-h-11" autoFocus>
              {T.fechar}
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            <Image src={fotos[aberta]} alt={altFoto(aberta)} fill sizes="100vw" quality={85} className="object-contain" />
          </div>
          {fotos.length > 1 && (
            <div className="flex justify-center gap-2 py-4">
              <button type="button" onClick={() => passo(-1)} className="botao min-h-12 px-5" aria-label={T.anterior}>
                {seta('esq')}
              </button>
              <button type="button" onClick={() => passo(1)} className="botao min-h-12 px-5" aria-label={T.proxima}>
                {seta('dir')}
              </button>
            </div>
          )}
        </div>
      </dialog>
    </section>
  );
}
