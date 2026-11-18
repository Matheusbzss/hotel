import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CONVERSAO_GOOGLE, arquivoDoGoogle, eventoDeCompra } from '../src/lib/conversoes.ts';
import { agruparPedidos } from '../src/lib/pedidos-painel.ts';
import type { Reserva, ReservaPasseio } from '../src/lib/reservas.ts';

// pedidos fictícios, só para conferir o que sai (nenhum é de cliente)
const passeio = (mudanca: Partial<ReservaPasseio> & { codigo: string }): ReservaPasseio => ({
  token: 'token-de-teste',
  criadaEm: '2026-11-01T12:00:00.000Z',
  atualizadaEm: '2026-11-01T12:00:00.000Z',
  idioma: 'es',
  status: 'pago',
  data: '2026-11-20',
  totalCentavos: 10000,
  totalPixCentavos: 9000,
  cliente: { nome: 'Teste', email: ' Teste@Exemplo.com ', telefone: '+54 1100000000' },
  pagamento: { metodo: 'pix', pagoEm: '2026-11-02T15:00:30.000Z' },
  historico: [],
  tipo: 'passeio',
  passeio: { slug: 'escuna-arraial', nome: 'Escuna em Arraial', cidade: 'arraial-do-cabo', unidade: 'pessoa' },
  adultos: 2,
  criancas: 0,
  unidades: 1,
  hospedagem: { cidade: 'buzios', hotel: 'Pousada Teste' },
  ...mudanca,
});

const pedidos = (...r: Reserva[]) => agruparPedidos(r);
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const AGORA = new Date('2026-11-06T12:00:00.000Z');

test('o evento de compra leva o valor que entrou e os dados embaralhados', () => {
  const [p] = pedidos(passeio({ codigo: 'ON-TESTE1', origem: { fbp: 'fb.1.123.456', fbc: 'fb.1.123.abc', navegador: 'Safari', medicao: true } }));
  const e = eventoDeCompra(p, 'https://orlanativa.online', AGORA);
  assert.equal(e.event_name, 'Purchase');
  assert.equal(e.event_id, 'ON-TESTE1');
  assert.equal(e.event_time, Math.floor(AGORA.getTime() / 1000));
  assert.equal(e.action_source, 'website');
  assert.equal(e.event_source_url, 'https://orlanativa.online/checkout');
  assert.deepEqual(e.custom_data, {
    currency: 'BRL',
    value: 90,
    content_ids: ['escuna-arraial'],
    content_type: 'product',
    num_items: 1,
    order_id: 'ON-TESTE1',
  });
  // nada de dado aberto: o e-mail em minúsculas e o telefone só com os números, antes do hash
  assert.deepEqual(e.user_data, {
    em: [sha256('teste@exemplo.com')],
    ph: [sha256('541100000000')],
    fbp: 'fb.1.123.456',
    fbc: 'fb.1.123.abc',
    client_user_agent: 'Safari',
  });
  assert.equal(JSON.stringify(e).includes('Teste@Exemplo'), false);
});

test('no pedido com vários itens, o evento é um só, com o código do pedido', () => {
  const dados = { pedido: { codigo: 'ON-PEDIDO', totalCentavos: 30000, totalPixCentavos: 27000 } };
  const [p] = pedidos(
    passeio({ codigo: 'ON-ITEM1', ...dados, data: '2026-11-21' }),
    passeio({ codigo: 'ON-ITEM2', ...dados, passeio: { slug: 'buggy-buzios', nome: 'Buggy', cidade: 'buzios', unidade: 'veiculo' } }),
  );
  const e = eventoDeCompra(p, 'https://site', AGORA);
  assert.equal(e.event_id, 'ON-PEDIDO');
  assert.equal(e.custom_data.value, 180);
  assert.deepEqual(e.custom_data.content_ids, ['buggy-buzios', 'escuna-arraial']);
  assert.equal(e.custom_data.num_items, 2);
});

test('o arquivo do Google traz só as vendas pagas com o clique, dos últimos 90 dias', () => {
  const gclid = 'Cj0KCQiA-abc_123';
  const texto = arquivoDoGoogle(
    pedidos(
      passeio({ codigo: 'ON-PAGO', origem: { gclid, medicao: true } }),
      passeio({ codigo: 'ON-CARTAO', origem: { gclid: 'Cj0KCQiA-outro', medicao: true }, pagamento: { metodo: 'cartao', pagoEm: '2026-11-03T15:00:00.000Z' } }),
      passeio({ codigo: 'ON-ABERTO', status: 'aguardando_whatsapp', origem: { gclid }, pagamento: { metodo: 'whatsapp' } }),
      passeio({ codigo: 'ON-META', origem: { utm_source: 'meta', medicao: true } }),
      passeio({ codigo: 'ON-VELHO', origem: { gclid }, pagamento: { metodo: 'pix', pagoEm: '2026-07-01T12:00:00.000Z' } }),
    ),
    AGORA,
  );
  const linhas = texto.trim().split('\n');
  assert.equal(linhas[0], 'Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID');
  assert.deepEqual(linhas.slice(1).sort(), [
    `Cj0KCQiA-abc_123,${CONVERSAO_GOOGLE},2026-11-02T15:00:30Z,90.00,BRL,ON-PAGO`,
    `Cj0KCQiA-outro,${CONVERSAO_GOOGLE},2026-11-03T15:00:00Z,100.00,BRL,ON-CARTAO`,
  ]);
});

test('sem venda do Google, o arquivo só tem o cabeçalho', () => {
  assert.equal(arquivoDoGoogle([], AGORA).trim().split('\n').length, 1);
});
