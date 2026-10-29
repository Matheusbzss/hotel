import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaginaLegal } from '@/components/PaginaLegal';

import { TERMOS } from '@/content/legal/termos';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';
import { alternates } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/termos-de-uso'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const doc = TERMOS[locale];
  return {
    title: doc.titulo,
    description: doc.resumo,
    alternates: alternates(locale, '/termos-de-uso'),
    openGraph: { title: doc.titulo, description: doc.resumo, url: rota(locale, '/termos-de-uso') },
  };
}

export default async function Pagina({ params }: PageProps<'/[locale]/termos-de-uso'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  return <PaginaLegal doc={TERMOS[locale]} idioma={locale} d={d} />;
}
