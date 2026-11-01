import Link from 'next/link';
import { EMPRESA } from '@/config/empresa';
import { fmt, rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { linkEmail } from '@/lib/email';
import { Logo } from './Logo';
import { RedefinirCookies } from './RedefinirCookies';

/** Rodapé compacto: logo, o e-mail de suporte e as políticas numa linha só. */
export function Rodape({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const ano = new Date().getFullYear();
  const R = d.rodape;
  const politicas = [
    { href: rota(idioma, '/politica-de-cancelamento'), texto: R.politicas[0] },
    { href: rota(idioma, '/termos-de-uso'), texto: R.politicas[1] },
    { href: rota(idioma, '/politica-de-privacidade'), texto: R.politicas[2] },
  ];
  return (
    <footer id="rodape" className="tom-campo relative z-10">
      <div className="moldura flex flex-col gap-6 py-10 md:flex-row md:items-end md:justify-between md:py-12">
        <div className="space-y-4">
          <Logo fundo="escuro" />
          <p className="text-small text-(--tinta-suave)">
            {R.suporte}{' '}
            <a
              href={linkEmail(d.contato.assunto, d.contato.msg)}
              className="link font-semibold text-white"
              data-evento="Contact"
            >
              {EMPRESA.email}
            </a>
          </p>
        </div>
        <div className="space-y-3 md:text-right">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-small md:justify-end">
            {politicas.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="link">
                  {l.texto}
                </Link>
              </li>
            ))}
            <li>
              <RedefinirCookies rotulo={R.cookies} className="link text-left" />
            </li>
          </ul>
          <p className="text-caption text-(--tinta-suave)">{fmt(R.direitos, { ano, marca: EMPRESA.marca })}</p>
        </div>
      </div>
    </footer>
  );
}
