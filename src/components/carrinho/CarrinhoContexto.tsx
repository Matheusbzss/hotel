'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Idioma } from '@/i18n/config';
import type { EscolhaItem, ItemVisivel, SugestaoVisivel } from '@/lib/carrinho';

interface Carrinho {
  itens: ItemVisivel[];
  /** Os passeios que combinam com o carrinho (no máximo 3). */
  sugestoes: SugestaoVisivel[];
  /** O carrinho guardado já chegou do servidor. */
  carregado: boolean;
  /** A gaveta está aberta. */
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  /**
   * Confere no servidor e põe no carrinho, abrindo a gaveta (a não ser com `abrir: false`). Com
   * `substituir`, troca o item que o cliente está mudando.
   */
  adicionar: (escolha: EscolhaItem, opcoes?: { abrir?: boolean; substituir?: string }) => Promise<{ ok: boolean; erro?: string }>;
  remover: (id: string) => void;
  /** Lê o carrinho de novo do servidor. */
  recarregar: () => Promise<void>;
}

/** O que a rota do carrinho responde. */
type Resposta = { ok?: boolean; erro?: string; itens?: ItemVisivel[]; sugestoes?: SugestaoVisivel[] };

const Contexto = createContext<Carrinho | null>(null);

export function useCarrinho(): Carrinho {
  const c = useContext(Contexto);
  if (!c) throw new Error('useCarrinho fora do CarrinhoProvider');
  return c;
}

/** O carrinho guardado no servidor (pelo cookie), com a gaveta que abre por cima da página. */
export function CarrinhoProvider({ idioma, children }: { idioma: Idioma; children: ReactNode }) {
  const [itens, setItens] = useState<ItemVisivel[]>([]);
  const [sugestoes, setSugestoes] = useState<SugestaoVisivel[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [aberto, setAberto] = useState(false);

  const aplicar = useCallback((j: Resposta) => {
    setItens(j.itens ?? []);
    setSugestoes(j.sugestoes ?? []);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/carrinho?idioma=${idioma}`);
      const j = (await r.json()) as Resposta;
      if (j.ok) {
        aplicar(j);
        setCarregado(true);
      }
    } catch {
      // sem rede: fica como está
    }
  }, [idioma, aplicar]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // com a gaveta aberta, a página de trás não rola; Esc fecha
  useEffect(() => {
    if (!aberto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('keydown', tecla);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const abrir = useCallback(() => setAberto(true), []);
  const fechar = useCallback(() => setAberto(false), []);

  const adicionar = useCallback(
    async (escolha: EscolhaItem, opcoes: { abrir?: boolean; substituir?: string } = {}) => {
      try {
        const r = await fetch('/api/carrinho', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ escolha, idioma, substituir: opcoes.substituir }),
        });
        const j = (await r.json().catch(() => null)) as Resposta | null;
        if (!r.ok || !j?.ok) return { ok: false, erro: j?.erro ?? 'rede' };
        aplicar(j);
        if (opcoes.abrir !== false) setAberto(true);
        return { ok: true };
      } catch {
        return { ok: false, erro: 'rede' };
      }
    },
    [idioma, aplicar],
  );

  const remover = useCallback(
    (id: string) => {
      setItens((lista) => lista.filter((i) => i.id !== id));
      fetch(`/api/carrinho?id=${encodeURIComponent(id)}&idioma=${idioma}`, { method: 'DELETE' })
        .then((r) => r.json())
        .then((j: Resposta) => j.ok && aplicar(j))
        .catch(() => null);
    },
    [idioma, aplicar],
  );

  const valor = useMemo(
    () => ({ itens, sugestoes, carregado, aberto, abrir, fechar, adicionar, remover, recarregar }),
    [itens, sugestoes, carregado, aberto, abrir, fechar, adicionar, remover, recarregar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
