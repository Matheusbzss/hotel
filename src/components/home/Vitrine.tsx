'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Cidade } from '@/data/passeios';
import { SeletorGrupo, type TextosSeletorGrupo } from '../grupo/SeletorGrupo';

export interface SecaoVitrine {
  id: Cidade;
  titulo: string;
  contagem: string;
  /** Os cartões da cidade, prontos do servidor (um <li> por passeio). */
  cartoes: ReactNode;
}

/**
 * A vitrine da página inicial: data e grupo, um filtro por cidade e, para cada cidade, um trilho de cartões
 * com foto que desliza para o lado no celular (com encaixe) e vira grade no computador.
 */
export function Vitrine({
  secoes,
  textos,
}: {
  secoes: SecaoVitrine[];
  textos: { titulo: string; texto: string; filtro: string; todas: string; grupo: TextosSeletorGrupo };
}) {
  const [cidade, setCidade] = useState<Cidade | null>(null);
  const visiveis = cidade ? secoes.filter((s) => s.id === cidade) : secoes;

  // "Ver os passeios de…" no cartão do mapa: filtra a cidade e rola até ela
  useEffect(() => {
    const ver = (e: Event) => {
      const id = (e as CustomEvent<Cidade>).detail;
      setCidade(id);
      const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          document.getElementById(`passeios-${id}`)?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' }),
        ),
      );
    };
    window.addEventListener('orla:ver-passeios', ver);
    return () => window.removeEventListener('orla:ver-passeios', ver);
  }, []);
  return (
    <section id="passeios" aria-labelledby="passeios-titulo" className="scroll-mt-24">
      <div className="grid gap-5 md:grid-cols-12 md:items-end md:gap-8">
        <div className="md:col-span-6">
          <h2 id="passeios-titulo" className="titulo">
            {textos.titulo}
          </h2>
          <p className="mt-3 max-w-[46ch] text-(--color-tinta-suave)">{textos.texto}</p>
        </div>
        <SeletorGrupo className="md:col-span-6" textos={textos.grupo} />
      </div>
      <div role="group" aria-label={textos.filtro} className="sem-barra -mx-(--margem) mt-5 flex gap-2 overflow-x-auto px-(--margem) pb-1">
        <button type="button" className="filtro" aria-pressed={cidade === null} onClick={() => setCidade(null)}>
          {textos.todas}
        </button>
        {secoes.map((s) => (
          <button key={s.id} type="button" className="filtro" aria-pressed={cidade === s.id} onClick={() => setCidade(s.id)}>
            {s.titulo}
          </button>
        ))}
      </div>
      {/* uma coluna de largura fixa: sem isso, o trilho de cartões alarga a página no celular */}
      <div className="mt-6 grid grid-cols-1 gap-9 md:mt-8 md:gap-12">
        {visiveis.map((s) => (
          <section key={s.id} id={`passeios-${s.id}`} aria-labelledby={`passeios-${s.id}-titulo`} className="min-w-0 scroll-mt-24">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 id={`passeios-${s.id}-titulo`} className="subtitulo">
                {s.titulo}
              </h3>
              <span className="text-small text-(--color-tinta-suave)">{s.contagem}</span>
            </div>
            <ul className="trilho">{s.cartoes}</ul>
          </section>
        ))}
      </div>
    </section>
  );
}
