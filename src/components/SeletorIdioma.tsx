'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { IDIOMAS, rota, semIdioma, type Idioma } from '@/i18n/config';

/** Nomes por extenso. Idioma novo (ex.: Español (Argentina)) entra aqui e em ORDEM quando existir em IDIOMAS. */
const NOMES: Record<Idioma, string> = { pt: 'Português', en: 'English', es: 'Español' };
/** Espanhol primeiro: é o idioma de quem chega pelos anúncios. */
const ORDEM: Idioma[] = ['es', 'pt', 'en'];

/**
 * Um botão com o código do idioma atual e uma seta ("ES ⌄") que abre a lista com os nomes por extenso.
 * É um <details>, como as perguntas da página inicial: abre e fecha sem JavaScript. Com a lista aberta,
 * tocar fora, Esc ou sair com o teclado fecham. Os ouvintes ficam no documento, e não num véu dentro da
 * barra: o vidro da barra (backdrop-filter) prenderia um véu "fixed" ao tamanho dela, e no Safari o toque
 * no botão não lhe dá foco, então só o onBlur não bastaria. Cada item leva para a MESMA página no outro
 * idioma; os guias só existem em espanhol, então nos outros idiomas o link vai para o início.
 */
export function SeletorIdioma({ atual, rotulo }: { atual: Idioma; rotulo: string }) {
  const caminho = semIdioma(usePathname() || '/');
  const detalhes = useRef<HTMLDetailsElement>(null);
  const [aberto, setAberto] = useState(false);
  const fechar = () => detalhes.current?.removeAttribute('open');

  useEffect(() => {
    if (!aberto) return;
    // tocar fora fecha, e o toque segue para o que foi tocado (o carrinho abre no primeiro toque)
    const foraFecha = (e: PointerEvent) => {
      if (!detalhes.current?.contains(e.target as Node)) fechar();
    };
    // Esc fecha e devolve o foco ao botão
    const escFecha = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      fechar();
      detalhes.current?.querySelector<HTMLElement>('summary')?.focus();
    };
    document.addEventListener('pointerdown', foraFecha);
    document.addEventListener('keydown', escFecha);
    return () => {
      document.removeEventListener('pointerdown', foraFecha);
      document.removeEventListener('keydown', escFecha);
    };
  }, [aberto]);

  return (
    <nav aria-label={rotulo}>
      <details
        ref={detalhes}
        className="group"
        onToggle={(e) => setAberto(e.currentTarget.open)}
        onBlur={(e) => {
          // o foco saiu do seletor inteiro (Tab ou toque em outro controle): fecha a lista
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) fechar();
        }}
      >
        <summary
          title={NOMES[atual]}
          className="flex h-10 cursor-pointer list-none items-center gap-0.5 rounded-full pl-2.5 pr-1.5 font-[family-name:var(--font-semi)] text-[0.875rem] font-semibold uppercase tracking-[0.06em] transition-colors duration-200 hover:bg-[color-mix(in_oklab,currentColor_12%,transparent)] [&::-webkit-details-marker]:hidden"
        >
          <span aria-hidden="true">{atual}</span>
          <span className="sr-only">{NOMES[atual]}</span>
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <ul
          onClick={fechar}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 flex min-w-44 flex-col gap-(--vao-celula) rounded-[16px] bg-(--color-mar) p-2 text-white shadow-[inset_0_0_0_1px_var(--vidro-escuro-borda)]"
        >
          {ORDEM.filter((i) => IDIOMAS.includes(i)).map((i) => (
            <li key={i}>
              <Link
                href={rota(i, caminho.startsWith('/guias') && i !== 'es' ? '/' : caminho)}
                prefetch={false}
                hrefLang={i}
                lang={i}
                aria-current={i === atual ? 'true' : undefined}
                className={`flex min-h-12 items-center whitespace-nowrap rounded-[12px] px-4 font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold transition-colors duration-200 hover:bg-white/10 ${
                  i === atual ? 'shadow-[inset_0_0_0_2px_currentColor]' : ''
                }`}
              >
                {NOMES[i]}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}
