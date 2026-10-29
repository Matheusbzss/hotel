import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { StatusReserva } from '@/components/StatusReserva';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, isIdioma, rota } from '@/i18n/config';
import { sincronizarReserva } from '@/lib/pagamentos';
import { paraPublico, tokenConfere } from '@/lib/reserva-publica';
import { obterReserva } from '@/lib/reservas';
import { linkWhatsApp } from '@/lib/whatsapp';

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function PaginaReserva({ params, searchParams }: PageProps<'/[locale]/reserva/[codigo]'>) {
  const { locale, codigo } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const q = await searchParams;
  const token = typeof q.t === 'string' ? q.t : '';

  let reserva = await obterReserva(codigo).catch(() => null);
  if (!reserva || !tokenConfere(reserva, token)) {
    return (
      <main id="conteudo" className="tom-mar moldura pb-32 pt-16">
        <h1 className="largo text-head text-sol">{d.reserva.naoEncontrada}</h1>
        <p className="mt-4 max-w-[44ch] text-lead">{d.reserva.naoEncontradaTexto}</p>
        <a href={linkWhatsApp(d.contato.msg)} target="_blank" rel="noopener noreferrer" className="botao botao-whats mt-8">
          {d.comum.whatsapp}
        </a>
      </main>
    );
  }
  if (reserva.status === 'pendente') {
    reserva = await sincronizarReserva(reserva, 'consulta').catch(() => reserva!);
  }
  const publica = paraPublico(reserva, locale);
  const qrSvg = publica.pixCopiaECola
    ? await QRCode.toString(publica.pixCopiaECola, { type: 'svg', margin: 1, color: { dark: '#082F3F', light: '#FFFFFF' } })
    : undefined;

  return (
    <main id="conteudo" className="tom-mar moldura pb-24 pt-8 md:pb-32 md:pt-12">
      <StatusReserva
        inicial={publica}
        token={token}
        idioma={locale}
        locale={LOCALE_INTL[locale]}
        qrSvg={qrSvg}
        numeroWhatsApp={EMPRESA.whatsapp}
        linkWhatsApp={linkWhatsApp(`${d.contato.msg} (${publica.codigo})`)}
        linkNovaReserva={rota(locale, `/passeios/${publica.passeioSlug}`)}
        statusTextos={d.status}
        textos={{
          ...d.reserva,
          msgWhatsapp: d.checkout.msgWhatsapp,
          falarWhatsapp: d.comum.whatsapp,
        }}
      />
    </main>
  );
}
