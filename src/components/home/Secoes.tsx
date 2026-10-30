import Image from 'next/image';
import Link from 'next/link';
import type { Dicionario } from '@/i18n';
import { linkEmail } from '@/lib/email';

type Legenda = keyof Dicionario['home']['legendas'];

function Foto({
  src,
  legenda,
  d,
  sizes,
  posicao,
  prioridade,
}: {
  src: string;
  legenda: Legenda;
  d: Dicionario;
  sizes: string;
  posicao?: string;
  prioridade?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={d.home.legendas[legenda]}
      fill
      sizes={sizes}
      quality={78}
      priority={prioridade}
      className="object-cover"
      style={posicao ? { objectPosition: posicao } : undefined}
    />
  );
}

/** Como funciona: três fotos em diagonal, cada etapa ao lado da sua. No celular e no tablet, uma embaixo da outra. */
export function ComoFunciona({ d }: { d: Dicionario }) {
  const H = d.home;
  const [e1, e2, e3] = H.etapas;
  return (
    <section className="moldura entrar grid grid-cols-1 py-24 lg:grid-cols-12 lg:gap-x-8 lg:py-40" aria-labelledby="como-titulo">
      <h2 id="como-titulo" className="titulo lg:col-span-4 lg:col-start-9 lg:row-start-1">
        {H.comoTitulo}
      </h2>

      <figure className="relative mt-10 aspect-[3/4] md:w-[62%] lg:col-span-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:w-auto">
        <Foto
          src="/fotos/buzios/buggy-orla.jpg"
          legenda="buggyOrla"
          d={d}
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 62vw, 100vw"
        />
      </figure>
      <p className="mt-5 max-w-[36ch] lg:col-span-3 lg:col-start-5 lg:row-start-1 lg:mt-0">
        <strong className="font-semibold">{e1.inicio}</strong> {e1.texto}
      </p>

      <figure className="relative ml-auto mt-14 aspect-square w-[62%] md:w-[44%] lg:col-span-3 lg:col-start-6 lg:row-start-2 lg:ml-0 lg:mt-14 lg:w-auto">
        <Foto
          src="/fotos/buzios/escuna-proa.jpg"
          legenda="escunaProa"
          d={d}
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 44vw, 62vw"
        />
      </figure>
      <p className="ml-auto mt-5 w-[62%] max-w-[36ch] md:w-[44%] lg:col-span-3 lg:col-start-9 lg:row-start-2 lg:ml-0 lg:mt-14 lg:w-auto">
        <strong className="font-semibold">{e2.inicio}</strong> {e2.texto}
      </p>

      <figure className="relative mt-14 aspect-[16/10] w-[78%] md:w-[66%] lg:col-span-5 lg:col-start-8 lg:row-start-3 lg:mt-24 lg:w-auto">
        <Foto
          src="/fotos/arraial/barco-gruta.jpg"
          legenda="barcoGruta"
          d={d}
          sizes="(min-width: 1024px) 42vw, (min-width: 768px) 66vw, 78vw"
          posicao="50% 78%"
        />
      </figure>
      <p className="mt-5 w-[78%] max-w-[36ch] md:w-[66%] lg:col-span-4 lg:col-start-3 lg:row-start-3 lg:mt-24 lg:w-auto">
        <strong className="font-semibold">{e3.inicio}</strong> {e3.texto}
      </p>
    </section>
  );
}

/** A política de cancelamento numa tabela sem linhas, uma situação por fila. No celular, cada fila vira um bloco. */
export function TabelaGarantias({ d, className = '' }: { d: Dicionario; className?: string }) {
  const H = d.home;
  const [se, recebe, prazo] = H.garantiasColunas;
  return (
    <table className={`w-full border-collapse text-left ${className}`}>
      <thead className="sr-only md:not-sr-only">
        <tr className="text-small text-(--tinta-suave)">
          <th scope="col" className="pb-3 pr-6 font-normal md:w-[42%]">
            {se}
          </th>
          <th scope="col" className="pb-3 pr-6 font-normal">
            {recebe}
          </th>
          <th scope="col" className="pb-3 text-right font-normal">
            {prazo}
          </th>
        </tr>
      </thead>
      <tbody>
        {H.garantias.map((g, i) => (
          <tr key={g.se} className={`block px-4 py-4 md:table-row md:px-0 md:py-0 ${i % 2 === 0 ? 'bg-(--color-fundo)' : ''}`}>
            <th scope="row" className="block font-semibold md:table-cell md:py-4 md:pl-4 md:pr-6 md:font-normal">
              {g.se}
            </th>
            <td className="block text-(--tinta-suave) md:table-cell md:py-4 md:pr-6 md:text-(--tinta)">
              {g.recebe}
              {g.prazo !== '—' && <span className="md:hidden"> · {g.prazo}</span>}
            </td>
            <td className="numeros hidden text-right md:table-cell md:py-4 md:pr-4">{g.prazo}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Sem letra miúda: a política de cancelamento numa tabela, com o link para o texto completo. */
export function Garantias({ d, hrefPolitica }: { d: Dicionario; hrefPolitica: string }) {
  const H = d.home;
  return (
    <section className="tom-superficie py-24 md:py-40" aria-labelledby="garantias-titulo">
      <div className="moldura entrar">
        <h2 id="garantias-titulo" className="titulo md:text-[clamp(3rem,5vw,4.5rem)]">
          <span className="block">{H.garantiasTitulo[0]}</span>
          <span className="block md:pl-[16.6%]">{H.garantiasTitulo[1]}</span>
        </h2>
        <TabelaGarantias d={d} className="mt-12 md:mt-[72px]" />
        <p className="mt-8 max-w-[60ch]">
          {H.garantiasNota}{' '}
          <Link href={hrefPolitica} className="link font-semibold">
            {H.garantiasLink}
          </Link>
        </p>
      </div>
    </section>
  );
}

/** Pacotes: três fotos de ponta a ponta e, embaixo, a faixa do mar fundo com o convite. */
export function ChamadaPacotes({ d, href }: { d: Dicionario; href: string }) {
  const H = d.home;
  return (
    <section aria-labelledby="pacotes-titulo">
      <div className="grid grid-cols-2 md:grid-cols-3">
        <figure className="relative col-span-2 aspect-[4/3] md:col-span-1 md:aspect-auto md:h-[40svh]">
          <Foto src="/fotos/buzios/buggy-comboio.jpg" legenda="buggyComboio" d={d} sizes="(min-width: 768px) 33vw, 100vw" />
        </figure>
        <figure className="relative aspect-[4/3] md:aspect-auto md:h-[40svh]">
          <Foto src="/fotos/arraial/mergulho.jpg" legenda="mergulho" d={d} sizes="(min-width: 768px) 33vw, 50vw" />
        </figure>
        <figure className="relative aspect-[4/3] md:aspect-auto md:h-[40svh]">
          <Foto src="/fotos/buzios/escuna-mastros.jpg" legenda="escunaMastros" d={d} sizes="(min-width: 768px) 33vw, 50vw" />
        </figure>
      </div>
      <div className="tom-campo">
        <div className="moldura entrar grid gap-6 py-16 md:min-h-[44svh] md:grid-cols-12 md:content-center md:py-20">
          <h2 id="pacotes-titulo" className="titulo md:col-span-7">
            {H.pacotesTitulo}
          </h2>
          <p className="text-lead md:col-span-7">
            <Link href={href} className="underline decoration-4 underline-offset-[6px] hover:decoration-(--color-campo-suave)">
              {H.pacotesLink}
            </Link>
            {H.pacotesTexto}
          </p>
          <p className="text-(--tinta-suave) md:col-span-7">
            {H.pacotesNotas[0]}
            <br />
            {H.pacotesNotas[1]}
          </p>
        </div>
      </div>
    </section>
  );
}

/** Antes de reservar: os fatos práticos e as perguntas, ao lado de uma foto alta. */
export function Perguntas({ d, hrefPasseios }: { d: Dicionario; hrefPasseios: string }) {
  const H = d.home;
  return (
    <section className="tom-superficie pb-24 md:pb-32" aria-labelledby="faq-titulo">
      <div className="moldura grid gap-12 md:grid-cols-12 md:gap-x-8">
        <div className="relative -mx-(--margem) md:col-span-6 md:col-start-7 md:row-start-1 md:mx-0 md:-mt-16 md:mb-20">
          <figure className="relative aspect-[4/5] md:aspect-[3/4]">
            <Foto src="/fotos/buzios/vista-da-escuna.jpg" legenda="vistaDaEscuna" d={d} sizes="(min-width: 768px) 50vw, 100vw" />
          </figure>
          <figure className="absolute -bottom-10 right-(--margem) aspect-square w-[38%] md:-left-10 md:right-auto md:w-1/3">
            <Foto src="/fotos/buzios/buggy-mirante.jpg" legenda="buggyMirante" d={d} sizes="(min-width: 768px) 17vw, 38vw" />
          </figure>
        </div>

        <div className="entrar pt-14 md:col-span-5 md:row-start-1 md:pt-24">
          <h2 id="faq-titulo" className="titulo">
            {H.faqTitulo}
          </h2>
          <ul className="mt-6 space-y-1 text-lead">
            {H.faqFatos.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <div className="mt-10 space-y-7">
            {d.faq.map((f) => (
              <details key={f.p} className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-4 text-lead font-semibold [&::-webkit-details-marker]:hidden">
                  {f.p}
                  <svg viewBox="0 0 24 24" className="mt-1.5 size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </summary>
                <p className="mt-3 text-(--tinta-suave)">{f.r}</p>
              </details>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <Link href={hrefPasseios} className="botao w-full sm:w-auto">
              {H.faqBotao}
            </Link>
            <a href={linkEmail(d.contato.assunto, d.contato.msg)} className="link font-semibold" data-evento="Contact">
              {H.faqLink}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
