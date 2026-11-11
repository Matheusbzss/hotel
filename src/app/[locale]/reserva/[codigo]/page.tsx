import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { conferirNaStripe } from '@/app/api/pedido/pedido-stripe';
import { StatusReserva, type PagamentoDaReserva } from '@/components/StatusReserva';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { cambioParaTela } from '@/lib/cambio-tela';
import { linkEmail } from '@/lib/email';
import { formasDisponiveis, mostrarWhatsApp } from '@/lib/formas-pagamento';
import { ipDaRequisicao } from '@/lib/limite-ip';
import {
  itensPagaveis,
  linkDoPedido,
  paraPublico,
  textoReembolsado,
  textosDoPagamento,
  tokenConfere,
  totaisDasFormas,
} from '@/lib/reserva-publica';
import { obterReserva, provedorDaReserva } from '@/lib/reservas';

// o link privado leva o token: a página não conta a ninguém de onde o cliente veio
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };
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
  const linkPedido = reserva.pedido ? linkDoPedido(locale, reserva.pedido.codigo, token) : '';
  if (linkPedido && reserva.status !== 'pago') redirect(linkPedido);
  if (reserva.status === 'pendente') {
    // a rede de segurança: se o webhook atrasou, o servidor relê a sessão na Stripe (o navegador nunca decide)
    reserva = (await conferirNaStripe(reserva, { origem: 'pagina', ip: ipDaRequisicao(await headers()) }).catch(() => null)) ?? reserva;
  }
  const publica = paraPublico(reserva, locale);
  // o aproximado em dólar ao lado do total, só em espanhol e inglês
  const cambio = await cambioParaTela(locale);
  const urlPagina = `${rota(locale, `/reserva/${publica.codigo}`)}?t=${encodeURIComponent(token)}`;
  // sem pagamento aprovado não há WhatsApp: a dúvida vai por e-mail
  const contato = { href: linkEmail(d.contato.assunto, `${d.contato.msg} (${publica.codigo})`), rotulo: d.contato.botao };

  // pagamento online em aberto: as formas que ainda dão tempo, decididas aqui no servidor
  let pagamento: PagamentoDaReserva | undefined;
  if (provedorDaReserva(reserva) === 'stripe' && (publica.status === 'pendente' || publica.status === 'expirado')) {
    const itens = itensPagaveis([reserva]);
    const admin = sessaoValida((await cookies()).get(COOKIE_ADMIN)?.value);
    pagamento = {
      formas: await formasDisponiveis(itens, new Date(), { admin }),
      totais: totaisDasFormas(itens),
      ...(reserva.pagamento.metodo !== 'whatsapp' ? { formaAtual: reserva.pagamento.metodo } : {}),
      textos: textosDoPagamento(d),
    };
  }

  return (
    <main id="conteudo" className="tom-fundo moldura pb-24 pt-8 md:pb-32 md:pt-12">
      {reserva.pedido && (
        <Link href={linkPedido} className="link mb-6 inline-flex min-h-11 items-center gap-2 font-semibold">
          <span aria-hidden="true">←</span> {fmt(d.pedido.voltar, { codigo: reserva.pedido.codigo })}
        </Link>
      )}
      {/* a chave é o status: quando ele muda (a página se redesenha), a tela começa do zero no estado novo */}
      <StatusReserva
        key={publica.status}
        inicial={publica}
        token={token}
        idioma={locale}
        locale={LOCALE_INTL[locale]}
        dolar={cambio.taxa}
        numeroWhatsApp={EMPRESA.whatsapp}
        telefoneExibicao={EMPRESA.telefoneExibicao}
        whatsappLiberado={mostrarWhatsApp(publica.status)}
        contato={contato}
        linkNovaReserva={rota(locale, publica.tipo === 'transfer' ? '/transfer' : `/passeios/${publica.passeioSlug}`)}
        urlPagina={urlPagina}
        pagamento={pagamento}
        statusTextos={d.status}
        textos={{
          ...d.reserva,
          msgWhatsapp: d.checkout.msgWhatsapp,
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
          contestadoTitulo: d.pedido.contestadoTitulo,
          contestadoTexto: d.pedido.contestadoTexto,
          reembolsadoTexto: textoReembolsado(d),
          reembolsadoParcial: d.pedido.reembolsadoParcial,
          noPix: d.preco.noPix,
          noCartao: d.preco.noCartao,
          dolar: d.preco.dolar,
        }}
      />
    </main>
  );
}
