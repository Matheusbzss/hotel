import Link from 'next/link';
import { EMPRESA, enderecoCurto } from '@/config/empresa';
import { fmt, rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { linkWhatsApp } from '@/lib/whatsapp';
import { RedefinirCookies } from './RedefinirCookies';

/** Fecho do site: o convite, os contatos, os dados legais e o nome da agência cortado pela borda. */
export function Rodape({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const ano = new Date().getFullYear();
  const R = d.rodape;
  const links = [
    { href: rota(idioma, '/passeios'), texto: d.nav.passeios },
    { href: rota(idioma, '/passeio-e-hospedagem'), texto: d.nav.hospedagem },
    { href: rota(idioma, '/contato'), texto: d.nav.contato },
  ];
  return (
    <footer className="tom-sol relative overflow-hidden">
      <div className="moldura grid gap-12 pt-20 md:pt-28 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2 className="largo text-head">{R.convite}</h2>
          <Link href={rota(idioma, '/passeios')} className="botao mt-8 w-full sm:w-auto">
            {R.botao}
          </Link>
        </div>
        <nav aria-label={R.contato} className="lg:col-span-4 lg:col-start-9">
          <ul className="space-y-2 text-lead">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="link font-semibold">
                  {l.texto}
                </Link>
              </li>
            ))}
            <li>
              <a
                href={linkWhatsApp(d.contato.msg)}
                target="_blank"
                rel="noopener noreferrer"
                className="link font-semibold"
                data-evento="Contact"
              >
                WhatsApp {EMPRESA.telefoneExibicao}
              </a>
            </li>
            <li>
              <a href={EMPRESA.instagramUrl} target="_blank" rel="noopener noreferrer" className="link font-semibold">
                Instagram
              </a>
            </li>
            <li>
              <a href={`mailto:${EMPRESA.email}`} className="link break-all font-semibold">
                {EMPRESA.email}
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="moldura mt-20 flex flex-col gap-4 text-small md:flex-row md:items-end md:justify-between">
        <p className="max-w-[60ch]">
          {R.razao}: {EMPRESA.razaoSocial} ({EMPRESA.tipoEmpresa}) · {R.cnpj} {EMPRESA.cnpj} · {enderecoCurto} · {R.pagamentos}
          <br />
          {fmt(R.direitos, { ano, marca: EMPRESA.marca })}
        </p>
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          <li>
            <Link href={rota(idioma, '/politica-de-cancelamento')} className="link">
              {R.cancelamento}
            </Link>
          </li>
          <li>
            <Link href={rota(idioma, '/termos-de-uso')} className="link">
              {R.termos}
            </Link>
          </li>
          <li>
            <Link href={rota(idioma, '/politica-de-privacidade')} className="link">
              {R.privacidade}
            </Link>
          </li>
          <li>
            <RedefinirCookies rotulo={d.cookies.gerenciar} className="link text-left" />
          </li>
        </ul>
      </div>

      {/* o nome da agência fecha a página, cortado pela borda de baixo */}
      <p aria-hidden="true" className="largo mt-10 -mb-[0.22em] whitespace-nowrap px-(--margem) text-[15.5vw] leading-[0.82]">
        Victor
        <br />
        Hugo
      </p>
    </footer>
  );
}
