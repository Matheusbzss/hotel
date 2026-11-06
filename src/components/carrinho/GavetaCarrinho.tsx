'use client';

import { useEffect, useId, useRef } from 'react';
import type { Dicionario } from '@/i18n';
import { useCarrinho } from './CarrinhoContexto';
import { ListaCarrinho } from './ListaCarrinho';
import { ResumoCarrinho } from './ResumoCarrinho';

export type TextosCarrinho = Dicionario['carrinho'] & Pick<Dicionario['preco'], 'noPix' | 'noCartao'>;

export const textoQuantidade = (T: TextosCarrinho, n: number) => (n === 1 ? T.item : T.itens.replace('{n}', String(n)));

/**
 * O carrinho por cima da página, em vidro claro: no computador entra pela direita; no celular sobe de
 * baixo. Fecha no X, no fundo escuro, no "continuar escolhendo" e no Esc.
 */
export function GavetaCarrinho({
  locale,
  hrefFinalizar,
  hrefPasseios,
  textos: T,
}: {
  locale: string;
  hrefFinalizar: string;
  hrefPasseios: string;
  textos: TextosCarrinho;
}) {
  const { itens, aberto, fechar, remover } = useCarrinho();
  const id = useId();
  // ao abrir, o foco vai para a gaveta (o leitor de tela anuncia o título; o X não ganha contorno)
  const gavetaRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (aberto) gavetaRef.current?.focus();
  }, [aberto]);
  const n = itens.length;

  return (
    <div className={`fixed inset-0 z-50 ${aberto ? '' : 'pointer-events-none'}`} aria-hidden={!aberto} inert={!aberto}>
      <div
        onClick={fechar}
        className={`absolute inset-0 bg-[rgb(6_54_67_/_0.4)] transition-opacity duration-[360ms] ${aberto ? 'opacity-100' : 'opacity-0'}`}
      />
      <section
        ref={gavetaRef}
        tabIndex={-1}
        // o foco vem por programa, ao abrir: a gaveta inteira não ganha contorno (os botões dentro, sim)
        style={{ outline: 'none' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={`vidro vidro-claro absolute inset-x-2 bottom-2 flex max-h-[86dvh] flex-col rounded-vidro transition-[transform,visibility] duration-[360ms] ease-(--ease-padrao) lg:inset-y-3 lg:left-auto lg:right-3 lg:max-h-none lg:w-[26rem] ${
          aberto
            ? 'visible translate-y-0 lg:translate-x-0'
            : 'invisible translate-y-[calc(100%+1rem)] lg:translate-x-[calc(100%+1rem)] lg:translate-y-0'
        }`}
      >
        <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
          <h2 id={id} className="text-lead font-semibold">
            {T.titulo} <span className="text-small font-normal text-(--color-tinta-suave)">· {textoQuantidade(T, n)}</span>
          </h2>
          <button
            type="button"
            onClick={fechar}
            aria-label={T.fechar}
            className="-mr-1.5 grid size-10 place-items-center rounded-full transition-colors duration-200 hover:bg-[color-mix(in_oklab,currentColor_12%,transparent)]"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-1">
          {n ? (
            <ListaCarrinho itens={itens} locale={locale} textos={T} aoRemover={remover} />
          ) : (
            <div className="py-10 text-center">
              <p>{T.vazio}</p>
              <a href={hrefPasseios} className="botao botao-vazado mt-4">
                {T.verPasseios}
              </a>
            </div>
          )}
        </div>
        {n > 0 && (
          <footer className="border-t border-(--color-borda) px-5 pb-5 pt-4">
            <ResumoCarrinho itens={itens} locale={locale} hrefFinalizar={hrefFinalizar} textos={T} aoContinuar={fechar} />
          </footer>
        )}
      </section>
    </div>
  );
}
