import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Stripe from 'stripe';
import { CASAS_PARA_CADASTRAR, linhaDaCasa, type CasaParaCadastrar } from '../scripts/dados/casas.ts';
import { ATUALIZADO_EM_CASAS } from '../src/content/legal/casas.ts';
import { frasesDoDocumento } from '../src/content/legal/argentino.ts';
import { ATUALIZADO_EM_ONLINE, textosLegais } from '../src/content/legal/online.ts';
import { dicionario } from '../src/i18n/index.ts';
import { IDIOMAS, LOCALE_INTL, type Idioma } from '../src/i18n/config.ts';
import { texto } from '../src/i18n/conteudo.ts';
import {
  aplicarCancelamento,
  diasAteAEntrada,
  frasesDoCancelamentoSemReembolso,
  linhaDoCancelamentoSemReembolso,
  linhasDaRegraDasCasas,
  motivosQueCombinam,
  motivosQueNaoAparecem,
  regraDosVouchers,
  registroDoCancelamento,
  rotuloDoMotivo,
  ROTULO_DO_MOTIVO,
} from '../src/lib/cancelar-sem-reembolso.ts';
import { detalhesDeLinha } from '../src/lib/casa-detalhes.ts';
import {
  casaParaMudar,
  conferirCasa,
  motivoDaCasaIndisponivel,
  noitesDaCasa,
  type CasaParaConta,
  type ContextoDasCasas,
} from '../src/lib/casa-no-carrinho.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { emailEssencial } from '../src/lib/email/cota.ts';
import { EMAILS_AUTOMATICOS } from '../src/lib/email/lista-dos-emails.ts';
import { marcaDoAvisoDasDatasDaCasa } from '../src/lib/email/marcas.ts';
import { emailAvisoDasDatasDaCasa, emailPedidoCanceladoSemReembolso, emailVoucherCancelado } from '../src/lib/email/mensagens.ts';
import { textosEmail } from '../src/lib/email/textos.ts';
import { calcularEstatisticas } from '../src/lib/estatisticas.ts';
import { ERROS_DO_PAINEL, agruparPedidos, valorRecebido } from '../src/lib/pedidos-painel.ts';
import {
  AVISO_DO_PIX_DA_CASA_FORA_DO_PRAZO,
  telaDoCancelamento,
  telaDoReembolso,
  transferenciaDoPixOferecida,
  type ContextoDoResumo,
} from '../src/lib/resumo-do-painel.ts';
import type { Reserva, ReservaCasa, ReservaPasseio } from '../src/lib/reservas.ts';
import {
  MARGEM_DA_REDE_MS,
  PENDENTE_DEMAIS_MS,
  avisoDasDatasNaoPresas,
  datasASoltar,
  decidirATrava,
  prenderNoArquivo,
  seguraAsDatas,
  voucherDoAvisoDasDatas,
} from '../src/lib/trava-das-casas.ts';
import {
  efeitoDoReembolsoDoSite,
  itensParaMarcar,
  leituraDaContestacao,
  mudancaDaContestacao,
  mudancaDoReembolso,
  planoDoReembolso,
} from '../src/app/api/webhooks/stripe/eventos.ts';

// O PACOTE 2 da reserva das casas (o dinheiro depois do pagamento) e a parte de código do pacote 3: as datas que voltam a
// ficar livres em toda saída de dinheiro (datasASoltar, um teste por caminho), a regra das casas no cancelamento sem
// reembolso, o Pix pago há mais de 90 dias, o "Reativar" que prende as datas, o pagamento depois de a sessão vencer, a rede
// de segurança, a casa de um carrinho antigo, o lembrete e o cartão das casas, a Stripe de mentira e os textos legais. As
// regras rodam aqui em node; as rotas, que usam o "@/", são conferidas pela leitura do código, no fim. Os pedidos são
// fictícios.

delete process.env.SUPABASE_URL;

const cifra = (centavos: number, idioma: Idioma = 'pt') => formatarCifra(centavos, LOCALE_INTL[idioma]);
const em = (dataHora: string) => new Date(`${dataHora}-03:00`);
/** Quinta, 26/11/2026, ao meio-dia em Búzios. */
const AGORA = em('2026-11-26T12:00:00');
const PAGO_EM = '2026-11-10T15:05:00.000Z';

/** A casa paga no Pix pela Stripe, entrada 14/12 e saída 16/12 (R$ 900,00 de sinal no Pix). Comprada há 16 dias. */
const CASA: ReservaCasa = {
  codigo: 'ON-CASA01',
  token: 'token-de-teste',
  criadaEm: '2026-11-10T15:00:00.000Z',
  atualizadaEm: PAGO_EM,
  idioma: 'pt',
  status: 'pago',
  provedor: 'stripe',
  paymentIntentId: 'pi_da_casa',
  pagamentoExternoId: 'cs_test_da_casa',
  data: '2026-12-14',
  totalCentavos: 200000,
  totalPixCentavos: 180000,
  cliente: { nome: 'Teste da Silva', email: 'teste@exemplo.com', telefone: '+54 911 0000-0000' },
  pagamento: { metodo: 'pix', pagoEm: PAGO_EM, cobrar: { cartao: 100000, pix: 90000 } },
  historico: [
    { em: '2026-11-10T15:00:00.000Z', evento: 'Reserva criada' },
    { em: PAGO_EM, evento: 'Pago (webhook da Stripe)' },
  ],
  tipo: 'casa',
  casa: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'mansao-ferradura-vista-mar',
    nome: 'Mansão Ferradura Vista Mar',
    cidade: 'buzios',
  },
  saida: '2026-12-16',
  hospedes: 10,
  sinalCentavos: 100000,
  sinalPixCentavos: 90000,
  linhas: [{ tipo: 'semana', noites: 2, diariaCentavos: 100000 }],
};

/** Um passeio do mesmo pedido (R$ 154,00 no cartão). */
const PASSEIO: ReservaPasseio = {
  codigo: 'ON-PAS001',
  token: 'token-de-teste',
  criadaEm: CASA.criadaEm,
  atualizadaEm: PAGO_EM,
  idioma: 'pt',
  status: 'pago',
  provedor: 'stripe',
  paymentIntentId: 'pi_da_casa',
  tipo: 'passeio',
  data: '2026-11-26',
  horario: { hora: '20:00', busca: false },
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

/** A casa e o passeio no mesmo pedido, pagos no cartão (R$ 1.000,00 de sinal + R$ 154,00). */
function casaComPasseio(mudar: { casa?: Partial<ReservaCasa>; passeio?: Partial<ReservaPasseio> } = {}): Reserva[] {
  const pedido = { codigo: 'ON-PEDCAS', totalCentavos: 215400, totalPixCentavos: 193860 };
  const pagamento: ReservaCasa['pagamento'] = { metodo: 'cartao', pagoEm: PAGO_EM, cobrar: { cartao: 115400, pix: 103860 } };
  return [
    { ...CASA, pedido, pagamento, ...mudar.casa },
    { ...PASSEIO, pedido, pagamento, ...mudar.passeio },
  ];
}

const codigos = (lista: readonly { codigo: string }[]) => lista.map((v) => v.codigo);

/* ------------------------------------------------------------------ */
/* 1. As datas que voltam a ficar livres: datasASoltar, um por caminho  */

test('datasASoltar: segura as datas só a casa do pedido pendente, pago ou contestado, com o voucher valendo', () => {
  assert.equal(seguraAsDatas(CASA), true);
  assert.equal(seguraAsDatas({ ...CASA, status: 'contestado' }), true);
  assert.equal(seguraAsDatas({ ...CASA, status: 'pendente' }), true);
  for (const status of ['expirado', 'cancelado', 'reembolsado', 'recusado', 'aguardando_whatsapp'] as const) {
    assert.equal(seguraAsDatas({ ...CASA, status }), false, status);
  }
  for (const statusItem of ['cancelado', 'reembolsado'] as const) assert.equal(seguraAsDatas({ ...CASA, statusItem }), false, statusItem);
  // o passeio e o transfer nunca seguram datas de casa
  assert.equal(seguraAsDatas(PASSEIO), false);
  // nada mudou: nada sai; a casa que já não segurava antes (as datas já saíram por outro caminho) também não
  assert.deepEqual(datasASoltar([CASA], [CASA]), []);
  assert.deepEqual(datasASoltar([{ ...CASA, status: 'expirado' }], [{ ...CASA, status: 'cancelado' }]), []);
  // e o passeio devolvido sozinho não solta casa nenhuma
  const [casa, passeio] = casaComPasseio();
  assert.deepEqual(datasASoltar([casa, passeio], [casa, { ...passeio, statusItem: 'reembolsado' }]), []);
});

test('caminho 1: o reembolso total pela Stripe (charge.refunded) devolve o pedido inteiro e solta as datas da casa', () => {
  const plano = planoDoReembolso(
    { id: 'ch_casa', amount: 90000, amount_refunded: 90000, refunded: true, payment_intent: 'pi_da_casa' },
    [{ id: 're_total', amount: 90000, status: 'succeeded', metadata: { referencia: 'total' } }],
    ['ON-CASA01'],
    'pi_da_casa',
    0,
    'pago',
  );
  const m = mudancaDoReembolso(CASA, plano);
  assert.equal(m?.status, 'reembolsado');
  const depois = { ...CASA, status: m?.status ?? CASA.status };
  assert.deepEqual(codigos(datasASoltar([CASA], [depois])), ['ON-CASA01']);
});

test('caminho 2: o reembolso de um voucher pela Stripe (o da casa) solta só a casa; o do passeio não solta nada', () => {
  const antes = casaComPasseio();
  const plano = planoDoReembolso(
    { id: 'ch_ped', amount: 115400, amount_refunded: 100000, refunded: false, payment_intent: 'pi_da_casa' },
    [{ id: 're_casa', amount: 100000, status: 'succeeded', metadata: { referencia: 'ON-CASA01' } }],
    codigos(antes),
    'pi_da_casa',
    0,
    'pago',
  );
  const marcar = itensParaMarcar(plano, antes);
  assert.deepEqual(
    marcar.map((i) => i.voucher),
    ['ON-CASA01'],
  );
  const depois = antes.map((v) => (marcar.some((i) => i.voucher === v.codigo) ? { ...v, statusItem: 'reembolsado' as const } : v));
  assert.deepEqual(codigos(datasASoltar(antes, depois)), ['ON-CASA01']);
});

test('caminho 3: o efeito do reembolso que falhou (refund.failed antes do charge.refunded) também solta as datas', () => {
  // "total": o pedido inteiro passa a reembolsado
  const total = efeitoDoReembolsoDoSite(
    CASA,
    [CASA],
    { id: 're_t', amount: 90000, metadata: { referencia: 'total' }, payment_intent: 'pi_da_casa' },
    { amount: 90000, amount_refunded: 0 },
  );
  assert.equal(total?.pedido?.status, 'reembolsado');
  assert.deepEqual(codigos(datasASoltar([CASA], [{ ...CASA, status: 'reembolsado' }])), ['ON-CASA01']);
  // o do voucher da casa num pedido com passeio: a casa passa a reembolsada
  const antes = casaComPasseio();
  const doVoucher = efeitoDoReembolsoDoSite(
    antes[0],
    antes,
    { id: 're_v', amount: 100000, metadata: { referencia: 'ON-CASA01' }, payment_intent: 'pi_da_casa' },
    { amount: 115400, amount_refunded: 0 },
  );
  assert.equal(doVoucher?.voucher?.codigo, 'ON-CASA01');
  const depois = antes.map((v) => (v.codigo === doVoucher?.voucher?.codigo ? { ...v, statusItem: 'reembolsado' as const } : v));
  assert.deepEqual(codigos(datasASoltar(antes, depois)), ['ON-CASA01']);
});

test('caminho 4: a contestação perdida solta as datas; aberta ou ganha, as datas continuam presas', () => {
  const perdida = leituraDaContestacao({ id: 'dp_1', amount: 90000, status: 'lost', reason: 'fraudulent' });
  const m = mudancaDaContestacao(CASA, perdida, true, perdida.evento, 90000);
  assert.equal(m?.status, 'reembolsado');
  assert.deepEqual(codigos(datasASoltar([CASA], [{ ...CASA, status: 'reembolsado' }])), ['ON-CASA01']);
  const aberta = leituraDaContestacao({ id: 'dp_2', amount: 90000, status: 'needs_response', reason: 'fraudulent' });
  assert.equal(mudancaDaContestacao(CASA, aberta, true, aberta.evento)?.status, 'contestado');
  assert.deepEqual(datasASoltar([CASA], [{ ...CASA, status: 'contestado' }]), []);
  assert.deepEqual(datasASoltar([{ ...CASA, status: 'contestado' }], [CASA]), []);
});

test('caminhos 5 a 7: o reembolso por outro meio (e a transferência do Pix), o "Marcar reembolsado" e o "foi o voucher …"', () => {
  // o voucher devolvido por outro meio (o último do pedido: o pedido também vira reembolsado)
  assert.deepEqual(codigos(datasASoltar([CASA], [{ ...CASA, status: 'reembolsado', statusItem: 'reembolsado' }])), ['ON-CASA01']);
  // o "Marcar reembolsado": o pedido inteiro
  assert.deepEqual(codigos(datasASoltar([CASA], [{ ...CASA, status: 'reembolsado' }])), ['ON-CASA01']);
  // o reembolso feito direto na Stripe era do voucher da casa (voucher_da_stripe): ele deixa de valer, o pedido continua pago
  const antes = casaComPasseio();
  const depois = antes.map((v) => (v.codigo === 'ON-CASA01' ? { ...v, statusItem: 'reembolsado' as const } : v));
  assert.deepEqual(codigos(datasASoltar(antes, depois)), ['ON-CASA01']);
});

test('caminhos 8 e 9: o cancelamento sem reembolso do pedido inteiro e o de um voucher só', () => {
  // o pedido inteiro: a primeira gravação deixa o voucher cancelado (o pedido continua pago)
  const r = structuredClone(CASA);
  const registro = registroDoCancelamento({ acao: 'cancelar_sem_reembolso' }, ['ON-CASA01'], { motivo: 'fora-da-politica' }, AGORA, false);
  aplicarCancelamento(r, registro, null, 'casas');
  assert.equal(r.status, 'pago');
  assert.equal(r.statusItem, 'cancelado');
  assert.deepEqual(codigos(datasASoltar([CASA], [r])), ['ON-CASA01']);
  // um voucher só: o do passeio não solta a casa; o da casa solta só ela
  const antes = casaComPasseio();
  assert.deepEqual(datasASoltar(antes, [antes[0], { ...antes[1], statusItem: 'cancelado' as const }]), []);
  assert.deepEqual(codigos(datasASoltar(antes, [{ ...antes[0], statusItem: 'cancelado' as const }, antes[1]])), ['ON-CASA01']);
});

test('as rotas soltam as datas em cada caminho, depois dos e-mails, num try, e refazem o calendário só nelas', () => {
  const webhook = codigo('src', 'app', 'api', 'webhooks', 'stripe', 'route.ts');
  const ajudante = corpo(webhook, 'async function soltarAsDatasQueDeixaramDeValer(');
  tem(ajudante, 'if (!antes.some(ehCasa)) return;');
  tem(ajudante, 'try { const soltar = datasASoltar(antes, await vouchersDoPedido(codigo));');
  tem(ajudante, 'if (soltar.length && (await liberarDatasDosVouchers(soltar)) > 0) calendarioMudou();');
  tem(ajudante, '} catch (e) {');
  // o reembolso (total ou de um voucher): depois dos e-mails do reembolso
  const reembolsada = corpo(webhook, 'async function cobrancaReembolsada(');
  assert.ok(
    onde(reembolsada, 'agendarEmailDoReembolso(codigo, re.id);') <
      onde(reembolsada, 'await soltarAsDatasQueDeixaramDeValer(codigo, vouchers);'),
  );
  // o efeito do reembolso que falhou: depois do aviso à equipe
  const falhou = corpo(webhook, 'async function reembolsoFalhou(');
  assert.ok(
    onde(falhou, 'agendarAvisoDoReembolsoFalho(codigo, atual.id);') <
      onde(falhou, 'await soltarAsDatasQueDeixaramDeValer(codigo, vouchers);'),
  );
  // a contestação: os vouchers de antes (sem derrubar a contestação se a leitura falhar) e a soltura depois
  const contestacao = corpo(webhook, 'async function contestacao(');
  tem(contestacao, 'const antes = await vouchersDoPedido(codigo).catch(() => [] as Reserva[]);');
  assert.ok(onde(contestacao, 'await aplicarContestacao(') < onde(contestacao, 'await soltarAsDatasQueDeixaramDeValer(codigo, antes);'));

  const painel = codigo('src', 'app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  const doPainel = corpo(painel, 'async function soltarDatasQueDeixaramDeValer(');
  tem(doPainel, 'const soltar = datasASoltar(antes, await vouchersDoPedido(codigoDoPedido));');
  tem(doPainel, 'if (soltar.length && (await liberarDatasDosVouchers(soltar)) > 0) calendarioMudou();');
  tem(doPainel, '} catch (e) {');
  const post = corpo(painel, 'export async function POST(');
  // o voucher por outro meio, o "foi o voucher …", o cancelamento sem reembolso (as duas gravações) e o "Marcar reembolsado"
  assert.equal(post.match(/await soltarDatasQueDeixaramDeValer\(codigoDoPedido, vouchers\);/g)?.length, 5);
  const porFora = post.slice(post.indexOf("if (acao === 'voucher_por_fora') {"), post.indexOf("if (acao === 'voucher_da_stripe') {"));
  assert.ok(
    onde(porFora, 'await atualizarItem(voucher,') < onde(porFora, 'await soltarDatasQueDeixaramDeValer(codigoDoPedido, vouchers);'),
  );
  const daStripe = post.slice(post.indexOf("if (acao === 'voucher_da_stripe') {"), post.indexOf("if (acao === 'reembolso_sem_voucher') {"));
  assert.ok(onde(daStripe, 'agendarEmailDoReembolso(codigoDoPedido, id);') < onde(daStripe, 'await soltarDatasQueDeixaramDeValer('));
  const semReembolso = post.slice(
    post.indexOf("if (acao === 'cancelar_sem_reembolso' ||"),
    post.indexOf("if (acao === 'devolvido_por_fora') {"),
  );
  // depois do e-mail, nas duas gravações (a que completa o que ficou pela metade e a do cancelamento novo)
  tem(
    semReembolso,
    'for (const c of cancelamentosDosVouchers(alvo, pendentes)) agendarEmailSemReembolso(codigoDoPedido, alcanceDoEmail(c)); await soltarDatasQueDeixaramDeValer(codigoDoPedido, vouchers);',
  );
  tem(
    semReembolso,
    'agendarEmailSemReembolso(codigoDoPedido, alcanceDoEmail(registro)); await soltarDatasQueDeixaramDeValer(codigoDoPedido, vouchers); return voltar();',
  );
  tem(
    post,
    'if (virouCancelado && atualizada) agendarEmailDoCancelamento(codigoDoPedido); if (atualizada) await soltarDatasQueDeixaramDeValer(codigoDoPedido, vouchers);',
  );
  // nenhum reembolso sai sozinho: o "Reembolsar" continua só com o "Confirmo"
  tem(post, "if (!confirmou) return voltar('falta-confirmar');");
});

/* ------------------------------------------------------------------ */
/* 2. O cancelamento sem reembolso da casa: a regra das casas           */

const casaEntrando = (entrada: string, mudar: Partial<ReservaCasa> = {}): ReservaCasa => ({
  ...CASA,
  data: entrada,
  saida: `${entrada.slice(0, 8)}${String(Number(entrada.slice(8, 10)) + 2).padStart(2, '0')}`,
  ...mudar,
});

test('a conta dos 30 dias: dias de calendário até a entrada, no horário de Brasília (o de Búzios)', () => {
  assert.equal(diasAteAEntrada('2026-12-26', AGORA), 30);
  assert.equal(diasAteAEntrada('2026-12-25', AGORA), 29);
  assert.equal(diasAteAEntrada('2026-11-26', AGORA), 0);
  assert.equal(diasAteAEntrada('2026-11-25', AGORA), -1);
  // às 23h30 de 26/11 em Búzios já é 27/11 em UTC: a conta continua a do dia de Búzios
  assert.equal(diasAteAEntrada('2026-12-26', em('2026-11-26T23:30:00')), 30);
  assert.ok(Number.isNaN(diasAteAEntrada('sem data', AGORA)));
});

test('"fora da política" na casa só a menos de 30 dias da entrada, fora dos 7 dias da compra; nos passeios, as 24 horas de sempre', () => {
  // a 30 dias ou mais: o sinal volta inteiro pela regra, e o motivo não aparece
  assert.deepEqual(motivosQueCombinam([casaEntrando('2026-12-26')], AGORA), ['outro']);
  // a 29 dias, comprada há 16: a agência fica com o sinal
  assert.deepEqual(motivosQueCombinam([casaEntrando('2026-12-25')], AGORA), ['fora-da-politica', 'outro']);
  // a menos de 30 dias, mas comprada há 2 dias (dentro dos 7 do arrependimento, antes da entrada): devolução total
  const recente = casaEntrando('2026-12-10', { pagamento: { ...CASA.pagamento, pagoEm: '2026-11-24T15:00:00.000Z' } });
  assert.deepEqual(motivosQueCombinam([recente], AGORA), ['outro']);
  // a estadia já começou (a entrada às 15h de ontem): os três motivos
  assert.deepEqual(motivosQueCombinam([casaEntrando('2026-11-25')], AGORA), ['fora-da-politica', 'nao-compareceu', 'outro']);
  // no dia da entrada, antes das 15h: fora da política, ainda sem o "não compareceu"
  assert.deepEqual(motivosQueCombinam([casaEntrando('2026-11-26')], AGORA), ['fora-da-politica', 'outro']);
  // o passeio continua com as 24 horas (às 20h de hoje: menos de 24 horas)
  assert.deepEqual(motivosQueCombinam([PASSEIO], AGORA), ['fora-da-politica', 'outro']);
  // casa e passeio no pedido inteiro: só com as duas regras de acordo (a casa a 32 dias não deixa; a 24 dias, com o passeio
  // de hoje à noite, deixa; com o passeio de amanhã à noite, a mais de 24 horas, não deixa)
  const [casa, passeio] = casaComPasseio();
  assert.deepEqual(motivosQueCombinam([{ ...casa, data: '2026-12-28', saida: '2026-12-30' }, passeio], AGORA), ['outro']);
  assert.deepEqual(motivosQueCombinam([{ ...casa, data: '2026-12-20', saida: '2026-12-22' }, passeio], AGORA), [
    'fora-da-politica',
    'outro',
  ]);
  assert.deepEqual(
    motivosQueCombinam(
      [
        { ...casa, data: '2026-12-20', saida: '2026-12-22' },
        { ...passeio, data: '2026-11-27' },
      ],
      AGORA,
    ),
    ['outro'],
  );
});

test('o painel escreve a regra das casas: o rótulo do motivo, a frase do que falta, a linha do histórico e a linha do resumo', () => {
  assert.equal(regraDosVouchers([CASA]), 'casas');
  assert.equal(regraDosVouchers([PASSEIO]), 'passeios');
  assert.equal(regraDosVouchers(casaComPasseio()), 'as-duas');
  assert.equal(rotuloDoMotivo('fora-da-politica', 'passeios'), ROTULO_DO_MOTIVO['fora-da-politica']);
  assert.match(rotuloDoMotivo('fora-da-politica', 'casas'), /a menos de 30 dias da entrada na casa, fora dos 7 dias da compra$/);
  assert.match(rotuloDoMotivo('fora-da-politica', 'as-duas'), /no passeio, com menos de 24 horas.*na casa, a menos de 30 dias/);
  assert.equal(rotuloDoMotivo('outro', 'casas'), ROTULO_DO_MOTIVO.outro);
  assert.match(motivosQueNaoAparecem(['outro'], 'casas') ?? '', /a entrada na casa é daqui a 30 dias ou mais.*devolve o sinal inteiro/);
  // o histórico
  const registro = registroDoCancelamento({ acao: 'cancelar_sem_reembolso' }, ['ON-CASA01'], { motivo: 'fora-da-politica' }, AGORA, false);
  assert.match(
    linhaDoCancelamentoSemReembolso(registro, 'casas'),
    /Motivo: fora da política das casas \(o cancelamento foi pedido a menos de 30 dias da entrada/,
  );
  assert.match(
    linhaDoCancelamentoSemReembolso(registro),
    /Motivo: fora da política \(o cancelamento foi pedido com menos de 24 horas de antecedência\)$/,
  );
  // a linha do resumo: o que a regra manda e de quando a conta é feita
  const [trinta] = linhasDaRegraDasCasas([{ ...casaEntrando('2026-12-26'), codigo: 'ON-CASA01' }], AGORA);
  assert.equal(
    trinta,
    'ON-CASA01: faltam 30 dias para a entrada (dias de calendário até a entrada (26/12/2026), contados de hoje, 26/11/2026, no horário de Brasília; se o cliente pediu o cancelamento antes, conte do dia da mensagem dele): pela regra das casas, o cancelamento devolve o sinal inteiro.',
  );
  assert.match(
    linhasDaRegraDasCasas([casaEntrando('2026-12-25')], AGORA)[0],
    /faltam 29 dias.*a agência fica com o sinal e não cobra o restante\.$/,
  );
  const recente = casaEntrando('2026-12-10', { pagamento: { ...CASA.pagamento, pagoEm: '2026-11-24T15:00:00.000Z' } });
  assert.match(linhasDaRegraDasCasas([recente], AGORA)[0], /dentro dos 7 dias do arrependimento.*a devolução é total/);
  assert.match(linhasDaRegraDasCasas([casaEntrando('2026-11-25')], AGORA)[0], /a estadia já começou/);
  assert.deepEqual(linhasDaRegraDasCasas([PASSEIO], AGORA), []);
});

const contextoDoResumo = (agora = AGORA): ContextoDoResumo => ({
  agora,
  saldo: null,
  emailLigado: true,
  descrever: (r) => r.codigo,
  volta: {},
});

test('a tela do "Cancelar sem reembolso…" de uma casa: a linha da regra das casas e os motivos com a regra delas', () => {
  const casa = casaEntrando('2026-12-20');
  const [p] = agruparPedidos([casa]);
  const tela = telaDoCancelamento(p, { acao: 'cancelar_sem_reembolso' }, contextoDoResumo());
  assert.ok(tela);
  const regra = tela.linhas.find((l) => l.rotulo === 'Regra das casas');
  assert.match(regra?.valor[0] ?? '', /^ON-CASA01: faltam 24 dias para a entrada \(dias de calendário/);
  const motivo = tela.formulario?.campos.find((c) => c.nome === 'motivo');
  assert.ok(motivo && motivo.tipo === 'escolha');
  assert.deepEqual(
    motivo.opcoes.map((o) => o.rotulo),
    [rotuloDoMotivo('fora-da-politica', 'casas'), ROTULO_DO_MOTIVO.outro],
  );
  // o passeio sozinho continua igual: sem a linha das casas, com o rótulo de sempre
  const [doPasseio] = agruparPedidos([{ ...PASSEIO, data: '2026-11-26' }]);
  const telaDoPasseio = telaDoCancelamento(doPasseio, { acao: 'cancelar_sem_reembolso' }, contextoDoResumo());
  assert.equal(
    telaDoPasseio?.linhas.some((l) => l.rotulo === 'Regra das casas'),
    false,
  );
  // o reembolso continua só pela Stripe, com o "Confirmo": esta tela não devolve nada
  assert.equal(tela.formulario?.acao, 'cancelar_sem_reembolso');
  assert.ok(tela.formulario?.confirmacoes.some((c) => c.nome === 'confirmo'));
});

test('a página do pedido e o e-mail: o motivo e a regra das casas nos 4 idiomas (com casa e passeio, as duas regras)', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    const frases = frasesDoCancelamentoSemReembolso(d.pedido, { motivo: 'fora-da-politica' }, true);
    assert.equal(frases.motivo, d.pedido.motivoForaDaPoliticaCasa, idioma);
    assert.equal(frases.regra, d.pedido.regraSemReembolsoCasa, idioma);
    assert.match(frases.motivo, /30/, idioma);
    assert.doesNotMatch(`${frases.motivo} ${frases.regra}`, /24/, idioma);
    // o passeio continua com a regra do item 6
    assert.equal(frasesDoCancelamentoSemReembolso(d.pedido, { motivo: 'fora-da-politica' }).regra, d.pedido.regraSemReembolso, idioma);
    // "outro": a regra geral, também na casa
    assert.equal(frasesDoCancelamentoSemReembolso(d.pedido, { motivo: 'outro', texto: 'x' }, true).regra, d.pedido.regraGeralSemReembolso);
    const site = {
      url: 'https://orlanativa.online',
      logo: 'https://orlanativa.online/l.png',
      nome: 'Orla Nativa',
      dominio: 'orlanativa.online',
    };
    const base = {
      idioma,
      nome: 'Teste',
      codigo: 'ON-CASA01',
      linkPedido: 'https://orlanativa.online/p',
      itens: [],
      site,
      linkPolitica: 'https://x',
    };
    const S = textosEmail(idioma).semReembolso;
    const daCasa = emailPedidoCanceladoSemReembolso({ ...base, motivo: { tipo: 'fora-da-politica', regra: 'casas' } });
    assert.ok(daCasa.texto.includes(S.motivoForaDaPoliticaCasa) && daCasa.texto.includes(S.regraCasa), idioma);
    assert.ok(!daCasa.texto.includes(S.regra), idioma);
    const asDuas = emailVoucherCancelado({
      ...base,
      voucher: { codigo: 'ON-CASA01' },
      motivo: { tipo: 'fora-da-politica', regra: 'as-duas' },
    });
    for (const frase of [S.motivoForaDaPolitica, S.regra, S.motivoForaDaPoliticaCasa, S.regraCasa])
      assert.ok(asDuas.texto.includes(frase), idioma);
    // sem a regra (os pedidos de sempre): o e-mail de antes
    const semRegra = emailPedidoCanceladoSemReembolso({ ...base, motivo: { tipo: 'fora-da-politica' } });
    assert.ok(semRegra.texto.includes(S.regra) && !semRegra.texto.includes(S.regraCasa), idioma);
    for (const t of [daCasa.texto, asDuas.texto]) assert.doesNotMatch(t, /\{\w+\}/, idioma);
  }
  // o es-ar sem "seña" nem verbo em vos nestas frases: iguais ao neutro
  assert.equal(dicionario('es-ar').pedido.regraSemReembolsoCasa, dicionario('es').pedido.regraSemReembolsoCasa);
  assert.equal(textosEmail('es-ar').semReembolso.regraCasa, textosEmail('es').semReembolso.regraCasa);
});

test('no código: a casa passa a regra das casas ao histórico, ao e-mail e à página do pedido', () => {
  const painel = codigo('src', 'app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  tem(painel, 'aplicarCancelamento(r, registro, conferencia.trava, regraDosVouchers(plano.cancelar))');
  tem(painel, "if (!motivoCombinaComAData(motivo.motivo, plano.cancelar, agora)) return voltar('motivo-fora-da-data');");
  const pedidos = codigo('src', 'lib', 'email', 'pedidos.ts');
  tem(pedidos, 'regra: regraDosVouchers(cancelados)');
  const publica = codigo('src', 'lib', 'reserva-publica.ts');
  tem(publica, 'frasesDoCancelamentoSemReembolso(d.pedido, semReembolso, ehCasa(r))');
  const pagina = codigo('src', 'app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  tem(pagina, '...(regrasDaPolitica.length ? regrasDaPolitica : [d.pedido.regraGeralSemReembolso])');
  assert.match(ERROS_DO_PAINEL['motivo-fora-da-data'], /na casa de temporada, a menos de 30 dias da entrada e fora dos 7 dias da compra/);
});

/* ------------------------------------------------------------------ */
/* 3. O Pix pago há mais de 90 dias                                    */

test('o Pix da casa pago há mais de 90 dias: a devolução do sinal pela transferência do Pacote 33, com o aviso no painel', () => {
  const agora = em('2027-03-10T12:00:00');
  const antiga = { ...casaEntrando('2027-04-20'), pagamento: { ...CASA.pagamento, pagoEm: '2026-11-20T15:00:00.000Z' } };
  assert.equal(transferenciaDoPixOferecida(antiga, agora, [antiga]), true);
  const [p] = agruparPedidos([antiga]);
  const tela = telaDoReembolso(p, { acao: 'reembolsar' }, contextoDoResumo(agora));
  assert.ok(tela);
  // o aviso vermelho e a transferência do voucher da casa pelo sinal pago no Pix (R$ 900,00), nunca o total da estadia
  assert.ok(tela.avisos.some((a) => a.tom === 'perigo' && /Devolver por transferência/.test(a.texto)));
  assert.deepEqual(
    tela.transferencia?.formularios.map((f) => [f.acao, f.voucher, f.botao.includes(cifra(90000))]),
    [['voucher_por_fora', 'ON-CASA01', true]],
  );
  assert.equal(valorRecebido(antiga), 90000);
  // o aviso no cartão do pedido com casa
  assert.match(AVISO_DO_PIX_DA_CASA_FORA_DO_PRAZO, /mais de 90 dias.*Devolver por transferência/);
  const pagina = codigo('src', 'app', 'admin', 'page.tsx');
  tem(pagina, "{reembolso.tipo === 'stripe' && p.itens.some(ehCasa) && pixForaDoPrazoDaStripe(r, new Date()) && (");
});

/* ------------------------------------------------------------------ */
/* 4. O "Reativar" do pedido com casa; 5. o pagamento depois de vencer   */

test('o "Reativar" do pedido com casa prende as datas antes, recusa com o motivo e solta o que prendeu sem reativar', () => {
  const painel = codigo('src', 'app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  const reativar = corpo(painel, 'async function reativarPagamentoRetido(');
  const posicoes = [
    onde(reativar, 'obterSessao(retido.sessaoId)'),
    onde(reativar, 'await prenderDatasDoPedido(vouchers, retido.sessaoId, { todas: true });'),
    onde(reativar, "if (e instanceof DatasIndisponiveis) return 'reativar-datas-ocupadas';"),
    onde(reativar, "return 'datas-sem-conferir';"),
    onde(reativar, 'const reativada = await atualizarReserva(alvo.codigo, (r) => {'),
    onde(reativar, 'if (comCasa) registrar(r, LINHA_DAS_DATAS_NA_REATIVACAO);'),
    onde(reativar, 'if (comCasa && !gravado.repetida) { await liberarBloqueiosDaSessao(retido.sessaoId)'),
    onde(reativar, 'if (reativada) await pedidoPago(reativada, leitura);'),
    onde(reativar, 'if (comCasa) await conferirAsDatasDaReativacao(alvo, retido.sessaoId);'),
  ];
  for (const [i, p] of posicoes.entries()) assert.ok(p > (posicoes[i - 1] ?? -1), `passo ${i}: ${p}`);
  // o botão aparece também no pedido com casa, e a rota não recusa mais de saída
  assert.doesNotMatch(painel, /reativar-com-casa|reativarRetidoEscondido/);
  tem(painel, "if (acao === 'reativar_retido' && vouchers.some(ehCasa)) calendarioMudou();");
  const pagina = codigo('src', 'app', 'admin', 'page.tsx');
  assert.doesNotMatch(pagina, /reativarRetidoEscondido/);
  assert.match(ERROS_DO_PAINEL['reativar-datas-ocupadas'], /Devolva o pagamento ao cliente/);
});

test('o pagamento depois de a sessão vencer: o aviso da Stripe prende as datas; sem conseguir, o "Aviso:" e o e-mail à equipe', () => {
  const linha = avisoDasDatasNaoPresas(CASA);
  assert.equal(voucherDoAvisoDasDatas(linha), 'ON-CASA01');
  assert.equal(voucherDoAvisoDasDatas(linha.slice('Aviso: '.length)), 'ON-CASA01');
  assert.equal(voucherDoAvisoDasDatas('Aviso: outra coisa'), undefined);
  const site = {
    url: 'https://orlanativa.online',
    logo: 'https://orlanativa.online/l.png',
    nome: 'Orla Nativa',
    dominio: 'orlanativa.online',
  };
  const email = emailAvisoDasDatasDaCasa({
    codigo: 'ON-CASA01',
    linhas: [linha.slice('Aviso: '.length)],
    linkPainel: 'https://orlanativa.online/admin?q=ON-CASA01',
    site,
  });
  assert.equal(email.assunto, 'Casa paga sem as datas presas: ON-CASA01');
  assert.match(email.texto, /A reserva continua paga e nada foi devolvido ao cliente/);
  assert.match(email.texto, /Mansão Ferradura Vista Mar \(entrada 14\/12\/2026, saída 16\/12\/2026, voucher ON-CASA01\)/);
  assert.doesNotMatch(email.texto, /teste@exemplo\.com|Teste da Silva/);
  assert.equal(marcaDoAvisoDasDatasDaCasa('ON-CASA01'), 'E-mail à equipe: aviso das datas da casa não presas (ON-CASA01)');
  // essencial na cota e na lista do cartão "E-mails automáticos", para a equipe
  assert.equal(emailEssencial('datas-da-casa-equipe'), true);
  assert.deepEqual(EMAILS_AUTOMATICOS['datas-da-casa-equipe'], { para: 'equipe', nome: 'casa paga sem as datas presas' });
  // no código: o aviso da Stripe confere em toda virada para pago (também a do pedido vencido), e avisa pela mesma função
  const webhook = codigo('src', 'app', 'api', 'webhooks', 'stripe', 'route.ts');
  tem(webhook, 'await avisarDatasNaoPresas(reserva, semTrava);');
  const rede = codigo('src', 'lib', 'rede-das-casas.ts');
  const avisar = corpo(rede, 'export async function avisarDatasNaoPresas(');
  assert.ok(onde(avisar, 'registrar(r, l);') < onde(avisar, 'agendarAvisoDasDatasDaCasa('));
  const pedidos = codigo('src', 'lib', 'email', 'pedidos.ts');
  const envio = corpo(pedidos, 'export async function enviarAvisoDasDatasDaCasa(');
  tem(envio, "if (!r || (r.status !== 'pago' && r.status !== 'contestado')) return;");
  tem(envio, "tipo: 'datas-da-casa-equipe',");
  tem(envio, 'para: responderPara(),');
  tem(envio, "chave: `datas-da-casa-equipe/${novas.map((n) => n.voucher).join('+')}`");
  // nada se devolve sozinho por aqui
  assert.doesNotMatch(avisar + envio, /criarReembolso|devolverPagamento/);
});

/* ------------------------------------------------------------------ */
/* 6. A rede de segurança de hora em hora                              */

test('a rede de segurança decide cada trava pelo voucher relido: soltar, manter, renomear ou consultar a Stripe', () => {
  const antiga = new Date(AGORA.getTime() - 3 * 3_600_000).toISOString();
  const t = { referencia: 'cs_velha', criadoEm: antiga };
  const voucher = (mudar: Record<string, unknown> = {}) => ({
    codigo: 'ON-CASA01',
    tipo: 'casa',
    status: 'pago' as const,
    pagamentoExternoId: 'cs_velha',
    pendenteDesde: new Date(AGORA.getTime() - 30 * 60_000).toISOString(),
    ...mudar,
  });
  // recém-criada: fica para a próxima rodada, seja de quem for
  assert.deepEqual(
    decidirATrava({ referencia: 'cs_x', criadoEm: new Date(AGORA.getTime() - MARGEM_DA_REDE_MS + 1000).toISOString() }, null, AGORA),
    {
      acao: 'manter',
    },
  );
  // o item sem voucher (o pedido sumiu) e o voucher que não é casa: soltar
  assert.deepEqual(decidirATrava(t, null, AGORA), { acao: 'soltar' });
  assert.deepEqual(decidirATrava(t, voucher({ tipo: 'passeio' }), AGORA), { acao: 'soltar' });
  // pago ou contestado, com o voucher valendo: manter
  assert.deepEqual(decidirATrava(t, voucher(), AGORA), { acao: 'manter' });
  assert.deepEqual(decidirATrava(t, voucher({ status: 'contestado' }), AGORA), { acao: 'manter' });
  // vencido, cancelado, devolvido, e o voucher cancelado ou devolvido sozinho: soltar
  for (const status of ['expirado', 'cancelado', 'reembolsado'] as const)
    assert.deepEqual(decidirATrava(t, voucher({ status }), AGORA), { acao: 'soltar' }, status);
  for (const statusItem of ['cancelado', 'reembolsado'] as const)
    assert.deepEqual(decidirATrava(t, voucher({ statusItem }), AGORA), { acao: 'soltar' }, statusItem);
  // pendente com a trava presa a uma sessão antiga: passar para a corrente
  assert.deepEqual(decidirATrava(t, voucher({ status: 'pendente', pagamentoExternoId: 'cs_nova' }), AGORA), {
    acao: 'renomear',
    para: 'cs_nova',
  });
  assert.deepEqual(decidirATrava(t, voucher({ status: 'pendente' }), AGORA), { acao: 'manter' });
  // pendente há mais de 2 horas: consultar a Stripe antes; depois de consultar, não consulta de novo
  const parado = voucher({ status: 'pendente', pendenteDesde: new Date(AGORA.getTime() - PENDENTE_DEMAIS_MS - 60_000).toISOString() });
  assert.deepEqual(decidirATrava(t, parado, AGORA), { acao: 'consultar' });
  assert.deepEqual(decidirATrava(t, parado, AGORA, { consultou: true }), { acao: 'manter' });
});

test('a rede no código: solta e renomeia pelo item E pela referência vista, consulta a Stripe e confere as casas pagas', () => {
  const pedido = codigo('src', 'lib', 'pedido-carrinho.ts');
  const soltar = corpo(pedido, 'export async function soltarTravaVista(');
  tem(soltar, ".delete() .eq('origem', 'site') .eq('item_pedido_id', t.itemPedidoId) .eq('referencia', t.referencia)");
  tem(soltar, 'soltarNoComputador({ pares: [{ item: t.itemPedidoId, referencia: t.referencia }] })');
  const renomear = corpo(pedido, 'export async function renomearTravaVista(');
  tem(
    renomear,
    ".update({ referencia: para }) .eq('origem', 'site') .eq('item_pedido_id', t.itemPedidoId) .eq('referencia', t.referencia)",
  );
  // só as estadias que ainda não acabaram
  tem(corpo(pedido, 'export async function travasDoSite('), ".eq('origem', 'site') .gt('fim', hoje);");
  const rede = codigo('src', 'lib', 'rede-das-casas.ts');
  const rodada = corpo(rede, 'export async function redeDeSegurancaDasCasas(');
  tem(rodada, 'await sincronizarComStripe(pedido, agora);');
  tem(rodada, 'decisao = decidirATrava(t, v ? paraARede(v) : null, agora, { consultou: true });');
  tem(rodada, "if (decisao.acao === 'soltar') res.soltas += await soltarTravaVista(t);");
  tem(rodada, "else if (decisao.acao === 'renomear') res.renomeadas += await renomearTravaVista(t, decisao.para);");
  tem(rodada, 'const { prendeu, semTrava } = await conferirDatasDoPedidoPago(vouchers, r.pagamentoExternoId ?? `rede-${codigo}`);');
  tem(rodada, 'const soltar = datasASoltar(vouchers, await vouchersDoPedido(codigo));');
  tem(rodada, 'await avisarDatasNaoPresas(r, semTrava);');
  assert.doesNotMatch(rede, /\bcalendarioMudou\(\)|revalidateTag|criarReembolso/);
  // a rota de hora em hora: a importação do Airbnb de sempre e a rede, com o calendário refeito só quando mudou
  const rota = codigo('src', 'app', 'api', 'casas', 'sincronizar', 'route.ts');
  tem(rota, 'const resultado = await importarCalendarios();');
  tem(rota, 'rede = await redeDeSegurancaDasCasas(); if (rede.mudou) calendarioMudou();');
  tem(rota, 'if (!chamadaDoAgendamento(req)) return NextResponse.json({ ok: false }, { status: 401 });');
  // a trava do arquivo guarda quando foi presa (a margem dos 10 minutos)
  const nova = prenderNoArquivo(
    [],
    () => [],
    [{ itemPedidoId: 'ON-CASA01', casaId: 'c1', inicio: '2026-12-14', fim: '2026-12-16' }],
    'cs_1',
    () => 'id-1',
    '2026-11-26T15:00:00.000Z',
  );
  assert.equal(nova?.[0].criadoEm, '2026-11-26T15:00:00.000Z');
});

/* ------------------------------------------------------------------ */
/* 7. A casa de um carrinho antigo que deixou de valer                  */

const FERRADURA_CADASTRO = CASAS_PARA_CADASTRAR.find((c) => c.slug === 'mansao-ferradura-vista-mar') as CasaParaCadastrar;
const FERRADURA: CasaParaConta = {
  id: CASA.casa.id,
  slug: FERRADURA_CADASTRO.slug,
  nome: FERRADURA_CADASTRO.nome,
  cidade: FERRADURA_CADASTRO.cidade,
  capacidade: FERRADURA_CADASTRO.capacidade,
  fotos: [`/fotos/casas/${FERRADURA_CADASTRO.slug}/capa.jpg`],
  diaria: FERRADURA_CADASTRO.diariaCentavos / 100,
  minimoNoites: FERRADURA_CADASTRO.minimoNoites,
  temporadas: [],
  feriados: [],
  detalhes: detalhesDeLinha(linhaDaCasa(FERRADURA_CADASTRO)),
  pacotes: FERRADURA_CADASTRO.pacotes,
};
const contexto = (casa: CasaParaConta = FERRADURA): ContextoDasCasas => ({
  lido: true,
  aberta: true,
  casas: new Map([[casa.slug, { casa, ...noitesDaCasa([], new Set()) }]]),
});
const escolha = (entrada: string, saida: string, hospedes = 10) => ({
  tipo: 'casa' as const,
  slug: FERRADURA.slug,
  entrada,
  saida,
  hospedes,
});

test('a casa de um carrinho antigo que mudou ou saiu do ar fica indisponível com o "Mudar"; só a data passada some', () => {
  const ainda = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto(), AGORA);
  assert.equal(ainda.ok, true);
  // a capacidade baixou
  const menor = conferirCasa(escolha('2026-12-14', '2026-12-16', 10), contexto({ ...FERRADURA, capacidade: 8 }), AGORA);
  assert.equal(motivoDaCasaIndisponivel(menor), 'mudou');
  // o mínimo subiu
  const minimo = conferirCasa(escolha('2026-12-14', '2026-12-16'), contexto({ ...FERRADURA, minimoNoites: 4 }), AGORA);
  assert.equal(motivoDaCasaIndisponivel(minimo), 'mudou');
  // a sexta ficou livre e o fim de semana pede as três noites (sábado a segunda)
  assert.equal(motivoDaCasaIndisponivel(conferirCasa(escolha('2026-12-12', '2026-12-14'), contexto(), AGORA)), 'mudou');
  // um pacote de feriado novo pela metade das noites
  const pacote = {
    nome: { pt: 'Pacote Teste', es: 'Paquete Prueba', en: 'Test Package' },
    entrada: '2026-12-15',
    saida: '2026-12-18',
    diariaCentavos: 300000,
  };
  const comPacote = conferirCasa(
    escolha('2026-12-14', '2026-12-16'),
    contexto({ ...FERRADURA, pacotes: [...FERRADURA.pacotes, pacote] }),
    AGORA,
  );
  assert.equal(motivoDaCasaIndisponivel(comPacote), 'mudou');
  // a casa saiu do ar
  assert.equal(
    motivoDaCasaIndisponivel(conferirCasa(escolha('2026-12-14', '2026-12-16'), { lido: true, aberta: true, casas: new Map() }, AGORA)),
    'fora-do-ar',
  );
  // a data que passou some, como o passeio
  assert.equal(motivoDaCasaIndisponivel(conferirCasa(escolha('2026-11-20', '2026-11-23'), contexto(), AGORA)), undefined);
  // o "Mudar": a ocupada, a que mudou e a que saiu do ar; a fechada sai pelo X
  assert.deepEqual((['ocupada', 'mudou', 'fora-do-ar', 'fechada'] as const).map(casaParaMudar), [true, true, true, false]);
  for (const idioma of IDIOMAS) {
    const K = dicionario(idioma).carrinho;
    assert.ok(K.casaMudou && K.casaForaDoAr, idioma);
    assert.doesNotMatch(`${K.casaMudou} ${K.casaForaDoAr}`, /\{\w+\}/);
  }
  assert.match(dicionario('es-ar').carrinho.casaMudou, /Tocá Cambiar/);
  assert.match(dicionario('es').carrinho.casaMudou, /Toca Cambiar/);
  // no código: a casa fora do ar com o nome e a foto do painel, e o "Mudar" para a lista das casas
  const carrinho = codigo('src', 'lib', 'carrinho-servidor.ts');
  tem(carrinho, "if (indisponivel === 'fora-do-ar') { const fora = contexto.foraDoAr?.get(e.slug); if (!fora) return null;");
  tem(carrinho, "href: rota(idioma, '/casas-de-temporada'),");
  const contextoDoServidor = codigo('src', 'lib', 'casas-carrinho.ts');
  tem(contextoDoServidor, 'const foraDoAr = faltam.length ? await casasForaDoAr(faltam) : undefined;');
  const formulario = codigo('src', 'components', 'carrinho', 'FormularioCarrinho.tsx');
  tem(formulario, "const casaQueMudou = itens.find((i) => i.indisponivel === 'mudou' || i.indisponivel === 'fora-do-ar');");
  tem(formulario, 'if (casaQueMudou) { setErroGeral(fraseDaCasaQueMudou); setLinkDoErro(casaQueMudou.href); return; }');
});

/* ------------------------------------------------------------------ */
/* 8. O lembrete do carrinho com casa e o cartão "Casas"               */

test('o lembrete do carrinho com casa: o contexto das casas, o sinal como preço e o total da estadia; sem casa, igual', () => {
  const lembretes = codigo('src', 'lib', 'carrinho-lembretes.ts');
  tem(lembretes, 'const contexto = await contextoDasCasas({ escolhas: c.itens.map((i) => i.escolha), admin: false });');
  tem(lembretes, 'if (visiveis.some((v) => v === null || v.indisponivel)) {');
  tem(lembretes, 'const { totalCentavos: totalCartao, totalPixCentavos: totalPix } = totaisDoCarrinho(itens);');
  tem(lembretes, "...(comPix ? { pix: valorNoIdioma(cobradoHoje(i, 'pix'), c.idioma, taxa) } : {}),");
  tem(lembretes, 'linhas: [...i.detalhes, ...totalDaEstadia(i)],');
  assert.doesNotMatch(lembretes, /SEM_CASAS/);
});

test('o cartão "Casas" das estatísticas: as reservas e os sinais do período e o que falta receber só das estadias de hoje em diante', () => {
  const periodo = { chave: 'outro', periodo: { de: '2026-11-01', ate: '2026-11-30' } };
  const futura = CASA;
  const passada = { ...CASA, codigo: 'ON-CASA02', data: '2026-11-20', saida: '2026-11-22', paymentIntentId: 'pi_2' };
  const devolvida = { ...CASA, codigo: 'ON-CASA03', status: 'reembolsado' as const, paymentIntentId: 'pi_3' };
  const e = calcularEstatisticas([futura, passada, devolvida, ...casaComPasseio()], [], periodo, AGORA);
  // as pagas no período: a futura, a passada e a do pedido com passeio (a devolvida não é venda)
  assert.equal(e.casas.reservas, 3);
  assert.equal(e.casas.sinaisCentavos, 90000 + 90000 + 100000);
  // a receber na chegada: a futura no Pix (R$ 1.800,00 − R$ 900,00) e a do pedido no cartão (R$ 2.000,00 − R$ 1.000,00)
  assert.deepEqual(e.casas.aReceber, { centavos: 90000 + 100000, estadias: 2 });
  // sem casa, tudo zero
  const so = calcularEstatisticas([PASSEIO], [], periodo, AGORA);
  assert.deepEqual(so.casas, { reservas: 0, sinaisCentavos: 0, aReceber: { centavos: 0, estadias: 0 } });
  const pagina = codigo('src', 'app', 'admin', 'estatisticas', 'page.tsx');
  tem(pagina, '<Casas c={e.casas} />');
});

/* ------------------------------------------------------------------ */
/* 9. A Stripe de mentira da cópia particular                          */

test('a Stripe de mentira responde a sessão (aberta, vencida, paga) e o reembolso, com a chave de idempotência', () => {
  const pasta = mkdtempSync(path.join(tmpdir(), 'stripe-de-mentira-'));
  process.env.STRIPE_DE_MENTIRA_ESTADO = path.join(pasta, 'estado.json');
  process.env.STRIPE_DE_MENTIRA_PAGAS = path.join(pasta, 'pagas.json');
  try {
    const exigir = createRequire(import.meta.url);
    const mentira = exigir('../scripts/stripe-de-mentira.cjs') as {
      responder: (
        m: string,
        c: string,
        corpo?: string,
        chave?: string,
      ) => { status: number; corpo: Record<string, unknown> & { data?: Record<string, unknown>[] } };
      eventoAssinado: (tipo: string, objeto: unknown, segredo: string) => { corpo: string; assinatura: string };
    };
    const corpoDaSessao = new URLSearchParams({
      'line_items[0][price_data][unit_amount]': '90000',
      'line_items[0][quantity]': '1',
      'metadata[forma]': 'pix',
      'metadata[codigo]': 'ON-CASA01',
    }).toString();
    const criada = mentira.responder('POST', '/v1/checkout/sessions', corpoDaSessao, 'ON-CASA01-1');
    assert.equal(criada.status, 200);
    const id = String(criada.corpo.id);
    assert.equal(criada.corpo.status, 'open');
    assert.equal(criada.corpo.amount_total, 90000);
    // o mesmo "Pagar" de novo: a mesma sessão; outro corpo com a mesma chave: o erro de idempotência
    assert.equal(mentira.responder('POST', '/v1/checkout/sessions', corpoDaSessao, 'ON-CASA01-1').corpo.id, id);
    assert.equal(mentira.responder('POST', '/v1/checkout/sessions', `${corpoDaSessao}&x=1`, 'ON-CASA01-1').status, 400);
    // vencer: fechar e reler
    assert.equal(mentira.responder('POST', `/v1/checkout/sessions/${id}/expire`).corpo.status, 'expired');
    assert.equal(mentira.responder('GET', `/v1/checkout/sessions/${id}`).corpo.status, 'expired');
    assert.equal(mentira.responder('POST', `/v1/checkout/sessions/${id}/expire`).status, 400);
    // a sessão que passou do fim sem pagar é lida como vencida
    const outra = String(mentira.responder('POST', '/v1/checkout/sessions', `${corpoDaSessao}&expires_at=1`, 'ON-CASA01-2').corpo.id);
    assert.equal(mentira.responder('GET', `/v1/checkout/sessions/${outra}`).corpo.status, 'expired');
    // paga por fora: a sessão paga, com o pagamento e a cobrança
    writeFileSync(
      process.env.STRIPE_DE_MENTIRA_PAGAS,
      JSON.stringify({ cs_paga_da_casa: { valor: 90000, forma: 'pix', codigo: 'ON-CASA01' } }),
    );
    const paga = mentira.responder('GET', '/v1/checkout/sessions/cs_paga_da_casa').corpo as {
      payment_status: string;
      payment_intent: { id: string; latest_charge: { id: string } };
    };
    assert.equal(paga.payment_status, 'paid');
    const pi = paga.payment_intent.id;
    const ch = paga.payment_intent.latest_charge.id;
    // o reembolso de uma parte e o do resto, a lista e a cobrança que soma o que voltou
    const parte = mentira.responder(
      'POST',
      '/v1/refunds',
      new URLSearchParams({ payment_intent: pi, amount: '30000', 'metadata[referencia]': 'ON-CASA01' }).toString(),
      `reembolso-${pi}-ON-CASA01`,
    );
    assert.equal(parte.status, 200);
    assert.equal(parte.corpo.status, 'succeeded');
    assert.equal(
      mentira.responder(
        'POST',
        '/v1/refunds',
        new URLSearchParams({ payment_intent: pi, amount: '30000', 'metadata[referencia]': 'ON-CASA01' }).toString(),
        `reembolso-${pi}-ON-CASA01`,
      ).corpo.id,
      parte.corpo.id,
    );
    assert.equal(
      mentira.responder('POST', '/v1/refunds', new URLSearchParams({ payment_intent: pi, amount: '99999' }).toString()).status,
      400,
    );
    const resto = mentira.responder(
      'POST',
      '/v1/refunds',
      new URLSearchParams({ payment_intent: pi, 'metadata[referencia]': 'total' }).toString(),
      `reembolso-${pi}-total`,
    );
    assert.equal(resto.corpo.amount, 60000);
    assert.equal(mentira.responder('GET', `/v1/refunds?payment_intent=${pi}&limit=100`).corpo.data?.length, 2);
    assert.equal(mentira.responder('GET', `/v1/refunds?charge=${ch}`).corpo.data?.length, 2);
    const cobranca = mentira.responder('GET', `/v1/charges/${ch}`).corpo;
    assert.equal(cobranca.amount_refunded, 90000);
    assert.equal(cobranca.refunded, true);
    assert.deepEqual(cobranca.metadata, { codigo: 'ON-CASA01' });
    assert.equal(mentira.responder('GET', `/v1/refunds/${parte.corpo.id}`).corpo.amount, 30000);
    assert.equal(mentira.responder('POST', '/v1/refunds', new URLSearchParams({ payment_intent: pi }).toString()).status, 400);
    // a sessão pelo pagamento (a contestação que chega antes do pago)
    assert.equal(mentira.responder('GET', `/v1/checkout/sessions?payment_intent=${pi}&limit=1`).corpo.data?.[0]?.id, 'cs_paga_da_casa');
    // o aviso assinado como a Stripe assina: o SDK de verdade confere
    const { corpo, assinatura } = mentira.eventoAssinado(
      'checkout.session.expired',
      { id, object: 'checkout.session' },
      'whsec_de_teste_da_bancada',
    );
    const evento = new Stripe('sk_test_bancada').webhooks.constructEvent(corpo, assinatura, 'whsec_de_teste_da_bancada');
    assert.equal(evento.type, 'checkout.session.expired');
    assert.ok(readFileSync(process.env.STRIPE_DE_MENTIRA_ESTADO, 'utf8').includes(id));
  } finally {
    delete process.env.STRIPE_DE_MENTIRA_ESTADO;
    delete process.env.STRIPE_DE_MENTIRA_PAGAS;
    rmSync(pasta, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* 10. Os textos legais com as casas                                   */

test('os textos legais com as casas: só com a reserva das casas aberta e o pagamento online, a data num lugar só, nos 4 idiomas', () => {
  const com = textosLegais(true, true, true);
  const sem = textosLegais(true, true, false);
  assert.deepEqual(com.atualizadoEm, { termos: ATUALIZADO_EM_CASAS, cancelamento: ATUALIZADO_EM_CASAS, privacidade: ATUALIZADO_EM_CASAS });
  assert.equal(ATUALIZADO_EM_CASAS, '2026-11-26');
  for (const t of Object.values(ATUALIZADO_EM_ONLINE)) assert.ok(ATUALIZADO_EM_CASAS >= t);
  // sem a reserva das casas, ou sem o pagamento online, tudo como antes
  assert.deepEqual(sem, textosLegais(true, true));
  assert.deepEqual(textosLegais(false, true, true), textosLegais(false, true));
  const regras: Record<Idioma, RegExp[]> = {
    pt: [
      /até 30 dias antes da entrada, o sinal pago no site é devolvido inteiro/,
      /nos 7 dias depois da compra, desde que antes da entrada, a devolução é total/,
      /a menos de 30 dias da entrada, fora desses 7 dias, o sinal pago no site não é devolvido e o restante da estadia não é cobrado/,
    ],
    es: [
      /hasta 30 días antes de la entrada, lo pagado en el sitio se devuelve completo/,
      /en los 7 días posteriores a la compra/,
      /a menos de 30 días de la entrada, fuera de esos 7 días/,
    ],
    'es-ar': [
      /hasta 30 días antes de la entrada, lo pagado en el sitio se devuelve completo/,
      /en los 7 días posteriores a la compra/,
      /a menos de 30 días de la entrada, fuera de esos 7 días/,
    ],
    en: [
      /up to 30 days before check-in, the deposit paid on the site is refunded in full/,
      /within 7 days of purchase/,
      /less than 30 days before check-in, outside those 7 days/,
    ],
  };
  const privacidade: Record<Idioma, RegExp[]> = {
    pt: [
      /Reserva de casa de temporada: a casa, as datas de entrada e de saída e a quantidade de hóspedes/,
      /pede pelo WhatsApp o nome completo e o documento de cada hóspede e, de quem vier de carro, a placa/,
      /Proprietário da casa de temporada e portaria do condomínio/,
      /apagados 30 dias depois da saída/,
    ],
    es: [
      /Reserva de casa de temporada/,
      /pide por WhatsApp el nombre completo y el documento de cada huésped/,
      /Propietario de la casa de temporada y portería/,
      /30 días después de la salida/,
    ],
    'es-ar': [
      /Reserva de casa de temporada/,
      /pide por WhatsApp el nombre completo y el documento de cada huésped/,
      /Propietario de la casa de temporada y portería/,
      /30 días después de la salida/,
    ],
    en: [
      /Holiday home booking/,
      /asks on WhatsApp for each guest’s full name and ID/,
      /owner and the condominium gatehouse/,
      /deleted 30 days after check-out/,
    ],
  };
  for (const idioma of IDIOMAS) {
    const termos = frasesDoDocumento(texto(com.termos, idioma)).join('\n');
    const cancelamento = frasesDoDocumento(texto(com.cancelamento, idioma)).join('\n');
    const priv = frasesDoDocumento(texto(com.privacidade, idioma)).join('\n');
    for (const r of regras[idioma]) assert.match(termos, r, `termos ${idioma}`);
    assert.match(cancelamento, /30/, idioma);
    for (const r of privacidade[idioma]) assert.match(priv, r, `privacidade ${idioma}`);
    // nenhuma outra regra mudou: as 24 horas dos passeios continuam
    assert.match(frasesDoDocumento(texto(com.cancelamento, idioma)).join('\n'), /24/);
    // os dados da empresa continuam só onde já estavam (tests/sem-cnpj.test.ts confere também esta versão); aqui, que as
    // frases novas não trazem número nenhum de cadastro: o texto com as casas tem as mesmas frases do online mais as novas
    // o mesmo número de frases do texto online mais só as novas (nada sumiu)
    assert.ok(frasesDoDocumento(texto(com.termos, idioma)).length === frasesDoDocumento(texto(sem.termos, idioma)).length + 2, idioma);
    assert.ok(
      frasesDoDocumento(texto(com.cancelamento, idioma)).length === frasesDoDocumento(texto(sem.cancelamento, idioma)).length + 5,
      idioma,
    );
    assert.ok(
      frasesDoDocumento(texto(com.privacidade, idioma)).length === frasesDoDocumento(texto(sem.privacidade, idioma)).length + 5,
      idioma,
    );
  }
  // o es-ar mantém a "seña" das frases de antes, e as frases novas são iguais às do neutro (sem verbo em vos)
  assert.match(frasesDoDocumento(texto(com.cancelamento, 'es-ar')).join('\n'), /reglas propias de seña y cancelación/);
  // as páginas legais escolhem a versão com as casas pelo interruptor, no build
  for (const pagina of ['termos-de-uso', 'politica-de-cancelamento', 'politica-de-privacidade']) {
    const fonte = codigo('src', 'app', '[locale]', pagina, 'page.tsx');
    assert.equal(fonte.match(/textosLegais\(pagamentoOnlineNoAr\(\), emailLigado\(\), reservaCasasNoAr\(\)\)/g)?.length, 2, pagina);
  }
  tem(codigo('src', 'lib', 'reserva-casas.ts'), "export const reservaCasasNoAr = (): boolean => modoReservaCasas() === 'publico';");
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
