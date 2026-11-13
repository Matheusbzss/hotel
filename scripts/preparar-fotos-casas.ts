/**
 * Fotos das casas (Fase 4, Etapa 7, parte J): copia as fotos recebidas para public/fotos/casas/<slug>/, regravadas pelo
 * sharp SEM nenhum metadado (EXIF, inclusive GPS, XMP, IPTC e perfil de cor), com os nomes neutros de
 * scripts/dados/casas.ts (sem pista de onde a casa fica) e só as fotos da lista: as que mostram onde a casa fica ficam
 * de fora. O lado maior fica com no máximo LADO_MAXIMO px e nada é esticado (as da Ferradura têm 720 px e continuam
 * com 720). No celular, o next/image do site serve versões menores sozinho (AVIF e WebP, do tamanho da tela).
 *
 * Uso, na pasta do projeto:
 *   node --experimental-strip-types scripts/preparar-fotos-casas.ts [pasta das casas]
 * A pasta das casas é a de material-recebido/casas (padrão), com uma subpasta fotos/ por casa.
 */
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { CASAS_PARA_CADASTRAR } from './dados/casas.ts';

const ORIGEM = process.argv[2] ?? 'material-recebido/casas';
const LADO_MAXIMO = 1600;
/** A qualidade do JPEG: mais alta nas fotos pequenas (até 1000 px), que já vieram comprimidas, para não perder mais. */
const qualidade = (largura: number, altura: number) => (Math.max(largura, altura) <= 1000 ? 90 : 82);

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
    // rotate() aplica a orientação do EXIF antes de jogar o EXIF fora; sem withMetadata(), nada de metadado sai
    const info = await sharp(entrada)
      .rotate()
      .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: qualidade(original.width ?? 0, original.height ?? 0), mozjpeg: true })
      .toFile(saida);
    const meta = await sharp(saida).metadata();
    if (meta.exif || meta.xmp || meta.iptc || meta.icc) throw new Error(`${saida}: ainda tem metadados`);
    const kb = Math.round((await stat(saida)).size / 1024);
    soma += kb;
    console.log(`${casa.slug}/${foto.arquivo}: ${info.width}x${info.height}, ${kb} KB (de ${foto.origem})`);
  }
  console.log(
    `${casa.slug}: ${casa.fotos.length} fotos, ${soma} KB; de fora: ${casa.fotosDeFora.map((f) => f.origem).join(', ') || 'nenhuma'}`,
  );
}
