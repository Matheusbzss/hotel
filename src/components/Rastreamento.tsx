'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { carregarGoogle, carregarPixel, guardarOrigem, marcarMedicao, rastrear, soltarEventos } from '@/lib/pixel';

const CHAVE = 'vh_consentimento_cookies';

/**
 * Pixel da Meta (NEXT_PUBLIC_META_PIXEL_ID) e tag do Google Ads (NEXT_PUBLIC_GOOGLE_ADS_ID), carregados só
 * após o aceite dos cookies (LGPD). Sem nenhum dos dois, o aviso de cookies nem aparece.
 */
export function Rastreamento({
  pixelId,
  googleId,
  textos,
  linkPrivacidade,
}: {
  pixelId?: string;
  googleId?: string;
  textos: { texto: string; aceitar: string; recusar: string; saibaMais: string };
  linkPrivacidade: string;
}) {
  const [consentimento, setConsentimento] = useState<'sim' | 'nao' | null | undefined>(undefined);
  const caminho = usePathname();
  const medeAnuncios = Boolean(pixelId || googleId);

  useEffect(() => {
    let valor: string | null = null;
    try {
      valor = localStorage.getItem(CHAVE);
    } catch {}
    setConsentimento(valor === 'sim' || valor === 'nao' ? valor : null);
  }, []);

  useEffect(() => {
    if (consentimento === undefined) return;
    marcarMedicao(consentimento === 'sim');
    guardarOrigem(consentimento === 'sim');
  }, [caminho, consentimento]);

  useEffect(() => {
    if (consentimento !== 'sim') return;
    if (pixelId) carregarPixel(pixelId);
    if (googleId) carregarGoogle(googleId);
  }, [consentimento, pixelId, googleId]);

  useEffect(() => {
    if (consentimento !== 'sim' || !medeAnuncios) return;
    rastrear('PageView');
    soltarEventos();
  }, [caminho, consentimento, medeAnuncios]);

  // Cliques no WhatsApp viram o evento "Contact"
  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      const alvo = (e.target as HTMLElement | null)?.closest?.('[data-evento]');
      if (alvo) rastrear(alvo.getAttribute('data-evento') || 'Contact');
    };
    document.addEventListener('click', aoClicar);
    return () => document.removeEventListener('click', aoClicar);
  }, []);

  if (!medeAnuncios || consentimento !== null) return null;

  const escolher = (v: 'sim' | 'nao') => {
    try {
      localStorage.setItem(CHAVE, v);
    } catch {}
    setConsentimento(v);
  };

  return (
    <div role="region" aria-label="Cookies" className="tom-campo fixed inset-x-0 bottom-0 z-50">
      <div className="moldura flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
        <p>
          {textos.texto}{' '}
          <Link href={linkPrivacidade} className="link font-semibold">
            {textos.saibaMais}
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => escolher('nao')} className="botao botao-vazado min-h-11 px-5 py-2">
            {textos.recusar}
          </button>
          <button type="button" onClick={() => escolher('sim')} className="botao min-h-11 px-5 py-2">
            {textos.aceitar}
          </button>
        </div>
      </div>
    </div>
  );
}
