import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Abertura } from '@/components/home/Abertura';
import { FolhaPrecos, type GrupoFolha } from '@/components/home/FolhaPrecos';
import { ChamadaPacotes, ComoFunciona, Destinos, Garantias, Perguntas } from '@/components/home/Secoes';
import { CIDADES, passeiosAtivos, type Cidade } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { precoPasseio } from '@/lib/passeio-view';
import { alternates } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  return {
    title: { absolute: d.meta.titulo },
    description: d.meta.descricao,
    alternates: alternates(locale, '/'),
    openGraph: { title: d.meta.titulo, description: d.meta.descricao, url: rota(locale, '/') },
  };
}

export default async function Inicio({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const passeios = passeiosAtivos();

  const grupos: GrupoFolha[] = (Object.keys(CIDADES) as Cidade[])
    .map((c) => ({
      id: c,
      titulo: c === 'rio-de-janeiro' ? d.home.saindoDaRegiao : CIDADES[c].nome[locale],
      itens: passeios.filter((p) => p.cidade === c).map((p) => precoPasseio(p, locale, d)),
    }))
    .filter((g) => g.itens.length);

  return (
    <main id="conteudo" className="tom-fundo">
      <Abertura d={d} />
      <FolhaPrecos
        grupos={grupos}
        locale={LOCALE_INTL[locale]}
        textos={{
          titulo: d.home.precosTitulo,
          texto: d.home.precosTexto,
          rodape: d.home.precosRodape,
          cidades: d.home.cidades,
          aPartirDe: d.comum.aPartirDe,
          idadeMin: d.home.idadeMin,
          totalPara: d.grupo.totalPara,
          semData: d.grupo.semData,
          rotulos: d.comum.rotulos,
          grupo: { ...d.grupo, diminuir: d.comum.diminuir, aumentar: d.comum.aumentar, rotulos: d.comum.rotulos },
        }}
      />
      <Destinos
        d={d}
        idioma={locale}
        contagem={Object.fromEntries((Object.keys(CIDADES) as Cidade[]).map((c) => [c, passeios.filter((p) => p.cidade === c).length]))}
      />
      <ComoFunciona d={d} />
      <Garantias d={d} hrefPolitica={rota(locale, '/politica-de-cancelamento')} />
      <ChamadaPacotes d={d} href={rota(locale, '/passeio-e-hospedagem')} />
      <Perguntas d={d} hrefPasseios={rota(locale, '/passeios')} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: d.faq.map((f) => ({ '@type': 'Question', name: f.p, acceptedAnswer: { '@type': 'Answer', text: f.r } })),
          }),
        }}
      />
    </main>
  );
}
