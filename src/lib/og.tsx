import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';

export const TAMANHO_OG = { width: 1200, height: 630 };

/** As cores do site: o azul-noite da tinta, o verde-água das ações, o cinza-azulado das notas e o coral do sol. */
export const COR_OG = { tinta: '#0B2530', acao: '#0A6B74', suave: '#A9C3C8', coral: '#FF6B57' };

/** Archivo, a mesma letra do site, para as imagens de prévia (WhatsApp, Facebook). */
export async function fontesOg() {
  const [a500, a600] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/archivo-500.woff')),
    readFile(join(process.cwd(), 'assets/fonts/archivo-600.woff')),
  ]);
  return [
    { name: 'Archivo', data: a500, weight: 500 as const, style: 'normal' as const },
    { name: 'Archivo', data: a600, weight: 600 as const, style: 'normal' as const },
  ];
}

/** Foto de /public como data URI (JPEG ou PNG), para usar dentro do ImageResponse. */
export async function fotoDataUri(caminho: string): Promise<string | null> {
  if (!/\.(jpe?g|png)$/i.test(caminho)) return null;
  try {
    const arq = await readFile(join(process.cwd(), 'public', caminho));
    return `data:image/${caminho.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'};base64,${arq.toString('base64')}`;
  } catch {
    return null;
  }
}

/** A logo lado a lado em creme, para o fundo escuro das prévias. */
export async function logoDataUri(): Promise<string> {
  const svg = await readFile(join(process.cwd(), 'public/logo/orla-nativa-horizontal-fundo-escuro.svg'));
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

/**
 * Entrega a prévia em JPEG: em PNG ela passava de 1 MB, pesada para o WhatsApp mostrar no link.
 * Fica guardada na Vercel até o próximo deploy (que limpa o cache), para não ser gerada a cada visita.
 */
export async function previaLeve(imagem: ImageResponse): Promise<Response> {
  const jpeg = await sharp(Buffer.from(await imagem.arrayBuffer()))
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(jpeg), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400, s-maxage=2592000' },
  });
}

/** A prévia de uma página: a foto real inteira, a logo em cima e o nome grande embaixo, como a primeira tela. */
export async function previaDaPagina({ foto, titulo, texto }: { foto: string; titulo: string; texto: string }): Promise<Response> {
  const [fonts, imagem, logo] = await Promise.all([fontesOg(), fotoDataUri(foto), logoDataUri()]);
  const tamanho = titulo.length <= 11 ? 186 : titulo.length <= 18 ? 124 : 88;
  return previaLeve(
    new ImageResponse(
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          position: 'relative',
          background: COR_OG.tinta,
          color: '#FFFFFF',
          fontFamily: 'Archivo',
        }}
      >
        {imagem && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagem} width={1200} height={630} alt="" style={{ position: 'absolute', inset: 0, objectFit: 'cover' }} />
        )}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 200,
            backgroundImage: 'linear-gradient(rgba(11,37,48,0.6), rgba(11,37,48,0))', // taste-skill-ignore: escurece a foto
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 470,
            backgroundImage: 'linear-gradient(rgba(11,37,48,0), rgba(11,37,48,0.6) 35%, rgba(11,37,48,0.9))', // taste-skill-ignore: escurece a foto
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={290} height={70} alt="" style={{ position: 'absolute', left: 60, top: 46 }} />
        <div style={{ position: 'absolute', left: 60, right: 60, bottom: 34, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: 500, fontSize: 34, lineHeight: 1.25, maxWidth: 780 }}>{texto}</span>
          <span style={{ fontWeight: 600, fontSize: tamanho, lineHeight: 0.98, letterSpacing: -tamanho / 37, marginTop: 14 }}>
            {titulo}
          </span>
        </div>
      </div>,
      { ...TAMANHO_OG, fonts },
    ),
  );
}
