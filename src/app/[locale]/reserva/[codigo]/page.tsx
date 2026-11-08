import type { Metadata } from 'next';
import Link from 'next/link';
import QRCode from 'qrcode';
import { notFound, redirect } from 'next/navigation';
import { StatusReserva } from '@/components/StatusReserva';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { cambioParaTela } from '@/lib/cambio-tela';
import { linkEmail } from '@/lib/email';
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
      <main id="conteudo" className="tom-fundo moldura pb-32 pt-16">
        <h1 className="display text-head">{d.reserva.naoEncontrada}</h1>
        <p className="mt-4 max-w-[44ch] text-lead">{d.reserva.naoEncontradaTexto}</p>
        {/* sem reserva válida, o contato é o e-mail: o WhatsApp só aparece depois da reserva */}
        <a href={linkEmail(d.contato.assunto, d.contato.msg)} className="botao mt-8" data-evento="Contact">
          {d.contato.botao}
        </a>
      </main>
    );
  }
  // um voucher de pedido do carrinho só existe depois do pagamento: antes disso, o que conta é o pedido
  const linkPedido = reserva.pedido ? `${rota(locale, `/pedido/${reserva.pedido.codigo}`)}?t=${encodeURIComponent(token)}` : '';
  if (linkPedido && reserva.status !== 'pago') redirect(linkPedido);
  if (reserva.status === 'pendente') {
    reserva = await sincronizarReserva(reserva, 'consulta').catch(() => reserva!);
  }
  const publica = paraPublico(reserva, locale);
  // o aproximado em dólar ao lado do total (inclusive na tela do Pix), só em espanhol e inglês
  const cambio = await cambioParaTela(locale);
  const qrSvg = publica.pixCopiaECola
    ? await QRCode.toString(publica.pixCopiaECola, { type: 'svg', margin: 1, color: { dark: '#082F3F', light: '#FFFFFF' } })
    : undefined;

  return (
    <main id="conteudo" className="tom-fundo moldura pb-24 pt-8 md:pb-32 md:pt-12">
      {reserva.pedido && (
        <Link href={linkPedido} className="link mb-6 inline-flex min-h-11 items-center gap-2 font-semibold">
          <span aria-hidden="true">←</span> {fmt(d.pedido.voltar, { codigo: reserva.pedido.codigo })}
        </Link>
      )}
      <StatusReserva
        inicial={publica}
        token={token}
        idioma={locale}
        locale={LOCALE_INTL[locale]}
        qrSvg={qrSvg}
        dolar={cambio.taxa}
        numeroWhatsApp={EMPRESA.whatsapp}
        telefoneExibicao={EMPRESA.telefoneExibicao}
        linkWhatsApp={linkWhatsApp(`${d.contato.msg} (${publica.codigo})`)}
        linkNovaReserva={rota(locale, `/passeios/${publica.passeioSlug}`)}
        statusTextos={d.status}
        textos={{
          ...d.reserva,
          msgWhatsapp: d.checkout.msgWhatsapp,
          falarWhatsapp: d.comum.whatsapp,
          horarioSaida: d.horario.saida,
          horarioBusca: d.horario.busca,
          dataHora: d.horario.dataHora,
          encontro: d.passeio.encontro,
          transferIda: d.transfer.ida,
          transferVolta: d.transfer.volta,
          transferVoo: d.transfer.voo,
          transferPassageiros: d.transfer.passageiros,
          transferMalas: d.transfer.malas,
          transferCadeirinhas: d.transfer.cadeirinhas,
          transferDemais: d.transfer.demaisPassageiros,
          transferMsgVoucher: d.transfer.msgVoucherTransfer,
          transferEspera: d.transfer.como[0],
          transferConfirmado: d.transfer.confirmadoTexto,
          noPix: d.preco.noPix,
          noCartao: d.preco.noCartao,
          dolar: d.preco.dolar,
        }}
      />
    </main>
  );
}
