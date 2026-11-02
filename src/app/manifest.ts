import type { MetadataRoute } from 'next';
import { EMPRESA } from '@/config/empresa';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${EMPRESA.marca} — ${EMPRESA.slogan}`,
    short_name: EMPRESA.marca,
    description: 'Passeios em Búzios, Cabo Frio e Arraial do Cabo.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#FF7A66',
    icons: [
      { src: '/logo/orla-nativa-emblema-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
