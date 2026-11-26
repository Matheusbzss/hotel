'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Idioma } from '@/i18n/config';
import type { EscolhaItem, ItemVisivel, SugestaoVisivel } from '@/lib/carrinho';

/** O que o servidor respondeu ao "adicionar": na casa recusada pelas noites, as noites ocupadas de agora. */
export interface ResultadoDoAdicionar {
  ok: boolean;
  erro?: string;
  /**
   * Só na casa recusada pelas noites ('ocupada', 'fim-de-semana', 'pacote' e 'minimo'): as noites ocupadas de agora, para o
   * calendário da página se atualizar.
   */
  ocupadas?: string[];
}

interface Carrinho {
  itens: ItemVisivel[];
  /** Os passeios que combinam com o carrinho (no máximo 3). */
  sugestoes: SugestaoVisivel[];
  /** O carrinho guardado já chegou do servidor. */
  carregado: boolean;
  /**
   * A reserva das casas vale para este visitante (o interruptor RESERVA_CASAS e o pagamento online, decididos no servidor):
   * é por aqui que o botão da página da casa, que é estática, aparece para o admin no modo 'admin'. undefined até o
   * carrinho chegar do servidor (aí vale o que a página trouxe).
   */
  casasAbertas?: boolean;
  /**
   * As noites presas pelo próprio pedido do visitante, por casa (o slug): a página da casa as trata como livres para ele
   * (o "Mudar" com o pedido esperando o pagamento).
   */
  noitesDoPedido: Readonly<Record<string, string[]>>;
  /** A gaveta está aberta. */
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  /**
   * Confere no servidor e põe no carrinho, abrindo a gaveta (a não ser com `abrir: false`). Com
   * `substituir`, troca o item que o cliente está mudando.
   */
  adicionar: (escolha: EscolhaItem, opcoes?: { abrir?: boolean; substituir?: string }) => Promise<ResultadoDoAdicionar>;
  remover: (id: string) => void;
  /** Lê o carrinho de novo do servidor. */
  recarregar: () => Promise<void>;
}

/** O que a rota do carrinho responde. */
type Resposta = {
  ok?: boolean;
  erro?: string;
  itens?: ItemVisivel[];
  sugestoes?: SugestaoVisivel[];
  casasAbertas?: boolean;
  noitesDoPedido?: Record<string, string[]>;
  ocupadas?: unknown;
};

const SEM_NOITES: Readonly<Record<string, string[]>> = {};

const Contexto = createContext<Carrinho | null>(null);

export function useCarrinho(): Carrinho {
  const c = useContext(Contexto);
  if (!c) throw new Error('useCarrinho fora do CarrinhoProvider');
  return c;
}

/** As noites que vieram na recusa, só as datas AAAA-MM-DD (nada mais vai para o calendário). */
const noitesDaResposta = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n)) : undefined;

/** O carrinho guardado no servidor (pelo cookie), com a gaveta que abre por cima da página. */
export function CarrinhoProvider({ idioma, children }: { idioma: Idioma; children: ReactNode }) {
  const [itens, setItens] = useState<ItemVisivel[]>([]);
  const [sugestoes, setSugestoes] = useState<SugestaoVisivel[]>([]);
  const [casasAbertas, setCasasAbertas] = useState<boolean | undefined>(undefined);
  const [noitesDoPedido, setNoitesDoPedido] = useState<Readonly<Record<string, string[]>>>(SEM_NOITES);
  const [carregado, setCarregado] = useState(false);
  const [aberto, setAberto] = useState(false);

  const aplicar = useCallback((j: Resposta) => {
    setItens(j.itens ?? []);
    setSugestoes(j.sugestoes ?? []);
    if (typeof j.casasAbertas === 'boolean') setCasasAbertas(j.casasAbertas);
    setNoitesDoPedido(j.noitesDoPedido ?? SEM_NOITES);
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
    async (escolha: EscolhaItem, opcoes: { abrir?: boolean; substituir?: string } = {}): Promise<ResultadoDoAdicionar> => {
      try {
        const r = await fetch('/api/carrinho', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ escolha, idioma, substituir: opcoes.substituir }),
        });
        const j = (await r.json().catch(() => null)) as Resposta | null;
        if (!r.ok || !j?.ok) {
          // a casa recusada pelas noites traz as noites de agora, para o calendário da página se atualizar
          const ocupadas = noitesDaResposta(j?.ocupadas);
          if (ocupadas) return { ok: false, erro: j?.erro ?? 'rede', ocupadas };
          return { ok: false, erro: j?.erro ?? 'rede' };
        }
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
    () => ({ itens, sugestoes, carregado, casasAbertas, noitesDoPedido, aberto, abrir, fechar, adicionar, remover, recarregar }),
    [itens, sugestoes, carregado, casasAbertas, noitesDoPedido, aberto, abrir, fechar, adicionar, remover, recarregar],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
