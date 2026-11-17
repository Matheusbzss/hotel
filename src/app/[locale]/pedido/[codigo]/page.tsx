import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { conferirNaStripe } from '@/app/api/pedido/pedido-stripe';
import { ComDolar, Inteiro, Pedaco, Pedacos } from '@/components/ComDolar';
import { IconeWhatsApp } from '@/components/IconeWhatsApp';
import { AoVoltarParaAAba } from '@/components/pagamento/AoVoltarParaAAba';
import { PagarPedido } from '@/components/pagamento/CheckoutEmbutido';
import { DesistirDaCompra } from '@/components/pagamento/DesistirDaCompra';
import type { TotaisDasFormas } from '@/components/pagamento/EscolhaPagamento';
import { PalavraDoStatus } from '@/components/pagamento/PalavraDoStatus';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { cambioParaTela } from '@/lib/cambio-tela';
import { formatarCifra } from '@/lib/cifra';
import { estadoDaDesistencia } from '@/lib/desistencia';
import { textoDolar } from '@/lib/dolar';
import { linkEmail } from '@/lib/email';
import { formasDoPagamento, mostrarWhatsApp, type FormaPagamento, type MotivoSemPix } from '@/lib/formas-pagamento';
import { frasesDoReembolso } from '@/lib/frases-do-reembolso';
import { ipDaRequisicao } from '@/lib/limite-ip';
import { partesDoTotal, type ParteDoTotal } from '@/lib/partes-do-total';
import { partesDaPagina } from '@/lib/reembolsos-a-resolver';
import {
  itensPagaveis,
  linkDoPedido,
  pagamentoEmAberto,
  paraPublico,
  textosDaDesistencia,
  textosDoPagamento,
  textosDoReembolso,
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
      <main id="conteudo" className="pagina-curta tom-fundo moldura pb-32 pt-16">
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
  // o reembolso que falhou na Stripe (partesDaPagina, lido como o cliente lê): o que voltou pela mesma forma de
  // pagamento, o pendente e o que a equipe devolveu de outro jeito. Sem falha, tudo pela mesma forma: o texto de sempre
  const partesDoReembolso = partesDaPagina({ voucherDePedido: false, codigo }, reembolso, primeira.historico) ?? {
    originalCentavos: reembolso,
    pendenteCentavos: 0,
    outroMeioCentavos: 0,
  };
  const reembolsoPendente = partesDoReembolso.pendenteCentavos > 0;
  const devolvidoAoCliente = partesDoReembolso.originalCentavos + partesDoReembolso.outroMeioCentavos;
  const frasesDoReembolsoDoPedido = (inteiro: boolean) => frasesDoReembolso(partesDoReembolso, inteiro, textosDoReembolso(d), brl);
  // no pedido pago, a caixa do reembolso de parte (sem nada devolvido, nenhuma)
  const frasesDoPago = pago ? frasesDoReembolsoDoPedido(false) : [];
  // a palavra da faixa escura do resumo: com um reembolso que falhou e ainda não voltou, "Reembolso pendente"
  const palavraDaFaixa = status === 'reembolsado' && reembolsoPendente ? d.pedido.reembolsoPendenteTitulo : d.status[status];
  // o voucher reembolsado sozinho cujo dinheiro ainda não voltou: "Reembolso pendente" no lugar de "Reembolsado"
  const statusDoItem = (r: ReservaPublica) =>
    r.status === 'reembolsado' && (r.reembolsoPartes?.pendenteCentavos ?? 0) > 0 ? d.pedido.reembolsoPendenteTitulo : d.status[r.status];

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
  const cabecalho: Record<StatusReserva, { titulo: string; texto: string | string[] }> = {
    pago: { titulo: d.pedido.confirmadoTitulo, texto: d.pedido.confirmadoTexto },
    aguardando_whatsapp: { titulo: d.pedido.registradoTitulo, texto: d.pedido.registradoTexto },
    pendente: { titulo: d.pedido.confirmando, texto: d.pedido.confirmandoTexto },
    expirado: { titulo: d.pedido.tempoEsgotado, texto: d.pedido.tempoEsgotadoTexto },
    cancelado: { titulo: d.pedido.canceladoTitulo, texto: d.pedido.canceladoTexto },
    // com um reembolso que falhou na Stripe e ainda não voltou, "Reembolso pendente" e a frase com o valor; uma frase por
    // parágrafo; sem falha, a frase de sempre
    reembolsado: {
      titulo: reembolsoPendente ? d.pedido.reembolsoPendenteTitulo : d.status.reembolsado,
      texto: frasesDoReembolsoDoPedido(true),
    },
    // texto neutro: a contestação é entre o cliente e o banco dele
    contestado: { titulo: d.pedido.contestadoTitulo, texto: d.pedido.contestadoTexto },
    recusado: { titulo: d.reserva.recusadoTitulo, texto: d.reserva.recusadoTexto },
  };
  const { titulo, texto } = cabecalho[status];
  const urlPagina = linkDoPedido(locale, codigo, token);
  // sem pagamento aprovado não há WhatsApp: a dúvida vai por e-mail
  const contato = { href: linkEmail(d.contato.assunto, `${d.contato.msg} (${codigo})`), rotulo: d.contato.botao };

  // pagamento online em aberto: as formas que ainda valem (e por que o Pix ficou de fora), decididas aqui no servidor
  let pagamento: { formas: FormaPagamento[]; semPix?: MotivoSemPix; totais: TotaisDasFormas; formaAtual?: FormaPagamento } | null = null;
  if (statusOnline) {
    const pagaveis = itensPagaveis(reservas);
    const admin = sessaoValida((await cookies()).get(COOKIE_ADMIN)?.value);
    pagamento = {
      ...(await formasDoPagamento(pagaveis, new Date(), { admin })),
      totais: totaisDasFormas(pagaveis),
      ...(primeira.pagamento.metodo !== 'whatsapp' ? { formaAtual: primeira.pagamento.metodo } : {}),
    };
  }
  // pago pela Stripe, antes do primeiro serviço: o link discreto de desistir da compra (ou o aviso de que o pedido de
  // desistência já chegou). Só pela Stripe: o pedido do WhatsApp nunca passou pela "ferramenta da compra" do site
  const desistencia = estadoDaDesistencia(reservas, new Date());

  // os valores na tela: em aberto, só os das formas que ainda valem (no pagamento online, o Pix some 2 horas antes
  // do serviço); fechado, o que foi pago
  const formasAbertas = pagamento?.formas;
  const rotulo = { pix: d.preco.noPix, cartao: d.preco.noCartao };
  const valor = (p: ParteDoTotal) => (p.forma ? `${brl(p.centavos)} ${rotulo[p.forma]}` : brl(p.centavos));
  // a faixa do total: o valor e o rótulo ("R$ 5.148,00" e "no Pix") ficam juntos; só quando nem assim cabem (letra
  // grande em tela estreita: a faixa com menos de 14rem, @container), o rótulo desce para a linha de baixo (Inteiro).
  // O valor nunca se parte: entre "R$" e o número, a formatação põe um espaço que não quebra (no inglês, nenhum)
  const valorDaFaixa = (p: ParteDoTotal) => (
    <Inteiro>
      {brl(p.centavos)}
      {p.forma && (
        <>
          {' '}
          <span className="whitespace-nowrap">{rotulo[p.forma]}</span>
        </>
      )}
    </Inteiro>
  );
  const partes = (totalCentavos: number, totalPixCentavos?: number): ParteDoTotal[] =>
    emAberto ? partesDoTotal(totalCentavos, totalPixCentavos, formasAbertas) : [{ centavos: totalCentavos }];
  // cada valor fica inteiro com o rótulo ("R$ 138,60 con Pix") e o "·" só aparece entre dois pedaços da mesma linha
  const linhaDeValores = (lista: ParteDoTotal[]) => {
    const pedacos = lista.flatMap((parte, n) => {
      const chave = parte.forma ?? 'total';
      const u = usd(parte.centavos);
      return [
        <Pedaco key={`${chave}-valor`} ponto={n > 0} className="whitespace-nowrap">
          {valor(parte)}
        </Pedaco>,
        ...(u
          ? [
              <Pedaco key={`${chave}-dolar`} ponto className="text-(--tinta-suave)">
                {u}
              </Pedaco>,
            ]
          : []),
      ];
    });
    // um valor só, sem dólar (português): o texto de sempre
    return pedacos.length > 1 ? <Pedacos>{pedacos}</Pedacos> : valor(lista[0]);
  };
  const doPedido: ParteDoTotal[] = emAberto ? partes(pedido.totalCentavos, pedido.totalPixCentavos) : [{ centavos: fechado }];
  const principal = doPedido[0];
  const segunda: ParteDoTotal | undefined = doPedido[1];

  return (
    <main id="conteudo" className="tom-fundo moldura pb-24 pt-8 md:pb-32 md:pt-12">
      {/* grid-cols-1: no celular, uma coluna que encolhe com a tela. Sem isto a coluna fica da largura do maior texto que
          não quebra (a escolha da forma, o botão "Pagar", a faixa do total, o código do pedido) e, com a letra grande em
          tela estreita, a página rola de lado (como o formulário do checkout, FormularioCarrinho) */}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
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
              semPix={pagamento.semPix}
              totais={pagamento.totais}
              formaAtual={pagamento.formaAtual}
              urlVolta={urlPagina}
              contato={contato}
              textos={textosDoPagamento(d, reservas.length > 1)}
            />
          ) : (
            <>
              {/* fora da tela de pagar, a página confere todos os vouchers quando o cliente volta para a aba (cada um
                  comparado com o que a consulta devolve dele: o status, o valor devolvido e as partes de um reembolso que
                  falhou); algum mudou, o servidor redesenha. Só esses valores vão ao navegador */}
              <AoVoltarParaAAba
                token={token}
                idioma={locale}
                vouchers={itens.map(({ codigo, status, reembolsoCentavos, reembolsoPartes }) => ({
                  codigo,
                  status,
                  reembolsoCentavos,
                  reembolsoPartes,
                }))}
              />
              <h1 className="display text-head">{titulo}</h1>
              {[texto].flat().map((frase, n) => (
                <p key={n} className="mt-4 max-w-[44ch] text-lead">
                  {frase}
                </p>
              ))}
              {/* pago, com uma parte devolvida: quanto voltou; com um reembolso que falhou, quanto ainda não voltou ou
                  voltou de outro jeito, uma frase por parágrafo na mesma caixa */}
              {frasesDoPago.length > 0 && (
                <div className="mt-4 max-w-[44ch] space-y-2 bg-superficie px-5 py-4">
                  {frasesDoPago.map((frase, n) => (
                    <p key={n}>{frase}</p>
                  ))}
                </div>
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
              {/* os códigos nunca quebram no hífen de "ON-" (só junto com o grid-cols-1 da página: sem ele, um código largo
                  alargaria a coluna e a página voltaria a rolar de lado) */}
              <p className="display numeros mt-1 whitespace-nowrap text-[clamp(2rem,1.2rem+3.4vw,3.5rem)]">{codigo}</p>
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
                      {d.reserva.voucher} <span className="numeros whitespace-nowrap">{r.codigo}</span> · {statusDoItem(r)}
                    </p>
                  ) : pago ? (
                    <>
                      <p className="mt-1.5 text-small">
                        {d.reserva.voucher} <span className="numeros whitespace-nowrap font-semibold">{r.codigo}</span>
                      </p>
                      <p className="mt-2 flex flex-wrap gap-x-5">
                        <a
                          href={`${rota(locale, `/reserva/${r.codigo}`)}?t=${encodeURIComponent(token)}`}
                          className="link inline-flex min-h-11 items-center font-semibold"
                        >
                          {d.pedido.verVoucher}
                        </a>
                        {/* sem o atributo download: o voucher que deixou de valer com a página aberta leva à página
                            da reserva, que diz o estado; o pago continua baixando o PDF (a rota manda attachment) */}
                        <a
                          href={`/api/voucher/${r.codigo}?t=${encodeURIComponent(token)}`}
                          className="link inline-flex min-h-11 items-center font-semibold"
                        >
                          {d.reserva.baixarPdf}
                        </a>
                      </p>
                    </>
                  ) : (
                    <p className="numeros mt-1.5 text-small">{linhaDeValores(partes(r.totalCentavos, r.totalPixCentavos))}</p>
                  )}
                </li>
              ))}
            </ul>
            {/* @container: a largura da faixa decide quando o valor e o rótulo podem quebrar entre si (valorDaFaixa) */}
            <div className="@container tom-campo px-6 py-5 md:px-8">
              {/* na tela de pagar, a palavra muda sem redesenhar a página: "Pagar de novo" no pedido vencido abre uma
                  sessão nova, a tela de pagar avisa e a faixa passa a "Aguardando pagamento" (o redesenho desmontaria o
                  formulário da Stripe que acabou de abrir). A chave é o status, como a da tela de pagar */}
              <p className="font-semibold">
                {statusOnline ? (
                  <PalavraDoStatus key={status} codigo={codigo} texto={palavraDaFaixa} textoPendente={d.status.pendente} />
                ) : (
                  palavraDaFaixa
                )}
              </p>
              {/* cada valor fica inteiro com o rótulo e o dólar ao lado; o que não couber desce sem o "·" na frente. Com a
                  letra grande em tela estreita, quando o valor com o rótulo não cabe nem sozinho na linha, o rótulo desce
                  (max-w-full: a caixa encolhe até a largura da faixa, e o Inteiro quebra em vez de passar da borda) */}
              <p className="numeros mt-1 flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="max-w-full text-lead font-semibold">
                  <ComDolar dolar={usd(principal.centavos)} className="text-small font-normal text-(--tinta-suave)">
                    {valorDaFaixa(principal)}
                  </ComDolar>
                </span>
                {segunda && (
                  <span className="max-w-full text-small">
                    <ComDolar dolar={usd(segunda.centavos)}>{valorDaFaixa(segunda)}</ComDolar>
                  </span>
                )}
              </p>
              {/* o que voltou ao cliente (pela mesma forma ou de outro jeito) e, com um reembolso que falhou, o que ainda não voltou */}
              {devolvidoAoCliente > 0 && (
                <p className="numeros mt-1 text-small">
                  {d.status.reembolsado} · {brl(devolvidoAoCliente)}
                </p>
              )}
              {reembolsoPendente && (
                <p className="numeros mt-1 text-small">
                  {d.pedido.reembolsoPendenteTitulo} · {brl(partesDoReembolso.pendenteCentavos)}
                </p>
              )}
            </div>
          </div>
          {/* discreto, embaixo de tudo, depois dos vouchers (como na página de um item só): a desistência pela mesma
              ferramenta da compra (Decreto 7.962/2013). No celular, as colunas ficam uma embaixo da outra */}
          {desistencia && (
            <DesistirDaCompra
              className="mt-6"
              codigoPedido={codigo}
              token={token}
              estado={desistencia}
              hrefPolitica={rota(locale, '/politica-de-cancelamento')}
              textos={textosDaDesistencia(d)}
            />
          )}
        </div>
      </div>
    </main>
  );
}
