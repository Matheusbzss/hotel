import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { conferirNaStripe } from '@/app/api/pedido/pedido-stripe';
import { ComDolar, Inteiro, Pedaco, Pedacos } from '@/components/ComDolar';
import { IconeWhatsApp } from '@/components/IconeWhatsApp';
import { AoVoltarParaAAba } from '@/components/pagamento/AoVoltarParaAAba';
import { DesistirDaCompra } from '@/components/pagamento/DesistirDaCompra';
import type { TotaisDasFormas } from '@/components/pagamento/EscolhaPagamento';
// a tela de pagar só quando aparece (o pedido em aberto): o pedido pago não baixa o pedaço do formulário da Stripe
import { PagarPedido } from '@/components/pagamento/PagarPedidoSobDemanda';
import { PalavraDoStatus } from '@/components/pagamento/PalavraDoStatus';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, isIdioma, rota } from '@/i18n/config';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { cambioParaTela } from '@/lib/cambio-tela';
import { formatarCifra } from '@/lib/cifra';
import { estadoDaDesistencia } from '@/lib/desistencia';
import { textoDolar } from '@/lib/dolar';
import { linkEmail } from '@/lib/email';
import { formasDoPagamento, mostrarWhatsApp, valorACobrar, type FormaPagamento, type MotivoSemPix } from '@/lib/formas-pagamento';
import { frasesDoReembolso } from '@/lib/frases-do-reembolso';
import { ipDaRequisicao } from '@/lib/limite-ip';
import { formasDaFaixa, partesDoTotal, type ParteDoTotal } from '@/lib/partes-do-total';
import { recebidoNaPaginaDoCliente } from '@/lib/pedidos-painel';
import { formaEmDestaque, rotuloPixComDesconto } from '@/lib/preco-destaque';
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
import { ehCasa, obterPedido, provedorDaReserva, type StatusReserva } from '@/lib/reservas';
import { pedidoCanceladoSemReembolso } from '@/lib/sem-reembolso';
import { textoDoContestado } from '@/lib/texto-do-contestado';
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

  const { status } = primeira;
  // o pedido com casa (Etapa 7) cobra hoje o sinal da casa mais o resto (pagamento.cobrar, gravado na criação; sem ele, a
  // mesma conta de valorDoItem): em aberto, a faixa e a mensagem mostram o que ele cobra; fechado, o que foi pago, nunca o
  // total da estadia, que a Stripe nunca recebe. O pedido sem casa continua com os números de sempre (o do pedido gravado)
  const cobrado = reservas.some(ehCasa)
    ? (primeira.pagamento.cobrar ?? { cartao: valorACobrar(itensPagaveis(reservas), 'cartao'), pix: valorACobrar(itensPagaveis(reservas), 'pix') })
    : undefined;
  const pedido = cobrado ? { ...primeira.pedido, totalCentavos: cobrado.cartao, totalPixCentavos: cobrado.pix } : primeira.pedido;
  const provedor = provedorDaReserva(primeira);
  const itens = reservas.map((r) => paraPublico(r, locale));
  const pago = status === 'pago';
  // Pacote 33: o pedido que a equipe cancelou sem reembolso inteiro. Ele continua pago (o dinheiro ficou), mas a página
  // diz "Pedido cancelado", com o motivo e a regra da política, sem o WhatsApp da equipe e sem nenhuma opção de pedir
  // estorno ou cancelamento (o "Desistir da compra" já some: nenhum voucher vale, estadoDaDesistencia)
  const canceladoSemReembolso = pedidoCanceladoSemReembolso(reservas);
  const estado: StatusReserva = canceladoSemReembolso ? 'cancelado' : status;
  // o que já voltou ao cliente (o pedido inteiro: num pedido com vários itens, soma os reembolsos)
  const reembolso = primeira.reembolsoCentavos ?? 0;
  // o motivo de cada cancelamento (um, quase sempre), sem repetir a mesma frase, e a regra da política uma vez: a do item 6
  // quando algum motivo é um dos dois da política; senão (só "outro"), a de que as regras estão na política. No alto, o
  // motivo só quando há um só: com mais de um, cada voucher mostra o seu na linha dele. Com uma parte do pedido já devolvida
  // (um voucher reembolsado, por exemplo), a primeira frase diz que o restante foi cancelado sem reembolso: a caixa do
  // reembolso parcial vem logo embaixo
  const motivosDoSemReembolso = [...new Set(itens.flatMap((r) => (r.semReembolso ? [r.semReembolso.motivo] : [])))];
  // as regras da política dos vouchers cancelados, sem repetir: a dos passeios (item 6) e, na casa de temporada, a das casas
  // (Etapa 7, pacote 2); só "outro" nos motivos, a de que as regras estão na política
  const regrasDaPolitica = [
    ...new Set(
      itens.flatMap((r) => (r.semReembolso && r.semReembolso.regra !== d.pedido.regraGeralSemReembolso ? [r.semReembolso.regra] : [])),
    ),
  ];
  const frasesDoSemReembolso = canceladoSemReembolso
    ? [
        reembolso > 0 ? d.pedido.canceladoSemReembolsoComParteTexto : d.pedido.canceladoSemReembolsoTexto,
        ...(motivosDoSemReembolso.length === 1 ? motivosDoSemReembolso : []),
        ...(regrasDaPolitica.length ? regrasDaPolitica : [d.pedido.regraGeralSemReembolso]),
      ]
    : [];
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
  // pago no Pix, o cliente vê o que pagou, com o desconto; com um valor recebido pela Stripe diferente do esperado (Pacote
  // 23), o que ela recebeu de verdade, o mesmo número do "Reembolsado" e da frase do reembolso parcial
  const fechado = recebidoNaPaginaDoCliente(primeira) ?? (primeira.pagamento.metodo === 'pix' ? noPix : pedido.totalCentavos);
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
  // a palavra da faixa escura do resumo: com um reembolso que falhou e ainda não voltou, "Reembolso pendente"; no
  // cancelado sem reembolso, "Cancelado" (estado)
  const palavraDaFaixa = estado === 'reembolsado' && reembolsoPendente ? d.pedido.reembolsoPendenteTitulo : d.status[estado];
  // o voucher reembolsado sozinho cujo dinheiro ainda não voltou: "Reembolso pendente" no lugar de "Reembolsado"
  const statusDoItem = (r: ReservaPublica) =>
    r.status === 'reembolsado' && (r.reembolsoPartes?.pendenteCentavos ?? 0) > 0 ? d.pedido.reembolsoPendenteTitulo : d.status[r.status];
  // o link da página de um voucher, que diz o estado dele (no cancelado sem reembolso: o motivo e a regra da política)
  const linkDoVoucher = (r: ReservaPublica) => `${rota(locale, `/reserva/${r.codigo}`)}?t=${encodeURIComponent(token)}`;

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
  // a casa: as diárias com a entrada e a saída ("2 diárias, de seg 14/12 a qua 16/12"); o resto, a data e a hora
  const quando = (r: ReservaPublica) => (r.casa ? r.casa.periodo : dataHora(r.data, r.transfer?.ida.hora ?? r.horario?.texto));
  // a volta do transfer, quando tem
  const volta = (r: ReservaPublica) => {
    const v = r.transfer?.volta;
    return v ? fmt(d.carrinho.volta, { quando: dataHora(v.data, v.hora) }) : '';
  };
  // o pedido pago com uma casa que ainda vale: o que acontece com ela depois do pagamento (o restante na chegada, a
  // localização e o cadastro dos hóspedes pelo WhatsApp), como no e-mail do pagamento aprovado
  const casaValendo = itens.some((r) => r.casa && r.status === 'pago');
  const cabecalho: Record<StatusReserva, { titulo: string; texto: string | string[] }> = {
    pago: { titulo: d.pedido.confirmadoTitulo, texto: casaValendo ? [d.pedido.confirmadoTexto, d.pedido.casaNoPedido] : d.pedido.confirmadoTexto },
    aguardando_whatsapp: { titulo: d.pedido.registradoTitulo, texto: d.pedido.registradoTexto },
    pendente: { titulo: d.pedido.confirmando, texto: d.pedido.confirmandoTexto },
    expirado: { titulo: d.pedido.tempoEsgotado, texto: d.pedido.tempoEsgotadoTexto },
    // o pagamento que chegou com o pedido cancelado, enquanto a equipe decide (Pacote 22): a frase dele no lugar do texto;
    // o pedido cancelado sem reembolso (Pacote 33): o que aconteceu, o motivo e a regra da política
    cancelado: {
      titulo: d.pedido.canceladoTitulo,
      texto: itens[0]?.pagamentoRetido ? d.pedido.pagamentoRetido : canceladoSemReembolso ? frasesDoSemReembolso : d.pedido.canceladoTexto,
    },
    // com um reembolso que falhou na Stripe e ainda não voltou, "Reembolso pendente" e a frase com o valor; uma frase por
    // parágrafo; sem falha, a frase de sempre
    reembolsado: {
      titulo: reembolsoPendente ? d.pedido.reembolsoPendenteTitulo : d.status.reembolsado,
      texto: frasesDoReembolsoDoPedido(true),
    },
    // texto neutro: a contestação é entre o cliente e o banco dele. Com mais de um voucher, "os vouchers ficam suspensos"
    // (textoDoContestado); a página da reserva, que é a de um voucher, continua com "o voucher fica suspenso"
    contestado: { titulo: d.pedido.contestadoTitulo, texto: textoDoContestado(d.pedido, reservas.length) },
    recusado: { titulo: d.reserva.recusadoTitulo, texto: d.reserva.recusadoTexto },
  };
  const { titulo, texto } = cabecalho[estado];
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
  // do serviço) e, no pedido de Pix, o do Pix (o já gerado continua valendo com o pagamento desligado às pressas ou depois
  // do prazo do Pix; o vencido sem forma que valha mostra o valor que o cliente escolheu: formasDaFaixa); fechado, o que
  // foi pago
  const formasAbertas = formasDaFaixa(status, pagamento);
  // o Pix está entre os valores da faixa (sem o pagamento online, como sempre, os dois): o total da estadia de cada casa
  // em aberto segue a faixa (revisão de 26/11, achado 9)
  const pixNaFaixa = formasAbertas?.includes('pix') ?? true;
  // a forma cujo total vem primeiro (o grande da faixa): em português, o Pix, como sempre; em espanhol e inglês, a que a
  // tela de pagar traz marcada, e o cartão no pedido do WhatsApp (formaEmDestaque, revisão do Pacote 29)
  const primeiraForma = formaEmDestaque(locale, pagamento && { ...pagamento, cartaoRecusado: Boolean(itens[0]?.recusa) });
  const rotulo = { pix: d.preco.noPix, cartao: d.preco.noCartao };
  // o Pix que vem DEPOIS do cartão na mesma lista diz o desconto, "con Pix (−10%)", como no checkout e no carrinho (em
  // português o Pix vem sempre primeiro; o Pix sozinho, sem o cartão, fica com o rótulo de sempre). Só na faixa e na
  // mensagem do WhatsApp: nas linhas de cada item, que não quebram, o rótulo comprido passaria do cartão branco em 320 px
  // com a letra grande (terceira conferência do Pacote 29)
  const pixDepoisDoCartao = (lista: readonly ParteDoTotal[]) => lista[0]?.forma === 'cartao';
  const rotuloNaLista = (lista: readonly ParteDoTotal[], forma: FormaPagamento) =>
    forma === 'pix' && pixDepoisDoCartao(lista) ? rotuloPixComDesconto(d.preco.noPixComDesconto) : rotulo[forma];
  const valor = (p: ParteDoTotal) => (p.forma ? `${brl(p.centavos)} ${rotulo[p.forma]}` : brl(p.centavos));
  // na mensagem do WhatsApp, os dois totais na mesma ordem da página; fechado, o que foi pago
  const doTexto = partesDoTotal(pedido.totalCentavos, noPix, undefined, primeiraForma);
  const total = emAberto
    ? doTexto.map((p) => (p.forma ? `${brl(p.centavos)} ${rotuloNaLista(doTexto, p.forma)}` : brl(p.centavos))).join(' · ')
    : brl(fechado);
  const mensagem = fmt(d.pedido.msgWhatsapp, {
    codigo,
    itens: itens
      .map((r) =>
        fmt(d.pedido.msgItem, { item: nomeItem(r), data: [quando(r), volta(r)].filter(Boolean).join(' · '), pessoas: r.pessoasTexto }),
      )
      .join('\n'),
    total,
  });
  const partes = (totalCentavos: number, totalPixCentavos?: number): ParteDoTotal[] =>
    emAberto ? partesDoTotal(totalCentavos, totalPixCentavos, formasAbertas, primeiraForma) : [{ centavos: totalCentavos }];
  const doPedido: ParteDoTotal[] = emAberto ? partes(pedido.totalCentavos, pedido.totalPixCentavos) : [{ centavos: fechado }];
  // a faixa do total: o valor e o rótulo ("R$ 5.148,00" e "no Pix") ficam juntos; só quando nem assim cabem (letra
  // grande em tela estreita: a faixa com menos de 14rem, @container), o rótulo desce para a linha de baixo (Inteiro).
  // O valor nunca se parte: entre "R$" e o número, a formatação põe um espaço que não quebra (no inglês, nenhum). O Pix
  // que vem depois do cartão (espanhol e inglês) tem o rótulo com o desconto, em destaque, como no checkout e no
  // formulário do transfer
  const valorDaFaixa = (p: ParteDoTotal) => (
    <Inteiro>
      {brl(p.centavos)}
      {p.forma && (
        <>
          {' '}
          <span className={p.forma === 'pix' && pixDepoisDoCartao(doPedido) ? 'whitespace-nowrap font-semibold text-(--color-d2)' : 'whitespace-nowrap'}>
            {rotuloNaLista(doPedido, p.forma)}
          </span>
        </>
      )}
    </Inteiro>
  );
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
                vouchers={itens.map(({ codigo, status, reembolsoCentavos, reembolsoPartes, pagamentoRetido }) => ({
                  codigo,
                  status,
                  reembolsoCentavos,
                  reembolsoPartes,
                  pagamentoRetido,
                }))}
              />
              <h1 className="display text-head">{titulo}</h1>
              {[texto].flat().map((frase, n) => (
                <p key={n} className="mt-4 max-w-[44ch] text-lead">
                  {frase}
                </p>
              ))}
              {/* Pacote 33: o pedido cancelado sem reembolso leva à política, onde está a regra (só leitura: nenhuma opção de
                  pedir estorno ou cancelamento nesta página) */}
              {canceladoSemReembolso && (
                <p className="mt-4">
                  <a href={rota(locale, '/politica-de-cancelamento')} className="link inline-flex min-h-11 items-center font-semibold">
                    {d.pedido.desistirPolitica}
                  </a>
                </p>
              )}
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
              ) : mostrarWhatsApp(estado) ? (
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
              <h2 className="mt-6 font-semibold">{pago && !canceladoSemReembolso ? d.pedido.vouchers : d.pedido.itens}</h2>
            </div>
            <ul className="divide-y divide-(--color-borda) px-6 pb-2 md:px-8">
              {itens.map((r) => (
                <li key={r.codigo} className="py-4">
                  <p className="font-[family-name:var(--font-semi)] font-semibold leading-snug">{nomeItem(r)}</p>
                  <p className="text-small">{quando(r)}</p>
                  {volta(r) && <p className="text-small">{volta(r)}</p>}
                  {/* a casa: a entrada às 15h e a saída às 12h */}
                  {r.casa && <p className="text-small">{d.casas.regraHorario}</p>}
                  <p className="text-small">{r.pessoasTexto}</p>
                  {pago && r.status !== 'pago' ? (
                    // um item cancelado ou reembolsado sozinho, num pedido pago: o voucher dele não vale mais. O cancelado
                    // pela equipe sem reembolso (Pacote 33) diz isso, com o motivo embaixo e o link da página dele (o motivo
                    // e a regra da política); nada de PDF
                    <>
                      <p className="mt-1.5 text-small font-semibold">
                        {d.reserva.voucher} <span className="numeros whitespace-nowrap">{r.codigo}</span> ·{' '}
                        {r.semReembolso ? d.pedido.voucherCanceladoSemReembolso : statusDoItem(r)}
                      </p>
                      {r.semReembolso && (
                        <>
                          <p className="mt-1 text-small">{r.semReembolso.motivo}</p>
                          <p className="mt-1">
                            <a href={linkDoVoucher(r)} className="link inline-flex min-h-11 items-center font-semibold">
                              {d.pedido.verVoucher}
                            </a>
                          </p>
                        </>
                      )}
                    </>
                  ) : pago ? (
                    <>
                      <p className="mt-1.5 text-small">
                        {d.reserva.voucher} <span className="numeros whitespace-nowrap font-semibold">{r.codigo}</span>
                      </p>
                      {/* a casa paga: o sinal pago e o que fica para a chegada, só da forma paga (crítica de 26/11, furo 20: com as
                          duas formas, quem pagou o sinal no cartão pediria o desconto do Pix na chegada) */}
                      {r.casa && (
                        <>
                          <p className="numeros mt-1 text-small">
                            {d.casas.sinalPago}: {brl(r.forma === 'pix' ? r.casa.sinalPixCentavos : r.casa.sinalCentavos)}
                          </p>
                          <p className="numeros text-small">
                            {d.casas.naChegada}: {brl(r.forma === 'pix' ? r.casa.chegadaPixCentavos : r.casa.chegadaCentavos)},{' '}
                            {d.casas.formasNaChegada}
                          </p>
                        </>
                      )}
                      <p className="mt-2 flex flex-wrap gap-x-5">
                        <a href={linkDoVoucher(r)} className="link inline-flex min-h-11 items-center font-semibold">
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
                    <>
                      <p className="numeros mt-1.5 text-small">{linhaDeValores(partes(r.totalCentavos, r.totalPixCentavos))}</p>
                      {/* na casa, o valor da linha é o sinal de hoje (paraPublico); embaixo, o total da estadia, como no carrinho:
                          sem o Pix entre as formas da faixa (o limite de um Pix ou o prazo), só o do cartão */}
                      {r.casa && (
                        <p className="mt-1 text-small">
                          {pixNaFaixa
                            ? fmt(d.carrinho.casaTotalDaEstadia, { pix: brl(r.casa.totalPixCentavos), cartao: brl(r.casa.totalCentavos) })
                            : fmt(d.carrinho.casaTotalDaEstadiaCartao, { cartao: brl(r.casa.totalCentavos) })}
                        </p>
                      )}
                    </>
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
