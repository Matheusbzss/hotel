/**
 * Gera a logo da Orla Nativa em SVG, fiel à versão dos banners: o sol dourado atrás da serra clara,
 * a serra azul na frente, o fio dourado, a onda (afastada do "O" para não virar "QRLA") e ORLA NATIVA,
 * sem a frase. A serra, o sol e o fio vêm medidos do banner (scripts/dados/logo-traco.json, feito por
 * scripts/tracar-logo.mjs); as letras são da Cinzel 600 (Google Fonts, licença OFL), convertidas em desenho.
 *
 * Uso: node scripts/gerar-logo.mjs <pasta-com-Cinzel-600.woff> [pasta-de-saida]
 * Saída (em public/logo/, ou na pasta indicada): a logo empilhada (fundo claro e escuro), a versão
 * lado a lado do cabeçalho (claro e escuro), o símbolo e o emblema redondo, com os PNG do app e do emblema.
 * Sem pasta de saída, grava também o ícone do navegador (src/app/icon.svg), o do iPhone (src/app/apple-icon.png)
 * e o emblema do voucher em PDF (src/lib/logo-voucher.ts).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import opentype from 'opentype.js';
import sharp from 'sharp';

const [pastaFonte, saida = 'public/logo'] = process.argv.slice(2);
if (!pastaFonte) throw new Error('Informe a pasta com Cinzel-600.woff');

const traco = JSON.parse(await readFile('scripts/dados/logo-traco.json', 'utf8'));
const bruto = await readFile(path.join(pastaFonte, 'Cinzel-600.woff'));
const fonte = opentype.parse(bruto.buffer.slice(bruto.byteOffset, bruto.byteOffset + bruto.byteLength));

/** As cores: o azul é o mesmo do site (design-dna.json > color.primary); o dourado e o creme, da logo. */
const COR = {
  azul: '#063643',
  creme: '#FAE2C0',
  cremeTexto: '#F6EBD8',
  ouroClaro: '#F3CB84',
  ouro: '#DDA552',
};

// ---------------------------------------------------------------- geometria

const r2 = (n) => Math.round(n * 100) / 100;
const r1 = (n) => Math.round(n * 10) / 10;
const media = (vals, janela) =>
  vals.map((_, i) => {
    const a = Math.max(0, i - janela);
    const b = Math.min(vals.length - 1, i + janela);
    let s = 0;
    for (let k = a; k <= b; k++) s += vals[k];
    return s / (b - a + 1);
  });

/** Ramer-Douglas-Peucker: tira pontos que não mudam o desenho (erro máximo em px do banner). */
function simplificar(pts, erro) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts.at(-1);
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let maior = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len;
    if (d > maior) [maior, idx] = [d, i];
  }
  if (maior <= erro) return [pts[0], pts.at(-1)];
  return [...simplificar(pts.slice(0, idx + 1), erro).slice(0, -1), ...simplificar(pts.slice(idx), erro)];
}

/** Curva suave (Catmull-Rom em Bézier) passando pelos pontos, como continuação de um caminho. */
function curva(pts) {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

/** Forma fechada entre a borda de cima (esquerda→direita) e a de baixo (direita→esquerda). */
function entreBordas(cima, baixo) {
  return `M${r1(cima[0][0])} ${r1(cima[0][1])}${curva(cima)}L${r1(baixo[0][0])} ${r1(baixo[0][1])}${curva(baixo)}Z`;
}

/** Traço de pincel: uma linha central (Bézier cúbica) com a espessura variando ao longo dela. */
function pincelada([p0, p1, p2, p3], espessura, passos = 48) {
  const ponto = (t) => {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
  };
  const cima = [];
  const baixo = [];
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    const [x, y] = ponto(t);
    const [xa, ya] = ponto(Math.max(0, t - 0.01));
    const [xb, yb] = ponto(Math.min(1, t + 0.01));
    const len = Math.hypot(xb - xa, yb - ya) || 1;
    const [nx, ny] = [-(yb - ya) / len, (xb - xa) / len];
    const m = espessura(t) / 2;
    cima.push([x - nx * m, y - ny * m]);
    baixo.push([x + nx * m, y + ny * m]);
  }
  return entreBordas(cima, baixo.reverse());
}

// a serra azul da frente: as bordas medidas no banner, suavizadas, com as pontas afinando até zero
const xs = traco.serra.map(([x]) => x);
const topo = media(traco.serra.map(([, t]) => t), 2);
const base = media(traco.serra.map(([, , b]) => b), 2);
const meio = (i) => (topo[i] + base[i]) / 2;
const pontaEsq = [xs[0] - 7, meio(0) + 3.2];
const pontaDir = [xs.at(-1) + 7, meio(xs.length - 1) + 0.3];
const serraCima = simplificar([pontaEsq, ...xs.map((x, i) => [x, topo[i]]), pontaDir], 0.12);
const serraBaixo = simplificar([pontaDir, ...xs.map((x, i) => [x, base[i]]).reverse(), pontaEsq], 0.12);
const SERRA = entreBordas(serraCima, serraBaixo.slice(0, -1));

// o sol e a serra clara que corta a parte de baixo dele (recortada no círculo do sol)
const SOL = traco.sol;
const bordaClara = simplificar(
  traco.faixa.map(([x, y], i, a) => [x, media(a.map(([, v]) => v), 1)[i]]),
  0.1,
);
const SERRA_CLARA = `M${r2(SOL.cx - SOL.r - 2)} ${r2(bordaClara[0][1])}L${r2(bordaClara[0][0])} ${r2(bordaClara[0][1])}${curva(bordaClara)}L${r2(SOL.cx + SOL.r + 2)} ${r2(bordaClara.at(-1)[1] + 3)}L${r2(SOL.cx + SOL.r + 2)} ${r2(SOL.cy + SOL.r + 2)}L${r2(SOL.cx - SOL.r - 2)} ${r2(SOL.cy + SOL.r + 2)}Z`;

// o fio dourado: sai da borda da serra clara, ainda dentro do sol, e segue para a direita afinando
// (linha central e espessura acompanham o fio medido no banner, sem os degraus dos pixels)
const FIO = pincelada([[928, 171.2], [955, 175.9], [984, 180.1], [1013, 181.5]], (t) => 3.4 * (1 - t) ** 0.85);

// no banner, o sol e a serra clara somem atrás da serra azul: nada deles aparece abaixo dela
const debaixo = xs.map((x, i) => [x, base[i]]).filter(([x]) => x >= SOL.cx - SOL.r - 4 && x <= SOL.cx + SOL.r + 4);
const ACIMA_DA_SERRA = `M${debaixo[0][0]} ${r2(SOL.cy - SOL.r - 4)}L${debaixo.at(-1)[0]} ${r2(SOL.cy - SOL.r - 4)}${debaixo
  .slice()
  .reverse()
  .map(([x, y]) => `L${x} ${r2(y)}`)
  .join('')}Z`;

// ---------------------------------------------------------------- nome

const CAPITULAR = 71; // altura das maiúsculas no banner, em px
const TAMANHO = (CAPITULAR / fonte.tables.os2.sCapHeight) * fonte.unitsPerEm;

/** As letras em desenho, com a caixa do desenho para alinhar pela tinta (não pela margem da letra). */
function palavra(texto, xEsquerda, linhaBase, espaco) {
  const glifos = fonte.stringToGlyphs(texto);
  const escala = TAMANHO / fonte.unitsPerEm;
  let x = 0;
  const partes = glifos.map((g, i) => {
    const p = g.getPath(x, linhaBase, TAMANHO);
    const k = glifos[i + 1] ? fonte.getKerningValue(g, glifos[i + 1]) : 0;
    x += (g.advanceWidth + k) * escala + espaco;
    return p;
  });
  const caixa = partes.reduce(
    (c, p) => {
      const b = p.getBoundingBox();
      return { x1: Math.min(c.x1, b.x1), x2: Math.max(c.x2, b.x2), y1: Math.min(c.y1, b.y1), y2: Math.max(c.y2, b.y2) };
    },
    { x1: Infinity, x2: -Infinity, y1: Infinity, y2: -Infinity },
  );
  const dx = xEsquerda - caixa.x1;
  const d = partes
    .map((p) => {
      for (const c of p.commands) for (const k of ['x', 'x1', 'x2']) if (k in c) c[k] += dx;
      return p.toPathData(1);
    })
    .join('');
  return { d, caixa: { x1: caixa.x1 + dx, x2: caixa.x2 + dx, y1: caixa.y1, y2: caixa.y2 } };
}

// ORLA e NATIVA alinhadas à esquerda, como no banner; o vão entre elas cresce para a onda passar
// por baixo do "O" sem encostar
const BASE_ORLA = 269.5;
const VAO = 24;
const ORLA = palavra('ORLA', 693, BASE_ORLA, -1.5);
const NATIVA = palavra('NATIVA', 690, BASE_ORLA + VAO + CAPITULAR, -4.5);

// a onda: sobe fina pela esquerda, engrossa embaixo do "O" (sem encostar nele) e afina no fim,
// seguida de um fio dourado; na versão lado a lado ela começa junto do nome
const yOnda = (BASE_ORLA + 2 + NATIVA.caixa.y1) / 2;
const espessuraOnda = (t) => 7.6 * Math.sin(Math.PI * t) ** 0.85;
const ONDA = pincelada([[612, yOnda + 25.5], [648, yOnda - 0.5], [735, yOnda - 7], [842, yOnda + 0.5]], espessuraOnda);
const ONDA_CURTA = pincelada([[668, yOnda + 9], [692, yOnda - 1.5], [745, yOnda - 5.5], [842, yOnda + 0.5]], espessuraOnda);
const FIO_ONDA = pincelada([[828, yOnda + 0.3], [850, yOnda + 1.2], [872, yOnda + 2.1], [892, yOnda + 3]], (t) => 2.2 * (1 - t) ** 1.1);

// ---------------------------------------------------------------- montagem

function simbolo(tema, id = tema) {
  const escuro = tema === 'escuro';
  return `<defs><linearGradient id="sol-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COR.ouroClaro}"/><stop offset="1" stop-color="${COR.ouro}"/></linearGradient><clipPath id="disco-${id}"><circle cx="${SOL.cx}" cy="${SOL.cy}" r="${SOL.r}"/></clipPath><clipPath id="acima-${id}"><path d="${ACIMA_DA_SERRA}"/></clipPath></defs>
<g clip-path="url(#acima-${id})"><circle cx="${SOL.cx}" cy="${SOL.cy}" r="${SOL.r}" fill="url(#sol-${id})"/><path d="${SERRA_CLARA}" fill="${escuro ? COR.azul : COR.creme}" clip-path="url(#disco-${id})"/></g>
<path d="${FIO}" fill="${COR.ouro}"/>
<path d="${SERRA}" fill="${escuro ? COR.cremeTexto : COR.azul}"/>`;
}

function nome(tema, onda = ONDA) {
  const tinta = tema === 'escuro' ? COR.cremeTexto : COR.azul;
  return `<path d="${onda}" fill="${tinta}"/><path d="${FIO_ONDA}" fill="${COR.ouro}"/><path d="${ORLA.d}${NATIVA.d}" fill="${tinta}"/>`;
}

const svg = (vb, corpo, titulo = 'Orla Nativa') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.map(r2).join(' ')}" role="img" aria-label="${titulo}"><title>${titulo}</title>${corpo}</svg>\n`;

// caixa do conjunto empilhado: da ponta da onda ao fim de NATIVA, do alto do sol à base de NATIVA
const caixa = {
  x1: 612 - 2,
  y1: SOL.cy - SOL.r - 2,
  x2: Math.max(NATIVA.caixa.x2, 1013) + 2,
  y2: NATIVA.caixa.y2 + 2,
};
const vbEmpilhada = [caixa.x1, caixa.y1, caixa.x2 - caixa.x1, caixa.y2 - caixa.y1];

// lado a lado (cabeçalho): o símbolo um pouco maior à esquerda, centrado na altura do nome
const simb = { x1: pontaEsq[0] - 1, x2: 1014, y1: SOL.cy - SOL.r - 1, y2: Math.max(...base) + 1 };
const bloco = { x1: 667, x2: NATIVA.caixa.x2 + 1, y1: ORLA.caixa.y1 - 1, y2: NATIVA.caixa.y2 + 1 };
const ESCALA_SIMBOLO = 1.1;
const tx = bloco.x1 - 22 - ESCALA_SIMBOLO * simb.x2;
const ty = (bloco.y1 + bloco.y2) / 2 - (ESCALA_SIMBOLO * (simb.y1 + simb.y2)) / 2;
const ladoY1 = Math.min(bloco.y1, ty + ESCALA_SIMBOLO * simb.y1);
const ladoY2 = Math.max(bloco.y2, ty + ESCALA_SIMBOLO * simb.y2);
const vbLado = [tx + ESCALA_SIMBOLO * simb.x1, ladoY1, bloco.x2 - (tx + ESCALA_SIMBOLO * simb.x1), ladoY2 - ladoY1];

await mkdir(saida, { recursive: true });
for (const tema of ['claro', 'escuro']) {
  const sufixo = tema === 'escuro' ? '-fundo-escuro' : '';
  await writeFile(path.join(saida, `orla-nativa${sufixo}.svg`), svg(vbEmpilhada, simbolo(tema) + nome(tema)));
  await writeFile(
    path.join(saida, `orla-nativa-horizontal${sufixo}.svg`),
    svg(vbLado, `<g transform="translate(${r2(tx)} ${r2(ty)}) scale(${ESCALA_SIMBOLO})">${simbolo(tema)}</g>${nome(tema, ONDA_CURTA)}`),
  );
}

// o símbolo sozinho, num quadrado azul (ícone do navegador e do celular): enquadrado no sol e no pico,
// com as pontas finas da serra saindo pelas bordas, para continuar legível em 16 px
const ICONE = { cx: 880, cy: 153, lado: 172 };
const quadrado = (raio) =>
  `<rect x="${r2(ICONE.cx - ICONE.lado / 2)}" y="${r2(ICONE.cy - ICONE.lado / 2)}" width="${ICONE.lado}" height="${ICONE.lado}" rx="${r2(raio)}"/>`;
const vbIcone = [ICONE.cx - ICONE.lado / 2, ICONE.cy - ICONE.lado / 2, ICONE.lado, ICONE.lado];
for (const [arquivo, raio] of [['orla-nativa-simbolo.svg', ICONE.lado * 0.2], ['orla-nativa-simbolo-quadrado.svg', 0]]) {
  await writeFile(
    path.join(saida, arquivo),
    svg(vbIcone, `<defs><clipPath id="icone">${quadrado(raio)}</clipPath></defs><g clip-path="url(#icone)">${quadrado(raio).replace('/>', ` fill="${COR.azul}"/>`)}${simbolo('escuro')}</g>`),
  );
}

// o emblema redondo (voucher, rodapé e redes): a logo empilhada em creme dentro do círculo azul com anel dourado
const cxE = (caixa.x1 + caixa.x2) / 2;
const cyE = (caixa.y1 + caixa.y2) / 2;
const raio = Math.hypot(caixa.x2 - caixa.x1, caixa.y2 - caixa.y1) / 2 + 14;
await writeFile(
  path.join(saida, 'orla-nativa-emblema.svg'),
  svg(
    [cxE - raio, cyE - raio, raio * 2, raio * 2],
    `<circle cx="${r2(cxE)}" cy="${r2(cyE)}" r="${r2(raio)}" fill="${COR.azul}"/><circle cx="${r2(cxE)}" cy="${r2(cyE)}" r="${r2(raio - 8)}" fill="none" stroke="${COR.ouro}" stroke-width="2.4"/>${simbolo('escuro')}${nome('escuro')}`,
  ),
);

// os PNG: o ícone do app (quadrado, sem transparência) e o emblema (dados do Google e voucher)
const png = async (arquivo, largura, destino) => {
  const fonteSvg = await readFile(path.join(saida, arquivo));
  const vb = fonteSvg.toString().match(/viewBox="[^"]*? [^"]*? ([^" ]+) /)[1];
  return sharp(fonteSvg, { density: Math.ceil((72 * largura) / Number(vb)) + 1 }).resize(largura, largura).png({ compressionLevel: 9 }).toFile(destino);
};
await png('orla-nativa-simbolo-quadrado.svg', 512, path.join(saida, 'orla-nativa-icone-512.png'));
await png('orla-nativa-emblema.svg', 512, path.join(saida, 'orla-nativa-emblema-512.png'));

if (saida === 'public/logo') {
  await writeFile('src/app/icon.svg', await readFile(path.join(saida, 'orla-nativa-simbolo.svg')));
  await png('orla-nativa-simbolo-quadrado.svg', 180, 'src/app/apple-icon.png');
  const voucher = path.join(saida, '.voucher.png');
  await png('orla-nativa-emblema.svg', 300, voucher);
  const b64 = (await readFile(voucher)).toString('base64');
  await writeFile(
    'src/lib/logo-voucher.ts',
    `// Emblema redondo em PNG (gerado por scripts/gerar-logo.mjs a partir de public/logo/orla-nativa-emblema.svg) para o voucher em PDF.
export const LOGO_VOUCHER_PNG_BASE64 =
  '${b64}';
`,
  );
  await (await import('node:fs/promises')).rm(voucher);
}
console.log('logo gerada em', saida, { vbEmpilhada: vbEmpilhada.map(r2), vbLado: vbLado.map(r2) });
