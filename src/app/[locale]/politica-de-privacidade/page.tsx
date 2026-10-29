import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PaginaLegal } from '@/components/PaginaLegal';
import { RedefinirCookies } from '@/components/RedefinirCookies';
import { PRIVACIDADE } from '@/content/legal/privacidade';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';
import { alternates } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/politica-de-privacidade'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const doc = PRIVACIDADE[locale];
  return {
    title: doc.titulo,
    description: doc.resumo,
    alternates: alternates(locale, '/politica-de-privacidade'),
    openGraph: { title: doc.titulo, description: doc.resumo, url: rota(locale, '/politica-de-privacidade') },
  };
}

export default async function Pagina({ params }: PageProps<'/[locale]/politica-de-privacidade'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  return <PaginaLegal doc={PRIVACIDADE[locale]} idioma={locale} d={d} extra={<RedefinirCookies rotulo={d.cookies.gerenciar} />} />;
}
