import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { IconeEmail } from '@/components/IconeEmail';
import { CASAS_ATIVO, casasAtivas } from '@/data/casas';
import { CIDADES } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { fmt, isIdioma, rota } from '@/i18n/config';
import { linkEmail } from '@/lib/email';
import { formatarPreco } from '@/lib/precos';
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
    // enquanto a área estiver desligada, fica fora do Google
    ...(CASAS_ATIVO ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function CasasDeTemporada({ params }: PageProps<'/[locale]/casas-de-temporada'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const t = d.casas;
  const casas = casasAtivas();

  return (
    <main id="conteudo" className="tom-mar pb-24 md:pb-40">
      <div className="moldura grid gap-6 pt-8 md:grid-cols-12 md:pt-14">
        <h1 className="chegar largo text-head text-sol md:col-span-7">
          <span>{t.titulo}</span>
        </h1>
        <p className="max-w-[46ch] self-end text-lead md:col-span-5">{t.texto}</p>
      </div>

      {casas.length > 0 ? (
        <ul className="moldura mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 md:mt-20 lg:grid-cols-3">
          {casas.map((c) => (
            <li key={c.slug}>
              <article>
                <div className="relative aspect-[4/5] bg-mar-2">
                  {c.fotos[0] && (
                    <Image
                      src={c.fotos[0]}
                      alt={c.nome[locale]}
                      fill
                      sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                      className="object-cover"
                    />
                  )}
                </div>
                <p className="mt-4 text-small text-(--tinta-suave)">
                  {CIDADES[c.cidade].nome[locale]} · {fmt(t.quartos, { n: c.quartos })} · {fmt(t.hospedes, { n: c.hospedes })}
                </p>
                <h2 className="mt-1 text-lead font-bold">{c.nome[locale]}</h2>
                <p className="mt-2">{c.resumo[locale]}</p>
                {c.destaques[locale].length > 0 && (
                  <p className="mt-2 text-small text-(--tinta-suave)">{c.destaques[locale].join(' · ')}</p>
                )}
                <p className="mt-3">
                  {c.diariaAPartir ? (
                    <>
                      <span className="text-small">{t.diaria} </span>
                      <strong className="numeros text-lead">{formatarPreco(Math.round(c.diariaAPartir * 100), locale)}</strong>
                    </>
                  ) : (
                    <strong>{d.hospedagemPagina.sobConsulta}</strong>
                  )}
                </p>
                <a
                  href={linkEmail(fmt(t.assuntoCasa, { casa: c.nome[locale] }), fmt(t.msgCasa, { casa: c.nome[locale] }))}
                  className="botao mt-5 w-full"
                  data-evento="Contact"
                >
                  <IconeEmail className="size-5" />
                  {t.consultar}
                </a>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <section className="moldura mt-14 md:mt-20" aria-labelledby="em-breve">
          <div className="grid md:grid-cols-12">
            <div className="relative aspect-[4/3] md:col-span-6 md:aspect-auto md:min-h-[30rem]">
              <Image src="/fotos/buzios/vista-da-escuna.jpg" alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
            </div>
            <div className="tom-sol flex flex-col justify-between gap-8 p-6 md:col-span-6 md:p-12">
              <div>
                <h2 id="em-breve" className="largo text-head">
                  {t.emBreveTitulo}
                </h2>
                <p className="mt-5 max-w-[42ch] text-lead">{t.emBreveTexto}</p>
              </div>
              <a href={linkEmail(t.assunto, t.msg)} className="botao w-full sm:w-auto" data-evento="Contact">
                <IconeEmail className="size-5" />
                {t.pedir}
              </a>
            </div>
          </div>
        </section>
      )}

      <section className="moldura mt-24 grid gap-6 md:mt-40 md:grid-cols-12" aria-labelledby="proprietario">
        <h2 id="proprietario" className="text-head font-bold text-sol md:col-span-6">
          {t.proprietarioTitulo}
        </h2>
        <div className="md:col-span-5 md:col-start-8">
          <p className="text-lead">{t.proprietarioTexto}</p>
          <a href={linkEmail(t.proprietarioAssunto, t.proprietarioMsg)} className="botao mt-8 w-full sm:w-auto" data-evento="Contact">
            <IconeEmail className="size-5" />
            {t.proprietarioBotao}
          </a>
        </div>
      </section>
    </main>
  );
}
