import Link from 'next/link';
import { EMPRESA } from '@/config/empresa';
import { rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { linkWhatsApp } from '@/lib/whatsapp';
import { IconeWhatsApp } from './IconeWhatsApp';
import { MenuMovel } from './MenuMovel';
import { SeletorIdioma } from './SeletorIdioma';

export function Cabecalho({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const links = [
    { href: rota(idioma, '/passeios'), texto: d.nav.passeios },
    { href: rota(idioma, '/passeio-e-hospedagem'), texto: d.nav.hospedagem },
    { href: rota(idioma, '/contato'), texto: d.nav.contato },
  ];
  const whats = { href: linkWhatsApp(d.contato.msg), texto: d.comum.whatsapp };
  return (
    <header className="relative z-30 bg-white">
      <div className="faixa-guarda-sol h-2" aria-hidden="true" />
      <div className="moldura flex h-[76px] items-center justify-between gap-3 md:h-[88px]">
        <Link href={rota(idioma, '/')} className="shrink-0" aria-label={`${EMPRESA.marca} — ${d.nav.inicio}`}>
          <picture>
            <source media="(max-width: 389px)" srcSet="/logo/agencia-victor-hugo-emblema.svg" width={100} height={100} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo/agencia-victor-hugo-horizontal.svg"
              alt={`${EMPRESA.marca} — ${EMPRESA.slogan}`}
              width={344}
              height={100}
              className="h-[44px] w-auto md:h-[56px]"
              fetchPriority="high"
            />
          </picture>
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-full px-4 py-3 font-semibold transition-colors hover:bg-areia-clara">
              {l.texto}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 md:gap-3">
          <SeletorIdioma atual={idioma} rotulo={d.nav.idioma} />
          <a
            href={whats.href}
            target="_blank"
            rel="noopener noreferrer"
            className="botao botao-whats hidden lg:inline-flex"
            data-evento="Contact"
          >
            <IconeWhatsApp className="size-5" />
            {whats.texto}
          </a>
          <MenuMovel links={links} rotuloAbrir={d.nav.menu} rotuloFechar={d.nav.fechar} whatsapp={whats} />
        </div>
      </div>
    </header>
  );
}
