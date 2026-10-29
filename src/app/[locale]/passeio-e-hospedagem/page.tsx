import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconeWhatsApp } from '@/components/IconeWhatsApp';
import { Ilustracao } from '@/components/Ilustracao';
import { PACOTES } from '@/data/pacotes';
import { CIDADES, obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { fmt, isIdioma, rota } from '@/i18n/config';
import { alternates } from '@/lib/site';
import { linkWhatsApp } from '@/lib/whatsapp';

export async function generateMetadata({ params }: PageProps<'/[locale]/passeio-e-hospedagem'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  return {
    title: d.hospedagemPagina.titulo,
    description: d.hospedagemPagina.texto,
    alternates: alternates(locale, '/passeio-e-hospedagem'),
    openGraph: { title: d.hospedagemPagina.titulo, description: d.hospedagemPagina.texto, url: rota(locale, '/passeio-e-hospedagem') },
  };
}

const FUNDOS = ['bg-turquesa-clara', 'bg-sol-claro', 'bg-coral-claro', 'bg-areia-clara'];

export default async function PasseioEHospedagem({ params }: PageProps<'/[locale]/passeio-e-hospedagem'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const t = d.hospedagemPagina;

  return (
    <div className="pb-24 md:pb-40">
      <div className="moldura pt-10 md:pt-16">
        <div className="grid gap-6 md:grid-cols-12">
          <h1 className="titulo-display text-head md:col-span-7">{t.titulo}</h1>
          <p className="max-w-[46ch] self-end text-lead md:col-span-5">{t.texto}</p>
        </div>
      </div>

      <div className="moldura mt-12 space-y-6 md:mt-16 md:space-y-10">
        {PACOTES.map((pacote, i) => (
          <article key={pacote.slug} className={`grid ${FUNDOS[i % FUNDOS.length]} md:grid-cols-12`}>
            <div className={`relative aspect-[4/3] md:col-span-5 md:aspect-auto md:min-h-[420px] ${i % 2 ? 'md:order-2' : ''}`}>
              <Ilustracao
                cena={pacote.ilustracao}
                cidade={pacote.cidadeBase}
                titulo={pacote.nome[locale]}
                className="absolute inset-0 size-full"
              />
            </div>
            <div className="flex flex-col justify-between gap-8 px-6 py-8 md:col-span-7 md:px-12 md:py-12">
              <div>
                <p className="font-semibold">
                  {CIDADES[pacote.cidadeBase].nome[locale]} · {pacote.noites[locale]}
                </p>
                <h2 className="mt-2 text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] font-bold leading-tight">{pacote.nome[locale]}</h2>
                <p className="mt-4 max-w-[52ch] text-[1.125rem]">{pacote.descricao[locale]}</p>
                <h3 className="mt-6 font-bold">{t.incluiPasseios}</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {pacote.passeios.map((slug) => {
                    const p = obterPasseio(slug);
                    if (!p) return null;
                    return (
                      <li key={slug}>
                        <Link
                          href={rota(locale, `/passeios/${slug}`)}
                          className="inline-flex min-h-11 items-center bg-white px-4 py-2 font-semibold transition-colors hover:bg-sol"
                        >
                          {p.nome[locale]}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-bold">{t.sobConsulta}</p>
                <a
                  href={linkWhatsApp(fmt(t.msg, { pacote: pacote.nome[locale] }))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="botao botao-whats"
                  data-evento="Contact"
                >
                  <IconeWhatsApp className="size-5" />
                  {t.pedir}
                </a>
              </div>
            </div>
          </article>
        ))}

        <section className="bg-tinta px-6 py-12 text-white md:px-12 md:py-16" aria-labelledby="sob-medida">
          <h2 id="sob-medida" className="text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)] font-bold">
            {t.sobMedidaTitulo}
          </h2>
          <p className="mt-4 max-w-[48ch] text-[1.125rem]">{t.sobMedidaTexto}</p>
          <a
            href={linkWhatsApp(t.sobMedidaMsg)}
            target="_blank"
            rel="noopener noreferrer"
            className="botao botao-whats mt-8"
            data-evento="Contact"
          >
            <IconeWhatsApp className="size-5" />
            {t.pedir}
          </a>
        </section>
      </div>
    </div>
  );
}
