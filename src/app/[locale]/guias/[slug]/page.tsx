import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DadosEstruturados } from '@/components/DadosEstruturados';
import { CorpoGuia } from '@/components/guia/CorpoGuia';
import { EMPRESA } from '@/config/empresa';
import { GUIAS, obterGuia } from '@/data/guias';
import { dicionario } from '@/i18n';
import { rota } from '@/i18n/config';
import { migalhas } from '@/lib/dados-estruturados';
import { urlDoSite } from '@/lib/site';

export const dynamicParams = false;

/** Os guias só existem em espanhol: é o idioma de quem pesquisa a viagem no Google. */
export function generateStaticParams() {
  return GUIAS.map((g) => ({ locale: 'es', slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/guias/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  const g = obterGuia(slug);
  if (locale !== 'es' || !g) return {};
  const endereco = rota('es', `/guias/${g.slug}`);
  return {
    title: g.titulo,
    description: g.descricao,
    alternates: { canonical: endereco },
    openGraph: { title: `${g.titulo} | ${EMPRESA.marca}`, description: g.descricao, url: endereco, type: 'article' },
  };
}

export default async function PaginaGuia({ params }: PageProps<'/[locale]/guias/[slug]'>) {
  const { locale, slug } = await params;
  const g = obterGuia(slug);
  if (locale !== 'es' || !g) notFound();
  const endereco = `${urlDoSite()}${rota('es', `/guias/${g.slug}`)}`;

  return (
    <main id="conteudo" className="tom-fundo">
      <CorpoGuia guia={g} d={dicionario('es')} />
      <DadosEstruturados
        dados={{
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: g.h1,
          description: g.descricao,
          image: `${urlDoSite()}${g.foto}`,
          inLanguage: 'es',
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
        dados={migalhas('es', [
          { nome: 'Guías de viaje', caminho: '/guias' },
          { nome: g.h1, caminho: `/guias/${g.slug}` },
        ])}
      />
    </main>
  );
}
