import Link from 'next/link';
import { EMPRESA } from '@/config/empresa';
import { CASAS_ATIVO } from '@/data/casas';
import { rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { Logo } from './Logo';
import { MenuMovel } from './MenuMovel';
import { SeletorIdioma } from './SeletorIdioma';
import { VigiaRolagem } from './VigiaRolagem';

/**
 * Cápsula de vidro fosco presa no topo (estilo iPhone): logo, poucos links e idioma.
 * Sobre a foto da página inicial ela é translúcida com texto branco; ao rolar, vira vidro claro.
 */
export function Cabecalho({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const links = [
    { href: rota(idioma, '/passeios'), texto: d.nav.passeios },
    { href: rota(idioma, '/passeio-e-hospedagem'), texto: d.nav.hospedagem },
    // a área de casas só entra no menu quando for ativada (src/data/casas.ts)
    ...(CASAS_ATIVO ? [{ href: rota(idioma, '/casas-de-temporada'), texto: d.nav.casas }] : []),
    { href: rota(idioma, '/contato'), texto: d.nav.contato },
  ];
  return (
    <header className="cabecalho">
      <div className="cabecalho-barra vidro vidro-claro relative flex h-14 items-center justify-between gap-2 pl-2.5 pr-1.5 md:h-16 md:pl-4 md:pr-2">
        <Link href={rota(idioma, '/')} className="shrink-0 rounded-[8px]" aria-label={`${EMPRESA.marca}, ${d.nav.inicio}`}>
          <Logo fundo="claro" className="logo-claro" />
          <Logo fundo="ceu" className="logo-escuro" />
        </Link>
        <nav aria-label={d.nav.principal} className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-full px-3.5 py-2.5 font-[family-name:var(--font-semi)] text-[1.0625rem] font-semibold transition-colors duration-200 hover:bg-[color-mix(in_oklab,currentColor_12%,transparent)]"
            >
              {l.texto}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <SeletorIdioma atual={idioma} rotulo={d.nav.idioma} />
          <MenuMovel links={links} rotuloAbrir={d.nav.menu} rotuloFechar={d.nav.fechar} />
        </div>
      </div>
      <VigiaRolagem />
    </header>
  );
}
