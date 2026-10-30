import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { IconeEmail } from '@/components/IconeEmail';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';
import { linkEmail } from '@/lib/email';
import { alternates } from '@/lib/site';

export async function generateMetadata({ params }: PageProps<'/[locale]/contato'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  return {
    title: d.nav.contato,
    description: d.contato.texto,
    alternates: alternates(locale, '/contato'),
    openGraph: { title: d.contato.titulo, description: d.contato.texto, url: rota(locale, '/contato') },
  };
}

/** Fotos dos lugares para onde a gente leva o cliente. */
const LUGARES = [
  { src: '/fotos/buzios/escuna-mastros.jpg', legenda: 'escunaMastros' },
  { src: '/fotos/arraial/mergulho.jpg', legenda: 'mergulho' },
  { src: '/fotos/buzios/buggy-mirante.jpg', legenda: 'buggyMirante' },
] as const;

/** Contato: um cartão de visita sobre a foto do píer, e embaixo os lugares dos passeios. */
export default async function Contato({ params }: PageProps<'/[locale]/contato'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const c = d.contato;
  const email = linkEmail(c.assunto, c.msg);

  return (
    <main id="conteudo" className="tom-fundo">
      <section className="relative isolate md:min-h-[100svh]" aria-labelledby="contato-titulo">
        <div className="relative h-[42svh] overflow-hidden md:absolute md:inset-0 md:h-auto">
          <Image
            src="/fotos/buzios/escuna-no-pier.jpg"
            alt={d.home.legendas.escunaNoPier}
            fill
            priority
            sizes="100vw"
            className="respira object-cover"
          />
        </div>
        <div className="moldura relative -mt-20 pb-16 md:mt-0 md:flex md:justify-end md:pb-24 md:pt-[60px]">
          <div className="tom-papel chegar w-full p-7 md:w-[26rem] md:p-8">
            <h1 id="contato-titulo" className="titulo">
              {c.titulo}
            </h1>
            <p className="mt-4">{c.texto}</p>
            <a href={email} className="botao mt-6 w-full" data-evento="Contact">
              <IconeEmail className="size-5" />
              {c.botao}
            </a>
            <dl className="mt-8 space-y-4">
              <div>
                <dt className="text-small text-(--tinta-suave)">{c.email}</dt>
                <dd>
                  <a href={email} className="link break-all font-semibold" data-evento="Contact">
                    {EMPRESA.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="text-small text-(--tinta-suave)">{c.base}</dt>
                <dd>{c.baseTexto}</dd>
              </div>
              <div>
                <dt className="text-small text-(--tinta-suave)">{c.idiomas}</dt>
                <dd>{d.rodape.idiomas}</dd>
              </div>
              <div>
                <dt className="text-small text-(--tinta-suave)">{c.cnpj}</dt>
                <dd className="numeros">{EMPRESA.cnpj}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="moldura py-24 md:py-32" aria-labelledby="contato-lugares">
        <h2 id="contato-lugares" className="titulo entrar max-w-[18ch]">
          {c.lugares}
        </h2>
        <ul className="entrar mt-10 grid gap-2 sm:grid-cols-3">
          {LUGARES.map((l) => (
            <li key={l.src}>
              <figure>
                <div className="relative aspect-[4/5]">
                  <Image
                    src={l.src}
                    alt={d.home.legendas[l.legenda]}
                    fill
                    sizes="(min-width: 640px) 33vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <figcaption className="mt-3 text-small text-(--tinta-suave)">{d.home.legendas[l.legenda]}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
