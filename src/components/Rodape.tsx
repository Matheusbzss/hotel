import Link from 'next/link';
import { EMPRESA } from '@/config/empresa';
import { fmt, rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { linkEmail } from '@/lib/email';
import { RedefinirCookies } from './RedefinirCookies';

/** Fecho do site: o jeito de falar com a gente é o próprio título, o e-mail em letra grande. */
export function Rodape({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const ano = new Date().getFullYear();
  const R = d.rodape;
  const [usuario, dominio] = EMPRESA.email.split('@');
  const links = [
    { href: rota(idioma, '/passeios'), texto: d.nav.passeios },
    { href: rota(idioma, '/passeio-e-hospedagem'), texto: d.nav.hospedagem },
    { href: rota(idioma, '/contato'), texto: d.nav.contato },
    { href: rota(idioma, '/politica-de-cancelamento'), texto: R.cancelamento },
    { href: rota(idioma, '/termos-de-uso'), texto: R.termos },
    { href: rota(idioma, '/politica-de-privacidade'), texto: R.privacidade },
  ];
  return (
    <footer id="rodape" className="tom-acao flex min-h-[64svh] flex-col lg:min-h-[72svh]">
      <div className="moldura flex items-start justify-between gap-8 pt-10">
        <div className="max-w-[46ch] space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/orla-nativa-horizontal-fundo-escuro.svg"
            alt={EMPRESA.marca}
            width={342}
            height={100}
            className="mb-4 h-10 w-auto"
          />
          <p>{R.descricao}</p>
          <p>{R.base}</p>
          <p className="numeros">
            {R.cnpj} {EMPRESA.cnpj}
          </p>
        </div>
        <a href="#conteudo" className="link shrink-0 text-small font-semibold">
          {R.topo}
        </a>
      </div>

      <div className="moldura mt-auto pb-8 pt-16 lg:pt-24">
        <h2 className="sr-only">{R.escreva}</h2>
        <a
          href={linkEmail(d.contato.assunto, d.contato.msg)}
          className="display block text-[10.4vw] leading-[0.95] tracking-[-0.03em] underline-offset-[0.12em] hover:underline md:text-[7.2vw]"
          data-evento="Contact"
        >
          <span className="block md:inline">{usuario}</span>
          <span className="block md:inline">@{dominio}</span>
        </a>
        <div className="mt-12 grid gap-3 text-small md:grid-cols-3 md:items-end">
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="link">
                  {l.texto}
                </Link>
              </li>
            ))}
            <li>
              <RedefinirCookies rotulo={d.cookies.gerenciar} className="link text-left" />
            </li>
          </ul>
          <p className="md:text-center">{R.idiomas}</p>
          <p className="md:text-right">
            {EMPRESA.cidade} – {EMPRESA.uf} · {fmt(R.direitos, { ano, marca: EMPRESA.marca })}
          </p>
        </div>
      </div>
    </footer>
  );
}
