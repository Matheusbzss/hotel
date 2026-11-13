import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Stripe from 'stripe';
import {
  PIX_EXPIRA_SEGUNDOS,
  PixForaDoPrazo,
  VALIDADE_SESSAO_MINUTOS,
  linkPainelStripe,
  localeStripe,
  modoStripe,
  nomeDoItem,
  parametrosDaSessao,
  stripeConfigurado,
  type DadosDaSessao,
} from '../src/lib/stripe.ts';
import { validadeDoPix } from '../src/lib/formas-pagamento.ts';
import {
  EVENTO_EM_ANDAMENTO_MS,
  concluirEventoStripe,
  entregaRepetida,
  esquecerEventoStripe,
  interpretarSessao,
  pagamentoAMais,
  podeAbrirSessao,
  podeMudar,
  proximaTentativa,
  registrarEventoStripe,
  sessaoNovaNoPedido,
  zerarEventosEmMemoria,
} from '../src/lib/pagamento-stripe.ts';
import { CHAVES_RECUSA, chaveDaRecusa, mostrarDicaInternacional } from '../src/lib/recusas.ts';
import type { Reserva, StatusReserva } from '../src/lib/reservas.ts';

// Nada aqui chama a Stripe nem o banco: as sessões são exemplos em JSON com os campos do SDK, e os eventos
// ficam em memória (sem o endereço do Supabase o banco nem é carregado).
delete process.env.SUPABASE_URL;

const AGORA = new Date('2026-11-09T15:00:00Z');

/** Roda com variáveis de ambiente de teste e devolve tudo como estava (as chaves aqui são inventadas). */
function comAmbiente(vars: Record<string, string | undefined>, fazer: () => void) {
  const antes = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const aplicar = (valores: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(valores)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  aplicar(vars);
  try {
    fazer();
  } finally {
    aplicar(antes);
  }
}

test('o modo da Stripe sai do prefixo da chave, sem mostrar o valor', () => {
  comAmbiente({ STRIPE_SECRET_KEY: undefined, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined }, () => {
    assert.equal(modoStripe(), 'desligado');
    assert.equal(stripeConfigurado(), false);
  });
  comAmbiente({ STRIPE_SECRET_KEY: 'rk_test_chave_de_exemplo', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined }, () => {
    assert.equal(modoStripe(), 'teste');
    // sem a chave pública o checkout embutido não monta: ainda não está configurada
    assert.equal(stripeConfigurado(), false);
  });
  comAmbiente({ STRIPE_SECRET_KEY: 'sk_test_chave_de_exemplo', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_exemplo' }, () => {
    assert.equal(modoStripe(), 'teste');
    assert.equal(stripeConfigurado(), true);
  });
  comAmbiente({ STRIPE_SECRET_KEY: 'rk_live_chave_de_exemplo', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_exemplo' }, () => {
    assert.equal(modoStripe(), 'producao');
  });
  comAmbiente({ STRIPE_SECRET_KEY: 'sk_live_chave_de_exemplo' }, () => assert.equal(modoStripe(), 'producao'));
});

test('o idioma da tela da Stripe: pt-BR, en e espanhol da América Latina para as duas versões do espanhol', () => {
  assert.equal(localeStripe('pt'), 'pt-BR');
  assert.equal(localeStripe('en'), 'en');
  assert.equal(localeStripe('es'), 'es-419');
  assert.equal(localeStripe('es-ar'), 'es-419');
});

test('o link para o painel da Stripe, em teste e em produção', () => {
  assert.equal(linkPainelStripe('pi_3Abc', 'teste'), 'https://dashboard.stripe.com/test/payments/pi_3Abc');
  assert.equal(linkPainelStripe('pi_3Abc', 'producao'), 'https://dashboard.stripe.com/payments/pi_3Abc');
  assert.equal(linkPainelStripe('ch_3Abc', 'producao'), 'https://dashboard.stripe.com/payments/ch_3Abc');
  assert.equal(linkPainelStripe('cs_test_a1', 'teste'), 'https://dashboard.stripe.com/test/search?query=cs_test_a1');
  assert.equal(linkPainelStripe('cs_live_a1', 'desligado'), 'https://dashboard.stripe.com/test/search?query=cs_live_a1');
});

const ESCUNA = { pt: 'Passeio de Escuna em Búzios', en: 'Schooner Tour in Búzios', es: 'Paseo en Goleta en Búzios' };

const DADOS: DadosDaSessao = {
  pedido: { codigo: 'ON-ABC123', email: 'teste@exemplo.com' },
  itens: [
    {
      voucher: 'ON-ABC123',
      nome: ESCUNA,
      tipo: 'passeio',
      descricao: 'sáb. 14 nov · 9 h · 2 adultos',
      totalCentavos: 15400,
      totalPixCentavos: 13860,
      data: '2026-11-14',
      horario: { hora: '09:00' },
    },
    {
      voucher: 'ON-DEF456',
      nome: 'Transfer privado',
      tipo: 'transfer',
      totalCentavos: 80000,
      totalPixCentavos: 72000,
      data: '2026-12-01',
      transfer: { ida: { hora: '14:00' } },
    },
  ],
  forma: 'cartao',
  idioma: 'es-ar',
  returnUrl: 'https://orlanativa.online/es-ar/pedido/ON-ABC123?t=TOKEN',
  tentativa: 1,
  agora: AGORA,
};

test('o nome do item vai no idioma do cliente (es-ar lê o espanhol), ou já traduzido', () => {
  assert.equal(nomeDoItem(DADOS.itens[0], 'es-ar'), 'Paseo en Goleta en Búzios');
  assert.equal(nomeDoItem(DADOS.itens[0], 'en'), 'Schooner Tour in Búzios');
  assert.equal(nomeDoItem(DADOS.itens[1], 'pt'), 'Transfer privado');
});

test('a sessão do cartão: embutida, um item por voucher no cartão, só cartão, 30 minutos e o código na fatura', () => {
  const p = parametrosDaSessao(DADOS);
  assert.equal(p.ui_mode, 'embedded_page');
  assert.equal(p.mode, 'payment');
  assert.equal(p.currency, 'brl');
  assert.equal(p.line_items?.length, 2);
  assert.deepEqual(
    p.line_items?.map((l) => [l.quantity, l.price_data?.currency, l.price_data?.unit_amount, l.price_data?.product_data?.name]),
    [
      [1, 'brl', 15400, 'Paseo en Goleta en Búzios'],
      [1, 'brl', 80000, 'Transfer privado'],
    ],
  );
  assert.equal(p.line_items?.[0].price_data?.product_data?.description, 'sáb. 14 nov · 9 h · 2 adultos');
  assert.deepEqual(p.line_items?.[1].price_data?.product_data?.metadata, { voucher: 'ON-DEF456' });
  assert.deepEqual(p.allowed_payment_method_types, ['card']);
  assert.equal(p.locale, 'es-419');
  assert.equal(p.customer_email, 'teste@exemplo.com');
  assert.equal(p.client_reference_id, 'ON-ABC123');
  assert.deepEqual(p.metadata, { codigo: 'ON-ABC123', vouchers: 'ON-ABC123,ON-DEF456', idioma: 'es-ar', forma: 'cartao' });
  // o PaymentIntent não herda a metadata da sessão; e a fatura mostra "ORLANATIVA* ON-ABC123"
  assert.deepEqual(p.payment_intent_data, { metadata: { codigo: 'ON-ABC123' }, statement_descriptor_suffix: 'ON-ABC123' });
  assert.equal(p.payment_method_options, undefined);
  const segundos = (p.expires_at ?? 0) - Math.floor(AGORA.getTime() / 1000);
  assert.ok(segundos >= VALIDADE_SESSAO_MINUTOS * 60 && segundos <= VALIDADE_SESSAO_MINUTOS * 60 + 60, `expira em ${segundos} s`);
  assert.equal(p.return_url, DADOS.returnUrl);
  assert.equal(p.redirect_on_completion, 'if_required');
  assert.equal('success_url' in p, false);
  assert.equal('cancel_url' in p, false);
});

test('a sessão do Pix: os preços com o desconto, só Pix, QR de 30 minutos e sem nome na fatura', () => {
  const p = parametrosDaSessao({ ...DADOS, forma: 'pix', idioma: 'pt' });
  assert.deepEqual(
    p.line_items?.map((l) => l.price_data?.unit_amount),
    [13860, 72000],
  );
  assert.equal(p.line_items?.[0].price_data?.product_data?.name, 'Passeio de Escuna em Búzios');
  assert.deepEqual(p.allowed_payment_method_types, ['pix']);
  assert.equal(p.locale, 'pt-BR');
  assert.equal(p.metadata?.forma, 'pix');
  assert.deepEqual(p.payment_intent_data, { metadata: { codigo: 'ON-ABC123' } });
  assert.deepEqual(p.payment_method_options, { pix: { expires_after_seconds: PIX_EXPIRA_SEGUNDOS } });
  assert.equal(PIX_EXPIRA_SEGUNDOS, 30 * 60);
  // o QR e a sessão duram o mesmo tanto, longe do prazo do Pix
  assert.equal(PIX_EXPIRA_SEGUNDOS, VALIDADE_SESSAO_MINUTOS * 60);
});

test('perto do prazo do Pix, o QR dura só até ele: a sessão usa a mesma conta da tela (validadeDoPix)', () => {
  // AGORA é meio-dia em Búzios; o passeio das 14h25 tem o prazo do Pix às 12h25: o QR vale 25 minutos
  const perto = { ...DADOS.itens[0], data: '2026-11-09', horario: { hora: '14:25' } };
  const p = parametrosDaSessao({ ...DADOS, itens: [perto, DADOS.itens[1]], forma: 'pix' });
  assert.deepEqual(p.payment_method_options, { pix: { expires_after_seconds: 25 * 60 } });
  assert.equal(validadeDoPix([perto, DADOS.itens[1]], AGORA), 25 * 60);
  // a sessão continua com os 30 minutos (o mínimo da Stripe): o que encurta é o QR
  const segundos = (p.expires_at ?? 0) - Math.floor(AGORA.getTime() / 1000);
  assert.ok(segundos >= VALIDADE_SESSAO_MINUTOS * 60, `expira em ${segundos} s`);
  // o cartão não leva nada disso
  assert.equal(parametrosDaSessao({ ...DADOS, itens: [perto] }).payment_method_options, undefined);
});

test('fora do prazo do Pix (menos de 10 minutos de QR), a sessão do Pix não é criada; a do cartão é', () => {
  // o passeio das 14h05: o prazo do Pix é 12h05, e o QR teria só 5 minutos
  const tarde = { ...DADOS.itens[0], data: '2026-11-09', horario: { hora: '14:05' } };
  assert.throws(() => parametrosDaSessao({ ...DADOS, itens: [tarde], forma: 'pix' }), PixForaDoPrazo);
  assert.equal(parametrosDaSessao({ ...DADOS, itens: [tarde], forma: 'cartao' }).currency, 'brl');
  // um item sem data que dê para ler também não abre Pix
  const semData = { ...DADOS.itens[0], data: '' };
  assert.throws(() => parametrosDaSessao({ ...DADOS, itens: [semData], forma: 'pix' }), PixForaDoPrazo);
});

test('o Link fica escondido só na sessão do cartão; a do Pix não leva o campo, e Apple Pay e Google Pay seguem no "card"', () => {
  const cartao = parametrosDaSessao(DADOS);
  assert.deepEqual(cartao.wallet_options, { link: { display: 'never' } });
  // Apple Pay e Google Pay não têm campo próprio: vêm com "card", que continua igual
  assert.deepEqual(cartao.allowed_payment_method_types, ['card']);
  const pix = parametrosDaSessao({ ...DADOS, forma: 'pix' });
  assert.equal('wallet_options' in pix, false);
  assert.deepEqual(pix.allowed_payment_method_types, ['pix']);
});

test('a casa entra na sessão pelo sinal de 50%, sobre o total com o desconto no Pix', () => {
  const casa = {
    voucher: 'ON-CASA01',
    nome: 'Casa de teste',
    tipo: 'casa' as const,
    totalCentavos: 340000,
    totalPixCentavos: 306000,
    data: '2026-12-20',
  };
  assert.equal(parametrosDaSessao({ ...DADOS, itens: [casa] }).line_items?.[0].price_data?.unit_amount, 170000);
  assert.equal(parametrosDaSessao({ ...DADOS, itens: [casa], forma: 'pix' }).line_items?.[0].price_data?.unit_amount, 153000);
});

test('podeMudar: a tabela exata do desenho, e nada fora dela', () => {
  const TODOS: StatusReserva[] = [
    'pendente',
    'pago',
    'recusado',
    'cancelado',
    'expirado',
    'aguardando_whatsapp',
    'reembolsado',
    'contestado',
  ];
  const PERMITIDAS = new Set([
    'pendente>pago',
    'pendente>expirado',
    'pendente>cancelado',
    'expirado>pago',
    'expirado>pendente',
    'pago>reembolsado',
    'pago>contestado',
    'contestado>pago',
    'contestado>reembolsado',
  ]);
  for (const de of TODOS) for (const para of TODOS) assert.equal(podeMudar(de, para), PERMITIDAS.has(`${de}>${para}`), `${de} → ${para}`);
});

/** Uma sessão como a Stripe devolve (só os campos que a leitura usa), com o resto por cima. */
const sessao = (parcial: Record<string, unknown>) =>
  ({
    object: 'checkout.session',
    id: 'cs_test_a1b2c3',
    mode: 'payment',
    ui_mode: 'embedded_page',
    currency: 'brl',
    amount_total: 95400,
    created: 1794700000,
    expires_at: 1794701860,
    livemode: false,
    client_reference_id: 'ON-ABC123',
    metadata: { codigo: 'ON-ABC123', vouchers: 'ON-ABC123,ON-DEF456', idioma: 'es-ar', forma: 'cartao' },
    customer_details: null,
    payment_intent: null,
    status: 'open',
    payment_status: 'unpaid',
    ...parcial,
  }) as unknown as Stripe.Checkout.Session;

const CLIENTE_AR = {
  address: { city: 'Buenos Aires', country: 'AR', line1: null, line2: null, postal_code: null, state: null },
  business_name: null,
  email: 'teste@exemplo.com',
  individual_name: null,
  name: 'Teste',
  phone: null,
  tax_exempt: 'none',
  tax_ids: [],
};

const PI_CARTAO_PAGO = {
  id: 'pi_3Teste1',
  object: 'payment_intent',
  status: 'succeeded',
  created: 1794700100,
  amount: 95400,
  currency: 'brl',
  metadata: { codigo: 'ON-ABC123' },
  last_payment_error: null,
  latest_charge: {
    id: 'ch_3Teste1',
    object: 'charge',
    created: 1794700110,
    paid: true,
    refunded: false,
    amount: 95400,
    amount_refunded: 0,
    payment_method_details: { type: 'card', card: { brand: 'visa', last4: '4242', country: 'AR', funding: 'credit' } },
  },
};

test('cartão pago: pago, com bandeira, 4 dígitos, país do cartão, país do cliente e a moeda apresentada', () => {
  const l = interpretarSessao(
    sessao({
      status: 'complete',
      payment_status: 'paid',
      customer_details: CLIENTE_AR,
      presentment_details: { presentment_amount: 95400, presentment_currency: 'brl' },
      payment_intent: PI_CARTAO_PAGO,
    }),
  );
  assert.deepEqual(l, {
    sessaoId: 'cs_test_a1b2c3',
    paymentIntentId: 'pi_3Teste1',
    forma: 'cartao',
    valorCentavos: 95400,
    status: 'pago',
    pagoEm: new Date(1794700110 * 1000).toISOString(),
    cartao: { bandeira: 'visa', final: '4242', pais: 'AR' },
    apresentado: { moeda: 'BRL', valorCentavos: 95400 },
    clientePais: 'AR',
  });
});

test('cartão pago em pesos chilenos: a moeda apresentada guarda o que o cliente viu', () => {
  const l = interpretarSessao(
    sessao({
      status: 'complete',
      payment_status: 'paid',
      presentment_details: { presentment_amount: 170000, presentment_currency: 'clp' },
      payment_intent: { ...PI_CARTAO_PAGO, latest_charge: 'ch_3Teste1' },
    }),
  );
  assert.equal(l.status, 'pago');
  assert.deepEqual(l.apresentado, { moeda: 'CLP', valorCentavos: 170000 });
  // sem a cobrança expandida não há dados do cartão, e a hora do pagamento vem do PaymentIntent
  assert.equal(l.cartao, undefined);
  assert.equal(l.pagoEm, new Date(1794700100 * 1000).toISOString());
});

test('Pix gerado e ainda não pago: a sessão está completa, mas o pedido continua pendente', () => {
  const l = interpretarSessao(
    sessao({
      status: 'complete',
      payment_status: 'unpaid',
      metadata: { codigo: 'ON-ABC123', forma: 'pix', idioma: 'pt', vouchers: 'ON-ABC123' },
      payment_intent: { ...PI_CARTAO_PAGO, id: 'pi_3Pix1', status: 'requires_action', latest_charge: null },
    }),
  );
  assert.equal(l.status, 'pendente');
  assert.equal(l.forma, 'pix');
  assert.equal(l.paymentIntentId, 'pi_3Pix1');
  assert.equal(l.motivoCodigo, undefined);
});

test('Pix pago: pago, sem dados de cartão', () => {
  const l = interpretarSessao(
    sessao({
      status: 'complete',
      payment_status: 'paid',
      payment_intent: {
        ...PI_CARTAO_PAGO,
        id: 'pi_3Pix1',
        latest_charge: {
          ...PI_CARTAO_PAGO.latest_charge,
          payment_method_details: { type: 'pix', pix: { bank_transaction_id: 'E00000000202611091500ABC' } },
        },
      },
    }),
  );
  assert.equal(l.status, 'pago');
  assert.equal(l.cartao, undefined);
  assert.equal(l.paymentIntentId, 'pi_3Pix1');
});

test('Pix não pago no prazo: a sessão completa com o pagamento que falhou vira expirado', () => {
  const l = interpretarSessao(
    sessao({
      status: 'complete',
      payment_status: 'unpaid',
      payment_intent: { ...PI_CARTAO_PAGO, id: 'pi_3Pix1', status: 'requires_payment_method', latest_charge: null },
    }),
  );
  assert.equal(l.status, 'expirado');
  assert.equal(l.motivoCodigo, 'pix_expirado');
});

test('Pix não pago no prazo: o motivo é sempre pix_expirado, nunca o código de erro que a Stripe deixa no pagamento', () => {
  // o erro que fica no pagamento quando o QR vence: como motivo, cairia na recusa genérica do cartão
  const vencido = { type: 'invalid_request_error', code: 'payment_intent_payment_attempt_expired', message: 'Expired.' };
  // nem um erro com cara de recusa muda a leitura: sessão completa sem pagamento é sempre o Pix
  const comRecusa = { type: 'card_error', code: 'card_declined', decline_code: 'generic_decline', message: 'Declined.' };
  for (const status of ['requires_payment_method', 'canceled']) {
    for (const erro of [null, vencido, comRecusa]) {
      const l = interpretarSessao(
        sessao({
          status: 'complete',
          payment_status: 'unpaid',
          metadata: { codigo: 'ON-ABC123', forma: 'pix', idioma: 'pt', vouchers: 'ON-ABC123' },
          payment_intent: { ...PI_CARTAO_PAGO, id: 'pi_3Pix1', status, latest_charge: null, last_payment_error: erro },
        }),
      );
      const caso = `${status}, ${erro?.code ?? 'sem erro'}`;
      assert.equal(l.status, 'expirado', caso);
      assert.equal(l.motivoCodigo, 'pix_expirado', caso);
      assert.equal(l.forma, 'pix', caso);
      // a chave do texto que esse código cru daria na página do pedido
      if (erro) assert.equal(chaveDaRecusa(erro.code), 'generica', caso);
    }
  }
  // a sessão que venceu ainda aberta (ninguém gerou o Pix) continua levando a última recusa do cartão
  const aberta = interpretarSessao(
    sessao({
      status: 'expired',
      payment_status: 'unpaid',
      payment_intent: { ...PI_CARTAO_PAGO, status: 'requires_payment_method', latest_charge: null, last_payment_error: comRecusa },
    }),
  );
  assert.equal(aberta.status, 'expirado');
  assert.equal(aberta.motivoCodigo, 'generic_decline');
});

test('sessão vencida sem ninguém pagar: expirado, sem pagamento', () => {
  const l = interpretarSessao(sessao({ status: 'expired', payment_status: 'unpaid', payment_intent: null }));
  assert.equal(l.status, 'expirado');
  assert.equal(l.paymentIntentId, undefined);
  assert.equal(l.motivoCodigo, undefined);
});

test('sessão aberta com o cartão recusado: continua pendente e guarda o motivo da recusa', () => {
  const l = interpretarSessao(
    sessao({
      status: 'open',
      payment_status: 'unpaid',
      payment_intent: {
        ...PI_CARTAO_PAGO,
        status: 'requires_payment_method',
        latest_charge: 'ch_3Recusada',
        last_payment_error: {
          type: 'card_error',
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'Your card has insufficient funds.',
        },
      },
    }),
  );
  assert.equal(l.status, 'pendente');
  assert.equal(l.motivoCodigo, 'insufficient_funds');
  assert.equal(l.paymentIntentId, 'pi_3Teste1');
  // aberta sem nenhuma tentativa: pendente e nada mais
  assert.deepEqual(interpretarSessao(sessao({})), {
    sessaoId: 'cs_test_a1b2c3',
    forma: 'cartao',
    valorCentavos: 95400,
    status: 'pendente',
  });
});

test('o webhook processa cada evento uma vez só: a entrega repetida espera a primeira terminar e depois não muda nada', async () => {
  zerarEventosEmMemoria();
  const resumo = { sessao: 'cs_test_a1b2c3' };
  // a primeira entrega processa
  assert.equal(await registrarEventoStripe('evt_1', 'checkout.session.completed', 'ON-ABC123', resumo, AGORA), 'novo');
  // a mesma entrega de novo, com a primeira ainda trabalhando: a rota não responde 2xx e a Stripe tenta mais tarde
  const logoDepois = new Date(AGORA.getTime() + 5_000);
  assert.equal(await registrarEventoStripe('evt_1', 'checkout.session.completed', 'ON-ABC123', resumo, logoDepois), 'em-andamento');
  // a primeira terminou: daí em diante a entrega é repetida (200 e nada), por mais tempo que passe
  await concluirEventoStripe('evt_1', logoDepois);
  assert.equal(await registrarEventoStripe('evt_1', 'checkout.session.completed', 'ON-ABC123', resumo, logoDepois), 'repetido');
  const tresDiasDepois = new Date(AGORA.getTime() + 3 * 24 * 3_600_000);
  assert.equal(await registrarEventoStripe('evt_1', 'checkout.session.completed', 'ON-ABC123', resumo, tresDiasDepois), 'repetido');
  // outro evento é outro registro
  assert.equal(await registrarEventoStripe('evt_2', 'checkout.session.expired', null, undefined, logoDepois), 'novo');
});

test('a entrega cortada no meio é retomada depois de 2 minutos; antes disso a seguinte espera', async () => {
  zerarEventosEmMemoria();
  assert.equal(await registrarEventoStripe('evt_C', 'charge.refunded', 'ON-ABC123', undefined, AGORA), 'novo');
  // a função foi cortada antes de terminar: ninguém chamou concluirEventoStripe nem esquecerEventoStripe
  const quase = new Date(AGORA.getTime() + EVENTO_EM_ANDAMENTO_MS - 1);
  assert.equal(await registrarEventoStripe('evt_C', 'charge.refunded', 'ON-ABC123', undefined, quase), 'em-andamento');
  const noPrazo = new Date(AGORA.getTime() + EVENTO_EM_ANDAMENTO_MS);
  assert.equal(await registrarEventoStripe('evt_C', 'charge.refunded', 'ON-ABC123', undefined, noPrazo), 'novo');
  // quem retomou tem os seus 2 minutos: outra entrega logo em seguida espera por ela
  const logoDepois = new Date(noPrazo.getTime() + 1_000);
  assert.equal(await registrarEventoStripe('evt_C', 'charge.refunded', 'ON-ABC123', undefined, logoDepois), 'em-andamento');
  await concluirEventoStripe('evt_C', logoDepois);
  assert.equal(await registrarEventoStripe('evt_C', 'charge.refunded', 'ON-ABC123', undefined, logoDepois), 'repetido');
});

test('entrega repetida: processada, não muda nada; sem a marca, espera até 2 minutos e depois é retomada', () => {
  const recebidoEm = AGORA.getTime();
  assert.equal(entregaRepetida({ recebidoEm, processado: true }, recebidoEm), 'repetido');
  assert.equal(entregaRepetida({ recebidoEm, processado: true }, recebidoEm + 10 * EVENTO_EM_ANDAMENTO_MS), 'repetido');
  assert.equal(entregaRepetida({ recebidoEm, processado: false }, recebidoEm), 'em-andamento');
  assert.equal(entregaRepetida({ recebidoEm, processado: false }, recebidoEm + EVENTO_EM_ANDAMENTO_MS - 1), 'em-andamento');
  assert.equal(entregaRepetida({ recebidoEm, processado: false }, recebidoEm + EVENTO_EM_ANDAMENTO_MS), 'retomar');
  assert.equal(EVENTO_EM_ANDAMENTO_MS, 2 * 60_000);
});

test('o evento que falhou sai do registro sozinho: a nova tentativa é processada e os outros continuam repetidos', async () => {
  zerarEventosEmMemoria();
  assert.equal(await registrarEventoStripe('evt_A', 'checkout.session.completed', 'ON-ABC123', undefined, AGORA), 'novo');
  assert.equal(await registrarEventoStripe('evt_B', 'charge.refunded', 'ON-ABC123', undefined, AGORA), 'novo');
  await concluirEventoStripe('evt_B', AGORA);
  // o processamento de evt_A falhou: só ele é esquecido
  await esquecerEventoStripe('evt_A');
  assert.equal(await registrarEventoStripe('evt_B', 'charge.refunded', 'ON-ABC123', undefined, AGORA), 'repetido');
  // a nova tentativa é processada na hora, sem esperar os 2 minutos
  assert.equal(await registrarEventoStripe('evt_A', 'checkout.session.completed', 'ON-ABC123', undefined, AGORA), 'novo');
  // processado na nova tentativa, passa a contar como repetido
  await concluirEventoStripe('evt_A', AGORA);
  assert.equal(await registrarEventoStripe('evt_A', 'checkout.session.completed', 'ON-ABC123', undefined, AGORA), 'repetido');
  // esquecer ou concluir um evento que não estava registrado não muda nada
  await esquecerEventoStripe('evt_nunca_visto');
  await concluirEventoStripe('evt_nunca_visto', AGORA);
  assert.equal(await registrarEventoStripe('evt_B', 'charge.refunded', 'ON-ABC123', undefined, AGORA), 'repetido');
  assert.equal(await registrarEventoStripe('evt_nunca_visto', 'charge.refunded', null, undefined, AGORA), 'novo');
});

test('o motivo da recusa vira a chave do dicionário; fraude e cartão roubado ficam genéricos', () => {
  assert.equal(chaveDaRecusa('insufficient_funds'), 'saldo');
  assert.equal(chaveDaRecusa('card_velocity_exceeded'), 'saldo');
  assert.equal(chaveDaRecusa('withdrawal_count_limit_exceeded'), 'saldo');
  assert.equal(chaveDaRecusa('incorrect_cvc'), 'dados');
  assert.equal(chaveDaRecusa('incorrect_number'), 'dados');
  assert.equal(chaveDaRecusa('invalid_expiry_year'), 'dados');
  assert.equal(chaveDaRecusa('card_not_supported'), 'internacional');
  assert.equal(chaveDaRecusa('transaction_not_allowed'), 'internacional');
  assert.equal(chaveDaRecusa('currency_not_supported'), 'internacional');
  assert.equal(chaveDaRecusa('expired_card'), 'vencido');
  assert.equal(chaveDaRecusa('authentication_required'), 'autenticacao');
  for (const c of ['processing_error', 'issuer_not_available', 'try_again_later', 'reenter_transaction', 'approve_with_id']) {
    assert.equal(chaveDaRecusa(c), 'processamento', c);
  }
  for (const c of ['fraudulent', 'lost_card', 'stolen_card', 'merchant_blacklist', 'pickup_card', 'restricted_card']) {
    assert.equal(chaveDaRecusa(c), 'generica', c);
  }
  assert.equal(chaveDaRecusa('generic_decline'), 'generica');
  assert.equal(chaveDaRecusa('do_not_honor'), 'generica');
  assert.equal(chaveDaRecusa(undefined), 'generica');
  assert.equal(chaveDaRecusa(''), 'generica');
  assert.equal(new Set(CHAVES_RECUSA).size, 7);
});

test('a dica do cartão de fora acompanha toda recusa, menos a "internacional" (o motivo já diz o mesmo)', () => {
  // decisão do dono de 11/11: nessa recusa o motivo e a dica dizem quase a mesma coisa, então a dica some
  assert.equal(mostrarDicaInternacional('internacional'), false);
  const outras = ['saldo', 'dados', 'generica', 'autenticacao', 'vencido', 'processamento'] as const;
  for (const chave of outras) assert.equal(mostrarDicaInternacional(chave), true, chave);
  // nenhuma chave fica de fora desta conferência
  assert.equal(outras.length + 1, CHAVES_RECUSA.length);
});

test('um pedido abre sessão só pendente ou expirado, e a tentativa conta as sessões já criadas', () => {
  assert.equal(podeAbrirSessao('pendente'), true);
  assert.equal(podeAbrirSessao('expirado'), true);
  for (const s of ['pago', 'cancelado', 'reembolsado', 'contestado', 'recusado', 'aguardando_whatsapp'] as StatusReserva[]) {
    assert.equal(podeAbrirSessao(s), false, s);
  }
  const historico = (eventos: string[]) =>
    ({ historico: eventos.map((evento) => ({ em: '2026-11-09T15:00:00.000Z', evento })) }) as Reserva;
  assert.equal(proximaTentativa(historico(['Pedido criado com 2 itens'])), 1);
  assert.equal(
    proximaTentativa(
      historico([
        'Pedido criado com 2 itens',
        'Sessão de pagamento criada: cartão (cs_1)',
        'Cartão recusado (insufficient_funds)',
        'Sessão de pagamento criada: Pix (cs_2)',
      ]),
    ),
    3,
  );
});

test('a sessão nova só entra num pedido pendente ou expirado: pago, cancelado, reembolsado ou contestado fica como está', () => {
  // um pedido com a sessão antiga, o cartão recusado e a forma cartão (só os campos que a sessão nova muda)
  const pedido = (status: StatusReserva) =>
    ({
      status,
      provedor: 'stripe',
      pagamentoExternoId: 'cs_test_antiga',
      paymentIntentId: 'pi_3Antigo',
      pagamento: { metodo: 'cartao', motivoCodigo: 'insufficient_funds' },
      historico: [{ em: '2026-11-09T15:00:00.000Z', evento: 'Sessão de pagamento criada: cartão (cs_test_antiga)' }],
    }) as unknown as Reserva;

  // pendente (cartão recusado → Pix): a sessão nova vira a corrente, a forma muda e a recusa antiga some
  const pendente = pedido('pendente');
  assert.equal(sessaoNovaNoPedido(pendente, 'cs_test_nova', 'pix'), 'Sessão de pagamento criada: Pix (cs_test_nova)');
  assert.equal(pendente.status, 'pendente');
  assert.equal(pendente.pagamentoExternoId, 'cs_test_nova');
  assert.equal(pendente.pagamento.metodo, 'pix');
  assert.equal('motivoCodigo' in pendente.pagamento, false);
  // a linha do histórico quem grava é registrarSessaoCriada; a função só a devolve
  assert.equal(pendente.historico.length, 1);

  // expirado ("pagar de novo"): volta a pendente
  const expirado = pedido('expirado');
  assert.equal(sessaoNovaNoPedido(expirado, 'cs_test_nova', 'cartao'), 'Sessão de pagamento criada: cartão (cs_test_nova)');
  assert.equal(expirado.status, 'pendente');
  assert.equal(expirado.pagamentoExternoId, 'cs_test_nova');

  // fechado enquanto a sessão nascia (pago em outra aba, cancelado no painel): nada muda, nem a sessão nem a forma
  for (const s of ['pago', 'cancelado', 'reembolsado', 'contestado', 'recusado', 'aguardando_whatsapp'] as StatusReserva[]) {
    const fechado = pedido(s);
    const antes = structuredClone(fechado);
    assert.equal(sessaoNovaNoPedido(fechado, 'cs_test_nova', 'pix'), null, s);
    assert.deepEqual(fechado, antes, s);
  }
});

test('pagamento a mais: a sessão paga por OUTRO pagamento, num pedido que já não espera pagamento, volta ao cliente', () => {
  const paga = { status: 'pago', paymentIntentId: 'pi_B' } as const;
  for (const status of ['pago', 'contestado', 'cancelado', 'reembolsado', 'recusado', 'aguardando_whatsapp'] as StatusReserva[]) {
    // o pedido tem o pagamento pi_A e não espera outro: o pi_B é a mais, seja qual for o status fechado
    assert.equal(pagamentoAMais({ status, paymentIntentId: 'pi_A' }, paga), 'pi_B', status);
    // o próprio pagamento do pedido relido (o mesmo evento de novo) não é a mais
    assert.equal(pagamentoAMais({ status, paymentIntentId: 'pi_B' }, paga), undefined, status);
    // sem pagamento registrado não há "outro": segue o caminho de sempre
    assert.equal(pagamentoAMais({ status }, paga), undefined, status);
    // a sessão não foi paga (Pix gerado, vencida) ou veio sem o id do pagamento: nada a devolver
    assert.equal(pagamentoAMais({ status, paymentIntentId: 'pi_A' }, { status: 'pendente', paymentIntentId: 'pi_B' }), undefined, status);
    assert.equal(pagamentoAMais({ status, paymentIntentId: 'pi_A' }, { status: 'expirado', paymentIntentId: 'pi_B' }), undefined, status);
    assert.equal(pagamentoAMais({ status, paymentIntentId: 'pi_A' }, { status: 'pago' }), undefined, status);
  }
  // pendente e expirado ainda esperam pagamento: o da sessão paga entra no pedido, mesmo com outro registrado
  // (o cartão recusado deixa o pagamento dele gravado; o Pix da sessão seguinte é o que vale)
  for (const status of ['pendente', 'expirado'] as StatusReserva[]) {
    assert.equal(pagamentoAMais({ status, paymentIntentId: 'pi_A' }, paga), undefined, status);
    assert.equal(pagamentoAMais({ status }, paga), undefined, status);
  }
});
