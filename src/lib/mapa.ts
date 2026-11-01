import litoral from '@/data/litoral.json';
import type { Cidade } from '@/data/passeios';

/** Onde ficam os pinos de cada cidade no mapa da página inicial (centro de cada cidade, na orla). */
const COORDENADAS: Partial<Record<Cidade, { lat: number; lon: number }>> = {
  buzios: { lat: -22.7469, lon: -41.8817 },
  'cabo-frio': { lat: -22.8889, lon: -42.0186 },
  'arraial-do-cabo': { lat: -22.9746, lon: -42.0216 },
};

const { centro } = litoral;
/** Recorte do mapa plano (metros a partir do centro): a faixa de Arraial a Búzios. O litoral.json vai além. */
const caixa = { x0: -14874, x1: 14874, y0: -17692, y1: 17692 };
const KX = 111320 * Math.cos((centro.lat * Math.PI) / 180);
const KY = 110574;

export interface PinoMapa {
  id: Cidade;
  /** Metros a leste e ao norte do centro do mapa (a mesma conta de scripts/gerar-litoral.mjs). */
  x: number;
  y: number;
  /** Posição no mapa plano, em % da largura e da altura. */
  esquerda: number;
  topo: number;
}

export function pinosMapa(): PinoMapa[] {
  return (Object.entries(COORDENADAS) as [Cidade, { lat: number; lon: number }][]).map(([id, c]) => {
    const x = (c.lon - centro.lon) * KX;
    const y = (c.lat - centro.lat) * KY;
    return {
      id,
      x,
      y,
      esquerda: ((x - caixa.x0) / (caixa.x1 - caixa.x0)) * 100,
      topo: ((caixa.y1 - y) / (caixa.y1 - caixa.y0)) * 100,
    };
  });
}

/** O contorno da terra como caminho SVG, na caixa do mapa (largura 1000). */
export function caminhoTerra(): { d: string; largura: number; altura: number } {
  const largura = 1000;
  const altura = Math.round((largura * (caixa.y1 - caixa.y0)) / (caixa.x1 - caixa.x0));
  const sx = (x: number) => (((x - caixa.x0) / (caixa.x1 - caixa.x0)) * largura).toFixed(1);
  const sy = (y: number) => (((caixa.y1 - y) / (caixa.y1 - caixa.y0)) * altura).toFixed(1);
  const d = (litoral.terra as [number, number][][]).map((anel) => `M${anel.map(([x, y]) => `${sx(x)} ${sy(y)}`).join('L')}Z`).join('');
  return { d, largura, altura };
}
