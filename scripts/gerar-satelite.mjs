/**
 * Gera as imagens de satélite do mapa da página inicial: cor real do Copernicus Sentinel-2 (10 m por ponto),
 * lidas direto dos arquivos públicos do AWS Open Data (catálogo Earth Search, da Element 84).
 * Nada é pintado: a passagem de 18/02/2025 cobre a região e a de 16/02/2025 preenche o que fica fora da faixa
 * do satélite. Onde duas faixas se encontram, as duas imagens se misturam aos poucos (sem emenda reta).
 * O único ajuste é uma curva leve e igual para a imagem inteira, que clareia os tons médios.
 *
 * Saídas: public/mapa/satelite-2048.webp e satelite-2880.webp (a caixa do relevo, em cima do terreno 3D),
 * public/mapa/satelite-entorno.webp (90 x 90 km em volta, para o fundo da cena) e src/data/satelite.json.
 *
 * Usa geotiff e proj4 instalados fora do projeto (a pasta sentinel/ não vai para o git):
 *   mkdir -p sentinel/ferramentas && cd sentinel/ferramentas && npm init -y && npm i geotiff@2.1.3 proj4@2.12.1
 * Depois, na raiz do projeto: node scripts/gerar-satelite.mjs
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RAIZ = new URL('../', import.meta.url);
const sharp = createRequire(new URL('package.json', RAIZ))('sharp');
const ferramentas = createRequire(new URL('sentinel/ferramentas/package.json', RAIZ));
const { fromUrl } = ferramentas('geotiff');
const proj4 = ferramentas('proj4');
proj4.defs('EPSG:32723', '+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:32724', '+proj=utm +zone=24 +south +datum=WGS84 +units=m +no_defs');

const ler = (caminho) => JSON.parse(readFileSync(new URL(caminho, RAIZ), 'utf8'));
const { centro } = ler('src/data/litoral.json');
// mesma conta de scripts/gerar-litoral.mjs: metros a leste e ao norte do centro do mapa
const KX = 111320 * Math.cos((centro.lat * Math.PI) / 180);
const KY = 110574;
const DETALHE = ler('src/data/relevo.json').caixa;
const ENTORNO = { x0: -40000, x1: 50000, y0: -40000, y1: 50000 };

const STAC = 'https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/';
/** Em ordem de preferência: cada grupo é uma passagem do satélite (todos os quadrados de 110 km dela). */
const PASSAGENS = [
  {
    data: '2025-02-18',
    itens: ['S2B_23KRQ_20250218_0_L2A', 'S2B_23KQQ_20250218_0_L2A', 'S2B_24KTV_20250218_0_L2A', 'S2B_23KRR_20250218_0_L2A', 'S2B_24KTA_20250218_0_L2A', 'S2B_23KQR_20250218_0_L2A'],
  },
  {
    data: '2025-02-16',
    itens: ['S2C_23KQQ_20250216_0_L2A', 'S2C_23KQR_20250216_0_L2A', 'S2C_23KRQ_20250216_0_L2A', 'S2C_23KRR_20250216_0_L2A', 'S2C_24KTV_20250216_0_L2A', 'S2C_24KTA_20250216_0_L2A'],
  },
];
/** Quanto a mistura demora entre dois quadrados da mesma passagem e entre duas passagens (metros). */
const RAMPA_QUADRADO = 4000;
const RAMPA_PASSAGEM = 3000;
const GAMA = 0.9;
const TAMANHO = 10980;

const itens = new Map();
async function item(id) {
  if (!itens.has(id)) {
    const r = await fetch(STAC + id);
    if (!r.ok) throw new Error(`${id}: ${r.status}`);
    itens.set(id, await r.json());
  }
  return itens.get(id);
}

/** Lê um quadrado do satélite e soma, ponto a ponto, a cor (com o peso da borda) na grade de saída. */
async function amostrar(id, grade, cor, peso, fator) {
  const it = await item(id);
  const visual = it.assets.visual;
  const epsg = String(it.properties['proj:epsg'] ?? it.properties['proj:code']).replace('EPSG:', '');
  const conv = proj4('EPSG:4326', `EPSG:${epsg}`);
  const t = visual['proj:transform'];
  const tiff = await fromUrl(visual.href, { blockSize: 1 << 20 });
  let img = null;
  for (let i = 0, n = await tiff.getImageCount(); i < n; i++) {
    const nivel = await tiff.getImage(i);
    if (!img || Math.abs(nivel.getWidth() - TAMANHO / fator) < Math.abs(img.getWidth() - TAMANHO / fator)) img = nivel;
  }
  const LW = img.getWidth();
  const LH = img.getHeight();
  const passo = (10 * TAMANHO) / LW;
  const { W, H, caixa, res } = grade;

  // a projeção é suave: calcula a cada 32 pontos e interpola no meio
  const G = 32;
  const GW = Math.ceil(W / G) + 1;
  const GH = Math.ceil(H / G) + 1;
  const gc = new Float64Array(GW * GH);
  const gr = new Float64Array(GW * GH);
  let cmin = Infinity, cmax = -Infinity, rmin = Infinity, rmax = -Infinity;
  let imin = Infinity, imax = -Infinity, jmin = Infinity, jmax = -Infinity;
  for (let gj = 0; gj < GH; gj++)
    for (let gi = 0; gi < GW; gi++) {
      const x = caixa.x0 + (gi * G + 0.5) * res;
      const y = caixa.y1 - (gj * G + 0.5) * res;
      const [E, N] = conv.forward([centro.lon + x / KX, centro.lat + y / KY]);
      const c = (E - t[2]) / passo - 0.5;
      const r = (t[5] - N) / passo - 0.5;
      gc[gj * GW + gi] = c;
      gr[gj * GW + gi] = r;
      if (c > -G && r > -G && c < LW + G && r < LH + G) {
        cmin = Math.min(cmin, c); cmax = Math.max(cmax, c); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
        imin = Math.min(imin, gi); imax = Math.max(imax, gi); jmin = Math.min(jmin, gj); jmax = Math.max(jmax, gj);
      }
    }
  if (imin === Infinity) return false;
  const janela = [
    Math.max(0, Math.floor(cmin) - 1),
    Math.max(0, Math.floor(rmin) - 1),
    Math.min(LW, Math.ceil(cmax) + 2),
    Math.min(LH, Math.ceil(rmax) + 2),
  ];
  if (janela[2] - janela[0] < 2 || janela[3] - janela[1] < 2) return false;
  const ras = await img.readRasters({ window: janela, interleave: true });
  const ww = janela[2] - janela[0];
  const wh = janela[3] - janela[1];
  const i0 = Math.max(0, (imin - 1) * G);
  const i1 = Math.min(W, (imax + 1) * G);
  const j0 = Math.max(0, (jmin - 1) * G);
  const j1 = Math.min(H, (jmax + 1) * G);
  let usados = 0;
  for (let j = j0; j < j1; j++) {
    const gj = Math.min(GH - 2, Math.floor(j / G));
    const fj = (j - gj * G) / G;
    for (let i = i0; i < i1; i++) {
      const gi = Math.min(GW - 2, Math.floor(i / G));
      const fi = (i - gi * G) / G;
      const k = gj * GW + gi;
      const c = (gc[k] * (1 - fi) + gc[k + 1] * fi) * (1 - fj) + (gc[k + GW] * (1 - fi) + gc[k + GW + 1] * fi) * fj;
      const r = (gr[k] * (1 - fi) + gr[k + 1] * fi) * (1 - fj) + (gr[k + GW] * (1 - fi) + gr[k + GW + 1] * fi) * fj;
      const cf = Math.floor(c);
      const rf = Math.floor(r);
      const c0 = cf - janela[0];
      const r0 = rf - janela[1];
      if (c0 < 0 || r0 < 0 || c0 + 1 >= ww || r0 + 1 >= wh) continue;
      const o00 = (r0 * ww + c0) * 3;
      const o10 = o00 + 3;
      const o01 = o00 + ww * 3;
      const o11 = o01 + 3;
      // 0,0,0 é "sem dado" (fora da faixa do satélite)
      if (!(ras[o00] | ras[o00 + 1] | ras[o00 + 2]) || !(ras[o10] | ras[o10 + 1] | ras[o10 + 2])) continue;
      if (!(ras[o01] | ras[o01 + 1] | ras[o01 + 2]) || !(ras[o11] | ras[o11 + 1] | ras[o11 + 2])) continue;
      const fx = c - cf;
      const fy = r - rf;
      const borda = Math.min(c + 0.5, LW - 0.5 - c, r + 0.5, LH - 0.5 - r) * passo;
      const w = Math.min(1, Math.max(0.001, borda / RAMPA_QUADRADO));
      const s = j * W + i;
      for (let b = 0; b < 3; b++) {
        const v = (ras[o00 + b] * (1 - fx) + ras[o10 + b] * fx) * (1 - fy) + (ras[o01 + b] * (1 - fx) + ras[o11 + b] * fx) * fy;
        cor[s * 3 + b] += v * w;
      }
      peso[s] += w;
      usados++;
    }
  }
  return usados > 0;
}

/** Distância (em pontos) de cada ponto com dado até o ponto sem dado mais próximo; a borda da grade não conta. */
function distanciaAoVazio(valido, W, H) {
  const d = new Float32Array(W * H);
  const INF = 1e9;
  for (let s = 0; s < W * H; s++) d[s] = valido[s] ? INF : 0;
  const A = 1;
  const B = Math.SQRT2;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const s = j * W + i;
      if (!d[s]) continue;
      let m = d[s];
      if (i > 0) m = Math.min(m, d[s - 1] + A);
      if (j > 0) {
        m = Math.min(m, d[s - W] + A);
        if (i > 0) m = Math.min(m, d[s - W - 1] + B);
        if (i < W - 1) m = Math.min(m, d[s - W + 1] + B);
      }
      d[s] = m;
    }
  for (let j = H - 1; j >= 0; j--)
    for (let i = W - 1; i >= 0; i--) {
      const s = j * W + i;
      if (!d[s]) continue;
      let m = d[s];
      if (i < W - 1) m = Math.min(m, d[s + 1] + A);
      if (j < H - 1) {
        m = Math.min(m, d[s + W] + A);
        if (i < W - 1) m = Math.min(m, d[s + W + 1] + B);
        if (i > 0) m = Math.min(m, d[s + W - 1] + B);
      }
      d[s] = m;
    }
  return d;
}

async function mosaico(caixa, res, fator) {
  const W = Math.round((caixa.x1 - caixa.x0) / res);
  const H = Math.round((caixa.y1 - caixa.y0) / res);
  const grade = { W, H, caixa, res };
  const soma = new Float32Array(W * H * 3);
  const alfa = new Float32Array(W * H);
  for (let p = 0; p < PASSAGENS.length; p++) {
    const ultima = p === PASSAGENS.length - 1;
    const cor = new Float32Array(W * H * 3);
    const peso = new Float32Array(W * H);
    for (const id of PASSAGENS[p].itens) {
      const t0 = Date.now();
      const usou = await amostrar(id, grade, cor, peso, fator);
      if (usou) console.log(`  ${id} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    const valido = new Uint8Array(W * H);
    for (let s = 0; s < W * H; s++) valido[s] = peso[s] > 0 ? 1 : 0;
    const dist = distanciaAoVazio(valido, W, H);
    const rampa = RAMPA_PASSAGEM / res;
    for (let s = 0; s < W * H; s++) {
      if (!valido[s] || alfa[s] >= 1) continue;
      const a = ultima ? 1 - alfa[s] : Math.min(1, dist[s] / rampa) * (1 - alfa[s]);
      for (let b = 0; b < 3; b++) soma[s * 3 + b] += (cor[s * 3 + b] / peso[s]) * a;
      alfa[s] += a;
    }
  }
  const rgb = new Uint8Array(W * H * 3);
  let vazios = 0;
  for (let s = 0; s < W * H; s++) {
    if (alfa[s] <= 0) {
      vazios++;
      continue;
    }
    for (let b = 0; b < 3; b++) rgb[s * 3 + b] = Math.round(255 * Math.pow(Math.min(255, soma[s * 3 + b] / alfa[s]) / 255, GAMA));
  }
  return { rgb, W, H, vazios };
}

const pasta = new URL('public/mapa/', RAIZ);
mkdirSync(pasta, { recursive: true });

console.log('caixa do relevo, 10 m');
const det = await mosaico(DETALHE, 10, 1);
console.log(`  ${det.W} x ${det.H}, sem dado: ${det.vazios}`);
const bruto = { raw: { width: det.W, height: det.H, channels: 3 } };
for (const largura of [2048, 2880]) {
  const destino = new URL(`satelite-${largura}.webp`, pasta);
  await sharp(Buffer.from(det.rgb), bruto).resize({ width: largura, kernel: 'lanczos3' }).webp({ quality: 74, effort: 6 }).toFile(destino.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
}

console.log('entorno, 75 m');
const ent = await mosaico(ENTORNO, 75, 8);
console.log(`  ${ent.W} x ${ent.H}, sem dado: ${ent.vazios}`);
await sharp(Buffer.from(ent.rgb), { raw: { width: ent.W, height: ent.H, channels: 3 } })
  .webp({ quality: 72, effort: 6 })
  .toFile(new URL('satelite-entorno.webp', pasta).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

writeFileSync(
  new URL('src/data/satelite.json', RAIZ),
  JSON.stringify(
    {
      fonte: 'Copernicus Sentinel-2 (ESA), cor real, 10 m',
      passagens: PASSAGENS.map((p) => p.data),
      detalhe: DETALHE,
      entorno: ENTORNO,
      vazios: { detalhe: det.vazios, entorno: ent.vazios },
    },
    null,
    2,
  ) + '\n',
);
console.log('pronto');
