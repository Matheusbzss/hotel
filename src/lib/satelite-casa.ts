import path from 'node:path';
import sharp from 'sharp';
import litoral from '@/data/litoral.json';
import relevo from '@/data/relevo.json';
import { RAIO_CIRCULO_M, type Ponto } from './circulo-casa';

/**
 * O mapa da localização aproximada de uma casa: um recorte da foto de satélite do mapa da página
 * inicial (Copernicus Sentinel-2, cerca de 11 m por ponto) em volta do CENTRO PÚBLICO do círculo (casas.centro_lat e
 * casas.centro_lng, deslocado do ponto da casa: src/lib/circulo-casa.ts). Nada é desenhado: é a própria foto,
 * ampliada; o círculo da área vai por cima, na página, no meio do recorte.
 */
export const LARGURA_RECORTE_M = 4000;
export const ALTURA_RECORTE_M = 3000;
/** O círculo da área tem 500 m de raio (1 km de diâmetro): 25% da largura do recorte. */
export const DIAMETRO_CIRCULO_M = 2 * RAIO_CIRCULO_M;

/** Mesma conta de scripts/gerar-satelite.mjs: metros a leste e ao norte do centro do mapa. */
const KX = 111320 * Math.cos((litoral.centro.lat * Math.PI) / 180);
const KY = 110574;

const emMetros = (p: Ponto) => ({ x: (p.lng - litoral.centro.lon) * KX, y: (p.lat - litoral.centro.lat) * KY });

/**
 * O recorte inteiro em volta do centro cabe na foto? Perto da borda, o recorte encostaria nela e o círculo sairia do
 * meio da imagem: aí a página fica sem o mapa (as casas de Búzios, Cabo Frio e Arraial cabem com folga).
 */
export function centroCabeNoRecorte(centro: Ponto): boolean {
  const { x, y } = emMetros(centro);
  const c = relevo.caixa;
  return (
    x - LARGURA_RECORTE_M / 2 >= c.x0 &&
    x + LARGURA_RECORTE_M / 2 <= c.x1 &&
    y - ALTURA_RECORTE_M / 2 >= c.y0 &&
    y + ALTURA_RECORTE_M / 2 <= c.y1
  );
}

export async function recorteSatelite(centro: Ponto): Promise<Buffer> {
  const arquivo = path.join(process.cwd(), 'public', 'mapa', 'satelite-2880.webp');
  const caixa = relevo.caixa;
  const { width: W = 0, height: H = 0 } = await sharp(arquivo).metadata();
  const resX = (caixa.x1 - caixa.x0) / W;
  const resY = (caixa.y1 - caixa.y0) / H;
  const largura = Math.round(LARGURA_RECORTE_M / resX);
  const altura = Math.round(ALTURA_RECORTE_M / resY);
  const { x, y } = emMetros(centro);
  const cx = (x - caixa.x0) / resX;
  const cy = (caixa.y1 - y) / resY;
  // o centro fica no meio do recorte (quem chama confere antes com centroCabeNoRecorte)
  const left = Math.min(Math.max(0, Math.round(cx - largura / 2)), W - largura);
  const top = Math.min(Math.max(0, Math.round(cy - altura / 2)), H - altura);
  return sharp(arquivo)
    .extract({ left, top, width: largura, height: altura })
    .resize(800, 600, { kernel: 'lanczos3' })
    .webp({ quality: 80 })
    .toBuffer();
}
