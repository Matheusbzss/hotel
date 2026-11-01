import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BarraReserva, Boletim, type TextosBoletim } from '@/components/home/Boletim';
import { ChamadaPacotes, ComoFunciona, Garantias, Perguntas } from '@/components/home/BlocosHome';
import { EstadoHomeProvider } from '@/components/home/EstadoHome';
import { MapaPlano } from '@/components/home/MapaPlano';
import { MapaRegiao } from '@/components/home/MapaRegiao';
import { MarDeFundo } from '@/components/home/MarDeFundo';
import { CIDADES, passeiosAtivos, type Cidade } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { itensBoletim } from '@/lib/boletim';
import { pinosMapa } from '@/lib/mapa';
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
  const itens = itensBoletim(passeios, locale, d);
  const cidades = (Object.keys(CIDADES) as Cidade[])
    .filter((c) => passeios.some((p) => p.cidade === c))
    .map((c) => ({ id: c, nome: CIDADES[c].nome[locale] }));
  const nomes = Object.fromEntries(cidades.map((c) => [c.id, c.nome])) as Partial<Record<Cidade, string>>;
  const pinos = pinosMapa();
  const intl = LOCALE_INTL[locale];

  const textos: TextosBoletim = {
    ...d.boletim,
    totalPara: d.grupo.totalPara,
    idadeMin: d.home.idadeMin,
    rotulos: d.comum.rotulos,
    grupo: { ...d.grupo, diminuir: d.comum.diminuir, aumentar: d.comum.aumentar, rotulos: d.comum.rotulos },
  };

  return (
    <EstadoHomeProvider>
      <MarDeFundo pinos={pinos.map(({ id, x, y }) => ({ id, x, y }))} />
      <main id="conteudo" className="relative z-10">
        <section id="mar-janela" className="mar-heroi" data-mar-toque aria-labelledby="gancho">
          {/* o gancho no céu; a frase de apoio embaixo, sobre o mar escuro, longe do brilho do horizonte */}
          <div className="moldura flex min-h-[60svh] flex-col justify-between gap-8 pb-6 pt-24 md:pt-32 lg:min-h-[68svh] lg:pb-10">
            <h1 id="gancho" className="gancho">
              {d.home.gancho}
            </h1>
            <p className="max-w-[38ch] text-lead text-white/90">{d.home.ganchoTexto}</p>
          </div>
        </section>

        <div className="folha">
          <div className="moldura pb-16 pt-6 md:pb-24 md:pt-10">
            <Boletim itens={itens} cidades={cidades} textos={textos} locale={intl} />
          </div>
        </div>

        <MapaRegiao
          pinos={pinos}
          nomes={nomes}
          itens={itens}
          textos={{
            titulo: d.home.mapaTitulo,
            texto: d.home.mapaTexto,
            toque: d.home.mapaToque,
            fonte: d.home.mapaFonte,
            todos: d.home.mapaTodos,
            fechar: d.home.mapaFechar,
          }}
          textosBoletim={textos}
          locale={intl}
          hrefTodos={rota(locale, '/passeios')}
        >
          <MapaPlano rotulo={d.home.mapaTitulo} />
        </MapaRegiao>

        <div className="relative z-10 bg-(--color-fundo)">
          <Garantias d={d} hrefPolitica={rota(locale, '/politica-de-cancelamento')} />
          <ComoFunciona d={d} />
          <ChamadaPacotes d={d} href={rota(locale, '/passeio-e-hospedagem')} />
          <Perguntas d={d} />
        </div>

        <BarraReserva itens={itens} textos={textos} locale={intl} />

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
    </EstadoHomeProvider>
  );
}
