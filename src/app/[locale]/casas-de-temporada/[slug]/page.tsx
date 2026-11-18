import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { migalhas } from '@/lib/dados-estruturados';
import { DadosEstruturados } from '@/components/DadosEstruturados';
import { ListaMarcada } from '@/components/ListaMarcada';
import { CardCasa } from '@/components/casas/CardCasa';
import { LerMais } from '@/components/casas/Expandir';
import { GaleriaCasa } from '@/components/casas/GaleriaCasa';
import { MapaCasa } from '@/components/casas/MapaCasa';
import { ComodidadesCasa, DestaquesCasa, QuartosCasa, RegrasCasa } from '@/components/casas/PartesCasa';
import { ReservaCasa } from '@/components/casas/ReservaCasa';
import { EMPRESA } from '@/config/empresa';
import { RESERVA_CASAS_ABERTA } from '@/data/casas';
import { altDaFoto } from '@/data/fotos-alt';
import { CIDADES } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { IDIOMAS, LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { cambioParaTela } from '@/lib/cambio-tela';
import { noitesOcupadas } from '@/lib/casa';
import { comodidadesDaPagina, linhaDaFicha, regrasDaPagina, tabelaDaPagina } from '@/lib/casa-pagina';
import { casasAtivas, casasDaPagina, obterCasa, ocupacaoDaCasa } from '@/lib/casas';
import { formatarCifra } from '@/lib/cifra';
import { textosCotacao } from '@/lib/cotacao';
import { textoDolar } from '@/lib/dolar';
import { menorDiariaCentavos, primeiraEntradaPossivel } from '@/lib/estadia';
import { precoPixCentavos } from '@/lib/orcamento';
import { centroCabeNoRecorte, rotulosDoRecorte } from '@/lib/satelite-casa';
import { alternates, openGraphDaPagina } from '@/lib/site';

// a página é refeita uma vez por dia, para os dias e os pacotes que já passaram saírem dela; a casa nova abre na
// primeira visita
export const revalidate = 86400;

export async function generateStaticParams() {
  const casas = await casasDaPagina();
  return IDIOMAS.flatMap((locale) => casas.map((c) => ({ locale, slug: c.slug })));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/casas-de-temporada/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  const c = await obterCasa(slug);
  if (!isIdioma(locale) || !c) return {};
  const d = dicionario(locale);
  const menor = menorDiariaCentavos(tabelaDaPagina(c));
  const intl = LOCALE_INTL[locale];
  const descricao = [
    texto(c.resumo, locale),
    menor !== null
      ? fmt(d.casas.metaDiaria, { pix: formatarCifra(precoPixCentavos(menor), intl), cartao: formatarCifra(menor, intl) })
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const noAr = (await casasAtivas()).some((a) => a.slug === c.slug);
  return {
    title: `${texto(c.nome, locale)} — ${texto(c.local, locale)}`,
    description: descricao,
    alternates: alternates(locale, `/casas-de-temporada/${c.slug}`),
    openGraph: openGraphDaPagina(locale, {
      title: `${texto(c.nome, locale)} | ${EMPRESA.marca}`,
      description: descricao,
      url: rota(locale, `/casas-de-temporada/${c.slug}`),
      ...(c.fotos[0] ? { images: [{ url: c.fotos[0], alt: texto(c.nome, locale) }] } : {}),
    }),
    // a casa da prévia local (CASAS_PREVIA=1) está desligada: nunca vai para o Google
    ...(noAr ? {} : { robots: { index: false, follow: false } }),
  };
}

/**
 * A página de cada casa (Fase 4, Etapa 7), nas 10 partes do plano, celular primeiro: 1. as fotos; 2. o nome, o bairro e
 * a cidade e a linha da ficha; 3. os destaques; 4. a descrição com "ler mais"; 5. os quartos; 6. o que a casa tem; 7. o
 * preço e as datas (o calendário com as regras e os pacotes, e o quadro que acompanha a rolagem no computador); 8. onde
 * fica (o mapa com o círculo, só com o ponto marcado no painel); 9. regras, chegada e segurança e cancelamento, que
 * abrem ao tocar; 10. avaliações: só quando houver avaliação real da casa (hoje, nenhuma).
 */
export default async function PaginaCasa({ params }: PageProps<'/[locale]/casas-de-temporada/[slug]'>) {
  const { locale, slug } = await params;
  const c = await obterCasa(slug);
  if (!isIdioma(locale) || !c) notFound();
  const d = dicionario(locale);
  const t = d.casas;
  const intl = LOCALE_INTL[locale];
  const nome = texto(c.nome, locale);
  const local = `${texto(c.local, locale)}, ${texto(CIDADES[c.cidade].nome, locale)}`;
  const tabela = tabelaDaPagina(c);
  const menor = menorDiariaCentavos(tabela);
  // o primeiro dia de entrada possível agora (depois das 13h, amanhã): o aparelho confere de novo ao abrir a página
  const hoje = primeiraEntradaPossivel();
  const ocupadas = noitesOcupadas(await ocupacaoDaCasa(c.id), hoje);
  const outras = (await casasDaPagina()).filter((o) => o.slug !== c.slug).slice(0, 4);
  // o ≈ US$ só em espanhol e inglês, e nunca na barra fixa (decisão de 07/11)
  const cambio = await cambioParaTela(locale);
  const ficha = linhaDaFicha(c, t.linha);
  const comodidades = comodidadesDaPagina(c.detalhes.comodidadesMarcadas);
  const comMapa = Boolean(c.centro && centroCabeNoRecorte(c.centro));
  // só os nomes das praias e a posição deles na imagem (relativa ao centro público): nenhuma coordenada vai ao HTML
  const rotulosDoMapa = comMapa && c.centro ? rotulosDoRecorte(c.centro) : [];
  // a página mostra a descrição (o primeiro parágrafo e o "ler mais"); o resumo fica para o Google e a prévia do link,
  // porque repete os destaques e a ficha, que estão logo acima. Sem descrição, o resumo.
  const [primeiro = texto(c.resumo, locale), ...paragrafos] = texto(c.descricao, locale)
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);
  const alt = (foto: string, i: number) => altDaFoto(foto, locale, `${nome}, ${fmt(d.passeio.fotoDe, { i: i + 1, n: c.fotos.length })}`);
  const usdPix = menor !== null ? textoDolar(precoPixCentavos(menor), cambio.taxa, d.preco.dolar, intl) : '';

  return (
    <main id="conteudo" className="tom-fundo">
      {/* 1 e 2: no celular, as fotos de borda a borda e o nome embaixo; no computador, o nome em cima e o mosaico, com a
          diária a partir de ao lado (a primeira tela do computador já mostra o preço) */}
      <section className="topo-casa" aria-labelledby="casa-titulo">
        <div className="topo-casa-texto moldura">
          <div className="min-w-0">
            <h1 id="casa-titulo" className="topo-casa-titulo">
              {nome}
            </h1>
            <p className="topo-casa-local">{local}</p>
            {ficha.length > 0 && (
              <p className="linha-pontuada topo-casa-ficha">
                <span>
                  {ficha.map((f) => (
                    <span key={f} className="pedaco">
                      {f}
                    </span>
                  ))}
                </span>
              </p>
            )}
          </div>
          {menor !== null && (
            <div className="topo-casa-preco">
              <p className="text-small text-(--color-tinta-suave) first-letter:uppercase">{t.diariaAPartir}</p>
              <p className="mt-1">
                <strong className="cifra text-figure">{formatarCifra(precoPixCentavos(menor), intl)}</strong>{' '}
                <span className="text-small font-semibold text-(--color-sucesso)">{d.preco.noPix}</span>
                {usdPix && <span className="text-small text-(--color-tinta-suave)"> · {usdPix}</span>}
              </p>
              <p className="text-small text-(--color-tinta-suave)">
                <span className="numeros font-semibold text-(--color-tinta)">{formatarCifra(menor, intl)}</span> {d.preco.noCartao}
              </p>
              <a href="#datas-casa" className="link mt-1 inline-flex min-h-11 items-center font-semibold">
                {t.verDatas}
              </a>
            </div>
          )}
        </div>
        <div className="topo-casa-fotos">
          <GaleriaCasa
            fotos={c.fotos}
            alts={c.fotos.map(alt)}
            textos={{
              galeria: t.galeria,
              verFotos: d.passeio.verFotos,
              anterior: d.passeio.fotoAnterior,
              proxima: d.passeio.proximaFoto,
              fechar: d.comum.fechar,
              fotoDe: d.passeio.fotoDe,
              voltar: t.voltarFotos,
            }}
          />
        </div>
      </section>

      <div className="moldura corpo-casa">
        <div className="corpo-casa-a">
          {/* 3: os destaques confirmados */}
          <DestaquesCasa destaques={c.detalhes.destaques} idioma={locale} rotulo={t.destaques} />

          {/* 4: a descrição curta, com "ler mais" */}
          <section aria-labelledby="sobre-casa">
            <h2 id="sobre-casa" className="titulo-casa">
              {t.sobre}
            </h2>
            <LerMais resumo={primeiro} paragrafos={paragrafos} textos={{ lerMais: t.lerMais, lerMenos: t.lerMenos }} />
          </section>

          {/* 5: os quartos (sem o detalhe de cada um, a lista antiga de camas) */}
          {c.detalhes.quartosDetalhe.length > 0 ? (
            <QuartosCasa
              quartos={c.detalhes.quartosDetalhe}
              idioma={locale}
              locale={intl}
              altDaFoto={(foto) => altDaFoto(foto, locale, nome)}
              textos={{ titulo: t.quartosTitulo, comBanheiro: t.quartoComBanheiro }}
            />
          ) : (
            texto(c.camas, locale).length > 0 && (
              <ListaMarcada titulo={t.quartosTitulo} id="quartos-casa" itens={texto(c.camas, locale)} marca="sim" />
            )
          )}

          {/* 6: o que a casa tem (sem a lista fixa marcada, a lista antiga de comodidades) */}
          {comodidades.length > 0 ? (
            <ComodidadesCasa
              comodidades={comodidades}
              idioma={locale}
              textos={{ titulo: t.comodidadesTitulo, verTudo: t.verComodidades, mostrarMenos: t.lerMenos }}
            />
          ) : (
            texto(c.comodidades, locale).length > 0 && (
              <ListaMarcada titulo={t.comodidadesTitulo} id="comodidades-casa" itens={texto(c.comodidades, locale)} marca="sim" />
            )
          )}
        </div>

        {/* 7: o preço e as datas */}
        <ReservaCasa
          tabela={tabela}
          ocupadas={ocupadas}
          hojeServidor={hoje}
          capacidade={c.capacidade}
          nomeCasa={nome}
          reservaAberta={RESERVA_CASAS_ABERTA}
          hrefReserva={rota(locale, `/casas-de-temporada/${c.slug}/reservar`)}
          idioma={locale}
          locale={intl}
          dolar={cambio.taxa}
          notaCambio={cambio.nota}
          textosCotacao={textosCotacao(d)}
          textos={{
            mesAnterior: t.mesAnterior,
            proximoMes: t.proximoMes,
            ocupada: t.ocupada,
            datasTitulo: t.datasTitulo,
            limpar: t.limpar,
            regraHorario: t.regraHorario,
            regraMinimo: t.regraMinimo,
            regraFimDeSemana: t.regraFimDeSemana,
            diariasDaCasa: t.diariasDaCasa,
            diariaUnica: t.diariaUnica,
            pacotesTitulo: t.pacotesTitulo,
            pacotesTexto: t.pacotesTexto,
            pacoteOpcoes: t.pacoteOpcoes,
            pacoteOpcao: t.pacoteOpcao,
            verPacotes: t.verPacotes,
            menosPacotes: t.menosPacotes,
            legendaPacote: t.legendaPacote,
            legendaOcupada: t.legendaOcupada,
            escolhaDatas: t.escolhaDatas,
            escolhaSaida: t.escolhaSaida,
            minimo: t.minimo,
            avisoFimDeSemana: t.avisoFimDeSemana,
            incluirFimDeSemana: t.incluirFimDeSemana,
            avisoPacote: t.avisoPacote,
            incluirPacote: t.incluirPacote,
            incluirPacoteDe: t.incluirPacoteDe,
            mudarChegada: t.mudarChegada,
            mudarSaida: t.mudarSaida,
            ajusteResultado: t.ajusteResultado,
            avisoOcupada: t.avisoOcupada,
            avisoDatas: t.avisoDatas,
            avisoPreco: t.avisoPreco,
            reservarTitulo: t.reservarTitulo,
            diariaAPartir: t.diariaAPartir,
            noPix: d.preco.noPix,
            noCartao: d.preco.noCartao,
            chegada: t.chegada,
            saida: t.saida,
            hospedes: t.hospedes,
            diminuir: d.comum.diminuir,
            aumentar: d.comum.aumentar,
            nDiarias: t.nDiarias,
            umaDiaria: t.umaDiaria,
            linhaSemana: t.linhaSemana,
            linhaSemanaUma: t.linhaSemanaUma,
            linhaFimDeSemana: t.linhaFimDeSemana,
            linhaFimDeSemanaUma: t.linhaFimDeSemanaUma,
            linhaFeriado: t.linhaFeriado,
            linhaFeriadoUma: t.linhaFeriadoUma,
            linhaTemporada: t.linhaTemporada,
            linhaTemporadaUma: t.linhaTemporadaUma,
            linhaPacote: t.linhaPacote,
            contaTitulo: t.contaTitulo,
            colunaPix: t.colunaPix,
            colunaCartao: t.colunaCartao,
            total: t.total,
            sinalHoje: t.sinalHoje,
            naChegada: t.naChegada,
            chegadaComo: t.chegadaComo,
            pixNoTotal: t.pixNoTotal,
            incluido: t.incluido,
            semCaucao: t.semCaucao,
            verValores: t.verValores,
            verDatas: t.verDatas,
            barraDatas: t.barraDatas,
            reservar: t.reservar,
            reservaEmBreve: t.reservaEmBreve,
            pedir: t.pedir,
            avisemeTitulo: t.avisemeTitulo,
            avisemeTexto: t.avisemeTexto,
            // a casa e a cidade já vão na mensagem: o rótulo pede só as datas e as pessoas
            rotuloMensagem: t.avisemeMensagem,
            hospedesN: t.linha.hospedes,
            fechar: d.comum.fechar,
            dolar: d.preco.dolar,
          }}
        />

        <div className="corpo-casa-b">
          {/* 8: onde fica, com o círculo (só com o ponto marcado) e o texto do bairro */}
          <MapaCasa
            slug={c.slug}
            comMapa={comMapa}
            rotulos={rotulosDoMapa}
            local={local}
            bairro={c.detalhes.textoBairro ? texto(c.detalhes.textoBairro, locale) : ''}
            textos={{ mapaTitulo: t.mapaTitulo, mapaTexto: t.mapaTexto, mapaFonte: t.mapaFonte, mapaCirculo: t.mapaCirculo }}
          />

          {/* 9: regras, chegada e segurança e cancelamento, que abrem ao tocar (10: sem avaliações da casa, nada) */}
          <RegrasCasa
            regras={regrasDaPagina(c)}
            idioma={locale}
            textos={{ regras: t.regras, chegada: t.chegadaSeguranca, cancelamento: t.cancelamento }}
          />
        </div>
      </div>

      {outras.length > 0 && (
        <section id="outras-casas" className="moldura pb-24 md:pb-32" aria-labelledby="outras">
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
      <DadosEstruturados
        dados={migalhas(locale, [
          { nome: d.nav.casas, caminho: '/casas-de-temporada' },
          { nome, caminho: `/casas-de-temporada/${c.slug}` },
        ])}
      />
    </main>
  );
}
