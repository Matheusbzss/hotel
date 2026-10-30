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
    'flex size-11 shrink-0 items-center justify-center bg-(--acao) text-(--acao-tinta) text-2xl font-bold leading-none transition-transform active:scale-90 disabled:opacity-30 rounded-full';
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
        <output className="numeros w-9 text-center text-lead font-semibold" aria-live="polite">
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
