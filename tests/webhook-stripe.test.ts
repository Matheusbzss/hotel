import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {
  TIPOS_TRATADOS,
  alvoDoEvento,
  codigoDaMetadata,
  ehTipoTratado,
  eventoDoItemReembolsado,
  eventoDoReembolsoFalho,
  idDe,
  leituraDaContestacao,
  pagamentoParaDevolver,
  planoDoReembolso,
  reembolsoEmVigor,
  resumoDoEvento,
} from '../src/app/api/webhooks/stripe/eventos.ts';
import { formatarCifra } from '../src/lib/cifra.ts';

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

test('os nove eventos que o destino assina, e nada mais', () => {
  assert.equal(TIPOS_TRATADOS.length, 9);
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
