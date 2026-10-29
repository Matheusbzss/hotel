import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ResumoGrupo } from '@/components/grupo/ResumoGrupo';
import { SeletorGrupo } from '@/components/grupo/SeletorGrupo';
import { Abertura } from '@/components/home/Abertura';
import { QuadroFotos } from '@/components/home/QuadroFotos';
import { QuadroPrecos, type GrupoQuadro } from '@/components/home/QuadroPrecos';
import { CartaoContato, ChamadaHospedagem, Garantias, Perguntas, Verbos } from '@/components/home/Secoes';
import { CIDADES, passeiosAtivos, type Cidade } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
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

const FOTOS_QUADRO = [
  '/fotos/buzios/escuna-proa.jpg',
  '/fotos/arraial/barco-toboga.jpg',
  '/fotos/buzios/buggy-orla.jpg',
  '/fotos/arraial/mergulho.jpg',
  '/fotos/buzios/vista-da-escuna.jpg',
  '/fotos/arraial/barco-gruta.jpg',
];

export default async function Inicio({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const passeios = passeiosAtivos();
  const locale_ = LOCALE_INTL[locale];

  const grupos: GrupoQuadro[] = (Object.keys(CIDADES) as Cidade[])
    .map((c) => ({
      id: c,
      titulo: c === 'rio-de-janeiro' ? d.home.saindoDaRegiao : CIDADES[c].nome[locale],
      itens: passeios.filter((p) => p.cidade === c).map((p) => precoPasseio(p, locale, d)),
    }))
    .filter((g) => g.itens.length);

  const textosGrupo = { ...d.grupo, diminuir: d.comum.diminuir, aumentar: d.comum.aumentar, rotulos: d.comum.rotulos };

  return (
    <main id="conteudo" className="tom-mar">
      <Abertura d={d} />

      {/* Passeios e preços: o quadro de saídas, com o total do grupo */}
      <section id="precos" className="moldura scroll-mt-4 py-24 md:py-40" aria-labelledby="precos-titulo">
        <div className="grid gap-8 pb-12 md:grid-cols-12 md:pb-16">
          <div className="entrar md:col-span-6">
            <h2 id="precos-titulo" className="largo titulo text-sol">
              {d.home.precosTitulo}
            </h2>
            <p className="mt-5 max-w-[46ch] text-lead">{fmt(d.home.precosTexto, { n: passeios.length })}</p>
            <ResumoGrupo textos={{ ...d.grupo, rotulos: d.comum.rotulos }} locale={locale_} className="mt-5 font-semibold text-sol" />
          </div>
          <div className="md:col-span-5 md:col-start-8 md:self-end">
            <SeletorGrupo textos={textosGrupo} />
          </div>
        </div>
        <QuadroPrecos
          grupos={grupos}
          locale={locale_}
          textos={{
            colPasseio: d.home.colPasseio,
            colDuracao: d.home.colDuracao,
            colPreco: d.home.colPreco,
            colTotal: d.home.colTotal,
            porPessoaCurto: d.home.porPessoaCurto,
            aPartirDe: d.comum.aPartirDe,
            idadeMin: d.home.idadeMin,
          }}
        />
      </section>

      {/* Como é cada passeio: um quadro, as fotos mudam */}
      <section className="bg-mar-2" aria-labelledby="fotos-titulo">
        <div className="moldura grid items-center gap-12 py-24 md:grid-cols-12 md:py-40">
          <div className="entrar md:col-span-5">
            <h2 id="fotos-titulo" className="titulo font-bold text-sol">
              {d.home.fotosTitulo}
            </h2>
            <p className="mt-5 max-w-[40ch] text-lead">{d.home.fotosTexto}</p>
          </div>
          <div className="md:col-span-5 md:col-start-8">
            <QuadroFotos
              fotos={FOTOS_QUADRO.map((src, i) => ({ src, legenda: d.home.fotosLegendas[i] }))}
              rotuloProxima={d.passeio.proximaFoto}
            />
          </div>
        </div>
      </section>

      <Verbos d={d} />
      <Garantias d={d} />
      <ChamadaHospedagem d={d} href={rota(locale, '/passeio-e-hospedagem')} />
      <Perguntas d={d} />
      <CartaoContato d={d} />

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
