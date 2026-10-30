'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fmt } from '@/i18n/config';
import { calcular, formatarCentavos } from '@/lib/orcamento';
import type { PrecoPasseio } from '@/lib/passeio-view';
import type { RotulosPessoas } from '@/lib/pessoas';
import { pessoasDoGrupo, useGrupo } from '../grupo/GrupoContexto';
import { ResumoGrupo } from '../grupo/ResumoGrupo';
import { SeletorGrupo, type TextosSeletorGrupo } from '../grupo/SeletorGrupo';

export interface GrupoFolha {
  id: string;
  titulo: string;
  itens: PrecoPasseio[];
}

export interface TextosFolha {
  titulo: string;
  texto: string;
  rodape: string[];
  cidades: string;
  aPartirDe: string;
  idadeMin: string;
  totalPara: string;
  semData: string;
  rotulos: RotulosPessoas;
  grupo: TextosSeletorGrupo;
}

/**
 * A folha de preços que os vendedores entregam na orla, agora somada para o grupo:
 * uma folha de papel sobre o mar fundo, uma cidade por vez, cada valor já é o total.
 */
export function FolhaPrecos({ grupos, textos: T, locale }: { grupos: GrupoFolha[]; textos: TextosFolha; locale: string }) {
  const { grupo } = useGrupo();
  const [ativo, setAtivo] = useState(grupos[0]?.id);
  // sem JavaScript, a folha mostra todas as cidades; com ele, uma por vez
  const [pronto, setPronto] = useState(false);
  useEffect(() => setPronto(true), []);
  const brl = (c: number) => formatarCentavos(c, locale);
  const temCriancas = grupo.criancas6a10 + grupo.criancas0a5 > 0;
  const total = grupos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <section id="passeios" className="tom-campo scroll-mt-0 px-2.5 py-16 md:px-(--margem) md:py-32" aria-labelledby="passeios-titulo">
      <div className="tom-papel entrar mx-auto max-w-[42rem] px-6 py-10 sm:px-10 md:px-16 md:py-16">
        <h2 id="passeios-titulo" className="titulo text-center">
          {T.titulo}
        </h2>
        <p className="mx-auto mt-4 max-w-[40ch] text-center">{fmt(T.texto, { n: total })}</p>
        <SeletorGrupo className="mt-8" textos={T.grupo} />

        <div role="tablist" aria-label={T.cidades} className="mt-8 flex flex-wrap justify-center gap-2">
          {grupos.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              id={`aba-${g.id}`}
              aria-selected={g.id === ativo}
              aria-controls={`cidade-${g.id}`}
              className="filtro shrink-0"
              onClick={() => setAtivo(g.id)}
            >
              {g.titulo}
            </button>
          ))}
        </div>
        <ResumoGrupo
          textos={{ totalPara: T.totalPara, semData: T.semData, rotulos: T.rotulos }}
          locale={locale}
          className="mt-6 text-center text-small font-semibold text-(--tinta-suave)"
        />

        {grupos.map((g) => (
          <div
            key={g.id}
            id={`cidade-${g.id}`}
            role="tabpanel"
            aria-labelledby={`aba-${g.id}`}
            hidden={pronto && g.id !== ativo}
            className="mt-8"
          >
            <h3 className="text-center text-lead font-semibold">{g.titulo}</h3>
            <ul className="mt-6 space-y-5">
              {g.itens.map((p) => {
                const orc = calcular(p.tabela, pessoasDoGrupo(grupo, p.tabela));
                const aviso = temCriancas && p.idadeMinima ? fmt(T.idadeMin, { n: p.idadeMinima }) : '';
                return (
                  <li key={p.slug}>
                    <Link href={p.href} className="group grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4">
                      <span className="min-w-0">
                        <span className="block font-semibold underline-offset-[0.2em] group-hover:underline">{p.nome}</span>
                        <span className="mt-0.5 block text-small text-(--tinta-suave)">
                          {p.duracao} · {p.temOpcoes ? `${T.aPartirDe} ` : ''}
                          {brl(p.tabela.precoCentavos)} {p.unidadeCurta}
                        </span>
                      </span>
                      <span className="numeros text-right font-semibold">
                        {p.temOpcoes && <span className="block text-small font-normal text-(--tinta-suave)">{T.aPartirDe}</span>}
                        {brl(orc.totalCentavos)}
                        {aviso && <span className="block text-small font-normal text-(--tinta-suave)">{aviso}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <p className="mt-12 text-center text-small text-(--tinta-suave)">
          {T.rodape[0]}
          <br />
          {T.rodape[1]}
        </p>
      </div>
    </section>
  );
}
