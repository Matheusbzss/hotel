import Stripe from 'stripe';
import { NextResponse } from 'next/server';
import { formatarCifra } from '@/lib/cifra';
import { agendarAvisoDoReembolsoFalho, agendarEmailDoReembolso } from '@/lib/email/pedidos';
import { reembolsosParaAvisar } from '@/lib/email/regras-dos-avisos';
import {
  aplicarSessao,
  concluirEventoStripe,
  esquecerEventoStripe,
  interpretarSessao,
  registrarEventoStripe,
  registrarRecusa,
  type EntregaDoEvento,
} from '@/lib/pagamento-stripe';
import { liberarBloqueiosDaSessao } from '@/lib/pedido-carrinho';
import { atualizarItem, atualizarReserva, obterReservaDoPedido, registrar, type Reserva } from '@/lib/reservas';
import { construirEvento, criarReembolso, expirarSessao, obterSessao, sessaoDoPagamento, stripe } from '@/lib/stripe';
import { vouchersDoPedido } from '../../pedido/pedido-stripe';
import {
  REFERENCIA_DEVOLUCAO,
  alvoDoEvento,
  aplicarContestacao,
  avisosDeReembolsoSemVoucher,
  codigoDaMetadata,
  efeitoDoReembolsoAtualizado,
  efeitoDoReembolsoDoSite,
  ehTipoTratado,
  eventoDoItemReembolsado,
  eventoDoReembolsoFalho,
  idDe,
  itensParaMarcar,
  leituraDaContestacao,
  linhasDosReembolsosPendentes,
  mudancaDoReembolso,
  pagamentoParaDevolver,
  pedidoSemPagamentoProprio,
  planoDoReembolso,
  resumoDoEvento,
  sessaoDoPedido,
  type AlvoDoEvento,
  type EfeitoDoReembolso,
} from './eventos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 60 s: depois da resposta ainda sai o e-mail do pagamento aprovado, com os PDFs dos vouchers (src/lib/email/pedidos.ts);
// se mesmo assim a função for cortada no meio, o aviso gravado antes do envio fica no histórico para a equipe
export const maxDuration = 60;

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

interface Resultado {
  codigo: string | null;
  resultado: string;
}

/** O que sessaoMudou devolve: o resultado e, para a contestação que chega antes do aviso de pago, se a sessão é do pedido e está paga. */
interface ResultadoDaSessao extends Resultado {
  pagaDoPedido: boolean;
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
    case 'checkout.session.expired': {
      // na resposta, só o código e o resultado
      const { codigo, resultado } = await sessaoMudou(alvo);
      return { codigo, resultado };
    }
    case 'payment_intent.payment_failed':
      return pagamentoFalhou(evento.data.object);
    case 'charge.refunded':
      return cobrancaReembolsada(evento.data.object);
    case 'refund.failed':
      return reembolsoFalhou(evento.data.object);
    case 'refund.updated':
      return reembolsoAtualizado(evento.data.object);
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
 * Os quatro eventos da sessão (concluída, os dois async_payment_* e vencida) fazem a mesma coisa: relêem a sessão na
 * Stripe e aplicam o que ela diz. No Pix, o pago chega como checkout.session.completed já pago (a sessão fica aberta
 * com o QR na tela até o pagamento) e o vencido como payment_intent.payment_failed (pagamentoFalhou); os dois
 * async_payment_* continuam assinados, mas nunca chegaram no teste de 15/11 (a Stripe dá o Pix como de confirmação
 * imediata). Um pagamento que o pedido não pode ficar (segunda aba, pedido cancelado ou já devolvido) volta ao
 * cliente; pago por uma sessão anterior, a sessão corrente ainda aberta é fechada. Também é por aqui que a contestação
 * que chega antes do aviso de pago põe o pedido em dia (contestacao, logo abaixo): `pagaDoPedido` diz se a sessão é a
 * que o site criou para o pedido e a Stripe a dá como paga.
 */
async function sessaoMudou(alvo: AlvoDoEvento): Promise<ResultadoDaSessao> {
  const { codigo } = alvo;
  if (!codigo) return { codigo, resultado: 'sessão sem o código do pedido', pagaDoPedido: false };
  const antes = await obterReservaDoPedido(codigo);
  if (!antes) return { codigo, resultado: 'pedido não encontrado', pagaDoPedido: false };
  const sessao = await obterSessao(alvo.id);
  // só a sessão que o site criou para este pedido muda o pedido (S-01): a de um link de pagamento da conta, com o
  // código do pedido posto no endereço por quem pagou, não confirma nada e não é devolvida sozinha
  if (!sessaoDoPedido(sessao, antes.pedido?.codigo ?? antes.codigo)) {
    return { codigo, resultado: 'sessão que o site não criou: ignorada', pagaDoPedido: false };
  }
  const { reserva, leitura, virouPago, pagamentoRepetido, pagamentoRetido } = await aplicarSessao(codigo, sessao, 'webhook');
  if (!reserva) return { codigo, resultado: 'pedido não encontrado', pagaDoPedido: false };
  const pagaDoPedido = leitura.status === 'pago';
  // o pagamento que chegou para o pedido cancelado e ficou parado (Pacote 22): não volta sozinho, a equipe decide no painel
  if (pagamentoRetido) return { codigo, resultado: 'pedido cancelado: pagamento parado, a equipe decide no painel', pagaDoPedido };

  const devolver = pagamentoRepetido ?? pagamentoParaDevolver(antes, reserva, leitura);
  if (devolver) {
    return { codigo, resultado: await devolverPagamento(reserva, devolver, motivoDaDevolucao(reserva.status)), pagaDoPedido };
  }

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
  return { codigo, resultado: `${leitura.status}${virouPago ? ' (virou pago agora)' : ''}`, pagaDoPedido };
}

/**
 * Pagamento que falhou. No cartão (recusado), o motivo (decline_code) fica no pedido, sem mudar o status, para a
 * página mostrar em linguagem simples e oferecer o Pix; é lido da sessão corrente relida na Stripe, e a recusa de uma
 * sessão anterior (o cliente já trocou de forma) é ignorada, assim como a de um pedido já pago. No Pix, a falha é o
 * QR que venceu sem pagamento, e é por este aviso que o vencimento chega (o checkout.session.async_payment_failed não
 * chegou no teste de 15/11): aí vale a sessão relida, e aplicarSessao expira o pedido com "Pix não pago no prazo" e
 * fecha a sessão na Stripe. Se o cliente já gerou outro QR na mesma sessão, a releitura diz pendente e nada muda.
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
 * novo se ele falhar (refund.failed). A devolução de um pagamento repetido só entra no histórico. O reembolso de parte
 * de um pedido com vários itens feito direto na Stripe (sem a referência de um voucher) não muda voucher nenhum: fica
 * o aviso para a equipe dizer de qual voucher foi (avisosDeReembolsoSemVoucher), um por reembolso, uma vez.
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
    alvo.status,
    pedidoSemPagamentoProprio(alvo),
  );
  if (plano.evento) {
    await atualizarReserva(alvo.codigo, (r) => {
      const m = mudancaDoReembolso(r, plano);
      if (!m) return null;
      if (m.reembolsoCentavos !== undefined) r.reembolsoCentavos = m.reembolsoCentavos;
      if (m.status) r.status = m.status;
      return registrar(r, m.evento);
    });
  }
  if (!plano.doPedido) return { codigo, resultado: 'devolução de um pagamento repetido registrada' };
  // reembolso de um item só: o voucher muda; os outros continuam valendo
  for (const item of itensParaMarcar(plano, vouchers)) {
    await atualizarItem(item.voucher, 'reembolsado', eventoDoItemReembolsado(item));
  }
  // reembolso de parte feito direto na Stripe num pedido com vários itens: o aviso, com a conferência dentro da trava
  if (avisosDeReembolsoSemVoucher(alvo, plano, vouchers.length).length) {
    await atualizarReserva(alvo.codigo, (r) => {
      const faltam = avisosDeReembolsoSemVoucher(r, plano, vouchers.length);
      if (!faltam.length) return null;
      for (const linha of faltam) registrar(r, linha);
      return r;
    });
  }
  // Pacote 28: o reembolso que a Stripe registrou e ainda não concluiu ganha a linha com o id dele (é por ela que o
  // refund.updated sabe que estava a caminho), uma vez; nada mais muda no pedido
  if (linhasDosReembolsosPendentes(alvo.historico, reembolsos.data).length) {
    await atualizarReserva(alvo.codigo, (r) => {
      const faltam = linhasDosReembolsosPendentes(r.historico, reembolsos.data);
      if (!faltam.length) return null;
      for (const linha of faltam) registrar(r, linha);
      return r;
    });
  }
  // e o e-mail ao cliente, depois da resposta, um por reembolso (a regra e o envio em src/lib/email/pedidos.ts): só os
  // reembolsos em vigor criados nas últimas 72 horas (reembolsosParaAvisar)
  for (const re of reembolsosParaAvisar(
    reembolsos.data.map((x) => ({ id: x.id, status: x.status, created: x.created, referencia: x.metadata?.referencia })),
    new Date(),
  )) {
    agendarEmailDoReembolso(codigo, re.id);
  }
  return {
    codigo,
    resultado: plano.total ? 'reembolso total' : `reembolso parcial (${plano.itens.length} item(ns), ${cifra(plano.reembolsadoCentavos)})`,
  };
}

/**
 * O reembolso falhou (cartão cancelado, conta encerrada): relê o reembolso e grava a linha certa, uma vez
 * (eventoDoReembolsoFalho): devolver por outro meio; a contestação aberta com o reembolso a caminho (aí o banco devolve
 * pela contestação, e a linha diz para não devolver por fora); ou a devolução de um pagamento repetido, que não é
 * dinheiro do pedido. Se o reembolso é um que o site pediu e o aviso dele (charge.refunded) ainda não foi tratado, o
 * que ele faria com o reembolso ainda valendo entra agora (efeitoDoReembolsoDoSite, com a cobrança relida), na mesma
 * gravação: o pedido termina igual em qualquer ordem dos dois avisos. O voucher reembolsado não volta a valer; o valor
 * que falhou continua contado no reembolso do pedido. Depois da resposta sai o e-mail à equipe (agendarAvisoDoReembolsoFalho,
 * src/lib/email/pedidos.ts), uma vez por reembolso: a falha pode chegar semanas depois, com ninguém olhando o painel.
 */
async function reembolsoFalhou(reembolso: Stripe.Refund): Promise<Resultado> {
  const codigo = codigoDaMetadata(reembolso.metadata) ?? (await codigoDoPagamento(reembolso.payment_intent));
  if (!codigo) return { codigo, resultado: 'reembolso sem o código do pedido' };
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return { codigo, resultado: 'pedido não encontrado' };
  const [atual, vouchers] = await Promise.all([stripe().refunds.retrieve(reembolso.id), vouchersDoPedido(codigo)]);
  const evento = eventoDoReembolsoFalho(atual, alvo.paymentIntentId);
  if (!evento) return { codigo, resultado: 'o reembolso não está falho na Stripe: ignorado' };
  // a cobrança relida uma vez, já sabendo que o reembolso falhou: é dela que o efeito tira o que o charge.refunded
  // teria aplicado; sem a cobrança, nenhum efeito, só a linha
  const idDaCobranca = idDe(atual.charge);
  const cobranca = idDaCobranca ? await stripe().charges.retrieve(idDaCobranca) : null;
  // num objeto, e não numa variável solta, para o TypeScript não achar que o valor nunca muda (ele muda lá dentro)
  const lido: { efeito?: EfeitoDoReembolso | null } = {};
  await atualizarReserva(alvo.codigo, (r) => {
    // atualizarReserva pode chamar isto mais de uma vez (outra gravação no meio): vale a leitura da vez que gravou
    const efeito = cobranca ? efeitoDoReembolsoDoSite(r, vouchers, atual, cobranca) : null;
    lido.efeito = efeito;
    const anotado = r.historico.some((h) => h.evento === evento);
    if (!efeito?.pedido && anotado) return null;
    if (efeito?.pedido) {
      r.reembolsoCentavos = efeito.pedido.reembolsoCentavos;
      if (efeito.pedido.status) r.status = efeito.pedido.status;
      if (efeito.pedido.evento) registrar(r, efeito.pedido.evento);
    }
    return anotado ? r : registrar(r, evento);
  });
  // o voucher do reembolso, depois do pedido (como no charge.refunded); a repetição completa o que ficou para trás
  const voucher = lido.efeito?.voucher;
  if (voucher) await atualizarItem(voucher.codigo, 'reembolsado', voucher.evento);
  // o e-mail à equipe, depois da resposta e lido da linha já gravada: um por reembolso (a devolução falha de um
  // pagamento repetido fica só no histórico)
  agendarAvisoDoReembolsoFalho(codigo, atual.id);
  const aplicado = lido.efeito?.pedido ? ' (o aviso do reembolso não tinha chegado: aplicado ao pedido agora)' : '';
  return { codigo, resultado: `aviso de reembolso falho registrado${aplicado}` };
}

/**
 * O reembolso mudou na Stripe (Pacote 28): relê o reembolso e aplica efeitoDoReembolsoAtualizado (eventos.ts). O
 * reembolso pendente que terminou ganha a linha "Reembolso concluído na Stripe" e, depois da resposta, o e-mail ao
 * cliente; o cancelado, só a linha. A falha continua com o refund.failed. Nada muda no status, no valor nem nos vouchers.
 * A Stripe manda este aviso também quando só acrescenta a referência do banco a um reembolso já concluído: aí nada muda.
 */
async function reembolsoAtualizado(reembolso: Stripe.Refund): Promise<Resultado> {
  const codigo = codigoDaMetadata(reembolso.metadata) ?? (await codigoDoPagamento(reembolso.payment_intent));
  if (!codigo) return { codigo, resultado: 'reembolso sem o código do pedido' };
  const alvo = await obterReservaDoPedido(codigo);
  if (!alvo) return { codigo, resultado: 'pedido não encontrado' };
  const [atual, vouchers] = await Promise.all([stripe().refunds.retrieve(reembolso.id), vouchersDoPedido(codigo)]);
  const historicos = [alvo.historico, ...vouchers.map((v) => v.historico)];
  const efeito = efeitoDoReembolsoAtualizado(historicos, atual, alvo.paymentIntentId);
  const { linha } = efeito;
  if (linha) {
    await atualizarReserva(alvo.codigo, (r) => (r.historico.some((h) => h.evento === linha) ? null : registrar(r, linha)));
  }
  if (efeito.avisar) agendarEmailDoReembolso(codigo, atual.id);
  return { codigo, resultado: efeito.resultado };
}

/**
 * Contestação (chargeback) aberta ou encerrada: relê a contestação na Stripe. Aberta → contestado; ganha → volta a
 * pago (sem avisar a compra de novo: não é um pagamento novo); perdida → reembolsado, com o valor que saiu somado ao
 * que já tinha voltado. Em qualquer ordem dos avisos (aplicarContestacao, eventos.ts): a contestação que chega antes do
 * aviso de pago acha a sessão do pagamento contestado (sessaoDoPagamento) e passa pela porta de sempre (sessaoMudou →
 * aplicarSessao) antes de se aplicar. O e-mail do pagamento aprovado que isso agenda não sai: na hora do envio o
 * pedido já está contestado (src/lib/email/pedidos.ts só manda com o pedido pago).
 */
async function contestacao(disputa: Stripe.Dispute): Promise<Resultado> {
  const codigo = await codigoDoPagamento(disputa.payment_intent);
  if (!codigo) return { codigo, resultado: 'contestação sem o código do pedido' };
  const atual = await stripe().disputes.retrieve(disputa.id);
  // na perdida, o valor cobrado limita a soma do que voltou ao cliente: só aí a cobrança é relida
  const cobranca = leituraDaContestacao(atual).reembolsoCentavos ? idDe(atual.charge) : null;
  const cobradoCentavos = cobranca ? (await stripe().charges.retrieve(cobranca)).amount : undefined;
  const resultado = await aplicarContestacao(codigo, atual, cobradoCentavos, {
    lerPedido: obterReservaDoPedido,
    acharSessao: sessaoDoPagamento,
    aplicarPago: async (sessaoId, paymentIntentId) =>
      (await sessaoMudou({ tipo: 'checkout.session.completed', objeto: 'checkout.session', id: sessaoId, codigo, paymentIntentId }))
        .pagaDoPedido,
    gravar: atualizarReserva,
    registrar,
  });
  return { codigo, resultado };
}
