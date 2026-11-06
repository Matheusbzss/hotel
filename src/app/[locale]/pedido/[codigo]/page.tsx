import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { CompraPedido } from '@/components/carrinho/CompraPedido';
import { IconeWhatsApp } from '@/components/IconeWhatsApp';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { linkEmail } from '@/lib/email';
import { paraPublico, tokenConfere, type ReservaPublica } from '@/lib/reserva-publica';
import { obterPedido } from '@/lib/reservas';
import { formatarDataIso } from '@/lib/validacao';
import { linkWhatsApp } from '@/lib/whatsapp';

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** A página do pedido do carrinho: o que falta para fechar e, depois de pago, todos os vouchers. */
export default async function PaginaPedido({ params, searchParams }: PageProps<'/[locale]/pedido/[codigo]'>) {
  const { locale, codigo } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const intl = LOCALE_INTL[locale];
  const q = await searchParams;
  const token = typeof q.t === 'string' ? q.t : '';

  const reservas = await obterPedido(codigo).catch(() => []);
  const primeira = reservas[0];
  if (!primeira || !tokenConfere(primeira, token)) {
    return (
      <main id="conteudo" className="tom-fundo moldura pb-32 pt-16">
        <h1 className="display text-head">{d.reserva.naoEncontrada}</h1>
        <p className="mt-4 max-w-[44ch] text-lead">{d.reserva.naoEncontradaTexto}</p>
        {/* sem pedido válido, o contato é o e-mail: o WhatsApp só aparece depois da reserva */}
        <a href={linkEmail(d.contato.assunto, d.contato.msg)} className="botao mt-8" data-evento="Contact">
          {d.contato.botao}
        </a>
      </main>
    );
  }
  // com um item só, o voucher é o próprio pedido
  if (!primeira.pedido) redirect(`${rota(locale, `/reserva/${primeira.codigo}`)}?t=${encodeURIComponent(token)}`);

  const { status, pedido } = primeira;
  const itens = reservas.map((r) => paraPublico(r, locale));
  const pago = status === 'pago';
  const esperando = status === 'aguardando_whatsapp';
  const brl = (c: number) => formatarCifra(c, intl);
  const noPix = pedido.totalPixCentavos ?? pedido.totalCentavos;
  const total = esperando ? `${brl(noPix)} ${d.preco.noPix} · ${brl(pedido.totalCentavos)} ${d.preco.noCartao}` : brl(pedido.totalCentavos);

  const nomeItem = (r: ReservaPublica) =>
    r.transfer
      ? `${r.passeioNome}: ${r.transfer.ida.saida} → ${r.transfer.ida.destino}`
      : r.opcaoNome
        ? `${r.passeioNome} (${r.opcaoNome})`
        : r.passeioNome;
  const dataHora = (data: string, hora?: string) => {
    const texto = formatarDataIso(data, intl);
    return hora ? fmt(d.horario.dataHora, { data: texto, hora }) : texto;
  };
  const quando = (r: ReservaPublica) => dataHora(r.data, r.transfer?.ida.hora ?? r.horario?.texto);
  // a volta do transfer, quando tem
  const volta = (r: ReservaPublica) => {
    const v = r.transfer?.volta;
    return v ? fmt(d.carrinho.volta, { quando: dataHora(v.data, v.hora) }) : '';
  };
  const mensagem = fmt(d.pedido.msgWhatsapp, {
    codigo,
    itens: itens
      .map((r) =>
        fmt(d.pedido.msgItem, { item: nomeItem(r), data: [quando(r), volta(r)].filter(Boolean).join(' · '), pessoas: r.pessoasTexto }),
      )
      .join('\n'),
    total,
  });
  const titulo = pago ? d.pedido.confirmadoTitulo : esperando ? d.pedido.registradoTitulo : d.pedido.canceladoTitulo;
  const texto = pago ? d.pedido.confirmadoTexto : esperando ? d.pedido.registradoTexto : d.pedido.canceladoTexto;

  return (
    <main id="conteudo" className="tom-fundo moldura pb-24 pt-8 md:pb-32 md:pt-12">
      {pago && <CompraPedido codigo={codigo} centavos={pedido.totalCentavos} produtos={itens.map((r) => r.passeioSlug)} />}
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <h1 className="display text-head">{titulo}</h1>
          <p className="mt-4 max-w-[44ch] text-lead">{texto}</p>
          <a
            href={linkWhatsApp(esperando ? mensagem : `${d.contato.msg} (${codigo})`)}
            target="_blank"
            rel="noopener noreferrer"
            className="botao botao-whats mt-8 w-full sm:w-auto"
            data-evento="Contact"
          >
            <IconeWhatsApp className="size-5" />
            {esperando ? d.reserva.whatsappBotao : d.comum.whatsapp}
          </a>
        </div>
        <div className="lg:col-span-6">
          <div className="tom-papel">
            <div className="px-6 pt-6 md:px-8">
              <p className="text-small font-semibold">{d.pedido.codigo}</p>
              <p className="display numeros mt-1 text-[clamp(2rem,1.2rem+3.4vw,3.5rem)]">{codigo}</p>
              <h2 className="mt-6 font-semibold">{pago ? d.pedido.vouchers : d.pedido.itens}</h2>
            </div>
            <ul className="divide-y divide-(--color-borda) px-6 pb-2 md:px-8">
              {itens.map((r) => (
                <li key={r.codigo} className="py-4">
                  <p className="font-[family-name:var(--font-semi)] font-semibold leading-snug">{nomeItem(r)}</p>
                  <p className="text-small">{quando(r)}</p>
                  {volta(r) && <p className="text-small">{volta(r)}</p>}
                  <p className="text-small">{r.pessoasTexto}</p>
                  {pago ? (
                    <>
                      <p className="mt-1.5 text-small">
                        {d.reserva.voucher} <span className="numeros font-semibold">{r.codigo}</span>
                      </p>
                      <p className="mt-2 flex flex-wrap gap-x-5">
                        <a
                          href={`${rota(locale, `/reserva/${r.codigo}`)}?t=${encodeURIComponent(token)}`}
                          className="link inline-flex min-h-11 items-center font-semibold"
                        >
                          {d.pedido.verVoucher}
                        </a>
                        <a
                          href={`/api/voucher/${r.codigo}?t=${encodeURIComponent(token)}`}
                          className="link inline-flex min-h-11 items-center font-semibold"
                          download
                        >
                          {d.reserva.baixarPdf}
                        </a>
                      </p>
                    </>
                  ) : (
                    <p className="numeros mt-1.5 text-small">
                      {esperando && r.totalPixCentavos ? `${brl(r.totalPixCentavos)} ${d.preco.noPix} · ` : ''}
                      {brl(r.totalCentavos)} {esperando ? d.preco.noCartao : ''}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <div className="tom-campo px-6 py-5 md:px-8">
              <p className="font-semibold">{d.status[status]}</p>
              <p className="numeros mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="text-lead font-semibold">{esperando ? `${brl(noPix)} ${d.preco.noPix}` : brl(pedido.totalCentavos)}</span>
                {esperando && (
                  <span className="text-small">
                    {brl(pedido.totalCentavos)} {d.preco.noCartao}
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
