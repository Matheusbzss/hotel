import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { DadosEstruturados } from '@/components/DadosEstruturados';
import { CartaoGuia } from '@/components/guia/CartaoGuia';
import { EMPRESA } from '@/config/empresa';
import { altDaFoto } from '@/data/fotos-alt';
import { GRUPOS_GUIAS, fraseDoGuia, guiaNoIdioma, obterGuia, type Guia } from '@/data/guias';
import { IDIOMAS_GUIAS, isIdiomaGuia, rota } from '@/i18n/config';
import { migalhas } from '@/lib/dados-estruturados';
import { alternatesGuia, openGraphDaPagina } from '@/lib/site';

const TITULO = 'Guías de viaje: Búzios, Arraial y Cabo Frio';
const DESCRICAO =
  'Guías para planear tu viaje a Búzios, Arraial do Cabo y Cabo Frio: qué hacer, las mejores playas, cómo llegar desde Río, Argentina o Chile y cuándo ir.';
const FOTO = '/fotos/buzios/por-do-sol-barcos-na-baia.jpg';

export const dynamicParams = false;

/** Como os guias, a lista existe nas duas versões do espanhol, cada uma no seu endereço. */
export function generateStaticParams() {
  return IDIOMAS_GUIAS.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/guias'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdiomaGuia(locale)) return {};
  const endereco = rota(locale, '/guias');
  return {
    title: TITULO,
    description: DESCRICAO,
    alternates: alternatesGuia(locale, '/guias'),
    openGraph: openGraphDaPagina(locale, { title: `${TITULO} | ${EMPRESA.marca}`, description: DESCRICAO, url: endereco }),
  };
}

/** A lista dos guias, nas duas versões do espanhol: agrupados pela pergunta de quem planeja a viagem. */
export default async function PaginaGuias({ params }: PageProps<'/[locale]/guias'>) {
  const { locale } = await params;
  if (!isIdiomaGuia(locale)) notFound();

  return (
    <main id="conteudo" className="tom-fundo pb-24 md:pb-40">
      <section className="topo-passeio" aria-labelledby="guias-titulo">
        <div className="topo-passeio-fotos">
          <Image
            src={FOTO}
            alt={altDaFoto(FOTO, locale)}
            fill
            preload
            fetchPriority="high"
            sizes="100vw"
            quality={80}
            className="object-cover"
            style={{ objectPosition: '50% 60%' }}
          />
        </div>
        <div className="topo-passeio-texto">
          <div className="moldura">
            <h1 id="guias-titulo" className="topo-passeio-titulo">
              Guías de viaje
            </h1>
          </div>
        </div>
      </section>

      <div className="moldura mt-6 md:mt-10">
        <p className="max-w-[56ch] text-lead leading-[1.35]">
          Todo para planear tu viaje a Búzios, Arraial do Cabo y Cabo Frio: qué hacer en cada destino, cómo llegar y cuándo ir.
        </p>
      </div>

      {GRUPOS_GUIAS.map((grupo) => {
        const guias = grupo.guias.map(obterGuia).filter((g): g is Guia => Boolean(g));
        return (
          <section key={grupo.id} aria-labelledby={`${grupo.id}-titulo`} className="moldura mt-12 md:mt-20">
            <h2 id={`${grupo.id}-titulo`} className="titulo">
              {fraseDoGuia(grupo.titulo, locale)}
            </h2>
            <ul className="trilho mt-6 md:mt-8">
              {guias.map((g) => (
                <li key={g.slug}>
                  <CartaoGuia guia={guiaNoIdioma(g, locale)} idioma={locale} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <DadosEstruturados dados={migalhas(locale, [{ nome: 'Guías de viaje', caminho: '/guias' }])} />
    </main>
  );
}
