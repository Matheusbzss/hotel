'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IDIOMAS, rota, semIdioma, type Idioma } from '@/i18n/config';

const NOMES: Record<Idioma, string> = { pt: 'Português', en: 'English', es: 'Español' };
/** Espanhol primeiro: é o idioma de quem chega pelos anúncios. */
const ORDEM: Idioma[] = ['es', 'pt', 'en'];

/** Três células com o código do idioma; a atual em traço cheio. Mantém a mesma página ao trocar. */
export function SeletorIdioma({ atual, rotulo }: { atual: Idioma; rotulo: string }) {
  const caminho = semIdioma(usePathname() || '/');
  return (
    <nav aria-label={rotulo} className="flex items-center gap-0.5">
      {ORDEM.filter((i) => IDIOMAS.includes(i)).map((i) => (
        <Link
          key={i}
          href={rota(i, caminho)}
          hrefLang={i}
          lang={i}
          aria-current={i === atual ? 'true' : undefined}
          title={NOMES[i]}
          className={`flex h-10 min-w-10 items-center justify-center rounded-full px-1.5 font-[family-name:var(--font-semi)] text-[0.875rem] font-semibold uppercase tracking-[0.06em] transition-[box-shadow,background-color] duration-200 ${
            i === atual ? 'shadow-[inset_0_0_0_2px_currentColor]' : 'hover:shadow-[inset_0_0_0_1px_currentColor]'
          }`}
        >
          <span aria-hidden="true">{i}</span>
          <span className="sr-only">{NOMES[i]}</span>
        </Link>
      ))}
    </nav>
  );
}
