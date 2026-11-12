import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Fragment } from 'react';
import { conferirNaStripe } from '@/app/api/pedido/pedido-stripe';
import { IconeWhatsApp } from '@/components/IconeWhatsApp';
import { PagarPedido } from '@/components/pagamento/CheckoutEmbutido';
import type { TotaisDasFormas } from '@/components/pagamento/EscolhaPagamento';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { cambioParaTela } from '@/lib/cambio-tela';
import { formatarCifra } from '@/lib/cifra';
import { textoDolar } from '@/lib/dolar';
import { linkEmail } from '@/lib/email';
import { formasDisponiveis, mostrarWhatsApp, type FormaPagamento } from '@/lib/formas-pagamento';
import { ipDaRequisicao } from '@/lib/limite-ip';
import { partesDoTotal, type ParteDoTotal } from '@/lib/partes-do-total';
import {
  itensPagaveis,
  linkDoPedido,
  pagamentoEmAberto,
  paraPublico,
  textoReembolsado,
  textosDoPagamento,
  tokenConfere,
  totaisDasFormas,
  type ReservaPublica,
} from '@/lib/reserva-publica';
import { obterPedido, provedorDaReserva, type StatusReserva } from '@/lib/reservas';
import { formatarDataIso } from '@/lib/validacao';
import { linkWhatsApp } from '@/lib/whatsapp';

// o link privado leva o token: a página não conta a ninguém de onde o cliente veio. Na aba, "Sua reserva | Orla Nativa".
export async function generateMetadata({ params }: PageProps<'/[locale]/pedido/[codigo]'>): Promise<Metadata> {
  const { locale } = await params;
  return {
    ...(isIdioma(locale) ? { title: dicionario(locale).reserva.titulo } : {}),
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}
export const dynamic = 'force-dynamic';

/** A página do pedido do carrinho, em todos os estados: pagar, confirmando, pago com os vouchers, expirado, cancelado… */
export default async function PaginaPedido({ params, searchParams }: PageProps<'/[locale]/pedido/[codigo]'>) {
  const { locale, codigo } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const intl = LOCALE_INTL[locale];
  const q = await searchParams;
  const token = typeof q.t === 'string' ? q.t : '';

  let reservas = await obterPedido(codigo).catch(() => []);
  if (!reservas[0] || !tokenConfere(reservas[0], token)) {
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
  if (reservas[0].status === 'pendente' && provedorDaReserva(reservas[0]) === 'stripe') {
    // a rede de segurança: se o webhook atrasou, o servidor relê a sessão na Stripe antes de mostrar a página
    const conferida = await conferirNaStripe(reservas[0], { origem: 'pagina', ip: ipDaRequisicao(await headers()) }).catch(() => null);
    if (conferida && conferida.status !== reservas[0].status) reservas = await obterPedido(codigo).catch(() => reservas);
  }
  const primeira = reservas[0];
  if (!primeira) notFound();
  // com um item só, o voucher é o próprio pedido
  if (!primeira.pedido) redirect(`${rota(locale, `/reserva/${primeira.codigo}`)}?t=${encodeURIComponent(token)}`);

  const { status, pedido } = primeira;
  const provedor = provedorDaReserva(primeira);
  const itens = reservas.map((r) => paraPublico(r, locale));
  const pago = status === 'pago';
  const esperando = status === 'aguardando_whatsapp';
  // em aberto (WhatsApp, pendente ou expirado), as duas formas continuam valendo: os dois totais aparecem
  const emAberto = pagamentoEmAberto(status);
  // pendente ou expirado pela Stripe: a tela de pagar (confirmando, pagar de novo, cartão recusado)
  const statusOnline = provedor === 'stripe' && (status === 'pendente' || status === 'expirado') ? status : null;
  const brl = (c: number) => formatarCifra(c, intl);
  // o aproximado em dólar ao lado do total, só em espanhol e inglês
  const cambio = await cambioParaTela(locale);
  const usd = (c: number) => textoDolar(c, cambio.taxa, d.preco.dolar, intl);
  const noPix = pedido.totalPixCentavos ?? pedido.totalCentavos;
  // pago no Pix, o cliente vê o que pagou, com o desconto
  const fechado = primeira.pagamento.metodo === 'pix' ? noPix : pedido.totalCentavos;
  const total = emAberto ? `${brl(noPix)} ${d.preco.noPix} · ${brl(pedido.totalCentavos)} ${d.preco.noCartao}` : brl(fechado);
  const reembolso = primeira.reembolsoCentavos ?? 0;

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
  const cabecalho: Record<StatusReserva, { titulo: string; texto: string }> = {
    pago: { titulo: d.pedido.confirmadoTitulo, texto: d.pedido.confirmadoTexto },
    aguardando_whatsapp: { titulo: d.pedido.registradoTitulo, texto: d.pedido.registradoTexto },
    pendente: { titulo: d.pedido.confirmando, texto: d.pedido.confirmandoTexto },
    expirado: { titulo: d.pedido.tempoEsgotado, texto: d.pedido.tempoEsgotadoTexto },
    cancelado: { titulo: d.pedido.canceladoTitulo, texto: d.pedido.canceladoTexto },
    reembolsado: { titulo: d.status.reembolsado, texto: textoReembolsado(d) },
    // texto neutro: a contestação é entre o cliente e o banco dele
    contestado: { titulo: d.pedido.contestadoTitulo, texto: d.pedido.contestadoTexto },
    recusado: { titulo: d.reserva.recusadoTitulo, texto: d.reserva.recusadoTexto },
  };
  const { titulo, texto } = cabecalho[status];
  const urlPagina = linkDoPedido(locale, codigo, token);
  // sem pagamento aprovado não há WhatsApp: a dúvida vai por e-mail
  const contato = { href: linkEmail(d.contato.assunto, `${d.contato.msg} (${codigo})`), rotulo: d.contato.botao };

  // pagamento online em aberto: as formas que ainda dão tempo, decididas aqui no servidor
  let pagamento: { formas: FormaPagamento[]; totais: TotaisDasFormas; formaAtual?: FormaPagamento } | null = null;
  if (statusOnline) {
    const pagaveis = itensPagaveis(reservas);
    const admin = sessaoValida((await cookies()).get(COOKIE_ADMIN)?.value);
    pagamento = {
      formas: await formasDisponiveis(pagaveis, new Date(), { admin }),
      totais: totaisDasFormas(pagaveis),
      ...(primeira.pagamento.metodo !== 'whatsapp' ? { formaAtual: primeira.pagamento.metodo } : {}),
    };
  }

  // os valores na tela: em aberto, só os das formas que ainda valem (no pagamento online, o Pix some 2 horas antes
  // do serviço); fechado, o que foi pago
  const formasAbertas = pagamento?.formas;
  const rotulo = { pix: d.preco.noPix, cartao: d.preco.noCartao };
  const valor = (p: ParteDoTotal) => (p.forma ? `${brl(p.centavos)} ${rotulo[p.forma]}` : brl(p.centavos));
  const partes = (totalCentavos: number, totalPixCentavos?: number): ParteDoTotal[] =>
    emAberto ? partesDoTotal(totalCentavos, totalPixCentavos, formasAbertas) : [{ centavos: totalCentavos }];
  const doPedido: ParteDoTotal[] = emAberto ? partes(pedido.totalCentavos, pedido.totalPixCentavos) : [{ centavos: fechado }];
  const principal = doPedido[0];
  const segunda: ParteDoTotal | undefined = doPedido[1];

  return (
    <main id="conteudo" className="tom-fundo moldura pb-24 pt-8 md:pb-32 md:pt-12">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className={statusOnline ? 'lg:col-span-7' : 'lg:col-span-6'}>
          {statusOnline && pagamento ? (
            // a chave é o status: quando ele muda (a página se redesenha), a tela começa do zero no estado novo
            <PagarPedido
              key={status}
              codigoPedido={codigo}
              codigoConsulta={primeira.codigo}
              token={token}
              idioma={locale}
              locale={intl}
              dolar={cambio.taxa}
              status={statusOnline}
              recusa={itens[0]?.recusa}
              formas={pagamento.formas}
              totais={pagamento.totais}
              formaAtual={pagamento.formaAtual}
              urlVolta={urlPagina}
              contato={contato}
              textos={textosDoPagamento(d, reservas.length > 1)}
            />
          ) : (
            <>
              <h1 className="display text-head">{titulo}</h1>
              <p className="mt-4 max-w-[44ch] text-lead">{texto}</p>
              {pago && reembolso > 0 && (
                <p className="mt-4 max-w-[44ch] bg-superficie px-5 py-4">{fmt(d.pedido.reembolsadoParcial, { valor: brl(reembolso) })}</p>
              )}
              {esperando ? (
                // o caminho do WhatsApp (o pagamento combinado com a equipe): o botão é a própria forma de pagar
                <a
                  href={linkWhatsApp(mensagem)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="botao botao-whats mt-8 w-full sm:w-auto"
                  data-evento="Contact"
                >
                  <IconeWhatsApp className="size-5" />
                  {d.reserva.whatsappBotao}
                </a>
              ) : mostrarWhatsApp(status) ? (
                // o WhatsApp da equipe só depois do pagamento aprovado
                <a
                  href={linkWhatsApp(`${d.contato.msg} (${codigo})`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="botao botao-whats mt-8 w-full sm:w-auto"
                  data-evento="Contact"
                >
                  <IconeWhatsApp className="size-5" />
                  {d.comum.whatsapp}
                </a>
              ) : (
                <a href={contato.href} className="botao botao-vazado mt-8 w-full sm:w-auto" data-evento="Contact">
                  {contato.rotulo}
                </a>
              )}
            </>
          )}
        </div>
        <div className={statusOnline ? 'lg:col-span-5' : 'lg:col-span-6'}>
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
                  {pago && r.status !== 'pago' ? (
                    // um item cancelado ou reembolsado sozinho, num pedido pago: o voucher dele não vale mais
                    <p className="mt-1.5 text-small font-semibold">
                      {d.reserva.voucher} <span className="numeros">{r.codigo}</span> · {d.status[r.status]}
                    </p>
                  ) : pago ? (
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
                      {partes(r.totalCentavos, r.totalPixCentavos).map((parte, n) => (
                        <Fragment key={parte.forma ?? 'total'}>
                          {n > 0 && ' · '}
                          {valor(parte)}
                          {usd(parte.centavos) && <span className="whitespace-nowrap text-(--tinta-suave)"> · {usd(parte.centavos)}</span>}
                        </Fragment>
                      ))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <div className="tom-campo px-6 py-5 md:px-8">
              <p className="font-semibold">{d.status[status]}</p>
              <p className="numeros mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="text-lead font-semibold">
                  {valor(principal)}
                  {usd(principal.centavos) && (
                    <span className="whitespace-nowrap text-small font-normal text-(--tinta-suave)"> · {usd(principal.centavos)}</span>
                  )}
                </span>
                {segunda && (
                  <span className="text-small">
                    {valor(segunda)}
                    {usd(segunda.centavos) && <span className="whitespace-nowrap"> · {usd(segunda.centavos)}</span>}
                  </span>
                )}
              </p>
              {reembolso > 0 && (
                <p className="numeros mt-1 text-small">
                  {d.status.reembolsado} · {brl(reembolso)}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
