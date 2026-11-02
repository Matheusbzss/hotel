import type { MetadataRoute } from 'next';
import { urlDoSite } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  const base = urlDoSite();
  const producao = process.env.VERCEL_ENV === 'production' || !process.env.VERCEL;
  return {
    rules: producao
      ? [
          {
            userAgent: '*',
            allow: '/',
            disallow: ['/admin', '/api/', '/checkout/', '/reserva/', '/en/checkout/', '/es/checkout/', '/en/reserva/', '/es/reserva/'],
          },
        ]
      : [{ userAgent: '*', disallow: '/' }],
    sitemap: `${base}/sitemap.xml`,
  };
}
