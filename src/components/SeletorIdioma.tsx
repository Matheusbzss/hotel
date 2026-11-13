'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { HREFLANG, IDIOMAS, isIdiomaGuia, rota, semIdioma, type Idioma } from '@/i18n/config';

/** Nomes por extenso. Idioma novo entra aqui e em ORDEM quando existir em IDIOMAS. */
const NOMES: Record<Idioma, string> = { pt: 'Português', en: 'English', es: 'Español', 'es-ar': 'Español (Argentina)' };
/** Os dois espanhóis primeiro: é o idioma de quem chega pelos anúncios. */
const ORDEM: Idioma[] = ['es', 'es-ar', 'pt', 'en'];
/**
 * O código que aparece no botão ('ES', 'ES-AR'), com o hífen que não quebra (U+2011) para o código ficar sempre
 * numa linha só. Sai do próprio código do idioma: o do português continua 'PT', como sempre foi.
 */
const CODIGO: Record<Idioma, string> = Object.fromEntries(IDIOMAS.map((i) => [i, i.toUpperCase().replace('-', '‑')])) as Record<
  Idioma,
  string
>;

/**
 * Um botão com o código do idioma atual e uma seta ("ES ⌄") que abre a lista com os nomes por extenso.
 * É um <details>, como as perguntas da página inicial: abre e fecha sem JavaScript. Com a lista aberta,
 * tocar fora, Esc ou sair com o teclado (Tab para outro controle) fecham. Os ouvintes ficam no documento, e
 * não num véu dentro da barra: o vidro da barra (backdrop-filter) prenderia um véu "fixed" ao tamanho dela, e
 * no Safari o toque não dá foco a botões nem a links, então o onBlur só vale quando o foco vai para outro
 * controle (relatedTarget); com o foco indo para o body ele não fecha. Cada item leva para a MESMA página no outro
 * idioma; os guias só existem nas duas versões do espanhol: entre elas o link vai para o mesmo guia, e nos
 * outros idiomas vai para o início.
 */
export function SeletorIdioma({ atual, rotulo }: { atual: Idioma; rotulo: string }) {
  const caminho = semIdioma(usePathname() || '/');
  // "ES‑AR" é o único código com cinco letras: o botão fica um pouco mais justo (menos espaço entre as letras e
  // nas bordas) para a barra caber nos celulares mais estreitos
  const compacto = CODIGO[atual].length > 2;
  const detalhes = useRef<HTMLDetailsElement>(null);
  const [aberto, setAberto] = useState(false);
  // o que vem depois do "?" no endereço (o filtro de /passeios?cidade=…, o ?t= da reserva e do pedido): lido do
  // navegador cada vez que a lista abre, para a troca de idioma não perder nada. Sem JavaScript, o link leva à mesma
  // página sem a busca. Sem useSearchParams: o cabeçalho está nas páginas estáticas, e ele pediria um <Suspense>.
  const [busca, setBusca] = useState('');
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
        onToggle={(e) => {
          const aberta = e.currentTarget.open;
          setAberto(aberta);
          if (aberta) setBusca(window.location.search);
        }}
        onBlur={(e) => {
          // o foco foi para OUTRO controle (Tab): fecha a lista. Sem relatedTarget (o foco foi para o body), não
          // fecha aqui: no WebKit, tocar num item da lista não lhe dá foco e dispara este blur no botão antes do
          // clique terminar; fechar agora tirava o item de baixo do dedo e a troca de idioma não acontecia.
          // Tocar fora da lista fecha pelo pointerdown no documento, acima.
          if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) fechar();
        }}
      >
        <summary
          title={NOMES[atual]}
          className={`flex h-10 cursor-pointer list-none items-center gap-0.5 rounded-full font-[family-name:var(--font-semi)] text-[0.875rem] font-semibold uppercase transition-colors duration-200 hover:bg-[color-mix(in_oklab,currentColor_12%,transparent)] [&::-webkit-details-marker]:hidden ${
            compacto ? 'pl-2 pr-1 tracking-[0.02em]' : 'pl-2.5 pr-1.5 tracking-[0.06em]'
          }`}
        >
          <span aria-hidden="true" className="whitespace-nowrap">
            {CODIGO[atual]}
          </span>
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
                href={rota(i, caminho.startsWith('/guias') && !isIdiomaGuia(i) ? '/' : caminho + busca)}
                prefetch={false}
                hrefLang={HREFLANG[i]}
                lang={HREFLANG[i]}
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
