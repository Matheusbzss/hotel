'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

export interface ItemExplorador {
  slug: string;
  cidade: string;
  categoria: string;
  destaque: boolean;
  card: ReactNode;
}

interface Opcao {
  valor: string;
  rotulo: string;
}

/**
 * Filtros por cidade e tipo de passeio. Os cards chegam prontos do servidor;
 * aqui só se decide quais aparecem. Os filtros ficam na URL (?cidade=…&tipo=…).
 */
export function ExploradorPasseios({
  itens,
  cidades,
  categorias,
  textos,
  somenteDestaquesSemFiltro = false,
  linkTodos,
}: {
  itens: ItemExplorador[];
  cidades: Opcao[];
  categorias: Opcao[];
  textos: {
    cidade: string;
    tipo: string;
    todas: string;
    todos: string;
    nenhum: string;
    limpar: string;
    resultado: string;
    resultados: string;
    verTodos?: string;
  };
  somenteDestaquesSemFiltro?: boolean;
  linkTodos?: string;
}) {
  const [cidade, setCidade] = useState('');
  const [tipo, setTipo] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get('cidade') ?? '';
    const t = q.get('tipo') ?? '';
    if (cidades.some((o) => o.valor === c)) setCidade(c);
    if (categorias.some((o) => o.valor === t)) setTipo(t);
  }, [cidades, categorias]);

  const atualizarUrl = (c: string, t: string) => {
    const url = new URL(window.location.href);
    c ? url.searchParams.set('cidade', c) : url.searchParams.delete('cidade');
    t ? url.searchParams.set('tipo', t) : url.searchParams.delete('tipo');
    window.history.replaceState(window.history.state, '', url);
  };

  const escolherCidade = (c: string) => {
    setCidade(c);
    atualizarUrl(c, tipo);
  };
  const escolherTipo = (t: string) => {
    setTipo(t);
    atualizarUrl(cidade, t);
  };

  const filtrando = Boolean(cidade || tipo);
  const visiveis = useMemo(
    () =>
      itens.filter((i) => {
        if (!filtrando && somenteDestaquesSemFiltro) return i.destaque;
        return (!cidade || i.cidade === cidade) && (!tipo || i.categoria === tipo);
      }),
    [itens, cidade, tipo, filtrando, somenteDestaquesSemFiltro],
  );

  const contagem = (visiveis.length === 1 ? textos.resultado : textos.resultados).replace('{n}', String(visiveis.length));

  return (
    <div>
      <div className="space-y-4">
        <fieldset className="min-w-0">
          <legend className="mb-2 font-semibold">{textos.cidade}</legend>
          <div className="sem-barra -mx-[var(--margem)] flex gap-2 overflow-x-auto px-[var(--margem)] pb-1 md:mx-0 md:flex-wrap md:px-0">
            <button type="button" className="chip" aria-pressed={cidade === ''} onClick={() => escolherCidade('')}>
              {textos.todas}
            </button>
            {cidades.map((o) => (
              <button
                key={o.valor}
                type="button"
                className="chip"
                aria-pressed={cidade === o.valor}
                onClick={() => escolherCidade(o.valor)}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0">
          <legend className="mb-2 font-semibold">{textos.tipo}</legend>
          <div className="sem-barra -mx-[var(--margem)] flex gap-2 overflow-x-auto px-[var(--margem)] pb-1 md:mx-0 md:flex-wrap md:px-0">
            <button type="button" className="chip" aria-pressed={tipo === ''} onClick={() => escolherTipo('')}>
              {textos.todos}
            </button>
            {categorias.map((o) => (
              <button key={o.valor} type="button" className="chip" aria-pressed={tipo === o.valor} onClick={() => escolherTipo(o.valor)}>
                {o.rotulo}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <p className="mt-6 text-small font-semibold" aria-live="polite">
        {filtrando || !somenteDestaquesSemFiltro ? contagem : ''}
      </p>

      {visiveis.length > 0 ? (
        <ul className="mt-4 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((i) => (
            <li key={i.slug}>{i.card}</li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 bg-areia-clara px-6 py-10">
          <p className="text-lead font-semibold">{textos.nenhum}</p>
          <button
            type="button"
            className="botao botao-tinta mt-5"
            onClick={() => {
              setCidade('');
              setTipo('');
              atualizarUrl('', '');
            }}
          >
            {textos.limpar}
          </button>
        </div>
      )}

      {linkTodos && textos.verTodos && (
        <div className="mt-10">
          <Link href={linkTodos} className="botao botao-tinta">
            {textos.verTodos}
          </Link>
        </div>
      )}
    </div>
  );
}
