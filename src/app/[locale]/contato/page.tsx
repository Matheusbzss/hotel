import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IconeWhatsApp } from '@/components/IconeWhatsApp';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';
import { alternates } from '@/lib/site';
import { linkWhatsApp } from '@/lib/whatsapp';

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

  return (
    <div className="moldura pb-24 pt-10 md:pb-40 md:pt-16">
      <div className="grid gap-6 md:grid-cols-12">
        <h1 className="titulo-display text-head md:col-span-7">{c.titulo}</h1>
        <p className="max-w-[40ch] self-end text-lead md:col-span-5">{c.texto}</p>
      </div>

      <div className="mt-12 grid gap-4 md:mt-16 md:grid-cols-12">
        <a
          href={linkWhatsApp(c.msg)}
          target="_blank"
          rel="noopener noreferrer"
          data-evento="Contact"
          className="group flex min-h-[260px] flex-col justify-between bg-whats p-6 text-white transition-colors hover:bg-[#178a43] md:col-span-7 md:p-10"
        >
          <IconeWhatsApp className="size-14" />
          <span>
            <span className="block text-lead font-semibold">{c.whatsapp}</span>
            <span className="mt-1 block text-[clamp(1.75rem,1.2rem+2.4vw,3rem)] font-bold leading-tight">{EMPRESA.telefoneExibicao}</span>
          </span>
        </a>
        <div className="grid gap-4 md:col-span-5">
          <a
            href={`mailto:${EMPRESA.email}`}
            className="flex flex-col justify-between gap-6 bg-turquesa-clara p-6 transition-colors hover:bg-turquesa md:p-8"
          >
            <span className="text-lead font-semibold">{c.email}</span>
            <span className="break-all text-[1.25rem] font-bold">{EMPRESA.email}</span>
          </a>
          <a
            href={EMPRESA.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col justify-between gap-6 bg-coral-claro p-6 transition-colors hover:bg-coral md:p-8"
          >
            <span className="text-lead font-semibold">{c.instagram}</span>
            <span className="text-[1.25rem] font-bold">{EMPRESA.instagramUsuario}</span>
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="bg-areia-clara p-6 md:p-8" aria-labelledby="base">
          <h2 id="base" className="text-lead font-bold">
            {c.base}
          </h2>
          <p className="mt-3">{c.baseTexto}</p>
        </section>
        <section className="bg-areia-clara p-6 md:p-8" aria-labelledby="empresa">
          <h2 id="empresa" className="text-lead font-bold">
            {c.empresa}
          </h2>
          <dl className="mt-3 space-y-2">
            <div>
              <dt className="text-small">{c.razao}</dt>
              <dd className="font-semibold">
                {EMPRESA.razaoSocial} ({EMPRESA.tipoEmpresa})
              </dd>
            </div>
            <div>
              <dt className="text-small">{c.cnpj}</dt>
              <dd className="font-semibold">{EMPRESA.cnpj}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
