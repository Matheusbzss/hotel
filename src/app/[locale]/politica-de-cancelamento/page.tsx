import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaginaLegal } from '@/components/PaginaLegal';

import { CANCELAMENTO } from '@/content/legal/cancelamento';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';
import { alternates } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/politica-de-cancelamento'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const doc = CANCELAMENTO[locale];
  return {
    title: doc.titulo,
    description: doc.resumo,
    alternates: alternates(locale, '/politica-de-cancelamento'),
    openGraph: { title: doc.titulo, description: doc.resumo, url: rota(locale, '/politica-de-cancelamento') },
  };
}

export default async function Pagina({ params }: PageProps<'/[locale]/politica-de-cancelamento'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  return <PaginaLegal doc={CANCELAMENTO[locale]} idioma={locale} d={d} />;
}
