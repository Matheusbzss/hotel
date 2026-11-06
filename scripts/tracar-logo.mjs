/**
 * Mede a logo dos banners (banner-orla-nativa-1.png, traço azul sobre o céu claro) para a logo em SVG:
 * as bordas de cima e de baixo da serra em cada coluna, o círculo do sol, a serra clara que corta o sol
 * e o fio dourado que sai dele.
 * Uso: node scripts/tracar-logo.mjs <banner-1.png> <saida.json>
 * O resultado alimenta scripts/gerar-logo.mjs; o banner em si não entra no site.
 */
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const [entrada, saida] = process.argv.slice(2);
// a área do símbolo no banner (1672 x 940), antes de começar o nome
const AREA = { x0: 735, x1: 1030, y0: 100, y1: 199 };

const { data, info } = await sharp(entrada).raw().toBuffer({ resolveWithObject: true });
const cor = (x, y) => {
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
};
const luz = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ehDourado = ([r, g, b]) => r > 200 && r - b > 70 && g > 140 && g < 215;
const ehCeu = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) < 40 && luz([r, g, b]) > 150;

// serra: em cada coluna, o trecho escuro (com a borda no meio do caminho entre o azul e o fundo)
const LIMIAR = 118;
const serra = [];
for (let x = AREA.x0; x <= AREA.x1; x++) {
  let topo = null;
  let base = null;
  for (let y = AREA.y0; y < AREA.y1; y++) {
    const a = luz(cor(x, y));
    const b = luz(cor(x, y + 1));
    if (topo === null && a >= LIMIAR && b < LIMIAR) topo = y + (a - LIMIAR) / (a - b);
    if (topo !== null && a < LIMIAR && b >= LIMIAR) {
      base = y + (LIMIAR - a) / (b - a);
      break;
    }
  }
  if (topo !== null && base !== null && base - topo > 0.6) serra.push([x, +topo.toFixed(2), +base.toFixed(2)]);
}

// sol: pontos da borda dourada que encostam no céu, e o círculo que passa melhor por eles
const bordaSol = [];
for (let y = AREA.y0; y < AREA.y1; y++) {
  for (let x = 840; x < 980; x++) {
    if (!ehDourado(cor(x, y))) continue;
    const vizinhos = [cor(x - 1, y), cor(x + 1, y), cor(x, y - 1), cor(x, y + 1)];
    if (vizinhos.some(ehCeu)) bordaSol.push([x, y]);
  }
}
function circulo(pts) {
  // ajuste algébrico (Kasa): x² + y² + Dx + Ey + F = 0
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0;
  for (const [x, y] of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z;
  }
  const n = pts.length;
  const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const B = [-sxz, -syz, -sz];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det(A);
  const col = (i) => A.map((linha, k) => linha.map((v, j) => (j === i ? B[k] : v)));
  const [D, E, F] = [0, 1, 2].map((i) => det(col(i)) / d);
  const cx = -D / 2, cy = -E / 2;
  return { cx: +cx.toFixed(2), cy: +cy.toFixed(2), r: +Math.sqrt(cx * cx + cy * cy - F).toFixed(2) };
}
const sol = circulo(bordaSol);

// serra clara por trás, que corta a parte de baixo do sol: dentro do sol, a borda onde o dourado
// (pouco azul) vira creme (muito azul), descendo do alto do sol até a serra escura
const faixa = [];
const AZUL = 150;
for (let x = Math.ceil(sol.cx - sol.r) + 2; x <= Math.floor(sol.cx + sol.r) - 1; x++) {
  const meia = Math.sqrt(sol.r * sol.r - (x - sol.cx) ** 2);
  const frente = serra.find(([sx]) => sx === x);
  const fim = Math.min(Math.floor(sol.cy + meia) - 1, frente ? Math.floor(frente[1]) - 1 : AREA.y1);
  for (let y = Math.ceil(sol.cy - meia) + 2; y < fim; y++) {
    const a = cor(x, y)[2];
    const b = cor(x, y + 1)[2];
    if (a < AZUL && b >= AZUL) {
      faixa.push([x, +(y + (AZUL - a) / (b - a)).toFixed(2)]);
      break;
    }
  }
}
const fio = [];
for (let x = 950; x <= 1025; x++) {
  const ys = [];
  for (let y = 160; y < AREA.y1; y++) if (ehDourado(cor(x, y))) ys.push(y);
  if (ys.length) fio.push([x, Math.min(...ys), Math.max(...ys) + 1]);
}

await writeFile(saida, JSON.stringify({ area: AREA, serra, sol, faixa, fio }, null, 1));
console.log(`serra: ${serra.length} colunas (x ${serra[0]?.[0]}-${serra.at(-1)?.[0]}); sol: ${JSON.stringify(sol)} com ${bordaSol.length} pontos; faixa: ${faixa.length}; fio: ${fio.length}`);
