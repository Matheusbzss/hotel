import type { DocumentoLegal } from '@/content/legal/tipos';
import { ATUALIZADO_EM } from '@/content/legal/tipos';
import { EMPRESA } from '@/config/empresa';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import type { ReactNode } from 'react';

/** Políticas e termos: página clara, para leitura longa. */
export function PaginaLegal({ doc, idioma, d, extra }: { doc: DocumentoLegal; idioma: Idioma; d: Dicionario; extra?: ReactNode }) {
  const data = new Intl.DateTimeFormat(LOCALE_INTL[idioma], { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${ATUALIZADO_EM}T12:00:00Z`),
  );
  return (
    <main id="conteudo" className="tom-claro">
      <div className="moldura grid gap-10 pb-24 pt-8 md:pb-40 md:pt-14 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-8">
            <h1 className="text-head font-bold">{doc.titulo}</h1>
            <p className="mt-4 text-small text-(--tinta-suave)">{fmt(d.legal.atualizado, { data })}</p>
            <p className="tom-sol mt-6 px-5 py-5 font-semibold">{doc.resumo}</p>
            <p className="mt-6 text-small">
              {EMPRESA.razaoSocial} ({EMPRESA.tipoEmpresa}) · CNPJ {EMPRESA.cnpj}
            </p>
          </div>
        </div>
        <article className="max-w-[68ch] lg:col-span-7 lg:col-start-6">
          {doc.secoes.map((s) => (
            <section key={s.titulo} className="mb-10">
              <h2 className="text-lead font-bold">{s.titulo}</h2>
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
