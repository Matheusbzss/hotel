import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEstatisticas, escolherPeriodo, marcasDoEixo, paisDoTelefone, variacao, verPorSemana } from '../src/lib/estatisticas.ts';
import type { CarrinhoNoFunil } from '../src/lib/estatisticas.ts';
import { agruparPedidos, valorRecebido } from '../src/lib/pedidos-painel.ts';
import type { Reserva, ReservaPasseio, ReservaTransfer } from '../src/lib/reservas.ts';
import { DDIS } from '../src/lib/validacao.ts';

// pedidos fictícios, só para conferir as contas (nenhum é de cliente)
const passeio = (mudanca: Partial<ReservaPasseio> & { codigo: string }): ReservaPasseio => ({
  token: 'token-de-teste',
  criadaEm: '2026-11-01T12:00:00.000Z',
  atualizadaEm: '2026-11-01T12:00:00.000Z',
  idioma: 'es',
  status: 'pago',
  data: '2026-11-20',
  totalCentavos: 10000,
  totalPixCentavos: 9000,
  cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+54 1100000000' },
  pagamento: { metodo: 'pix', pagoEm: '2026-11-02T15:00:00.000Z' },
  historico: [],
  tipo: 'passeio',
  passeio: { slug: 'escuna-arraial', nome: 'Escuna em Arraial', cidade: 'arraial-do-cabo', unidade: 'pessoa' },
  adultos: 2,
  criancas: 0,
  unidades: 1,
  hospedagem: { cidade: 'buzios', hotel: 'Pousada Teste' },
  ...mudanca,
});

const transfer = (mudanca: Partial<ReservaTransfer> & { codigo: string }): ReservaTransfer => ({
  token: 'token-de-teste',
  criadaEm: '2026-11-01T12:00:00.000Z',
  atualizadaEm: '2026-11-01T12:00:00.000Z',
  idioma: 'es',
  status: 'pago',
  data: '2026-11-19',
  totalCentavos: 30000,
  totalPixCentavos: 27000,
  cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+54 1100000000' },
  pagamento: { metodo: 'cartao', pagoEm: '2026-11-02T15:00:00.000Z' },
  historico: [],
  tipo: 'transfer',
  transfer: {
    veiculo: 'carro',
    ida: { saida: { lugar: 'galeao' }, destino: { lugar: 'buzios' }, data: '2026-11-19', hora: '10:00', precoCentavos: 30000 },
    passageiros: 2,
    malas: { grandes: 2, medias: 0, mao: 0 },
    cadeirinhas: [],
  },
  ...mudanca,
});

const NOVEMBRO = { chave: 'outro', periodo: { de: '2026-11-01', ate: '2026-11-07' } };

test('o que entrou depende da forma de pagamento', () => {
  assert.equal(valorRecebido(passeio({ codigo: 'A' })), 9000);
  assert.equal(valorRecebido(passeio({ codigo: 'B', pagamento: { metodo: 'cartao' } })), 10000);
  // pago no Pix online: o total já tem o desconto
  assert.equal(valorRecebido(passeio({ codigo: 'C', totalCentavos: 9000, totalPixCentavos: undefined })), 9000);
  // venda antiga, sem a forma registrada
  assert.equal(valorRecebido(passeio({ codigo: 'D', pagamento: { metodo: 'whatsapp' } })), 10000);
});

test('os vouchers ficam juntos no pedido, na ordem da viagem', () => {
  const dados = { pedido: { codigo: 'ON-PEDIDO', totalCentavos: 40000, totalPixCentavos: 36000 } };
  const lista: Reserva[] = [
    passeio({ codigo: 'ON-ITEM1', ...dados, data: '2026-11-21' }),
    passeio({ codigo: 'ON-SOZINHO', criadaEm: '2026-10-01T12:00:00.000Z' }),
    transfer({ codigo: 'ON-ITEM2', ...dados, pagamento: { metodo: 'pix' } }),
  ];
  const pedidos = agruparPedidos(lista);
  assert.deepEqual(
    pedidos.map((p) => p.codigo),
    ['ON-PEDIDO', 'ON-SOZINHO'],
  );
  assert.deepEqual(
    pedidos[0].itens.map((i) => i.codigo),
    ['ON-ITEM2', 'ON-ITEM1'],
  );
  assert.equal(pedidos[0].totalCentavos, 40000);
  assert.equal(pedidos[0].totalPixCentavos, 36000);
  assert.equal(pedidos[1].itens.length, 1);
});

test('o período vem dos botões, das datas digitadas ou do padrão', () => {
  const hoje = '2026-11-06';
  assert.deepEqual(escolherPeriodo({}, hoje), {
    chave: '30',
    periodo: { de: '2026-10-08', ate: hoje },
    anterior: { de: '2026-09-08', ate: '2026-10-07' },
  });
  assert.deepEqual(escolherPeriodo({ periodo: '7' }, hoje).periodo, { de: '2026-10-31', ate: hoje });
  assert.deepEqual(escolherPeriodo({ periodo: 'qualquer' }, hoje).chave, '30');
  assert.deepEqual(escolherPeriodo({ periodo: 'tudo' }, hoje, '2026-03-01'), { chave: 'tudo', periodo: { de: '2026-03-01', ate: hoje } });
  assert.deepEqual(escolherPeriodo({ de: '2026-10-01', ate: '2026-10-10' }, hoje), {
    chave: 'outro',
    periodo: { de: '2026-10-01', ate: '2026-10-10' },
    anterior: { de: '2026-09-21', ate: '2026-09-30' },
  });
  // o fim não passa de hoje, e data inválida ou invertida cai no padrão
  assert.equal(escolherPeriodo({ de: '2026-11-01', ate: '2026-12-31' }, hoje).periodo.ate, hoje);
  assert.equal(escolherPeriodo({ de: '2026-02-30', ate: '2026-03-10' }, hoje).chave, '30');
  assert.equal(escolherPeriodo({ de: '2026-10-10', ate: '2026-10-01' }, hoje).chave, '30');
  // um erro no ano não faz um gráfico sem fim
  assert.equal(escolherPeriodo({ de: '1900-01-01', ate: hoje }, hoje).periodo.de, '2023-11-04');
  assert.equal(verPorSemana({ de: '2026-10-08', ate: hoje }), false);
  assert.equal(verPorSemana({ de: '2026-08-09', ate: hoje }), true);
});

test('só o pedido pago no período entra na conta, pelo valor que entrou', () => {
  const e = calcularEstatisticas(
    [
      passeio({ codigo: 'PIX' }),
      passeio({ codigo: 'CARTAO', pagamento: { metodo: 'cartao', pagoEm: '2026-11-03T15:00:00.000Z' } }),
      passeio({ codigo: 'ABERTO', status: 'aguardando_whatsapp', pagamento: { metodo: 'whatsapp' } }),
      passeio({ codigo: 'REEMBOLSADO', status: 'reembolsado' }),
      passeio({ codigo: 'OUTUBRO', pagamento: { metodo: 'pix', pagoEm: '2026-10-20T15:00:00.000Z' } }),
    ],
    [],
    NOVEMBRO,
  );
  assert.equal(e.resumo.pedidos, 2);
  assert.equal(e.resumo.centavos, 19000);
  assert.equal(e.resumo.ticketCentavos, 9500);
  assert.equal(e.resumoAnterior, undefined);
  assert.deepEqual(
    e.porPagamento.map((f) => [f.rotulo, f.centavos, f.quantidade]),
    [
      ['Cartão', 10000, 1],
      ['Pix', 9000, 1],
    ],
  );
});

test('o dia da venda é o de Búzios, e o gráfico tem todos os dias do período', () => {
  const e = calcularEstatisticas(
    [
      // 23h de 2 de novembro em Búzios, que já é dia 3 no horário universal
      passeio({ codigo: 'NOITE', pagamento: { metodo: 'pix', pagoEm: '2026-11-03T02:00:00.000Z' } }),
      // sem a data do pagamento, vale a da criação do pedido
      passeio({ codigo: 'SEMDATA', criadaEm: '2026-11-05T12:00:00.000Z', pagamento: { metodo: 'cartao' } }),
    ],
    [],
    NOVEMBRO,
  );
  assert.equal(e.porDia.length, 7);
  assert.deepEqual(
    e.porDia.filter((d) => d.pedidos).map((d) => [d.de, d.centavos]),
    [
      ['2026-11-02', 9000],
      ['2026-11-05', 10000],
    ],
  );
  // 1º de novembro de 2026 é domingo: a primeira semana tem um dia só
  assert.deepEqual(
    e.porSemana.map((s) => [s.de, s.ate, s.pedidos]),
    [
      ['2026-11-01', '2026-11-01', 0],
      ['2026-11-02', '2026-11-07', 2],
    ],
  );
});

test('os rankings contam os itens, e o país e a origem contam os pedidos', () => {
  const dados = { pedido: { codigo: 'ON-PEDIDO', totalCentavos: 40000, totalPixCentavos: 36000 } };
  const e = calcularEstatisticas(
    [
      passeio({ codigo: 'ON-ITEM1', ...dados, sugestao: true }),
      transfer({ codigo: 'ON-ITEM2', ...dados, pagamento: { metodo: 'pix', pagoEm: '2026-11-02T15:00:00.000Z' } }),
      passeio({
        codigo: 'ON-CHILE',
        cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+56 900000000' },
        pagamento: { metodo: 'cartao', pagoEm: '2026-11-02T15:00:00.000Z' },
        origem: { utm_source: 'meta', utm_medium: 'pago', utm_campaign: 'verao' },
      }),
    ],
    [],
    NOVEMBRO,
  );
  assert.deepEqual(
    e.porPasseio.map((f) => [f.chave, f.centavos, f.quantidade]),
    [
      ['transfer', 27000, 1],
      ['escuna-arraial', 19000, 2],
    ],
  );
  assert.deepEqual(
    e.porCidade.map((f) => [f.chave, f.quantidade]),
    [
      ['transfer', 1],
      ['arraial-do-cabo', 2],
    ],
  );
  assert.deepEqual(
    e.porPais.map((f) => [f.rotulo, f.centavos, f.quantidade]),
    [
      ['Argentina', 36000, 1],
      ['Chile', 10000, 1],
    ],
  );
  assert.deepEqual(
    e.porOrigem.map((f) => [f.rotulo, f.quantidade]),
    [
      ['Direto ou sem origem', 1],
      ['Meta (Instagram e Facebook)', 1],
    ],
  );
  assert.equal(e.resumo.pedidos, 2);
  assert.equal(e.resumo.itens, 3);
  assert.equal(e.resumo.itensPorPedido, 1.5);
  assert.deepEqual(
    e.itensPorPedido.map((i) => i.pedidos),
    [1, 1, 0, 0],
  );
  // a soma do que entrou fecha com os rankings
  assert.equal(e.resumo.centavos, 46000);
  assert.deepEqual(
    { centavos: e.sugestoes.centavos, itens: e.sugestoes.itens, pedidos: e.sugestoes.pedidos },
    { centavos: 9000, itens: 1, pedidos: 1 },
  );
  assert.equal(e.resumo.sugestoesCentavos, 9000);
  assert.deepEqual(
    e.sugestoes.porPasseio.map((f) => f.rotulo),
    ['Escuna em Arraial'],
  );
});

test('o funil segue os carrinhos criados no período', () => {
  const carrinho = (dia: string, mudanca: Partial<CarrinhoNoFunil> = {}): CarrinhoNoFunil => ({
    criadoEm: `${dia}T12:00:00.000Z`,
    fezPedido: false,
    pagou: false,
    ...mudanca,
  });
  const carrinhos = [
    carrinho('2026-11-02'),
    carrinho('2026-11-02', { checkoutEm: '2026-11-02T12:05:00.000Z' }),
    // a marca do checkout não foi gravada, mas o pedido existe
    carrinho('2026-11-03', { fezPedido: true }),
    carrinho('2026-11-03', { checkoutEm: '2026-11-03T12:05:00.000Z', fezPedido: true, pagou: true }),
    carrinho('2026-10-31', { checkoutEm: '2026-10-31T12:05:00.000Z', fezPedido: true, pagou: true }),
  ];
  const e = calcularEstatisticas([], carrinhos, { ...NOVEMBRO, anterior: { de: '2026-10-25', ate: '2026-10-31' } });
  assert.deepEqual(e.funil, { carrinhos: 4, checkout: 3, pedidos: 2, pagos: 1 });
  assert.deepEqual(e.funilAnterior, { carrinhos: 1, checkout: 1, pedidos: 1, pagos: 1 });
});

test('o país vem do código do telefone', () => {
  assert.equal(paisDoTelefone('+55 22999990000').rotulo, 'Brasil');
  assert.equal(paisDoTelefone('+598 99000000').rotulo, 'Uruguai');
  assert.equal(paisDoTelefone('+1 3050000000').rotulo, 'EUA ou Canadá');
  assert.equal(paisDoTelefone('+7 9000000000').rotulo, 'Outro país');
  // todo código do checkout tem o nome do país em português
  for (const { ddi, pais } of DDIS) assert.notEqual(paisDoTelefone(`+${ddi} 900000000`).rotulo, pais, `falta o nome de ${pais}`);
});

test('a comparação e as marcas do eixo', () => {
  assert.equal(variacao(150, 100), 50);
  assert.equal(variacao(50, 100), -50);
  assert.equal(variacao(50, 0), null);
  assert.equal(variacao(50, undefined), null);
  assert.deepEqual(marcasDoEixo(0), [0, 1]);
  assert.deepEqual(marcasDoEixo(3), [0, 1, 2, 3]);
  assert.deepEqual(marcasDoEixo(7), [0, 2, 4, 6, 8]);
  assert.deepEqual(marcasDoEixo(38000, 100), [0, 10000, 20000, 30000, 40000]);
});
