import Image from 'next/image';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import type { Dicionario } from '@/i18n';
import { linkEmail } from '@/lib/email';

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

/** Uma foto real de fundo, de borda a borda, com o conteúdo por cima em vidro (o vidro só aparece sobre foto). */
export function FaixaFoto({ src, posicao, children, ...props }: { src: string; posicao?: string; children: ReactNode } & ComponentProps<'section'>) {
  return (
    <section className="relative isolate overflow-hidden py-14 md:py-24" {...props}>
      <Image src={src} alt="" fill sizes="100vw" quality={70} className="-z-10 object-cover" style={posicao ? { objectPosition: posicao } : undefined} />
      <div className="moldura">{children}</div>
    </section>
  );
}

/** Regras e avisos da página inicial: um vidro claro sobre a água de Arraial vista do alto; a tabela completa fica na política. */
export function Garantias({ d, hrefPolitica }: { d: Dicionario; hrefPolitica: string }) {
  const H = d.home;
  return (
    <FaixaFoto src="/fotos/arraial/lancha-agua-turquesa-do-alto.jpg" posicao="30% 40%" aria-labelledby="garantias-titulo">
      <div className="grid gap-4 md:ml-auto md:max-w-2xl">
        <div className="entrar vidro vidro-claro rounded-[24px] p-5 md:p-8">
          <h2 id="garantias-titulo" className="subtitulo">
            {H.garantiasTitulo}
          </h2>
          <dl className="mt-4 divide-y divide-(--color-tinta)/15 text-small">
            {H.garantias.map((g) => (
              <div key={g.se} className="grid gap-0.5 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:gap-4">
                <dt className="font-semibold">{g.se}</dt>
                <dd>
                  {g.recebe}
                  {/* o prazo vem na mesma linha, preso ao ponto por um espaço que não quebra (o ponto nunca fica sozinho no fim) */}
                  <span className="text-(--color-tinta-suave)">{' · '}{g.prazo}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 font-semibold">{d.comum.avisoWhatsapp}</p>
          <p className="mt-2 max-w-[60ch] text-small">
            {H.garantiasNota}{' '}
            <Link href={hrefPolitica} className="link font-semibold">
              {H.garantiasLink}
            </Link>
          </p>
        </div>
        {/* o que vale no dia: embarque, documento, taxas, saúde e o roteiro */}
        <div className="entrar vidro vidro-claro rounded-[24px] p-5 md:p-8">
          <h3 className="font-[family-name:var(--font-semi)] text-lead font-semibold">{H.diaTitulo}</h3>
          <ul className="mt-3 grid gap-2 text-small">
            {H.diaRegras.map((r) => (
              <li key={r} className="flex gap-2.5">
                <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-(--color-turquesa-texto)" aria-hidden="true" />
                {r}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </FaixaFoto>
  );
}

/** Como funciona: os passos em vidro escuro sobre a orla de Cabo Frio ao entardecer. */
export function ComoFunciona({ d }: { d: Dicionario }) {
  const H = d.home;
  return (
    <FaixaFoto src="/fotos/cabo-frio/orla-entardecer.jpg" posicao="50% 60%" aria-labelledby="como-titulo">
      <h2 id="como-titulo" className="titulo text-white [text-shadow:0_1px_14px_rgb(0_0_0/0.35)]">
        {H.comoTitulo}
      </h2>
      <ol className="entrar mt-6 grid gap-3 md:mt-8 md:grid-cols-3 md:gap-4">
        {H.etapas.map((e, i) => (
          <li key={e.inicio} className="vidro vidro-escuro rounded-[20px] p-5 md:p-6">
            <span className="numeros font-[family-name:var(--font-semi)] text-[2rem] font-semibold leading-none" aria-hidden="true">
              {i + 1}
            </span>
            <strong className="mt-3 block font-[family-name:var(--font-semi)] text-lead font-semibold">{e.inicio}</strong>
            <span className="mt-1 block text-small text-white/90">{e.texto}</span>
          </li>
        ))}
      </ol>
    </FaixaFoto>
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
