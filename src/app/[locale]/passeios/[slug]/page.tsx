import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CardPasseio } from '@/components/CardPasseio';
import { GaleriaPasseio } from '@/components/GaleriaPasseio';
import { BarraReservaMovel } from '@/components/BarraReservaMovel';
import { MidiaPasseio } from '@/components/MidiaPasseio';
import { WidgetReserva } from '@/components/WidgetReserva';
import { EMPRESA } from '@/config/empresa';
import { CIDADES, PASSEIOS, obterPasseio, passeiosAtivos } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { IDIOMAS, LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { contadoresPessoas, nomeCategoria, nomeCidade, regrasCriancas, rotuloUnidade } from '@/lib/passeio-view';
import { formatarPreco, opcoesPasseio, precoAPartirCentavos, tabelaPreco, temOpcoes } from '@/lib/precos';
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
  const preco = formatarPreco(precoAPartirCentavos(p), locale);
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

function Lista({ titulo, id, itens, marca }: { titulo: string; id: string; itens: string[]; marca: 'sim' | 'nao' }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lead font-bold text-sol">
        {titulo}
      </h2>
      <ul className="mt-4 space-y-2.5">
        {itens.map((i) => (
          <li key={i} className="flex gap-3">
            <svg viewBox="0 0 24 24" className="mt-1 size-5 shrink-0" fill="currentColor" aria-hidden="true">
              {marca === 'sim' ? (
                <path d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z" />
              ) : (
                <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6Z" />
              )}
            </svg>
            {i}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function PaginaPasseio({ params }: PageProps<'/[locale]/passeios/[slug]'>) {
  const { locale, slug } = await params;
  const p = obterPasseio(slug);
  if (!isIdioma(locale) || !p) notFound();
  const d = dicionario(locale);
  const aPartir = precoAPartirCentavos(p);
  const opcoes = opcoesPasseio(p);
  // outros passeios da cidade, primeiro os que têm foto
  const outros = passeiosAtivos()
    .filter((o) => o.cidade === p.cidade && o.slug !== p.slug)
    .sort((a, b) => Number(b.fotos.length > 0) - Number(a.fotos.length > 0))
    .slice(0, 4);
  const unidadeSingular = p.unidade === 'veiculo' ? d.comum.veiculo : d.comum.embarcacao;
  const unidadePlural = p.unidade === 'veiculo' ? d.comum.veiculos : d.comum.embarcacoes;
  const regras = regrasCriancas(p, d);

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
      price: (aPartir / 100).toFixed(2),
      priceCurrency: 'BRL',
      availability: 'https://schema.org/InStock',
      url: `${urlDoSite()}${rota(locale, `/passeios/${p.slug}`)}`,
      seller: { '@type': 'Organization', name: EMPRESA.marca },
    },
  };

  return (
    <main id="conteudo" className="tom-mar">
      {/* barra fixa no celular com o preço e o atalho para a reserva */}
      <BarraReservaMovel rotuloPreco={d.comum.aPartirDe} preco={formatarPreco(aPartir, locale)} rotuloBotao={d.passeio.reservar} />

      <div className="moldura pb-24 pt-4 md:pt-8">
        <div className="chegar">
          <h1 className="max-w-[22ch] text-head font-bold text-sol">{p.nome[locale]}</h1>
        </div>

        <div className="mt-8">
          {p.fotos.length > 0 ? (
            <GaleriaPasseio
              fotos={p.fotos}
              alt={p.nome[locale]}
              textos={{
                galeria: d.passeio.galeria,
                verFotos: d.passeio.verFotos,
                anterior: d.passeio.fotoAnterior,
                proxima: d.passeio.proximaFoto,
                fechar: d.comum.fechar,
                fotoDe: d.passeio.fotoDe,
              }}
            />
          ) : (
            <MidiaPasseio
              passeio={p}
              idioma={locale}
              sizes="(min-width: 768px) 70vw, 100vw"
              prioridade
              className="-mx-(--margem) aspect-[4/5] md:mx-0 md:aspect-[16/7]"
            />
          )}
        </div>

        <div className="mt-10 grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <p className="chegar max-w-[52ch] text-lead">
              <span>{p.resumo[locale]}</span>
            </p>
            <dl className="entrar mt-8 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
              <div>
                <dt className="text-small text-(--tinta-suave)">{d.comum.duracaoAprox}</dt>
                <dd className="mt-0.5 font-semibold">{p.duracao[locale]}</dd>
              </div>
              <div>
                <dt className="text-small text-(--tinta-suave)">{d.comum.cidade}</dt>
                <dd className="mt-0.5 font-semibold">
                  <Link href={`${rota(locale, '/passeios')}?cidade=${p.cidade}`} className="link">
                    {CIDADES[p.cidade].nome[locale]}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-small text-(--tinta-suave)">{d.comum.tipo}</dt>
                <dd className="mt-0.5 font-semibold">{nomeCategoria(p, locale)}</dd>
              </div>
              <div>
                <dt className="text-small text-(--tinta-suave)">{d.comum.aPartirDe}</dt>
                <dd className="mt-0.5 font-semibold">
                  <span className="numeros">{formatarPreco(aPartir, locale)}</span> {rotuloUnidade(p, d)}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-small text-(--tinta-suave)">{d.comum.regras.titulo}</dt>
                <dd className="mt-0.5 font-semibold">{regras.join(' ')}</dd>
              </div>
            </dl>

            <section className="entrar mt-14" aria-labelledby="sobre">
              <h2 id="sobre" className="text-lead font-bold text-sol">
                {d.passeio.sobre}
              </h2>
              <div className="texto-corrido mt-4 max-w-[62ch]">
                {p.descricao[locale].split('\n\n').map((par) => (
                  <p key={par.slice(0, 24)}>{par}</p>
                ))}
              </div>
            </section>

            <div className="entrar mt-14 grid gap-10 md:grid-cols-2">
              <Lista titulo={d.passeio.inclui} id="inclui" itens={p.inclui[locale]} marca="sim" />
              <Lista titulo={d.passeio.naoInclui} id="nao-inclui" itens={p.naoInclui[locale]} marca="nao" />
            </div>

            <section className="entrar mt-14" aria-labelledby="roteiro">
              <h2 id="roteiro" className="text-lead font-bold text-sol">
                {d.passeio.roteiro}
              </h2>
              <ol className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {p.roteiro[locale].map((parada, i) => (
                  <li key={parada} className="flex gap-4">
                    <span className="numeros w-6 shrink-0 font-bold text-sol" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{parada}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="entrar mt-14" aria-labelledby="levar">
              <h2 id="levar" className="text-lead font-bold text-sol">
                {d.passeio.levar}
              </h2>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {p.levar[locale].map((i) => (
                  <li key={i} className="bg-mar-2 px-3.5 py-2">
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
                opcoes={opcoes.map((o) => ({ id: o.id, nome: o.nome[locale], tabela: tabelaPreco(p, o) }))}
                mostrarOpcoes={temOpcoes(p)}
                contadores={contadoresPessoas(tabelaPreco(p), d)}
                regras={regras}
                locale={LOCALE_INTL[locale]}
                checkoutHref={rota(locale, `/checkout/${p.slug}`)}
                whatsappHref={linkWhatsApp(fmt(d.passeio.msgDuvida, { passeio: p.nome[locale] }))}
                textos={{
                  titulo: d.passeio.reservarTitulo,
                  data: d.passeio.data,
                  total: d.passeio.total,
                  reservar: d.passeio.reservar,
                  duvidas: d.passeio.duvidas,
                  politica: d.passeio.politica,
                  escolhaData: d.passeio.escolhaData,
                  escolhaOpcao: d.passeio.escolhaOpcao,
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
          <section id="outros-passeios" className="mt-24 md:mt-40" aria-labelledby="outros">
            <h2 id="outros" className="titulo entrar font-bold text-sol">
              <span>{fmt(d.passeio.outros, { cidade: nomeCidade(p, locale) })}</span>
            </h2>
            <ul className="mt-10 grid gap-x-6 gap-y-8 sm:grid-cols-2 sm:gap-y-12 lg:grid-cols-4">
              {outros.map((o) => (
                <li key={o.slug} className="entrar">
                  <CardPasseio passeio={o} idioma={locale} d={d} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
