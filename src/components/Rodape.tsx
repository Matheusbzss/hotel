import Link from 'next/link';
import { EMPRESA } from '@/config/empresa';
import { fmt, isIdiomaGuia, rota, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { linkEmail } from '@/lib/email';
import { IconeInstagram } from './IconeInstagram';
import { IconeWhatsApp } from './IconeWhatsApp';
import { Emblema } from './Logo';
import { RedefinirCookies } from './RedefinirCookies';

/** Rodapé: o emblema redondo, os dados da empresa (Decreto 7.962/2013), os ícones de enfeite e as políticas. */
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
        <div className="space-y-4 md:flex md:shrink-0 md:items-start md:gap-6 md:space-y-0">
          <Emblema titulo={EMPRESA.marca} className="size-24 shrink-0" />
          <div className="space-y-4">
            <address className="space-y-1 text-small not-italic text-(--tinta-suave)">
              <p className="font-semibold text-white">{EMPRESA.razaoSocial}</p>
              <p className="numeros">CNPJ {EMPRESA.cnpj}</p>
              <p>{EMPRESA.enderecoRua}</p>
              <p>{EMPRESA.enderecoCidade}</p>
              <p>
                {R.suporte}{' '}
                <a href={linkEmail(d.contato.assunto, d.contato.msg)} className="link font-semibold text-white" data-evento="Contact">
                  {EMPRESA.email}
                </a>
              </p>
            </address>
            {/* só enfeite: sem link, sem texto e sem efeito ao tocar. O WhatsApp de verdade aparece depois do pagamento. */}
            <div aria-hidden="true" className="pointer-events-none flex select-none items-center gap-4 text-(--tinta-suave)">
              <IconeInstagram className="size-5" />
              <IconeWhatsApp className="size-5" />
            </div>
          </div>
        </div>
        <div className="space-y-3 md:text-right">
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-small md:justify-end">
            {/* os guias só existem nas duas versões do espanhol: cada uma leva à sua lista */}
            {isIdiomaGuia(idioma) && (
              <li>
                <Link href={rota(idioma, '/guias')} className="link">
                  Guías de viaje
                </Link>
              </li>
            )}
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
