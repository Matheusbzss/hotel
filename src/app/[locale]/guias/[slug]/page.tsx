import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DadosEstruturados } from '@/components/DadosEstruturados';
import { CorpoGuia } from '@/components/guia/CorpoGuia';
import { EMPRESA } from '@/config/empresa';
import { GUIAS, guiaNoIdioma, obterGuia } from '@/data/guias';
import { dicionario } from '@/i18n';
import { HREFLANG, IDIOMAS_GUIAS, isIdiomaGuia, rota } from '@/i18n/config';
import { migalhas } from '@/lib/dados-estruturados';
import { alternatesGuia, openGraphDaPagina, urlDoSite } from '@/lib/site';

export const dynamicParams = false;

/** Os guias existem nas duas versões do espanhol: é o idioma de quem pesquisa a viagem no Google. */
export function generateStaticParams() {
  return IDIOMAS_GUIAS.flatMap((locale) => GUIAS.map((g) => ({ locale, slug: g.slug })));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/guias/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  const g = obterGuia(slug);
  if (!isIdiomaGuia(locale) || !g) return {};
  const guia = guiaNoIdioma(g, locale);
  const endereco = rota(locale, `/guias/${g.slug}`);
  return {
    title: guia.titulo,
    description: guia.descricao,
    alternates: alternatesGuia(locale, `/guias/${g.slug}`),
    openGraph: openGraphDaPagina(locale, {
      title: `${guia.titulo} | ${EMPRESA.marca}`,
      description: guia.descricao,
      url: endereco,
      type: 'article',
    }),
  };
}

export default async function PaginaGuia({ params }: PageProps<'/[locale]/guias/[slug]'>) {
  const { locale, slug } = await params;
  const original = obterGuia(slug);
  if (!isIdiomaGuia(locale) || !original) notFound();
  const g = guiaNoIdioma(original, locale);
  const endereco = `${urlDoSite()}${rota(locale, `/guias/${g.slug}`)}`;

  return (
    <main id="conteudo" className="tom-fundo">
      <CorpoGuia guia={g} idioma={locale} d={dicionario(locale)} />
      <DadosEstruturados
        dados={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: g.h1,
          description: g.descricao,
          image: `${urlDoSite()}${g.foto}`,
          inLanguage: HREFLANG[locale],
          datePublished: g.publicado,
          dateModified: g.atualizado,
          mainEntityOfPage: endereco,
          author: { '@type': 'Organization', name: EMPRESA.marca, url: urlDoSite() },
          publisher: { '@type': 'Organization', name: EMPRESA.marca, url: urlDoSite() },
        }}
      />
      <DadosEstruturados
        dados={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: g.perguntas.map((f) => ({ '@type': 'Question', name: f.p, acceptedAnswer: { '@type': 'Answer', text: f.r } })),
        }}
      />
      <DadosEstruturados
        dados={migalhas(locale, [
          { nome: 'Guías de viaje', caminho: '/guias' },
          { nome: g.h1, caminho: `/guias/${g.slug}` },
        ])}
      />
    </main>
  );
}
