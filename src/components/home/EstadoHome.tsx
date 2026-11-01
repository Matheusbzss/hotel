'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Cidade } from '@/data/passeios';

/**
 * O que o boletim, o mapa e a cena 3D da página inicial compartilham: a cidade filtrada no boletim,
 * o passeio escolhido (barra de reserva) e o pino aberto no mapa. O pino não filtra o boletim lá em cima:
 * mudar a altura da página acima do mapa faria a tela pular.
 */
interface ValorEstado {
  cidade: Cidade | null;
  escolherCidade: (c: Cidade | null) => void;
  escolhido: string | null;
  escolher: (slug: string | null) => void;
  pino: Cidade | null;
  escolherPino: (c: Cidade | null) => void;
}

const Contexto = createContext<ValorEstado>({
  cidade: null,
  escolherCidade: () => {},
  escolhido: null,
  escolher: () => {},
  pino: null,
  escolherPino: () => {},
});

export function EstadoHomeProvider({ children }: { children: ReactNode }) {
  const [cidade, escolherCidade] = useState<Cidade | null>(null);
  const [escolhido, escolher] = useState<string | null>(null);
  const [pino, escolherPino] = useState<Cidade | null>(null);
  const valor = useMemo(() => ({ cidade, escolherCidade, escolhido, escolher, pino, escolherPino }), [cidade, escolhido, pino]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useEstadoHome = () => useContext(Contexto);
