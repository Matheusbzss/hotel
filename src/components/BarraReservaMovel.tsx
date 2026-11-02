'use client';

import { useEffect, useState } from 'react';
import type { TabelaPreco } from '@/lib/orcamento';
import type { RotulosPessoas } from '@/lib/pessoas';
import { PrecoGrupo } from './grupo/PrecoGrupo';

/**
 * Barra de vidro fosco do celular: o preço por pessoa, o total do grupo e o atalho para a reserva.
 * Some quando o cartão de reserva, os outros passeios ou o rodapé aparecem, para não cobrir nada.
 */
export function BarraReservaMovel({
  preco,
  unidade,
  tabela,
  locale,
  textos,
}: {
  preco: string;
  unidade: string;
  tabela: TabelaPreco;
  locale: string;
  textos: { reservar: string; totalPara: string; rotulos: RotulosPessoas };
}) {
  const [oculta, setOculta] = useState(false);

  useEffect(() => {
    const alvos = ['#reservar', '#outros-passeios', 'footer'].map((s) => document.querySelector(s)).filter(Boolean) as Element[];
    if (!alvos.length || !('IntersectionObserver' in window)) return;
    const visiveis = new Set<Element>();
    const io = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) visiveis.add(e.target);
        else visiveis.delete(e.target);
      }
      setOculta(visiveis.size > 0);
    });
    alvos.forEach((a) => io.observe(a));
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 px-2 transition-transform duration-300 lg:hidden ${oculta ? 'translate-y-[calc(100%+1rem)]' : ''}`}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      aria-hidden={oculta}
    >
      <div className="vidro vidro-escuro flex items-center justify-between gap-3 rounded-vidro py-2 pl-4 pr-2">
        <div className="min-w-0 leading-tight">
          <p className="truncate">
            <strong className="cifra text-lead">{preco}</strong> <span className="text-small">{unidade}</span>
          </p>
          <PrecoGrupo tabela={tabela} locale={locale} textos={textos} className="truncate text-caption text-white/80" />
        </div>
        <a href="#reservar" className="botao shrink-0" tabIndex={oculta ? -1 : undefined}>
          {textos.reservar}
        </a>
      </div>
    </div>
  );
}
