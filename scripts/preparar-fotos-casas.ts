/**
 * Fotos das casas (Fase 4, Etapa 7, parte J): copia as fotos recebidas para public/fotos/casas/<slug>/, regravadas pelo
 * sharp SEM nenhum metadado (EXIF, inclusive GPS, XMP, IPTC e perfil de cor), com os nomes neutros de
 * scripts/dados/casas.ts (sem pista de onde a casa fica) e só as fotos da lista: as que mostram onde a casa fica ficam
 * de fora. O lado maior fica com no máximo LADO_MAXIMO px e nada é esticado (as da Ferradura têm 720 px e continuam
 * com 720). No celular, o next/image do site serve versões menores sozinho (AVIF e WebP, do tamanho da tela).
 *
 * Uma foto da lista pode pedir um borrão (`desfocar`, uma pessoa que aparece) e um recorte (`recorte`, para tirar os
 * vizinhos), sempre em pixels da foto recebida: o borrão entra com a borda esfumada, como nas placas do transfer
 * (scripts/preparar-fotos-transfer.mjs), e o recorte vem depois dele. As outras fotos passam pelo caminho de sempre.
 *
 * Uso, na pasta do projeto:
 *   node --experimental-strip-types scripts/preparar-fotos-casas.ts [pasta das casas]
 * A pasta das casas é a de material-recebido/casas (padrão), com uma subpasta fotos/ por casa.
 */
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { CASAS_PARA_CADASTRAR, type FotoParaCopiar } from './dados/casas.ts';

const ORIGEM = process.argv[2] ?? 'material-recebido/casas';
const LADO_MAXIMO = 1600;
/** A qualidade do JPEG: mais alta nas fotos pequenas (até 1000 px), que já vieram comprimidas, para não perder mais. */
const qualidade = (largura: number, altura: number) => (Math.max(largura, altura) <= 1000 ? 90 : 82);
/** A folga em volta de cada borrão, onde a borda se esfuma, e a força do borrão. */
const FOLGA = 4;
const FORCA_DO_BORRAO = 9;

/** Um retângulo com os cantos arredondados e a borda esfumada: o borrão entra sem marca de recorte. */
function mascara(largura: number, altura: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
    <filter id="f"><feGaussianBlur stdDeviation="${FOLGA / 2}"/></filter>
    <rect x="${FOLGA}" y="${FOLGA}" width="${largura - 2 * FOLGA}" height="${altura - 2 * FOLGA}" rx="4" fill="#fff" filter="url(#f)"/>
  </svg>`);
}

/** A foto já com os borrões e o recorte, sem perda (PNG), pronta para o caminho de sempre. */
async function editada(entrada: string, foto: FotoParaCopiar): Promise<Sharp> {
  // o tamanho já com a orientação do EXIF aplicada (de 5 a 8, a foto gira de lado e a largura troca com a altura)
  const m = await sharp(entrada).metadata();
  const deLado = (m.orientation ?? 1) >= 5;
  const width = (deLado ? m.height : m.width) ?? 0;
  const height = (deLado ? m.width : m.height) ?? 0;
  const camadas = [];
  for (const { x, y, largura, altura } of foto.desfocar ?? []) {
    const left = Math.max(0, x - FOLGA);
    const top = Math.max(0, y - FOLGA);
    const w = Math.min(width - left, largura + 2 * FOLGA);
    const h = Math.min(height - top, altura + 2 * FOLGA);
    const borrado = await sharp(entrada)
      .rotate()
      .extract({ left, top, width: w, height: h })
      .blur(FORCA_DO_BORRAO)
      .ensureAlpha()
      .composite([{ input: mascara(w, h), blend: 'dest-in' }])
      .png()
      .toBuffer();
    camadas.push({ input: borrado, left, top });
  }
  // o sharp faz o composite por último na mesma passada: o borrão vai num passo, o recorte no seguinte
  const comBorrao = await sharp(entrada).rotate().composite(camadas).png().toBuffer();
  const r = foto.recorte;
  return r ? sharp(comBorrao).extract({ left: r.x, top: r.y, width: r.largura, height: r.altura }) : sharp(comBorrao);
}

for (const casa of CASAS_PARA_CADASTRAR) {
  const destino = path.join('public', 'fotos', 'casas', casa.slug);
  await mkdir(destino, { recursive: true });
  // uma foto que saiu da lista sai também da pasta (só as desta casa, que este script gerou)
  const daLista = new Set(casa.fotos.map((f) => f.arquivo));
  for (const nome of await readdir(destino)) if (!daLista.has(nome)) await unlink(path.join(destino, nome));

  let soma = 0;
  for (const foto of casa.fotos) {
    const entrada = path.join(ORIGEM, casa.pasta, 'fotos', foto.origem);
    const saida = path.join(destino, foto.arquivo);
    const original = await sharp(entrada).metadata();
    const editar = Boolean(foto.desfocar?.length || foto.recorte);
    // rotate() aplica a orientação do EXIF antes de jogar o EXIF fora; sem withMetadata(), nada de metadado sai
    const info = await (editar ? await editada(entrada, foto) : sharp(entrada).rotate())
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: qualidade(original.width ?? 0, original.height ?? 0), mozjpeg: true })
      .toFile(saida);
    const meta = await sharp(saida).metadata();
    if (meta.exif || meta.xmp || meta.iptc || meta.icc) throw new Error(`${saida}: ainda tem metadados`);
    const kb = Math.round((await stat(saida)).size / 1024);
    soma += kb;
    const nota = editar ? ` — ${foto.motivoDaEdicao ?? 'editada'}` : '';
    console.log(`${casa.slug}/${foto.arquivo}: ${info.width}x${info.height}, ${kb} KB (de ${foto.origem})${nota}`);
  }
  console.log(
    `${casa.slug}: ${casa.fotos.length} fotos, ${soma} KB; de fora: ${casa.fotosDeFora.map((f) => f.origem).join(', ') || 'nenhuma'}`,
  );
}
