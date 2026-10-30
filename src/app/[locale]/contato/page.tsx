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

export default async function Contato({ params }: PageProps<'/[locale]/contato'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const c = d.contato;

  const email = linkEmail(c.assunto, c.msg);

  return (
    <main id="conteudo" className="tom-fundo">
      <div className="moldura grid gap-12 pb-24 pt-8 md:grid-cols-12 md:pb-40 md:pt-14">
        <div className="chegar md:col-span-6">
          <h1 className="display text-head">{c.titulo}</h1>
          <p className="mt-5 max-w-[40ch] text-lead">{c.texto}</p>
          <a href={email} className="botao mt-8 w-full sm:w-auto" data-evento="Contact">
            <IconeEmail className="size-5" />
            {c.botao}
          </a>

          <a
            href={email}
            className="group -mx-3 mt-14 flex flex-col gap-1 px-3 py-4 transition-colors hover:bg-superficie sm:flex-row sm:items-baseline sm:justify-between"
            data-evento="Contact"
          >
            <span className="text-(--tinta-suave)">{c.email}</span>
            <span className="break-all text-lead font-semibold transition-transform group-hover:translate-x-1">{EMPRESA.email}</span>
          </a>

          <section className="mt-12 grid gap-8 sm:grid-cols-2" aria-label={c.empresa}>
            <div>
              <h2 className="font-bold">{c.base}</h2>
              <p className="mt-2">{c.baseTexto}</p>
            </div>
            <div>
              <h2 className="font-bold">{c.empresa}</h2>
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="text-small text-(--tinta-suave)">{c.cnpj}</dt>
                  <dd className="numeros">{EMPRESA.cnpj}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
        <div className="relative aspect-[4/5] md:col-span-5 md:col-start-8 md:aspect-auto md:min-h-[36rem]">
          <Image
            src="/fotos/buzios/escuna-no-pier.jpg"
            alt={d.home.legendas.escunaNoPier}
            fill
            sizes="(min-width: 768px) 40vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </main>
  );
}
