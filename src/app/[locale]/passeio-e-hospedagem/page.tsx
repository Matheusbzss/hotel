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

export default async function PasseioEHospedagem({ params }: PageProps<'/[locale]/passeio-e-hospedagem'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const t = d.hospedagemPagina;

  return (
    <main id="conteudo" className="tom-mar pb-24 md:pb-40">
      <div className="moldura grid gap-6 pt-8 md:grid-cols-12 md:pt-14">
        <h1 className="chegar largo text-head text-sol md:col-span-7">
          <span>{t.titulo}</span>
        </h1>
        <p className="max-w-[46ch] self-end text-lead md:col-span-5">{t.texto}</p>
      </div>

      <div className="mt-14 md:mt-24">
        {PACOTES.map((pacote, i) => (
          <article key={pacote.slug} className={`grid md:grid-cols-12 ${i % 2 ? 'bg-mar-2' : ''}`}>
            <div className={`relative aspect-[4/3] md:col-span-6 md:aspect-auto md:min-h-[34rem] ${i % 2 ? 'md:order-2' : ''}`}>
              {pacote.foto && (
                <Image src={pacote.foto} alt={pacote.nome[locale]} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
              )}
            </div>
            <div className="entrar flex flex-col justify-between gap-10 px-(--margem) py-10 md:col-span-6 md:px-14 md:py-14">
              <div>
                <p className="text-small text-(--tinta-suave)">
                  {CIDADES[pacote.cidadeBase].nome[locale]} · {pacote.noites[locale]}
                </p>
                <h2 className="mt-2 text-head font-bold text-sol">{pacote.nome[locale]}</h2>
                <p className="mt-5 max-w-[48ch] text-lead">{pacote.descricao[locale]}</p>
                <h3 className="mt-8 font-semibold">{t.incluiPasseios}</h3>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {pacote.passeios.map((slug) => {
                    const p = obterPasseio(slug);
                    if (!p) return null;
                    return (
                      <li key={slug}>
                        <Link href={rota(locale, `/passeios/${slug}`)} className="filtro">
                          {p.nome[locale]}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
      </div>

      <section className="moldura mt-24 md:mt-40" aria-labelledby="sob-medida">
        <div className="tom-sol grid gap-6 px-6 py-12 md:grid-cols-12 md:px-12 md:py-16">
          <h2 id="sob-medida" className="largo text-head md:col-span-7">
            {t.sobMedidaTitulo}
          </h2>
          <div className="md:col-span-5">
            <p className="text-lead">{t.sobMedidaTexto}</p>
            <a href={linkEmail(t.sobMedidaAssunto, t.sobMedidaMsg)} className="botao mt-8 w-full sm:w-auto" data-evento="Contact">
              <IconeEmail className="size-5" />
              {t.pedir}
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
