'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { normalizarPessoas, type Pessoas, type TabelaPreco } from '@/lib/orcamento';

/**
 * O grupo que o visitante escolhe uma vez (data e quem vai) e que acompanha a navegação:
 * a tabela de preços, os cards e a reserva de cada passeio já abrem com ele.
 * As crianças são separadas pelas idades que mudam o preço na região: até 5 e de 6 a 10 anos.
 */
export interface Grupo {
  data: string;
  adultos: number;
  criancas6a10: number;
  criancas0a5: number;
}

export const GRUPO_INICIAL: Grupo = { data: '', adultos: 2, criancas6a10: 0, criancas0a5: 0 };

const CHAVE = 'avh-grupo';

interface ValorContexto {
  grupo: Grupo;
  alterar: (g: Partial<Grupo>) => void;
  /** true depois que o grupo salvo na sessão foi lido (evita piscar valores). */
  pronto: boolean;
}

const Contexto = createContext<ValorContexto>({ grupo: GRUPO_INICIAL, alterar: () => {}, pronto: false });

const limitar = (n: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(n)) || 0));

function sanear(g: Partial<Grupo>): Grupo {
  return {
    data: typeof g.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g.data) ? g.data : '',
    adultos: limitar(g.adultos ?? GRUPO_INICIAL.adultos, 1, 30),
    criancas6a10: limitar(g.criancas6a10, 0, 20),
    criancas0a5: limitar(g.criancas0a5, 0, 20),
  };
}

export function GrupoProvider({ children }: { children: ReactNode }) {
  const [grupo, setGrupo] = useState<Grupo>(GRUPO_INICIAL);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(CHAVE);
      if (salvo) setGrupo(sanear(JSON.parse(salvo)));
    } catch {
      // navegação privada ou armazenamento bloqueado: segue com o grupo padrão
    }
    setPronto(true);
  }, []);

  const valor = useMemo<ValorContexto>(
    () => ({
      grupo,
      pronto,
      alterar: (g) =>
        setGrupo((atual) => {
          const novo = sanear({ ...atual, ...g });
          try {
            sessionStorage.setItem(CHAVE, JSON.stringify(novo));
          } catch {
            // sem armazenamento: o grupo vale só nesta página
          }
          return novo;
        }),
    }),
    [grupo, pronto],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useGrupo = () => useContext(Contexto);

/** Converte o grupo nas faixas de preço de um passeio (quem não tem faixa própria paga inteira). */
export function pessoasDoGrupo(g: Grupo, t: TabelaPreco): Pessoas {
  return normalizarPessoas(t, { adultos: g.adultos, criancasMeia: g.criancas6a10, criancasGratis: g.criancas0a5 });
}

export const totalPessoas = (g: Grupo) => g.adultos + g.criancas6a10 + g.criancas0a5;
