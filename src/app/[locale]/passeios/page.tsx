import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CardPasseio } from '@/components/CardPasseio';
import { ExploradorPasseios } from '@/components/ExploradorPasseios';
import { ResumoGrupo } from '@/components/grupo/ResumoGrupo';
import { SeletorGrupo } from '@/components/grupo/SeletorGrupo';
import { CATEGORIAS, CIDADES, passeiosAtivos, type Categoria, type Cidade } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { alternates } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/passeios'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  const descricao = fmt(d.passeios.texto, { n: passeiosAtivos().length });
  return {
    title: d.passeios.titulo,
    description: descricao,
    alternates: alternates(locale, '/passeios'),
    openGraph: { title: d.passeios.titulo, description: descricao, url: rota(locale, '/passeios') },
  };
}

export default async function Passeios({ params }: PageProps<'/[locale]/passeios'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const passeios = passeiosAtivos();

  return (
    <main id="conteudo" className="tom-fundo">
      <div className="moldura pb-24 pt-8 md:pb-40 md:pt-14">
        <div className="grid gap-8 md:grid-cols-12">
          <div className="chegar md:col-span-6">
            <h1 className="display text-head">{d.passeios.titulo}</h1>
            <p className="mt-5 max-w-[42ch] text-lead">{fmt(d.passeios.texto, { n: passeios.length })}</p>
            <ResumoGrupo textos={{ ...d.grupo, rotulos: d.comum.rotulos }} locale={LOCALE_INTL[locale]} className="mt-4 font-semibold" />
          </div>
          <div className="md:col-span-5 md:col-start-8 md:self-end">
            <SeletorGrupo textos={{ ...d.grupo, diminuir: d.comum.diminuir, aumentar: d.comum.aumentar, rotulos: d.comum.rotulos }} />
          </div>
        </div>
        <div className="mt-12">
          <ExploradorPasseios
            itens={passeios.map((p) => ({
              slug: p.slug,
              cidade: p.cidade,
              categoria: p.categoria,
              card: <CardPasseio passeio={p} idioma={locale} d={d} />,
            }))}
            cidades={(Object.keys(CIDADES) as Cidade[]).map((c) => ({ valor: c, rotulo: CIDADES[c].nome[locale] }))}
            categorias={(Object.keys(CATEGORIAS) as Categoria[]).map((c) => ({ valor: c, rotulo: CATEGORIAS[c].nome[locale] }))}
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
    </main>
  );
}
