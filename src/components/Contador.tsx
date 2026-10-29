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
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <span id={id} className="font-semibold">
          {rotulo}
        </span>
        {ajuda && <span className="block text-small text-tinta-suave">{ajuda}</span>}
      </div>
      <div className="flex items-center gap-2" role="group" aria-labelledby={id}>
        <button
          type="button"
          onClick={() => aoMudar(Math.max(min, valor - 1))}
          disabled={valor <= min}
          aria-label={`${textos.diminuir} ${rotulo.toLowerCase()}`}
          className="flex size-11 items-center justify-center rounded-full bg-white text-2xl font-bold transition-transform active:scale-90 disabled:opacity-40"
        >
          −
        </button>
        <output className="w-8 text-center text-xl font-bold" aria-live="polite">
          {valor}
        </output>
        <button
          type="button"
          onClick={() => aoMudar(Math.min(max, valor + 1))}
          disabled={valor >= max}
          aria-label={`${textos.aumentar} ${rotulo.toLowerCase()}`}
          className="flex size-11 items-center justify-center rounded-full bg-white text-2xl font-bold transition-transform active:scale-90 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}
