'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { COR_SERIE } from './cores-graficos';

export interface Coluna {
  /** O dia ou a semana, por extenso. */
  rotulo: string;
  valor: number;
  /** O valor já formatado. */
  texto: string;
  /** A outra medida do mesmo dia. */
  detalhe: string;
  /** O texto embaixo da coluna. Só algumas têm, para não embolar. */
  eixo?: string;
}

interface Ativa {
  i: number;
  x: number;
  largura: number;
}

/** Com muitas colunas, o gráfico rola para o lado em vez de afinar demais. */
const LARGURA_MINIMA = 7;

/** O balão fica sobre a coluna, sem passar da borda do gráfico. */
const lugarDoBalao = ({ x, largura }: Ativa) =>
  x < largura * 0.3 ? { left: x } : x > largura * 0.7 ? { right: largura - x } : { left: x, transform: 'translateX(-50%)' };

export function GraficoColunas({ nome, colunas, marcas }: { nome: string; colunas: Coluna[]; marcas: { valor: number; texto: string }[] }) {
  const moldura = useRef<HTMLDivElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const trilho = useRef<HTMLDivElement>(null);
  const [ativa, setAtiva] = useState<Ativa | null>(null);
  const topo = marcas[marcas.length - 1].valor;
  const altura = (valor: number) => `${(valor / topo) * 100}%`;

  // os dias mais recentes ficam à direita
  useEffect(() => {
    if (rolagem.current) rolagem.current.scrollLeft = rolagem.current.scrollWidth;
  }, []);

  function mostrar(i: number) {
    const base = moldura.current?.getBoundingClientRect();
    const coluna = trilho.current?.children[i]?.getBoundingClientRect();
    if (base && coluna) setAtiva({ i, x: coluna.left + coluna.width / 2 - base.left, largura: base.width });
  }

  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const i = Math.min(colunas.length - 1, Math.max(0, (ativa?.i ?? (passo > 0 ? -1 : colunas.length)) + passo));
    trilho.current?.children[i]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    mostrar(i);
  }

  const noMouse = (e: PointerEvent, acao: () => void) => {
    if (e.pointerType === 'mouse') acao();
  };
  const coluna = ativa ? colunas[ativa.i] : null;

  return (
    <div ref={moldura} className="relative">
      <div className="flex">
        <div className="relative mr-2 h-44 w-[4.25rem] shrink-0" aria-hidden>
          {marcas.map((m) => (
            <span
              key={m.valor}
              className="absolute right-0 translate-y-1/2 whitespace-nowrap text-[0.75rem] tabular-nums text-tinta-suave"
              style={{ bottom: altura(m.valor) }}
            >
              {m.texto}
            </span>
          ))}
        </div>
        <div
          ref={rolagem}
          role="group"
          aria-label={`${nome}. Use as setas para ver cada coluna.`}
          tabIndex={0}
          onKeyDown={teclado}
          onBlur={() => setAtiva(null)}
          className="min-w-0 flex-1 overflow-x-auto outline-offset-2 focus-visible:outline-2 focus-visible:outline-mar"
        >
          <div style={{ minWidth: colunas.length * LARGURA_MINIMA }}>
            <div className="relative h-44">
              {marcas.map((m) => (
                <div key={m.valor} className="absolute inset-x-0 h-px bg-superficie" style={{ bottom: altura(m.valor) }} aria-hidden />
              ))}
              <div ref={trilho} className="absolute inset-0 flex" onPointerLeave={(e) => noMouse(e, () => setAtiva(null))}>
                {colunas.map((c, i) => (
                  // a área de toque é a faixa inteira do dia, não só a coluna pintada
                  <div
                    key={i}
                    className="flex h-full min-w-0 flex-1 items-end justify-center px-px"
                    onPointerEnter={(e) => noMouse(e, () => mostrar(i))}
                    onClick={() => mostrar(i)}
                  >
                    {c.valor > 0 && (
                      <div
                        className="w-full max-w-6 rounded-t-[4px]"
                        style={{ height: altura(c.valor), minHeight: 2, background: ativa?.i === i ? 'var(--color-mar)' : COR_SERIE }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="relative mt-1 h-5" aria-hidden>
              {colunas.map((c, i) => {
                if (!c.eixo) return null;
                const lugar =
                  i === 0
                    ? { left: 0 }
                    : i === colunas.length - 1
                      ? { right: 0 }
                      : { left: `${((i + 0.5) / colunas.length) * 100}%`, transform: 'translateX(-50%)' };
                return (
                  <span key={i} className="absolute text-[0.75rem] tabular-nums text-tinta-suave" style={lugar}>
                    {c.eixo}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {ativa && coluna && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 whitespace-nowrap border border-borda bg-white px-3 py-2 text-small shadow-md"
          style={lugarDoBalao(ativa)}
        >
          <p className="font-bold tabular-nums">{coluna.texto}</p>
          <p className="text-tinta-suave">{coluna.detalhe}</p>
          <p className="text-tinta-suave">{coluna.rotulo}</p>
        </div>
      )}
    </div>
  );
}
