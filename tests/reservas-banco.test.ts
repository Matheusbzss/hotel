import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copiarDoPedido, deLinhas, paraLinhas, type LinhasReserva } from '../src/lib/reservas-banco.ts';
import type { Reserva, ReservaPasseio, ReservaTransfer } from '../src/lib/reservas.ts';

// reservas fictícias, só para conferir a tradução (nenhuma é de cliente)
const PASSEIO: ReservaPasseio = {
  codigo: 'ON-TESTE5',
  token: 'token-de-teste',
  criadaEm: '2026-11-03T10:00:00.000Z',
  atualizadaEm: '2026-11-03T11:30:00.000Z',
  idioma: 'es',
  status: 'aguardando_whatsapp',
  data: '2026-11-20',
  totalCentavos: 23100,
  totalPixCentavos: 20790,
  observacoes: 'Chegamos de manhã',
  cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+54 11 0000-0000', documentoTipo: 'passaporte', documento: 'X0000000' },
  pagamento: { metodo: 'whatsapp' },
  historico: [
    { em: '2026-11-03T10:00:00.000Z', evento: 'Reserva criada' },
    { em: '2026-11-03T11:30:00.000Z', evento: 'Marcada como paga no admin' },
  ],
  tipo: 'passeio',
  passeio: {
    slug: 'lancha-buzios',
    nome: 'Lancha em Búzios',
    cidade: 'Búzios',
    unidade: 'embarcacao',
    opcao: { id: '2h', nome: '2 horas' },
  },
  horario: { hora: '09:30', busca: true },
  adultos: 2,
  criancas: 1,
  criancasMeia: 1,
  criancasGratis: 0,
  unidades: 1,
  hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
};

const TRANSFER: ReservaTransfer = {
  codigo: 'ON-TESTE6',
  token: 'outro-token',
  criadaEm: '2026-11-03T12:00:00.000Z',
  atualizadaEm: '2026-11-03T12:00:00.000Z',
  idioma: 'pt',
  status: 'pago',
  data: '2026-12-01',
  totalCentavos: 160000,
  cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+55 21 90000-0000' },
  pagamento: { metodo: 'pix', pagoEm: '2026-11-03T12:05:00.000Z' },
  historico: [{ em: '2026-11-03T12:00:00.000Z', evento: 'Reserva criada' }],
  tipo: 'transfer',
  transfer: {
    veiculo: 'carro',
    ida: {
      saida: { lugar: 'galeao' },
      destino: { lugar: 'buzios', endereco: 'Pousada de teste' },
      data: '2026-12-01',
      hora: '14:00',
      voo: 'G3 1234',
      precoCentavos: 80000,
    },
    volta: {
      saida: { lugar: 'buzios', endereco: 'Pousada de teste' },
      destino: { lugar: 'galeao' },
      data: '2026-12-08',
      hora: '08:00',
      precoCentavos: 80000,
    },
    passageiros: 3,
    malas: { grandes: 2, medias: 0, mao: 2 },
    cadeirinhas: [4],
  },
};

/** O caminho de verdade: JSON até o banco (jsonb) e as datas como o Postgres devolve. */
function peloBanco(l: LinhasReserva): LinhasReserva {
  const volta = JSON.parse(JSON.stringify(l)) as LinhasReserva;
  const comoPostgres = (t: string) => t.replace('T', ' ').replace(/\.000Z$/, '+00');
  volta.pedido.criado_em = comoPostgres(volta.pedido.criado_em);
  volta.pedido.atualizado_em = comoPostgres(volta.pedido.atualizado_em);
  volta.historico = volta.historico.map((h) => ({ ...h, em: comoPostgres(h.em) })).reverse();
  return volta;
}

test('a origem do anúncio vai e volta com o pedido', () => {
  const origem = { utm_source: 'meta', utm_medium: 'pago', utm_campaign: 'verao' };
  const linhas = paraLinhas({ ...PASSEIO, origem });
  assert.deepEqual(linhas.pedido.origem_utm, origem);
  assert.deepEqual(deLinhas(linhas.pedido, linhas.item, linhas.historico).origem, origem);
  // sem origem, a reserva volta igual, sem o campo
  const sem = paraLinhas(PASSEIO);
  assert.equal('origem' in deLinhas(sem.pedido, sem.item, sem.historico), false);
});

test('passeio: vai para o banco e volta igual, com opção, horário, crianças, Pix e observação', () => {
  const l = peloBanco(paraLinhas(PASSEIO));
  assert.deepEqual(deLinhas(l.pedido, l.item, l.historico), PASSEIO);
});

test('transfer: vai para o banco e volta igual, com ida e volta, voo, malas e cadeirinha', () => {
  const l = peloBanco(paraLinhas(TRANSFER));
  assert.deepEqual(deLinhas(l.pedido, l.item, l.historico), TRANSFER);
});

test('reserva de passeio antiga, sem "tipo" e sem horário: volta igual, só que com tipo "passeio"', () => {
  const { tipo: _tipo, horario: _horario, criancasMeia: _m, criancasGratis: _g, ...antiga } = PASSEIO;
  const l = peloBanco(paraLinhas(antiga as ReservaPasseio));
  assert.deepEqual(deLinhas(l.pedido, l.item, l.historico), { ...antiga, tipo: 'passeio' });
});

test('as linhas vão completas: nenhuma coluna fica de fora (o banco preencheria com nulo)', () => {
  for (const r of [PASSEIO, TRANSFER]) {
    const { pedido, item } = paraLinhas(r);
    // 23 de antes + provedor, pagamento_externo_id, payment_intent_id e reembolso_centavos (pagamento pela Stripe)
    assert.equal(Object.keys(pedido).length, 27);
    assert.equal(Object.keys(item).length, 18);
    for (const [coluna, valor] of Object.entries({ ...pedido, ...item })) assert.notEqual(valor, undefined, coluna);
  }
  // sem os campos da Stripe, as quatro colunas novas levam o valor de quem não pagou online
  const { pedido } = paraLinhas(PASSEIO);
  assert.equal(pedido.provedor, 'whatsapp');
  assert.equal(pedido.pagamento_externo_id, null);
  assert.equal(pedido.payment_intent_id, null);
  assert.equal(pedido.reembolso_centavos, 0);
  // a reserva antiga paga online (sem o provedor gravado) é da Pagar.me
  assert.equal(paraLinhas(TRANSFER).pedido.provedor, 'pagarme');
});

test('reserva do WhatsApp marcada como paga no Pix no painel: quem cobrou continua sendo a equipe', () => {
  // o painel anota a forma (Pix) e segura o provedor; só com a forma, a reserva passaria por checkout antigo
  const paga: ReservaPasseio = {
    ...PASSEIO,
    status: 'pago',
    provedor: 'whatsapp',
    pagamento: { metodo: 'pix', pagoEm: '2026-11-03T11:30:00.000Z' },
  };
  const l = peloBanco(paraLinhas(paga));
  assert.equal(l.pedido.provedor, 'whatsapp');
  assert.equal(l.pedido.metodo_pagamento, 'pix');
  assert.deepEqual(deLinhas(l.pedido, l.item, l.historico), paga);
});

// um pedido fictício pago com cartão pela Stripe (nenhum é de cliente)
const PAGO_NA_STRIPE: ReservaPasseio = {
  ...PASSEIO,
  status: 'pago',
  provedor: 'stripe',
  pagamentoExternoId: 'cs_test_a1b2c3',
  paymentIntentId: 'pi_3Teste1',
  cliente: { ...PASSEIO.cliente, pais: 'AR' },
  pagamento: {
    metodo: 'cartao',
    cartaoBandeira: 'visa',
    cartaoFinal: '4242',
    cartaoPais: 'AR',
    apresentado: { moeda: 'usd', valorCentavos: 4200 },
    pagoEm: '2026-11-03T11:30:00.000Z',
    ultimaConsulta: '2026-11-03T11:30:00.000Z',
  },
  historico: [
    { em: '2026-11-03T10:00:00.000Z', evento: 'Reserva criada' },
    { em: '2026-11-03T10:01:00.000Z', evento: 'Sessão de pagamento criada: cartão (cs_test_a1b2c3)' },
    { em: '2026-11-03T11:30:00.000Z', evento: 'Pago (webhook da Stripe)' },
  ],
};

test('pedido da Stripe: o provedor, a sessão, o pagamento e os dados do cartão vão para o banco e voltam iguais', () => {
  const linhas = paraLinhas(PAGO_NA_STRIPE);
  assert.equal(linhas.pedido.provedor, 'stripe');
  assert.equal(linhas.pedido.pagamento_externo_id, 'cs_test_a1b2c3');
  assert.equal(linhas.pedido.payment_intent_id, 'pi_3Teste1');
  assert.equal(linhas.pedido.reembolso_centavos, 0);
  assert.equal(linhas.pedido.cliente_pais, 'AR');
  assert.equal(linhas.pedido.metodo_pagamento, 'cartao');
  assert.equal(linhas.pedido.pago_em, '2026-11-03T11:30:00.000Z');
  const l = peloBanco(linhas);
  assert.deepEqual(deLinhas(l.pedido, l.item, l.historico), PAGO_NA_STRIPE);

  // ainda pendente, com o Pix escolhido: só a sessão existe; o pagamento e o reembolso não voltam como campos vazios
  const pendente: ReservaPasseio = {
    ...PASSEIO,
    status: 'pendente',
    provedor: 'stripe',
    pagamentoExternoId: 'cs_test_d4e5f6',
    pagamento: { metodo: 'pix' },
  };
  const p = peloBanco(paraLinhas(pendente));
  assert.equal(p.pedido.provedor, 'stripe');
  assert.equal(p.pedido.payment_intent_id, null);
  const devolta = deLinhas(p.pedido, p.item, p.historico);
  assert.deepEqual(devolta, pendente);
  assert.equal('paymentIntentId' in devolta, false);
  assert.equal('reembolsoCentavos' in devolta, false);
});

test('pedido da Stripe com devolução: o valor que já voltou e o voucher reembolsado sozinho vão e voltam', () => {
  // o pedido inteiro devolvido
  const devolvido: ReservaPasseio = { ...PAGO_NA_STRIPE, status: 'reembolsado', reembolsoCentavos: PASSEIO.totalCentavos };
  const d = peloBanco(paraLinhas(devolvido));
  assert.equal(d.pedido.reembolso_centavos, 23100);
  assert.equal(d.item.status, 'reembolsado');
  assert.deepEqual(deLinhas(d.pedido, d.item, d.historico), devolvido);

  // um item só devolvido num pedido de dois: o pedido continua pago e guarda quanto voltou
  const pedido = { codigo: 'ON-PEDIDO', totalCentavos: 183100, totalPixCentavos: 164790 };
  const item: ReservaPasseio = { ...PAGO_NA_STRIPE, pedido, statusItem: 'reembolsado', reembolsoCentavos: PASSEIO.totalCentavos };
  const i = peloBanco(paraLinhas(item));
  assert.equal(i.pedido.status, 'pago');
  assert.equal(i.pedido.reembolso_centavos, 23100);
  assert.equal(i.item.status, 'reembolsado');
  assert.deepEqual(deLinhas(i.pedido, i.item, i.historico), item);
});

test('pedido do carrinho: cada voucher volta com o seu código e o seu preço, e o pedido guarda os totais', () => {
  const pedido = { codigo: 'ON-PEDIDO', totalCentavos: 183100, totalPixCentavos: 164790 };
  const comPix = { ...TRANSFER, totalPixCentavos: 144000 };
  for (const voucher of [
    { ...PASSEIO, pedido },
    { ...comPix, pedido },
  ] as Reserva[]) {
    const l = peloBanco(paraLinhas(voucher));
    assert.equal(l.pedido.codigo, 'ON-PEDIDO');
    assert.equal(l.pedido.total_centavos, 183100);
    assert.equal(l.pedido.total_pix_centavos, 164790);
    assert.equal(l.item.voucher_codigo, voucher.codigo);
    assert.equal(l.item.preco_centavos, voucher.totalCentavos);
    assert.deepEqual(deLinhas(l.pedido, l.item, l.historico), voucher);
  }
});

test('o passeio pego pela sugestão do carrinho volta marcado', () => {
  const l = peloBanco(paraLinhas({ ...PASSEIO, sugestao: true }));
  assert.deepEqual(deLinhas(l.pedido, l.item, l.historico), { ...PASSEIO, sugestao: true });
});

test('reserva do carrinho sem documento: o checkout pede só nome, e-mail e WhatsApp', () => {
  const { documentoTipo: _t, documento: _d, ...cliente } = PASSEIO.cliente;
  const semDocumento: ReservaPasseio = { ...PASSEIO, cliente };
  const l = peloBanco(paraLinhas(semDocumento));
  assert.equal(l.pedido.cliente_documento, null);
  assert.equal(l.pedido.cliente_documento_tipo, null);
  assert.deepEqual(deLinhas(l.pedido, l.item, l.historico), semDocumento);
});

test('o voucher acompanha o pedido: cancelado e reembolsado valem para o item; o resto fica ativo', () => {
  assert.equal(paraLinhas({ ...PASSEIO, status: 'cancelado' }).item.status, 'cancelado');
  assert.equal(paraLinhas({ ...PASSEIO, status: 'reembolsado' }).item.status, 'reembolsado');
  assert.equal(paraLinhas({ ...PASSEIO, status: 'pago' }).item.status, 'ativo');
  assert.equal(paraLinhas(TRANSFER).item.voucher_codigo, TRANSFER.codigo);
});

// sem o banco (um arquivo por voucher), o que é do pedido passa do voucher gravado para os outros: copiarDoPedido

const PEDIDO = { codigo: 'ON-PEDIDO', totalCentavos: 183100, totalPixCentavos: 164790 };
const CRIADO = '2026-11-03T10:00:00.000Z';
const NASCEU = { em: CRIADO, evento: 'Pedido criado com 2 itens' };
// o transfer do pedido, como nasceu: pendente, esperando o cartão
const IRMAO: ReservaTransfer = {
  ...TRANSFER,
  pedido: PEDIDO,
  status: 'pendente',
  criadaEm: CRIADO,
  atualizadaEm: CRIADO,
  totalPixCentavos: 144000,
  pagamento: { metodo: 'cartao' },
  historico: [NASCEU],
};
// o passeio do mesmo pedido, que o webhook da Stripe acabou de gravar como pago
const GRAVADA: ReservaPasseio = { ...PAGO_NA_STRIPE, pedido: PEDIDO, historico: [NASCEU, ...PAGO_NA_STRIPE.historico.slice(1)] };

test('sem o banco, o voucher irmão recebe o que é do pedido e guarda o que é só dele', () => {
  const [irmaoAntes, gravadaAntes] = [structuredClone(IRMAO), structuredClone(GRAVADA)];
  const copia = copiarDoPedido(IRMAO, GRAVADA);
  assert.ok(copia);
  // do pedido: o status, o pagamento, o provedor, a sessão e o pagamento na Stripe, o país de quem pagou, a hora
  // e o histórico; do voucher: o código, a data, o preço e os dados do transfer
  assert.deepEqual(copia, {
    ...IRMAO,
    status: 'pago',
    provedor: 'stripe',
    pagamentoExternoId: 'cs_test_a1b2c3',
    paymentIntentId: 'pi_3Teste1',
    cliente: { ...IRMAO.cliente, pais: 'AR' },
    pagamento: GRAVADA.pagamento,
    atualizadaEm: GRAVADA.atualizadaEm,
    historico: GRAVADA.historico,
  });
  // é o que o banco guardaria na linha do pedido, lido por um voucher ou pelo outro
  const [doIrmao, daGravada] = [paraLinhas(copia), paraLinhas(GRAVADA)];
  const colunas = [
    'status',
    'metodo_pagamento',
    'pagamento',
    'pago_em',
    'provedor',
    'pagamento_externo_id',
    'payment_intent_id',
    'reembolso_centavos',
    'cliente_pais',
    'atualizado_em',
  ] as const;
  for (const coluna of colunas) assert.deepEqual(doIrmao.pedido[coluna], daGravada.pedido[coluna], coluna);
  assert.deepEqual(doIrmao.historico, daGravada.historico);
  // os dois que entraram ficam como estavam, e o pagamento copiado não é o mesmo objeto
  assert.deepEqual(IRMAO, irmaoAntes);
  assert.deepEqual(GRAVADA, gravadaAntes);
  assert.notEqual(copia.pagamento, GRAVADA.pagamento);
});

test('sem o banco, o item reembolsado sozinho continua reembolsado quando o pedido muda, e o evento dele chega aos outros', () => {
  const pago = copiarDoPedido(IRMAO, GRAVADA);
  assert.ok(pago);
  // o transfer é reembolsado sozinho (atualizarItem): o statusItem e o evento entram no arquivo dele
  const evento = { em: '2026-11-04T09:00:00.000Z', evento: `Voucher ${IRMAO.codigo} reembolsado` };
  const devolvido: Reserva = { ...pago, statusItem: 'reembolsado', atualizadaEm: evento.em, historico: [...pago.historico, evento] };

  // para o passeio vai o evento (o histórico é do pedido), não o statusItem: o passeio continua valendo
  const passeio = copiarDoPedido(GRAVADA, devolvido);
  assert.ok(passeio);
  assert.equal(passeio.codigo, GRAVADA.codigo);
  assert.equal(passeio.status, 'pago');
  assert.equal('statusItem' in passeio, false);
  assert.equal(paraLinhas(passeio).item.status, 'ativo');
  assert.deepEqual(passeio.historico, devolvido.historico);

  // depois o pedido muda no passeio (o valor que voltou ao cliente): o transfer recebe e continua reembolsado
  const nota = { em: '2026-11-04T09:00:01.000Z', evento: 'Reembolso parcial confirmado' };
  const comValor: Reserva = {
    ...passeio,
    reembolsoCentavos: IRMAO.totalCentavos,
    atualizadaEm: nota.em,
    historico: [...passeio.historico, nota],
  };
  const transfer = copiarDoPedido(devolvido, comValor);
  assert.ok(transfer);
  assert.equal(transfer.codigo, IRMAO.codigo);
  assert.equal(transfer.statusItem, 'reembolsado');
  assert.equal(transfer.status, 'pago');
  assert.equal(transfer.reembolsoCentavos, IRMAO.totalCentavos);
  assert.equal(paraLinhas(transfer).item.status, 'reembolsado');
  assert.deepEqual(transfer.historico, comValor.historico);
});

test('sem o banco, a cópia repetida não muda nada e a cópia atrasada não desfaz o que é mais novo', () => {
  const copia = copiarDoPedido(IRMAO, GRAVADA);
  assert.ok(copia);
  // a mesma gravação levada duas vezes: igual, sem evento dobrado
  assert.deepEqual(copiarDoPedido(copia, GRAVADA), copia);
  // o irmão foi gravado depois do voucher (duas gravações chegaram juntas): o estado mais antigo não entra
  assert.equal(copiarDoPedido({ ...copia, atualizadaEm: '2026-11-03T11:30:00.001Z' }, GRAVADA), null);
  // o próprio voucher, o voucher de outro pedido e a reserva avulsa (sem pedido) não recebem nem dão nada
  assert.equal(copiarDoPedido(GRAVADA, GRAVADA), null);
  assert.equal(copiarDoPedido({ ...IRMAO, pedido: { ...PEDIDO, codigo: 'ON-OUTRO1' } }, GRAVADA), null);
  assert.equal(copiarDoPedido(TRANSFER, GRAVADA), null);
  assert.equal(copiarDoPedido(IRMAO, PAGO_NA_STRIPE), null);

  // o que o voucher gravado não tem sai do irmão também: os dois arquivos dizem o mesmo sobre o pedido
  const semStripe = structuredClone(GRAVADA);
  semStripe.atualizadaEm = '2026-11-03T12:00:00.000Z';
  delete semStripe.provedor;
  delete semStripe.pagamentoExternoId;
  delete semStripe.paymentIntentId;
  delete semStripe.cliente.pais;
  const limpo = copiarDoPedido({ ...copia, reembolsoCentavos: 500 }, semStripe);
  assert.ok(limpo);
  for (const campo of ['provedor', 'pagamentoExternoId', 'paymentIntentId', 'reembolsoCentavos'])
    assert.equal(campo in limpo, false, campo);
  assert.equal('pais' in limpo.cliente, false);
  assert.deepEqual(limpo.cliente, IRMAO.cliente);

  // o irmão com um evento só dele no meio do caminho: os eventos do pedido entram na ordem do tempo
  const proprio = { em: '2026-11-03T10:30:00.000Z', evento: 'Evento só deste voucher' };
  const comProprio = copiarDoPedido({ ...IRMAO, atualizadaEm: proprio.em, historico: [NASCEU, proprio] }, GRAVADA);
  assert.ok(comProprio);
  assert.deepEqual(
    comProprio.historico.map((h) => h.em),
    [CRIADO, '2026-11-03T10:01:00.000Z', proprio.em, '2026-11-03T11:30:00.000Z'],
  );
});
