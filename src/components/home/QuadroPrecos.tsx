'use client';

import Link from 'next/link';
import { calcular, formatarCentavos } from '@/lib/orcamento';
import type { PrecoPasseio } from '@/lib/passeio-view';
import { fmt } from '@/i18n/config';
import { pessoasDoGrupo, useGrupo } from '../grupo/GrupoContexto';

export interface GrupoQuadro {
  id: string;
  titulo: string;
  itens: PrecoPasseio[];
}

export interface TextosQuadro {
  colPasseio: string;
  colDuracao: string;
  colPreco: string;
  colTotal: string;
  porPessoaCurto: string;
  aPartirDe: string;
  idadeMin: string;
}

/**
 * Quadro de saídas: todos os passeios numa tabela de um só tamanho de letra.
 * A última coluna é o total para o grupo escolhido, com a regra de criança de cada passeio.
 */
export function QuadroPrecos({ grupos, textos: T, locale }: { grupos: GrupoQuadro[]; textos: TextosQuadro; locale: string }) {
  const { grupo } = useGrupo();
  const brl = (c: number) => formatarCentavos(c, locale);
  const temCriancas = grupo.criancas6a10 + grupo.criancas0a5 > 0;
  // no computador: quatro colunas; no celular: nome, detalhes e total um embaixo do outro
  const colunas = 'lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,2fr)_minmax(0,2.6fr)_minmax(0,2fr)] lg:gap-x-6';

  return (
    <div>
      <div className={`hidden text-small text-(--tinta-suave) ${colunas} pb-3`} aria-hidden="true">
        <span>{T.colPasseio}</span>
        <span>{T.colDuracao}</span>
        <span>{T.colPreco}</span>
        <span className="pr-16 text-right">{T.colTotal}</span>
      </div>
      {grupos.map((g) => (
        <section key={g.id} aria-labelledby={`quadro-${g.id}`} className="pb-14 last:pb-0">
          <h3
            id={`quadro-${g.id}`}
            className="sticky top-0 z-10 -mx-(--margem) bg-(--fundo) px-(--margem) pb-3 pt-4 text-lead font-bold text-(--color-sol)"
          >
            {g.titulo}
          </h3>
          <ul>
            {g.itens.map((p) => {
              const orc = calcular(p.tabela, pessoasDoGrupo(grupo, p.tabela));
              const unitario = p.tabela.precoCentavos;
              const aviso = temCriancas && p.idadeMinima ? fmt(T.idadeMin, { n: p.idadeMinima }) : '';
              return (
                <li key={p.slug}>
                  <Link
                    href={p.href}
                    className={`group -mx-3 block px-3 py-3 transition-colors hover:bg-[color-mix(in_oklab,var(--tinta)_9%,var(--fundo))] lg:py-2 ${colunas} lg:items-baseline`}
                  >
                    <span className="block text-lead leading-tight transition-transform duration-300 group-hover:translate-x-1.5">
                      {p.nome}
                    </span>
                    <span className="mt-1 block text-small text-(--tinta-suave) lg:mt-0 lg:text-lead lg:text-(--tinta)">
                      <span className="lg:hidden">
                        {p.duracao} · {p.temOpcoes ? `${T.aPartirDe} ` : ''}
                        {brl(unitario)} {p.unidadeCurta}
                      </span>
                      <span className="hidden lg:inline">{p.duracao}</span>
                    </span>
                    <span className="hidden text-lead lg:inline">
                      <span className="numeros">{brl(unitario)}</span>{' '}
                      <span className="text-small text-(--tinta-suave)">
                        {p.tabela.unidade === 'pessoa' ? T.porPessoaCurto : p.unidadeCurta}
                      </span>
                    </span>
                    <span className="numeros mt-1 block font-bold lg:mt-0 lg:pr-16 lg:text-right lg:text-lead">
                      <span className="font-normal text-(--tinta-suave) lg:hidden">{T.colTotal} </span>
                      {p.temOpcoes && <span className="text-small font-normal text-(--tinta-suave)">{T.aPartirDe} </span>}
                      {brl(orc.totalCentavos)}
                      {aviso && <span className="block text-small font-normal text-(--tinta-suave)">{aviso}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
