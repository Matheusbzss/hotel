import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { formatarCifra } from '@/lib/cifra';
import {
  aplicarSessao,
  concluirEventoStripe,
  esquecerEventoStripe,
  interpretarSessao,
  podeMudar,
  registrarEventoStripe,
  registrarRecusa,
  type EntregaDoEvento,
} from '@/lib/pagamento-stripe';
import { liberarBloqueiosDaSessao } from '@/lib/pedido-carrinho';
import { atualizarItem, atualizarReserva, obterReservaDoPedido, registrar, type Reserva } from '@/lib/reservas';
import { construirEvento, criarReembolso, expirarSessao, obterSessao, stripe } from '@/lib/stripe';
import { vouchersDoPedido } from '../../pedido/pedido-stripe';
import {
  alvoDoEvento,
  codigoDaMetadata,
  ehTipoTratado,
  eventoDoItemReembolsado,
  eventoDoReembolsoFalho,
  idDe,
  leituraDaContestacao,
  pagamentoParaDevolver,
  planoDoReembolso,
  resumoDoEvento,
  sessaoDoPedido,
  type AlvoDoEvento,
} from './eventos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * O webhook da Stripe. Cadastrar na Stripe (Workbench → Webhooks, payload "snapshot") o endereço
 * https://orlanativa.online/api/webhooks/stripe com os eventos de TIPOS_TRATADOS (src/app/api/webhooks/stripe/eventos.ts)
 * e guardar o segredo whsec_… em STRIPE_WEBHOOK_SECRET (um por destino: o do modo de teste, o da prévia e o de produção).
 * - O corpo é lido cru (request.text()) e a assinatura é conferida antes de qualquer coisa: inválida → 400.
 * - Cada evento é processado uma vez: o id é gravado em pagamentos_eventos ANTES de processar e marcado como
 *   processado DEPOIS (concluirEventoStripe). Repetido já processado → 200 e nada. Repetido que outra entrega ainda
 *   está processando → 409, para a Stripe tentar mais tarde. O que ficou pela metade (a função foi cortada no meio)
 *   é retomado pela entrega seguinte depois de 2 minutos: o processamento é feito para poder rodar duas vezes
 *   (aplicarSessao, as chaves de idempotência dos reembolsos e as linhas do histórico que não se repetem).
 * - A sessão só vale para o pedido quando traz o código dele na metadata, que só o site grava (sessaoDoPedido): a
 *   de um link de pagamento da conta com o código do pedido no endereço é ignorada.
 * - A verdade é sempre o objeto relido na Stripe (a sessão com o pagamento e a cobrança, a cobrança com os reembolsos,
 *   a contestação), nunca o corpo do evento; e o pedido só vira pago por aplicarSessao (src/lib/pagamento-stripe.ts).
 * - Resposta 2xx rápida, também quando o evento não é de um pedido daqui. 500 só quando o processamento falha (o banco
 *   ou a Stripe fora do ar): aí o registro DESTE evento é desfeito (esquecerEventoStripe), para a Stripe tentar de novo
 *   mais tarde e a nova tentativa ser processada. Os outros eventos continuam registrados.
 * - Os registros do servidor só levam o tipo do evento e o código do pedido (nunca nome, e-mail ou cartão).
 */

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));
const PIX_GERADO = 'Pix gerado: aguardando o pagamento';
/** A referência (e a chave de idempotência) da devolução de um pagamento que o pedido não pode ficar. */
const REFERENCIA_DEVOLUCAO = 'pagamento-repetido';

interface Resultado {
  codigo: string | null;
  resultado: string;
}

export async function POST(request: Request) {
  const corpo = await request.text();
  const assinatura = request.headers.get('stripe-signature');
  let evento: Stripe.Event;
  try {
    if (!assinatura) throw new Error('sem a assinatura');
    evento = construirEvento(corpo, assinatura);
  } catch (e) {
    console.error(`[webhook stripe] assinatura recusada: ${mensagem(e)}`);
    return NextResponse.json({ ok: false, erro: 'assinatura' }, { status: 400 });
  }
  if (!ehTipoTratado(evento.type)) return NextResponse.json({ ok: true, ignorado: evento.type });

  const alvo = alvoDoEvento(evento);
  let entrega: EntregaDoEvento;
  try {
    entrega = await registrarEventoStripe(evento.id, evento.type, alvo.codigo, resumoDoEvento(evento));
  } catch (e) {
    console.error(`[webhook stripe] ${evento.type}: falha ao registrar o evento: ${mensagem(e)}`);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  if (entrega === 'repetido') return NextResponse.json({ ok: true, repetido: true });
  // outra entrega deste evento ainda está processando: resposta que não é 2xx, para a Stripe tentar mais tarde
  if (entrega === 'em-andamento') return NextResponse.json({ ok: false, emAndamento: true }, { status: 409 });

  try {
    const r = await processar(evento, alvo);
    // sem esta marca a entrega seguinte retomaria o evento: só custaria processar de novo, sem mudar nada
    await concluirEventoStripe(evento.id).catch((e2) =>
      console.error(`[webhook stripe] falha ao marcar o evento como processado: ${mensagem(e2)}`),
    );
    console.log(`[webhook stripe] ${evento.type} ${r.codigo ?? '-'}: ${r.resultado}`);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error(`[webhook stripe] ${evento.type} ${alvo.codigo ?? '-'} falhou: ${mensagem(e)}`);
    // só o registro deste evento sai: a nova tentativa (ou o reenvio pela Stripe CLI) é processada, e os outros
    // eventos já vistos continuam contando como repetidos
    await esquecerEventoStripe(evento.id).catch((e2) =>
      console.error(`[webhook stripe] falha ao desfazer o registro do evento: ${mensagem(e2)}`),
    );
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function processar(evento: Stripe.Event, alvo: AlvoDoEvento): Promise<Resultado> {
  switch (evento.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      return sessaoMudou(alvo);
    case 'payment_intent.payment_failed':
      return pagamentoFalhou(evento.data.object);
    case 'charge.refunded':
      return cobrancaReembolsada(evento.data.object);
    case 'refund.failed':
      return reembolsoFalhou(evento.data.object);
    case 'charge.dispute.created':
    case 'charge.dispute.closed':
      return contestacao(evento.data.object);
    default:
      return { codigo: alvo.codigo, resultado: 'ignorado' };
  }
}

/** O código do pedido pelo pagamento (payment_intent_data.metadata.codigo), relendo o PaymentIntent se só veio o id. */
async function codigoDoPagamento(pi: string | Stripe.PaymentIntent | null | undefined): Promise<string | null> {
  if (!pi) return null;
  if (typeof pi !== 'string') return codigoDaMetadata(pi.metadata);
  return codigoDaMetadata((await stripe().paymentIntents.retrieve(pi)).metadata);
}

/** Por que o pagamento volta, para o histórico. */
const motivoDaDevolucao = (status: Reserva['status']) =>
  status === 'cancelado' ? 'pedido cancelado' : status === 'reembolsado' ? 'pedido já reembolsado' : 'pagamento repetido';

/**
 * Devolve ao cliente um pagamento que o pedido não pode ficar (pagamentoParaDevolver) e deixa a linha no histórico.
 * A chave de idempotência da Stripe faz o evento repetido devolver uma vez só. A Stripe recusando a devolução (já
 * devolvido, contestado) vira um aviso para a equipe, sem fazer a Stripe reenviar o evento; a rede ou a Stripe fora
 * do ar seguem como erro: a rota responde 500 e a nova tentativa devolve.
 */
async function devolverPagamento(pedido: Reserva, pi: string, motivo: string): Promise<string> {
  let evento: string;
  let resultado: string;
  try {
    const re = await criarReembolso(pi, undefined, REFERENCIA_DEVOLUCAO);
    evento = `Devolução de ${cifra(re.amount)} do pagamento ${pi} (${motivo}) pedida à Stripe (${re.id})`;
    resultado = `${motivo}: pagamento devolvido ao cliente`;
  } catch (e) {
    if (!(e instanceof Stripe.errors.StripeInvalidRequestError)) throw e;
    if (e.code === 'charge_already_refunded') return `${motivo}: o pagamento já tinha sido devolvido`;
    evento = `Aviso: a Stripe não devolveu o pagamento ${pi} (${motivo}, ${e.code ?? 'sem código'}): devolver por outro meio`;
    resultado = `${motivo}: a Stripe recusou a devolução (${e.code ?? 'sem código'})`;
  }
  await atualizarReserva(pedido.codigo, (r) => (r.historico.some((h) => h.evento === evento) ? null : registrar(r, evento)));
  return resultado;
}

/**
 * Os quatro eventos da sessão (concluída, Pix pago, Pix não pago no prazo, vencida) fazem a mesma coisa: relêem a
 * sessão na Stripe e aplicam o que ela diz. Um pagamento que o pedido não pode ficar (segunda aba, pedido cancelado
 * ou já devolvido) volta ao cliente; pago por uma sessão anterior, a sessão corrente ainda aberta é fechada.
 */
async function sessaoMudou(alvo: AlvoDoEvento): Promise<Resultado> {
  const { codigo } = alvo;
  if (!codigo) return { codigo, resultado: 'sessão sem o código do pedido' };
  const antes = await obterReservaDoPedido(codigo);
  if (!antes) return { codigo, resultado: 'pedido não encontrado' };
  const sessao = await obterSessao(alvo.id);
  // só a sessão que o site criou para este pedido muda o pedido (S-01): a de um link de pagamento da conta, com o
  // código do pedido posto no endereço por quem pagou, não confirma nada e não é devolvida sozinha
  if (!sessaoDoPedido(sessao, antes.pedido?.codigo ?? antes.codigo)) {
    return { codigo, resultado: 'sessão que o site não criou: ignorada' };
  }
  const { reserva, leitura, virouPago, pagamentoRepetido } = await aplicarSessao(codigo, sessao, 'webhook');
  if (!reserva) return { codigo, resultado: 'pedido não encontrado' };

  const devolver = pagamentoRepetido ?? pagamentoParaDevolver(antes, reserva, leitura);
  if (devolver) return { codigo, resultado: await devolverPagamento(reserva, devolver, motivoDaDevolucao(reserva.status)) };

  if (virouPago && antes.pagamentoExternoId && antes.pagamentoExternoId !== sessao.id) {
    // o cliente pagou numa sessão anterior (duas abas, o QR de um Pix já gerado): a corrente, ainda aberta, fecha
    await expirarSessao(antes.pagamentoExternoId).catch((e) =>
      console.error(`[webhook stripe] falha ao expirar a outra sessão de ${codigo}: ${mensagem(e)}`),
    );
  }
  const corrente = reserva.pagamentoExternoId === sessao.id;
  if (corrente && reserva.status === 'pendente' && leitura.forma === 'pix' && sessao.status === 'complete') {
    // o cliente concluiu o formulário e o QR do Pix está na tela: fica no histórico, uma vez
    await atualizarReserva(reserva.codigo, (r) => (r.historico.some((h) => h.evento === PIX_GERADO) ? null : registrar(r, PIX_GERADO)));
  }
  if (corrente && (reserva.status === 'expirado' || reserva.status === 'cancelado')) {
    await liberarBloqueiosDaSessao(sessao.id).catch((e) =>
      console.error(`[webhook stripe] falha ao liberar as datas de ${codigo}: ${mensagem(e)}`),
    );
  }
  return { codigo, resultado: `${leitura.status}${virouPago ? ' (virou pago agora)' : ''}` };
}

/**
 * Pagamento que falhou. No cartão (recusado), o motivo (decline_code) fica no pedido, sem mudar o status, para a
 * página mostrar em linguagem simples e oferecer o Pix; é lido da sessão corrente relida na Stripe, e a recusa de uma
 * sessão anterior (o cliente já trocou de forma) é ignorada, assim como a de um pedido já pago. No Pix, a falha é o
 * QR que venceu sem pagamento: aí vale a sessão relida (o pedido expira com "Pix não pago no prazo"), como no
 * checkout.session.async_payment_failed, que também chega.
 */
async function pagamentoFalhou(pi: Stripe.PaymentIntent): Promise<Resultado> {
  const codigo = codigoDaMetadata(pi.metadata);
  if (!codigo) return { codigo, resultado: 'pagamento sem o código do pedido' };
  const r = await obterReservaDoPedido(codigo);
  if (!r) return { codigo, resultado: 'pedido não encontrado' };
  if (!r.pagamentoExternoId) return { codigo, resultado: 'pedido sem sessão de pagamento' };
  const sessao = await obterSessao(r.pagamentoExternoId);
  const leitura = interpretarSessao(sessao);
  if (leitura.paymentIntentId !== pi.id) return { codigo, resultado: 'falha de uma sessão anterior: ignorada' };
  if (leitura.status === 'pago') return { codigo, resultado: 'pedido já pago: falha antiga ignorada' };
  if (leitura.forma === 'pix' || pi.payment_method_types?.includes('pix')) {
    const { reserva } = await aplicarSessao(codigo, sessao, 'webhook');
    if (reserva?.status === 'expirado' && reserva.pagamentoExternoId === sessao.id) {
      await liberarBloqueiosDaSessao(sessao.id).catch((e) =>
        console.error(`[webhook stripe] falha ao liberar as datas de ${codigo}: ${mensagem(e)}`),
      );
    }
    return { codigo, resultado: `Pix não pago: pedido ${reserva?.status ?? 'não encontrado'}` };
  }
  const motivo = leitura.motivoCodigo ?? pi.last_payment_error?.decline_code ?? pi.last_payment_error?.code;
  if (!motivo) return { codigo, resultado: 'recusa sem motivo' };
  await registrarRecusa(codigo, motivo, pi.id);
  return { codigo, resultado: `recusa registrada (${motivo})` };
}

/**
 * Cobrança reembolsada (pelo nosso painel ou pelo da Stripe): relê a cobrança e os reembolsos dela. Total → o
 * pedido vira reembolsado; parcial → cada voucher reembolsado sozinho é marcado (atualizar_item) e o pedido guarda
 * quanto já voltou. O reembolso que a Stripe ainda não concluiu conta desde já (reembolsoEmVigor): ela só avisa de
 * novo se ele falhar (refund.failed). A devolução de um pagamento repetido só entra no histórico.
 */
async function cobrancaReembolsada(cobranca: Stripe.Charge): Promise<Resultado> {
  const codigo = codigoDaMetadata(cobranca.metadata) ?? (await codigoDoPagamento(cobranca.payment_intent));
  if (!codigo) return { codigo, resultado: 'cobrança sem o código do pedido' };
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return { codigo, resultado: 'pedido não encontrado' };
  const [atual, reembolsos, vouchers] = await Promise.all([
    stripe().charges.retrieve(cobranca.id),
    stripe().refunds.list({ charge: cobranca.id, limit: 100 }),
    vouchersDoPedido(codigo),
  ]);
  const plano = planoDoReembolso(
    atual,
    reembolsos.data,
    vouchers.map((v) => v.codigo),
    alvo.paymentIntentId,
    alvo.reembolsoCentavos ?? 0,
  );
  if (plano.evento) {
    const { evento } = plano;
    await atualizarReserva(alvo.codigo, (r) => {
      if (!plano.doPedido) return r.historico.some((h) => h.evento === evento) ? null : registrar(r, evento);
      const jaTinha = r.reembolsoCentavos ?? 0;
      const viraReembolsado = plano.total && podeMudar(r.status, 'reembolsado');
      // a mesma leitura chegando de novo (dois eventos para o mesmo reembolso): nada novo
      if (jaTinha >= plano.reembolsadoCentavos && !viraReembolsado) return null;
      r.reembolsoCentavos = Math.max(jaTinha, plano.reembolsadoCentavos);
      if (viraReembolsado) r.status = 'reembolsado';
      return registrar(r, evento);
    });
  }
  if (!plano.doPedido) return { codigo, resultado: 'devolução de um pagamento repetido registrada' };
  if (!plano.total) {
    // reembolso de um item só: o voucher muda; os outros continuam valendo
    for (const item of plano.itens) {
      const voucher = vouchers.find((v) => v.codigo === item.voucher);
      if (voucher && voucher.statusItem !== 'reembolsado') {
        await atualizarItem(item.voucher, 'reembolsado', eventoDoItemReembolsado(item));
      }
    }
  }
  return {
    codigo,
    resultado: plano.total ? 'reembolso total' : `reembolso parcial (${plano.itens.length} item(ns), ${cifra(plano.reembolsadoCentavos)})`,
  };
}

/** O reembolso falhou (cartão cancelado, conta encerrada): aviso no histórico, para a equipe devolver por outro meio. */
async function reembolsoFalhou(reembolso: Stripe.Refund): Promise<Resultado> {
  const codigo = codigoDaMetadata(reembolso.metadata) ?? (await codigoDoPagamento(reembolso.payment_intent));
  if (!codigo) return { codigo, resultado: 'reembolso sem o código do pedido' };
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return { codigo, resultado: 'pedido não encontrado' };
  const evento = eventoDoReembolsoFalho(await stripe().refunds.retrieve(reembolso.id));
  if (!evento) return { codigo, resultado: 'o reembolso não está falho na Stripe: ignorado' };
  await atualizarReserva(alvo.codigo, (r) => (r.historico.some((h) => h.evento === evento) ? null : registrar(r, evento)));
  return { codigo, resultado: 'aviso de reembolso falho registrado' };
}

/**
 * Contestação (chargeback) aberta ou encerrada: relê a contestação na Stripe. Aberta → contestado; ganha → volta a
 * pago (sem avisar a compra de novo: não é um pagamento novo); perdida → reembolsado, com o valor que saiu.
 */
async function contestacao(disputa: Stripe.Dispute): Promise<Resultado> {
  const codigo = await codigoDoPagamento(disputa.payment_intent);
  if (!codigo) return { codigo, resultado: 'contestação sem o código do pedido' };
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return { codigo, resultado: 'pedido não encontrado' };
  const atual = await stripe().disputes.retrieve(disputa.id);
  const pi = idDe(atual.payment_intent);
  const doPedido = !alvo.paymentIntentId || !pi || pi === alvo.paymentIntentId;
  const leitura = leituraDaContestacao(atual);
  const evento = doPedido ? leitura.evento : `${leitura.evento} (pagamento repetido ${pi})`;
  await atualizarReserva(alvo.codigo, (r) => {
    if (r.historico.some((h) => h.evento === evento)) return null;
    if (doPedido && leitura.status && podeMudar(r.status, leitura.status)) r.status = leitura.status;
    if (doPedido && leitura.reembolsoCentavos) r.reembolsoCentavos = Math.max(r.reembolsoCentavos ?? 0, leitura.reembolsoCentavos);
    return registrar(r, evento);
  });
  return { codigo, resultado: `contestação ${atual.status}` };
}
