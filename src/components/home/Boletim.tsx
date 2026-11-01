'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Cidade } from '@/data/passeios';
import { fmt } from '@/i18n/config';
import type { ItemBoletim } from '@/lib/boletim';
import { calcular } from '@/lib/orcamento';
import { textoPessoas, type RotulosPessoas } from '@/lib/pessoas';
import { Cifra, formatarCifra } from '../Cifra';
import { pessoasDoGrupo, totalPessoas, useGrupo, type Grupo } from '../grupo/GrupoContexto';
import { SeletorGrupo, type TextosSeletorGrupo } from '../grupo/SeletorGrupo';
import { useEstadoHome } from './EstadoHome';

export interface TextosBoletim {
  titulo: string;
  filtroCidades: string;
  todas: string;
  colPasseio: string;
  colCidade: string;
  colHoras: string;
  colPreco: string;
  colCriancas: string;
  colTotal: string;
  desde: string;
  escolha: string;
  detalhes: string;
  reservar: string;
  nomeLinha: string;
  legenda: string;
  faixas: string[];
  nota: string;
  vazio: string;
  totalPara: string;
  idadeMin: string;
  rotulos: RotulosPessoas;
  grupo: TextosSeletorGrupo;
}

const FAIXAS = ['d1', 'd2', 'd3', 'd4', 'd5'] as const;
/** Classes inteiras (o Tailwind só gera o que encontra escrito por extenso). */
export const FUNDO_FAIXA: Record<(typeof FAIXAS)[number], string> = {
  d1: 'bg-(--color-d1)',
  d2: 'bg-(--color-d2)',
  d3: 'bg-(--color-d3)',
  d4: 'bg-(--color-d4)',
  d5: 'bg-(--color-d5)',
};

export const resumoGrupo = (g: Grupo, r: RotulosPessoas) =>
  textoPessoas({ adultos: g.adultos, criancasMeia: g.criancas6a10, criancasGratis: g.criancas0a5 }, r);

export function dataCurta(ymd: string, locale: string): string {
  if (!ymd) return '';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
}

export function linkCheckout(item: ItemBoletim, g: Grupo): string {
  const p = pessoasDoGrupo(g, item.tabela);
  const q = new URLSearchParams({ adultos: String(p.adultos), meia: String(p.criancasMeia), gratis: String(p.criancasGratis) });
  if (g.data) q.set('data', g.data);
  return `${item.checkoutHref}?${q.toString()}`;
}

/** As linhas do boletim: nome, horas (a cor diz quanto do dia ocupa) e o total do grupo. */
export function LinhasBoletim({
  itens,
  textos: T,
  locale,
  agrupar,
  nomesCidades,
  mostrarCidade = false,
}: {
  itens: ItemBoletim[];
  textos: TextosBoletim;
  locale: string;
  agrupar: boolean;
  nomesCidades: Partial<Record<Cidade, string>>;
  /** Coluna da cidade (no computador): só quando a lista mistura cidades sem agrupar. */
  mostrarCidade?: boolean;
}) {
  const { grupo } = useGrupo();
  const { escolhido, escolher } = useEstadoHome();
  const pessoas = resumoGrupo(grupo, T.rotulos);
  const temCriancas = grupo.criancas6a10 + grupo.criancas0a5 > 0;

  const grupos = useMemo(() => {
    if (!agrupar) return [{ cidade: null as Cidade | null, itens }];
    const mapa = new Map<Cidade, ItemBoletim[]>();
    for (const i of itens) mapa.set(i.cidade, [...(mapa.get(i.cidade) ?? []), i]);
    return [...mapa.entries()].map(([cidade, lista]) => ({ cidade: cidade as Cidade | null, itens: lista }));
  }, [itens, agrupar]);

  let indice = 0;
  return (
    <div className="grid gap-5">
      {grupos.map((g) => (
        <div key={g.cidade ?? 'todas'}>
          {g.cidade && <h3 className="subtitulo mb-2 text-[1.25rem]">{nomesCidades[g.cidade]}</h3>}
          <ul className="grid gap-(--vao-celula)">
            {g.itens.map((i) => {
              const total = calcular(i.tabela, pessoasDoGrupo(grupo, i.tabela)).totalCentavos;
              const estado = escolhido === null ? 'normal' : escolhido === i.slug ? 'escolhida' : 'alternativa';
              const atraso = Math.min(indice++, 9) * 40;
              const aviso = temCriancas && i.idadeMinima ? fmt(T.idadeMin, { n: i.idadeMinima }) : '';
              return (
                <li key={i.slug}>
                  <button
                    type="button"
                    className="fila"
                    data-estado={estado}
                    data-cidade={mostrarCidade ? 'sim' : 'nao'}
                    aria-pressed={escolhido === i.slug}
                    aria-label={fmt(T.nomeLinha, {
                      passeio: i.nome,
                      cidade: i.cidadeNome,
                      horas: i.horas,
                      total: `${i.temOpcoes ? `${T.desde} ` : ''}${formatarCifra(total, locale)}`,
                      pessoas,
                    })}
                    onClick={() => escolher(escolhido === i.slug ? null : i.slug)}
                  >
                    <span className="celula fila-nome">
                      <span className="fila-titulo">{i.nome}</span>
                      <span className="fila-sub md:hidden">{i.paraQuem}</span>
                    </span>
                    {mostrarCidade && <span className="celula fila-texto hidden md:flex">{i.cidadeNome}</span>}
                    <span className={`fila-horas ${FUNDO_FAIXA[i.faixa]}`}>{i.horas}</span>
                    <span className="celula fila-texto hidden md:flex">{i.paraQuem}</span>
                    <span className="celula fila-texto hidden lg:flex">{i.criancas}</span>
                    <span className="celula fila-total">
                      {i.temOpcoes && <span className="fila-sub">{T.desde}</span>}
                      <Cifra centavos={total} locale={locale} atraso={atraso} className="cifra text-figure" />
                      {aviso && <span className="fila-sub">{aviso}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Cabeçalhos curtos das colunas (só visuais: cada linha já diz tudo ao leitor de tela). */
export function Colunas({ T, pessoas, mostrarCidade = false }: { T: TextosBoletim; pessoas: string; mostrarCidade?: boolean }) {
  return (
    <div className="fila-colunas coluna" aria-hidden="true" data-cidade={mostrarCidade ? 'sim' : 'nao'}>
      <span>{T.colPasseio}</span>
      {mostrarCidade && <span className="hidden md:block">{T.colCidade}</span>}
      <span className="text-center">{T.colHoras}</span>
      <span className="hidden md:block">{T.colPreco}</span>
      <span className="hidden lg:block">{T.colCriancas}</span>
      <span className="text-right">
        {T.colTotal} <span className="sr-only md:not-sr-only">· {pessoas}</span>
      </span>
    </div>
  );
}

export function LegendaDuracao({ T }: { T: TextosBoletim }) {
  return (
    <div className="mt-6">
      <p className="text-caption text-(--tinta-suave)">{T.legenda}</p>
      <ul className="mt-2 grid grid-cols-5 gap-(--vao-celula)">
        {FAIXAS.map((f, i) => (
          <li
            key={f}
            className={`rounded-[4px] px-1 py-1.5 text-center font-[family-name:var(--font-semi)] text-caption font-semibold text-(--color-tinta) ${FUNDO_FAIXA[f]}`}
          >
            {T.faixas[i]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O boletim principal da página inicial: data, grupo, cidade e as linhas com o total de cada passeio. */
export function Boletim({
  itens,
  cidades,
  textos: T,
  locale,
}: {
  itens: ItemBoletim[];
  cidades: { id: Cidade; nome: string }[];
  textos: TextosBoletim;
  locale: string;
}) {
  const { grupo } = useGrupo();
  const { cidade, escolherCidade } = useEstadoHome();
  const filtrados = cidade ? itens.filter((i) => i.cidade === cidade) : itens;
  const nomes = Object.fromEntries(cidades.map((c) => [c.id, c.nome]));
  const pessoas = resumoGrupo(grupo, T.rotulos);

  return (
    <section id="boletim" aria-labelledby="boletim-titulo" className="scroll-mt-4">
      <h2 id="boletim-titulo" className="subtitulo">
        {T.titulo}
      </h2>
      <SeletorGrupo className="mt-4" textos={T.grupo} />
      <div role="group" aria-label={T.filtroCidades} className="sem-barra -mx-(--margem) mt-4 flex gap-(--vao-celula) overflow-x-auto px-(--margem)">
        <button type="button" className="filtro" aria-pressed={cidade === null} onClick={() => escolherCidade(null)}>
          {T.todas}
        </button>
        {cidades.map((c) => (
          <button key={c.id} type="button" className="filtro" aria-pressed={cidade === c.id} onClick={() => escolherCidade(c.id)}>
            {c.nome}
          </button>
        ))}
      </div>
      <p className="mt-4 text-small text-(--tinta-suave)" aria-live="polite">
        {T.escolha} <span className="font-semibold text-(--tinta)">{fmt(T.totalPara, { pessoas })}</span>
      </p>
      <Colunas T={T} pessoas={pessoas} />
      {filtrados.length ? (
        <LinhasBoletim itens={filtrados} textos={T} locale={locale} agrupar={cidade === null} nomesCidades={nomes} />
      ) : (
        <p className="celula mt-2 p-4">{T.vazio}</p>
      )}
      <LegendaDuracao T={T} />
      <p className="mt-4 text-caption text-(--tinta-suave)">{T.nota}</p>
    </section>
  );
}

/** Barra fixa embaixo: aparece quando um passeio é escolhido, com o total e o caminho para reservar. */
export function BarraReserva({ itens, textos: T, locale }: { itens: ItemBoletim[]; textos: TextosBoletim; locale: string }) {
  const { grupo } = useGrupo();
  const { escolhido } = useEstadoHome();
  const item = itens.find((i) => i.slug === escolhido);
  if (!item) return null;
  const total = calcular(item.tabela, pessoasDoGrupo(grupo, item.tabela)).totalCentavos;
  const resumo = [resumoGrupo(grupo, T.rotulos), dataCurta(grupo.data, locale)].filter(Boolean).join(', ');
  return (
    <div className="barra-reserva tom-campo" role="region" aria-label={T.reservar}>
      <div className="moldura grid gap-2 py-3 md:flex md:items-center md:gap-4">
        <div className="flex min-w-0 flex-1 items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold">{item.nome}</p>
            <p className="text-caption text-(--tinta-suave)">
              {resumo}
              {totalPessoas(grupo) > 0 && item.temOpcoes ? ` · ${T.desde}` : ''}
            </p>
          </div>
          <Cifra centavos={total} locale={locale} className="cifra shrink-0 text-figure-lg" />
        </div>
        <div className="grid grid-cols-[1fr_1.4fr] gap-2 md:flex md:shrink-0">
          <Link href={item.href} className="botao botao-vazado">
            {T.detalhes}
          </Link>
          <Link href={linkCheckout(item, grupo)} className="botao" data-evento="InitiateCheckout">
            {T.reservar}
          </Link>
        </div>
      </div>
    </div>
  );
}
