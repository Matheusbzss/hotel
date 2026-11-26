import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { frasesDoDocumento } from '../src/content/legal/argentino.ts';
import { textosLegais } from '../src/content/legal/online.ts';
import { IDIOMAS, type Idioma } from '../src/i18n/config.ts';
import { texto } from '../src/i18n/conteudo.ts';
import {
  aplicarCancelamento,
  dentroDosSeteDiasCorridos,
  diaDoPedidoValido,
  linhaDoCancelamentoSemReembolso,
  linhasDaRegraDasCasas,
  motivoCombinaComAData,
  motivosQueCombinam,
  motivosQueNaoAparecem,
  pedidoDoCliente,
  registroDoCancelamento,
  travaDaDesistencia,
  travaDosSeteDias,
  travaPelaDesistencia,
} from '../src/lib/cancelar-sem-reembolso.ts';
import { AVISO_DESISTENCIA } from '../src/lib/desistencia.ts';
import { emailAvisoDasDatasDaCasa, emailLembrete, emailPagamentoAprovado, type ItemDoPedido } from '../src/lib/email/mensagens.ts';
import { escaparHtml } from '../src/lib/email/modelo.ts';
import { textosEmail } from '../src/lib/email/textos.ts';
import {
  ANTECEDENCIA_CARTAO_MINUTOS,
  HORA_LIMITE_PARA_PAGAR_A_CASA,
  cartaoDisponivel,
  pixDisponivel,
  type ItemAgendado,
} from '../src/lib/formas-pagamento.ts';
import { ANTECEDENCIA_MINIMA_MINUTOS, paraMinutos } from '../src/lib/horarios.ts';
import { ERROS_DO_PAINEL, agruparPedidos } from '../src/lib/pedidos-painel.ts';
import { AJUDA_DO_DIA_DO_PEDIDO, telaDoCancelamento, type ContextoDoResumo } from '../src/lib/resumo-do-painel.ts';
import type { Reserva, ReservaCasa, ReservaPasseio } from '../src/lib/reservas.ts';
import { avisoDasDatasNaoPresas, vouchersComAvisoDasDatas } from '../src/lib/trava-das-casas.ts';

// A REVISÃO DO PACOTE 2 da reserva das casas (26/11/2026): os achados do revisor sobre o commit e150e11. A regra das casas
// contada do dia em que o cliente pediu (achado 1), os prazos de pagar a casa nos textos legais (2), o voucher da casa que não
// vai no e-mail sem as datas presas (3), o "fora da política" com a estadia começada (4), os 7 dias corridos da casa (5), o
// lembrete do carrinho com casa (6), a data dos textos legais no roteiro (7), o "Reativar" (9) e o item 2 dos Termos (10).
// As regras rodam aqui em node; as rotas, que usam o "@/", são conferidas pela leitura do código, no fim. Pedidos fictícios.

const em = (dataHora: string) => new Date(`${dataHora}-03:00`);

/** A casa paga no Pix pela Stripe, comprada em 01/11 (fora dos 7 dias), com a entrada em 31/12. */
const CASA: ReservaCasa = {
  codigo: 'ON-CASA01',
  token: 'token-de-teste',
  criadaEm: '2026-11-01T15:00:00.000Z',
  atualizadaEm: '2026-11-01T15:05:00.000Z',
  idioma: 'pt',
  status: 'pago',
  provedor: 'stripe',
  paymentIntentId: 'pi_da_casa',
  pagamentoExternoId: 'cs_test_da_casa',
  data: '2026-12-31',
  totalCentavos: 990000,
  totalPixCentavos: 891000,
  cliente: { nome: 'Teste da Silva', email: 'teste@exemplo.com', telefone: '+54 911 0000-0000' },
  pagamento: { metodo: 'pix', pagoEm: '2026-11-01T15:05:00.000Z', cobrar: { cartao: 495000, pix: 445500 } },
  historico: [
    { em: '2026-11-01T15:00:00.000Z', evento: 'Reserva criada' },
    { em: '2026-11-01T15:05:00.000Z', evento: 'Pago (webhook da Stripe)' },
  ],
  tipo: 'casa',
  casa: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'mansao-ferradura-vista-mar',
    nome: 'Mansão Ferradura Vista Mar',
    cidade: 'buzios',
  },
  saida: '2027-01-02',
  hospedes: 10,
  sinalCentavos: 495000,
  sinalPixCentavos: 445500,
  linhas: [{ tipo: 'semana', noites: 2, diariaCentavos: 495000 }],
};

/** Um passeio pago pela Stripe, para conferir que nada muda fora das casas. */
const PASSEIO: ReservaPasseio = {
  codigo: 'ON-PAS001',
  token: 'token-de-teste',
  criadaEm: CASA.criadaEm,
  atualizadaEm: CASA.atualizadaEm,
  idioma: 'pt',
  status: 'pago',
  provedor: 'stripe',
  paymentIntentId: 'pi_do_passeio',
  tipo: 'passeio',
  data: '2026-12-20',
  horario: { hora: '09:00', busca: false },
  totalCentavos: 15400,
  totalPixCentavos: 13860,
  cliente: CASA.cliente,
  pagamento: CASA.pagamento,
  historico: CASA.historico,
  passeio: { slug: 'escuna-buzios', nome: 'Escuna em Búzios', cidade: 'buzios', unidade: 'pessoa' },
  adultos: 2,
  criancas: 0,
  unidades: 2,
  hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
};

const comDesistencia = <T extends Reserva>(r: T, quando: string): T => ({
  ...r,
  historico: [...r.historico, { em: quando, evento: `${AVISO_DESISTENCIA}: responder ao cliente por e-mail em até 1 dia útil` }],
});

const contexto = (agora: Date, mudar: Partial<ContextoDoResumo> = {}): ContextoDoResumo => ({
  agora,
  saldo: null,
  emailLigado: true,
  descrever: (r) => r.codigo,
  volta: {},
  ...mudar,
});

/* ------------------------------------------------------------------ */
/* Achado 1: a regra das casas conta do dia em que o cliente pediu      */

test('achado 1: o caso do revisor, a desistência pelo site a 35 dias da entrada e a equipe a 29, devolve o sinal inteiro', () => {
  // entrada em 31/12; o cliente toca em "Desistir da compra" em 26/11 (fora dos 7 dias); a equipe abre o painel em 02/12
  const agora = em('2026-12-02T12:00:00');
  const pediu = comDesistencia(CASA, em('2026-11-26T10:00:00').toISOString());
  const pedido = pedidoDoCliente(pediu, undefined, agora);
  assert.equal(pedido.origem, 'desistencia');
  assert.equal(pedido.em.toISOString(), em('2026-11-26T10:00:00').toISOString());
  // contado do pedido: 35 dias, o sinal volta inteiro, e "fora da política" não aparece (só "Outro motivo")
  assert.deepEqual(motivosQueCombinam([pediu], agora, pedido.em), ['outro']);
  assert.equal(motivoCombinaComAData('fora-da-politica', [pediu], agora, pedido.em), false);
  const [linha] = linhasDaRegraDasCasas([pediu], agora, pedido);
  assert.equal(
    linha,
    'ON-CASA01: faltavam 35 dias para a entrada quando o cliente pediu (dias de calendário até a entrada (31/12/2026), contados de 26/11/2026, o dia em que o cliente pediu a desistência pelo site, no horário de Brasília): pela regra das casas, o cancelamento devolve o sinal inteiro.',
  );
  // a tela do painel faz a mesma conta sozinha (a desistência está no histórico)
  const tela = telaDoCancelamento(agruparPedidos([pediu])[0], { acao: 'cancelar_sem_reembolso' }, contexto(agora));
  const motivo = tela?.formulario?.campos.find((c) => c.nome === 'motivo');
  assert.ok(motivo?.tipo === 'escolha');
  assert.deepEqual(
    motivo.opcoes.map((o) => o.valor),
    ['outro'],
  );
  assert.match(tela?.linhas.find((l) => l.rotulo === 'Regra das casas')?.valor[0] ?? '', /faltavam 35 dias/);
  // contado de hoje (sem o pedido), seriam 29 dias: é o caso que antes deixava a agência ficar com o sinal
  assert.deepEqual(motivosQueCombinam([CASA], agora), ['fora-da-politica', 'outro']);
});

test('achado 1: sem a desistência pelo site, a equipe informa o dia em que o cliente pediu, e a tela refaz a conta', () => {
  const agora = em('2026-12-02T12:00:00');
  const [p] = agruparPedidos([CASA]);
  // sem informar: a conta de hoje, com o convite para informar o dia, e o formulário do dia já com hoje
  const hoje = telaDoCancelamento(p, { acao: 'cancelar_sem_reembolso' }, contexto(agora));
  assert.ok(hoje);
  assert.match(
    hoje.linhas.find((l) => l.rotulo === 'Regra das casas')?.valor[0] ?? '',
    /contados de hoje, 02\/12\/2026.*informe abaixo o dia em que ele pediu/,
  );
  assert.deepEqual(hoje.dataDoPedido && { valor: hoje.dataDoPedido.valor, min: hoje.dataDoPedido.minimo, max: hoje.dataDoPedido.maximo }, {
    valor: '2026-12-02',
    min: '2026-11-01',
    max: '2026-12-02',
  });
  assert.equal(hoje.dataDoPedido?.ajuda, AJUDA_DO_DIA_DO_PEDIDO);
  assert.deepEqual(hoje.dataDoPedido?.escondidos, [{ nome: 'acao', valor: 'cancelar_sem_reembolso' }]);
  assert.equal(hoje.dataDoPedido?.endereco, '/admin/resumo/ON-CASA01');
  assert.equal(hoje.formulario?.escondidos, undefined);
  // informado 26/11: 35 dias, só "Outro motivo", e o dia vai escondido no segundo toque (a rota confere de novo)
  const informado = telaDoCancelamento(
    p,
    { acao: 'cancelar_sem_reembolso' },
    contexto(agora, { pedidoEm: '2026-11-26', volta: { filtro: 'pagas', busca: 'Silva' } }),
  );
  assert.ok(informado);
  assert.match(
    informado.linhas.find((l) => l.rotulo === 'Regra das casas')?.valor[0] ?? '',
    /faltavam 35 dias para a entrada quando o cliente pediu .*contados de 26\/11\/2026, o dia em que o cliente pediu, informado abaixo.*devolve o sinal inteiro\.$/,
  );
  const motivo = informado.formulario?.campos.find((c) => c.nome === 'motivo');
  assert.ok(motivo?.tipo === 'escolha');
  assert.deepEqual(
    motivo.opcoes.map((o) => o.valor),
    ['outro'],
  );
  assert.deepEqual(informado.formulario?.escondidos, [{ nome: 'pedidoEm', valor: '2026-11-26' }]);
  assert.equal(informado.dataDoPedido?.valor, '2026-11-26');
  assert.deepEqual(informado.dataDoPedido?.escondidos, [
    { nome: 'acao', valor: 'cancelar_sem_reembolso' },
    { nome: 'status', valor: 'pagas' },
    { nome: 'q', valor: 'Silva' },
  ]);
  // o dia que não vale (depois de hoje, antes da compra, que não existe) não entra: a conta volta a ser a de hoje
  for (const ruim of ['2026-12-03', '2026-10-31', '2026-02-30', '26/11/2026', '']) {
    const tela = telaDoCancelamento(p, { acao: 'cancelar_sem_reembolso' }, contexto(agora, { pedidoEm: ruim }));
    assert.equal(tela?.formulario?.escondidos, undefined, ruim);
    assert.match(tela?.linhas.find((l) => l.rotulo === 'Regra das casas')?.valor[0] ?? '', /contados de hoje/, ruim);
  }
  // o passeio sozinho não tem o formulário do dia, e o dia no endereço não muda nada nele
  const [doPasseio] = agruparPedidos([{ ...PASSEIO, data: '2026-12-02', horario: { hora: '20:00', busca: false } }]);
  const telaDoPasseio = telaDoCancelamento(doPasseio, { acao: 'cancelar_sem_reembolso' }, contexto(agora, { pedidoEm: '2026-11-26' }));
  assert.equal(telaDoPasseio?.dataDoPedido, undefined);
  assert.equal(telaDoPasseio?.formulario?.escondidos, undefined);
  assert.deepEqual(
    telaDoPasseio?.formulario?.campos.find((c) => c.nome === 'motivo')?.tipo === 'escolha'
      ? (telaDoPasseio.formulario.campos.find((c) => c.nome === 'motivo') as { opcoes: { valor: string }[] }).opcoes.map((o) => o.valor)
      : [],
    ['fora-da-politica', 'outro'],
  );
});

test('achado 1: o dia do pedido do cliente: o mais cedo entre a desistência, o dia informado e agora, e só dias que valem', () => {
  const agora = em('2026-12-02T12:00:00');
  assert.deepEqual(pedidoDoCliente(CASA, undefined, agora), { em: agora, origem: 'hoje' });
  const informado = pedidoDoCliente(CASA, '2026-11-20', agora);
  assert.equal(informado.origem, 'informado');
  // contado do começo do dia, no horário de Brasília
  assert.equal(informado.em.toISOString(), '2026-11-20T03:00:00.000Z');
  // a desistência pelo site antes do dia informado vale; depois, vale o dia informado
  const desistiu = comDesistencia(CASA, em('2026-11-18T09:00:00').toISOString());
  assert.equal(pedidoDoCliente(desistiu, '2026-11-20', agora).origem, 'desistencia');
  assert.equal(pedidoDoCliente(desistiu, '2026-11-10', agora).origem, 'informado');
  // os dias que valem: do dia da compra (01/11 em Búzios) até hoje
  assert.equal(diaDoPedidoValido('2026-12-02', CASA, agora), true);
  assert.equal(diaDoPedidoValido('2026-11-01', CASA, agora), true);
  for (const ruim of ['2026-12-03', '2026-10-31', '2026-02-30', '2026-13-01', '2026-1-05', 'ontem']) {
    assert.equal(diaDoPedidoValido(ruim, CASA, agora), false, ruim);
  }
  // a rota recusa com a frase fixa do painel
  assert.match(ERROS_DO_PAINEL['data-do-pedido-invalida'], /entre o dia da compra e hoje.*Nada foi feito\.$/);
  // o histórico registra de que dia a regra das casas foi contada; o passeio, como sempre
  const registro = registroDoCancelamento({ acao: 'cancelar_sem_reembolso' }, ['ON-CASA01'], { motivo: 'outro', texto: 'x' }, agora, false);
  assert.match(
    linhaDoCancelamentoSemReembolso(registro, 'casas', informado),
    /Motivo: outro, escrito para o cliente: «x»\. Regra das casas contada de 20\/11\/2026, o dia em que o cliente pediu, informado no painel$/,
  );
  assert.match(
    linhaDoCancelamentoSemReembolso(registro, 'casas', pedidoDoCliente(CASA, undefined, agora)),
    /contada de 02\/12\/2026, o dia deste cancelamento no painel$/,
  );
  assert.equal(linhaDoCancelamentoSemReembolso(registro, 'passeios', informado), linhaDoCancelamentoSemReembolso(registro));
  const linhas = aplicarCancelamento(structuredClone(CASA) as Reserva, registro, null, 'casas', informado);
  assert.match(linhas[0], /Regra das casas contada de 20\/11\/2026/);
});

test('achado 1: "não compareceu" na casa só com a estadia já começada quando o cliente pediu (quem pediu antes não faltou)', () => {
  // a estadia começou em 31/12 às 15h; a equipe cancela em 02/01
  const agora = em('2027-01-02T10:00:00');
  // sem o pedido do cliente: a conta de agora, com a estadia começada
  assert.deepEqual(motivosQueCombinam([CASA], agora), ['nao-compareceu', 'outro']);
  // o cliente pediu em 20/12 (11 dias antes da entrada, fora dos 7 dias): fora da política, e não "não compareceu"
  const pedido = pedidoDoCliente(CASA, '2026-12-20', agora);
  assert.deepEqual(motivosQueCombinam([CASA], agora, pedido.em), ['fora-da-politica', 'outro']);
  assert.match(
    motivosQueNaoAparecem(['fora-da-politica', 'outro'], 'casas') ?? '',
    /^"Não compareceu" só aparece .*quando a estadia já tinha começado quando o cliente pediu\.$/,
  );
  // o cliente pediu em 20/11 (41 dias antes): o sinal volta inteiro, nem "fora da política" nem "não compareceu"
  assert.deepEqual(motivosQueCombinam([CASA], agora, pedidoDoCliente(CASA, '2026-11-20', agora).em), ['outro']);
});

/* ------------------------------------------------------------------ */
/* Achado 4: a estadia já começada                                      */

test('achado 4: com a estadia já começada, "fora da política" não aparece na casa, e a linha da regra diz por quê', () => {
  // o caso do revisor: comprada em 01/12, entrada em 03/12 às 15h, a equipe cancela em 04/12
  const casa: ReservaCasa = {
    ...CASA,
    data: '2026-12-03',
    saida: '2026-12-05',
    pagamento: { ...CASA.pagamento, pagoEm: '2026-12-01T15:00:00.000Z' },
  };
  const agora = em('2026-12-04T10:00:00');
  assert.deepEqual(motivosQueCombinam([casa], agora), ['nao-compareceu', 'outro']);
  assert.match(
    linhasDaRegraDasCasas([casa], agora)[0],
    /^ON-CASA01: a estadia já começou \(entrada em 03\/12\/2026 às 15h\): pela regra das casas, a agência fica com o sinal e não cobra o restante\. "Fora da política" não aparece/,
  );
  assert.match(motivosQueNaoAparecem(['nao-compareceu', 'outro'], 'casas') ?? '', /a estadia já tinha começado quando ele pediu\.$/);
  // o passeio que já começou continua com os três motivos (nada muda fora das casas)
  assert.deepEqual(motivosQueCombinam([{ ...PASSEIO, data: '2026-12-03' }], agora), ['fora-da-politica', 'nao-compareceu', 'outro']);
});

/* ------------------------------------------------------------------ */
/* Achado 5: os 7 dias corridos da casa                                 */

test('achado 5: os 7 dias da casa são dias corridos até as 23h59 do 7º dia depois da compra; os passeios, como sempre', () => {
  const pagaEm = em('2026-12-01T20:00:00').toISOString();
  assert.equal(dentroDosSeteDiasCorridos(pagaEm, em('2026-12-08T21:00:00')), true);
  assert.equal(dentroDosSeteDiasCorridos(pagaEm, em('2026-12-08T23:59:00')), true);
  assert.equal(dentroDosSeteDiasCorridos(pagaEm, em('2026-12-09T00:01:00')), false);
  // às 23h30 da compra em Búzios (já é o dia seguinte em UTC), a conta continua a do dia de Búzios
  assert.equal(dentroDosSeteDiasCorridos(em('2026-12-01T23:30:00').toISOString(), em('2026-12-08T23:00:00')), true);
  assert.equal(dentroDosSeteDiasCorridos(undefined, em('2026-12-08T21:00:00')), null);
  assert.equal(dentroDosSeteDiasCorridos('sem data', em('2026-12-08T21:00:00')), null);
  // o caso do revisor: paga em 01/12 às 20h, entrada em 20/12; em 08/12 às 21h ainda é dentro dos 7 dias
  const casa: ReservaCasa = { ...CASA, data: '2026-12-20', saida: '2026-12-22', pagamento: { ...CASA.pagamento, pagoEm: pagaEm } };
  const as21h = em('2026-12-08T21:00:00');
  assert.deepEqual(motivosQueCombinam([casa], as21h), ['outro']);
  assert.match(linhasDaRegraDasCasas([casa], as21h)[0], /dentro dos 7 dias do arrependimento.*a devolução é total/);
  // a trava dos 7 dias avisa também (o aviso vermelho e o "Estou ciente")
  assert.ok(travaDosSeteDias(casa, [casa], as21h));
  // no dia 09, fora dos 7 dias: "fora da política" volta (12 dias para a entrada)
  assert.deepEqual(motivosQueCombinam([casa], em('2026-12-09T00:30:00')), ['fora-da-politica', 'outro']);
  assert.equal(travaDosSeteDias(casa, [casa], em('2026-12-09T00:30:00')), null);
  // o passeio com a mesma compra conta 7 × 24 horas, como sempre: às 21h do dia 08 já está fora
  const passeio: ReservaPasseio = { ...PASSEIO, pagamento: { ...PASSEIO.pagamento, pagoEm: pagaEm } };
  assert.equal(travaDosSeteDias(passeio, [passeio], as21h), null);
  assert.ok(travaDosSeteDias(passeio, [passeio], em('2026-12-08T19:00:00')));
  // a desistência pedida pelo site no dia 08 às 21h: com casa, dentro; sem casa, fora (a conta de sempre)
  const desistiu = comDesistencia(casa, as21h.toISOString());
  assert.ok(travaPelaDesistencia(desistiu, true));
  assert.equal(travaPelaDesistencia(desistiu), null);
  assert.ok(travaDaDesistencia(desistiu, true));
  assert.equal(travaDaDesistencia(desistiu, false), null);
});

/* ------------------------------------------------------------------ */
/* Achado 2: os prazos de pagar a casa nos textos legais                */

/** Uma hora do dia (minutos desde a meia-noite), como cada idioma escreve nos textos legais. */
const hora: Record<'pt' | 'en' | 'es', (m: number) => string> = {
  pt: (m) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`,
  es: (m) => (m % 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h` : `${Math.floor(m / 60)} h`),
  en: (m) => {
    const h = Math.floor(m / 60);
    const h12 = h % 12 || 12;
    const sufixo = h < 12 ? 'a.m.' : 'p.m.';
    return m % 60 ? `${h12}:${String(m % 60).padStart(2, '0')} ${sufixo}` : `${h12} ${sufixo}`;
  },
};
const base = (idioma: Idioma): 'pt' | 'en' | 'es' => (idioma === 'es-ar' ? 'es' : idioma);

test('achado 2: os Termos e a Política com as casas dizem o prazo de pagar a casa do código (HORA_LIMITE_PARA_PAGAR_A_CASA)', () => {
  // a conta do código: o prazo da casa é a meia-noite que começa o dia da entrada; o Pix fecha 2 horas antes e o cartão, 30
  // minutos antes, os dois na véspera
  const limite = paraMinutos(HORA_LIMITE_PARA_PAGAR_A_CASA);
  assert.ok(limite - ANTECEDENCIA_MINIMA_MINUTOS < 0 && limite - ANTECEDENCIA_CARTAO_MINUTOS < 0, 'os dois fecham na véspera');
  const pix = (limite - ANTECEDENCIA_MINIMA_MINUTOS + 1440) % 1440;
  const cartao = (limite - ANTECEDENCIA_CARTAO_MINUTOS + 1440) % 1440;
  assert.deepEqual([hora.pt(pix), hora.pt(cartao)], ['22h', '23h30']);
  // e é o que o site faz: na véspera da entrada de 14/12, o Pix até as 22h e o cartão até as 23h30, em Búzios
  const casa: ItemAgendado[] = [{ tipo: 'casa', data: '2026-12-14' }];
  assert.equal(pixDisponivel(casa, em('2026-12-13T21:59:00')), true);
  assert.equal(pixDisponivel(casa, em('2026-12-13T22:00:01')), false);
  assert.equal(cartaoDisponivel(casa, em('2026-12-13T23:29:59')), true);
  assert.equal(cartaoDisponivel(casa, em('2026-12-13T23:30:01')), false);

  const com = textosLegais(true, true, true);
  const sem = textosLegais(true, true, false);
  const frases: Record<'pt' | 'en' | 'es', { termos: string; cancelamento: string }> = {
    pt: {
      termos: `Na casa de temporada, o pagamento vai só até a véspera da entrada: Pix até as ${hora.pt(pix)} e cartão até as ${hora.pt(cartao)}, no horário de Brasília.`,
      cancelamento: `na casa de temporada, só até as ${hora.pt(pix)} da véspera da entrada, no horário de Brasília.`,
    },
    en: {
      termos: `For holiday homes, payment is only possible until the day before check-in: Pix until ${hora.en(pix)} and card until ${hora.en(cartao)}, Brasília time.`,
      cancelamento: `for holiday homes, only until ${hora.en(pix)} on the day before check-in, Brasília time.`,
    },
    es: {
      termos: `En la casa de temporada, el pago es posible solo hasta la víspera de la entrada: Pix hasta las ${hora.es(pix)} y tarjeta hasta las ${hora.es(cartao)}, en el horario de Brasilia.`,
      cancelamento: `en la casa de temporada, solo hasta las ${hora.es(pix)} de la víspera de la entrada, en el horario de Brasilia.`,
    },
  };
  const antiga: Record<'pt' | 'en' | 'es', RegExp> = {
    pt: /\(passeio, transfer ou entrada na casa\)/,
    en: /\(tour, transfer or check-in at the home\)/,
    es: /\(paseo, traslado o entrada a la casa\)/,
  };
  for (const idioma of IDIOMAS) {
    const termos = frasesDoDocumento(texto(com.termos, idioma)).join('\n');
    const cancelamento = frasesDoDocumento(texto(com.cancelamento, idioma)).join('\n');
    assert.ok(termos.includes(frases[base(idioma)].termos), `termos ${idioma}`);
    assert.ok(cancelamento.includes(frases[base(idioma)].cancelamento), `cancelamento ${idioma}`);
    // a frase antiga, que deixava pagar a casa até 2 horas antes da entrada, sumiu da versão com as casas
    assert.doesNotMatch(termos, antiga[base(idioma)], idioma);
    // num pedido com casa e passeio, vale o prazo que termina primeiro (a conta do código: o menor dos prazos)
    assert.match(
      termos,
      /vale o prazo que termina primeiro|the deadline that ends first applies|vale el plazo que termina primero/,
      idioma,
    );
    // a versão sem as casas (no ar hoje) continua igual, palavra por palavra
    assert.match(frasesDoDocumento(texto(sem.termos, idioma)).join('\n'), antiga[base(idioma)], idioma);
    // o mesmo número de frases: só trocas, nada sumiu nem entrou
    assert.equal(frasesDoDocumento(texto(com.termos, idioma)).length, frasesDoDocumento(texto(sem.termos, idioma)).length + 2, idioma);
  }
  // o es-ar lê as mesmas frases do neutro (sem verbo em vos)
  assert.ok(frasesDoDocumento(texto(com.termos, 'es-ar')).join('\n').includes(frases.es.termos));
});

/* ------------------------------------------------------------------ */
/* Achado 10: o item 2 dos Termos com as casas                          */

test('achado 10: o item 2 dos Termos com as casas diz que a agência também vende as estadias nas casas de temporada', () => {
  const com = textosLegais(true, true, true);
  const sem = textosLegais(true, true, false);
  const nova: Record<'pt' | 'en' | 'es', string> = {
    pt: 'e estadias em casas de temporada de proprietários parceiros.',
    en: 'and stays in holiday homes of partner property owners.',
    es: 'y estadías en casas de temporada de propietarios asociados.',
  };
  const cdc: Record<'pt' | 'en' | 'es', RegExp> = {
    pt: /Perante você, respondemos nos termos do Código de Defesa do Consumidor\./,
    en: /Towards you, we are responsible under the Brazilian Consumer Protection Code\./,
    es: /respondemos según el Código de Defensa del Consumidor de Brasil\./,
  };
  for (const idioma of IDIOMAS) {
    const doc = texto(com.termos, idioma);
    const item2 = doc.secoes.find((s) => /^2\./.test(s.titulo));
    assert.ok(item2, idioma);
    assert.ok(item2.paragrafos[0].endsWith(nova[base(idioma)]), idioma);
    assert.match(item2.paragrafos.join(' '), cdc[base(idioma)], idioma);
    assert.ok(!texto(sem.termos, idioma).secoes[1].paragrafos[0].includes(nova[base(idioma)]), idioma);
  }
  // no es-ar, o "Frente a vos" da frase de sempre continua
  assert.match(texto(com.termos, 'es-ar').secoes[1].paragrafos.join(' '), /Frente a vos/);
});

/* ------------------------------------------------------------------ */
/* Achado 3: o voucher da casa sem as datas presas não vai no e-mail    */

const SITE = {
  url: 'https://orlanativa.online',
  logo: 'https://orlanativa.online/l.png',
  nome: 'Orla Nativa',
  dominio: 'orlanativa.online',
};
const pagamentoAprovado = (idioma: Idioma, itens: ItemDoPedido[]) =>
  emailPagamentoAprovado({
    idioma,
    nome: 'Teste',
    codigo: 'ON-PEDCAS',
    linkPedido: 'https://orlanativa.online/p',
    itens,
    site: SITE,
    comCasa: true,
    total: { valor: 'R$ 4.455,00' },
    forma: 'pix',
    anexos: false,
    whatsapp: 'https://wa.me/5522000000000',
    casa: { chegada: { valor: 'R$ 4.455,00' } },
  });
const casaSemDatas: ItemDoPedido = { nome: 'Mansão Ferradura Vista Mar', linhas: ['2 diárias'], datasAConfirmar: true };
const passeioComVoucher: ItemDoPedido = {
  nome: 'Escuna em Búzios',
  linhas: ['20/12/2026'],
  voucher: { codigo: 'ON-PAS001', link: 'https://orlanativa.online/v', pdf: 'https://orlanativa.online/pdf' },
};

test('achado 3: o e-mail do pagamento aprovado vai sem o voucher da casa sem as datas presas, nos 4 idiomas', () => {
  for (const idioma of IDIOMAS) {
    const T = textosEmail(idioma);
    // o pré-cabeçalho só vai no HTML, com o apóstrofo escapado
    const A = {
      ...T.pagamentoAprovado,
      preCabecalho: escaparHtml(T.pagamentoAprovado.preCabecalho),
      preCabecalhoAConfirmar: escaparHtml(T.pagamentoAprovado.preCabecalhoAConfirmar),
    };
    // com o passeio: o voucher do passeio vai, a casa vai com a linha das datas a confirmar e o parágrafo
    const junto = pagamentoAprovado(idioma, [passeioComVoucher, casaSemDatas]);
    assert.ok(junto.texto.includes(A.casaAConfirmar), idioma);
    assert.ok(junto.texto.includes(T.comum.datasAConfirmar), idioma);
    assert.ok(junto.texto.includes(A.texto), idioma);
    assert.ok(junto.texto.includes('ON-PAS001'), idioma);
    assert.ok(junto.html.includes(A.preCabecalho), idioma);
    // só a casa: nenhum voucher, o começo e o pré-cabeçalho dizem só que o pagamento chegou
    const so = pagamentoAprovado(idioma, [casaSemDatas]);
    assert.ok(so.texto.includes(A.textoSemVoucher) && !so.texto.includes(A.texto), idioma);
    assert.ok(so.html.includes(A.preCabecalhoAConfirmar) && !so.html.includes(A.preCabecalho), idioma);
    assert.ok(so.texto.includes(A.casaAConfirmar), idioma);
    assert.ok(!so.texto.includes(A.vouchers), idioma);
    // sem a casa a confirmar: o e-mail de sempre
    const sempre = pagamentoAprovado(idioma, [passeioComVoucher, { ...casaSemDatas, datasAConfirmar: undefined }]);
    assert.ok(!sempre.texto.includes(A.casaAConfirmar) && !sempre.texto.includes(T.comum.datasAConfirmar), idioma);
    assert.ok(sempre.html.includes(A.preCabecalho) && sempre.texto.includes(A.vouchers), idioma);
    for (const t of [junto.texto, so.texto]) assert.doesNotMatch(t, /\{\w+\}/, idioma);
  }
  // as frases novas não prometem o que não existe: a equipe confirma pelo WhatsApp (o botão do WhatsApp continua no e-mail)
  assert.match(
    textosEmail('pt').pagamentoAprovado.casaAConfirmar,
    /fala com você pelo WhatsApp\. Por isso, o voucher da casa não vai neste e-mail\.$/,
  );
  // o espanhol sem verbo em "tú": o es-ar usa as mesmas frases
  for (const chave of ['casaAConfirmar', 'textoSemVoucher', 'preCabecalhoAConfirmar'] as const) {
    assert.equal(textosEmail('es-ar').pagamentoAprovado[chave], textosEmail('es').pagamentoAprovado[chave], chave);
  }
  assert.equal(textosEmail('es-ar').comum.datasAConfirmar, textosEmail('es').comum.datasAConfirmar);
});

test('achado 3: o aviso e o e-mail à equipe dizem que o cliente já viu o pagamento confirmado e pedem que falem com ele hoje', () => {
  const linha = avisoDasDatasNaoPresas(CASA);
  assert.match(linha, /O cliente já tem o pagamento confirmado e pode ter o voucher desta casa/);
  assert.match(linha, /fale com ele hoje/);
  const email = emailAvisoDasDatasDaCasa({
    codigo: 'ON-CASA01',
    linhas: [linha.slice('Aviso: '.length)],
    linkPainel: 'https://x/admin',
    site: SITE,
  });
  assert.match(email.texto, /O cliente já recebeu a confirmação automática do pagamento e vê a reserva como paga na página do pedido\./);
  assert.match(
    email.texto,
    /só leva o voucher da casa com as datas presas na hora do envio; se ele saiu antes deste aviso, o cliente já tem o voucher\. Fale com o cliente hoje\./,
  );
  assert.doesNotMatch(email.texto, /antes de confirmar/);
  // uma linha por voucher (pela marca do voucher, não pela frase inteira)
  assert.deepEqual([...vouchersComAvisoDasDatas([{ evento: linha }, { evento: 'Aviso: outra coisa' }, { evento: linha }])], ['ON-CASA01']);
  assert.equal(vouchersComAvisoDasDatas([{ evento: 'Pago (webhook da Stripe)' }]).size, 0);
});

test('achado 3, no código: o e-mail só lê a trava (quem prende é a rota), espera a conferência e tira o voucher e o PDF da casa', () => {
  const envio = codigo('src', 'lib', 'email', 'pedidos.ts');
  const decide = corpo(envio, 'async function casasDoEmailDoPagamento(');
  tem(decide, 'semTrava = await casasSemATrava(lista);');
  tem(decide, "if (semTrava.some((voucher) => !comAviso.has(voucher))) return 'esperar';");
  tem(decide, 'return { aConfirmar: comAviso };');
  // o e-mail nunca prende datas nem refaz o calendário (crítica de 26/11, furo 3)
  assert.doesNotMatch(envio, /conferirDatasDoPedidoPago|calendarioMudou|prenderDatasDoPedido|bloquearCasasDoPedido/);
  const enviar = corpo(envio, 'export async function enviarEmailDoPedido(');
  // só no pagamento aprovado com casa; a espera vem antes de qualquer linha gravada
  tem(
    enviar,
    "const casas = tipo === 'pagamento-aprovado' && comCasa ? await casasDoEmailDoPagamento(lista, r, pedido) : { aConfirmar: new Set<string>() };",
  );
  assert.ok(onde(enviar, "if (casas === 'esperar') {") < onde(enviar, 'await anotar(r.codigo, AVISO_EMAIL_PAGO_SAINDO);'));
  tem(enviar, "itens: itensDoEmail(lista, idioma, tipo === 'pagamento-aprovado' || tipo === 'link-do-pedido', aConfirmar),");
  tem(enviar, 'anexos = await anexosDosVouchers(aConfirmar.size ? lista.filter((v) => !aConfirmar.has(v.codigo)) : lista);');
  tem(envio, 'if (aConfirmar.has(v.codigo)) return { nome, linhas, datasAConfirmar: true };');
  // a leitura da trava, sem prender nada
  const carrinho = codigo('src', 'lib', 'pedido-carrinho.ts');
  const ler = corpo(carrinho, 'export async function casasSemATrava(');
  assert.doesNotMatch(ler, /bloquearCasasDoPedido|renomearPeloItem|delete\(|insert\(|update\(/);
  tem(ler, 'const presos = new Set(await itensComBloqueio(estadias.map((e) => e.itemPedidoId)));');
  // o e-mail que esperou sai pelo agendamento dos pendentes (o pago sem o aviso de saída nem a linha do envio)
  tem(codigo('src', 'lib', 'email', 'pendentes.ts'), "await enviarEmailDoPedido('pagamento-aprovado', p.codigo);");
  // a rede: uma linha por voucher
  const rede = corpo(codigo('src', 'lib', 'rede-das-casas.ts'), 'export async function avisarDatasNaoPresas(');
  tem(rede, 'const faltam = semTrava.filter((v) => !ja.has(v.codigo)).map(avisoDasDatasNaoPresas);');
});

/* ------------------------------------------------------------------ */
/* Achado 6: o lembrete do carrinho com casa                            */

test('achado 6: o lembrete do carrinho com casa mostra "A pagar agora", e a linha da casa é o único "Total"', () => {
  for (const idioma of IDIOMAS) {
    const T = textosEmail(idioma);
    const lembrete = (comCasa: boolean) =>
      emailLembrete({
        idioma,
        n: 1,
        itens: [{ nome: 'Mansão Ferradura Vista Mar', linhas: ['Total da estadia: R$ 1.800,00 no Pix ou R$ 2.000,00 no cartão'] }],
        totais: { pix: { valor: 'R$ 900,00' }, cartao: { valor: 'R$ 1.000,00' } },
        linkVoltar: 'https://x/voltar',
        linkSair: 'https://x/sair',
        site: SITE,
        ...(comCasa ? { comCasa: true } : {}),
      });
    const comCasa = lembrete(true);
    assert.ok(comCasa.texto.includes(T.comum.aPagarNoPix) && comCasa.texto.includes(T.comum.aPagarNoCartao), idioma);
    assert.ok(!comCasa.texto.includes(T.comum.totalNoPix) && !comCasa.texto.includes(T.comum.totalNoCartao), idioma);
    // sem casa: o lembrete de sempre
    const semCasa = lembrete(false);
    assert.ok(semCasa.texto.includes(T.comum.totalNoPix) && !semCasa.texto.includes(T.comum.aPagarNoPix), idioma);
  }
  tem(codigo('src', 'lib', 'carrinho-lembretes.ts'), 'site, ...(itens.some((i) => i.casa) ? { comCasa: true } : {})');
});

/* ------------------------------------------------------------------ */
/* Achado 7: a data dos textos legais no roteiro do dia de ligar         */

test('achado 7: o roteiro do dia de ligar diz para trocar a data dos textos com as casas, no mesmo deploy', () => {
  const leia = readFileSync('README.md', 'utf8');
  assert.match(leia, /No dia de ligar `publico`, no mesmo deploy: trocar `ATUALIZADO_EM_CASAS` para a data desse dia em Búzios/);
  assert.match(
    readFileSync(path.join('docs', 'pagamentos-stripe.md'), 'utf8'),
    /trocar `ATUALIZADO_EM_CASAS` para a data desse dia em Búzios/,
  );
  assert.match(readFileSync(path.join('src', 'content', 'legal', 'casas.ts'), 'utf8'), /NO DIA DE LIGAR/);
});

/* ------------------------------------------------------------------ */
/* Achados 1 e 9 nas rotas: o que só dá para ver no código              */

test('achado 1, na rota: o dia do pedido só com casa, conferido, e o mesmo dia no motivo e no histórico', () => {
  const rota = codigo('src', 'app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  const bloco = rota.slice(rota.indexOf("if (acao === 'cancelar_sem_reembolso' ||"), rota.indexOf("if (acao === 'devolvido_por_fora') {"));
  const passos = [
    "const motivo = motivoDoFormulario(form.get('motivo'), form.get('texto'));",
    'const comCasa = plano.cancelar.some(ehCasa);',
    "const informado = comCasa ? String(form.get('pedidoEm') ?? '').trim() : '';",
    "if (informado && !diaDoPedidoValido(informado, alvo, agora)) return voltar('data-do-pedido-invalida');",
    'const pedido = pedidoDoCliente(alvo, informado || undefined, agora);',
    "if (!motivoCombinaComAData(motivo.motivo, plano.cancelar, agora, pedido.em)) return voltar('motivo-fora-da-data');",
    "if (plano.trava && !ciente) return voltar('falta-ciente');",
    'aplicarCancelamento(r, registro, conferencia.trava, regraDosVouchers(plano.cancelar), pedido)',
  ];
  let ultimo = -1;
  for (const passo of passos) {
    const i = onde(bloco, passo);
    assert.ok(i > ultimo, passo);
    ultimo = i;
  }
  // a tela manda o dia escondido no segundo toque, e a página da tela lê o dia do endereço
  const pagina = codigo('src', 'app', 'admin', 'resumo', '[codigo]', 'page.tsx');
  tem(pagina, "const pedidoEm = typeof q.pedidoEm === 'string' ? q.pedidoEm.trim() : undefined;");
  tem(pagina, '{f.escondidos?.map((e) => (<input key={e.nome} type="hidden" name={e.nome} value={e.valor} />))}');
  tem(pagina, '<form method="get" action={d.endereco}');
  tem(pagina, '{tela.dataDoPedido && <DiaDoPedido d={tela.dataDoPedido} />}');
  assert.doesNotMatch(pagina, /['"]use client['"]|onClick|onSubmit|useState|useEffect/);
});

test('achado 9, na rota: a reativação recusada relê o pedido antes de soltar, e o toque repetido confere as datas', () => {
  const rota = codigo('src', 'app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  const reativar = corpo(rota, 'async function reativarPagamentoRetido(');
  const falha = reativar.slice(reativar.indexOf('} catch (e) {'), reativar.indexOf("return 'datas-sem-conferir';"));
  tem(falha, 'await soltarAsDatasDaReativacaoRecusada(alvo, retido.sessaoId);');
  assert.doesNotMatch(falha, /liberarBloqueiosDaSessao/);
  const soltar = corpo(rota, 'async function soltarAsDatasDaReativacaoRecusada(');
  assert.ok(
    onde(soltar, 'if (!relido || pagoPeloRetidoReativado(relido)) return;') < onde(soltar, 'await liberarBloqueiosDaSessao(sessaoId);'),
  );
  // o toque repetido num pedido já reativado com casa: depois de religar os irmãos, as datas conferidas e o calendário
  const post = corpo(rota, 'export async function POST(');
  const repetido = post.slice(
    post.indexOf("if (acao === 'devolver_retido' || acao === 'reativar_retido') {"),
    post.indexOf("if (!confirmou) return voltar('falta-confirmar');\n    const erro ="),
  );
  assert.ok(
    onde(repetido, 'await religarIrmaos(alvo).catch(') <
      onde(
        repetido,
        "if (repetida && daStripe && acao === 'reativar_retido' && pagoPeloRetidoReativado(alvo) && vouchers.some(ehCasa)) { await conferirAsDatasDaReativacao(alvo,",
      ),
  );
  assert.ok(onde(repetido, 'await conferirAsDatasDaReativacao(alvo,') < onde(repetido, 'calendarioMudou();'));
});

/* ------------------------------------------------------------------ */
/* O que só dá para ver no código (as rotas e as telas usam o "@/")     */

/** O código de um arquivo, sem as linhas de comentário. */
function codigo(...partes: string[]): string {
  return readFileSync(path.join(...partes), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
    .join('\n');
}
/** O corpo de uma função, do começo dela até o fecho na coluna zero. */
function corpo(fonte: string, comeco: string): string {
  const i = fonte.indexOf(comeco);
  assert.ok(i >= 0, comeco);
  return fonte.slice(i, fonte.indexOf('\n}\n', i) + 2);
}
/** Sem espaços nem vírgulas finais: o mesmo trecho, quebrado ou não em várias linhas pelo formatador, compara igual. */
const semEspaco = (s: string) => s.replace(/\s+/g, '').replace(/,([)\]}])/g, '$1');
function tem(fonte: string, trecho: string): void {
  assert.ok(semEspaco(fonte).includes(semEspaco(trecho)), trecho);
}
function onde(fonte: string, trecho: string): number {
  const i = semEspaco(fonte).indexOf(semEspaco(trecho));
  assert.ok(i >= 0, trecho);
  return i;
}
