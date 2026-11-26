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
            // checkout, pedido e reserva ficam de fora de propósito: bloqueados aqui, o Google não leria o noindex deles
            disallow: ['/admin', '/api/'],
          },
        ]
      : [{ userAgent: '*', disallow: '/' }],
    sitemap: `${base}/sitemap.xml`,
  };
}
