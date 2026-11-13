'use client';

import { useRouter } from 'next/navigation';
import { fmt, type Idioma } from '@/i18n/config';
import type { EstadoDesistencia } from '@/lib/desistencia';
import { textoDolar } from '@/lib/dolar';
import type { FormaPagamento, MotivoSemPix } from '@/lib/formas-pagamento';
import { formatarCentavos } from '@/lib/orcamento';
import { partesDoTotal } from '@/lib/partes-do-total';
import type { ReservaPublica } from '@/lib/reserva-publica';
import { formatarDataIso } from '@/lib/validacao';
import { IconeWhatsApp } from './IconeWhatsApp';
import { PagarPedido, useStatusDoPedido, type TextosPagarPedido } from './pagamento/CheckoutEmbutido';
import { DesistirDaCompra, type TextosDesistencia } from './pagamento/DesistirDaCompra';
import type { TotaisDasFormas } from './pagamento/EscolhaPagamento';

type T = Record<string, string>;

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
  contato,
  linkNovaReserva,
  urlPagina,
  pagamento,
  desistencia,
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
  /** O e-mail da equipe, para os estados sem WhatsApp (cancelado, contestado, recusado…). */
  contato: { href: string; rotulo: string };
  linkNovaReserva: string;
  /** Esta página com o token: para onde o checkout embutido volta ao concluir. */
  urlPagina: string;
  /** Só com o pagamento online em aberto (pendente ou expirado pela Stripe). */
  pagamento?: PagamentoDaReserva;
  /** Só no pedido pago pela Stripe, de um item, antes do serviço: o link de desistir da compra. */
  desistencia?: DesistenciaDaReserva;
}) {
  const router = useRouter();
  const online = pagamento !== undefined && (r.status === 'pendente' || r.status === 'expirado');

  // Pagamento pendente fora do checkout embutido (ex.: pedido antigo): acompanha o status; mudou, o servidor redesenha
  useStatusDoPedido(r.codigo, token, idioma, r.status === 'pendente' && !online, (lido) => {
    if (lido.status !== r.status) router.refresh();
  });

  // A compra é avisada à Meta e ao Google pelo servidor (src/lib/avisar-compra.ts e o arquivo diário do Google):
  // nesta página, que leva o token do cliente no endereço, as tags de anúncio não rodam (src/lib/pixel.ts).

  // em aberto: os dois valores, o do Pix (com desconto) e o do cartão
  const brl = r.totalPixCentavos
    ? `${formatarCentavos(r.totalPixCentavos, locale)} ${textos.noPix} · ${formatarCentavos(r.totalCentavos, locale)} ${textos.noCartao}`
    : formatarCentavos(r.totalCentavos, locale);
  // na tela, cada valor ganha o aproximado em dólar (espanhol e inglês), que nunca quebra no meio da linha;
  // as mensagens vão só em real
  const valorTela = (centavos: number, rotulo?: string) => {
    const parte = rotulo ? `${formatarCentavos(centavos, locale)} ${rotulo}` : formatarCentavos(centavos, locale);
    const u = textoDolar(centavos, dolar, textos.dolar ?? '', locale);
    return u ? (
      <>
        {parte} <span className="whitespace-nowrap">({u})</span>
      </>
    ) : (
      parte
    );
  };
  // só os valores das formas que ainda valem: no pagamento online, o Pix some 2 horas antes do serviço
  const rotulos = { pix: textos.noPix, cartao: textos.noCartao };
  // cada valor é um bloco, que desce inteiro para a linha de baixo quando os dois não cabem lado a lado. O "·" fica
  // na folga à esquerda de cada valor a partir do segundo (0.626em é a largura de " · " nesta fonte) e só aparece
  // quando os dois couberam na mesma linha: no começo de uma linha ele fica fora do recorte da faixa (mais abaixo)
  const brlTela = partesDoTotal(r.totalCentavos, r.totalPixCentavos, online ? pagamento?.formas : undefined).map((parte, n) => (
    <span key={parte.forma ?? 'total'} className="relative pl-[0.626em]">
      {n > 0 && (
        <span aria-hidden="true" className="absolute top-0 left-0 w-[0.626em] text-center">
          ·
        </span>
      )}
      {valorTela(parte.centavos, parte.forma && rotulos[parte.forma])}
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

  const Voucher = (
    <div className="tom-papel">
      <div className="px-6 pb-6 pt-6 md:px-8">
        <p className="text-small font-semibold">{r.status === 'pago' ? textos.voucher : textos.codigoReserva}</p>
        <p className="display numeros mt-1 text-[clamp(2rem,1.2rem+3.4vw,3.5rem)]">{r.codigo}</p>
        {t ? (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="col-span-2">
              <dt className="text-small">{r.passeioNome}</dt>
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
                    <dt className="text-small">{rotulo}</dt>
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
              <dt className="text-small">{textos.transferPassageiros}</dt>
              <dd className="font-bold">{pessoas}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-small">{textos.nome}</dt>
              <dd className="font-bold">{r.nome}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-small">{textos.transferMalas}</dt>
              <dd className="font-bold">{t.malas}</dd>
            </div>
            {t.cadeirinhas && (
              <div className="col-span-2">
                <dt className="text-small">{textos.transferCadeirinhas}</dt>
                <dd className="font-bold">{t.cadeirinhas}</dd>
              </div>
            )}
          </dl>
        ) : (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4">
            <div className="col-span-2">
              <dt className="text-small">{textos.passeio}</dt>
              <dd className="text-lead font-semibold leading-tight">{nomePasseio}</dd>
            </div>
            <div>
              <dt className="text-small">{textos.data}</dt>
              <dd className="font-bold">{dataTexto}</dd>
            </div>
            {r.horario && (
              <div>
                <dt className="text-small">{r.horario.busca ? textos.horarioBusca : textos.horarioSaida}</dt>
                <dd className="numeros text-lead font-bold leading-tight">{r.horario.texto}</dd>
              </div>
            )}
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-small">{textos.pessoas}</dt>
              <dd className="font-bold">{pessoas}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-small">{textos.nome}</dt>
              <dd className="font-bold">{r.nome}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-small">{textos.hotel}</dt>
              <dd className="font-bold">
                {r.hotel} — {r.cidadeHospedagem}
              </dd>
            </div>
            {r.horario && !r.horario.busca && (
              <div className="col-span-2">
                <dt className="text-small">{textos.encontro}</dt>
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
      <div className="tom-campo flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-5 md:px-8">
        <span className="font-semibold">{statusTextos[r.status]}</span>
        {/* o recorte esconde o "·" que cairia no começo de uma linha; a folga em cima, embaixo e à direita (com a
            margem negativa do mesmo tamanho, para a faixa não mudar de tamanho) evita que ele corte a ponta das
            letras; à esquerda não pode haver folga: é ali que o "·" se esconde */}
        <span className="numeros -my-1 -mr-1 overflow-hidden py-1 pr-1 text-lead font-semibold">
          <span className="-ml-[0.626em] flex flex-wrap gap-y-1">{brlTela}</span>
        </span>
      </div>
    </div>
  );

  // quanto já voltou para o cliente; o número é do pedido inteiro (num pedido com vários itens, soma os reembolsos)
  const reembolso = r.reembolsoCentavos ?? 0;

  if (r.status === 'pago') {
    return (
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h1 className="display text-head">{textos.confirmadoTitulo}</h1>
          <p className="mt-4 max-w-[46ch] text-lead">{t ? textos.transferConfirmado : textos.confirmadoTexto}</p>
          {/* pago, com uma parte devolvida (reembolso parcial feito no painel da Stripe): a frase diz quanto voltou.
              Só no pedido de um item: com vários, o reembolso pode ser de outro voucher e quem conta é a página do pedido */}
          {reembolso > 0 && !r.pedidoCodigo && (
            <p className="mt-4 max-w-[46ch] bg-superficie px-5 py-4">
              {fmt(textos.reembolsadoParcial, { valor: formatarCentavos(reembolso, locale) })}
            </p>
          )}
          <div className="mt-8">{Voucher}</div>
        </div>
        <div className="space-y-3 lg:col-span-5 lg:pt-32">
          <a href={`/api/voucher/${r.codigo}?t=${encodeURIComponent(token)}`} className="botao w-full" download>
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
      <div className="grid gap-10 lg:grid-cols-12">
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
  const mensagens: Record<string, { titulo: string; texto: string }> = {
    pendente: { titulo: statusTextos.pendente, texto: textos.atualizaSozinho },
    recusado: { titulo: textos.recusadoTitulo, texto: textos.recusadoTexto },
    expirado: { titulo: textos.expiradoTitulo, texto: textos.expiradoTexto },
    cancelado: { titulo: textos.canceladoTitulo, texto: textos.canceladoTexto },
    reembolsado: {
      titulo: statusTextos.reembolsado,
      texto: parcial ? fmt(textos.reembolsadoParcial, { valor: formatarCentavos(reembolso, locale) }) : textos.reembolsadoTexto,
    },
    // texto neutro: a contestação é entre o cliente e o banco dele
    contestado: { titulo: textos.contestadoTitulo, texto: textos.contestadoTexto },
    aguardando_whatsapp: { titulo: textos.whatsappTitulo, texto: textos.whatsappTexto },
  };
  const m = mensagens[r.status] ?? mensagens.pendente;

  return (
    <div className="grid gap-10 lg:grid-cols-12">
      <div className="lg:col-span-6">
        <h1 className="display text-head">{m.titulo}</h1>
        <p className="mt-4 max-w-[44ch] text-lead">{m.texto}</p>
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
