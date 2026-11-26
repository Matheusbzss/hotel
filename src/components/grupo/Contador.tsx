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
    // o rótulo ocupa o que sobra ao lado dos botões e quebra por dentro como sempre; só quando nem a maior palavra dele
    // cabe ao lado (letra grande em tela estreita), os botões descem para a linha de baixo, em vez de passar por cima
    // do rótulo ou da borda. Com a letra normal, a partir de 320 px, a linha fica igual
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="max-w-full grow basis-0 wrap-break-word">
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
