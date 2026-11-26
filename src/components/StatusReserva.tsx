'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { fmt, type Idioma } from '@/i18n/config';
import type { EstadoDesistencia } from '@/lib/desistencia';
import { textoDolar } from '@/lib/dolar';
import type { FormaPagamento, MotivoSemPix } from '@/lib/formas-pagamento';
import { frasesDoReembolso, type TextosDoReembolso } from '@/lib/frases-do-reembolso';
import { formatarCentavos } from '@/lib/orcamento';
import { formasDaFaixa, partesDoTotal, type ParteDoTotal } from '@/lib/partes-do-total';
import { formaEmDestaque, rotuloPixComDesconto } from '@/lib/preco-destaque';
import type { ReservaPublica } from '@/lib/reserva-publica';
import { formatarDataIso } from '@/lib/validacao';
import { Inteiro } from './ComDolar';
import { IconeWhatsApp } from './IconeWhatsApp';
import type { TextosPagarPedido } from './pagamento/CheckoutEmbutido';
import { DesistirDaCompra, type TextosDesistencia } from './pagamento/DesistirDaCompra';
import type { TotaisDasFormas } from './pagamento/EscolhaPagamento';
import { PalavraDoStatus } from './pagamento/PalavraDoStatus';
import { leituraMudou, useStatusDoPedido } from './pagamento/useStatusDoPedido';

type T = Record<string, string>;

/**
 * A tela de pagar (PagarPedido, ./pagamento/CheckoutEmbutido.tsx) carregada só quando aparece: no pagamento online em
 * aberto (pendente ou expirado pela Stripe). Importada direto, ela levava o pedaço do formulário da Stripe
 * (@stripe/react-stripe-js e o carregador do Stripe.js, uns 10 KB com gzip) a toda página da reserva, também à paga, à
 * cancelada e à reembolsada (E11 do reteste de 17/11). Desenhada no servidor como antes (o ssr do dynamic, sem `loading`):
 * o HTML do pedido em aberto não muda, e no navegador a tela se liga quando o pedaço chega. Daqui só vem o tipo dos textos.
 */
const PagarPedido = dynamic(() => import('./pagamento/CheckoutEmbutido').then((m) => m.PagarPedido));

/**
 * A grade dos dados do voucher (a do passeio e a do transfer) e os rótulos dela. Abaixo do sm, a data e o horário do
 * passeio ficam lado a lado, cada um em meia grade: em 320 px com a letra em 150%, cada coluna tinha 76 px, e "Departure
 * time" passava 22 px da dele (2 px em 360; reteste de 17/11), como passariam "hospedagem" e "alojamiento" no rótulo da
 * busca na hospedagem. O vão menor abaixo do sm (1rem em vez de 2rem) dá 88 px a cada coluna em 320 e 108 em 360 (com a
 * letra em 150%). Do sm para cima, o vão de sempre.
 *
 * O hífen (pelo lang da página: pt-BR, en, es, es-AR) só liga com a grade abaixo de 11,6rem (na grade o @container, no
 * rótulo o @max-[11.6rem]), porque o navegador hifeniza de forma gulosa: qualquer palavra que cruza o fim da linha leva
 * hífen, mesmo quando caberia inteira na linha de baixo ("Busca na hospeda- / gem" com a letra normal, em vez de "Busca na /
 * hospedagem"). Com a grade de 11,6rem ou mais, a meia coluna ((grade − 1rem) / 2) tem 5,3rem ou mais e comporta
 * "hospedagem" (5,602 × 0,9375 = 5,25rem), a palavra mais longa dos rótulos de meia grade: nenhuma palavra precisa quebrar.
 * Abaixo disso é a letra grande em tela estreita (320 px com 125%, de 320 a 390 px com 150%), onde "hospedagem" já não
 * cabe e uma palavra precisa mesmo quebrar. Com a letra normal, e com 125% a partir de 360 px, os rótulos quebram só entre
 * palavras, como antes. A última rede é o [overflow-wrap:anywhere]: sem o dicionário do idioma no navegador, a palavra
 * quebra em qualquer letra, sem passar da coluna. Os rótulos que ocupam a linha inteira cabem numa linha só em 320 px com
 * a letra em 150%.
 */
const GRADE_DO_VOUCHER = 'mt-6 grid grid-cols-2 gap-x-4 gap-y-4 sm:gap-x-8 @container';
const ROTULO_DA_GRADE = 'text-small [overflow-wrap:anywhere] @max-[11.6rem]:hyphens-auto';

/** O pagamento online em aberto (pendente ou expirado pela Stripe): o que a tela de pagar precisa. */
export interface PagamentoDaReserva {
  /** As formas que o servidor liberou agora (formasDoPagamento). */
  formas: FormaPagamento[];
  /** Sem o Pix, por quê: o prazo ou o limite de valor de um Pix. */
  semPix?: MotivoSemPix;
  totais: TotaisDasFormas;
  /** A forma que o pedido tinha. */
  formaAtual?: FormaPagamento;
  textos: TextosPagarPedido;
}

/** O link "Desistir da compra" do pedido pago de um item só (o servidor decide se aparece: estadoDaDesistencia). */
export interface DesistenciaDaReserva {
  estado: EstadoDesistencia;
  codigoPedido: string;
  hrefPolitica: string;
  textos: TextosDesistencia;
}

/**
 * A página da reserva (um voucher), em todos os estados: confirmando o pagamento, pagar de novo, pago com o
 * voucher, expirado, cancelado, reembolsado, contestado. Quem decide o status é o servidor: aqui a página só
 * pergunta a ele e se redesenha (router.refresh) quando ele muda. O WhatsApp da equipe só aparece quando o
 * servidor liberou (mostrarWhatsApp: só pago).
 */
export function StatusReserva({
  inicial: r,
  token,
  idioma,
  locale,
  dolar = null,
  textos,
  statusTextos,
  numeroWhatsApp,
  telefoneExibicao,
  whatsappLiberado,
  encontroLiberado,
  contato,
  linkNovaReserva,
  urlPagina,
  pagamento,
  desistencia,
  politica,
}: {
  inicial: ReservaPublica;
  token: string;
  idioma: Idioma;
  locale: string;
  /** Reais por dólar, para o "≈ US$" das páginas em espanhol e inglês (null no português). */
  dolar?: number | null;
  textos: T;
  statusTextos: T;
  numeroWhatsApp: string;
  /** O WhatsApp da equipe como aparece no voucher (+55 21 …). */
  telefoneExibicao: string;
  /** mostrarWhatsApp(status), decidido no servidor: o bloco do WhatsApp da equipe só aparece com ele. */
  whatsappLiberado: boolean;
  /**
   * mostrarPontoDeEncontro(status), decidido no servidor (como o WhatsApp): a linha do ponto de encontro só aparece
   * enquanto a reserva ainda pode valer. Chega pronto: este componente do navegador não importa as regras do pagamento.
   */
  encontroLiberado: boolean;
  /** O e-mail da equipe, para os estados sem WhatsApp (cancelado, contestado, recusado…). */
  contato: { href: string; rotulo: string };
  linkNovaReserva: string;
  /** Esta página com o token: para onde o checkout embutido volta ao concluir. */
  urlPagina: string;
  /** Só com o pagamento online em aberto (pendente ou expirado pela Stripe). */
  pagamento?: PagamentoDaReserva;
  /** Só no pedido pago pela Stripe, de um item, antes do serviço: o link de desistir da compra. */
  desistencia?: DesistenciaDaReserva;
  /**
   * Pacote 33: o link da política de cancelamento, que a reserva cancelada sem reembolso mostra embaixo do motivo e da
   * regra (só leitura: nenhuma opção de pedir estorno ou cancelamento).
   */
  politica?: { href: string; texto: string };
}) {
  const router = useRouter();
  const online = pagamento !== undefined && (r.status === 'pendente' || r.status === 'expirado');

  // Fora da tela de pagar (que acompanha sozinha), a página pergunta o status ao servidor; mudou, o servidor redesenha.
  // Pendente fora do checkout embutido (ex.: pedido antigo): a cada 4 s e ao voltar para a aba. Nos outros estados (pago,
  // contestado, reembolsado, cancelado, finalizar no WhatsApp…): só quando o cliente volta para a aba, porque o pedido
  // pode ter mudado com ela aberta (reembolso, contestação, pago no painel). Redesenha só depois de uma leitura que
  // mudou o que a página mostra (leituraMudou: o status, o valor devolvido ou as partes de um reembolso que falhou, como
  // a devolução por outro meio registrada pela equipe, que deixa o status em "reembolsado"): sem rede, a pergunta falha
  // em silêncio e o voucher continua na tela
  useStatusDoPedido(
    r.codigo,
    token,
    idioma,
    !online,
    (lido) => {
      if (leituraMudou(lido, r)) router.refresh();
    },
    r.status === 'pendente' ? 'sempre' : 'ao-voltar',
  );

  // A compra é avisada à Meta e ao Google pelo servidor (src/lib/avisar-compra.ts e o arquivo diário do Google):
  // nesta página, que leva o token do cliente no endereço, as tags de anúncio não rodam (src/lib/pixel.ts).

  // em aberto: os dois valores. Em português, o do Pix (com desconto) e depois o do cartão, como sempre; em espanhol e
  // inglês, primeiro o da forma que a tela de pagar traz marcada, e o do cartão fora do pagamento online, com o Pix depois
  // dizendo o desconto ("con Pix (−10%)"): o mesmo número do checkout (formaEmDestaque, revisão do Pacote 29)
  const primeiraForma = formaEmDestaque(idioma, online && pagamento ? { ...pagamento, cartaoRecusado: Boolean(r.recusa) } : null);
  const rotulos = { pix: textos.noPix, cartao: textos.noCartao };
  // o Pix que vem DEPOIS do cartão na mesma lista diz o desconto; o Pix sozinho, ou primeiro, fica com o rótulo de sempre
  const pixDepoisDoCartao = (lista: readonly ParteDoTotal[]) => lista[0]?.forma === 'cartao';
  const rotuloNaLista = (lista: readonly ParteDoTotal[], forma: FormaPagamento) =>
    forma === 'pix' && pixDepoisDoCartao(lista) ? rotuloPixComDesconto(textos.noPixComDesconto ?? textos.noPix) : rotulos[forma];
  const doTexto = partesDoTotal(r.totalCentavos, r.totalPixCentavos, undefined, primeiraForma);
  const brl = r.totalPixCentavos
    ? doTexto
        .map((parte) =>
          parte.forma ? `${formatarCentavos(parte.centavos, locale)} ${rotuloNaLista(doTexto, parte.forma)}` : formatarCentavos(parte.centavos, locale),
        )
        .join(' · ')
    : formatarCentavos(r.totalCentavos, locale);
  // na tela, cada valor ganha o aproximado em dólar (espanhol e inglês), que nunca quebra no meio da linha;
  // as mensagens vão só em real. O valor e o rótulo ("R$ 138,60" e "no Pix") ficam juntos, como na faixa da página do
  // pedido; só quando nem assim cabem (letra grande em tela estreita: a faixa com menos de 14rem, o @container dela), o
  // rótulo desce inteiro para a linha de baixo (Inteiro). Antes o rótulo se partia: "R$ 138,60 no" numa linha e "Pix" na
  // outra, em 320 px com a letra em 150% (reteste de 17-18/11, defeito 5). O valor nunca se parte: entre "R$" e o número,
  // a formatação põe um espaço que não quebra (no inglês, nenhum)
  // o Pix que vem depois do cartão (espanhol e inglês) tem o rótulo em destaque, como no checkout e na página do pedido
  const valorTela = (centavos: number, rotulo?: string, rotuloEmDestaque = false) => {
    const valor = (
      <Inteiro>
        {formatarCentavos(centavos, locale)}
        {rotulo && (
          <>
            {' '}
            <span className={rotuloEmDestaque ? 'whitespace-nowrap text-(--color-d2)' : 'whitespace-nowrap'}>{rotulo}</span>
          </>
        )}
      </Inteiro>
    );
    const u = textoDolar(centavos, dolar, textos.dolar ?? '', locale);
    return u ? (
      <>
        {valor} <span className="whitespace-nowrap">({u})</span>
      </>
    ) : (
      valor
    );
  };
  // só os valores das formas que ainda valem (no pagamento online, o Pix some 2 horas antes do serviço) e, no pedido de
  // Pix, o do Pix: o já gerado continua valendo com o pagamento desligado às pressas ou depois do prazo do Pix (pendente),
  // e o vencido sem forma que valha mostra o valor que o cliente escolheu (formasDaFaixa, src/lib/partes-do-total.ts)
  const formasNaFaixa = formasDaFaixa(r.status, online ? pagamento : undefined);
  // cada valor é um bloco, que desce inteiro para a linha de baixo quando os dois não cabem lado a lado. O "·" fica
  // na folga à esquerda de cada valor a partir do segundo (0.626em é a largura de " · " nesta fonte) e só aparece
  // quando os dois couberam na mesma linha: no começo de uma linha ele fica fora do recorte da faixa (mais abaixo). O
  // bloco nunca passa da largura da faixa (max-w-full): sem isso, o Inteiro de dentro, que pede a largura dele inteiro,
  // não chegaria a quebrar e o recorte cortaria o rótulo
  const daFaixa = partesDoTotal(r.totalCentavos, r.totalPixCentavos, formasNaFaixa, primeiraForma);
  const brlTela = daFaixa.map((parte, n) => (
    <span key={parte.forma ?? 'total'} className="relative max-w-full pl-[0.626em]">
      {n > 0 && (
        <span aria-hidden="true" className="absolute top-0 left-0 w-[0.626em] text-center">
          ·
        </span>
      )}
      {valorTela(parte.centavos, parte.forma && rotuloNaLista(daFaixa, parte.forma), parte.forma === 'pix' && pixDepoisDoCartao(daFaixa))}
    </span>
  ));
  const dataTexto = formatarDataIso(r.data, locale);
  // nas mensagens, a data vai junto com a hora: "sáb., 14 de nov. de 2026 às 9h"
  const dataHora = r.horario ? fmt(textos.dataHora, { data: dataTexto, hora: r.horario.texto }) : dataTexto;
  const pessoas = r.pessoasTexto;
  const nomePasseio = r.opcaoNome ? `${r.passeioNome} (${r.opcaoNome})` : r.passeioNome;
  // transfer: a data e a hora de cada trecho, e o trajeto da ida nas mensagens
  const t = r.transfer;
  const dataHoraTrecho = (tr: { data: string; hora: string }) =>
    fmt(textos.dataHora, { data: formatarDataIso(tr.data, locale), hora: tr.hora });
  const trajeto = t ? `${t.ida.saida} → ${t.ida.destino}` : '';

  const msgVoucher = t
    ? textos.transferMsgVoucher
        .replace('{codigo}', r.codigo)
        .replace('{trajeto}', trajeto)
        .replace('{data}', dataHoraTrecho(t.ida))
        .replace('{pessoas}', pessoas)
    : textos.msgVoucher
        .replace('{codigo}', r.codigo)
        .replace('{passeio}', nomePasseio)
        .replace('{data}', dataHora)
        .replace('{pessoas}', pessoas)
        .replace('{hotel}', `${r.hotel} (${r.cidadeHospedagem})`);
  const msgFinalizar = textos.msgWhatsapp
    .replace('{codigo}', r.codigo)
    .replace('{passeio}', t ? `${r.passeioNome}: ${trajeto}` : nomePasseio)
    .replace('{data}', t ? dataHoraTrecho(t.ida) : dataHora)
    .replace('{pessoas}', pessoas)
    .replace('{total}', brl);
  const wa = (m: string) => `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(m)}`;

  // quanto já voltou para o cliente; o número é do pedido inteiro (num pedido com vários itens, soma os reembolsos)
  const reembolso = r.reembolsoCentavos ?? 0;
  // o reembolso que falhou na Stripe e diz respeito a esta página (o servidor decide, partesDaPagina): o que voltou pela
  // mesma forma de pagamento, o pendente e o que a equipe devolveu de outro jeito. Sem falha, tudo pela mesma forma: o
  // texto de sempre
  const partes = r.reembolsoPartes ?? { originalCentavos: reembolso, pendenteCentavos: 0, outroMeioCentavos: 0 };
  const textosDoReembolso: TextosDoReembolso = {
    reembolsadoTexto: textos.reembolsadoTexto,
    reembolsadoParcial: textos.reembolsadoParcial,
    reembolsoFalhou: textos.reembolsoFalhou,
    reembolsoOutroMeio: textos.reembolsoOutroMeio,
  };
  const frasesDoReembolsoDaPagina = (inteiro: boolean) =>
    frasesDoReembolso(partes, inteiro, textosDoReembolso, (centavos) => formatarCentavos(centavos, locale));
  // o voucher reembolsado cujo dinheiro ainda não voltou: "Reembolso pendente" no lugar de "Reembolsado"
  const reembolsoPendente = r.status === 'reembolsado' && partes.pendenteCentavos > 0;

  const Voucher = (
    <div className="tom-papel">
      <div className="px-6 pb-6 pt-6 md:px-8">
        <p className="text-small font-semibold">{r.status === 'pago' ? textos.voucher : textos.codigoReserva}</p>
        {/* o código nunca quebra no hífen de "ON-" (só junto com o grid-cols-1 das grades desta página: sem ele, um código
            largo alargaria a coluna e a página voltaria a rolar de lado) */}
        <p className="display numeros mt-1 whitespace-nowrap text-[clamp(2rem,1.2rem+3.4vw,3.5rem)]">{r.codigo}</p>
        {t ? (
          <dl className={GRADE_DO_VOUCHER}>
            <div className="col-span-2">
              <dt className={ROTULO_DA_GRADE}>{r.passeioNome}</dt>
              <dd className="text-lead font-semibold leading-tight">{t.veiculo}</dd>
            </div>
            {(
              [
                [textos.transferIda, t.ida],
                [textos.transferVolta, t.volta],
              ] as const
            ).map(
              ([rotulo, tr]) =>
                tr && (
                  <div key={rotulo} className="col-span-2">
                    <dt className={ROTULO_DA_GRADE}>{rotulo}</dt>
                    <dd className="font-bold">{dataHoraTrecho(tr)}</dd>
                    <dd>
                      {tr.saida} → {tr.destino}
                    </dd>
                    {tr.voo && (
                      <dd className="text-small">
                        {textos.transferVoo} {tr.voo}
                      </dd>
                    )}
                  </div>
                ),
            )}
            <div className="col-span-2 sm:col-span-1">
              <dt className={ROTULO_DA_GRADE}>{textos.transferPassageiros}</dt>
              <dd className="font-bold">{pessoas}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className={ROTULO_DA_GRADE}>{textos.nome}</dt>
              <dd className="font-bold">{r.nome}</dd>
            </div>
            <div className="col-span-2">
              <dt className={ROTULO_DA_GRADE}>{textos.transferMalas}</dt>
              <dd className="font-bold">{t.malas}</dd>
            </div>
            {t.cadeirinhas && (
              <div className="col-span-2">
                <dt className={ROTULO_DA_GRADE}>{textos.transferCadeirinhas}</dt>
                <dd className="font-bold">{t.cadeirinhas}</dd>
              </div>
            )}
          </dl>
        ) : (
          <dl className={GRADE_DO_VOUCHER}>
            <div className="col-span-2">
              <dt className={ROTULO_DA_GRADE}>{textos.passeio}</dt>
              <dd className="text-lead font-semibold leading-tight">{nomePasseio}</dd>
            </div>
            <div>
              <dt className={ROTULO_DA_GRADE}>{textos.data}</dt>
              <dd className="font-bold">{dataTexto}</dd>
            </div>
            {r.horario && (
              <div>
                <dt className={ROTULO_DA_GRADE}>{r.horario.busca ? textos.horarioBusca : textos.horarioSaida}</dt>
                <dd className="numeros text-lead font-bold leading-tight">{r.horario.texto}</dd>
              </div>
            )}
            <div className="col-span-2 sm:col-span-1">
              <dt className={ROTULO_DA_GRADE}>{textos.pessoas}</dt>
              <dd className="font-bold">{pessoas}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className={ROTULO_DA_GRADE}>{textos.nome}</dt>
              <dd className="font-bold">{r.nome}</dd>
            </div>
            <div className="col-span-2">
              <dt className={ROTULO_DA_GRADE}>{textos.hotel}</dt>
              <dd className="font-bold">
                {r.hotel} — {r.cidadeHospedagem}
              </dd>
            </div>
            {/* só enquanto a reserva ainda pode valer: nunca na cancelada, reembolsada, contestada ou recusada */}
            {encontroLiberado && r.horario && !r.horario.busca && (
              <div className="col-span-2">
                <dt className={ROTULO_DA_GRADE}>{textos.encontro}</dt>
                <dd className="font-bold">{textos.encontroTexto}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
      {/* o único lugar onde o cliente recebe o WhatsApp da equipe: o voucher da compra paga (o servidor decide) */}
      {whatsappLiberado && (
        <div className="border-t border-(--color-borda) px-6 py-5 md:px-8">
          <p className="text-small">{textos.whatsappEquipe}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="numeros text-lead font-semibold">{telefoneExibicao}</p>
            <a
              href={wa(msgVoucher)}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao-whats w-full sm:w-auto"
              data-evento="Contact"
            >
              <IconeWhatsApp className="size-5" />
              {textos.chamarWhatsapp}
            </a>
          </div>
          {/* no transfer, o titular manda por aqui o nome dos outros passageiros */}
          {t && <p className="mt-3 text-small">{textos.transferDemais}</p>}
        </div>
      )}
      {/* @container: a largura da faixa decide quando o valor e o rótulo podem quebrar entre si (valorTela), como na
          faixa da página do pedido */}
      <div className="@container tom-campo flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-5 md:px-8">
        {/* a palavra do status de quando a página abriu; na tela de pagar, "Pagar de novo" no pedido vencido abre uma
            sessão nova, a tela de pagar avisa e a palavra passa a "Aguardando pagamento", sem redesenhar a página (o
            redesenho desmontaria o formulário da Stripe que acabou de abrir) */}
        <span className="font-semibold">
          <PalavraDoStatus
            codigo={r.pedidoCodigo ?? r.codigo}
            texto={reembolsoPendente ? textos.reembolsoPendenteTitulo : statusTextos[r.status]}
            textoPendente={statusTextos.pendente}
          />
        </span>
        {/* o recorte esconde o "·" que cairia no começo de uma linha; a folga em cima, embaixo e à direita (com a
            margem negativa do mesmo tamanho, para a faixa não mudar de tamanho) evita que ele corte a ponta das
            letras; à esquerda não pode haver folga: é ali que o "·" se esconde */}
        <span className="numeros -my-1 -mr-1 overflow-hidden py-1 pr-1 text-lead font-semibold">
          <span className="-ml-[0.626em] flex flex-wrap gap-y-1">{brlTela}</span>
        </span>
      </div>
    </div>
  );

  if (r.status === 'pago') {
    // pago, com uma parte devolvida (reembolso parcial feito no painel da Stripe): a frase diz quanto voltou; com um
    // reembolso que falhou, quanto ainda não voltou ou voltou de outro jeito, uma frase por parágrafo. Sem falha, só no
    // pedido de um item: com vários, o reembolso pode ser de outro voucher e quem conta é a página do pedido
    const frasesDoPago = r.reembolsoPartes || !r.pedidoCodigo ? frasesDoReembolsoDaPagina(false) : [];
    // grid-cols-1 (nas três grades desta página): no celular, uma coluna que encolhe com a tela. Sem isto a coluna fica
    // da largura do maior texto que não quebra (o código do voucher, a escolha da forma, o botão "Pagar") e, com a letra
    // grande em tela estreita, a página rola de lado (como o formulário do checkout, FormularioCarrinho)
    return (
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h1 className="display text-head">{textos.confirmadoTitulo}</h1>
          <p className="mt-4 max-w-[46ch] text-lead">{t ? textos.transferConfirmado : textos.confirmadoTexto}</p>
          {frasesDoPago.length > 0 && (
            <div className="mt-4 max-w-[46ch] space-y-2 bg-superficie px-5 py-4">
              {frasesDoPago.map((frase, n) => (
                <p key={n}>{frase}</p>
              ))}
            </div>
          )}
          <div className="mt-8">{Voucher}</div>
        </div>
        <div className="space-y-3 lg:col-span-5 lg:pt-32">
          {/* sem o atributo download: com ele, um voucher que deixou de valer com a página aberta viraria um arquivo
              salvo com a página da reserva; sem ele, o PDF continua baixando (a rota manda attachment) e o voucher que
              não vale abre a página da reserva no estado de verdade */}
          <a href={`/api/voucher/${r.codigo}?t=${encodeURIComponent(token)}`} className="botao w-full">
            {textos.baixarPdf}
          </a>
          <div className="mt-6 bg-superficie px-5 py-5">
            <h2 className="font-bold">{textos.proximos}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>{t ? textos.transferEspera : r.horario?.busca ? textos.proximo1Busca : textos.proximo1Saida}</li>
              <li>{textos.proximo2}</li>
              <li>{textos.proximo3}</li>
            </ul>
          </div>
          {/* discreto, embaixo de tudo: a desistência pela mesma ferramenta da compra (Decreto 7.962/2013) */}
          {desistencia && (
            <DesistirDaCompra
              className="mt-4"
              codigoPedido={desistencia.codigoPedido}
              token={token}
              estado={desistencia.estado}
              hrefPolitica={desistencia.hrefPolitica}
              textos={desistencia.textos}
            />
          )}
        </div>
      </div>
    );
  }

  // pagamento online em aberto: confirmando, tempo esgotado ou cartão recusado, com o checkout embutido aqui mesmo
  if (pagamento && (r.status === 'pendente' || r.status === 'expirado')) {
    return (
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <PagarPedido
            codigoPedido={r.pedidoCodigo ?? r.codigo}
            codigoConsulta={r.codigo}
            token={token}
            idioma={idioma}
            locale={locale}
            dolar={dolar}
            status={r.status}
            recusa={r.recusa}
            formas={pagamento.formas}
            semPix={pagamento.semPix}
            totais={pagamento.totais}
            formaAtual={pagamento.formaAtual}
            urlVolta={urlPagina}
            contato={contato}
            textos={pagamento.textos}
          />
        </div>
        <div className="lg:col-span-5">{Voucher}</div>
      </div>
    );
  }

  // reembolso de uma parte só (feito no painel da Stripe): a frase diz quanto voltou
  const parcial = reembolso > 0 && reembolso < r.totalCentavos;
  const mensagens: Record<string, { titulo: string; texto: string | string[] }> = {
    pendente: { titulo: statusTextos.pendente, texto: textos.atualizaSozinho },
    recusado: { titulo: textos.recusadoTitulo, texto: textos.recusadoTexto },
    expirado: { titulo: textos.expiradoTitulo, texto: textos.expiradoTexto },
    // o pagamento que chegou com o pedido cancelado, enquanto a equipe decide (Pacote 22): a frase dele no lugar do texto;
    // a reserva que a equipe cancelou sem reembolso (Pacote 33): o que aconteceu, o motivo e a regra da política
    cancelado: {
      titulo: textos.canceladoTitulo,
      texto: r.pagamentoRetido
        ? textos.pagamentoRetido
        : r.semReembolso
          ? [textos.canceladoSemReembolsoTexto, r.semReembolso.motivo, r.semReembolso.regra]
          : textos.canceladoTexto,
    },
    // com um reembolso que falhou na Stripe e ainda não voltou, "Reembolso pendente" e a frase com o valor; depois que a
    // equipe devolve de outro jeito, a frase diz isso. Uma frase por parágrafo; sem falha, a frase de sempre
    reembolsado: {
      titulo: reembolsoPendente ? textos.reembolsoPendenteTitulo : statusTextos.reembolsado,
      texto: frasesDoReembolsoDaPagina(!parcial),
    },
    // texto neutro: a contestação é entre o cliente e o banco dele
    contestado: { titulo: textos.contestadoTitulo, texto: textos.contestadoTexto },
    aguardando_whatsapp: { titulo: textos.whatsappTitulo, texto: textos.whatsappTexto },
  };
  const m = mensagens[r.status] ?? mensagens.pendente;

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
      <div className="lg:col-span-6">
        <h1 className="display text-head">{m.titulo}</h1>
        {[m.texto].flat().map((frase, n) => (
          <p key={n} className="mt-4 max-w-[44ch] text-lead">
            {frase}
          </p>
        ))}
        {r.status === 'cancelado' && r.semReembolso && politica && (
          <p className="mt-4">
            <a href={politica.href} className="link inline-flex min-h-11 items-center font-semibold">
              {politica.texto}
            </a>
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          {r.status === 'aguardando_whatsapp' ? (
            // o caminho do WhatsApp (o pagamento combinado com a equipe): o botão é a própria forma de pagar
            <a
              href={wa(msgFinalizar)}
              target="_blank"
              rel="noopener noreferrer"
              className="botao botao-whats w-full sm:w-auto"
              data-evento="Contact"
            >
              <IconeWhatsApp className="size-5" />
              {textos.whatsappBotao}
            </a>
          ) : (
            <>
              {(r.status === 'recusado' || r.status === 'expirado') && (
                <a href={linkNovaReserva} className="botao w-full sm:w-auto">
                  {textos.tentarNovamente}
                </a>
              )}
              {/* sem pagamento aprovado não há WhatsApp: a dúvida vai por e-mail */}
              <a href={contato.href} className="botao botao-vazado w-full sm:w-auto" data-evento="Contact">
                {contato.rotulo}
              </a>
            </>
          )}
        </div>
      </div>
      <div className="lg:col-span-6">{Voucher}</div>
    </div>
  );
}
