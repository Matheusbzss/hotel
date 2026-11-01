'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function MenuMovel({
  links,
  rotuloAbrir,
  rotuloFechar,
}: {
  links: { href: string; texto: string }[];
  rotuloAbrir: string;
  rotuloFechar: string;
}) {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();
  useEffect(() => setAberto(false), [caminho]);
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aberto]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="menu-movel"
        aria-label={aberto ? rotuloFechar : rotuloAbrir}
        onClick={() => setAberto((v) => !v)}
        className="flex size-12 items-center justify-center rounded-[4px] shadow-[inset_0_0_0_1px_currentColor] transition-transform duration-[120ms] active:scale-[0.97]"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
          {aberto ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {aberto && (
        <div id="menu-movel" className="tom-campo absolute inset-x-0 top-full z-50 border-t border-white/20 px-(--margem) pb-6 pt-2">
          <ul className="flex flex-col gap-[3px]">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="celula flex min-h-14 items-center px-4 font-[family-name:var(--font-semi)] text-[1.25rem] font-semibold"
                >
                  {l.texto}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
