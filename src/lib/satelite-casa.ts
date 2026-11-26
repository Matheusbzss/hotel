import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import litoral from '@/data/litoral.json';
import praias from '@/data/praias.json';
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

/**
 * A versão do recorte: 8 letras e números tirados do centro PÚBLICO por um resumo (sha256), do qual não se volta às
 * coordenadas. A página da casa põe a versão no endereço da foto (/mapa/casas/<slug>.webp?v=<versão>), que fica
 * guardada 1 dia pelo endereço inteiro, na Vercel e no navegador. Quando o dono muda o ponto no painel, o centro muda,
 * a página refeita pede um endereço novo, e a foto nova chega junto com os nomes das praias (sem a versão, a foto velha
 * ficava até 1 dia, com os nomes fora do lugar). O mesmo centro dá sempre a mesma versão. A rota do mapa recorta sempre
 * o centro gravado e só deixa guardar a foto pedida com a versão desse centro (src/app/mapa/casas/[arquivo]/route.ts).
 */
export const versaoDoRecorte = (centro: Ponto): string =>
  createHash('sha256').update(`${centro.lat},${centro.lng}`).digest('hex').slice(0, 8);

/** Um nome escrito por cima do recorte: a posição em % da largura e da altura da imagem. */
export interface RotuloDoMapa {
  nome: string;
  x: number;
  y: number;
}

/**
 * Os nomes das praias que caem no recorte (do OpenStreetMap, os mesmos do mapa da página inicial), para o turista se
 * achar na foto de satélite: no máximo 3, das mais perto do centro, longe da borda e sem um encostar no outro (o que
 * encostaria sobe ou desce um pouco; se nem assim couber, fica de fora). A posição é relativa ao centro PÚBLICO (o
 * mesmo que a própria imagem já mostra): não diz nada do ponto da casa.
 */
export function rotulosDoRecorte(centro: Ponto, maximo = 3): RotuloDoMapa[] {
  const { x, y } = emMetros(centro);
  const x0 = x - LARGURA_RECORTE_M / 2;
  const y1 = y + ALTURA_RECORTE_M / 2;
  const candidatos = praias.praias
    .map((p) => ({
      nome: p.nome,
      x: ((p.x - x0) / LARGURA_RECORTE_M) * 100,
      y: ((y1 - p.y) / ALTURA_RECORTE_M) * 100,
      distancia: Math.hypot(p.x - x, p.y - y),
    }))
    .filter((p) => p.x >= 18 && p.x <= 82 && p.y >= 10 && p.y <= 90)
    .sort((a, b) => a.distancia - b.distancia);
  // um nome tem até uns 38% da largura no celular e uns 8% da altura: mais perto que isso, encostam
  const encosta = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 38 && Math.abs(a.y - b.y) < 10;
  const escolhidos: RotuloDoMapa[] = [];
  for (const p of candidatos) {
    if (escolhidos.length >= maximo) break;
    const lugar = [p.y, p.y - 11, p.y + 11]
      .filter((yy) => yy >= 8 && yy <= 92)
      .map((yy) => ({ x: p.x, y: yy }))
      .find((l) => !escolhidos.some((e) => encosta(e, l)));
    if (lugar) escolhidos.push({ nome: p.nome, x: Math.round(lugar.x * 10) / 10, y: Math.round(lugar.y * 10) / 10 });
  }
  return escolhidos;
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
