'use client';

import { useCarrinho } from './CarrinhoContexto';
import { IconeSacola } from './IconeSacola';

/** A sacola no cabeçalho, com a quantidade de itens: abre o carrinho por cima da página. */
export function CarrinhoIcone({ textos }: { textos: { abrir: string; rotuloIcone: string } }) {
  const { itens, abrir } = useCarrinho();
  const n = itens.length;
  return (
    <button
      type="button"
      onClick={abrir}
      aria-label={n ? textos.rotuloIcone.replace('{n}', String(n)) : textos.abrir}
      aria-haspopup="dialog"
      className="relative grid size-9 place-items-center rounded-full transition-colors duration-200 hover:bg-[color-mix(in_oklab,currentColor_12%,transparent)] sm:size-10"
    >
      <IconeSacola className="size-[1.375rem]" />
      {n > 0 && (
        <span className="numeros absolute right-0 top-0 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-(--color-acao) px-1 text-[0.6875rem] font-bold leading-none text-(--color-tinta)">
          {n}
        </span>
      )}
    </button>
  );
}
