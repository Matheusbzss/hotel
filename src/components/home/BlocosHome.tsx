import Image from 'next/image';
import Link from 'next/link';
import type { Dicionario } from '@/i18n';
import { linkEmail } from '@/lib/email';

type Legenda = keyof Dicionario['home']['legendas'];

function Foto({ src, legenda, d, sizes, posicao }: { src: string; legenda: Legenda; d: Dicionario; sizes: string; posicao?: string }) {
  return (
    <Image
      src={src}
      alt={d.home.legendas[legenda]}
      fill
      sizes={sizes}
      quality={76}
      className="object-cover"
      style={posicao ? { objectPosition: posicao } : undefined}
    />
  );
}

/** A política de cancelamento em linhas de células: a situação, o que você recebe e o prazo. */
export function TabelaGarantias({ d, className = '' }: { d: Dicionario; className?: string }) {
  const H = d.home;
  const [se, recebe, prazo] = H.garantiasColunas;
  return (
    <table className={`w-full border-separate border-spacing-y-(--vao-celula) text-left ${className}`}>
      <thead className="sr-only md:not-sr-only">
        <tr>
          <th scope="col" className="coluna px-3 pb-1 font-semibold md:w-[38%]">
            {se}
          </th>
          <th scope="col" className="coluna px-3 pb-1 font-semibold">
            {recebe}
          </th>
          <th scope="col" className="coluna px-3 pb-1 text-right font-semibold">
            {prazo}
          </th>
        </tr>
      </thead>
      <tbody>
        {H.garantias.map((g) => (
          <tr key={g.se} className="block rounded-[4px] border border-(--color-borda) bg-(--color-papel) md:table-row md:border-0">
            <th
              scope="row"
              className="block px-3 pt-3 font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold md:table-cell md:rounded-l-[4px] md:border md:border-r-0 md:border-(--color-borda) md:py-3.5"
            >
              {g.se}
            </th>
            <td className="block px-3 pb-1 pt-1 md:table-cell md:border-y md:border-(--color-borda) md:py-3.5">{g.recebe}</td>
            <td className="block px-3 pb-3 text-small text-(--color-tinta-suave) md:table-cell md:rounded-r-[4px] md:border md:border-l-0 md:border-(--color-borda) md:py-3.5 md:text-right md:text-(--color-tinta)">
              <span className="font-[family-name:var(--font-semi)] font-semibold">{g.prazo}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Regras e avisos da página inicial: compacto, uma linha por situação; a tabela completa fica na política. */
export function Garantias({ d, hrefPolitica }: { d: Dicionario; hrefPolitica: string }) {
  const H = d.home;
  return (
    <section className="moldura py-12 md:py-16" aria-labelledby="garantias-titulo">
      <div className="entrar grid gap-4 md:grid-cols-12 md:gap-8">
        <div className="md:col-span-4">
          <h2 id="garantias-titulo" className="subtitulo">
            {H.garantiasTitulo}
          </h2>
          <p className="mt-2 max-w-[40ch] text-small text-(--color-tinta-suave)">
            {H.garantiasNota}{' '}
            <Link href={hrefPolitica} className="link font-semibold text-(--color-tinta)">
              {H.garantiasLink}
            </Link>
          </p>
        </div>
        <dl className="divide-y divide-(--color-borda) rounded-[8px] border border-(--color-borda) bg-(--color-papel) text-small md:col-span-8">
          {H.garantias.map((g) => (
            <div key={g.se} className="grid gap-0.5 px-3.5 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_10rem] md:gap-4">
              <dt className="font-semibold">{g.se}</dt>
              <dd>
                {g.recebe}
                {/* no celular o prazo vem na mesma linha (o ponto nunca fica sozinho no fim); no computador, na sua coluna */}
                <span className="text-(--color-tinta-suave) md:hidden"> ·{' '}{g.prazo}</span>
              </dd>
              <dd className="hidden text-right text-(--color-tinta-suave) md:block">{g.prazo}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/** Como funciona: três linhas, cada uma com a foto de verdade do momento e o que acontece nele. */
export function ComoFunciona({ d }: { d: Dicionario }) {
  const H = d.home;
  const fotos: { src: string; legenda: Legenda; posicao?: string }[] = [
    { src: '/fotos/buzios/buggy-orla.jpg', legenda: 'buggyOrla' },
    { src: '/fotos/buzios/escuna-proa.jpg', legenda: 'escunaProa' },
    { src: '/fotos/arraial/barco-gruta.jpg', legenda: 'barcoGruta', posicao: '50% 78%' },
  ];
  return (
    <section className="tom-superficie py-16 md:py-28" aria-labelledby="como-titulo">
      <div className="moldura">
        <h2 id="como-titulo" className="titulo">
          {H.comoTitulo}
        </h2>
        <ol className="entrar mt-6 grid gap-(--vao-celula) md:mt-10">
          {H.etapas.map((e, i) => (
            <li key={e.inicio} className="celula grid grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden md:grid-cols-[14rem_minmax(0,1fr)]">
              <figure className="relative min-h-28 md:min-h-40">
                <Foto src={fotos[i].src} legenda={fotos[i].legenda} d={d} sizes="(min-width: 768px) 14rem, 6.5rem" posicao={fotos[i].posicao} />
              </figure>
              <p className="self-center px-4 py-4 md:px-6">
                <strong className="block font-[family-name:var(--font-semi)] text-lead font-semibold">{e.inicio}</strong>
                <span className="mt-1 block text-small text-(--color-tinta-suave)">{e.texto}</span>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Passeio + hospedagem: o convite numa célula escura, com duas fotos reais. */
export function ChamadaPacotes({ d, href }: { d: Dicionario; href: string }) {
  const H = d.home;
  return (
    <section className="moldura py-16 md:py-28" aria-labelledby="pacotes-titulo">
      <div className="tom-campo grid overflow-hidden rounded-[4px] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="entrar grid content-center gap-4 p-6 md:p-10">
          <h2 id="pacotes-titulo" className="titulo">
            {H.pacotesTitulo}
          </h2>
          <p className="text-lead">
            <Link href={href} className="link font-semibold text-(--color-acao)">
              {H.pacotesLink}
            </Link>
            {H.pacotesTexto}
          </p>
          <p className="text-small text-(--tinta-suave)">
            {H.pacotesNotas[0]} {H.pacotesNotas[1]}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-(--vao-celula)">
          <figure className="relative aspect-[3/4] md:aspect-auto">
            <Foto src="/fotos/arraial/mergulho.jpg" legenda="mergulho" d={d} sizes="(min-width: 768px) 25vw, 50vw" />
          </figure>
          <figure className="relative aspect-[3/4] md:aspect-auto">
            <Foto src="/fotos/buzios/escuna-mastros.jpg" legenda="escunaMastros" d={d} sizes="(min-width: 768px) 25vw, 50vw" />
          </figure>
        </div>
      </div>
    </section>
  );
}

/** Antes de reservar: os fatos práticos e as perguntas, em células que abrem. */
export function Perguntas({ d }: { d: Dicionario }) {
  const H = d.home;
  return (
    <section className="tom-superficie py-16 md:py-28" aria-labelledby="faq-titulo">
      <div className="moldura grid gap-8 md:grid-cols-12 md:gap-x-8">
        <div className="md:col-span-4">
          <h2 id="faq-titulo" className="titulo">
            {H.faqTitulo}
          </h2>
          <ul className="mt-5 grid gap-(--vao-celula)">
            {H.faqFatos.map((f) => (
              <li key={f} className="celula px-3 py-2.5 text-small">
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-3">
            <a href="#passeios" className="botao">
              {H.faqBotao}
            </a>
            <a href={linkEmail(d.contato.assunto, d.contato.msg)} className="link inline-flex min-h-11 items-center font-semibold" data-evento="Contact">
              {H.faqLink}
            </a>
          </div>
        </div>
        <div className="grid content-start gap-(--vao-celula) md:col-span-8">
          {d.faq.map((f) => (
            <details key={f.p} className="celula group">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold [&::-webkit-details-marker]:hidden">
                {f.p}
                <svg viewBox="0 0 24 24" className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-180" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.75" />
                </svg>
              </summary>
              <p className="px-4 pb-4 text-(--color-tinta-suave)">{f.r}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
