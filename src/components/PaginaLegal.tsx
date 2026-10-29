import type { DocumentoLegal } from '@/content/legal/tipos';
import { ATUALIZADO_EM } from '@/content/legal/tipos';
import { EMPRESA } from '@/config/empresa';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import type { ReactNode } from 'react';

export function PaginaLegal({ doc, idioma, d, extra }: { doc: DocumentoLegal; idioma: Idioma; d: Dicionario; extra?: ReactNode }) {
  const data = new Intl.DateTimeFormat(LOCALE_INTL[idioma], { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${ATUALIZADO_EM}T12:00:00Z`),
  );
  return (
    <div className="moldura pb-24 pt-10 md:pb-40 md:pt-16">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h1 className="titulo-display text-head">{doc.titulo}</h1>
          <p className="mt-4 text-small">{fmt(d.legal.atualizado, { data })}</p>
          <p className="mt-6 bg-sol-claro px-5 py-5 text-[1.0625rem] font-semibold">{doc.resumo}</p>
          <p className="mt-6 text-small">
            {EMPRESA.razaoSocial} ({EMPRESA.tipoEmpresa}) · CNPJ {EMPRESA.cnpj}
          </p>
        </div>
        <article className="max-w-[68ch] lg:col-span-8">
          {doc.secoes.map((s) => (
            <section key={s.titulo} className="mb-10">
              <h2 className="text-[1.375rem] font-bold">{s.titulo}</h2>
              {s.paragrafos.map((p) => (
                <p key={p.slice(0, 40)} className="mt-3">
                  {p}
                </p>
              ))}
              {s.lista && (
                <ul className="mt-3 list-disc space-y-2 pl-6 marker:text-turquesa">
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
    </div>
  );
}
