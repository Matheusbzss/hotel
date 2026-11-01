'use client';

import Link from 'next/link';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Cidade } from '@/data/passeios';
import type { ItemBoletim } from '@/lib/boletim';
import { LinhasBoletim, type TextosBoletim } from './Boletim';
import { useEstadoHome } from './EstadoHome';

export interface TextosMapa {
  titulo: string;
  texto: string;
  toque: string;
  fonte: string;
  todos: string;
  fechar: string;
}

/**
 * A Região dos Lagos: com 3D, os pinos acompanham a cena (a câmera já subiu do mar até aqui);
 * sem 3D, o mesmo litoral em mapa plano. Tocar numa cidade filtra o boletim e abre a lista dela.
 */
export function MapaRegiao({
  pinos,
  nomes,
  itens,
  textos: T,
  textosBoletim,
  locale,
  hrefTodos,
  children,
}: {
  pinos: { id: Cidade; esquerda: number; topo: number }[];
  nomes: Partial<Record<Cidade, string>>;
  itens: ItemBoletim[];
  textos: TextosMapa;
  textosBoletim: TextosBoletim;
  locale: string;
  hrefTodos: string;
  children: ReactNode;
}) {
  const { pino: folha, escolherPino: setFolha } = useEstadoHome();
  const tituloFolha = useRef<HTMLHeadingElement>(null);
  const ultimoPino = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!folha) return;
    tituloFolha.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [folha]);

  function abrir(id: Cidade, botao: HTMLButtonElement) {
    ultimoPino.current = botao;
    setFolha(id);
  }
  function fechar() {
    setFolha(null);
    ultimoPino.current?.focus();
  }

  const daCidade = folha ? itens.filter((i) => i.cidade === folha) : [];

  return (
    <section id="mapa-janela" className="mapa-janela" aria-labelledby="mapa-titulo">
      <div className="moldura relative z-20 pt-14 md:pt-20">
        <div className="tom-campo celula max-w-[30rem] p-4 md:p-5">
          <h2 id="mapa-titulo" className="subtitulo">
            {T.titulo}
          </h2>
          <p className="mt-2 hidden text-small md:block">{T.texto}</p>
          <p className="mt-3 font-[family-name:var(--font-semi)] font-semibold text-(--color-acao)">{T.toque}</p>
        </div>
      </div>

      <div className="mapa-caixa">
        <div className="mapa-plano">{children}</div>
        {pinos.map((p) => (
          <button
            key={p.id}
            type="button"
            data-pino={p.id}
            data-visivel="sim"
            className="pino"
            style={{ '--x': `${p.esquerda}%`, '--y': `${p.topo}%` } as CSSProperties}
            aria-pressed={folha === p.id}
            aria-controls="mapa-folha"
            onClick={(e) => abrir(p.id, e.currentTarget)}
          >
            <span className="pino-nome">{nomes[p.id]}</span>
            <span className="pino-ponto" aria-hidden="true" />
          </button>
        ))}
      </div>

      <p className="mapa-fonte">{T.fonte}</p>

      {folha && (
        <div id="mapa-folha" className="mapa-folha tom-fundo" role="region" aria-labelledby="mapa-folha-titulo">
          <div className="flex items-center justify-between gap-3">
            <h3 id="mapa-folha-titulo" ref={tituloFolha} tabIndex={-1} className="subtitulo outline-none">
              {nomes[folha]}
            </h3>
            <button type="button" onClick={fechar} className="flex size-11 items-center justify-center rounded-[4px] shadow-[inset_0_0_0_1px_currentColor]">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
              <span className="sr-only">{T.fechar}</span>
            </button>
          </div>
          <div className="mt-3">
            <LinhasBoletim itens={daCidade} textos={textosBoletim} locale={locale} agrupar={false} nomesCidades={nomes} />
          </div>
          <Link href={`${hrefTodos}?cidade=${folha}`} className="link mt-4 inline-flex min-h-11 items-center font-semibold">
            {T.todos}
          </Link>
        </div>
      )}
    </section>
  );
}
