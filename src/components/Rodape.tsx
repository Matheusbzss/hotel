import Link from 'next/link';
import { EMPRESA, enderecoCurto } from '@/config/empresa';
import { fmt, rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { linkWhatsApp } from '@/lib/whatsapp';

export function Rodape({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const ano = new Date().getFullYear();
  return (
    <footer className="bg-tinta pt-16 text-white md:pt-24">
      <div className="moldura">
        <div className="mx-auto max-w-6xl">
          <div className="recorte-topo" aria-hidden="true" />
          <div className="relative grid gap-10 bg-papel px-6 pb-10 pt-8 text-tinta md:grid-cols-2 md:gap-16 md:px-14 md:pb-14 md:pt-12">
            <div>
              <p className="script text-[2.75rem] leading-none text-coral md:text-[3.5rem]">{d.rodape.assinatura}</p>
              <p className="mt-5 max-w-[40ch]">{d.rodape.mensagem}</p>
              <p className="mt-6 font-semibold">{d.rodape.pagamentos}</p>
            </div>
            <div className="relative md:pl-10">
              <div className="absolute right-0 top-0 hidden rotate-3 bg-white p-[6px] sm:block" aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo/agencia-victor-hugo-emblema.svg" alt="" width={76} height={76} className="size-[76px]" loading="lazy" />
              </div>
              <h2 className="text-lead font-semibold">{d.rodape.contato}</h2>
              <ul className="mt-4 space-y-3 text-[1.0625rem]">
                <li>
                  <a
                    href={linkWhatsApp(d.contato.msg)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline-offset-4 hover:underline"
                    data-evento="Contact"
                  >
                    WhatsApp {EMPRESA.telefoneExibicao}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${EMPRESA.email}`} className="break-all underline-offset-4 hover:underline">
                    {EMPRESA.email}
                  </a>
                </li>
                <li>
                  <a href={EMPRESA.instagramUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
                    Instagram {EMPRESA.instagramUsuario}
                  </a>
                </li>
                <li>{enderecoCurto}</li>
              </ul>
              <h2 className="mt-8 text-lead font-semibold">{d.rodape.politicas}</h2>
              <ul className="mt-4 space-y-3 text-[1.0625rem]">
                <li>
                  <Link href={rota(idioma, '/politica-de-cancelamento')} className="underline-offset-4 hover:underline">
                    {d.rodape.cancelamento}
                  </Link>
                </li>
                <li>
                  <Link href={rota(idioma, '/termos-de-uso')} className="underline-offset-4 hover:underline">
                    {d.rodape.termos}
                  </Link>
                </li>
                <li>
                  <Link href={rota(idioma, '/politica-de-privacidade')} className="underline-offset-4 hover:underline">
                    {d.rodape.privacidade}
                  </Link>
                </li>
              </ul>
            </div>
            <div className="bg-areia-clara px-5 py-4 text-small md:col-span-2">
              <p>
                <strong>{d.rodape.razao}:</strong> {EMPRESA.razaoSocial} ({EMPRESA.tipoEmpresa}) · <strong>{d.rodape.cnpj}:</strong>{' '}
                {EMPRESA.cnpj}
              </p>
              <p className="mt-1">
                {enderecoCurto} · {EMPRESA.email} · {EMPRESA.telefoneExibicao}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start justify-between gap-6 py-12 md:flex-row md:items-end">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/agencia-victor-hugo-horizontal-fundo-escuro.svg"
            alt={EMPRESA.marca}
            width={344}
            height={100}
            loading="lazy"
            className="h-auto w-full max-w-[520px]"
          />
          <p className="text-small text-white/85">{fmt(d.rodape.direitos, { ano, marca: EMPRESA.marca })}</p>
        </div>
      </div>
    </footer>
  );
}
