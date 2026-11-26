'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { filtrarPasseios, textoDaLista, type ItemDaLista, type TextosDaLista } from '@/lib/lista-passeios';

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

interface Filtro {
  cidade: string;
  tipo: string;
  setCidade: (c: string) => void;
  setTipo: (t: string) => void;
}

const ContextoFiltro = createContext<Filtro | null>(null);

function useFiltro(): Filtro {
  const f = useContext(ContextoFiltro);
  if (!f) throw new Error('A lista de passeios precisa estar dentro do FiltroPasseios');
  return f;
}

/**
 * O filtro da lista (cidade e tipo), lido do endereço (?cidade=…&tipo=…) quando a página abre: o mesmo para a lista
 * (ExploradorPasseios) e para o texto do topo (TextoDaLista, Pacote 34), que ficam em pedaços diferentes da página.
 */
export function FiltroPasseios({ cidades, categorias, children }: { cidades: string[]; categorias: string[]; children: ReactNode }) {
  const [cidade, setCidade] = useState('');
  const [tipo, setTipo] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const c = q.get('cidade') ?? '';
    const t = q.get('tipo') ?? '';
    if (cidades.includes(c)) setCidade(c);
    if (categorias.includes(t)) setTipo(t);
  }, [cidades, categorias]);

  const valor = useMemo(() => ({ cidade, tipo, setCidade, setTipo }), [cidade, tipo]);
  return <ContextoFiltro.Provider value={valor}>{children}</ContextoFiltro.Provider>;
}

/**
 * Pacote 34 (ENT-08): o texto do topo da lista, que conta só os passeios mostrados pelo filtro (src/lib/lista-passeios.ts).
 * Sem filtro, o texto de sempre, igual ao que o servidor manda.
 */
export function TextoDaLista({
  itens,
  cidades,
  locale,
  textos,
  className = '',
}: {
  itens: ItemDaLista[];
  /** As cidades na ordem da lista, com o nome no idioma. */
  cidades: Opcao[];
  locale: string;
  textos: TextosDaLista;
  className?: string;
}) {
  const { cidade, tipo } = useFiltro();
  return <p className={className}>{textoDaLista(itens, { cidade, tipo }, cidades, locale, textos)}</p>;
}

/**
 * Filtros por cidade e tipo de passeio. Os cards chegam prontos do servidor;
 * aqui só se decide quais aparecem. Os filtros ficam na URL (?cidade=…&tipo=…).
 * No celular os filtros são duas listas lado a lado, para os passeios já aparecerem na primeira tela.
 */
export function ExploradorPasseios({
  itens,
  cidades,
  categorias,
  resumo,
  textos,
}: {
  itens: ItemExplorador[];
  cidades: Opcao[];
  categorias: Opcao[];
  /** "Total para 2 adultos · data a escolher", ao lado da contagem */
  resumo?: ReactNode;
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
  // o filtro mora no FiltroPasseios (lido do endereço quando a página abre): o texto do topo usa o mesmo
  const { cidade, tipo, setCidade, setTipo } = useFiltro();

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

  const visiveis = useMemo(() => filtrarPasseios(itens, cidade, tipo), [itens, cidade, tipo]);

  const contagem = (visiveis.length === 1 ? textos.resultado : textos.resultados).replace('{n}', String(visiveis.length));

  const linha = (titulo: string, todos: string, opcoes: Opcao[], valor: string, escolher: (v: string) => void) => (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-small font-semibold">{titulo}</legend>
      <div className="flex flex-wrap gap-1.5">
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

  const lista = (titulo: string, todos: string, opcoes: Opcao[], valor: string, escolher: (v: string) => void) => (
    <label className="block min-w-0">
      <span className="rotulo">{titulo}</span>
      <select className="campo" value={valor} onChange={(e) => escolher(e.target.value)}>
        <option value="">{todos}</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div>
      {/* uma lista por linha: lado a lado, "Arraial do Cabo" e os tipos mais longos ficavam cortados */}
      <div className="grid gap-4 sm:hidden">
        {lista(textos.cidade, textos.todas, cidades, cidade, escolherCidade)}
        {lista(textos.tipo, textos.todos, categorias, tipo, escolherTipo)}
      </div>
      <div className="hidden space-y-5 sm:block">
        {linha(textos.cidade, textos.todas, cidades, cidade, escolherCidade)}
        {linha(textos.tipo, textos.todos, categorias, tipo, escolherTipo)}
      </div>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-small sm:mt-8">
        <p className="font-semibold" aria-live="polite">
          {contagem}
        </p>
        {resumo}
      </div>

      {visiveis.length > 0 ? (
        <ul className="mt-5 grid gap-x-6 gap-y-8 sm:grid-cols-2 sm:gap-y-12 lg:grid-cols-3">
          {visiveis.map((i) => (
            <li key={i.slug}>{i.card}</li>
          ))}
        </ul>
      ) : (
        <div className="tom-superficie mt-5 px-6 py-10">
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
