import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TabelaGarantias } from '@/components/home/BlocosHome';
import { PaginaLegal } from '@/components/PaginaLegal';

import { CANCELAMENTO } from '@/content/legal/cancelamento';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { alternates, openGraphDaPagina } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/politica-de-cancelamento'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const doc = texto(CANCELAMENTO, locale);
  return {
    title: doc.titulo,
    description: doc.descricao,
    alternates: alternates(locale, '/politica-de-cancelamento'),
    openGraph: openGraphDaPagina(locale, { title: doc.titulo, description: doc.descricao, url: rota(locale, '/politica-de-cancelamento') }),
  };
}

export default async function Pagina({ params }: PageProps<'/[locale]/politica-de-cancelamento'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  return (
    <PaginaLegal
      doc={texto(CANCELAMENTO, locale)}
      idioma={locale}
      d={d}
      caminho="/politica-de-cancelamento"
      titulo={d.rodape.cancelamento}
      acao={d.legal.acoes.cancelamento}
      destaque={
        <section className="tom-superficie py-16 md:py-24" aria-labelledby="em-resumo">
          <div className="moldura entrar">
            <h2 id="em-resumo" className="titulo">
              {d.legal.resumo}
            </h2>
            <TabelaGarantias d={d} className="mt-8 md:mt-12" />
          </div>
        </section>
      }
    />
  );
}
