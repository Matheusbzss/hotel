'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IDIOMAS, rota, semIdioma, type Idioma } from '@/i18n/config';
import { Bandeira } from './Bandeira';

const NOMES: Record<Idioma, string> = { pt: 'Português', en: 'English', es: 'Español' };

export function SeletorIdioma({ atual, rotulo }: { atual: Idioma; rotulo: string }) {
  const caminho = semIdioma(usePathname() || '/');
  return (
    <nav aria-label={rotulo} className="flex items-center gap-0.5 md:gap-1">
      {IDIOMAS.map((i) => (
        <Link
          key={i}
          href={rota(i, caminho)}
          hrefLang={i}
          lang={i}
          aria-current={i === atual ? 'true' : undefined}
          title={NOMES[i]}
          className={`flex size-10 items-center md:size-11 justify-center rounded-full transition-colors ${
            i === atual ? 'bg-areia' : 'hover:bg-areia-clara'
          }`}
        >
          <Bandeira idioma={i} className="h-[15px] w-[22px] rounded-[2px]" />
          <span className="sr-only">{NOMES[i]}</span>
        </Link>
      ))}
    </nav>
  );
}
