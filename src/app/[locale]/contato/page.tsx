import type { Metadata } from 'next';
import Image from 'next/image';
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

  const linhas = [
    { rotulo: c.whatsapp, valor: EMPRESA.telefoneExibicao, href: linkWhatsApp(c.msg), externo: true },
    { rotulo: c.instagram, valor: EMPRESA.instagramUsuario, href: EMPRESA.instagramUrl, externo: true },
    { rotulo: c.email, valor: EMPRESA.email, href: `mailto:${EMPRESA.email}`, externo: false },
  ];

  return (
    <main id="conteudo" className="tom-mar">
      <div className="moldura grid gap-12 pb-24 pt-8 md:grid-cols-12 md:pb-40 md:pt-14">
        <div className="chegar md:col-span-6">
          <h1 className="largo text-head text-sol">{c.titulo}</h1>
          <p className="mt-5 max-w-[40ch] text-lead">{c.texto}</p>
          <a
            href={linkWhatsApp(c.msg)}
            target="_blank"
            rel="noopener noreferrer"
            className="botao botao-whats mt-8 w-full sm:w-auto"
            data-evento="Contact"
          >
            <IconeWhatsApp className="size-5" />
            {d.comum.whatsapp}
          </a>

          <ul className="mt-14">
            {linhas.map((l) => (
              <li key={l.rotulo}>
                <a
                  href={l.href}
                  {...(l.externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className="group -mx-3 flex flex-col gap-1 px-3 py-4 transition-colors hover:bg-mar-2 sm:flex-row sm:items-baseline sm:justify-between"
                  data-evento={l.rotulo === c.whatsapp ? 'Contact' : undefined}
                >
                  <span className="text-(--tinta-suave)">{l.rotulo}</span>
                  <span className="break-all text-lead font-semibold transition-transform group-hover:translate-x-1">{l.valor}</span>
                </a>
              </li>
            ))}
          </ul>

          <section className="mt-12 grid gap-8 sm:grid-cols-2" aria-label={c.empresa}>
            <div>
              <h2 className="font-bold text-sol">{c.base}</h2>
              <p className="mt-2">{c.baseTexto}</p>
            </div>
            <div>
              <h2 className="font-bold text-sol">{c.empresa}</h2>
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="text-small text-(--tinta-suave)">{c.razao}</dt>
                  <dd>
                    {EMPRESA.razaoSocial} ({EMPRESA.tipoEmpresa})
                  </dd>
                </div>
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
            alt={d.home.fotosLegendas[0]}
            fill
            sizes="(min-width: 768px) 40vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </main>
  );
}
