'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export function MenuMovel({
  links,
  rotuloAbrir,
  rotuloFechar,
  whatsapp,
}: {
  links: { href: string; texto: string }[];
  rotuloAbrir: string;
  rotuloFechar: string;
  whatsapp: { href: string; texto: string };
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
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls="menu-movel"
        aria-label={aberto ? rotuloFechar : rotuloAbrir}
        onClick={() => setAberto((v) => !v)}
        className="flex size-12 items-center justify-center rounded-full bg-tinta text-white active:scale-95"
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
          className="absolute inset-x-0 top-full z-50 bg-tinta px-[var(--margem)] pb-8 pt-4 text-white shadow-[0_24px_40px_rgba(11,59,92,0.35)]"
        >
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block py-3 text-2xl font-semibold">
                  {l.texto}
                </Link>
              </li>
            ))}
          </ul>
          <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" className="botao botao-whats mt-6 w-full" data-evento="Contact">
            {whatsapp.texto}
          </a>
        </div>
      )}
    </div>
  );
}
