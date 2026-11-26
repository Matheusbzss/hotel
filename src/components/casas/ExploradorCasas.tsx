'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';

export interface ItemCasa {
  slug: string;
  cidade: string;
  capacidade: number;
  card: ReactNode;
}

interface Opcao {
  valor: string;
  rotulo: string;
}

/**
 * Filtros por cidade e por número de pessoas: "10 pessoas" mostra as casas que recebem 10 ou mais. Os
 * cartões chegam prontos do servidor; aqui só se decide quais aparecem. Os filtros ficam na URL
 * (?cidade=…&pessoas=…). No celular a cidade também é uma lista, para as casas aparecerem logo.
 */
export function ExploradorCasas({
  itens,
  cidades,
  textos,
}: {
  itens: ItemCasa[];
  cidades: Opcao[];
  textos: {
    cidade: string;
    pessoas: string;
    todas: string;
    qualquer: string;
    /** "{n} pessoas" */
    nPessoas: string;
    nenhuma: string;
    limpar: string;
    resultado: string;
    resultados: string;
  };
}) {
  const [cidade, setCidade] = useState('');
  const [pessoas, setPessoas] = useState(0);
  const maior = Math.max(0, ...itens.map((i) => i.capacidade));
  const opcoesPessoas = Array.from({ length: Math.max(0, maior - 1) }, (_, i) => i + 2);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get('cidade') ?? '';
    const p = Number(q.get('pessoas'));
    if (cidades.some((o) => o.valor === c)) setCidade(c);
    if (Number.isInteger(p) && p >= 2 && p <= maior) setPessoas(p);
  }, [cidades, maior]);

  const atualizarUrl = (c: string, p: number) => {
    const url = new URL(window.location.href);
    if (c) url.searchParams.set('cidade', c);
    else url.searchParams.delete('cidade');
    if (p) url.searchParams.set('pessoas', String(p));
    else url.searchParams.delete('pessoas');
    window.history.replaceState(window.history.state, '', url);
  };
  const escolherCidade = (c: string) => {
    setCidade(c);
    atualizarUrl(c, pessoas);
  };
  const escolherPessoas = (p: number) => {
    setPessoas(p);
    atualizarUrl(cidade, p);
  };

  const visiveis = useMemo(
    () => itens.filter((i) => (!cidade || i.cidade === cidade) && i.capacidade >= pessoas),
    [itens, cidade, pessoas],
  );
  const contagem = (visiveis.length === 1 ? textos.resultado : textos.resultados).replace('{n}', String(visiveis.length));

  const listaCidades = (
    <label className="block min-w-0">
      <span className="rotulo">{textos.cidade}</span>
      <select className="campo" value={cidade} onChange={(e) => escolherCidade(e.target.value)}>
        <option value="">{textos.todas}</option>
        {cidades.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      <div className="grid gap-4 sm:flex sm:flex-wrap sm:items-start sm:gap-8">
        {cidades.length > 1 && <div className="sm:hidden">{listaCidades}</div>}
        {cidades.length > 1 && (
          <fieldset className="hidden min-w-0 sm:block">
            <legend className="mb-2 text-small font-semibold">{textos.cidade}</legend>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="filtro" aria-pressed={cidade === ''} onClick={() => escolherCidade('')}>
                {textos.todas}
              </button>
              {cidades.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  className="filtro"
                  aria-pressed={cidade === o.valor}
                  onClick={() => escolherCidade(o.valor)}
                >
                  {o.rotulo}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {/* no computador, o rótulo e a altura iguais aos da fileira de cidades, para os dois alinharem */}
        <label className="block min-w-0 sm:w-56">
          <span className="rotulo sm:mb-2 sm:font-semibold">{textos.pessoas}</span>
          <select className="campo sm:min-h-11 sm:py-2" value={pessoas} onChange={(e) => escolherPessoas(Number(e.target.value))}>
            <option value={0}>{textos.qualquer}</option>
            {opcoesPessoas.map((n) => (
              <option key={n} value={n}>
                {textos.nPessoas.replace('{n}', String(n))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-6 text-small font-semibold sm:mt-8" aria-live="polite">
        {contagem}
      </p>

      {visiveis.length > 0 ? (
        <ul className="mt-5 grid gap-x-6 gap-y-8 sm:grid-cols-2 sm:gap-y-12 lg:grid-cols-3">
          {visiveis.map((i) => (
            <li key={i.slug}>{i.card}</li>
          ))}
        </ul>
      ) : (
        <div className="tom-superficie mt-5 px-6 py-10">
          <p className="text-lead font-semibold">{textos.nenhuma}</p>
          <button
            type="button"
            className="botao mt-5"
            onClick={() => {
              setCidade('');
              setPessoas(0);
              atualizarUrl('', 0);
            }}
          >
            {textos.limpar}
          </button>
        </div>
      )}
    </div>
  );
}
