import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconeEmail } from '@/components/IconeEmail';
import { PACOTES } from '@/data/pacotes';
import { CIDADES, obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { fmt, isIdioma, rota } from '@/i18n/config';
import { linkEmail } from '@/lib/email';
import { alternates } from '@/lib/site';

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

/** Passeio + hospedagem: a foto do mar abre a página; cada pacote é uma foto e o seu texto, lado a lado. */
export default async function PasseioEHospedagem({ params }: PageProps<'/[locale]/passeio-e-hospedagem'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const t = d.hospedagemPagina;
  const sobMedida = linkEmail(t.sobMedidaAssunto, t.sobMedidaMsg);

  return (
    <main id="conteudo" className="tom-fundo">
      <section
        className="abertura relative isolate flex min-h-[78svh] flex-col justify-end overflow-hidden text-white [--acao-tinta:var(--color-tinta)] [--acao:#ffffff] [--foco:#ffffff]"
        aria-labelledby="pacotes-titulo"
      >
        <Image
          src="/fotos/arraial/barco-toboga.jpg"
          alt={d.home.legendas.barcoToboga}
          fill
          priority
          sizes="100vw"
          className="respira -z-20 object-cover"
        />
        <div className="veu-cima absolute inset-x-0 top-0 -z-10 h-40" aria-hidden="true" />
        <div className="veu-baixo absolute inset-x-0 bottom-0 -z-10 h-[70%]" aria-hidden="true" />
        <div className="moldura chegar grid gap-6 pb-10 md:pb-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <h1 id="pacotes-titulo" className="display text-[clamp(3rem,9vw,8rem)] leading-[0.92]">
              {t.titulo}
            </h1>
            <p className="relative z-10 mt-5 max-w-[46ch] text-lead">{t.texto}</p>
          </div>
          <a href={sobMedida} className="botao relative z-10 justify-self-start" data-evento="Contact">
            <IconeEmail className="size-5" />
            {t.pedir}
          </a>
        </div>
      </section>

      {PACOTES.map((pacote, i) => (
        <article
          key={pacote.slug}
          className={`grid lg:grid-cols-12 ${i % 2 ? 'tom-superficie' : ''}`}
          aria-labelledby={`pacote-${pacote.slug}`}
        >
          <div className={`relative aspect-[4/3] lg:col-span-6 lg:aspect-auto lg:min-h-[36rem] ${i % 2 ? 'lg:order-2' : ''}`}>
            {pacote.foto && (
              <Image src={pacote.foto} alt={pacote.nome[locale]} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
            )}
          </div>
          <div className="entrar flex flex-col justify-between gap-10 px-(--margem) py-12 lg:col-span-6 lg:px-16 lg:py-16">
            <div>
              <h2 id={`pacote-${pacote.slug}`} className="titulo max-w-[16ch]">
                {pacote.nome[locale]}
              </h2>
              <p className="mt-3 font-semibold">
                {CIDADES[pacote.cidadeBase].nome[locale]} · {pacote.noites[locale]}
              </p>
              <p className="mt-6 max-w-[52ch]">{pacote.descricao[locale]}</p>
              <h3 className="mt-8 font-semibold">{t.incluiPasseios}</h3>
              <ul className="mt-3 space-y-1.5">
                {pacote.passeios.map((slug) => {
                  const p = obterPasseio(slug);
                  if (!p) return null;
                  return (
                    <li key={slug}>
                      <Link href={rota(locale, `/passeios/${slug}`)} className="link">
                        {p.nome[locale]}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-semibold">{t.sobConsulta}</p>
              <a
                href={linkEmail(fmt(t.assunto, { pacote: pacote.nome[locale] }), fmt(t.msg, { pacote: pacote.nome[locale] }))}
                className="botao"
                data-evento="Contact"
              >
                <IconeEmail className="size-5" />
                {t.pedir}
              </a>
            </div>
          </div>
        </article>
      ))}

      <section className="tom-campo" aria-labelledby="sob-medida">
        <div className="moldura entrar grid gap-6 py-20 md:grid-cols-12 md:py-28">
          <h2 id="sob-medida" className="titulo md:col-span-6">
            {t.sobMedidaTitulo}
          </h2>
          <div className="md:col-span-5 md:col-start-8">
            <p className="text-lead">{t.sobMedidaTexto}</p>
            <a href={sobMedida} className="botao mt-8 w-full sm:w-auto" data-evento="Contact">
              <IconeEmail className="size-5" />
              {t.pedir}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
