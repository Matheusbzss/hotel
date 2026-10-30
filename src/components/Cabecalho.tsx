import Link from 'next/link';
import { EMPRESA } from '@/config/empresa';
import { CASAS_ATIVO } from '@/data/casas';
import { rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { MenuMovel } from './MenuMovel';
import { SeletorIdioma } from './SeletorIdioma';

/** Barra simples: marca, poucos links e idioma. Sobre a foto na home; na cor da página nas outras. */
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
      <div className="moldura flex h-[72px] items-center justify-between gap-3 md:h-[88px]">
        <Link href={rota(idioma, '/')} className="shrink-0" aria-label={`${EMPRESA.marca} — ${d.nav.inicio}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/orla-nativa-horizontal-fundo-escuro.svg"
            alt={`${EMPRESA.marca} — ${EMPRESA.slogan}`}
            width={313}
            height={100}
            className="logo-escuro h-[40px] w-auto md:h-[52px]"
            fetchPriority="high"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/orla-nativa-horizontal.svg"
            alt={`${EMPRESA.marca} — ${EMPRESA.slogan}`}
            width={313}
            height={100}
            className="logo-claro hidden h-[40px] w-auto md:h-[52px]"
          />
        </Link>
        <nav aria-label={d.nav.principal} className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-3 font-semibold underline-offset-[0.3em] hover:underline">
              {l.texto}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 md:gap-3">
          <SeletorIdioma atual={idioma} rotulo={d.nav.idioma} />
          <MenuMovel links={links} rotuloAbrir={d.nav.menu} rotuloFechar={d.nav.fechar} />
        </div>
      </div>
    </header>
  );
}
