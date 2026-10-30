import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

export async function emblemaDataUri(): Promise<string> {
  const svg = await readFile(join(process.cwd(), 'public/logo/orla-nativa-emblema.svg'));
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}
