import litoral from '@/data/litoral.json';
import praiasOsm from '@/data/praias.json';
import relevo from '@/data/relevo.json';
import satelite from '@/data/satelite.json';
import type { Cidade } from '@/data/passeios';

/** Onde ficam os pinos de cada cidade no mapa da página inicial (centro de cada cidade, na orla). */
const COORDENADAS: Partial<Record<Cidade, { lat: number; lon: number }>> = {
  buzios: { lat: -22.7469, lon: -41.8817 },
  'cabo-frio': { lat: -22.8889, lon: -42.0186 },
  'arraial-do-cabo': { lat: -22.9746, lon: -42.0216 },
};

/**
 * As praias que aparecem quando a cidade é escolhida no mapa (nomes do OpenStreetMap), poucas para não poluir,
 * em ordem de importância: se faltar espaço na tela, somem as do fim da lista.
 */
const PRAIAS: Partial<Record<Cidade, string[]>> = {
  buzios: ['Praia de Geribá', 'Praia da Ferradura', 'Praia João Fernandes', 'Praia Azeda', 'Praia dos Ossos', 'Praia da Tartaruga', 'Praia Brava', 'Praia de Manguinhos'],
  'arraial-do-cabo': ['Prainhas do Atalaia', 'Praia do Farol', 'Praia Grande', 'Praia dos Anjos', 'Praia do Pontal'],
  'cabo-frio': ['Praia do Forte', 'Praia do Peró', 'Praia das Conchas', 'Praia das Dunas'],
};

const { centro } = litoral;
/** A caixa do relevo e da foto de satélite detalhada (public/mapa/satelite-*.webp), em metros a partir do centro do mapa. */
export const caixaMapa = relevo.caixa;
/** A caixa da foto de satélite do entorno (public/mapa/satelite-entorno.webp), o fundo da cena 3D. */
export const entornoMapa = satelite.entorno;
const KX = 111320 * Math.cos((centro.lat * Math.PI) / 180);
const KY = 110574;

/** Posição no mapa plano, em % da largura e da altura da imagem do relevo. */
const percentual = (x: number, y: number) => ({
  esquerda: ((x - caixaMapa.x0) / (caixaMapa.x1 - caixaMapa.x0)) * 100,
  topo: ((caixaMapa.y1 - y) / (caixaMapa.y1 - caixaMapa.y0)) * 100,
});

export interface PontoMapa {
  id: string;
  /** Metros a leste e ao norte do centro do mapa (a mesma conta de scripts/gerar-litoral.mjs). */
  x: number;
  y: number;
  esquerda: number;
  topo: number;
}

export function pinosMapa(): (PontoMapa & { id: Cidade })[] {
  return (Object.entries(COORDENADAS) as [Cidade, { lat: number; lon: number }][]).map(([id, c]) => {
    const x = (c.lon - centro.lon) * KX;
    const y = (c.lat - centro.lat) * KY;
    return { id, x, y, ...percentual(x, y) };
  });
}

export function praiasMapa(): (PontoMapa & { cidade: Cidade })[] {
  const ordem = (p: { nome: string; cidade: string }) => PRAIAS[p.cidade as Cidade]?.indexOf(p.nome) ?? -1;
  return praiasOsm.praias
    .filter((p) => ordem(p) >= 0)
    .sort((a, b) => ordem(a) - ordem(b))
    .map((p) => ({ id: p.nome, x: p.x, y: p.y, cidade: p.cidade as Cidade, ...percentual(p.x, p.y) }));
}
