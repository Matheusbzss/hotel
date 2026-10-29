import Image from 'next/image';
import Link from 'next/link';
import { EMPRESA } from '@/config/empresa';
import type { Dicionario } from '@/i18n';
import { linkWhatsApp } from '@/lib/whatsapp';
import { IconeWhatsApp } from '../IconeWhatsApp';

const FOTOS_VERBOS = ['/fotos/arraial/mergulho.jpg', '/fotos/buzios/escuna-no-pier.jpg', '/fotos/buzios/escuna-proa.jpg'];

/** Como funciona: um verbo por tela, preso no meio enquanto a foto passa por trás. */
export function Verbos({ d }: { d: Dicionario }) {
  return (
    <div>
      {d.home.verbos.map((v, i) => (
        <section key={v.verbo} className="relative isolate h-[100svh]" aria-labelledby={`verbo-${i}`}>
          <Image src={FOTOS_VERBOS[i]} alt="" fill sizes="100vw" className="-z-10 object-cover brightness-[0.55]" />
          <div className="sticky top-1/2 -translate-y-1/2 px-(--margem) text-center">
            <h2 id={`verbo-${i}`} className="largo text-display text-sol">
              {v.verbo}
            </h2>
          </div>
          <p className="tom-mar absolute bottom-(--margem) left-(--margem) right-(--margem) max-w-[34rem] p-5 text-lead md:right-auto">
            {v.texto}
          </p>
        </section>
      ))}
    </div>
  );
}

const FOTOS_GARANTIAS = [
  '/fotos/buzios/escuna-mastros.jpg',
  '/fotos/buzios/vista-da-escuna.jpg',
  '/fotos/arraial/barco-gruta.jpg',
  '/fotos/buzios/buggy-orla.jpg',
];
const TONS = ['tom-turquesa', 'tom-claro', 'tom-sol', 'tom-papel'];

/** Garantias em folhas de cor que se empilham ao rolar, deixando à mostra a aba de cada uma. */
export function Garantias({ d }: { d: Dicionario }) {
  return (
    <section
      className="moldura py-24 md:py-40"
      aria-labelledby="garantias-titulo"
      style={{ ['--aba' as string]: 'clamp(4rem, 3rem + 2.4vw, 5.5rem)' }}
    >
      <h2 id="garantias-titulo" className="largo titulo entrar text-sol">
        <span>{d.home.garantiasTitulo}</span>
      </h2>
      <div className="mt-12">
        {d.home.garantias.map((g, i) => (
          <article
            key={g.titulo}
            className={`${TONS[i % TONS.length]} sticky grid min-h-[70svh] md:h-[86svh] md:grid-cols-12`}
            style={{ top: `calc(${i} * var(--aba))` }}
          >
            <h3 className="flex h-(--aba) items-center px-5 text-[clamp(1.375rem,1rem+1.5vw,2.5rem)] font-bold leading-none md:col-span-12 md:px-8">
              {g.titulo}
            </h3>
            <div className="relative aspect-[4/3] md:order-last md:col-span-6 md:aspect-auto">
              <Image src={FOTOS_GARANTIAS[i]} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
            </div>
            <p className="max-w-[40ch] self-end p-5 text-lead md:col-span-6 md:p-8">{g.texto}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Passeio + hospedagem: a última foto grande, com o texto na metade calma. */
export function ChamadaHospedagem({ d, href }: { d: Dicionario; href: string }) {
  return (
    <section className="relative isolate md:h-[90svh]" aria-labelledby="hospedagem-titulo">
      <div className="relative h-[70svh] md:absolute md:inset-0 md:h-auto">
        <Image
          src="/fotos/arraial/barco-toboga.jpg"
          alt=""
          fill
          sizes="100vw"
          className="-z-10 object-cover object-left brightness-[0.7]"
        />
      </div>
      <div className="moldura md:grid md:h-full md:grid-cols-12 md:items-end md:pb-20">
        <div className="entrar py-10 md:col-span-5 md:col-start-8 md:py-0">
          <h2 id="hospedagem-titulo" className="titulo font-bold text-sol">
            {d.home.hospedagemTitulo}
          </h2>
          <p className="mt-5 max-w-[42ch] text-lead">{d.home.hospedagemTexto}</p>
          <Link href={href} className="botao mt-8 w-full sm:w-auto">
            {d.home.hospedagemBotao}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Perguntas e respostas como texto corrido em duas colunas. */
export function Perguntas({ d }: { d: Dicionario }) {
  return (
    <section className="moldura grid gap-8 py-24 md:grid-cols-12 md:py-40" aria-labelledby="faq-titulo">
      <h2 id="faq-titulo" className="text-[clamp(1.5rem,1.2rem+1vw,2rem)] font-bold leading-tight text-sol md:col-span-3">
        {d.home.faqTitulo}
      </h2>
      <div className="gap-14 md:col-span-8 md:col-start-5 md:columns-2">
        {d.faq.map((f) => (
          <p key={f.p} className="mb-5 break-inside-avoid">
            <strong className="font-semibold text-sol">{f.p}</strong> {f.r}
          </p>
        ))}
      </div>
    </section>
  );
}

/** Contato: um cartão sólido sobre a foto do mar. */
export function CartaoContato({ d }: { d: Dicionario }) {
  const H = d.home;
  return (
    <section className="relative isolate md:h-[100svh]" aria-labelledby="contato-titulo">
      <div className="relative h-[70svh] md:absolute md:inset-0 md:h-auto">
        <Image src="/fotos/buzios/escuna-no-mar.jpg" alt="" fill sizes="100vw" className="-z-10 object-cover" />
      </div>
      <div className="moldura relative -mt-20 pb-16 md:mt-0 md:flex md:h-full md:justify-end md:pt-16">
        <div className="tom-claro w-full p-7 md:sticky md:top-16 md:h-fit md:w-[24rem]">
          <h2 id="contato-titulo" className="text-[clamp(1.5rem,1.2rem+1vw,2rem)] font-bold leading-tight">
            {H.contatoTitulo}
          </h2>
          <p className="mt-3">
            {H.contatoBase}
            <br />
            {H.contatoOnline}
          </p>
          <dl className="mt-5 space-y-2">
            <div className="flex justify-between gap-4">
              <dt>{d.contato.whatsapp}</dt>
              <dd className="numeros text-right font-semibold">{EMPRESA.telefoneExibicao}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{d.contato.instagram}</dt>
              <dd className="text-right font-semibold">
                <a href={EMPRESA.instagramUrl} target="_blank" rel="noopener noreferrer" className="link">
                  {EMPRESA.instagramUsuario}
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{d.contato.email}</dt>
              <dd className="min-w-0 text-right font-semibold">
                <a href={`mailto:${EMPRESA.email}`} className="link break-all">
                  {EMPRESA.email}
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{d.contato.idiomas}</dt>
              <dd className="text-right font-semibold">{H.contatoIdiomas}</dd>
            </div>
          </dl>
          <a
            href={linkWhatsApp(d.contato.msg)}
            target="_blank"
            rel="noopener noreferrer"
            className="botao botao-whats mt-7 w-full"
            data-evento="Contact"
          >
            <IconeWhatsApp className="size-5" />
            {H.contatoBotao}
          </a>
        </div>
      </div>
    </section>
  );
}
