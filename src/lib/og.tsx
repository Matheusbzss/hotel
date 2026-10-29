import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReactElement } from 'react';

export const TAMANHO_OG = { width: 1200, height: 630 };

/** Fontes da marca para as imagens de prévia (WhatsApp, Instagram, Facebook). */
export async function fontesOg() {
  const [imbue, albert5, albert7, yellowtail] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/imbue-400.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/albert-500.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/albert-700.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/yellowtail.ttf')),
  ]);
  return [
    { name: 'Imbue', data: imbue, weight: 400 as const, style: 'normal' as const },
    { name: 'Albert Sans', data: albert5, weight: 500 as const, style: 'normal' as const },
    { name: 'Albert Sans', data: albert7, weight: 700 as const, style: 'normal' as const },
    { name: 'Yellowtail', data: yellowtail, weight: 400 as const, style: 'normal' as const },
  ];
}

/** Converte um elemento SVG do React em data URI para usar em <img> no ImageResponse. */
export async function svgParaDataUri(el: ReactElement): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const svg = renderToStaticMarkup(el).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

export async function emblemaDataUri(): Promise<string> {
  const svg = await readFile(join(process.cwd(), 'public/logo/agencia-victor-hugo-emblema.svg'));
  return `data:image/svg+xml;base64,${svg.toString('base64')}`;
}

/** Faixa listrada de guarda-sol (sem gradiente: blocos chapados). */
export function FaixaOg({ altura = 28 }: { altura?: number }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: altura, overflow: 'hidden' }}>
      {Array.from({ length: 22 }).map((_, i) => (
        <div key={i} style={{ width: 56, height: altura, background: i % 2 ? '#FFFFFF' : '#FF7A66' }} />
      ))}
    </div>
  );
}
