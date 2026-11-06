/**
 * Gera o relevo do mapa da página inicial a partir de dados públicos de elevação (Terrain Tiles da AWS,
 * formato terrarium, com SRTM) e do litoral do OpenStreetMap (src/data/litoral.json):
 *   public/mapa/altura.png   altura em decímetros nos canais R e G (h = (R * 256 + G) / 10 - 50)
 *   src/data/relevo.json     a caixa coberta, em metros a partir do centro do mapa
 * A cor do terreno não sai daqui: é a foto de satélite de scripts/gerar-satelite.mjs.
 * Uso: node scripts/gerar-relevo.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const Z = 12;
const CAIXA = { sul: -23.06, oeste: -42.16, norte: -22.66, leste: -41.84 };
const ESCALA_MASCARA = 1.75; // máscara do litoral um pouco mais fina que a grade de elevação

const litoral = JSON.parse(await readFile(new URL('../src/data/litoral.json', import.meta.url), 'utf8'));
const { lagoas } = JSON.parse(await readFile(new URL('../src/data/lagoas.json', import.meta.url), 'utf8'));
const { centro } = litoral;
const KX = 111320 * Math.cos((centro.lat * Math.PI) / 180);
const KY = 110574;

const MUNDO = 256 * 2 ** Z;
const px = (lon) => ((lon + 180) / 360) * MUNDO;
const py = (lat) => ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * MUNDO;
const latDe = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / MUNDO))) * 180) / Math.PI;

const X0 = Math.floor(px(CAIXA.oeste));
const X1 = Math.ceil(px(CAIXA.leste));
const Y0 = Math.floor(py(CAIXA.norte));
const Y1 = Math.ceil(py(CAIXA.sul));
const W = X1 - X0;
const H = Y1 - Y0;

// 1. baixa os ladrilhos e monta a grade de elevação (metros; negativo no mar)
const elev = new Float32Array(W * H);
const tiles = [];
for (let tx = Math.floor(X0 / 256); tx <= Math.floor((X1 - 1) / 256); tx++)
  for (let ty = Math.floor(Y0 / 256); ty <= Math.floor((Y1 - 1) / 256); ty++) tiles.push([tx, ty]);
console.log(`${tiles.length} ladrilhos de elevação, grade ${W} x ${H}`);
async function baixar([tx, ty]) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const r = await fetch(url);
    if (r.ok) {
      const { data } = await sharp(Buffer.from(await r.arrayBuffer())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let j = 0; j < 256; j++)
        for (let i = 0; i < 256; i++) {
          const gx = tx * 256 + i - X0;
          const gy = ty * 256 + j - Y0;
          if (gx < 0 || gy < 0 || gx >= W || gy >= H) continue;
          const k = (j * 256 + i) * 4;
          elev[gy * W + gx] = data[k] * 256 + data[k + 1] + data[k + 2] / 256 - 32768;
        }
      return;
    }
  }
  throw new Error(`não baixou ${url}`);
}
for (let i = 0; i < tiles.length; i += 6) await Promise.all(tiles.slice(i, i + 6).map(baixar));

// 2. máscara de terra pelo litoral do OpenStreetMap (o mar e as lagoas ficam no nível zero)
const TW = Math.round(W * ESCALA_MASCARA);
const TH = Math.round(H * ESCALA_MASCARA);
const paraPixel = ([x, y]) => {
  const lon = x / KX + centro.lon;
  const lat = y / KY + centro.lat;
  return [((px(lon) - X0) * ESCALA_MASCARA).toFixed(1), ((py(lat) - Y0) * ESCALA_MASCARA).toFixed(1)];
};
const caminhos = litoral.terra.map((anel) => `M${anel.map((p) => paraPixel(p).join(' ')).join('L')}Z`).join('');
// as lagoas (Araruama e vizinhas) são água dentro da terra
const caminhosLagoas = lagoas.map((anel) => `M${anel.map((p) => paraPixel(p).join(' ')).join('L')}Z`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}"><rect width="100%" height="100%" fill="#000"/><path d="${caminhos}" fill="#fff"/><path d="${caminhosLagoas}" fill="#000"/></svg>`;
// um canal só (o SVG vem com transparência; sem tirá-la, os pixels saem desalinhados)
const umCanal = async (img) => {
  const { data, info } = await img.removeAlpha().extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || data.length !== TW * TH) throw new Error(`máscara com ${info.channels} canais`);
  return data;
};
const mascara = await umCanal(sharp(Buffer.from(svg)));
const fina = await umCanal(sharp(mascara, { raw: { width: TW, height: TH, channels: 1 } }).blur(1.6));

// 3. elevação em qualquer ponto da grade (bilinear)
function altura(gx, gy) {
  const x = Math.min(W - 1.001, Math.max(0, gx));
  const y = Math.min(H - 1.001, Math.max(0, gy));
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const a = elev[j * W + i];
  const b = elev[j * W + i + 1];
  const c = elev[(j + 1) * W + i];
  const d = elev[(j + 1) * W + i + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

// 4. altura (terra só onde o litoral diz que é terra; mar fica em zero) para o 3D
await mkdir(new URL('../public/mapa/', import.meta.url), { recursive: true });
const AW = 256;
const AH = Math.round((AW * H) / W);
const alturaPng = Buffer.alloc(AW * AH * 3);
for (let y = 0; y < AH; y++)
  for (let x = 0; x < AW; x++) {
    const tx = Math.min(TW - 1, Math.round((x / (AW - 1)) * (TW - 1)));
    const ty = Math.min(TH - 1, Math.round((y / (AH - 1)) * (TH - 1)));
    const terra = fina[ty * TW + tx] / 255;
    const h = Math.max(0, altura((x / (AW - 1)) * (W - 1), (y / (AH - 1)) * (H - 1))) * terra;
    const v = Math.round((h + 50) * 10);
    const k = (y * AW + x) * 3;
    alturaPng[k] = v >> 8;
    alturaPng[k + 1] = v & 255;
  }
await sharp(alturaPng, { raw: { width: AW, height: AH, channels: 3 } })
  .png()
  .toFile(new URL('../public/mapa/altura.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));

// 5. a caixa coberta, em metros a partir do centro (a mesma conta do litoral)
const metros = (lon, lat) => [(lon - centro.lon) * KX, (lat - centro.lat) * KY];
const [x0, y1] = metros(X0 / MUNDO * 360 - 180, latDe(Y0));
const [x1, y0] = metros(X1 / MUNDO * 360 - 180, latDe(Y1));
await writeFile(
  new URL('../src/data/relevo.json', import.meta.url),
  JSON.stringify({
    fonte: 'Terrain Tiles da AWS (terrarium, SRTM) e litoral do OpenStreetMap (© colaboradores do OpenStreetMap, ODbL).',
    caixa: { x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1) },
    altura: { largura: AW, altura: AH, decodificar: 'h = (R * 256 + G) / 10 - 50' },
  }),
);
console.log(`altura.png ${AW}x${AH}`);
