/**
 * Fotos do transfer: copia as fotos recebidas dos veículos para public/fotos/transfer/ com as placas borradas.
 * Uso: node scripts/preparar-fotos-transfer.mjs
 * As caixas das placas estão em pixels da foto original (1320 px de largura). Nas fotos dos motoristas,
 * as pernas tapam o meio da placa: só os pedaços que aparecem são borrados, para não borrar a calça.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ORIGEM = 'material-recebido/2026-11-01/transfer';
const DESTINO = 'public/fotos/transfer';

/** [x, y, largura, altura] de cada pedaço de placa à mostra. */
const PLACAS = {
  'carro-virtus-com-clientes.jpg': [[170, 728, 143, 64]],
  'carro-creta-aeroporto.jpg': [[222, 814, 64, 49]],
  'carros-creta-com-motoristas.jpg': [
    [205, 731, 32, 53],
    [336, 731, 23, 53],
    [950, 751, 51, 53],
    [1089, 751, 21, 53],
  ],
  'van-frente.jpg': [[1218, 1098, 84, 98]],
  'carro-corolla.jpg': [],
  'van-lateral.jpg': [],
  'van-porta-lateral-bancos.jpg': [],
  'van-traseira-bagageiro.jpg': [],
};

/** Um retângulo com os cantos arredondados e a borda esfumada: o borrão entra sem marca de recorte. */
function mascara(largura, altura, folga) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
    <filter id="f"><feGaussianBlur stdDeviation="${folga / 2}"/></filter>
    <rect x="${folga}" y="${folga}" width="${largura - 2 * folga}" height="${altura - 2 * folga}" rx="4" fill="#fff" filter="url(#f)"/>
  </svg>`;
  return Buffer.from(svg);
}

await mkdir(DESTINO, { recursive: true });
for (const [arquivo, caixas] of Object.entries(PLACAS)) {
  const original = sharp(path.join(ORIGEM, arquivo)).rotate();
  const { width, height } = await original.metadata();
  const camadas = [];
  for (const [x, y, w, h] of caixas) {
    // um pouco de folga em volta, que recebe o borrão esfumado
    const folga = 4;
    const left = Math.max(0, x - folga);
    const top = Math.max(0, y - folga);
    const largura = Math.min(width - left, w + 2 * folga);
    const altura = Math.min(height - top, h + 2 * folga);
    const borrado = await sharp(path.join(ORIGEM, arquivo))
      .rotate()
      .extract({ left, top, width: largura, height: altura })
      .blur(9)
      .ensureAlpha()
      .composite([{ input: mascara(largura, altura, folga), blend: 'dest-in' }])
      .png()
      .toBuffer();
    camadas.push({ input: borrado, left, top });
  }
  await sharp(path.join(ORIGEM, arquivo))
    .rotate()
    .composite(camadas)
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(path.join(DESTINO, arquivo));
  console.log(`${arquivo}: ${caixas.length} placa(s) borrada(s)`);
}
