import { IDIOMAS, HREFLANG, rota, type Idioma } from '@/i18n/config';

/** URL pública do site (domínio próprio em produção, URL da Vercel nas prévias). */
export function urlDoSite(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_ENV === 'production' && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

/** canonical + hreflang de uma página nos três idiomas. */
export function alternates(idioma: Idioma, caminho: string) {
  const languages: Record<string, string> = {};
  for (const i of IDIOMAS) languages[HREFLANG[i]] = rota(i, caminho);
  languages['x-default'] = rota('pt', caminho);
  return { canonical: rota(idioma, caminho), languages };
}
