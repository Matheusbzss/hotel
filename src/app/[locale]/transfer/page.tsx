import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  ComoFuncionaTransfer,
  FichaTransfer,
  PrecosTransfer,
  RegrasTransfer,
  VeiculosTransfer,
  textosWidgetTransfer,
} from '@/components/transfer/SecoesTransfer';
import { WidgetTransfer } from '@/components/transfer/WidgetTransfer';
import { FOTOS_TRANSFER, FOTO_TOPO_TRANSFER } from '@/data/transfer';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { cotacaoDolar } from '@/lib/dolar';
import { alternates } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/transfer'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  return {
    title: d.transfer.titulo,
    description: d.transfer.resumo,
    alternates: alternates(locale, '/transfer'),
    openGraph: { title: d.transfer.titulo, description: d.transfer.resumo, url: rota(locale, '/transfer') },
  };
}

/**
 * Transfer privado: a foto real do carro na chegada ao hotel e, já na primeira tela, o cartão para montar
 * o trajeto e ver o preço; depois, os preços fixos, como funciona, os veículos, as fotos e as regras.
 */
export default async function Transfer({ params }: PageProps<'/[locale]/transfer'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const T = d.transfer;

  return (
    <main id="conteudo" className="tom-fundo">
      <section className="relative isolate md:min-h-[100svh]" aria-label={T.titulo}>
        <div className="relative h-[46svh] overflow-hidden md:absolute md:inset-0 md:h-auto">
          <Image
            src={FOTO_TOPO_TRANSFER}
            alt={T.galeria}
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: '50% 60%' }}
          />
          {/* no celular, o nome fica sobre a foto, numa faixa escurecida só onde há texto */}
          <div className="veu-baixo absolute inset-x-0 bottom-0 h-2/3 md:hidden" aria-hidden="true" />
          <div className="moldura absolute inset-x-0 bottom-0 pb-16 md:hidden">
            <h1 className="topo-passeio-titulo text-white">{T.titulo}</h1>
          </div>
        </div>
        <div className="moldura relative -mt-10 pb-12 md:mt-0 md:flex md:items-start md:justify-between md:gap-10 md:pb-24 md:pt-28">
          {/* no computador, o nome e o resumo ficam num vidro sobre a foto; no celular, o nome vai na foto e o resumo depois do cartão */}
          <div className="vidro vidro-escuro hidden max-w-[30rem] rounded-[24px] p-7 text-white md:block">
            <div className="flex flex-wrap gap-1.5">
              {T.etiquetas.map((e) => (
                <span key={e} className="etiqueta vidro vidro-foto">
                  {e}
                </span>
              ))}
            </div>
            <h1 className="topo-passeio-titulo mt-3">{T.titulo}</h1>
            <p className="mt-3 text-lead">{T.resumo}</p>
          </div>
          <div className="w-full md:w-[27rem] md:shrink-0">
            <WidgetTransfer
              idioma={locale}
              locale={LOCALE_INTL[locale]}
              finalizarHref={rota(locale, '/checkout')}
              dolar={locale === 'pt' ? null : await cotacaoDolar()}
              textos={textosWidgetTransfer(d)}
            />
          </div>
        </div>
      </section>

      <div className="moldura pb-24">
        <p className="max-w-[52ch] text-lead md:hidden">{T.resumo}</p>
        <div className="mt-8 grid gap-14 md:mt-0 lg:grid-cols-2 lg:gap-16">
          <PrecosTransfer d={d} idioma={locale} className="entrar" />
          <ComoFuncionaTransfer d={d} className="entrar" />
        </div>
        <VeiculosTransfer d={d} idioma={locale} className="entrar mt-14" />
        <ul className="trilho entrar mt-10" aria-label={T.galeria}>
          {FOTOS_TRANSFER.map((f) => (
            <li key={f}>
              <div className="relative aspect-[4/5] overflow-hidden rounded-[4px]">
                <Image src={f} alt={T.galeria} fill sizes="(min-width: 1024px) 25vw, 70vw" className="object-cover" />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-14 grid gap-14 lg:grid-cols-2 lg:gap-16">
          <FichaTransfer d={d} className="entrar" />
          <RegrasTransfer d={d} className="entrar" />
        </div>
      </div>
    </main>
  );
}
