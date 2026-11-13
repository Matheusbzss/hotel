import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { migalhas, precoNosDados } from '@/lib/dados-estruturados';
import { CardTransfer } from '@/components/transfer/CardTransfer';
import { DadosEstruturados } from '@/components/DadosEstruturados';
import { CardPasseio } from '@/components/CardPasseio';
import { BarraReservaMovel } from '@/components/BarraReservaMovel';
import { ListaMarcada } from '@/components/ListaMarcada';
import { Confianca } from '@/components/passeio/Confianca';
import { OpinioesPasseio } from '@/components/passeio/OpinioesPasseio';
import { TopoPasseio } from '@/components/passeio/TopoPasseio';
import { WidgetReserva } from '@/components/WidgetReserva';
import { EMPRESA } from '@/config/empresa';
import { PASSEIOS, horariosDoPasseio, obterPasseio, passeiosAtivos } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { IDIOMAS, LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { texto, textoOpcional } from '@/i18n/conteudo';
import { avaliacoesDoSite } from '@/lib/avaliacao';
import { itemBoletim } from '@/lib/boletim';
import { cambioParaTela } from '@/lib/cambio-tela';
import { formatarCifra } from '@/lib/cifra';
import { textoHorarios } from '@/lib/horarios';
import { precoPixCentavos } from '@/lib/orcamento';
import { contadoresPessoas, descricaoParaBusca, nomeCategoria, nomeCidade, regrasCriancas, rotuloUnidade } from '@/lib/passeio-view';
import { opcoesPasseio, precoAPartirCentavos, precoVendaCentavos, tabelaPreco, temOpcoes } from '@/lib/precos';
import { comPromessasOnline } from '@/lib/promessas-online';
import { alternates, openGraphDaPagina, urlDoSite } from '@/lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return IDIOMAS.flatMap((locale) => PASSEIOS.filter((p) => p.ativo !== false).map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/passeios/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = obterPasseio(slug);
  if (!isIdioma(locale) || !p) return {};
  const descricao = descricaoParaBusca(p, locale, dicionario(locale));
  return {
    title: textoOpcional(p.tituloBusca, locale) ?? texto(p.nome, locale),
    description: descricao,
    alternates: alternates(locale, `/passeios/${p.slug}`),
    openGraph: openGraphDaPagina(locale, {
      title: `${texto(p.nome, locale)} | ${EMPRESA.marca}`,
      description: descricao,
      url: rota(locale, `/passeios/${p.slug}`),
    }),
  };
}

export default async function PaginaPasseio({ params }: PageProps<'/[locale]/passeios/[slug]'>) {
  const { locale, slug } = await params;
  const p = obterPasseio(slug);
  if (!isIdioma(locale) || !p) notFound();
  // o voucher na hora e o pagamento seguro do quadro ao lado do Reservar só com o pagamento online no ar
  const d = comPromessasOnline(dicionario(locale));
  const intl = LOCALE_INTL[locale];
  const aPartir = precoAPartirCentavos(p);
  const opcoes = opcoesPasseio(p);
  const item = itemBoletim(p, locale, d);
  // outros passeios da cidade, primeiro os que têm foto
  const outros = passeiosAtivos()
    .filter((o) => o.cidade === p.cidade && o.slug !== p.slug)
    .sort((a, b) => Number(b.fotos.length > 0) - Number(a.fotos.length > 0))
    .slice(0, 3);
  const unidadeSingular = p.unidade === 'veiculo' ? d.comum.veiculo : d.comum.embarcacao;
  const unidadePlural = p.unidade === 'veiculo' ? d.comum.veiculos : d.comum.embarcacoes;
  const regras = regrasCriancas(p, d);
  const horarios = horariosDoPasseio(p);
  // o aproximado em dólar e a nota da cotação, só nas páginas em espanhol e inglês
  const cambio = await cambioParaTela(locale);
  // sem banco, a página abre sem o cartão de opiniões: as avaliações nunca derrubam o passeio
  const avaliacoes = await avaliacoesDoSite().catch(() => []);
  const rotuloHorario = horarios.busca ? d.horario.busca : horarios.horas.length === 1 ? d.horario.saida : d.horario.saidas;

  const endereco = `${urlDoSite()}${rota(locale, `/passeios/${p.slug}`)}`;
  const precos = opcoes.map((o) => precoVendaCentavos(o.preco));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: texto(p.nome, locale),
    description: texto(p.resumo, locale),
    category: nomeCategoria(p, locale),
    sku: p.slug,
    url: endereco,
    brand: { '@type': 'Brand', name: EMPRESA.marca },
    ...(p.fotos.length ? { image: p.fotos.map((f) => `${urlDoSite()}${f}`) } : {}),
    // o preço do cartão, o mesmo que aparece na página; com opções de preços diferentes, vai a faixa
    offers:
      Math.max(...precos) > aPartir
        ? {
            '@type': 'AggregateOffer',
            lowPrice: precoNosDados(aPartir),
            highPrice: precoNosDados(Math.max(...precos)),
            offerCount: precos.length,
            priceCurrency: 'BRL',
            availability: 'https://schema.org/InStock',
            url: endereco,
          }
        : {
            '@type': 'Offer',
            price: precoNosDados(aPartir),
            priceCurrency: 'BRL',
            availability: 'https://schema.org/InStock',
            url: endereco,
            seller: { '@type': 'Organization', name: EMPRESA.marca },
          },
  };

  return (
    <main id="conteudo" className="tom-fundo">
      {/* barra de vidro no celular com os dois preços (Pix em destaque) e o atalho para a reserva */}
      <BarraReservaMovel
        preco={formatarCifra(precoPixCentavos(aPartir), intl)}
        unidade={item.temOpcoes ? `${d.preco.noPix} · ${d.boletim.desde}` : d.preco.noPix}
        detalhe={
          <p className="truncate text-caption text-white/80">
            {formatarCifra(aPartir, intl)} {d.preco.noCartao} · {item.paraQuem}
          </p>
        }
        textos={{ reservar: d.passeio.reservar }}
      />

      <TopoPasseio
        passeio={p}
        idioma={locale}
        d={d}
        textosGaleria={{
          galeria: d.passeio.galeria,
          verFotos: d.passeio.verFotos,
          anterior: d.passeio.fotoAnterior,
          proxima: d.passeio.proximaFoto,
          fechar: d.comum.fechar,
          fotoDe: d.passeio.fotoDe,
        }}
      />

      <div className="moldura pb-24">
        <div className="mt-12 grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <p className="chegar max-w-[52ch] text-lead">{texto(p.resumo, locale)}</p>
            {/* a ficha do passeio: o que a pessoa confere antes de reservar */}
            <dl className="ficha entrar mt-6">
              <div>
                <dt>{d.comum.duracaoAprox}</dt>
                <dd>{texto(p.duracao, locale)}</dd>
              </div>
              <div>
                <dt>{d.comum.tipo}</dt>
                <dd>{nomeCategoria(p, locale)}</dd>
              </div>
              <div className="largo">
                <dt>{d.comum.regras.titulo}</dt>
                <dd>{regras.join(' ')}</dd>
              </div>
              <div className="largo">
                <dt>{rotuloHorario}</dt>
                <dd>{textoHorarios(horarios.horas, locale, intl, d.horario.deHoraEmHora)}</dd>
              </div>
              {/* com busca, o encontro é na hospedagem; sem busca, a equipe manda o ponto depois da reserva */}
              {!horarios.busca && (
                <div className="largo">
                  <dt>{d.passeio.encontro}</dt>
                  <dd>{d.passeio.encontroTexto}</dd>
                </div>
              )}
            </dl>

            <section className="entrar mt-14" aria-labelledby="sobre">
              <h2 id="sobre" className="text-lead font-semibold">
                {d.passeio.sobre}
              </h2>
              <div className="texto-corrido mt-4 max-w-[62ch]">
                {texto(p.descricao, locale)
                  .split('\n\n')
                  .map((par) => (
                    <p key={par.slice(0, 24)}>{par}</p>
                  ))}
              </div>
            </section>

            <div className="entrar mt-14 grid gap-10 md:grid-cols-2">
              <ListaMarcada titulo={d.passeio.inclui} id="inclui" itens={texto(p.inclui, locale)} marca="sim" />
              <ListaMarcada titulo={d.passeio.naoInclui} id="nao-inclui" itens={texto(p.naoInclui, locale)} marca="nao" />
            </div>

            <section className="entrar mt-14" aria-labelledby="roteiro">
              <h2 id="roteiro" className="text-lead font-semibold">
                {d.passeio.roteiro}
              </h2>
              <ol className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {texto(p.roteiro, locale).map((parada, i) => (
                  <li key={parada} className="flex gap-4">
                    <span className="numeros w-6 shrink-0 font-semibold text-(--color-turquesa-texto)" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span>{parada}</span>
                  </li>
                ))}
              </ol>
            </section>

            <section className="entrar mt-14" aria-labelledby="levar">
              <h2 id="levar" className="text-lead font-semibold">
                {d.passeio.levar}
              </h2>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {texto(p.levar, locale).map((i) => (
                  <li key={i} className="rounded-full bg-superficie px-4 py-2">
                    {i}
                  </li>
                ))}
              </ul>
            </section>

            {/* o que vale no dia (embarque, documento, taxas, saúde, roteiro): saiu da página inicial na Etapa 8 e
                fica aqui, fechado, até a pessoa tocar */}
            <details className="entrar celula group mt-14">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <h2 className="text-lead font-semibold">{d.home.diaTitulo}</h2>
                <svg
                  viewBox="0 0 24 24"
                  className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-180"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.75" />
                </svg>
              </summary>
              <ul className="grid gap-2 px-4 pb-5 text-small">
                {d.home.diaRegras.map((r) => (
                  <li key={r} className="flex gap-2.5">
                    <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-(--color-turquesa-texto)" aria-hidden="true" />
                    {r}
                  </li>
                ))}
              </ul>
            </details>
          </div>

          <aside className="lg:col-span-5">
            {/* abaixo da cápsula do menu, que também fica presa no topo */}
            <div className="lg:sticky lg:top-24">
              <WidgetReserva
                slug={p.slug}
                nome={texto(p.nome, locale)}
                horas={horarios.horas}
                opcoes={opcoes.map((o) => ({ id: o.id, nome: texto(o.nome, locale), tabela: tabelaPreco(p, o) }))}
                mostrarOpcoes={temOpcoes(p)}
                contadores={contadoresPessoas(tabelaPreco(p), d)}
                regras={regras}
                locale={intl}
                finalizarHref={rota(locale, '/checkout')}
                garantias={<Confianca d={d} />}
                dolar={cambio.taxa}
                notaCambio={cambio.nota}
                textos={{
                  titulo: d.passeio.reservarTitulo,
                  data: d.passeio.data,
                  total: d.passeio.total,
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
                  semCobranca: d.carrinho.semCobranca,
                  semHorarioHoje: d.checkout.erros.semHorarioHoje,
                  noPix: d.preco.noPix,
                  noCartao: d.preco.noCartao,
                  dolar: d.preco.dolar,
                  rotuloHorario: horarios.busca ? d.horario.busca : d.horario.saida,
                  escolhaHorario: d.carrinho.escolhaHorario,
                  adicionar: d.carrinho.adicionar,
                  reservarAgora: d.carrinho.reservarAgora,
                  adicionando: d.carrinho.adicionando,
                  erroAdicionar: d.carrinho.erroAdicionar,
                  cheio: d.carrinho.cheio,
                }}
              />
              {/* no celular, logo abaixo do cartão de reserva; no computador, preso junto com ele na coluna */}
              <OpinioesPasseio avaliacoes={avaliacoes} slug={p.slug} idioma={locale} d={d} className="mt-5" />
            </div>
          </aside>
        </div>

        <section id="outros-passeios" className="mt-24 md:mt-32" aria-labelledby="outros">
          <h2 id="outros" className="titulo entrar">
            {outros.length > 0 ? fmt(d.passeio.outros, { cidade: nomeCidade(p, locale) }) : d.transfer.titulo}
          </h2>
          <ul className="trilho mt-6 md:mt-8">
            {outros.map((o) => (
              <li key={o.slug}>
                <CardPasseio passeio={o} idioma={locale} d={d} mostrarCidade={false} />
              </li>
            ))}
            {/* como na inicial, o transfer é mais uma opção da cidade */}
            <li>
              <CardTransfer cidade={p.cidade} idioma={locale} d={d} />
            </li>
          </ul>
        </section>
      </div>
      <DadosEstruturados dados={jsonLd} />
      <DadosEstruturados
        dados={migalhas(locale, [
          { nome: d.nav.passeios, caminho: '/passeios' },
          { nome: texto(p.nome, locale), caminho: `/passeios/${p.slug}` },
        ])}
      />
    </main>
  );
}
