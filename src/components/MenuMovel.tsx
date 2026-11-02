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
        className="flex size-11 items-center justify-center rounded-full transition-[transform,background-color] duration-[120ms] hover:bg-[color-mix(in_oklab,currentColor_12%,transparent)] active:scale-[0.97]"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
          {aberto ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {aberto && (
        <div id="menu-movel" className="vidro vidro-escuro absolute inset-x-0 top-[calc(100%+0.5rem)] z-50 rounded-[16px] p-2">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="flex min-h-14 items-center rounded-[12px] px-4 font-[family-name:var(--font-semi)] text-[1.25rem] font-semibold hover:bg-white/10"
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
