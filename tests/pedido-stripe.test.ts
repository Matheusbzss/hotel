import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONSULTAS_POR_IP,
  ESPERA_ANTES_DE_CONSULTAR_MS,
  INTERVALO_ENTRE_CONSULTAS_MS,
  deveSincronizar,
  itemAgendado,
  itemDaSessao,
  pendenteDesde,
  reservarConsulta,
  sessaoFicouGravada,
  sessoesSubstituidas,
  urlDeRetorno,
  zerarConsultasEmMemoria,
} from '../src/app/api/pedido/pedido-stripe.ts';
import { linhaDeBloqueioDoSite } from '../src/lib/casas-banco.ts';
import type { ReservaPasseio } from '../src/lib/reservas.ts';
import { formatarDataIso } from '../src/lib/validacao.ts';

// Só as regras puras das rotas do pedido: nada aqui chama a Stripe nem o banco.
delete process.env.SUPABASE_URL;

const MODELO = '{data} às {hora}';

test('um passeio entra na sessão com o nome e a opção, a data, a hora e as pessoas no idioma do cliente', () => {
  const item = itemDaSessao(
    { codigo: 'ON-ABC123', tipo: 'passeio', totalCentavos: 176000, totalPixCentavos: 158400 },
    {
      passeioNome: 'Lancha Privativa em Búzios',
      opcaoNome: '2 horas',
      data: '2026-11-14',
      horario: { texto: '9h', busca: true },
      pessoasTexto: '2 adultos',
    },
    'pt',
    MODELO,
  );
  assert.deepEqual(item, {
    voucher: 'ON-ABC123',
    nome: 'Lancha Privativa em Búzios · 2 horas',
    descricao: `${formatarDataIso('2026-11-14', 'pt-BR')} às 9h · 2 adultos`,
    tipo: 'passeio',
    totalCentavos: 176000,
    totalPixCentavos: 158400,
  });
});

test('um transfer entra com a saída e o destino; sem o preço do Pix, o campo nem aparece', () => {
  const item = itemDaSessao(
    { codigo: 'ON-DEF456', tipo: 'transfer', totalCentavos: 80000 },
    {
      passeioNome: 'Traslado privado',
      data: '2026-12-01',
      pessoasTexto: '3 pasajeros',
      transfer: {
        veiculo: 'Auto ejecutivo',
        ida: { saida: 'Aeropuerto de Galeão (GIG), Río', destino: 'Búzios, Posada de prueba', data: '2026-12-01', hora: '14 h' },
        passageiros: '3 pasajeros',
        malas: 'Grandes (23 kg): 2',
      },
    },
    'es-ar',
    '{data} a las {hora}',
  );
  assert.equal(item.nome, 'Traslado privado: Aeropuerto de Galeão (GIG), Río → Búzios, Posada de prueba');
  assert.equal(item.descricao, `${formatarDataIso('2026-12-01', 'es-AR')} a las 14 h · 3 pasajeros`);
  assert.equal(item.tipo, 'transfer');
  assert.equal(item.totalCentavos, 80000);
  assert.equal('totalPixCentavos' in item, false);
});

test('uma reserva antiga sem hora e sem tipo: a descrição fica só com a data, e o tipo vira passeio', () => {
  const item = itemDaSessao(
    { codigo: 'ON-GHI789', totalCentavos: 15400 },
    { passeioNome: 'Schooner Tour in Búzios', data: '2026-11-20', pessoasTexto: '2 adults' },
    'en',
    '{data} at {hora}',
  );
  assert.equal(item.nome, 'Schooner Tour in Búzios');
  assert.equal(item.descricao, `${formatarDataIso('2026-11-20', 'en-US')} · 2 adults`);
  assert.equal(item.tipo, 'passeio');
});

test('a volta da Stripe: a página do pedido (vários itens) ou a da reserva (um item), no idioma, com o token codificado', () => {
  assert.equal(
    urlDeRetorno('https://orlanativa.online', 'es-ar', 'ON-ABC123', 'tok/en+', false),
    'https://orlanativa.online/es-ar/pedido/ON-ABC123?t=tok%2Fen%2B',
  );
  assert.equal(
    urlDeRetorno('https://orlanativa.online', 'pt', 'ON-ABC123', 'abc', true),
    'https://orlanativa.online/reserva/ON-ABC123?t=abc',
  );
  assert.equal(urlDeRetorno('http://localhost:3000', 'en', 'ON-ABC123', 'abc', true), 'http://localhost:3000/en/reserva/ON-ABC123?t=abc');
});

test('o item do carrinho vira um item agendado: a hora do passeio ou a da ida do transfer', () => {
  assert.deepEqual(
    itemAgendado({ tipo: 'passeio', slug: 'escuna-buzios', data: '2026-11-14', hora: '09:00', adultos: 2, meia: 0, gratis: 0 }),
    { tipo: 'passeio', data: '2026-11-14', horario: { hora: '09:00' } },
  );
  assert.deepEqual(
    itemAgendado({
      tipo: 'transfer',
      veiculo: 'carro',
      ida: { saida: { lugar: 'galeao' }, destino: { lugar: 'buzios', endereco: 'Pousada' }, data: '2026-12-01', hora: '14:00' },
      passageiros: 3,
      malas: { grandes: 2, medias: 0, mao: 2 },
    }),
    { tipo: 'transfer', data: '2026-12-01', transfer: { ida: { hora: '14:00' } } },
  );
});

// uma reserva fictícia da Stripe, só para as regras de tempo (nenhuma é de cliente)
const T0 = new Date('2026-11-09T15:00:00Z');
const depois = (segundos: number) => new Date(T0.getTime() + segundos * 1000);
const PENDENTE: ReservaPasseio = {
  codigo: 'ON-TESTE7',
  token: 'token-de-teste',
  criadaEm: '2026-11-09T14:50:00.000Z',
  atualizadaEm: T0.toISOString(),
  idioma: 'pt',
  status: 'pendente',
  provedor: 'stripe',
  pagamentoExternoId: 'cs_test_a1',
  data: '2026-11-20',
  totalCentavos: 15400,
  totalPixCentavos: 13860,
  cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+55 21 90000-0000' },
  pagamento: { metodo: 'cartao' },
  historico: [
    { em: '2026-11-09T14:50:00.000Z', evento: 'Reserva criada' },
    { em: T0.toISOString(), evento: 'Sessão de pagamento criada: cartão (cs_test_a1)' },
  ],
  tipo: 'passeio',
  passeio: { slug: 'escuna-buzios', nome: 'Passeio de Escuna em Búzios', cidade: 'Búzios', unidade: 'pessoa' },
  horario: { hora: '09:00', busca: false },
  adultos: 2,
  criancas: 0,
  unidades: 2,
  hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
};

test('o servidor só confere a sessão na Stripe depois de 60 s pendente, e no máximo a cada 10 s', () => {
  assert.equal(ESPERA_ANTES_DE_CONSULTAR_MS, 60_000);
  assert.equal(INTERVALO_ENTRE_CONSULTAS_MS, 10_000);
  assert.equal(pendenteDesde(PENDENTE), T0.toISOString());
  assert.equal(deveSincronizar(PENDENTE, depois(30)), false);
  assert.equal(deveSincronizar(PENDENTE, depois(59)), false);
  assert.equal(deveSincronizar(PENDENTE, depois(60)), true);
  // acabou de consultar: espera o intervalo
  const consultada: ReservaPasseio = { ...PENDENTE, pagamento: { metodo: 'cartao', ultimaConsulta: depois(60).toISOString() } };
  assert.equal(deveSincronizar(consultada, depois(65)), false);
  assert.equal(deveSincronizar(consultada, depois(70)), true);
  // uma sessão nova ("pagar de novo") recomeça a contagem
  const renovada: ReservaPasseio = {
    ...PENDENTE,
    pagamentoExternoId: 'cs_test_b2',
    historico: [...PENDENTE.historico, { em: depois(600).toISOString(), evento: 'Sessão de pagamento criada: Pix (cs_test_b2)' }],
  };
  assert.equal(pendenteDesde(renovada), depois(600).toISOString());
  assert.equal(deveSincronizar(renovada, depois(630)), false);
  assert.equal(deveSincronizar(renovada, depois(660)), true);
  // sem a sessão no histórico, conta da criação do pedido
  assert.equal(pendenteDesde({ ...PENDENTE, historico: [PENDENTE.historico[0]] }), PENDENTE.criadaEm);
});

test('fora da Stripe pendente nada é consultado: pago, WhatsApp, pedido antigo, sem sessão', () => {
  assert.equal(deveSincronizar({ ...PENDENTE, status: 'pago' }, depois(600)), false);
  assert.equal(deveSincronizar({ ...PENDENTE, status: 'expirado' }, depois(600)), false);
  assert.equal(deveSincronizar({ ...PENDENTE, pagamentoExternoId: undefined }, depois(600)), false);
  const whatsapp: ReservaPasseio = { ...PENDENTE, provedor: undefined, pagamentoExternoId: undefined, pagamento: { metodo: 'whatsapp' } };
  assert.equal(deveSincronizar(whatsapp, depois(600)), false);
  // uma reserva pendente do checkout antigo (sem provedor gravado, forma online) é da Pagar.me, não da Stripe
  const antiga: ReservaPasseio = { ...PENDENTE, provedor: undefined, pagamento: { metodo: 'pix', pedidoId: 'or_antigo' } };
  assert.equal(deveSincronizar(antiga, depois(600)), false);
});

test('a página carregada não espera os 60 s, mas respeita os 10 s entre uma consulta e outra', () => {
  // quem volta da Stripe em menos de um minuto, com o webhook atrasado, tem de ver o pedido pago
  assert.equal(deveSincronizar(PENDENTE, depois(0), 'pagina'), true);
  assert.equal(deveSincronizar(PENDENTE, depois(30), 'pagina'), true);
  // a pergunta de status (o padrão) ainda espera
  assert.equal(deveSincronizar(PENDENTE, depois(30), 'status'), false);
  assert.equal(deveSincronizar(PENDENTE, depois(30)), false);
  // recarregar a página não repete a consulta antes dos 10 s
  const consultada: ReservaPasseio = { ...PENDENTE, pagamento: { metodo: 'cartao', ultimaConsulta: depois(30).toISOString() } };
  assert.equal(deveSincronizar(consultada, depois(31), 'pagina'), false);
  assert.equal(deveSincronizar(consultada, depois(39), 'pagina'), false);
  assert.equal(deveSincronizar(consultada, depois(40), 'pagina'), true);
  // e continua valendo só para o pedido da Stripe pendente
  assert.equal(deveSincronizar({ ...PENDENTE, status: 'pago' }, depois(30), 'pagina'), false);
  assert.equal(deveSincronizar({ ...PENDENTE, status: 'expirado' }, depois(30), 'pagina'), false);
  assert.equal(deveSincronizar({ ...PENDENTE, pagamentoExternoId: undefined }, depois(30), 'pagina'), false);
  const whatsapp: ReservaPasseio = { ...PENDENTE, provedor: undefined, pagamentoExternoId: undefined, pagamento: { metodo: 'whatsapp' } };
  assert.equal(deveSincronizar(whatsapp, depois(30), 'pagina'), false);
});

test('de várias chamadas ao mesmo tempo, só uma fica com a vez de consultar o pedido', () => {
  zerarConsultasEmMemoria();
  assert.equal(CONSULTAS_POR_IP, 30);
  const t = T0.getTime();
  assert.equal(reservarConsulta('ON-TESTE7', t), true);
  // as outras sete da mesma leva ficam de fora, mesmo a que leu o relógio um instante antes
  for (let i = 0; i < 6; i++) assert.equal(reservarConsulta('ON-TESTE7', t), false);
  assert.equal(reservarConsulta('ON-TESTE7', t - 1), false);
  // e as dos segundos seguintes também
  assert.equal(reservarConsulta('ON-TESTE7', t + 4_000), false);
  assert.equal(reservarConsulta('ON-TESTE7', t + 9_999), false);
  // outro pedido não espera por este
  assert.equal(reservarConsulta('ON-TESTE8', t + 1_000), true);
  // passado o intervalo, a vez volta, e a contagem recomeça dali
  assert.equal(reservarConsulta('ON-TESTE7', t + 10_000), true);
  assert.equal(reservarConsulta('ON-TESTE7', t + 12_000), false);
  assert.equal(reservarConsulta('ON-TESTE7', t + 20_000), true);
  zerarConsultasEmMemoria();
  assert.equal(reservarConsulta('ON-TESTE7', t + 20_001), true);
  zerarConsultasEmMemoria();
});

test('a sessão nova só vale se ficou gravada no pedido: pago ou cancelado no meio do caminho, ela tem de ser expirada', () => {
  // gravou: a sessão corrente do pedido é a nova, e ele espera o pagamento
  assert.equal(sessaoFicouGravada({ ...PENDENTE, pagamentoExternoId: 'cs_test_b2' }, 'cs_test_b2'), true);
  // o pedido não aceitou a sessão (registrarSessaoCriada devolve-o como está, com a sessão que tinha)
  for (const status of ['pago', 'cancelado', 'reembolsado', 'contestado'] as const) {
    assert.equal(sessaoFicouGravada({ ...PENDENTE, status }, 'cs_test_b2'), false, status);
    // nem com o mesmo id um pedido fechado espera pagamento
    assert.equal(sessaoFicouGravada({ ...PENDENTE, status, pagamentoExternoId: 'cs_test_b2' }, 'cs_test_b2'), false, status);
  }
  // outra sessão gravada, ou nenhuma: a nova não é a do pedido
  assert.equal(sessaoFicouGravada(PENDENTE, 'cs_test_b2'), false);
  assert.equal(sessaoFicouGravada({ status: 'pendente' }, 'cs_test_b2'), false);
});

test('dois "Pagar" quase juntos: a sessão do outro clique também é fechada, sem repetir e sem fechar a nova', () => {
  // o caso de sempre: a sessão lida no começo é a mesma que estava no pedido na hora de gravar
  assert.deepEqual(sessoesSubstituidas('cs_test_x', 'cs_test_x', 'cs_test_b'), ['cs_test_x']);
  // o outro clique gravou a sessão dele no meio: fecha a antiga e a dele, nessa ordem
  assert.deepEqual(sessoesSubstituidas('cs_test_x', 'cs_test_a', 'cs_test_b'), ['cs_test_x', 'cs_test_a']);
  // primeiro "Pagar" do pedido (nenhuma sessão antes), com o outro clique no meio
  assert.deepEqual(sessoesSubstituidas(undefined, 'cs_test_a', 'cs_test_b'), ['cs_test_a']);
  // nada antes: nada a fechar
  assert.deepEqual(sessoesSubstituidas(undefined, undefined, 'cs_test_b'), []);
  // o mesmo clique repetido devolve a mesma sessão (a Stripe reconhece a chave): a nova nunca entra na lista
  assert.deepEqual(sessoesSubstituidas('cs_test_b', 'cs_test_b', 'cs_test_b'), []);
  assert.deepEqual(sessoesSubstituidas('cs_test_x', 'cs_test_b', 'cs_test_b'), ['cs_test_x']);
});

test('o bloqueio de uma estadia do site leva a sessão de pagamento como referência e o item do pedido', () => {
  assert.deepEqual(
    linhaDeBloqueioDoSite({ casaId: 'casa-1', inicio: '2026-12-20', fim: '2026-12-27', itemPedidoId: 'item-1' }, 'cs_test_a1'),
    { casa_id: 'casa-1', inicio: '2026-12-20', fim: '2026-12-27', origem: 'site', referencia: 'cs_test_a1', item_pedido_id: 'item-1' },
  );
});
