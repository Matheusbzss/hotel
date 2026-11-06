import type { MetadataRoute } from 'next';
import { passeiosAtivos } from '@/data/passeios';
import { HREFLANG, IDIOMAS, rota } from '@/i18n/config';
import { casasAtivas } from '@/lib/casas';
import { urlDoSite } from '@/lib/site';

const PAGINAS: { caminho: string; prioridade: number; frequencia: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { caminho: '/', prioridade: 1, frequencia: 'weekly' },
  { caminho: '/passeios', prioridade: 0.9, frequencia: 'weekly' },
  { caminho: '/transfer', prioridade: 0.8, frequencia: 'monthly' },
  { caminho: '/contato', prioridade: 0.5, frequencia: 'yearly' },
  { caminho: '/politica-de-cancelamento', prioridade: 0.3, frequencia: 'yearly' },
  { caminho: '/termos-de-uso', prioridade: 0.3, frequencia: 'yearly' },
  { caminho: '/politica-de-privacidade', prioridade: 0.3, frequencia: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = urlDoSite();
  const casas = await casasAtivas();
  const todas = [
    ...PAGINAS,
    // as casas de temporada só entram quando há casa no ar (src/lib/casas.ts)
    ...(casas.length ? [{ caminho: '/casas-de-temporada', prioridade: 0.6, frequencia: 'weekly' as const }] : []),
    ...casas.map((c) => ({ caminho: `/casas-de-temporada/${c.slug}`, prioridade: 0.7, frequencia: 'weekly' as const })),
    ...passeiosAtivos().map((p) => ({ caminho: `/passeios/${p.slug}`, prioridade: 0.8, frequencia: 'weekly' as const })),
  ];
  return todas.flatMap((pg) =>
    IDIOMAS.map((idioma) => ({
      url: `${base}${rota(idioma, pg.caminho)}`,
      changeFrequency: pg.frequencia,
      priority: idioma === 'pt' ? pg.prioridade : Math.max(0.1, pg.prioridade - 0.1),
      alternates: {
        languages: Object.fromEntries(IDIOMAS.map((i) => [HREFLANG[i], `${base}${rota(i, pg.caminho)}`])),
      },
    })),
  );
}
