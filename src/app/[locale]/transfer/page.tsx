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
import { EMPRESA } from '@/config/empresa';
import { migalhas } from '@/lib/dados-estruturados';
import { DadosEstruturados } from '@/components/DadosEstruturados';
import { altDaFoto } from '@/data/fotos-alt';
import { Confianca } from '@/components/passeio/Confianca';
import { OpinioesPasseio } from '@/components/passeio/OpinioesPasseio';
import { TrajetoDoLink } from '@/components/transfer/TrajetoDoLink';
import { WidgetTransfer } from '@/components/transfer/WidgetTransfer';
import { FOTOS_TRANSFER, FOTO_TOPO_TRANSFER, TRAJETOS, precoDoTrajeto } from '@/data/transfer';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { avaliacoesDoSite } from '@/lib/avaliacao';
import { cambioParaTela } from '@/lib/cambio-tela';
import { comPromessasOnline } from '@/lib/promessas-online';
import { alternates, openGraphDaPagina, urlDoSite } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/transfer'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  return {
    title: d.meta.transferTitulo,
    description: d.transfer.resumo,
    alternates: alternates(locale, '/transfer'),
    openGraph: openGraphDaPagina(locale, { title: d.meta.transferTitulo, description: d.transfer.resumo, url: rota(locale, '/transfer') }),
  };
}

/**
 * Transfer privado: a foto real do carro na chegada ao hotel e, já na primeira tela, o cartão para montar
 * o trajeto e ver o preço; depois, os preços fixos, como funciona, os veículos, as fotos e as regras.
 */
export default async function Transfer({ params }: PageProps<'/[locale]/transfer'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  // o voucher na hora e o pagamento seguro das garantias embaixo do Reservar só com o pagamento online no ar, como no passeio
  const d = comPromessasOnline(dicionario(locale));
  const T = d.transfer;
  // o aproximado em dólar e a nota da cotação, só nas páginas em espanhol e inglês
  const cambio = await cambioParaTela(locale);
  // Pacote 34 (ENT-04): o cartão de opiniões do passeio, também aqui, com as do transfer primeiro (as marcadas com o
  // passeio "transfer"). Sem banco, a página abre sem ele: as avaliações nunca derrubam o transfer
  const avaliacoes = await avaliacoesDoSite().catch(() => []);
  // Pacote 34 (ENT-05): a linha do trajeto do link, embaixo do título, só com textos que já existem
  const textosTrajeto = {
    ateNPessoas: T.ateNPessoas,
    noPix: d.preco.noPix,
    noCartao: d.preco.noCartao,
    noPixComDesconto: d.preco.noPixComDesconto,
    dolar: d.preco.dolar,
  };
  const precos = TRAJETOS.flatMap((t) => (['carro', 'van'] as const).map((v) => precoDoTrajeto(t, v))).filter((p) => p !== null);
  const servico = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: T.titulo,
    description: T.resumo,
    url: `${urlDoSite()}${rota(locale, '/transfer')}`,
    provider: { '@type': 'TravelAgency', name: EMPRESA.marca, url: urlDoSite() },
    areaServed: ['Rio de Janeiro', 'Armação dos Búzios', 'Cabo Frio', 'Arraial do Cabo'],
    offers: {
      '@type': 'AggregateOffer',
      lowPrice: Math.min(...precos).toFixed(2),
      highPrice: Math.max(...precos).toFixed(2),
      offerCount: precos.length,
      priceCurrency: 'BRL',
    },
  };

  return (
    <main id="conteudo" className="tom-fundo">
      <section className="relative isolate md:min-h-[100svh]" aria-label={T.titulo}>
        {/* no celular, a foto tem 46% da altura da tela e cresce junto com a faixa quando ela não cabe (tela baixa, letra
            grande, trajeto comprido no link): a faixa fica embaixo e nunca passa do topo da foto nem vai para trás da
            cápsula do menu (o pt-6 deixa uma folga abaixo dela). No computador, a foto ocupa o topo inteiro, como antes */}
        <div className="relative flex min-h-[46svh] flex-col justify-end overflow-hidden pt-6 md:absolute md:inset-0 md:min-h-0 md:pt-0">
          <Image
            src={FOTO_TOPO_TRANSFER}
            alt={altDaFoto(FOTO_TOPO_TRANSFER, locale)}
            fill
            preload
            fetchPriority="high"
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: '50% 60%' }}
          />
          {/* no celular, o nome fica sobre a foto, numa faixa escurecida só onde há texto */}
          <div className="veu-baixo absolute inset-x-0 bottom-0 h-2/3 md:hidden" aria-hidden="true" />
          {/* a faixa entra no fluxo da foto (fica embaixo pelo justify-end) e o relative a deixa por cima do véu */}
          <div className="moldura relative pb-16 md:hidden">
            {/* Pacote 34 (ENT-04): as vantagens curtas, que antes só o computador mostrava, junto do nome, nas mesmas
                etiquetas de vidro e no mesmo lugar do topo dos passeios e do vidro do computador */}
            <div className="flex flex-wrap gap-1.5">
              {T.etiquetas.map((e) => (
                <span key={e} className="etiqueta vidro vidro-foto">
                  {e}
                </span>
              ))}
            </div>
            <h1 className="topo-passeio-titulo mt-3 text-white">{T.titulo}</h1>
            {/* Pacote 34 (ENT-05): com o trajeto no link, o trajeto e o preço logo embaixo do nome, no vidro escuro da barra
                de preço do celular */}
            <TrajetoDoLink
              idioma={locale}
              locale={LOCALE_INTL[locale]}
              dolar={cambio.taxa}
              textos={textosTrajeto}
              className="vidro vidro-escuro mt-3 max-w-[30rem] rounded-vidro px-3.5 py-2.5 text-small"
            />
          </div>
        </div>
        {/* o vidro ocupa o que sobra ao lado do cartão (até 30rem); só quando nem a maior parte dele que não quebra cabe ao
            lado (letra grande no tablet), o cartão desce para baixo do vidro, em vez de a página rolar de lado */}
        <div className="moldura relative -mt-10 pb-12 md:mt-0 md:flex md:flex-wrap md:items-start md:justify-between md:gap-10 md:pb-24 md:pt-28">
          {/* no computador, o nome e o resumo ficam num vidro sobre a foto; no celular, o nome vai na foto e o resumo depois do cartão */}
          <div className="vidro vidro-escuro hidden max-w-[30rem] rounded-[24px] p-7 text-white md:block md:grow md:basis-0">
            <div className="flex flex-wrap gap-1.5">
              {T.etiquetas.map((e) => (
                <span key={e} className="etiqueta vidro vidro-foto">
                  {e}
                </span>
              ))}
            </div>
            {/* o h1 de verdade é o da foto, no celular; este é o mesmo nome, no vidro do computador */}
            <p role="heading" aria-level={1} className="topo-passeio-titulo mt-3">
              {T.titulo}
            </p>
            {/* Pacote 34 (ENT-05): com o trajeto no link, o trajeto e o preço logo embaixo do nome */}
            <TrajetoDoLink
              idioma={locale}
              locale={LOCALE_INTL[locale]}
              dolar={cambio.taxa}
              textos={textosTrajeto}
              className="mt-3 border-t border-white/25 pt-3"
            />
            <p className="mt-3 text-lead">{T.resumo}</p>
          </div>
          <div className="w-full md:w-[27rem] md:shrink-0">
            <WidgetTransfer
              idioma={locale}
              locale={LOCALE_INTL[locale]}
              finalizarHref={rota(locale, '/checkout')}
              dolar={cambio.taxa}
              notaCambio={cambio.nota}
              garantias={<Confianca d={d} semClima />}
              textos={textosWidgetTransfer(d)}
            />
            {/* Pacote 34 (ENT-04): as opiniões logo depois do cartão, como no passeio */}
            <OpinioesPasseio avaliacoes={avaliacoes} slug="transfer" idioma={locale} d={d} className="mt-5" />
          </div>
        </div>
      </section>

      <div className="moldura pb-24">
        <p className="max-w-[52ch] text-lead md:hidden">{T.resumo}</p>
        <div className="mt-8 grid gap-14 md:mt-0 lg:grid-cols-2 lg:gap-16">
          <PrecosTransfer d={d} idioma={locale} dolar={cambio.taxa} className="entrar" />
          <ComoFuncionaTransfer d={d} className="entrar" />
        </div>
        <VeiculosTransfer d={d} idioma={locale} className="entrar mt-14" />
        <ul className="trilho entrar mt-10" aria-label={T.galeria}>
          {FOTOS_TRANSFER.map((f) => (
            <li key={f}>
              <div className="adiar relative aspect-[4/5] overflow-hidden rounded-[4px]">
                <Image src={f} alt={altDaFoto(f, locale)} fill sizes="(min-width: 1024px) 25vw, 70vw" className="object-cover" />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-14 grid gap-14 lg:grid-cols-2 lg:gap-16">
          <FichaTransfer d={d} className="entrar" />
          <RegrasTransfer d={d} className="entrar" />
        </div>
      </div>
      <DadosEstruturados dados={servico} />
      <DadosEstruturados dados={migalhas(locale, [{ nome: T.titulo, caminho: '/transfer' }])} />
    </main>
  );
}
