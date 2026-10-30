import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const TAMANHO_OG = { width: 1200, height: 630 };

export const COR_OG = { mar: '#082F3F', mar2: '#0D3A4D', sol: '#FFD54A', brilho: '#FFE07A', turquesa: '#26B3C1', areia: '#F4EAD6' };

/** Fontes da marca para as imagens de prévia (WhatsApp, Instagram, Facebook). */
export async function fontesOg() {
  const [largo, t500, t700] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/tiktok-largo-800.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/tiktok-500.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/tiktok-700.ttf')),
  ]);
  return [
    { name: 'Largo', data: largo, weight: 800 as const, style: 'normal' as const },
    { name: 'TikTok Sans', data: t500, weight: 500 as const, style: 'normal' as const },
    { name: 'TikTok Sans', data: t700, weight: 700 as const, style: 'normal' as const },
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
