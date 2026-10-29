import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BilhetePasseio } from '@/components/BilhetePasseio';
import { ExploradorPasseios } from '@/components/ExploradorPasseios';
import { CATEGORIAS, CIDADES, passeiosAtivos, type Categoria, type Cidade } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { fmt, isIdioma, rota } from '@/i18n/config';
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
    <div className="moldura pb-24 pt-10 md:pb-40 md:pt-16">
      <div className="grid gap-6 md:grid-cols-12">
        <h1 className="titulo-display text-head md:col-span-8">{d.passeios.titulo}</h1>
        <p className="max-w-[40ch] self-end text-lead md:col-span-4">{fmt(d.passeios.texto, { n: passeios.length })}</p>
      </div>
      <div className="mt-10">
        <ExploradorPasseios
          itens={passeios.map((p, i) => ({
            slug: p.slug,
            cidade: p.cidade,
            categoria: p.categoria,
            destaque: Boolean(p.destaque),
            card: <BilhetePasseio passeio={p} idioma={locale} d={d} prioridade={i < 2} />,
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
  );
}
