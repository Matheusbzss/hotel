import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deLinhas, paraLinhas, type LinhasReserva } from '../src/lib/reservas-banco.ts';
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
    assert.equal(Object.keys(pedido).length, 23);
    assert.equal(Object.keys(item).length, 18);
    for (const [coluna, valor] of Object.entries({ ...pedido, ...item })) assert.notEqual(valor, undefined, coluna);
  }
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
