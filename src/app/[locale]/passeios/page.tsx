import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { migalhas } from '@/lib/dados-estruturados';
import { DadosEstruturados } from '@/components/DadosEstruturados';
import { CardPasseio } from '@/components/CardPasseio';
import { ExploradorPasseios, FiltroPasseios, TextoDaLista } from '@/components/ExploradorPasseios';
import { ResumoGrupo } from '@/components/grupo/ResumoGrupo';
import { SeletorGrupo } from '@/components/grupo/SeletorGrupo';
import { CATEGORIAS, CIDADES, passeiosAtivos, type Categoria, type Cidade } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { alternates, openGraphDaPagina } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/passeios'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  const descricao = fmt(d.meta.passeiosDescricao, { n: passeiosAtivos().length });
  return {
    title: d.meta.passeiosTitulo,
    description: descricao,
    alternates: alternates(locale, '/passeios'),
    openGraph: openGraphDaPagina(locale, { title: d.meta.passeiosTitulo, description: descricao, url: rota(locale, '/passeios') }),
  };
}

export default async function Passeios({ params }: PageProps<'/[locale]/passeios'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const passeios = passeiosAtivos();
  const cidades = (Object.keys(CIDADES) as Cidade[]).map((c) => ({ valor: c, rotulo: texto(CIDADES[c].nome, locale) }));
  const categorias = (Object.keys(CATEGORIAS) as Categoria[]).map((c) => ({ valor: c, rotulo: texto(CATEGORIAS[c].nome, locale) }));

  return (
    // Pacote 34 (ENT-08): chegando pelo "Ver los 10" da inicial, o Next leva a tela até o começo do <main>; com a folga
    // da cápsula do menu (4,5rem), a página abre no topo, sem o título escondido atrás dela
    <main id="conteudo" className="tom-fundo scroll-mt-[4.5rem]">
      {/* o filtro da lista (?cidade=…&tipo=…) vale para a lista e para o texto do topo */}
      <FiltroPasseios cidades={cidades.map((c) => c.valor)} categorias={categorias.map((c) => c.valor)}>
        <div className="moldura pb-24 pt-8 md:pb-40 md:pt-14">
          <div className="grid gap-6 md:grid-cols-12 md:gap-8">
            <div className="chegar md:col-span-6">
              <h1 className="display text-head">{d.passeios.titulo}</h1>
              {/* Pacote 34 (ENT-08): com o filtro, o texto conta só os passeios mostrados ("10 paseos en Búzios, …") */}
              <TextoDaLista
                itens={passeios.map((p) => ({ cidade: p.cidade, categoria: p.categoria }))}
                cidades={cidades}
                locale={LOCALE_INTL[locale]}
                textos={{
                  geral: fmt(d.passeios.texto, { n: passeios.length }),
                  filtrado: d.passeios.textoFiltrado,
                  filtradoUm: d.passeios.textoFiltradoUm,
                }}
                className="mt-4 max-w-[42ch] text-lead md:mt-5"
              />
            </div>
            <div className="chegar md:col-span-5 md:col-start-8 md:self-end">
              <SeletorGrupo
                className="grid-cols-2"
                textos={{ ...d.grupo, diminuir: d.comum.diminuir, aumentar: d.comum.aumentar, rotulos: d.comum.rotulos }}
              />
            </div>
          </div>
          <div className="mt-6 sm:mt-10">
            <ExploradorPasseios
              resumo={
                <ResumoGrupo
                  textos={{ ...d.grupo, rotulos: d.comum.rotulos }}
                  locale={LOCALE_INTL[locale]}
                  className="text-(--tinta-suave)"
                />
              }
              itens={passeios.map((p) => ({
                slug: p.slug,
                cidade: p.cidade,
                categoria: p.categoria,
                card: <CardPasseio passeio={p} idioma={locale} d={d} nivelTitulo="h2" />,
              }))}
              cidades={cidades}
              categorias={categorias}
              textos={{
                cidade: d.comum.cidade,
                tipo: d.comum.tipo,
                todas: d.comum.todas,
                todos: d.comum.todos,
                nenhum: d.passeios.nenhum,
                limpar: d.passeios.limpar,
                resultado: d.passeios.resultado,
                resultados: d.passeios.resultados,
              }}
            />
          </div>
        </div>
      </FiltroPasseios>
      <DadosEstruturados dados={migalhas(locale, [{ nome: d.nav.passeios, caminho: '/passeios' }])} />
    </main>
  );
}
