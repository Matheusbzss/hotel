'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

export interface ItemExplorador {
  slug: string;
  cidade: string;
  categoria: string;
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
  };
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
    if (c) url.searchParams.set('cidade', c);
    else url.searchParams.delete('cidade');
    if (t) url.searchParams.set('tipo', t);
    else url.searchParams.delete('tipo');
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

  const visiveis = useMemo(
    () => itens.filter((i) => (!cidade || i.cidade === cidade) && (!tipo || i.categoria === tipo)),
    [itens, cidade, tipo],
  );

  const contagem = (visiveis.length === 1 ? textos.resultado : textos.resultados).replace('{n}', String(visiveis.length));

  const linha = (titulo: string, todos: string, opcoes: Opcao[], valor: string, escolher: (v: string) => void) => (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-small font-semibold">{titulo}</legend>
      <div className="sem-barra -mx-(--margem) flex gap-1.5 overflow-x-auto px-(--margem) md:mx-0 md:flex-wrap md:px-0">
        <button type="button" className="filtro" aria-pressed={valor === ''} onClick={() => escolher('')}>
          {todos}
        </button>
        {opcoes.map((o) => (
          <button key={o.valor} type="button" className="filtro" aria-pressed={valor === o.valor} onClick={() => escolher(o.valor)}>
            {o.rotulo}
          </button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div>
      <div className="space-y-5">
        {linha(textos.cidade, textos.todas, cidades, cidade, escolherCidade)}
        {linha(textos.tipo, textos.todos, categorias, tipo, escolherTipo)}
      </div>

      <p className="mt-8 text-small font-semibold" aria-live="polite">
        {contagem}
      </p>

      {visiveis.length > 0 ? (
        <ul className="mt-5 grid gap-x-6 gap-y-8 sm:grid-cols-2 sm:gap-y-12 lg:grid-cols-3">
          {visiveis.map((i) => (
            <li key={i.slug}>{i.card}</li>
          ))}
        </ul>
      ) : (
        <div className="tom-claro mt-5 px-6 py-10">
          <p className="text-lead font-semibold">{textos.nenhum}</p>
          <button
            type="button"
            className="botao mt-5"
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
    </div>
  );
}
