import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BarraReservaMovel } from '@/components/BarraReservaMovel';
import { CardCasa } from '@/components/casas/CardCasa';
import { MapaCasa } from '@/components/casas/MapaCasa';
import { ReservaCasa } from '@/components/casas/ReservaCasa';
import { GaleriaPasseio } from '@/components/GaleriaPasseio';
import { ListaMarcada } from '@/components/ListaMarcada';
import { EMPRESA } from '@/config/empresa';
import { RESERVA_CASAS_ABERTA } from '@/data/casas';
import { CIDADES } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { IDIOMAS, LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { noitesOcupadas } from '@/lib/casa';
import { casasAtivas, obterCasa, periodosOcupados } from '@/lib/casas';
import { formatarCifra } from '@/lib/cifra';
import { SINAL_PORCENTO, menorDiaria } from '@/lib/diarias';
import { alternates } from '@/lib/site';
import { hojeEmBuzios } from '@/lib/validacao';

// a página é refeita uma vez por dia, para os dias e os períodos que já passaram saírem dela; a casa nova
// abre na primeira visita
export const revalidate = 86400;

export async function generateStaticParams() {
  const casas = await casasAtivas();
  return IDIOMAS.flatMap((locale) => casas.map((c) => ({ locale, slug: c.slug })));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/casas-de-temporada/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  const c = await obterCasa(slug);
  if (!isIdioma(locale) || !c) return {};
  const d = dicionario(locale);
  const descricao = `${c.resumo[locale]} ${d.casas.diariaAPartir} ${formatarCifra(menorDiaria(c) * 100, LOCALE_INTL[locale])}.`;
  return {
    title: `${c.nome[locale]} — ${c.local[locale]}`,
    description: descricao,
    alternates: alternates(locale, `/casas-de-temporada/${c.slug}`),
    openGraph: {
      title: `${c.nome[locale]} | ${EMPRESA.marca}`,
      description: descricao,
      url: rota(locale, `/casas-de-temporada/${c.slug}`),
    },
  };
}

/** Lista sem sinal de sim ou não: regras da casa e de cancelamento. */
function ListaPontos({ titulo, id, itens }: { titulo: string; id: string; itens: string[] }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-lead font-semibold">
        {titulo}
      </h2>
      <ul className="mt-4 space-y-2.5">
        {itens.map((i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-(--color-tinta)" aria-hidden="true" />
            {i}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function PaginaCasa({ params }: PageProps<'/[locale]/casas-de-temporada/[slug]'>) {
  const { locale, slug } = await params;
  const c = await obterCasa(slug);
  if (!isIdioma(locale) || !c) notFound();
  const d = dicionario(locale);
  const t = d.casas;
  const intl = LOCALE_INTL[locale];
  const cifra = (reais: number) => formatarCifra(reais * 100, intl);
  const formatoData = new Intl.DateTimeFormat(intl, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const data = (iso: string) => formatoData.format(new Date(`${iso}T12:00:00Z`));
  const minimo = (n: number) => (n > 1 ? fmt(t.minimoDe, { n }) : '');
  const tamanho = `${fmt(t.quartos, { n: c.quartos })} · ${fmt(t.capacidade, { n: c.capacidade })}`;
  const hoje = hojeEmBuzios();
  const periodos = [...c.temporadas, ...c.feriados].filter((p) => p.ate >= hoje).sort((a, b) => a.de.localeCompare(b.de));
  // cada linha da tabela: o nome, o valor e as notas embaixo (as datas e o mínimo de noites)
  const valores = [
    { chave: 'diaria', titulo: t.diaria, notas: [minimo(c.minimoNoites)], valor: c.diaria },
    ...periodos.map((p) => ({
      chave: `${p.de}-${p.nome.pt}`,
      titulo: p.nome[locale],
      notas: [fmt(t.periodo, { de: data(p.de), ate: data(p.ate) }), minimo(Math.max(c.minimoNoites, p.minimoNoites ?? 0))],
      valor: p.diaria,
    })),
    ...(c.taxaLimpeza > 0 ? [{ chave: 'limpeza', titulo: t.taxaLimpeza, notas: [], valor: c.taxaLimpeza }] : []),
    ...(c.caucao > 0 ? [{ chave: 'caucao', titulo: t.caucao, notas: [], valor: c.caucao }] : []),
  ].map((v) => ({ ...v, notas: v.notas.filter(Boolean) }));
  const outras = (await casasAtivas()).filter((o) => o.slug !== c.slug).slice(0, 4);
  const ocupadas = noitesOcupadas(await periodosOcupados(c.id), hoje);

  return (
    <main id="conteudo" className="tom-fundo">
      <BarraReservaMovel
        preco={cifra(menorDiaria(c))}
        unidade={`${t.porNoite} · ${d.comum.aPartirDe}`}
        detalhe={<p className="truncate text-caption text-white/80">{tamanho}</p>}
        textos={{ reservar: t.verDatas }}
      />

      {/* as fotos de borda a borda, com a cidade, a praia, o nome e a ficha em vidro fosco por cima */}
      <section className="topo-passeio" aria-labelledby="casa-titulo">
        <div className="topo-passeio-fotos">
          {c.fotos.length > 0 && (
            <GaleriaPasseio
              fotos={c.fotos}
              alt={c.nome[locale]}
              textos={{
                galeria: t.galeria,
                verFotos: d.passeio.verFotos,
                anterior: d.passeio.fotoAnterior,
                proxima: d.passeio.proximaFoto,
                fechar: d.comum.fechar,
                fotoDe: d.passeio.fotoDe,
              }}
            />
          )}
        </div>
        <div className="topo-passeio-texto">
          <div className="moldura">
            <div className="flex flex-wrap gap-1.5">
              <span className="etiqueta vidro vidro-foto">{CIDADES[c.cidade].nome[locale]}</span>
              <span className="etiqueta vidro vidro-foto">{c.local[locale]}</span>
            </div>
            <h1 id="casa-titulo" className="topo-passeio-titulo mt-3">
              {c.nome[locale]}
            </h1>
            <dl className="ficha-vidro vidro vidro-foto mt-4">
              <div>
                <dt>{t.ficha.quartos}</dt>
                <dd>{c.quartos}</dd>
              </div>
              <div>
                <dt>{t.ficha.suites}</dt>
                <dd>{c.suites}</dd>
              </div>
              <div>
                <dt>{t.ficha.banheiros}</dt>
                <dd>{c.banheiros}</dd>
              </div>
              <div>
                <dt>{t.ficha.capacidade}</dt>
                <dd>{c.capacidade}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className="moldura pb-24">
        <div className="mt-10 grid gap-12 lg:mt-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <p className="chegar flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-small text-(--color-tinta-suave)">{t.diariaAPartir}</span>
              <strong className="cifra text-figure">{cifra(menorDiaria(c))}</strong>
            </p>
            <p className="chegar mt-4 max-w-[52ch] text-lead">{c.resumo[locale]}</p>
            <dl className="ficha entrar mt-6">
              <div>
                <dt>{t.ficha.checkIn}</dt>
                <dd>{c.checkIn}</dd>
              </div>
              <div>
                <dt>{t.ficha.checkOut}</dt>
                <dd>{c.checkOut}</dd>
              </div>
              {c.camas[locale].length > 0 && (
                <div className="largo">
                  <dt>{t.ficha.camas}</dt>
                  <dd>{c.camas[locale].join(' · ')}</dd>
                </div>
              )}
            </dl>

            <section className="entrar mt-14" aria-labelledby="sobre">
              <h2 id="sobre" className="text-lead font-semibold">
                {t.sobre}
              </h2>
              <div className="texto-corrido mt-4 max-w-[62ch]">
                {c.descricao[locale].split('\n\n').map((par) => (
                  <p key={par.slice(0, 24)}>{par}</p>
                ))}
              </div>
            </section>

            {c.comodidades[locale].length > 0 && (
              <div className="entrar mt-14">
                <ListaMarcada titulo={t.comodidades} id="comodidades" itens={c.comodidades[locale]} marca="sim" />
              </div>
            )}

            <div className="entrar mt-14 grid gap-10 md:grid-cols-2">
              {c.regras[locale].length > 0 && <ListaPontos titulo={t.regras} id="regras" itens={c.regras[locale]} />}
              {c.cancelamento[locale].length > 0 && (
                <ListaPontos titulo={t.cancelamento} id="cancelamento" itens={c.cancelamento[locale]} />
              )}
            </div>

            <section className="entrar mt-14" aria-labelledby="valores">
              <h2 id="valores" className="text-lead font-semibold">
                {t.valores}
              </h2>
              <dl className="mt-4 divide-y divide-(--color-borda) border-y border-(--color-borda)">
                {valores.map((v) => (
                  <div key={v.chave} className="flex items-baseline justify-between gap-4 py-3">
                    <dt>
                      <span className="font-semibold">{v.titulo}</span>
                      {/* no celular, uma nota por linha; no computador, na mesma linha com um ponto entre elas */}
                      {v.notas.length > 0 && (
                        <span className="mt-0.5 block text-small text-(--color-tinta-suave)">
                          {v.notas.map((n, i) => (
                            <span key={n} className="block sm:inline">
                              {i > 0 && <span className="hidden sm:inline"> · </span>}
                              {n}
                            </span>
                          ))}
                        </span>
                      )}
                    </dt>
                    <dd className="numeros shrink-0 font-semibold">{cifra(v.valor)}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-small text-(--color-tinta-suave)">{fmt(t.sinalTexto, { p: SINAL_PORCENTO })}</p>
            </section>

            <MapaCasa slug={c.slug} local={c.local[locale]} textos={t} className="entrar mt-14" />
          </div>

          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <ReservaCasa
                // só a tabela de diárias vai para o navegador: o endereço exato fica para o voucher
                tabela={{
                  diaria: c.diaria,
                  minimoNoites: c.minimoNoites,
                  temporadas: c.temporadas,
                  feriados: c.feriados,
                  taxaLimpeza: c.taxaLimpeza,
                }}
                capacidade={c.capacidade}
                ocupadas={ocupadas}
                reservaAberta={RESERVA_CASAS_ABERTA}
                hrefReserva={rota(locale, `/casas-de-temporada/${c.slug}/reservar`)}
                locale={intl}
                textos={{
                  reservarTitulo: t.reservarTitulo,
                  chegada: t.chegada,
                  saida: t.saida,
                  escolhaDatas: t.escolhaDatas,
                  escolhaSaida: t.escolhaSaida,
                  hospedes: t.hospedes,
                  noitesLinha: t.noitesLinha,
                  umaNoiteLinha: t.umaNoiteLinha,
                  taxaLimpeza: t.taxaLimpeza,
                  total: t.total,
                  sinal: t.sinal,
                  restante: t.restante,
                  minimo: t.minimo,
                  ocupada: t.ocupada,
                  reservar: t.reservar,
                  reservaEmBreve: t.reservaEmBreve,
                  mesAnterior: t.mesAnterior,
                  proximoMes: t.proximoMes,
                  limpar: t.limpar,
                  mudarDatas: t.mudarDatas,
                  diminuir: d.comum.diminuir,
                  aumentar: d.comum.aumentar,
                }}
              />
            </div>
          </aside>
        </div>

        {outras.length > 0 && (
          <section id="outras-casas" className="mt-24 md:mt-32" aria-labelledby="outras">
            <h2 id="outras" className="titulo entrar">
              {t.outras}
            </h2>
            <ul className="trilho mt-6 md:mt-8">
              {outras.map((o) => (
                <li key={o.slug}>
                  <CardCasa casa={o} idioma={locale} d={d} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 46vw, 80vw" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
