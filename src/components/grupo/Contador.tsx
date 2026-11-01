'use client';

import { useId } from 'react';

/** Campo numérico com botões − e + (pessoas na reserva). */
export function Contador({
  rotulo,
  ajuda,
  valor,
  min,
  max,
  aoMudar,
  textos,
}: {
  rotulo: string;
  ajuda?: string;
  valor: number;
  min: number;
  max: number;
  aoMudar: (v: number) => void;
  textos: { diminuir: string; aumentar: string };
}) {
  const id = useId();
  const botao =
    'flex size-12 shrink-0 items-center justify-center rounded-[4px] bg-(--color-papel) text-(--color-tinta) shadow-[inset_0_0_0_1px_var(--color-borda-campo)] text-2xl leading-none transition-transform duration-[120ms] active:scale-[0.97] hover:shadow-[inset_0_0_0_1px_var(--color-tinta)] disabled:cursor-not-allowed disabled:bg-(--color-superficie) disabled:text-(--color-borda-campo) disabled:shadow-none';
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <span id={id} className="block font-semibold leading-tight">
          {rotulo}
        </span>
        {ajuda && <span className="block text-small text-(--tinta-suave)">{ajuda}</span>}
      </div>
      <div className="flex items-center gap-1" role="group" aria-labelledby={id}>
        <button
          type="button"
          onClick={() => aoMudar(Math.max(min, valor - 1))}
          disabled={valor <= min}
          aria-label={`${textos.diminuir}: ${rotulo}`}
          className={botao}
        >
          −
        </button>
        <output className="cifra w-10 text-center text-figure" aria-live="polite">
          {valor}
        </output>
        <button
          type="button"
          onClick={() => aoMudar(Math.min(max, valor + 1))}
          disabled={valor >= max}
          aria-label={`${textos.aumentar}: ${rotulo}`}
          className={botao}
        >
          +
        </button>
      </div>
    </div>
  );
}
