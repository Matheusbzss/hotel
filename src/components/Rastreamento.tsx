'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { carregarPixel, rastrear } from '@/lib/pixel';

const CHAVE = 'vh_consentimento_cookies';

/** Pixel da Meta (ID em NEXT_PUBLIC_META_PIXEL_ID) carregado só após o aceite dos cookies (LGPD). */
export function Rastreamento({
  pixelId,
  textos,
  linkPrivacidade,
}: {
  pixelId?: string;
  textos: { texto: string; aceitar: string; recusar: string; saibaMais: string };
  linkPrivacidade: string;
}) {
  const [consentimento, setConsentimento] = useState<'sim' | 'nao' | null | undefined>(undefined);
  const caminho = usePathname();

  useEffect(() => {
    let valor: string | null = null;
    try {
      valor = localStorage.getItem(CHAVE);
    } catch {}
    setConsentimento(valor === 'sim' || valor === 'nao' ? valor : null);
  }, []);

  useEffect(() => {
    if (consentimento === 'sim' && pixelId) carregarPixel(pixelId);
  }, [consentimento, pixelId]);

  useEffect(() => {
    if (consentimento === 'sim' && pixelId) rastrear('PageView');
  }, [caminho, consentimento, pixelId]);

  // Cliques no WhatsApp viram o evento "Contact"
  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      const alvo = (e.target as HTMLElement | null)?.closest?.('[data-evento]');
      if (alvo) rastrear(alvo.getAttribute('data-evento') || 'Contact');
    };
    document.addEventListener('click', aoClicar);
    return () => document.removeEventListener('click', aoClicar);
  }, []);

  if (!pixelId || consentimento !== null) return null;

  const escolher = (v: 'sim' | 'nao') => {
    try {
      localStorage.setItem(CHAVE, v);
    } catch {}
    setConsentimento(v);
  };

  return (
    <div
      role="region"
      aria-label="Cookies"
      className="fixed inset-x-0 bottom-0 z-50 bg-tinta text-white shadow-[0_-12px_32px_rgba(11,59,92,0.3)]"
    >
      <div className="moldura flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
        <p className="text-[1rem]">
          {textos.texto}{' '}
          <Link href={linkPrivacidade} className="font-semibold underline underline-offset-4">
            {textos.saibaMais}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => escolher('nao')} className="botao botao-branco min-h-11 px-5 py-2">
            {textos.recusar}
          </button>
          <button type="button" onClick={() => escolher('sim')} className="botao botao-coral min-h-11 px-5 py-2">
            {textos.aceitar}
          </button>
        </div>
      </div>
    </div>
  );
}
