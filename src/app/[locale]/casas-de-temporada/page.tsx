import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { CardCasa } from '@/components/casas/CardCasa';
import { ExploradorCasas } from '@/components/casas/ExploradorCasas';
import { FormularioCotacao } from '@/components/FormularioCotacao';
import { CIDADES, type Cidade } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';
import { casasAtivas, casasNoAr } from '@/lib/casas';
import { textosCotacao } from '@/lib/cotacao';
import { alternates } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/casas-de-temporada'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  return {
    title: d.casas.titulo,
    description: d.casas.texto,
    alternates: alternates(locale, '/casas-de-temporada'),
    openGraph: { title: d.casas.titulo, description: d.casas.texto, url: rota(locale, '/casas-de-temporada') },
    // sem casa no ar, a página "Em breve" fica fora do Google
    ...((await casasNoAr()) ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function CasasDeTemporada({ params }: PageProps<'/[locale]/casas-de-temporada'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const t = d.casas;
  const casas = await casasAtivas();
  // só as cidades que têm casa, na ordem de sempre
  const cidades = (Object.keys(CIDADES) as Cidade[])
    .filter((c) => casas.some((casa) => casa.cidade === c))
    .sort((a, b) => CIDADES[a].ordem - CIDADES[b].ordem)
    .map((c) => ({ valor: c, rotulo: CIDADES[c].nome[locale] }));

  return (
    <main id="conteudo" className="tom-fundo pb-24 md:pb-40">
      <div className="moldura grid gap-6 pt-8 md:grid-cols-12 md:pt-14">
        <h1 className="chegar display text-head md:col-span-7">
          <span>{t.titulo}</span>
        </h1>
        <p className="max-w-[46ch] self-end text-lead md:col-span-5">{t.texto}</p>
      </div>

      {casas.length > 0 ? (
        <div className="moldura mt-10 md:mt-14">
          <ExploradorCasas
            itens={casas.map((c) => ({
              slug: c.slug,
              cidade: c.cidade,
              capacidade: c.capacidade,
              card: <CardCasa casa={c} idioma={locale} d={d} />,
            }))}
            cidades={cidades}
            textos={{
              cidade: t.filtroCidade,
              pessoas: t.filtroPessoas,
              todas: t.todas,
              qualquer: t.qualquer,
              nPessoas: t.pessoas,
              nenhuma: t.nenhuma,
              limpar: t.limparFiltros,
              resultado: t.resultado,
              resultados: t.resultados,
            }}
          />
        </div>
      ) : (
        <section className="moldura mt-14 md:mt-20" aria-labelledby="em-breve">
          <div className="grid md:grid-cols-12">
            <div className="relative aspect-[4/3] md:col-span-6 md:aspect-auto md:min-h-[30rem]">
              <Image src="/fotos/buzios/vista-da-escuna.jpg" alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
            </div>
            <div className="tom-campo flex flex-col justify-between gap-8 p-6 md:col-span-6 md:p-12">
              <div>
                <h2 id="em-breve" className="display text-head">
                  {t.emBreveTitulo}
                </h2>
                <p className="mt-5 max-w-[42ch] text-lead">{t.emBreveTexto}</p>
              </div>
              <div>
                <FormularioCotacao
                  tipo="casa"
                  idioma={locale}
                  rotuloMensagem={d.cotacao.casaMensagem}
                  botao={t.pedir}
                  textos={textosCotacao(d)}
                />
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
