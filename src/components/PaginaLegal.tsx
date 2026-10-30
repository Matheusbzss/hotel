import type { DocumentoLegal } from '@/content/legal/tipos';
import { ATUALIZADO_EM } from '@/content/legal/tipos';
import { EMPRESA } from '@/config/empresa';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { linkEmail } from '@/lib/email';
import type { ReactNode } from 'react';
import { IconeEmail } from './IconeEmail';

/** Âncora de cada seção, a partir do título ("3. Cancelamento com 24 horas…" → "cancelamento-com-24-horas…"). */
function ancora(titulo: string) {
  return titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^\d+\.\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Políticas e termos: o nome grande e o resumo no alto, com a ação que a pessoa mais procura nessa página.
 * Ao lado do texto, o índice das seções (no celular, recolhido).
 */
export function PaginaLegal({
  doc,
  idioma,
  d,
  titulo,
  acao,
  destaque,
  extra,
}: {
  doc: DocumentoLegal;
  idioma: Idioma;
  d: Dicionario;
  /** o nome curto, o mesmo do rodapé */
  titulo: string;
  acao: { botao: string; assunto: string; msg: string };
  /** faixa entre o resumo e o texto completo (a tabela, na política de cancelamento) */
  destaque?: ReactNode;
  extra?: ReactNode;
}) {
  const data = new Intl.DateTimeFormat(LOCALE_INTL[idioma], { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${ATUALIZADO_EM}T12:00:00Z`),
  );
  const indice = (
    <ul className="mt-3 space-y-2">
      {doc.secoes.map((s) => (
        <li key={s.titulo}>
          <a href={`#${ancora(s.titulo)}`} className="underline-offset-4 hover:underline">
            {s.titulo}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <main id="conteudo" className="tom-fundo">
      <header className="moldura chegar grid gap-6 pb-16 pt-10 md:pb-24 md:pt-16 lg:grid-cols-12 lg:gap-x-8">
        <h1 className="display text-[clamp(3rem,9vw,8.5rem)] leading-[0.92] lg:col-span-12">{titulo}</h1>
        <p className="max-w-[56ch] text-lead md:mt-2 lg:col-span-7">{doc.resumo}</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8 lg:col-span-4 lg:col-start-9 lg:flex-col lg:items-start lg:gap-4 lg:self-end">
          <a href={linkEmail(acao.assunto, acao.msg || undefined)} className="botao w-full sm:w-auto" data-evento="Contact">
            <IconeEmail className="size-5" />
            {acao.botao}
          </a>
          <p className="text-small text-(--tinta-suave)">
            {fmt(d.legal.atualizado, { data })} · {EMPRESA.marca} · CNPJ {EMPRESA.cnpj}
          </p>
        </div>
      </header>

      {destaque}

      <div className="moldura grid gap-8 pb-24 pt-14 md:pb-40 md:pt-20 lg:grid-cols-12 lg:gap-10">
        <details className="tom-superficie group px-5 py-3 lg:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
            {d.legal.indice}
            <svg viewBox="0 0 24 24" className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true">
              <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </summary>
          <div className="pb-3">{indice}</div>
        </details>
        <nav aria-label={d.legal.indice} className="hidden text-small lg:col-span-4 lg:block">
          <div className="sticky top-8">
            <p className="font-semibold">{d.legal.indice}</p>
            {indice}
          </div>
        </nav>
        <article className="max-w-[68ch] lg:col-span-6 lg:col-start-7 lg:max-w-none">
          {doc.secoes.map((s) => (
            <section key={s.titulo} id={ancora(s.titulo)} className="entrar mb-12 scroll-mt-8">
              <h2 className="text-lead font-semibold">{s.titulo}</h2>
              {s.paragrafos.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3">
                  {p}
                </p>
              ))}
              {s.lista && (
                <ul className="mt-3 list-disc space-y-2 pl-6">
                  {s.lista.map((item) => (
                    <li key={item.slice(0, 40)}>{item}</li>
                  ))}
                </ul>
              )}
              {s.depois?.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3">
                  {p}
                </p>
              ))}
            </section>
          ))}
          {extra}
        </article>
      </div>
    </main>
  );
}
