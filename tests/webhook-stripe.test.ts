import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type Stripe from 'stripe';
import {
  REFERENCIAS_DO_SITE,
  REFERENCIA_DEVOLUCAO,
  TIPOS_TRATADOS,
  alvoDoEvento,
  aplicarContestacao,
  avisosDeReembolsoSemVoucher,
  codigoDaMetadata,
  contestacaoPedePagoAntes,
  devolvidoNaStripe,
  efeitoDoReembolsoDoSite,
  ehTipoTratado,
  eventoDoItemReembolsado,
  eventoDoReembolsoFalho,
  idDe,
  itensParaMarcar,
  leituraDaContestacao,
  mudancaDaContestacao,
  mudancaDoReembolso,
  pagamentoParaDevolver,
  planoDoReembolso,
  reembolsoEmVigor,
  reembolsosForaDoSite,
  resumoDoEvento,
  stripeDevolveuMenos,
} from '../src/app/api/webhooks/stripe/eventos.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { podeMudar } from '../src/lib/pagamento-stripe.ts';
import {
  linhaDaDevolucaoRepetidaQueFalhou,
  linhaDoReembolsoFalho,
  linhaDoReembolsoParadoPelaContestacao,
  linhaDoReembolsoSemVoucher,
  partesDoReembolso,
  reembolsosFalhos,
  reembolsosSemVoucher,
} from '../src/lib/reembolsos-a-resolver.ts';

// Só o que o webhook decide sem rede nem banco: os eventos são exemplos em JSON com os campos do SDK.

/** Os valores nas frases do histórico saem de formatarCifra (com o espaço que não quebra do pt-BR). */
const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');

/** Um evento como a Stripe manda (só os campos que a leitura usa). */
const evento = (type: string, object: Record<string, unknown>) =>
  ({ id: 'evt_1', object: 'event', type, livemode: false, data: { object } }) as unknown as Stripe.Event;

const SESSAO = {
  object: 'checkout.session',
  id: 'cs_test_a1',
  status: 'complete',
  payment_status: 'paid',
  amount_total: 95400,
  currency: 'brl',
  client_reference_id: 'ON-ABC234',
  metadata: { codigo: 'ON-ABC234', vouchers: 'ON-ABC234,ON-DEF456', idioma: 'pt', forma: 'cartao' },
  customer_details: { email: 'teste@exemplo.com', name: 'Teste', address: { country: 'AR' } },
  payment_intent: 'pi_3Teste1',
};

test('os dez eventos que o destino assina, e nada mais (o refund.updated desde o Pacote 28)', () => {
  assert.equal(TIPOS_TRATADOS.length, 10);
  assert.equal(ehTipoTratado('refund.updated'), true);
  for (const t of TIPOS_TRATADOS) assert.equal(ehTipoTratado(t), true, t);
  assert.equal(ehTipoTratado('payment_intent.succeeded'), false);
  assert.equal(ehTipoTratado('charge.succeeded'), false);
});

test('o código do pedido só vale no formato do site; id ou objeto expandido viram o id', () => {
  assert.equal(codigoDaMetadata({ codigo: 'ON-ABC234' }), 'ON-ABC234');
  assert.equal(codigoDaMetadata({ codigo: 'qualquer coisa' }), null);
  assert.equal(codigoDaMetadata({}), null);
  assert.equal(codigoDaMetadata(null), null);
  assert.equal(idDe('pi_1'), 'pi_1');
  assert.equal(idDe({ id: 'pi_2' }), 'pi_2');
  assert.equal(idDe(null), null);
  assert.equal(idDe(undefined), null);
});

test('de que pedido o evento fala: a sessão pelo client_reference_id, o pagamento e a cobrança pela metadata', () => {
  assert.deepEqual(alvoDoEvento(evento('checkout.session.completed', SESSAO)), {
    tipo: 'checkout.session.completed',
    objeto: 'checkout.session',
    id: 'cs_test_a1',
    codigo: 'ON-ABC234',
    paymentIntentId: 'pi_3Teste1',
  });
  // sem client_reference_id válido, vale a metadata; com o pagamento expandido, o id sai do objeto
  const semReferencia = alvoDoEvento(
    evento('checkout.session.expired', { ...SESSAO, client_reference_id: null, payment_intent: { id: 'pi_9' } }),
  );
  assert.equal(semReferencia.codigo, 'ON-ABC234');
  assert.equal(semReferencia.paymentIntentId, 'pi_9');
  assert.deepEqual(
    alvoDoEvento(
      evento('payment_intent.payment_failed', {
        object: 'payment_intent',
        id: 'pi_3Teste1',
        status: 'requires_payment_method',
        metadata: { codigo: 'ON-ABC234' },
        last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' },
      }),
    ),
    {
      tipo: 'payment_intent.payment_failed',
      objeto: 'payment_intent',
      id: 'pi_3Teste1',
      codigo: 'ON-ABC234',
      paymentIntentId: 'pi_3Teste1',
    },
  );
  assert.deepEqual(
    alvoDoEvento(
      evento('charge.refunded', { object: 'charge', id: 'ch_1', metadata: { codigo: 'ON-ABC234' }, payment_intent: 'pi_3Teste1' }),
    ),
    { tipo: 'charge.refunded', objeto: 'charge', id: 'ch_1', codigo: 'ON-ABC234', paymentIntentId: 'pi_3Teste1' },
  );
  // o reembolso e a contestação não trazem o código: a rota acha o pedido pelo pagamento
  const disputa = alvoDoEvento(
    evento('charge.dispute.created', { object: 'dispute', id: 'dp_1', metadata: {}, payment_intent: 'pi_3Teste1', charge: 'ch_1' }),
  );
  assert.equal(disputa.codigo, null);
  assert.equal(disputa.paymentIntentId, 'pi_3Teste1');
});

test('o resumo guardado com o evento tem ids e status, nunca o cliente nem o cartão', () => {
  const resumo = resumoDoEvento(evento('checkout.session.completed', SESSAO)) as Record<string, unknown>;
  assert.deepEqual(resumo, {
    objeto: 'checkout.session',
    id: 'cs_test_a1',
    modoReal: false,
    status: 'complete',
    payment_status: 'paid',
    amount_total: 95400,
    currency: 'brl',
    client_reference_id: 'ON-ABC234',
    paymentIntent: 'pi_3Teste1',
  });
  assert.equal(JSON.stringify(resumo).includes('teste@exemplo.com'), false);
  const recusa = resumoDoEvento(
    evento('payment_intent.payment_failed', {
      object: 'payment_intent',
      id: 'pi_1',
      status: 'requires_payment_method',
      amount: 95400,
      currency: 'brl',
      metadata: { codigo: 'ON-ABC234' },
      last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds', payment_method: { card: { last4: '9995' } } },
    }),
  ) as Record<string, unknown>;
  assert.equal(recusa.codigoDaRecusa, 'insufficient_funds');
  assert.equal(JSON.stringify(recusa).includes('9995'), false);
  const reembolso = resumoDoEvento(
    evento('refund.failed', {
      object: 'refund',
      id: 're_1',
      status: 'failed',
      amount: 100,
      currency: 'brl',
      failure_reason: 'expired_or_canceled_card',
      payment_intent: 'pi_1',
      charge: { id: 'ch_1' },
    }),
  ) as Record<string, unknown>;
  assert.equal(reembolso.failure_reason, 'expired_or_canceled_card');
  assert.equal(reembolso.cobranca, 'ch_1');
  assert.deepEqual(resumoDoEvento(evento('x', { object: 'coisa', id: 'c_1', nome: 'Teste' })), {
    objeto: 'coisa',
    id: 'c_1',
    modoReal: false,
  });
});

test('o pagamento que o pedido ficou não volta: pendente ou expirado que virou pago, e a releitura do mesmo pagamento', () => {
  const pago = { status: 'pago', paymentIntentId: 'pi_A' };
  // a sessão paga agora é a do pedido
  assert.equal(pagamentoParaDevolver({ status: 'pendente' }, { status: 'pago', paymentIntentId: 'pi_A' }, pago), null);
  assert.equal(pagamentoParaDevolver({ status: 'expirado' }, { status: 'pago', paymentIntentId: 'pi_A' }, pago), null);
  // o mesmo evento chegando de novo, com o pedido já pago, contestado ou devolvido por este mesmo pagamento
  assert.equal(pagamentoParaDevolver({ status: 'pago', paymentIntentId: 'pi_A' }, { status: 'pago', paymentIntentId: 'pi_A' }, pago), null);
  assert.equal(
    pagamentoParaDevolver({ status: 'contestado', paymentIntentId: 'pi_A' }, { status: 'contestado', paymentIntentId: 'pi_A' }, pago),
    null,
  );
  assert.equal(
    pagamentoParaDevolver({ status: 'reembolsado', paymentIntentId: 'pi_A' }, { status: 'reembolsado', paymentIntentId: 'pi_A' }, pago),
    null,
  );
  // a sessão não foi paga: nada a devolver
  assert.equal(
    pagamentoParaDevolver({ status: 'cancelado' }, { status: 'cancelado' }, { status: 'pendente', paymentIntentId: 'pi_A' }),
    null,
  );
  assert.equal(pagamentoParaDevolver({ status: 'cancelado' }, { status: 'cancelado' }, { status: 'pago' }), null);
});

test('o pagamento que o pedido não pode ficar volta: segunda aba, pedido cancelado, pedido já devolvido', () => {
  const outro = { status: 'pago', paymentIntentId: 'pi_B' };
  // pago (ou contestado) por outro pagamento numa segunda aba
  assert.equal(
    pagamentoParaDevolver({ status: 'pago', paymentIntentId: 'pi_A' }, { status: 'pago', paymentIntentId: 'pi_A' }, outro),
    'pi_B',
  );
  assert.equal(
    pagamentoParaDevolver({ status: 'contestado', paymentIntentId: 'pi_A' }, { status: 'contestado', paymentIntentId: 'pi_A' }, outro),
    'pi_B',
  );
  // o QR de um Pix antigo pago depois de o pedido ser cancelado (o cliente refez a compra): o pagamento é o que o
  // pedido já tinha registrado (o Pix gerado antes de cancelar), ou o pedido ainda não tinha nenhum
  assert.equal(
    pagamentoParaDevolver({ status: 'cancelado', paymentIntentId: 'pi_B' }, { status: 'cancelado', paymentIntentId: 'pi_B' }, outro),
    'pi_B',
  );
  assert.equal(pagamentoParaDevolver({ status: 'cancelado' }, { status: 'cancelado', paymentIntentId: 'pi_B' }, outro), 'pi_B');
  // cancelado com outro pagamento registrado (o cartão recusado antes do Pix): aplicarSessao não troca o do pedido
  assert.equal(
    pagamentoParaDevolver({ status: 'cancelado', paymentIntentId: 'pi_A' }, { status: 'cancelado', paymentIntentId: 'pi_A' }, outro),
    'pi_B',
  );
  // pago depois de o pedido ter sido devolvido por inteiro: o pedido continua com o pagamento dele, e a nova tentativa
  // depois de uma falha acha o mesmo pagamento a devolver
  assert.equal(
    pagamentoParaDevolver({ status: 'reembolsado', paymentIntentId: 'pi_A' }, { status: 'reembolsado', paymentIntentId: 'pi_A' }, outro),
    'pi_B',
  );
  // pedidos fora da Stripe nunca têm sessão paga a devolver
  assert.equal(pagamentoParaDevolver({ status: 'aguardando_whatsapp' }, { status: 'aguardando_whatsapp' }, outro), null);
});

const COBRANCA = { id: 'ch_1', amount: 95400, amount_refunded: 0, refunded: false, payment_intent: 'pi_3Teste1' };
const reembolso = (id: string, amount: number, referencia: string, status = 'succeeded') => ({
  id,
  amount,
  status,
  metadata: { referencia },
});
const VOUCHERS = ['ON-ABC234', 'ON-DEF456'];

test('reembolso total: o pedido vira reembolsado, sem marcar item por item', () => {
  const plano = planoDoReembolso(
    { ...COBRANCA, amount_refunded: 95400, refunded: true },
    [reembolso('re_1', 95400, 'total')],
    VOUCHERS,
    'pi_3Teste1',
    0,
  );
  assert.equal(plano.doPedido, true);
  assert.equal(plano.total, true);
  assert.equal(plano.reembolsadoCentavos, 95400);
  assert.equal(plano.novoCentavos, 95400);
  assert.deepEqual(plano.itens, []);
  assert.equal(plano.evento, `Reembolso total (${cifra(95400)}) confirmado pela Stripe`);
});

test('reembolso de um item: o voucher da referência é marcado e o pedido guarda quanto já voltou', () => {
  const plano = planoDoReembolso(
    { ...COBRANCA, amount_refunded: 15400 },
    [reembolso('re_2', 15400, 'ON-ABC234')],
    VOUCHERS,
    'pi_3Teste1',
    0,
  );
  assert.equal(plano.total, false);
  assert.deepEqual(plano.itens, [{ voucher: 'ON-ABC234', centavos: 15400, reembolsoId: 're_2', pendente: false }]);
  assert.equal(plano.evento, `Reembolso de ${cifra(15400)} confirmado pela Stripe: ${cifra(15400)} de ${cifra(95400)} devolvidos`);
  // o reembolso que falhou, o cancelado e o de referência estranha não marcam voucher nenhum
  const semMarca = planoDoReembolso(
    { ...COBRANCA, amount_refunded: 100 },
    [reembolso('re_3', 15400, 'ON-ABC234', 'failed'), reembolso('re_4', 80000, 'ON-DEF456', 'canceled'), reembolso('re_10', 100, 'outro')],
    VOUCHERS,
    'pi_3Teste1',
    0,
  );
  assert.deepEqual(semMarca.itens, []);
});

test('o reembolso que nasce pendente conta desde já: marca o voucher e o histórico diz que o dinheiro está a caminho', () => {
  const plano = planoDoReembolso(
    { ...COBRANCA, amount_refunded: 15400 },
    [reembolso('re_11', 15400, 'ON-ABC234', 'pending')],
    VOUCHERS,
    'pi_3Teste1',
    0,
  );
  const item = { voucher: 'ON-ABC234', centavos: 15400, reembolsoId: 're_11', pendente: true };
  assert.deepEqual(plano.itens, [item]);
  assert.equal(
    plano.evento,
    `Reembolso de ${cifra(15400)} registrado na Stripe (o dinheiro ainda está a caminho do cliente): ${cifra(15400)} de ${cifra(95400)} devolvidos`,
  );
  assert.equal(
    eventoDoItemReembolsado(item),
    `Item ON-ABC234 reembolsado (${cifra(15400)}) pela Stripe (re_11): o dinheiro ainda está a caminho do cliente`,
  );
  assert.equal(eventoDoItemReembolsado({ ...item, pendente: false }), `Item ON-ABC234 reembolsado (${cifra(15400)}) pela Stripe (re_11)`);
  // em vigor: todos, menos o que falhou ou foi cancelado (a Stripe só avisa de novo quando o reembolso falha)
  for (const status of ['succeeded', 'pending', 'requires_action', null, undefined])
    assert.equal(reembolsoEmVigor(status), true, String(status));
  for (const status of ['failed', 'canceled']) assert.equal(reembolsoEmVigor(status), false, status);
});

test('a mesma leitura chegando de novo não acrescenta nada; os dois itens devolvidos somam o total', () => {
  const repetida = planoDoReembolso(
    { ...COBRANCA, amount_refunded: 15400 },
    [reembolso('re_2', 15400, 'ON-ABC234')],
    VOUCHERS,
    'pi_3Teste1',
    15400,
  );
  assert.equal(repetida.novoCentavos, 0);
  assert.equal(repetida.evento, null);
  const tudo = planoDoReembolso(
    { ...COBRANCA, amount_refunded: 95400, refunded: true },
    [reembolso('re_2', 15400, 'ON-ABC234'), reembolso('re_5', 80000, 'ON-DEF456')],
    VOUCHERS,
    'pi_3Teste1',
    15400,
  );
  assert.equal(tudo.total, true);
  assert.equal(tudo.novoCentavos, 80000);
  assert.equal(tudo.itens.length, 2);
});

test('a devolução de um pagamento repetido (duas abas) não mexe no pedido: só entra no histórico', () => {
  const plano = planoDoReembolso(
    { ...COBRANCA, id: 'ch_2', amount_refunded: 95400, refunded: true, payment_intent: 'pi_OUTRO' },
    [],
    VOUCHERS,
    'pi_3Teste1',
    0,
  );
  assert.equal(plano.doPedido, false);
  assert.equal(plano.total, false);
  assert.equal(plano.novoCentavos, 0);
  assert.equal(plano.evento, `Pagamento repetido (pi_OUTRO) devolvido ao cliente pela Stripe: ${cifra(95400)}`);
  // sem o pagamento gravado no pedido, a cobrança é tida como a dele
  assert.equal(planoDoReembolso({ ...COBRANCA, amount_refunded: 100 }, [], VOUCHERS, undefined, 0).doPedido, true);
});

test('o reembolso que falhou vira um aviso para devolver por outro meio; os outros status não', () => {
  assert.equal(
    eventoDoReembolsoFalho({
      id: 're_9',
      amount: 15400,
      status: 'failed',
      failure_reason: 'expired_or_canceled_card',
      metadata: { referencia: 'ON-ABC234' },
    }),
    `Aviso: o reembolso do item ON-ABC234 de ${cifra(15400)} falhou na Stripe (re_9, expired_or_canceled_card): devolver por outro meio`,
  );
  assert.equal(
    eventoDoReembolsoFalho({ id: 're_8', amount: 95400, status: 'failed', metadata: { referencia: 'total' } }),
    `Aviso: o reembolso de ${cifra(95400)} falhou na Stripe (re_8, motivo não informado): devolver por outro meio`,
  );
  assert.equal(eventoDoReembolsoFalho({ id: 're_7', amount: 100, status: 'succeeded', metadata: null }), null);
  assert.equal(eventoDoReembolsoFalho({ id: 're_6', amount: 100, status: 'pending', metadata: null }), null);
});

test('a contestação: aberta → contestado; ganha → pago; perdida → reembolsado com o valor; alerta encerrado → pago', () => {
  const base = { id: 'dp_1', amount: 95400, reason: 'fraudulent' };
  for (const status of [
    'needs_response',
    'under_review',
    'warning_needs_response',
    'warning_under_review',
    'appeal_needs_response',
    'appeal_under_review',
  ]) {
    const l = leituraDaContestacao({ ...base, status: status as Stripe.Dispute.Status });
    assert.equal(l.status, 'contestado', status);
    assert.equal(l.evento, `Contestação aberta na Stripe (dp_1): ${cifra(95400)}, motivo "fraudulent"`);
  }
  assert.deepEqual(leituraDaContestacao({ ...base, status: 'won' }), {
    status: 'pago',
    evento: 'Contestação dp_1 ganha: o valor voltou para a conta',
  });
  assert.deepEqual(leituraDaContestacao({ ...base, status: 'lost' }), {
    status: 'reembolsado',
    reembolsoCentavos: 95400,
    evento: `Contestação dp_1 perdida: ${cifra(95400)} devolvidos ao cliente`,
  });
  assert.deepEqual(leituraDaContestacao({ ...base, status: 'warning_closed' }), {
    status: 'pago',
    evento: 'Alerta de contestação dp_1 encerrado sem disputa',
  });
  assert.deepEqual(leituraDaContestacao({ ...base, status: 'prevented' }), {
    status: 'pago',
    evento: 'Contestação dp_1 evitada pela Stripe',
  });
  assert.deepEqual(leituraDaContestacao({ ...base, status: 'coisa_nova' as Stripe.Dispute.Status }), {
    evento: 'Contestação dp_1: coisa_nova',
  });
});

/* ------------------------------------------------------------------ */
/* Os avisos em qualquer ordem: contestação e reembolsos (teste de 15/11) */

/** Uma linha do histórico, com a hora fictícia do segundo `n`. */
const linha = (evento: string, n = 0) => ({ em: `2026-11-16T00:53:${String(n).padStart(2, '0')}.000Z`, evento });

const DISPUTA = { id: 'dp_1', amount: 15400, reason: 'fraudulent', payment_intent: 'pi_A' };
const ABERTA = leituraDaContestacao({ ...DISPUTA, status: 'needs_response' });
const GANHA = leituraDaContestacao({ ...DISPUTA, status: 'won' });
const PERDIDA = leituraDaContestacao({ ...DISPUTA, status: 'lost' });

test('a contestação em qualquer ordem dá o mesmo pedido: o pago vira contestado, e o pendente pede o pago antes', () => {
  // o aviso de pago já tratado: o pedido pago vira contestado, com a linha
  const pago = { status: 'pago' as const, historico: [linha('Pago (webhook da Stripe)')] };
  assert.deepEqual(mudancaDaContestacao(pago, ABERTA, true, ABERTA.evento), { status: 'contestado', evento: ABERTA.evento });
  // a contestação primeiro: o pedido ainda espera pagamento, e o tratador faz antes o que o aviso de pago faria;
  // depois dele, a mesma mudança, e os dois pedidos terminam iguais (o status e as duas linhas, na mesma ordem)
  assert.equal(contestacaoPedePagoAntes({ status: 'pendente' }, ABERTA), true);
  assert.deepEqual(mudancaDaContestacao({ ...pago, historico: [linha('Pago (webhook da Stripe)', 1)] }, ABERTA, true, ABERTA.evento), {
    status: 'contestado',
    evento: ABERTA.evento,
  });
});

test('a contestação repetida não muda nada: aberta, ganha e perdida', () => {
  assert.equal(mudancaDaContestacao({ status: 'contestado', historico: [linha(ABERTA.evento)] }, ABERTA, true, ABERTA.evento), null);
  const ganha = { status: 'pago' as const, historico: [linha(ABERTA.evento), linha(GANHA.evento, 1)] };
  assert.equal(mudancaDaContestacao(ganha, GANHA, true, GANHA.evento), null);
  const perdida = { status: 'reembolsado' as const, reembolsoCentavos: 15400, historico: [linha(ABERTA.evento), linha(PERDIDA.evento, 1)] };
  assert.equal(mudancaDaContestacao(perdida, PERDIDA, true, PERDIDA.evento, 15400), null);
});

test('a linha já gravada não impede o conserto: a "Contestação aberta" anotada num pedido que ficou pago (ON-32HJXF)', () => {
  // a linha da contestação às 00:53:51,990 com o pedido ainda pendente, e o "Pago" às 00:53:52,134: a regra de antes
  // saía na linha já gravada, antes de olhar o status, e o pedido ficava pago com a contestação aberta
  const pedido = { status: 'pago' as const, historico: [linha(ABERTA.evento, 51), linha('Pago (webhook da Stripe)', 52)] };
  assert.deepEqual(mudancaDaContestacao(pedido, ABERTA, true, ABERTA.evento), { status: 'contestado' });
});

test('perdida ou ganha antes do aviso de pago também pede o pago antes; o pedido que não espera pagamento, não', () => {
  for (const leitura of [ABERTA, GANHA, PERDIDA]) {
    assert.equal(contestacaoPedePagoAntes({ status: 'pendente' }, leitura), true, leitura.evento);
    assert.equal(contestacaoPedePagoAntes({ status: 'expirado' }, leitura), true, leitura.evento);
    for (const status of ['pago', 'contestado', 'cancelado', 'reembolsado', 'aguardando_whatsapp', 'recusado'] as const)
      assert.equal(contestacaoPedePagoAntes({ status }, leitura), false, `${status}: ${leitura.evento}`);
  }
  // um status novo da Stripe, sem leitura de status, não pressupõe pagamento
  const nova = leituraDaContestacao({ ...DISPUTA, status: 'coisa_nova' as Stripe.Dispute.Status });
  assert.equal(contestacaoPedePagoAntes({ status: 'pendente' }, nova), false);
});

test('o pedido que ainda espera pagamento só ganha a linha: a contestação não o põe em pago nem grava valor devolvido', () => {
  // a sessão do pagamento não foi achada, não é do site ou não está paga: o pago só entra pela porta de sempre
  for (const status of ['needs_response', 'won', 'prevented', 'warning_closed', 'lost'] as const) {
    const leitura = leituraDaContestacao({ ...DISPUTA, status });
    for (const pedido of ['pendente', 'expirado'] as const)
      assert.deepEqual(
        mudancaDaContestacao({ status: pedido, historico: [] }, leitura, true, leitura.evento, 15400),
        { evento: leitura.evento },
        `${pedido}: ${status}`,
      );
  }
});

test('a contestação de outro pagamento do mesmo pedido: só a linha, uma vez', () => {
  const evento = `${ABERTA.evento} (pagamento repetido pi_B)`;
  const pedido = { status: 'pago' as const, historico: [linha('Pago (webhook da Stripe)')] };
  assert.deepEqual(mudancaDaContestacao(pedido, ABERTA, false, evento), { evento });
  const perdida = `${PERDIDA.evento} (pagamento repetido pi_B)`;
  assert.deepEqual(mudancaDaContestacao(pedido, PERDIDA, false, perdida, 15400), { evento: perdida });
  assert.equal(mudancaDaContestacao({ ...pedido, historico: [...pedido.historico, linha(evento, 1)] }, ABERTA, false, evento), null);
});

test('a perdida depois de um reembolso de parte soma ao que já voltou, limitada ao valor cobrado, e repetida não soma', () => {
  // o pedido de R$ 396,00 com R$ 154,00 já devolvidos: a contestação vem pelo resto (cartão 4000 0084 0000 0795)
  const doResto = leituraDaContestacao({ ...DISPUTA, amount: 24200, status: 'lost' });
  const pedido = { status: 'pago' as const, reembolsoCentavos: 15400, historico: [linha('Pago (webhook da Stripe)')] };
  // a regra de antes ficava com o maior dos dois (R$ 242,00); voltaram R$ 396,00
  assert.deepEqual(mudancaDaContestacao(pedido, doResto, true, doResto.evento, 39600), {
    status: 'reembolsado',
    reembolsoCentavos: 39600,
    evento: doResto.evento,
  });
  // limitada ao valor cobrado; sem ele, a soma
  const cheia = leituraDaContestacao({ ...DISPUTA, amount: 39600, status: 'lost' });
  assert.equal(mudancaDaContestacao(pedido, cheia, true, cheia.evento, 39600)?.reembolsoCentavos, 39600);
  assert.equal(mudancaDaContestacao(pedido, doResto, true, doResto.evento)?.reembolsoCentavos, 39600);
  // repetida (a linha já gravada): não soma de novo
  const depois = { status: 'reembolsado' as const, reembolsoCentavos: 39600, historico: [...pedido.historico, linha(doResto.evento, 1)] };
  assert.equal(mudancaDaContestacao(depois, doResto, true, doResto.evento, 39600), null);
  // o que o pedido já registra nunca desce
  assert.deepEqual(mudancaDaContestacao({ ...pedido, reembolsoCentavos: 50000 }, doResto, true, doResto.evento, 39600), {
    status: 'reembolsado',
    evento: doResto.evento,
  });
  // sem reembolso antes: o valor da contestação, como sempre
  assert.equal(
    mudancaDaContestacao({ status: 'contestado' as const, historico: [] }, cheia, true, cheia.evento, 39600)?.reembolsoCentavos,
    39600,
  );
});

/**
 * O pedido em memória e uma Stripe de mentira, para a sequência da contestação (aplicarContestacao) com as peças
 * passadas de fora. `aplicarPago` faz o que o aviso de pago faz com a sessão paga do pedido (aplicarSessao): o pendente
 * ou expirado vira pago, pedidoPago roda uma vez, e o contestado não volta a pago.
 */
function mundoDaContestacao(opcoes: { sessao?: string | null; sessaoDoSite?: boolean } = {}) {
  type Pedido = {
    codigo: string;
    status: string;
    paymentIntentId?: string;
    reembolsoCentavos?: number;
    historico: { em: string; evento: string }[];
  };
  const pedido: Pedido = { codigo: 'ON-32HJXF', status: 'pendente', historico: [linha('Reserva criada')] };
  let n = 0;
  let pagos = 0;
  const registrar = (r: Pedido, evento: string) => {
    r.historico = [...r.historico, linha(evento, ++n)];
    return r;
  };
  const gravar = async (_codigo: string, alterar: (r: Pedido) => Pedido | null) => {
    const nova = alterar(structuredClone(pedido));
    if (nova) Object.assign(pedido, nova);
    return structuredClone(pedido);
  };
  const avisoDePago = () =>
    gravar(pedido.codigo, (r) => {
      if (r.status === 'contestado' || !podeMudar(r.status as never, 'pago')) return null;
      r.status = 'pago';
      r.paymentIntentId = 'pi_A';
      pagos += 1;
      return registrar(r, 'Pago (webhook da Stripe)');
    });
  const chamadas: string[] = [];
  const passos = {
    lerPedido: async () => structuredClone(pedido),
    acharSessao: async (pi: string) => {
      chamadas.push(`achar ${pi}`);
      return opcoes.sessao === undefined ? 'cs_A' : opcoes.sessao;
    },
    aplicarPago: async (sessaoId: string) => {
      chamadas.push(`pago ${sessaoId}`);
      // a sessão que o site não criou é ignorada pela porta de sempre
      if (opcoes.sessaoDoSite === false) return false;
      await avisoDePago();
      return true;
    },
    gravar,
    registrar,
  };
  return { pedido, passos, avisoDePago, chamadas, pagos: () => pagos };
}

test('as duas ordens, com as peças passadas de fora: contestação → pago e pago → contestação terminam iguais', async () => {
  const disputa = { ...DISPUTA, status: 'needs_response' as const };
  // a contestação tratada primeiro põe o pedido em dia pela porta do aviso de pago; o aviso de pago, depois, não muda nada
  const primeiro = mundoDaContestacao();
  // (o registro do servidor diz que o pagamento entrou pela contestação: é assim que a bancada acha a ordem trocada)
  assert.equal(
    await aplicarContestacao(primeiro.pedido.codigo, disputa, undefined, primeiro.passos as never),
    'contestação needs_response (o pago entrou antes, pela própria contestação)',
  );
  await primeiro.avisoDePago();
  // a ordem boa
  const segundo = mundoDaContestacao();
  await segundo.avisoDePago();
  assert.equal(await aplicarContestacao(segundo.pedido.codigo, disputa, undefined, segundo.passos as never), 'contestação needs_response');
  for (const m of [primeiro, segundo]) {
    assert.equal(m.pedido.status, 'contestado');
    assert.deepEqual(
      m.pedido.historico.map((h) => h.evento),
      ['Reserva criada', 'Pago (webhook da Stripe)', ABERTA.evento],
    );
    // o e-mail do pagamento aprovado e o aviso à Meta: uma vez só
    assert.equal(m.pagos(), 1);
  }
  // só a contestação que chegou cedo procurou a sessão do pagamento
  assert.deepEqual(primeiro.chamadas, ['achar pi_A', 'pago cs_A']);
  assert.deepEqual(segundo.chamadas, []);
  // a contestação entregue de novo não muda nada
  const antes = structuredClone(primeiro.pedido);
  await aplicarContestacao(primeiro.pedido.codigo, disputa, undefined, primeiro.passos as never);
  assert.deepEqual(primeiro.pedido, antes);
});

test('a perdida e a ganha tratadas antes do aviso de pago também passam pelo pago antes', async () => {
  const perdida = mundoDaContestacao();
  await aplicarContestacao(perdida.pedido.codigo, { ...DISPUTA, status: 'lost' as const }, 15400, perdida.passos as never);
  await perdida.avisoDePago();
  assert.equal(perdida.pedido.status, 'reembolsado');
  assert.equal(perdida.pedido.reembolsoCentavos, 15400);
  assert.deepEqual(
    perdida.pedido.historico.map((h) => h.evento),
    ['Reserva criada', 'Pago (webhook da Stripe)', PERDIDA.evento],
  );
  assert.equal(perdida.pagos(), 1);
  const ganha = mundoDaContestacao();
  await aplicarContestacao(ganha.pedido.codigo, { ...DISPUTA, status: 'won' as const }, undefined, ganha.passos as never);
  await ganha.avisoDePago();
  assert.equal(ganha.pedido.status, 'pago');
  assert.deepEqual(
    ganha.pedido.historico.map((h) => h.evento),
    ['Reserva criada', 'Pago (webhook da Stripe)', GANHA.evento],
  );
});

test('sessão que o site não criou, ou nenhuma: só a linha, sem erro; a sessão do pedido paga que o pedido não registra: erro', async () => {
  const disputa = { ...DISPUTA, status: 'needs_response' as const };
  for (const opcoes of [{ sessaoDoSite: false }, { sessao: null }]) {
    // a aberta, a ganha e a perdida: o pedido continua esperando pagamento, sem valor devolvido, só com a linha
    for (const [status, leitura] of [
      ['needs_response', ABERTA],
      ['won', GANHA],
      ['lost', PERDIDA],
    ] as const) {
      const m = mundoDaContestacao(opcoes);
      assert.equal(await aplicarContestacao(m.pedido.codigo, { ...disputa, status }, 15400, m.passos as never), `contestação ${status}`);
      assert.equal(m.pedido.status, 'pendente', status);
      assert.equal(m.pedido.reembolsoCentavos, undefined, status);
      assert.deepEqual(
        m.pedido.historico.map((h) => h.evento),
        ['Reserva criada', leitura.evento],
      );
      assert.equal(m.pagos(), 0);
    }
  }
  // a Stripe diz que a sessão do pedido está paga e o pedido continua esperando: nada gravado, e a rota responde 500
  // para a Stripe entregar de novo
  const preso = mundoDaContestacao();
  preso.passos.aplicarPago = async () => true;
  await assert.rejects(
    aplicarContestacao(preso.pedido.codigo, disputa, undefined, preso.passos as never),
    /contestação dp_1 de um pagamento que o pedido ON-32HJXF ainda não registra/,
  );
  assert.deepEqual(
    preso.pedido.historico.map((h) => h.evento),
    ['Reserva criada'],
  );
  // a contestação de outro pagamento do pedido já pago (duas abas): só a linha, e o pedido segue pago
  const outro = mundoDaContestacao();
  await outro.avisoDePago();
  await aplicarContestacao(outro.pedido.codigo, { ...disputa, payment_intent: 'pi_B' }, undefined, outro.passos as never);
  assert.equal(outro.pedido.status, 'pago');
  assert.equal(outro.pedido.historico.at(-1)?.evento, `${ABERTA.evento} (pagamento repetido pi_B)`);
  assert.deepEqual(outro.chamadas, []);
  // o pedido que não existe
  outro.passos.lerPedido = async () => null as never;
  assert.equal(await aplicarContestacao('ON-32HJXF', disputa, undefined, outro.passos as never), 'pedido não encontrado');
});

test('o que a Stripe tem como devolvido: o falho e o cancelado não contam, o pendente conta; só "menos" barra', () => {
  const lista = [
    reembolso('re_1', 15400, 'ON-ABC234'),
    reembolso('re_2', 24200, 'ON-DEF456', 'pending'),
    reembolso('re_3', 10000, 'total', 'failed'),
    reembolso('re_4', 5000, 'total', 'canceled'),
  ];
  assert.equal(devolvidoNaStripe(lista), 39600);
  assert.equal(devolvidoNaStripe([]), 0);
  // a Stripe com mais (o segundo clique antes do aviso) e igual: segue; com menos: o site não pede outro reembolso
  assert.equal(stripeDevolveuMenos(lista, 30000), false);
  assert.equal(stripeDevolveuMenos(lista, 39600), false);
  assert.equal(stripeDevolveuMenos(lista, 49600), true);
  // o ON-A8RVZN: o reembolso de R$ 242,00 falhou e o site registra R$ 242,00
  assert.equal(stripeDevolveuMenos([reembolso('re_5', 24200, 'ON-5F4U5U', 'failed')], 24200), true);
});

test('os reembolsos que o site não pediu: sem referência, vazia ou desconhecida; os do site, o falho e o cancelado ficam de fora', () => {
  assert.equal(REFERENCIA_DEVOLUCAO, 'pagamento-repetido');
  assert.deepEqual([...REFERENCIAS_DO_SITE].sort(), ['pagamento-repetido', 'total']);
  const lista = [
    reembolso('re_voucher', 15400, 'ON-ABC234'),
    reembolso('re_total', 95400, 'total'),
    reembolso('re_repetido', 95400, 'pagamento-repetido'),
    { id: 're_sem', amount: 100, status: 'succeeded', metadata: null },
    { id: 're_vazia', amount: 200, status: 'succeeded', metadata: {} },
    reembolso('re_estranha', 300, 'outra-coisa'),
    { id: 're_falho', amount: 400, status: 'failed', metadata: {} },
    { id: 're_cancelado', amount: 500, status: 'canceled', metadata: {} },
    { id: 're_pendente', amount: 600, status: 'pending', metadata: {} },
  ];
  assert.deepEqual(reembolsosForaDoSite(lista, VOUCHERS), [
    { reembolsoId: 're_sem', centavos: 100 },
    { reembolsoId: 're_vazia', centavos: 200 },
    { reembolsoId: 're_estranha', centavos: 300 },
    { reembolsoId: 're_pendente', centavos: 600 },
  ]);
});

test('o ON-4KPC6F: o reembolso feito na Stripe fica "fora do site" e vira um aviso, uma vez; o do painel marca o voucher', () => {
  const vouchers = ['ON-5ACEQS', 'ON-XTE5BZ'];
  const naStripe = { id: 're_3UcGFeAEba4R3ewo0e9zbHK3', amount: 15400, status: 'succeeded', metadata: {} };
  const peloPainel = reembolso('re_3UcGFeAEba4R3ewo0ae1yPVC', 15400, 'ON-XTE5BZ');
  const cobranca = { id: 'ch_4K', amount: 39600, amount_refunded: 30800, refunded: false, payment_intent: 'pi_4K' };
  const plano = planoDoReembolso(cobranca, [naStripe, peloPainel], vouchers, 'pi_4K', 15400);
  assert.deepEqual(plano.foraDoSite, [{ reembolsoId: naStripe.id, centavos: 15400 }]);
  assert.deepEqual(plano.itens, [{ voucher: 'ON-XTE5BZ', centavos: 15400, reembolsoId: peloPainel.id, pendente: false }]);
  // o aviso, uma vez por reembolso, só no pedido com vários itens
  const pedido = { historico: [linha('Pago (webhook da Stripe)')] };
  const avisos = avisosDeReembolsoSemVoucher(pedido, plano, 2);
  assert.deepEqual(avisos, [linhaDoReembolsoSemVoucher({ id: naStripe.id, centavos: 15400 })]);
  assert.deepEqual(reembolsosSemVoucher(avisos.map((a) => linha(a))), [{ id: naStripe.id, centavos: 15400, resolvido: false }]);
  assert.deepEqual(avisosDeReembolsoSemVoucher({ historico: [...pedido.historico, linha(avisos[0], 1)] }, plano, 2), []);
  assert.deepEqual(avisosDeReembolsoSemVoucher(pedido, plano, 1), []);
  // a cobrança de outro pagamento (o repetido devolvido): nada é "fora do site"
  const repetido = planoDoReembolso({ ...cobranca, payment_intent: 'pi_OUTRO' }, [naStripe], vouchers, 'pi_4K', 0);
  assert.deepEqual(repetido.foraDoSite, []);
  assert.deepEqual(avisosDeReembolsoSemVoucher(pedido, repetido, 2), []);
  // o "Reembolsar tudo" do painel depois do reembolso feito por fora não conta como fora do site, e o total não pergunta
  const tudo = planoDoReembolso(
    { ...cobranca, amount_refunded: 39600, refunded: true },
    [naStripe, peloPainel, reembolso('re_total', 9800, 'total')],
    vouchers,
    'pi_4K',
    30800,
  );
  assert.deepEqual(tudo.foraDoSite, [{ reembolsoId: naStripe.id, centavos: 15400 }]);
  assert.deepEqual(avisosDeReembolsoSemVoucher(pedido, tudo, 2), []);
});

test('o reembolso que falhou: a contestação com ele a caminho não manda devolver por fora; o pagamento repetido tem linha própria', () => {
  const base = { id: 're_9', amount: 15400, status: 'failed', metadata: { referencia: 'ON-ABC234' }, payment_intent: 'pi_3Teste1' };
  const disputado = eventoDoReembolsoFalho({ ...base, failure_reason: 'charge_for_pending_refund_disputed' }, 'pi_3Teste1');
  assert.equal(disputado, linhaDoReembolsoParadoPelaContestacao({ id: 're_9', centavos: 15400 }));
  assert.doesNotMatch(disputado ?? '', /: devolver por outro meio$/);
  assert.match(disputado ?? '', /não devolver por outro meio; aceitar ou responder a contestação no painel da Stripe$/);
  assert.deepEqual(reembolsosFalhos([linha(disputado ?? '')]), []);
  // de qualquer pagamento
  assert.equal(
    eventoDoReembolsoFalho({ ...base, failure_reason: 'charge_for_pending_refund_disputed', payment_intent: 'pi_OUTRO' }, 'pi_3Teste1'),
    disputado,
  );
  // a devolução de um pagamento repetido (outro pi_): outra linha, fora das contas do pedido
  const repetido = eventoDoReembolsoFalho(
    { ...base, metadata: { referencia: 'pagamento-repetido' }, failure_reason: 'expired_or_canceled_card', payment_intent: 'pi_OUTRO' },
    'pi_3Teste1',
  );
  assert.equal(
    repetido,
    linhaDaDevolucaoRepetidaQueFalhou({ id: 're_9', centavos: 15400, pagamento: 'pi_OUTRO', motivo: 'expired_or_canceled_card' }),
  );
  assert.deepEqual(reembolsosFalhos([linha(repetido ?? '')]), []);
  // a do pedido continua a de antes, e é diferente
  const doPedido = eventoDoReembolsoFalho({ ...base, failure_reason: 'expired_or_canceled_card' }, 'pi_3Teste1');
  assert.equal(doPedido, linhaDoReembolsoFalho({ id: 're_9', centavos: 15400, voucher: 'ON-ABC234', motivo: 'expired_or_canceled_card' }));
  assert.notEqual(repetido, doPedido);
  assert.equal(reembolsosFalhos([linha(doPedido ?? '')]).length, 1);
  // o pagamento expandido como objeto, ou o pedido sem pagamento gravado: a linha do pedido
  assert.equal(
    eventoDoReembolsoFalho(
      { ...base, failure_reason: 'expired_or_canceled_card', payment_intent: { id: 'pi_3Teste1' } as never },
      'pi_3Teste1',
    ),
    doPedido,
  );
  assert.equal(eventoDoReembolsoFalho({ ...base, failure_reason: 'expired_or_canceled_card', payment_intent: 'pi_OUTRO' }), doPedido);
});

test('o reembolso falho do site que chega antes do aviso dele: o que o charge.refunded teria aplicado, e uma vez só', () => {
  const pedido = { status: 'pago' as const, paymentIntentId: 'pi_X', historico: [linha('Pago (webhook da Stripe)')] };
  const vouchers = [{ codigo: 'ON-5F4U5U' }, { codigo: 'ON-J7W6WZ' }];
  // a cobrança de R$ 396,00 relida depois da falha: o reembolso falho já não conta em amount_refunded
  const cobranca = { amount: 39600, amount_refunded: 0 };
  const doVoucher = { id: 're_V', amount: 24200, metadata: { referencia: 'ON-5F4U5U' }, payment_intent: 'pi_X' };
  const efeito = efeitoDoReembolsoDoSite(pedido, vouchers, doVoucher, cobranca);
  const aplicado = `Reembolso de ${cifra(24200)} (re_V) aplicado ao pedido pelo aviso de falha: o aviso do reembolso não tinha chegado`;
  assert.deepEqual(efeito, {
    pedido: { reembolsoCentavos: 24200, evento: aplicado },
    voucher: {
      codigo: 'ON-5F4U5U',
      evento: `Item ON-5F4U5U reembolsado (${cifra(24200)}) pelo aviso de falha do reembolso (re_V): o aviso do reembolso não tinha chegado`,
    },
  });
  // a repetição depois de o pedido gravar e antes do voucher (a função cortada no meio): só o voucher, sem somar de novo
  const comLinha = { ...pedido, reembolsoCentavos: 24200, historico: [...pedido.historico, linha(aplicado, 1)] };
  assert.deepEqual(efeitoDoReembolsoDoSite(comLinha, vouchers, doVoucher, cobranca), { voucher: efeito?.voucher });
  // o charge.refunded que gravou o valor e caiu antes de marcar o voucher: só o voucher, nunca R$ 484,00
  assert.deepEqual(efeitoDoReembolsoDoSite({ ...pedido, reembolsoCentavos: 24200 }, vouchers, doVoucher, cobranca), {
    voucher: efeito?.voucher,
  });
  // o voucher já reembolsado (o charge.refunded tratado antes): nada
  assert.equal(
    efeitoDoReembolsoDoSite(pedido, [{ codigo: 'ON-5F4U5U', statusItem: 'reembolsado' as const }, vouchers[1]], doVoucher, cobranca),
    null,
  );
  // o último voucher: o outro (R$ 154,00) já voltou e este cobre o resto da cobrança: o pedido pago vira reembolsado, e
  // os vouchers seguem o pedido (como no reembolso total)
  const ultimo = [{ codigo: 'ON-5F4U5U' }, { codigo: 'ON-J7W6WZ', statusItem: 'reembolsado' as const }];
  const comOutro = { amount: 39600, amount_refunded: 15400 };
  assert.deepEqual(efeitoDoReembolsoDoSite({ ...pedido, reembolsoCentavos: 15400 }, ultimo, doVoucher, comOutro), {
    pedido: { status: 'reembolsado', reembolsoCentavos: 39600, evento: aplicado },
  });
  // ...e a linha já gravada não se repete
  assert.deepEqual(efeitoDoReembolsoDoSite({ ...comLinha, reembolsoCentavos: 15400 }, ultimo, doVoucher, comOutro), {
    pedido: { status: 'reembolsado', reembolsoCentavos: 39600 },
  });
  // o pedido contestado: o voucher e o valor, nunca o status (vale o que a contestação decidir); o reembolsado ou
  // cancelado inteiro: nada
  assert.deepEqual(efeitoDoReembolsoDoSite({ ...pedido, status: 'contestado', reembolsoCentavos: 15400 }, ultimo, doVoucher, comOutro), {
    pedido: { reembolsoCentavos: 39600, evento: aplicado },
    voucher: efeito?.voucher,
  });
  for (const status of ['reembolsado', 'cancelado'] as const)
    assert.equal(efeitoDoReembolsoDoSite({ ...pedido, status }, vouchers, doVoucher, cobranca), null);
  // limitado ao valor cobrado
  assert.equal(
    efeitoDoReembolsoDoSite(pedido, vouchers, doVoucher, { amount: 39600, amount_refunded: 30000 })?.pedido?.reembolsoCentavos,
    39600,
  );
  // "Reembolsar tudo" (o resto, R$ 242,00, depois de R$ 154,00): só com o pedido pago
  const tudo = { id: 're_T', amount: 24200, metadata: { referencia: 'total' }, payment_intent: 'pi_X' };
  const doTudo = {
    status: 'reembolsado',
    reembolsoCentavos: 39600,
    evento: `Reembolso de ${cifra(24200)} (re_T) aplicado ao pedido pelo aviso de falha: o aviso do reembolso não tinha chegado`,
  };
  assert.deepEqual(efeitoDoReembolsoDoSite({ ...pedido, reembolsoCentavos: 15400 }, vouchers, tudo, comOutro), { pedido: doTudo });
  for (const status of ['contestado', 'reembolsado'] as const)
    assert.equal(efeitoDoReembolsoDoSite({ ...pedido, status }, vouchers, tudo, comOutro), null);
  // a linha do painel que pediu o reembolso também traz o id, mas não conta como aplicado
  const pedido2 = {
    ...pedido,
    reembolsoCentavos: 15400,
    historico: [
      ...pedido.historico,
      linha(`Reembolso total (${cifra(24200)}) solicitado na Stripe (re_T): o status muda quando a Stripe confirmar`, 1),
    ],
  };
  assert.deepEqual(efeitoDoReembolsoDoSite(pedido2, vouchers, tudo, comOutro), { pedido: doTudo });
  // não é do site, ou é de outro pagamento: nada
  for (const re of [
    { ...tudo, metadata: {} },
    { ...tudo, metadata: null },
    { ...tudo, metadata: { referencia: 'pagamento-repetido' } },
    { ...tudo, metadata: { referencia: 'ON-OUTRO2' } },
    { ...tudo, payment_intent: 'pi_OUTRO' },
    { ...doVoucher, payment_intent: 'pi_OUTRO' },
  ])
    assert.equal(efeitoDoReembolsoDoSite(pedido, vouchers, re, cobranca), null, JSON.stringify(re));
});

/**
 * Um pedido de dois itens (R$ 396,00 no cartão) em memória e os reembolsos pedidos pelo painel: os dois avisos tratados
 * com as regras da rota (route.ts: cobrancaReembolsada e reembolsoFalhou, conferidas por leitura no teste de baixo),
 * na ordem que a Stripe entregar. A cobrança relida conta os reembolsos em vigor (amount_refunded), e o refund.failed
 * a recebe como a rota (charges.retrieve).
 */
function mundoDoReembolso() {
  type Reembolso = {
    id: string;
    amount: number;
    status: string;
    failure_reason?: string;
    metadata: { referencia: string };
    payment_intent: string;
  };
  const m = {
    pedido: {
      status: 'pago' as string,
      paymentIntentId: 'pi_X',
      reembolsoCentavos: undefined as number | undefined,
      historico: [linha('Pago (webhook da Stripe)')],
    },
    vouchers: [
      { codigo: 'ON-5F4U5U', statusItem: undefined as string | undefined },
      { codigo: 'ON-J7W6WZ', statusItem: undefined as string | undefined },
    ],
    reembolsos: [] as Reembolso[],
  };
  let n = 0;
  const registrar = (evento: string) => m.pedido.historico.push(linha(evento, ++n));
  const marcar = (voucher: string, evento: string) => {
    const v = m.vouchers.find((o) => o.codigo === voucher);
    if (v) v.statusItem = 'reembolsado';
    registrar(evento);
  };
  const cobranca = () => {
    const devolvido = devolvidoNaStripe(m.reembolsos);
    return { id: 'ch_X', amount: 39600, amount_refunded: devolvido, refunded: devolvido >= 39600, payment_intent: 'pi_X' };
  };
  // o painel pede um reembolso: com o cartão 4000 0000 0000 5126 ele nasce a caminho
  const pedir = (id: string, amount: number, referencia: string, status = 'pending') => {
    const re: Reembolso = { id, amount, status, metadata: { referencia }, payment_intent: 'pi_X' };
    m.reembolsos.push(re);
    return re;
  };
  // charge.refunded: a cobrança relida; `cair`: o atualizar_item falha depois de gravar o valor (500, a Stripe reenvia)
  const avisoDaCobranca = (cair = false) => {
    const codigos = m.vouchers.map((v) => v.codigo);
    const plano = planoDoReembolso(cobranca(), m.reembolsos, codigos, m.pedido.paymentIntentId, m.pedido.reembolsoCentavos ?? 0);
    const mudanca = mudancaDoReembolso(m.pedido as never, plano);
    if (mudanca) {
      if (mudanca.reembolsoCentavos !== undefined) m.pedido.reembolsoCentavos = mudanca.reembolsoCentavos;
      if (mudanca.status) m.pedido.status = mudanca.status;
      registrar(mudanca.evento);
    }
    if (cair) return;
    for (const item of itensParaMarcar(plano, m.vouchers as never)) marcar(item.voucher, eventoDoItemReembolsado(item));
    for (const aviso of avisosDeReembolsoSemVoucher(m.pedido, plano, m.vouchers.length)) registrar(aviso);
  };
  // refund.failed: o reembolso e a cobrança relidos
  const avisoDaFalha = (re: Reembolso) => {
    const evento = eventoDoReembolsoFalho(re, m.pedido.paymentIntentId);
    if (!evento) return;
    const efeito = efeitoDoReembolsoDoSite(m.pedido as never, m.vouchers as never, re, cobranca());
    const anotado = m.pedido.historico.some((h) => h.evento === evento);
    if (efeito?.pedido) {
      m.pedido.reembolsoCentavos = efeito.pedido.reembolsoCentavos;
      if (efeito.pedido.status) m.pedido.status = efeito.pedido.status;
      if (efeito.pedido.evento) registrar(efeito.pedido.evento);
    }
    if (!anotado) registrar(evento);
    if (efeito?.voucher) marcar(efeito.voucher.codigo, efeito.voucher.evento);
  };
  // o 5126: minutos depois, o reembolso falha
  const falhar = (re: Reembolso) => {
    re.status = 'failed';
    re.failure_reason = 'expired_or_canceled_card';
  };
  // os dois avisos entregues de novo: o refund.failed de cada reembolso (a rota ignora o que não falhou) e o charge.refunded
  const repetir = () => {
    for (const re of m.reembolsos) avisoDaFalha(re);
    avisoDaCobranca();
  };
  return { m, pedir, avisoDaCobranca, avisoDaFalha, falhar, repetir };
}

test('as duas ordens dos avisos de reembolso (refund.failed antes e depois do charge.refunded) terminam no mesmo pedido', () => {
  type Mundo = ReturnType<typeof mundoDoReembolso>;
  const estado = ({ m }: Mundo) => {
    const falhos = reembolsosFalhos(m.pedido.historico);
    return {
      status: m.pedido.status,
      reembolsoCentavos: m.pedido.reembolsoCentavos,
      vouchers: m.vouchers.map((v) => v.statusItem ?? 'segue o pedido'),
      falhos,
      partes: partesDoReembolso(m.pedido.reembolsoCentavos ?? 0, falhos),
    };
  };
  /**
   * O reembolso que falha, nas duas ordens: a de sempre (o charge.refunded com ele a caminho e, minutos depois, a
   * falha) e a trocada (o reembolso já tinha falhado quando o charge.refunded, que voltou pelo reenvio, foi tratado).
   * `cair`: na trocada, o charge.refunded gravou o valor e caiu antes de marcar o voucher.
   */
  const umQueFalha = (w: Mundo, trocada: boolean, re: ReturnType<Mundo['pedir']>, cair = false) => {
    if (!trocada) {
      w.avisoDaCobranca();
      w.falhar(re);
      w.avisoDaFalha(re);
      return;
    }
    if (cair) w.avisoDaCobranca(true);
    w.falhar(re);
    w.avisoDaFalha(re);
    w.avisoDaCobranca();
  };
  const roteiros: [string, (w: Mundo, trocada: boolean) => void, Omit<ReturnType<typeof estado>, 'falhos'>][] = [
    [
      'o pedido inteiro',
      (w, t) => umQueFalha(w, t, w.pedir('re_R', 39600, 'total')),
      {
        status: 'reembolsado',
        reembolsoCentavos: 39600,
        vouchers: ['segue o pedido', 'segue o pedido'],
        partes: { originalCentavos: 0, pendenteCentavos: 39600, outroMeioCentavos: 0 },
      },
    ],
    [
      'um voucher',
      (w, t) => umQueFalha(w, t, w.pedir('re_R', 24200, 'ON-5F4U5U')),
      {
        status: 'pago',
        reembolsoCentavos: 24200,
        vouchers: ['reembolsado', 'segue o pedido'],
        partes: { originalCentavos: 0, pendenteCentavos: 24200, outroMeioCentavos: 0 },
      },
    ],
    [
      // o ON-J7W6WZ (R$ 154,00) voltou; o reembolso do ON-5F4U5U (R$ 242,00), o resto da cobrança, falha
      'o último voucher',
      (w, t) => {
        w.pedir('re_J', 15400, 'ON-J7W6WZ', 'succeeded');
        w.avisoDaCobranca();
        umQueFalha(w, t, w.pedir('re_R', 24200, 'ON-5F4U5U'));
      },
      {
        status: 'reembolsado',
        reembolsoCentavos: 39600,
        vouchers: ['segue o pedido', 'reembolsado'],
        partes: { originalCentavos: 15400, pendenteCentavos: 24200, outroMeioCentavos: 0 },
      },
    ],
    [
      // na trocada, o refund.failed chega antes do reenvio do charge.refunded que caiu: R$ 242,00, nunca R$ 484,00
      'o charge.refunded caído no meio',
      (w, t) => umQueFalha(w, t, w.pedir('re_R', 24200, 'ON-5F4U5U'), true),
      {
        status: 'pago',
        reembolsoCentavos: 24200,
        vouchers: ['reembolsado', 'segue o pedido'],
        partes: { originalCentavos: 0, pendenteCentavos: 24200, outroMeioCentavos: 0 },
      },
    ],
  ];
  for (const [nome, roteiro, esperado] of roteiros) {
    const normal = mundoDoReembolso();
    roteiro(normal, false);
    const trocada = mundoDoReembolso();
    roteiro(trocada, true);
    assert.deepEqual(estado(trocada), estado(normal), nome);
    const { falhos, ...e } = estado(normal);
    assert.deepEqual(e, esperado, nome);
    assert.deepEqual(
      falhos.map((f) => [f.id, f.centavos]),
      [['re_R', esperado.partes.pendenteCentavos]],
      nome,
    );
    for (const w of [normal, trocada]) {
      // os dois avisos entregues de novo não mudam nada
      const antes = structuredClone(w.m);
      w.repetir();
      assert.deepEqual(w.m, antes, nome);
      // o aviso da falha, uma vez, nas duas ordens
      assert.equal(w.m.pedido.historico.filter((h) => h.evento.startsWith('Aviso: o reembolso')).length, 1, nome);
    }
  }
});

/** O código de um arquivo de src/, sem as linhas de comentário. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

/** O corpo de uma função da rota, até a função seguinte. */
function funcao(fonte: string, nome: string): string {
  const inicio = fonte.indexOf(`async function ${nome}(`);
  assert.notEqual(inicio, -1, nome);
  const fim = fonte.indexOf('\nasync function ', inicio + 1);
  return fonte.slice(inicio, fim === -1 ? undefined : fim);
}

test('a rota: a contestação passa pela porta de sempre, e os reembolsos usam as regras puras de eventos.ts', () => {
  const rota = codigo('app', 'api', 'webhooks', 'stripe', 'route.ts');
  // a contestação: a sequência de eventos.ts com as peças de verdade (o banco, a sessão na Stripe, sessaoMudou)
  const contestacao = funcao(rota, 'contestacao');
  for (const peca of [
    /aplicarContestacao\(codigo, atual, cobradoCentavos, \{/,
    /lerPedido: obterReservaDoPedido,/,
    /acharSessao: sessaoDoPagamento,/,
    /aplicarPago: async \(sessaoId, paymentIntentId\) =>\s+\(await sessaoMudou\(\{ tipo: 'checkout\.session\.completed', objeto: 'checkout\.session', id: sessaoId, codigo, paymentIntentId \}\)\)\s+\.pagaDoPedido,/,
    /gravar: atualizarReserva,\s+registrar,\s+\}\);/,
  ])
    assert.match(contestacao, peca);
  // a regra de antes (sair na linha já gravada, antes de olhar o status) não está mais na rota
  assert.doesNotMatch(contestacao, /podeMudar\(|historico\.some\(/);
  // sessaoMudou só dá a sessão como paga do pedido depois de conferir que o site a criou e de passar por aplicarSessao
  const sessao = funcao(rota, 'sessaoMudou');
  const doSite = sessao.indexOf('if (!sessaoDoPedido(sessao, ');
  const aplicar = sessao.indexOf("await aplicarSessao(codigo, sessao, 'webhook')");
  const paga = sessao.indexOf("const pagaDoPedido = leitura.status === 'pago';");
  assert.ok(doSite !== -1 && doSite < aplicar && aplicar < paga, `${doSite} ${aplicar} ${paga}`);
  // a resposta do evento da sessão continua só com o código e o resultado
  assert.match(rota, /const \{ codigo, resultado \} = await sessaoMudou\(alvo\);\s+return \{ codigo, resultado \};/);

  // eventos.ts: acha a sessão, aplica o pago, relê o pedido, e só então decide o erro e grava a contestação
  const eventos = codigo('app', 'api', 'webhooks', 'stripe', 'eventos.ts');
  const sequencia = eventos.slice(eventos.indexOf('export async function aplicarContestacao<'));
  const achar = sequencia.indexOf('await passos.acharSessao(pi)');
  const pago = sequencia.indexOf('await passos.aplicarPago(sessaoId, pi)');
  const relido = sequencia.indexOf('await passos.lerPedido(codigo)', pago);
  const erro = sequencia.indexOf('throw new Error(');
  const grava = sequencia.indexOf('await passos.gravar(');
  assert.ok(achar !== -1 && achar < pago && pago < relido && relido < erro && erro < grava, `${achar} ${pago} ${relido} ${erro} ${grava}`);
  assert.match(sequencia, /if \(pagaDoPedido && podeAbrirSessao\(alvo\.status\)\) \{\s+throw new Error\(/);

  // o reembolso que falhou: a cobrança relida uma vez, já sabendo da falha; o efeito do reembolso do site (com ela) e a
  // linha na mesma gravação, e depois o voucher
  const falhou = funcao(rota, 'reembolsoFalhou');
  assert.match(falhou, /const evento = eventoDoReembolsoFalho\(atual, alvo\.paymentIntentId\);/);
  const falho = falhou.indexOf("if (!evento) return { codigo, resultado: 'o reembolso não está falho na Stripe: ignorado' };");
  const relida = falhou.indexOf('const cobranca = idDaCobranca ? await stripe().charges.retrieve(idDaCobranca) : null;');
  const gravacao = falhou.indexOf('await atualizarReserva(alvo.codigo, (r) => {');
  const efeito = falhou.indexOf('const efeito = cobranca ? efeitoDoReembolsoDoSite(r, vouchers, atual, cobranca) : null;');
  const aviso = falhou.indexOf('return anotado ? r : registrar(r, evento);');
  const voucher = falhou.indexOf("await atualizarItem(voucher.codigo, 'reembolsado', voucher.evento);");
  assert.ok(
    falho !== -1 && falho < relida && relida < gravacao && gravacao < efeito && efeito < aviso && aviso < voucher,
    `${falho} ${relida} ${gravacao} ${efeito} ${aviso} ${voucher}`,
  );
  assert.match(falhou, /const idDaCobranca = idDe\(atual\.charge\);/);
  assert.equal(falhou.match(/charges\.retrieve\(/g)?.length, 1);
  assert.match(falhou, /if \(efeito\.pedido\.evento\) registrar\(r, efeito\.pedido\.evento\);/);
  // a cobrança reembolsada: as mesmas regras do teste das duas ordens, e o aviso sem voucher com a conferência na trava
  const cobranca = funcao(rota, 'cobrancaReembolsada');
  assert.match(cobranca, /const m = mudancaDoReembolso\(r, plano\);/);
  assert.match(
    cobranca,
    /for \(const item of itensParaMarcar\(plano, vouchers\)\) \{\s+await atualizarItem\(item\.voucher, 'reembolsado', eventoDoItemReembolsado\(item\)\);/,
  );
  assert.match(cobranca, /const faltam = avisosDeReembolsoSemVoucher\(r, plano, vouchers\.length\);/);
  // a referência da devolução de um pagamento repetido mora em eventos.ts, junto das outras do site
  assert.doesNotMatch(rota, /const REFERENCIA_DEVOLUCAO/);
  assert.match(rota, /criarReembolso\(pi, undefined, REFERENCIA_DEVOLUCAO\)/);
  const stripe = codigo('lib', 'stripe.ts');
  assert.match(stripe, /referencia: string = centavos === undefined \? 'total' : String\(centavos\)/);
  // a sessão do pagamento contestado: uma leitura (GET) em Checkout Sessions
  assert.match(stripe, /stripe\(\)\.checkout\.sessions\.list\(\{ payment_intent: paymentIntentId, limit: 1 \}\)/);
});
