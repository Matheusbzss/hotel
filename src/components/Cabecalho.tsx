import Link from 'next/link';
import { EMPRESA } from '@/config/empresa';
import { CASAS_ATIVO } from '@/data/casas';
import { rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { Logo } from './Logo';
import { MenuMovel } from './MenuMovel';
import { SeletorIdioma } from './SeletorIdioma';

/** Barra de 56 px: logo, poucos links e idioma. Transparente sobre o mar da página inicial; no chão claro nas outras. */
export function Cabecalho({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const links = [
    { href: rota(idioma, '/passeios'), texto: d.nav.passeios },
    { href: rota(idioma, '/passeio-e-hospedagem'), texto: d.nav.hospedagem },
    // a área de casas só entra no menu quando for ativada (src/data/casas.ts)
    ...(CASAS_ATIVO ? [{ href: rota(idioma, '/casas-de-temporada'), texto: d.nav.casas }] : []),
    { href: rota(idioma, '/contato'), texto: d.nav.contato },
  ];
  return (
    <header className="cabecalho relative z-30 text-(--tinta)">
      <div className="moldura flex h-16 items-center justify-between gap-3 md:h-20">
        <Link href={rota(idioma, '/')} className="shrink-0 rounded-[4px]" aria-label={`${EMPRESA.marca}, ${d.nav.inicio}`}>
          <Logo fundo="claro" className="logo-claro" />
          <Logo fundo="ceu" className="logo-escuro" />
        </Link>
        <nav aria-label={d.nav.principal} className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-[4px] px-3 py-2.5 font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold underline-offset-[0.3em] hover:underline"
            >
              {l.texto}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <SeletorIdioma atual={idioma} rotulo={d.nav.idioma} />
          <MenuMovel links={links} rotuloAbrir={d.nav.menu} rotuloFechar={d.nav.fechar} />
        </div>
      </div>
    </header>
  );
}
