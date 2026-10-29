import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BilhetePasseio } from '@/components/BilhetePasseio';
import { Galeria } from '@/components/Galeria';
import { MidiaPasseio } from '@/components/MidiaPasseio';
import { WidgetReserva } from '@/components/WidgetReserva';
import { EMPRESA } from '@/config/empresa';
import { CIDADES, PASSEIOS, obterPasseio, passeiosAtivos } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { IDIOMAS, LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { nomeCategoria, nomeCidade, rotuloUnidade } from '@/lib/passeio-view';
import { formatarPreco, precoAdultoCentavos, tabelaPreco } from '@/lib/precos';
import { alternates, urlDoSite } from '@/lib/site';
import { linkWhatsApp } from '@/lib/whatsapp';

export const dynamicParams = false;

export function generateStaticParams() {
  return IDIOMAS.flatMap((locale) => PASSEIOS.filter((p) => p.ativo !== false).map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/passeios/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = obterPasseio(slug);
  if (!isIdioma(locale) || !p) return {};
  const d = dicionario(locale);
  const preco = formatarPreco(precoAdultoCentavos(p), locale);
  const descricao = `${p.resumo[locale]} ${d.comum.aPartirDe} ${preco} ${rotuloUnidade(p, d)}.`;
  return {
    title: `${p.nome[locale]} — ${preco}`,
    description: descricao,
    alternates: alternates(locale, `/passeios/${p.slug}`),
    openGraph: {
      title: `${p.nome[locale]} | ${EMPRESA.marca}`,
      description: descricao,
      url: rota(locale, `/passeios/${p.slug}`),
    },
  };
}

export default async function PaginaPasseio({ params }: PageProps<'/[locale]/passeios/[slug]'>) {
  const { locale, slug } = await params;
  const p = obterPasseio(slug);
  if (!isIdioma(locale) || !p) notFound();
  const d = dicionario(locale);
  const preco = precoAdultoCentavos(p);
  const outros = passeiosAtivos()
    .filter((o) => o.cidade === p.cidade && o.slug !== p.slug)
    .slice(0, 3);
  const unidadeSingular = p.unidade === 'veiculo' ? d.comum.veiculo : d.comum.embarcacao;
  const unidadePlural = p.unidade === 'veiculo' ? d.comum.veiculos : d.comum.embarcacoes;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.nome[locale],
    description: p.resumo[locale],
    category: nomeCategoria(p, locale),
    brand: { '@type': 'Brand', name: EMPRESA.marca },
    ...(p.fotos.length ? { image: p.fotos.map((f) => `${urlDoSite()}${f}`) } : {}),
    offers: {
      '@type': 'Offer',
      price: (preco / 100).toFixed(2),
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
      url: `${urlDoSite()}${rota(locale, `/passeios/${p.slug}`)}`,
      seller: { '@type': 'Organization', name: EMPRESA.marca },
    },
  };

  return (
    <>
      {/* barra fixa no celular com o preço e o atalho para a reserva */}
      <style>{`@media (max-width: 1023px){:root{--barra-inferior:84px}}`}</style>
      <div className="fixed inset-x-0 bottom-0 z-30 bg-tinta text-white lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="moldura flex h-[84px] items-center justify-between gap-4">
          <p className="leading-tight">
            <span className="block text-small text-white/85">{d.comum.aPartirDe}</span>
            <span className="block text-[1.375rem] font-bold">{formatarPreco(preco, locale)}</span>
          </p>
          <a href="#reservar" className="botao botao-coral">
            {d.passeio.reservar}
          </a>
        </div>
      </div>

      <div className="moldura pb-24 pt-6 md:pt-10">
        <Link
          href={rota(locale, '/passeios')}
          className="inline-flex min-h-11 items-center gap-2 font-semibold underline-offset-4 hover:underline"
        >
          <span aria-hidden="true">←</span> {d.nav.passeios}
        </Link>

        <div className="mt-4 grid gap-10 lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            {p.fotos.length > 0 ? (
              <Galeria
                fotos={p.fotos}
                alt={p.nome[locale]}
                textos={{ galeria: d.passeio.galeria, anterior: d.passeio.fotoAnterior, proxima: d.passeio.proximaFoto }}
              />
            ) : (
              <MidiaPasseio
                passeio={p}
                idioma={locale}
                sizes="(min-width: 1024px) 60vw, 100vw"
                prioridade
                className="aspect-[4/3] w-full"
              />
            )}

            <div className="mt-8">
              <p className="font-semibold">
                <Link
                  href={`${rota(locale, '/passeios')}?cidade=${p.cidade}`}
                  className="underline decoration-turquesa decoration-[3px] underline-offset-[6px]"
                >
                  {CIDADES[p.cidade].nome[locale]}
                </Link>{' '}
                · {nomeCategoria(p, locale)}
              </p>
              <h1 className="mt-3 text-[clamp(2rem,1.4rem+2.6vw,3.5rem)] font-bold leading-[1.05]">{p.nome[locale]}</h1>
              <p className="mt-4 max-w-[52ch] text-lead">{p.resumo[locale]}</p>
              <dl className="mt-6 flex flex-wrap gap-3">
                <div className="bg-areia-clara px-4 py-3">
                  <dt className="text-small">{d.comum.duracaoAprox}</dt>
                  <dd className="font-bold">{p.duracao[locale]}</dd>
                </div>
                <div className="bg-areia-clara px-4 py-3">
                  <dt className="text-small">{d.comum.aPartirDe}</dt>
                  <dd className="font-bold">
                    {formatarPreco(preco, locale)} <span className="font-normal">{rotuloUnidade(p, d)}</span>
                  </dd>
                </div>
              </dl>
            </div>

            <section className="mt-14" aria-labelledby="sobre">
              <h2 id="sobre" className="text-[1.75rem] font-bold">
                {d.passeio.sobre}
              </h2>
              <div className="texto-corrido mt-4 max-w-[62ch]">
                {p.descricao[locale].split('\n\n').map((par) => (
                  <p key={par.slice(0, 24)}>{par}</p>
                ))}
              </div>
            </section>

            <div className="mt-14 grid gap-4 md:grid-cols-2">
              <section aria-labelledby="inclui" className="bg-turquesa-clara px-6 py-6">
                <h2 id="inclui" className="text-[1.375rem] font-bold">
                  {d.passeio.inclui}
                </h2>
                <ul className="mt-4 space-y-2">
                  {p.inclui[locale].map((i) => (
                    <li key={i} className="flex gap-3">
                      <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-oceano" fill="currentColor" aria-hidden="true">
                        <path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z" />
                      </svg>
                      {i}
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="nao-inclui" className="bg-areia-clara px-6 py-6">
                <h2 id="nao-inclui" className="text-[1.375rem] font-bold">
                  {d.passeio.naoInclui}
                </h2>
                <ul className="mt-4 space-y-2">
                  {p.naoInclui[locale].map((i) => (
                    <li key={i} className="flex gap-3">
                      <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-coral-forte" fill="currentColor" aria-hidden="true">
                        <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6Z" />
                      </svg>
                      {i}
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <section className="mt-14" aria-labelledby="roteiro">
              <h2 id="roteiro" className="text-[1.75rem] font-bold">
                {d.passeio.roteiro}
              </h2>
              <ol className="mt-5 space-y-0">
                {p.roteiro[locale].map((parada, i, todas) => (
                  <li key={parada} className="relative flex gap-4 pb-5">
                    <span className="relative z-10 mt-1 size-4 shrink-0 rounded-full bg-coral" aria-hidden="true" />
                    {i < todas.length - 1 && <span className="absolute left-[7px] top-5 h-full w-[2px] bg-areia" aria-hidden="true" />}
                    <span>{parada}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-10" aria-labelledby="levar">
              <h2 id="levar" className="text-[1.75rem] font-bold">
                {d.passeio.levar}
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {p.levar[locale].map((i) => (
                  <li key={i} className="bg-sol-claro px-4 py-2">
                    {i}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-6">
              <WidgetReserva
                slug={p.slug}
                nome={p.nome[locale]}
                tabela={tabelaPreco(p)}
                locale={LOCALE_INTL[locale]}
                checkoutHref={rota(locale, `/checkout/${p.slug}`)}
                whatsappHref={linkWhatsApp(fmt(d.passeio.msgDuvida, { passeio: p.nome[locale] }))}
                textos={{
                  titulo: d.passeio.reservarTitulo,
                  data: d.passeio.data,
                  adultos: d.comum.adultos,
                  criancas: d.comum.criancas,
                  criancasAjuda: d.checkout.criancasAjuda,
                  total: d.passeio.total,
                  reservar: d.passeio.reservar,
                  duvidas: d.passeio.duvidas,
                  politica: d.passeio.politica,
                  escolhaData: d.passeio.escolhaData,
                  unidadesAviso: d.passeio.unidadesAviso,
                  pessoa: d.comum.pessoa,
                  pessoas: d.comum.pessoas,
                  unidadeSingular,
                  unidadePlural,
                  rotuloUnidade: rotuloUnidade(p, d),
                  aPartirDe: d.comum.aPartirDe,
                  diminuir: d.comum.diminuir,
                  aumentar: d.comum.aumentar,
                  revisao: d.passeio.revisao,
                }}
              />
            </div>
          </aside>
        </div>

        {outros.length > 0 && (
          <section className="mt-24 md:mt-32" aria-labelledby="outros">
            <h2 id="outros" className="titulo-display text-head">
              {fmt(d.passeio.outros, { cidade: nomeCidade(p, locale) })}
            </h2>
            <ul className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {outros.map((o) => (
                <li key={o.slug}>
                  <BilhetePasseio passeio={o} idioma={locale} d={d} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
