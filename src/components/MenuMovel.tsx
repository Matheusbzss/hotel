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
        className="flex size-12 items-center justify-center rounded-full bg-(--acao) text-(--acao-tinta) transition-transform active:scale-95"
      >
        <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true" fill="currentColor">
          {aberto ? (
            <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6Z" />
          ) : (
            <path d="M3 6h18v2.2H3zm0 4.9h18v2.2H3zm0 4.9h18V18H3z" />
          )}
        </svg>
      </button>
      {aberto && (
        <div
          id="menu-movel"
          className={
            'tom-papel absolute inset-x-0 top-full z-50 px-(--margem) pb-8 pt-2 shadow-[0_18px_40px_rgb(11_37_48/0.18)]' /* taste-skill-ignore: o menu flutua sobre a página */
          }
        >
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block py-3 text-lead font-semibold">
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
