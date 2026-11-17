import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eventoDoReembolsoFalho, leituraDaContestacao } from '../src/app/api/webhooks/stripe/eventos.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { AVISO_PAGO_DEPOIS_DO_HORARIO, avisoDeValorDiferente } from '../src/lib/pagamento-stripe.ts';
import { AVISO_EMAIL_PAGO_SAINDO, MARCA_DO_AVISO_A_EQUIPE, MARCA_DO_EMAIL, marcaDoAvisoDeReembolsoFalho } from '../src/lib/email/marcas.ts';
import {
  ERROS_DO_PAINEL,
  NAO_DIGA_O_MOTIVO,
  NENHUM_VOUCHER,
  SEM_REEMBOLSO_DEPOIS_DA_FALHA,
  SEM_REEMBOLSO_NA_CONTESTACAO,
  agruparPedidos,
  avisoAberto,
  avisoDoReembolsoFalho,
  avisosDeContestacao,
  avisosDeReembolso,
  botaoDevolvidoPorFora,
  botaoReembolsoDoVoucher,
  botaoVoucherDaStripe,
  botaoVoucherPorFora,
  confirmacaoDoReembolso,
  confirmacaoDoReembolsoDoVoucher,
  contarReembolsosAResolver,
  contestacoesAbertas,
  devolucaoNoPainel,
  ehAviso,
  fraseDoErro,
  frasesDoReembolsoNoPainel,
  motivoDoReembolsoFalho,
  motivoNoPainel,
  oQueFazerNaContestacao,
  reembolsoNoPainel,
  reembolsoParaResolver,
  reembolsosParadosPelaContestacao,
  valorADevolver,
  valorDoVoucherPorFora,
  valorRecebido,
  voucherCabeNoQueResta,
} from '../src/lib/pedidos-painel.ts';
import {
  linhaDaDevolucaoPorOutroMeio,
  linhaDoReembolsoFalho,
  linhaDoReembolsoParadoPelaContestacao,
  linhaDoReembolsoSemMudarVoucher,
  linhaDoReembolsoSemVoucher,
  linhaDoVoucherDevolvidoPorOutroMeio,
  linhaDoVoucherLigado,
} from '../src/lib/reembolsos-a-resolver.ts';
import type { Reserva, ReservaPasseio } from '../src/lib/reservas.ts';

// O painel destaca as linhas do histórico que pedem uma ação da equipe: as que começam com "Aviso:".
// Só a regra, sem tela nem banco.

test('as linhas de aviso que o pagamento grava no histórico ganham o destaque do painel', () => {
  // o reembolso que falhou: a frase é a que o webhook grava de verdade
  const falhou = eventoDoReembolsoFalho({
    id: 're_9',
    amount: 15400,
    status: 'failed',
    failure_reason: 'expired_or_canceled_card',
    metadata: { referencia: 'ON-ABC234' },
  });
  assert.ok(falhou);
  assert.equal(ehAviso(falhou), true);
  // o valor diferente e o pagamento atrasado: também as frases que o pagamento confirmado grava de verdade
  const valorDiferente = avisoDeValorDiferente(10000, 15400);
  assert.equal(ehAviso(valorDiferente), true);
  assert.ok(valorDiferente.includes('100,00') && valorDiferente.includes('154,00'), valorDiferente);
  assert.equal(ehAviso(AVISO_PAGO_DEPOIS_DO_HORARIO), true);
  // os dois terminam no que a equipe faz em seguida, como os avisos de devolução
  assert.match(valorDiferente, /: conferir na Stripe e acertar a diferença com o cliente$/);
  assert.match(AVISO_PAGO_DEPOIS_DO_HORARIO, /: ver com o parceiro .+ reembolsar o cliente$/);
  // esta nasce dentro da função que pede a devolução à Stripe: aqui vai como exemplo
  const naoDevolveu = 'Aviso: a Stripe não devolveu o pagamento pi_1 (pagamento repetido, charge_disputed): devolver por outro meio';
  assert.equal(ehAviso(naoDevolveu), true);
});

test('as outras linhas do histórico ficam sem destaque', () => {
  for (const linha of [
    'Reserva criada',
    'Pago (webhook)',
    'Cartão recusado (insufficient_funds)',
    'Reembolso total (R$ 154,00) confirmado pela Stripe',
    'Contestação aberta na Stripe (dp_1): R$ 154,00, motivo "fraudulent"',
    // só vale no começo da linha, e do jeito que o código escreve
    'Pago (webhook). Aviso: depois do horário',
    'aviso: em minúscula',
    '',
  ])
    assert.equal(ehAviso(linha), false, linha);
});

test('o aviso do e-mail do pagamento aprovado: destacado enquanto não vem a linha do envio; depois, não', () => {
  const linhas = (...eventos: string[]) => eventos.map((evento, n) => ({ em: `2026-11-13T12:00:0${n}Z`, evento }));
  // o envio começou e a função foi cortada no meio (ou o envio falhou): o aviso continua destacado
  const cortado = linhas('Pago (webhook)', AVISO_EMAIL_PAGO_SAINDO);
  assert.equal(ehAviso(AVISO_EMAIL_PAGO_SAINDO), true);
  assert.equal(avisoAberto(cortado, 1), true);
  // o e-mail saiu: a linha do envio veio depois, e o aviso deixa de pedir ação
  const saiu = linhas('Pago (webhook)', AVISO_EMAIL_PAGO_SAINDO, MARCA_DO_EMAIL['pagamento-aprovado']);
  assert.equal(avisoAberto(saiu, 1), false);
  assert.equal(avisoAberto(saiu, 2), false, 'a linha do envio não é aviso');
  // os outros avisos continuam destacados, com ou sem o e-mail
  const outro = linhas('Aviso: a Stripe não devolveu o pagamento pi_1', MARCA_DO_EMAIL['pagamento-aprovado']);
  assert.equal(avisoAberto(outro, 0), true);
  // e as linhas dos e-mails nunca são avisos
  for (const marca of [...Object.values(MARCA_DO_EMAIL), MARCA_DO_AVISO_A_EQUIPE]) assert.equal(ehAviso(marca), false, marca);
  assert.equal(avisoAberto([], 0), false);
});

// O erro de uma ação do painel viaja no endereço como um código curto; a frase mora no código do site.
// Assim, ninguém monta um link do painel que mostre um texto inventado à equipe.

test('cada código de erro do painel vira a sua frase', () => {
  const codigos = Object.keys(ERROS_DO_PAINEL);
  assert.ok(codigos.length >= 10);
  for (const codigo of codigos) {
    const frase = fraseDoErro(codigo);
    assert.equal(frase, ERROS_DO_PAINEL[codigo as keyof typeof ERROS_DO_PAINEL], codigo);
    assert.ok(frase.length > 10, codigo);
    // o código é curto e sem espaço: só letras minúsculas, números e hífen
    assert.match(codigo, /^[a-z0-9-]+$/, codigo);
  }
  assert.equal(fraseDoErro('item-com-reembolso'), ERROS_DO_PAINEL['item-com-reembolso']);
});

test('o que não é um código conhecido não mostra nada no painel', () => {
  for (const texto of [
    'Pedido pago',
    'Ligue agora para (71) 90000-0000 e informe a sua senha',
    '<b>Reembolso feito</b>',
    'ITEM-COM-REEMBOLSO',
    ' item-com-reembolso',
    // nomes que todo objeto do JavaScript tem: não são códigos do painel
    'constructor',
    '__proto__',
    'toString',
    'hasOwnProperty',
    '',
  ])
    assert.equal(fraseDoErro(texto), '', texto);
  assert.equal(fraseDoErro(undefined), '');
});

test('a contestação de cartão manda responder na Stripe; a de Pix avisa que não há resposta', () => {
  const pedidos = [
    { status: 'contestado', metodo: 'cartao' },
    { status: 'contestado', metodo: 'pix' },
    { status: 'contestado', metodo: 'pix' },
    { status: 'pago', metodo: 'pix' },
    { status: 'reembolsado', metodo: 'cartao' },
  ] as const;
  assert.deepEqual(contestacoesAbertas([...pedidos]), { cartao: 1, pix: 2 });
  assert.deepEqual(contestacoesAbertas([]), { cartao: 0, pix: 0 });

  // sem contestação aberta, o topo do painel não mostra faixa nenhuma
  assert.deepEqual(avisosDeContestacao({ cartao: 0, pix: 0 }), []);
  const [cartao, pix] = avisosDeContestacao({ cartao: 1, pix: 2 });
  assert.match(cartao, /^1 pagamento contestado no cartão: responder no painel da Stripe/);
  assert.match(pix, /^2 Pix contestados: não dá para responder/);
  assert.deepEqual(avisosDeContestacao({ cartao: 3, pix: 0 }).length, 1);
  assert.match(avisosDeContestacao({ cartao: 3, pix: 0 })[0], /^3 pagamentos contestados no cartão/);
  assert.match(avisosDeContestacao({ cartao: 0, pix: 1 })[0], /^1 Pix contestado: /);

  // o Pix contestado não pede uma resposta que a Stripe não aceita
  assert.match(oQueFazerNaContestacao('cartao'), /Responda no painel da Stripe/);
  assert.match(oQueFazerNaContestacao('pix'), /não dá para responder/);
  assert.doesNotMatch(oQueFazerNaContestacao('pix'), /Responda/);
  for (const aviso of avisosDeContestacao({ cartao: 0, pix: 4 })) assert.doesNotMatch(aviso, /responder no painel/);
});

test('o motivo do pagamento que não entrou aparece em português para a equipe', () => {
  const saldo = motivoNoPainel('insufficient_funds', 'cartao');
  assert.equal(saldo.rotulo, 'Última recusa do cartão');
  assert.equal(saldo.frase, 'sem saldo ou sem limite');
  assert.equal(saldo.resumo, 'recusado: sem saldo ou sem limite');
  // o código da Stripe continua à vista, para a equipe procurar no painel dela
  assert.equal(saldo.codigo, 'insufficient_funds');
  assert.equal(motivoNoPainel('incorrect_cvc', 'cartao').frase, 'algum dado do cartão não confere');
  assert.match(motivoNoPainel('card_not_supported', 'cartao').frase, /compra internacional/);
  assert.equal(motivoNoPainel('expired_card', 'cartao').frase, 'cartão vencido');
  // a confirmação do banco que falhou chega como código de erro, não de recusa
  for (const c of ['authentication_required', 'payment_intent_authentication_failure'])
    assert.match(motivoNoPainel(c, 'cartao').frase, /confirmação pedida pelo banco/, c);

  // o que o cliente nunca lê: a equipe vê o motivo e o aviso de não repassar, nas duas linhas
  const reservados = [
    ['fraudulent', 'fraude'],
    ['lost_card', 'perdido'],
    ['stolen_card', 'roubado'],
  ];
  for (const [c, palavra] of reservados) {
    const m = motivoNoPainel(c, 'cartao');
    assert.ok(m.frase.includes(palavra), c);
    assert.match(m.frase, /não diga o motivo ao cliente/, c);
    assert.match(m.resumo, /não diga ao cliente/, c);
    assert.equal(m.codigo, c);
  }
  // nestes três o código não garante fraude nem roubo: a frase não afirma
  for (const c of ['merchant_blacklist', 'pickup_card', 'restricted_card']) {
    const m = motivoNoPainel(c, 'cartao');
    assert.equal(m.frase, 'bloqueio do cartão ou da compra (não diga o motivo ao cliente)', c);
    assert.match(m.resumo, /não diga ao cliente/, c);
    assert.doesNotMatch(`${m.frase} ${m.resumo}`, /fraude|roub|perdid/, c);
  }

  // o código que a lista não conhece cai na frase geral e continua à vista
  const novo = motivoNoPainel('codigo_que_nao_existe', 'cartao');
  assert.equal(novo.frase, 'motivo não informado');
  assert.equal(novo.codigo, 'codigo_que_nao_existe');

  // o Pix não é recusado: vence sem pagamento. Nada de "cartão" nem "recusa", e não há código para procurar
  for (const metodo of ['pix', 'cartao'] as const) {
    const pix = motivoNoPainel('pix_expirado', metodo);
    assert.equal(pix.rotulo, 'Última tentativa no Pix');
    assert.equal(pix.frase, 'o Pix não foi pago no prazo');
    assert.equal(pix.codigo, undefined);
    assert.doesNotMatch(`${pix.rotulo} ${pix.frase} ${pix.resumo}`, /cart|recus/i);
  }
  // outro código num pedido de Pix também não vira recusa de cartão
  const outro = motivoNoPainel('payment_intent_payment_attempt_expired', 'pix');
  assert.doesNotMatch(`${outro.rotulo} ${outro.frase} ${outro.resumo}`, /cart|recus/i);
  assert.equal(outro.codigo, 'payment_intent_payment_attempt_expired');

  // nenhuma frase vazia, venha o código que vier
  for (const c of ['', 'generic_decline', 'do_not_honor', 'processing_error', 'card_velocity_exceeded', ' Insufficient_Funds ']) {
    const m = motivoNoPainel(c, 'cartao');
    assert.ok(m.frase.length > 0 && m.resumo.length > 'recusado: '.length, c);
  }
  assert.equal(motivoNoPainel(' Insufficient_Funds ', 'cartao').codigo, 'insufficient_funds');
});

// Os reembolsos no painel (16/11, depois do teste de 15/11): o que falhou na Stripe, o feito direto na Stripe sem
// voucher e o parado por uma contestação. As faixas, o filtro, as frases e os botões saem de uma regra só
// (reembolsoNoPainel); os pedidos são fictícios, montados como o painel os agrupa.

/** Os valores das frases saem de formatarCifra (com o espaço que não quebra do pt-BR). */
const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
/** Um histórico com as linhas na ordem, um segundo entre uma e outra. */
const historico = (...eventos: string[]) =>
  eventos.map((evento, n) => ({ em: `2026-11-16T12:00:${String(n).padStart(2, '0')}.000Z`, evento }));

/** Um voucher de exemplo, pago pela Stripe no cartão (nenhum é de cliente). */
function voucher(parcial: Partial<ReservaPasseio> = {}): Reserva {
  return {
    codigo: 'ON-ABC234',
    token: 'token-de-teste',
    criadaEm: '2026-11-15T12:00:00Z',
    atualizadaEm: '2026-11-15T12:00:00Z',
    idioma: 'pt',
    status: 'pago',
    provedor: 'stripe',
    paymentIntentId: 'pi_do_pedido',
    tipo: 'passeio',
    data: '2026-11-20',
    horario: { hora: '09:00', busca: false },
    totalCentavos: 15400,
    cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+55 21 90000-0000' },
    pagamento: { metodo: 'cartao', pagoEm: '2026-11-15T12:00:00Z' },
    historico: historico('Pago (webhook da Stripe)'),
    passeio: { slug: 'escuna-buzios', nome: 'Escuna', cidade: 'Búzios', unidade: 'pessoa' },
    adultos: 2,
    criancas: 0,
    unidades: 2,
    hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
    ...parcial,
  } as ReservaPasseio;
}

/** Um pedido de um item (R$ 154,00), como o painel agrupa. */
const umItem = (parcial: Partial<ReservaPasseio> = {}) => agruparPedidos([voucher(parcial)])[0];

/**
 * Um pedido de dois itens, ON-AAA234 (R$ 242,00, o primeiro da viagem: representa o pedido) e ON-BBB234 (R$ 154,00),
 * com o status, o valor devolvido e o histórico do pedido nos dois, como nos arquivos do computador.
 */
function doisItens(
  comum: Partial<ReservaPasseio> = {},
  statusItens: [Reserva['statusItem'], Reserva['statusItem']] = [undefined, undefined],
) {
  const pedido = { codigo: 'ON-PED234', totalCentavos: 39600 };
  const item = (codigo: string, data: string, totalCentavos: number, statusItem: Reserva['statusItem']) =>
    voucher({ codigo, data, totalCentavos, pedido, ...comum, ...(statusItem ? { statusItem } : {}) });
  return agruparPedidos([
    item('ON-AAA234', '2026-11-20', 24200, statusItens[0]),
    item('ON-BBB234', '2026-11-21', 15400, statusItens[1]),
  ])[0];
}

const FALHO_TOTAL = { id: 're_total', centavos: 15400, motivo: 'expired_or_canceled_card' };
const FALHO_DO_VOUCHER = { id: 're_voucher', centavos: 24200, voucher: 'ON-AAA234', motivo: 'expired_or_canceled_card' };
const SEM_VOUCHER = { id: 're_direto', centavos: 15400 };

test('o aviso do reembolso deixa de ser destacado quando a equipe resolve; o parado, quando a contestação termina', () => {
  // o reembolso que falhou: destacado até a linha da devolução por outro meio DESTE reembolso
  const falhou = linhaDoReembolsoFalho(FALHO_TOTAL);
  assert.equal(avisoAberto(historico('Pago (webhook da Stripe)', falhou), 1), true);
  const devolvido = historico('Pago (webhook da Stripe)', falhou, linhaDaDevolucaoPorOutroMeio(FALHO_TOTAL));
  assert.equal(avisoAberto(devolvido, 1), false);
  assert.equal(avisoAberto(devolvido, 2), false, 'a linha de fecho não é aviso');
  const deOutro = historico(falhou, linhaDaDevolucaoPorOutroMeio({ ...FALHO_TOTAL, id: 're_outro' }));
  assert.equal(avisoAberto(deOutro, 0), true, 'a devolução de outro reembolso não fecha este');

  // o feito direto na Stripe sem voucher: fechado pelo voucher ligado ou pelo desconto, em qualquer ponto do histórico
  const direto = linhaDoReembolsoSemVoucher(SEM_VOUCHER);
  assert.equal(avisoAberto(historico(direto), 0), true);
  assert.equal(avisoAberto(historico(direto, linhaDoVoucherLigado('re_direto', 'ON-AAA234')), 0), false);
  assert.equal(avisoAberto(historico(linhaDoVoucherLigado('re_direto', 'ON-AAA234'), direto), 1), false);
  assert.equal(avisoAberto(historico(direto, linhaDoReembolsoSemMudarVoucher('re_direto')), 0), false);

  // o parado pela contestação: destacado até a contestação terminar, nas linhas que o webhook grava de verdade
  const parado = linhaDoReembolsoParadoPelaContestacao({ id: 're_parado', centavos: 15400 });
  const disputa = (
    status: 'needs_response' | 'under_review' | 'warning_needs_response' | 'won' | 'lost' | 'warning_closed' | 'prevented',
  ) => leituraDaContestacao({ id: 'du_teste', amount: 15400, status, reason: 'fraudulent' }).evento;
  assert.equal(avisoAberto(historico(disputa('needs_response'), parado), 1), true);
  for (const status of ['won', 'lost', 'warning_closed', 'prevented'] as const) {
    assert.equal(avisoAberto(historico(disputa('needs_response'), parado, disputa(status)), 1), false, status);
    // o fim de uma contestação ANTERIOR ao aviso não fecha
    assert.equal(avisoAberto(historico(disputa(status), parado), 1), true, `${status} antes`);
  }
  for (const status of ['under_review', 'warning_needs_response'] as const)
    assert.equal(avisoAberto(historico(parado, disputa(status)), 0), true, `${status} não termina a contestação`);

  // os outros avisos continuam como antes, e a linha do e-mail à equipe não é aviso
  assert.equal(avisoAberto(historico(AVISO_PAGO_DEPOIS_DO_HORARIO, linhaDaDevolucaoPorOutroMeio(FALHO_TOTAL)), 0), true);
  assert.equal(ehAviso(marcaDoAvisoDeReembolsoFalho('re_total')), false);
});

test('as faixas dos reembolsos: vazias sem pedido, no singular, no plural, e as três na ordem', () => {
  assert.deepEqual(avisosDeReembolso({ falhos: 0, semVoucher: 0, parados: 0 }), []);
  assert.deepEqual(avisosDeReembolso({ falhos: 1, semVoucher: 1, parados: 1 }), [
    '1 reembolso que a Stripe não conseguiu devolver: devolver por outro meio e registrar',
    '1 reembolso feito direto na Stripe, sem voucher: dizer de qual voucher foi',
    '1 reembolso parado por contestação: aceitar ou responder no painel da Stripe',
  ]);
  assert.deepEqual(avisosDeReembolso({ falhos: 2, semVoucher: 3, parados: 4 }), [
    '2 reembolsos que a Stripe não conseguiu devolver: devolver por outro meio e registrar',
    '3 reembolsos feitos direto na Stripe, sem voucher: dizer de qual voucher foi',
    '4 reembolsos parados por contestação: aceitar ou responder no painel da Stripe',
  ]);
  assert.deepEqual(avisosDeReembolso({ falhos: 0, semVoucher: 2, parados: 0 }), [
    '2 reembolsos feitos direto na Stripe, sem voucher: dizer de qual voucher foi',
  ]);
});

test('reembolsoNoPainel: o que cada pedido mostra (WhatsApp, contestado, falhou, Stripe, nada a devolver)', () => {
  // pedido do WhatsApp: nada da Stripe
  assert.deepEqual(reembolsoNoPainel(umItem({ provedor: 'whatsapp', paymentIntentId: undefined, pagamento: { metodo: 'whatsapp' } })), {
    tipo: 'nenhum',
  });
  // contestado, no cartão e no Pix: sem botão de reembolso, com a frase no lugar
  for (const metodo of ['cartao', 'pix'] as const)
    assert.deepEqual(reembolsoNoPainel(umItem({ status: 'contestado', pagamento: { metodo } })), { tipo: 'contestado' }, metodo);
  // a frase do contestado é verdade também no pedido de informação do banco: não manda responder nem diz que a Stripe recusa
  assert.doesNotMatch(SEM_REEMBOLSO_NA_CONTESTACAO, /respond|não aceita/i);
  // ainda esperando pagamento: nada
  for (const status of ['pendente', 'expirado', 'cancelado'] as const)
    assert.deepEqual(reembolsoNoPainel(umItem({ status })), { tipo: 'nenhum' }, status);

  // reembolsado com o reembolso que falhou: um "Registrar" e nenhum voucher; depois de registrado, nada pendente
  const totalFalhou = historico(
    'Pago (webhook da Stripe)',
    'Reembolso total (R$ 154,00) confirmado pela Stripe',
    linhaDoReembolsoFalho(FALHO_TOTAL),
  );
  const reembolsado = reembolsoNoPainel(umItem({ status: 'reembolsado', reembolsoCentavos: 15400, historico: totalFalhou }));
  assert.equal(reembolsado.tipo, 'falhou');
  if (reembolsado.tipo !== 'falhou') return;
  assert.deepEqual(reembolsado.pendentes, [{ ...FALHO_TOTAL, devolvido: false }]);
  assert.deepEqual(reembolsado.vouchersPagos, []);
  const jaDevolvido = reembolsoNoPainel(
    umItem({
      status: 'reembolsado',
      reembolsoCentavos: 15400,
      historico: [...totalFalhou, ...historico(linhaDaDevolucaoPorOutroMeio(FALHO_TOTAL))],
    }),
  );
  assert.equal(jaDevolvido.tipo, 'falhou');
  if (jaDevolvido.tipo === 'falhou') assert.deepEqual(jaDevolvido.pendentes, []);

  // pago, com o reembolso de um voucher que falhou: o "Registrar" dele e o outro voucher em vouchersPagos
  const voucherFalhou = reembolsoNoPainel(
    doisItens({ reembolsoCentavos: 24200, historico: historico('Pago (webhook da Stripe)', linhaDoReembolsoFalho(FALHO_DO_VOUCHER)) }, [
      'reembolsado',
      undefined,
    ]),
  );
  assert.equal(voucherFalhou.tipo, 'falhou');
  if (voucherFalhou.tipo !== 'falhou') return;
  assert.deepEqual(
    voucherFalhou.pendentes.map((f) => f.id),
    ['re_voucher'],
  );
  assert.deepEqual(
    voucherFalhou.vouchersPagos.map((v) => v.codigo),
    ['ON-BBB234'],
  );
  assert.equal(voucherFalhou.restanteCentavos, 15400);

  // pago, sem falha: os botões de sempre; o voucher só no pedido com vários itens
  const normal = reembolsoNoPainel(umItem());
  assert.deepEqual(normal, { tipo: 'stripe', restanteCentavos: 15400, vouchers: [], semVoucher: [] });
  const dois = reembolsoNoPainel(doisItens());
  assert.equal(dois.tipo, 'stripe');
  if (dois.tipo === 'stripe') {
    assert.equal(dois.restanteCentavos, 39600);
    assert.deepEqual(
      dois.vouchers.map((v) => v.codigo),
      ['ON-AAA234', 'ON-BBB234'],
    );
  }
  // o voucher já devolvido sozinho sai da lista
  const umDevolvido = reembolsoNoPainel(doisItens({ reembolsoCentavos: 24200 }, ['reembolsado', undefined]));
  assert.equal(umDevolvido.tipo, 'stripe');
  if (umDevolvido.tipo === 'stripe')
    assert.deepEqual(
      umDevolvido.vouchers.map((v) => v.codigo),
      ['ON-BBB234'],
    );
  // nada mais a devolver: nenhum botão
  assert.deepEqual(reembolsoNoPainel(umItem({ reembolsoCentavos: 15400 })), { tipo: 'nenhum' });

  // a devolução falha de um pagamento repetido (outro pi_) não tira os botões de um pedido saudável
  const repetido = eventoDoReembolsoFalho(
    {
      id: 're_repetido',
      amount: 15400,
      status: 'failed',
      failure_reason: 'expired_or_canceled_card',
      metadata: {},
      payment_intent: 'pi_outro',
    },
    'pi_do_pedido',
  );
  assert.ok(repetido);
  assert.equal(reembolsoNoPainel(umItem({ historico: historico('Pago (webhook da Stripe)', repetido) })).tipo, 'stripe');
});

test('reembolsoNoPainel: o reembolso feito direto na Stripe sem voucher segura os botões por voucher até a equipe dizer de qual foi', () => {
  const comAviso = historico(
    'Pago (webhook da Stripe)',
    'Reembolso de R$ 154,00 confirmado pela Stripe',
    linhaDoReembolsoSemVoucher(SEM_VOUCHER),
  );
  const aberto = reembolsoNoPainel(doisItens({ reembolsoCentavos: 15400, historico: comAviso }));
  assert.equal(aberto.tipo, 'stripe');
  if (aberto.tipo !== 'stripe') return;
  assert.deepEqual(aberto.vouchers, [], 'nenhum "Reembolsar só o voucher…" enquanto não se sabe de qual foi');
  assert.deepEqual(aberto.semVoucher, [{ ...SEM_VOUCHER, resolvido: false }]);

  // ligado ao voucher ON-BBB234: ele deixa de valer, e o outro volta a ter o botão
  const ligado = reembolsoNoPainel(
    doisItens({ reembolsoCentavos: 15400, historico: [...comAviso, ...historico(linhaDoVoucherLigado('re_direto', 'ON-BBB234'))] }, [
      undefined,
      'reembolsado',
    ]),
  );
  assert.ok(ligado.tipo === 'stripe');
  if (ligado.tipo === 'stripe') {
    assert.deepEqual(ligado.semVoucher, []);
    assert.deepEqual(
      ligado.vouchers.map((v) => v.codigo),
      ['ON-AAA234'],
    );
  }
  // anotado como desconto: os dois vouchers continuam valendo e com o botão
  const desconto = reembolsoNoPainel(
    doisItens({ reembolsoCentavos: 15400, historico: [...comAviso, ...historico(linhaDoReembolsoSemMudarVoucher('re_direto'))] }),
  );
  if (desconto.tipo === 'stripe')
    assert.deepEqual(
      desconto.vouchers.map((v) => v.codigo),
      ['ON-AAA234', 'ON-BBB234'],
    );
  assert.ok(desconto.tipo === 'stripe' && desconto.semVoucher.length === 0);

  // o pedido de um item nunca pergunta de qual voucher foi (o reembolso de parte nele é um desconto)
  const umSo = reembolsoNoPainel(umItem({ reembolsoCentavos: 5000, historico: comAviso }));
  assert.ok(umSo.tipo === 'stripe' && umSo.semVoucher.length === 0);

  // depois de um reembolso que falhou, o reembolso feito direto na Stripe também tem os botões de dizer de qual foi, e os
  // "voucher devolvido por outro meio" esperam a resposta
  const falhouEDireto = reembolsoNoPainel(
    doisItens({ reembolsoCentavos: 24200, historico: [...comAviso, ...historico(linhaDoReembolsoFalho(FALHO_DO_VOUCHER))] }, [
      'reembolsado',
      undefined,
    ]),
  );
  assert.equal(falhouEDireto.tipo, 'falhou');
  if (falhouEDireto.tipo === 'falhou') {
    assert.equal(falhouEDireto.semVoucher.length, 1);
    assert.deepEqual(falhouEDireto.vouchersPagos, []);
  }
});

test('o filtro "Reembolsos a resolver" e as contas das faixas: por pedido, e o contestado fica na faixa das contestações', () => {
  const parado = linhaDoReembolsoParadoPelaContestacao({ id: 're_parado', centavos: 15400 });
  const aberta = leituraDaContestacao({ id: 'du_teste', amount: 15400, status: 'needs_response', reason: 'fraudulent' }).evento;
  const perdida = leituraDaContestacao({ id: 'du_teste', amount: 15400, status: 'lost', reason: 'fraudulent' }).evento;
  const pedidos = {
    falhou: umItem({ status: 'reembolsado', reembolsoCentavos: 15400, historico: historico(linhaDoReembolsoFalho(FALHO_TOTAL)) }),
    devolvido: umItem({
      status: 'reembolsado',
      reembolsoCentavos: 15400,
      historico: historico(linhaDoReembolsoFalho(FALHO_TOTAL), linhaDaDevolucaoPorOutroMeio(FALHO_TOTAL)),
    }),
    direto: doisItens({ reembolsoCentavos: 15400, historico: historico(linhaDoReembolsoSemVoucher(SEM_VOUCHER)) }),
    parado: umItem({ status: 'reembolsado', reembolsoCentavos: 15400, historico: historico(aberta, parado) }),
    paradoContestado: umItem({ status: 'contestado', historico: historico(aberta, parado) }),
    paradoEncerrado: umItem({ status: 'reembolsado', reembolsoCentavos: 15400, historico: historico(aberta, parado, perdida) }),
    normal: umItem(),
  };
  const esperado = {
    falhou: true,
    devolvido: false,
    direto: true,
    parado: true,
    paradoContestado: false,
    paradoEncerrado: false,
    normal: false,
  };
  for (const [nome, p] of Object.entries(pedidos)) assert.equal(reembolsoParaResolver(p), esperado[nome as keyof typeof esperado], nome);
  assert.deepEqual(contarReembolsosAResolver(Object.values(pedidos)), { falhos: 1, semVoucher: 1, parados: 1 });
  // dois reembolsos que falharam no mesmo pedido contam um pedido
  const doisFalhos = doisItens(
    { reembolsoCentavos: 39600, historico: historico(linhaDoReembolsoFalho(FALHO_DO_VOUCHER), linhaDoReembolsoFalho(FALHO_TOTAL)) },
    ['reembolsado', 'reembolsado'],
  );
  assert.deepEqual(contarReembolsosAResolver([doisFalhos]), { falhos: 1, semVoucher: 0, parados: 0 });
  // a leitura da linha parada: o valor e o id, uma vez por reembolso
  assert.deepEqual(reembolsosParadosPelaContestacao(historico(aberta, parado, parado)), [
    { id: 're_parado', centavos: 15400, encerrado: false },
  ]);
});

test('o motivo da falha do reembolso em português para a equipe; o que a lista não conhece fica "motivo não informado"', () => {
  const motivos: [string, string][] = [
    ['expired_or_canceled_card', 'cartão vencido ou cancelado'],
    ['lost_or_stolen_card', 'cartão dado como perdido ou roubado'],
    ['declined', 'recusado pelo banco'],
    ['insufficient_funds', 'faltou saldo na conta da Stripe por mais de 45 dias'],
    ['merchant_request', 'cancelado a pedido da empresa'],
    ['charge_for_pending_refund_disputed', 'o cliente abriu uma contestação com o reembolso a caminho'],
    ['unknown', 'motivo não informado'],
  ];
  for (const [codigo, frase] of motivos) assert.equal(motivoDoReembolsoFalho(codigo), frase, codigo);
  for (const codigo of ['', '  ', null, undefined, 'motivo não informado', 'codigo_novo', 'constructor', '__proto__'])
    assert.equal(motivoDoReembolsoFalho(codigo), 'motivo não informado', String(codigo));
  assert.equal(motivoDoReembolsoFalho(' Expired_Or_Canceled_Card '), 'cartão vencido ou cancelado');
});

test('as frases vermelhas do pedido: o valor com centavos, o motivo em português, e o cuidado com o cartão perdido ou roubado', () => {
  // o reembolso do pedido inteiro que falhou
  const [inteiro] = frasesDoReembolsoNoPainel(
    umItem({ status: 'reembolsado', reembolsoCentavos: 15400, historico: historico(linhaDoReembolsoFalho(FALHO_TOTAL)) }),
  );
  assert.equal(
    inteiro,
    `O reembolso de ${cifra(15400)} falhou na Stripe (cartão vencido ou cancelado): o cliente não recebeu. Devolva por outro meio (um Pix, por exemplo) só para o titular do pedido, confirmando antes pelo e-mail ou WhatsApp do pedido, e registre abaixo.`,
  );
  // o de um voucher
  const [doVoucher] = frasesDoReembolsoNoPainel(
    doisItens({ reembolsoCentavos: 24200, historico: historico(linhaDoReembolsoFalho(FALHO_DO_VOUCHER)) }, ['reembolsado', undefined]),
  );
  assert.ok(doVoucher.startsWith(`O reembolso de ${cifra(24200)} do voucher ON-AAA234 falhou na Stripe (cartão vencido ou cancelado): `));
  // o cartão dado como perdido ou roubado: mais uma frase; o código cru nunca aparece na frase
  const roubado = frasesDoReembolsoNoPainel(
    umItem({
      status: 'reembolsado',
      reembolsoCentavos: 15400,
      historico: historico(linhaDoReembolsoFalho({ ...FALHO_TOTAL, motivo: 'lost_or_stolen_card' })),
    }),
  );
  assert.equal(roubado.length, 2);
  assert.match(roubado[0], /\(cartão dado como perdido ou roubado\)/);
  assert.equal(roubado[1], 'Não diga o motivo ao cliente. Antes de devolver por outro meio, confirme que quem pede é o titular do cartão.');
  for (const frase of [inteiro, doVoucher, ...roubado]) assert.doesNotMatch(frase, /_card|expired|stolen/);
  // depois de registrada a devolução, a frase some
  assert.deepEqual(
    frasesDoReembolsoNoPainel(
      umItem({
        status: 'reembolsado',
        reembolsoCentavos: 15400,
        historico: historico(linhaDoReembolsoFalho(FALHO_TOTAL), linhaDaDevolucaoPorOutroMeio(FALHO_TOTAL)),
      }),
    ),
    [],
  );
  // o feito direto na Stripe sem voucher
  assert.deepEqual(
    frasesDoReembolsoNoPainel(doisItens({ reembolsoCentavos: 15400, historico: historico(linhaDoReembolsoSemVoucher(SEM_VOUCHER)) })),
    [
      `A Stripe devolveu ${cifra(15400)} deste pedido por fora do site, sem dizer de qual voucher. Diga abaixo de qual voucher foi: isso não devolve dinheiro de novo.`,
    ],
  );
  // o parado pela contestação: não devolver por fora; também no pedido contestado (a faixa é a das contestações)
  const parado = linhaDoReembolsoParadoPelaContestacao({ id: 're_parado', centavos: 15400 });
  assert.deepEqual(frasesDoReembolsoNoPainel(umItem({ status: 'contestado', historico: historico(parado) })), [
    `O reembolso de ${cifra(15400)} não foi concluído porque o cliente abriu uma contestação no banco. Não devolva por outro meio: o banco devolve pela contestação. Aceite ou responda a contestação no painel da Stripe.`,
  ]);
  // um pedido contestado nunca manda "devolver por outro meio" um reembolso que falhou antes da contestação
  assert.deepEqual(
    frasesDoReembolsoNoPainel(
      umItem({ status: 'contestado', reembolsoCentavos: 15400, historico: historico(linhaDoReembolsoFalho(FALHO_TOTAL)) }),
    ),
    [],
  );
  // e um pedido normal não tem frase
  assert.deepEqual(frasesDoReembolsoNoPainel(umItem()), []);
});

test('o valor do pedido: o que chegou ao cliente, a parte por outro meio e o que falta devolver', () => {
  assert.deepEqual(devolucaoNoPainel(umItem()), {});
  assert.deepEqual(devolucaoNoPainel(umItem({ status: 'reembolsado', reembolsoCentavos: 15400 })), {
    reembolsado: `Reembolsado ${cifra(15400)}`,
  });
  // o reembolso inteiro falhou: nada chegou, falta tudo
  const falhou = umItem({ status: 'reembolsado', reembolsoCentavos: 15400, historico: historico(linhaDoReembolsoFalho(FALHO_TOTAL)) });
  assert.deepEqual(devolucaoNoPainel(falhou), { falta: `Falta devolver ${cifra(15400)}: o reembolso falhou na Stripe` });
  // a equipe devolveu por outro meio
  const devolvido = umItem({
    status: 'reembolsado',
    reembolsoCentavos: 15400,
    historico: historico(linhaDoReembolsoFalho(FALHO_TOTAL), linhaDaDevolucaoPorOutroMeio(FALHO_TOTAL)),
  });
  assert.deepEqual(devolucaoNoPainel(devolvido), { reembolsado: `Reembolsado ${cifra(15400)} (${cifra(15400)} por outro meio)` });
  // misto: R$ 396,00 registrados, R$ 242,00 que falharam → R$ 154,00 pela mesma forma
  const misto = doisItens({
    status: 'reembolsado',
    reembolsoCentavos: 39600,
    historico: historico(linhaDoReembolsoFalho(FALHO_DO_VOUCHER)),
  });
  assert.deepEqual(devolucaoNoPainel(misto), {
    reembolsado: `Reembolsado ${cifra(15400)}`,
    falta: `Falta devolver ${cifra(24200)}: o reembolso falhou na Stripe`,
  });
  // o voucher devolvido por outro meio (depois de uma falha) conta como "por outro meio", uma vez só mesmo repetida
  const porFora = linhaDoVoucherDevolvidoPorOutroMeio('ON-BBB234', 15400);
  const comVoucherPorFora = doisItens(
    {
      status: 'reembolsado',
      reembolsoCentavos: 39600,
      historico: historico(linhaDoReembolsoFalho(FALHO_DO_VOUCHER), linhaDaDevolucaoPorOutroMeio(FALHO_DO_VOUCHER), porFora, porFora),
    },
    ['reembolsado', 'reembolsado'],
  );
  assert.deepEqual(devolucaoNoPainel(comVoucherPorFora), { reembolsado: `Reembolsado ${cifra(39600)} (${cifra(39600)} por outro meio)` });
});

test('o reembolso que falhou e, depois, uma contestação: a frase e a faixa do parado, sem "Falta devolver" nem "Registrar"; perdida fecha; ganha volta', () => {
  // as linhas que o webhook grava de verdade para a contestação
  const disputa = (status: 'needs_response' | 'lost' | 'won', centavos: number, id = 'du_depois') =>
    leituraDaContestacao({ id, amount: centavos, status, reason: 'fraudulent' }).evento;
  const parado = (centavos: number) =>
    `O reembolso de ${cifra(centavos)} não foi concluído porque o cliente abriu uma contestação no banco. Não devolva por outro meio: o banco devolve pela contestação. Aceite ou responda a contestação no painel da Stripe.`;
  const pendentes = (p: ReturnType<typeof umItem>) => {
    const m = reembolsoNoPainel(p);
    return m.tipo === 'falhou' ? m.pendentes.map((f) => f.id) : m.tipo;
  };
  /** A linha da falha no histórico do pedido continua destacada (pede a devolução por outro meio)? */
  const destacada = (p: ReturnType<typeof umItem>) => {
    const h = p.itens[0].historico;
    return avisoAberto(
      h,
      h.findIndex((x) => x.evento.includes('falhou na Stripe')),
    );
  };

  // O PEDIDO INTEIRO (um item, R$ 154,00): o reembolso total falhou; com a contestação, o pedido continua reembolsado
  const total = historico(
    'Pago (webhook da Stripe)',
    `Reembolso total (${cifra(15400)}) confirmado pela Stripe`,
    linhaDoReembolsoFalho(FALHO_TOTAL),
  );
  const inteiro = (...depois: string[]) =>
    umItem({ status: 'reembolsado', reembolsoCentavos: 15400, historico: [...total, ...historico(...depois)] });
  // sem contestação: devolver por outro meio (como antes)
  assert.match(frasesDoReembolsoNoPainel(inteiro())[0], /Devolva por outro meio \(um Pix, por exemplo\)/);
  // a falha e, depois, a contestação aberta: a frase do parado, a faixa dos parados, nenhum "Registrar", nenhum "Falta devolver"
  const aberto = inteiro(disputa('needs_response', 15400));
  assert.deepEqual(frasesDoReembolsoNoPainel(aberto), [parado(15400)]);
  assert.deepEqual(pendentes(aberto), []);
  assert.deepEqual(devolucaoNoPainel(aberto), { reembolsado: `Reembolsado ${cifra(15400)}` });
  assert.deepEqual(contarReembolsosAResolver([aberto]), { falhos: 0, semVoucher: 0, parados: 1 });
  assert.deepEqual(avisosDeReembolso(contarReembolsosAResolver([aberto])), [
    '1 reembolso parado por contestação: aceitar ou responder no painel da Stripe',
  ]);
  assert.equal(reembolsoParaResolver(aberto), true);
  assert.equal(destacada(aberto), false, 'a linha "devolver por outro meio" deixa de ser destacada');
  // depois, perdida: o banco devolveu ao cliente; o aviso fecha sem nada a devolver
  const perdido = inteiro(disputa('needs_response', 15400), disputa('lost', 15400));
  assert.deepEqual(frasesDoReembolsoNoPainel(perdido), []);
  assert.deepEqual(pendentes(perdido), []);
  assert.deepEqual(devolucaoNoPainel(perdido), { reembolsado: `Reembolsado ${cifra(15400)}` });
  assert.deepEqual(contarReembolsosAResolver([perdido]), { falhos: 0, semVoucher: 0, parados: 0 });
  assert.equal(reembolsoParaResolver(perdido), false);
  assert.equal(destacada(perdido), false);
  // ou ganha: o dinheiro ficou com a empresa, e volta tudo do reembolso que falhou
  const ganho = inteiro(disputa('needs_response', 15400), disputa('won', 15400));
  assert.match(frasesDoReembolsoNoPainel(ganho)[0], /^O reembolso de R\$\s154,00 falhou na Stripe .+ Devolva por outro meio/);
  assert.deepEqual(pendentes(ganho), ['re_total']);
  assert.deepEqual(devolucaoNoPainel(ganho), { falta: `Falta devolver ${cifra(15400)}: o reembolso falhou na Stripe` });
  assert.deepEqual(contarReembolsosAResolver([ganho]), { falhos: 1, semVoucher: 0, parados: 0 });
  assert.equal(destacada(ganho), true);
  // a contestação ANTES da falha não conta: devolver por outro meio
  const antes = umItem({
    status: 'reembolsado',
    reembolsoCentavos: 15400,
    historico: historico('Pago (webhook da Stripe)', disputa('needs_response', 15400, 'du_antes'), linhaDoReembolsoFalho(FALHO_TOTAL)),
  });
  assert.deepEqual(pendentes(antes), ['re_total']);
  assert.deepEqual(contarReembolsosAResolver([antes]), { falhos: 1, semVoucher: 0, parados: 0 });

  // UM VOUCHER (pedido de 2 itens, R$ 396,00): o reembolso do voucher ON-AAA234 falhou com o pedido pago; a contestação
  // leva o pedido a contestado (a faixa das contestações), a perdida a reembolsado, a ganha de volta a pago
  const doVoucher = historico('Pago (webhook da Stripe)', linhaDoReembolsoFalho(FALHO_DO_VOUCHER));
  const voucherCom = (status: Reserva['status'], reembolsoCentavos: number, ...depois: string[]) =>
    doisItens({ status, reembolsoCentavos, historico: [...doVoucher, ...historico(...depois)] }, ['reembolsado', undefined]);
  const contestado = voucherCom('contestado', 24200, disputa('needs_response', 39600));
  assert.deepEqual(reembolsoNoPainel(contestado), { tipo: 'contestado' });
  assert.deepEqual(frasesDoReembolsoNoPainel(contestado), [parado(24200)]);
  assert.deepEqual(devolucaoNoPainel(contestado), { reembolsado: `Reembolsado ${cifra(24200)}` });
  assert.deepEqual(contarReembolsosAResolver([contestado]), { falhos: 0, semVoucher: 0, parados: 0 });
  assert.equal(destacada(contestado), false);
  const voucherPerdido = voucherCom('reembolsado', 39600, disputa('needs_response', 39600), disputa('lost', 39600));
  assert.deepEqual(frasesDoReembolsoNoPainel(voucherPerdido), []);
  assert.deepEqual(reembolsoNoPainel(voucherPerdido), {
    tipo: 'falhou',
    pendentes: [],
    vouchersPagos: [],
    restanteCentavos: 0,
    semVoucher: [],
  });
  assert.deepEqual(devolucaoNoPainel(voucherPerdido), { reembolsado: `Reembolsado ${cifra(39600)}` });
  assert.deepEqual(contarReembolsosAResolver([voucherPerdido]), { falhos: 0, semVoucher: 0, parados: 0 });
  const voucherGanho = voucherCom('pago', 24200, disputa('needs_response', 39600), disputa('won', 39600));
  assert.match(frasesDoReembolsoNoPainel(voucherGanho)[0], /^O reembolso de R\$\s242,00 do voucher ON-AAA234 falhou na Stripe/);
  const ganhoNoPainel = reembolsoNoPainel(voucherGanho);
  assert.equal(ganhoNoPainel.tipo, 'falhou');
  if (ganhoNoPainel.tipo === 'falhou') {
    assert.deepEqual(
      ganhoNoPainel.pendentes.map((f) => f.id),
      ['re_voucher'],
    );
    assert.deepEqual(
      ganhoNoPainel.vouchersPagos.map((v) => v.codigo),
      ['ON-BBB234'],
    );
  }
  assert.deepEqual(devolucaoNoPainel(voucherGanho), { falta: `Falta devolver ${cifra(24200)}: o reembolso falhou na Stripe` });
  assert.deepEqual(contarReembolsosAResolver([voucherGanho]), { falhos: 1, semVoucher: 0, parados: 0 });
  // a contestação de antes da falha (já ganha) não conta
  const voucherAntes = doisItens(
    {
      reembolsoCentavos: 24200,
      historico: historico(
        'Pago (webhook da Stripe)',
        disputa('needs_response', 39600, 'du_antes'),
        disputa('won', 39600, 'du_antes'),
        linhaDoReembolsoFalho(FALHO_DO_VOUCHER),
      ),
    },
    ['reembolsado', undefined],
  );
  assert.deepEqual(contarReembolsosAResolver([voucherAntes]), { falhos: 1, semVoucher: 0, parados: 0 });
  assert.match(frasesDoReembolsoNoPainel(voucherAntes)[0], /Devolva por outro meio/);
});

test('o reembolso que falhou com o cartão perdido ou roubado e, depois, a contestação aberta: a frase do parado e "Não diga o motivo ao cliente."', () => {
  // as linhas que o webhook grava de verdade para a contestação
  const disputa = (status: 'needs_response' | 'lost' | 'won', centavos: number) =>
    leituraDaContestacao({ id: 'du_depois', amount: centavos, status, reason: 'fraudulent' }).evento;
  const parado = (centavos: number) =>
    `O reembolso de ${cifra(centavos)} não foi concluído porque o cliente abriu uma contestação no banco. Não devolva por outro meio: o banco devolve pela contestação. Aceite ou responda a contestação no painel da Stripe.`;
  const ROUBADO = { ...FALHO_TOTAL, motivo: 'lost_or_stolen_card' };
  assert.equal(NAO_DIGA_O_MOTIVO, 'Não diga o motivo ao cliente.');

  // o pedido inteiro (reembolsado): a frase do parado e, embaixo, o lembrete, como no e-mail à equipe do mesmo caso
  const falhaEContestacao = historico('Pago (webhook da Stripe)', linhaDoReembolsoFalho(ROUBADO), disputa('needs_response', 15400));
  const inteiro = umItem({ status: 'reembolsado', reembolsoCentavos: 15400, historico: falhaEContestacao });
  assert.deepEqual(frasesDoReembolsoNoPainel(inteiro), [parado(15400), 'Não diga o motivo ao cliente.']);
  const email = avisoDoReembolsoFalho(falhaEContestacao, 're_total', 'reembolsado');
  assert.ok(email?.contestacao && email.naoDizerOMotivo, 'o e-mail à equipe também manda não dizer o motivo');
  // nenhuma frase diz o código cru nem "devolva por outro meio"
  for (const frase of frasesDoReembolsoNoPainel(inteiro)) assert.doesNotMatch(frase, /_card|stolen|Devolva por outro meio/);

  // um voucher de um pedido de dois itens, com o pedido já contestado (fica na faixa das contestações)
  const doVoucher = doisItens(
    {
      status: 'contestado',
      reembolsoCentavos: 24200,
      historico: historico(
        'Pago (webhook da Stripe)',
        linhaDoReembolsoFalho({ ...FALHO_DO_VOUCHER, motivo: 'lost_or_stolen_card' }),
        disputa('needs_response', 39600),
      ),
    },
    ['reembolsado', undefined],
  );
  assert.deepEqual(frasesDoReembolsoNoPainel(doVoucher), [parado(24200), NAO_DIGA_O_MOTIVO]);

  // outro motivo, com a mesma contestação: só a frase do parado, como antes
  const vencido = umItem({
    status: 'reembolsado',
    reembolsoCentavos: 15400,
    historico: historico('Pago (webhook da Stripe)', linhaDoReembolsoFalho(FALHO_TOTAL), disputa('needs_response', 15400)),
  });
  assert.deepEqual(frasesDoReembolsoNoPainel(vencido), [parado(15400)]);
  // perdida: nada a dizer; ganha: a falha volta a pedir a devolução, com o cuidado do cartão de antes
  const depois = (...linhas: string[]) =>
    umItem({ status: 'reembolsado', reembolsoCentavos: 15400, historico: [...falhaEContestacao, ...historico(...linhas)] });
  assert.deepEqual(frasesDoReembolsoNoPainel(depois(disputa('lost', 15400))), []);
  const ganho = frasesDoReembolsoNoPainel(depois(disputa('won', 15400)));
  assert.equal(ganho.length, 2);
  assert.match(ganho[0], /Devolva por outro meio/);
  assert.equal(ganho[1], 'Não diga o motivo ao cliente. Antes de devolver por outro meio, confirme que quem pede é o titular do cartão.');
  // o reembolso parado pela contestação desde o começo (charge_for_pending_refund_disputed) não tem motivo de cartão
  const desdeOComeco = umItem({
    status: 'reembolsado',
    reembolsoCentavos: 15400,
    historico: historico(disputa('needs_response', 15400), linhaDoReembolsoParadoPelaContestacao({ id: 're_parado', centavos: 15400 })),
  });
  assert.deepEqual(frasesDoReembolsoNoPainel(desdeOComeco), [parado(15400)]);
});

test('os botões de devolver pedem a caixa "Confirmo" com o mesmo valor do botão; o voucher por fora nunca passa do que resta', () => {
  assert.equal(confirmacaoDoReembolso(15400), `Confirmo: devolver ${cifra(15400)} ao cliente. Não dá para desfazer.`);
  assert.equal(
    confirmacaoDoReembolsoDoVoucher(15400, 'ON-AAA234'),
    `Confirmo: devolver ${cifra(15400)} do voucher ON-AAA234. Não dá para desfazer.`,
  );
  assert.deepEqual(botaoDevolvidoPorFora(15400), {
    rotulo: `Registrar: ${cifra(15400)} devolvidos por outro meio`,
    confirmacao: `Confirmo: o cliente já recebeu ${cifra(15400)} por outro meio.`,
  });
  assert.deepEqual(botaoVoucherPorFora('ON-BBB234', 15400), {
    rotulo: `Registrar: voucher ON-BBB234 (${cifra(15400)}) devolvido por outro meio`,
    confirmacao: `Confirmo: o cliente já recebeu ${cifra(15400)} por outro meio. O voucher deixa de valer.`,
  });
  assert.deepEqual(botaoVoucherDaStripe('ON-BBB234', 15400), {
    rotulo: `Foi o voucher ON-BBB234 (${cifra(15400)}): marcar como devolvido`,
    confirmacao: 'Confirmo: o voucher ON-BBB234 deixa de valer. Nenhum dinheiro é devolvido agora.',
  });
  assert.equal(NENHUM_VOUCHER, 'Nenhum voucher: foi só um desconto');
  assert.equal(
    SEM_REEMBOLSO_DEPOIS_DA_FALHA,
    'Depois de um reembolso que falhou, o site não pede outro reembolso deste pagamento à Stripe.',
  );
  // o voucher devolvido por fora soma o valor dele, nunca mais do que ainda resta do pagamento (nem negativo)
  assert.equal(valorDoVoucherPorFora(15400, 39600), 15400);
  assert.equal(valorDoVoucherPorFora(15400, 10400), 10400);
  assert.equal(valorDoVoucherPorFora(15400, 0), 0);
  assert.equal(valorDoVoucherPorFora(15400, -500), 0);
});

test('o botão "Reembolsar só o voucher": o valor inteiro, só quando cabe no que resta do pagamento; limitado ao resto, nunca', () => {
  // o valor do voucher cabe no que resta: o rótulo e a caixa de sempre, com o mesmo valor
  assert.deepEqual(botaoReembolsoDoVoucher('ON-BBB234', 15400, 39600), {
    centavos: 15400,
    rotulo: `Reembolsar só o voucher ON-BBB234 (${cifra(15400)})`,
    confirmacao: `Confirmo: devolver ${cifra(15400)} do voucher ON-BBB234. Não dá para desfazer.`,
  });
  // exatamente o que resta (o último voucher, depois de devolver o outro): o valor do voucher, como antes
  assert.equal(botaoReembolsoDoVoucher('ON-AAA234', 24200, 24200)?.rotulo, `Reembolsar só o voucher ON-AAA234 (${cifra(24200)})`);
  // o ON-4KPC6F do teste de 15/11: R$ 396,00 pagos e R$ 308,00 já devolvidos. O voucher de R$ 242,00 vale mais do que os
  // R$ 88,00 que restam: devolver "só ele" levaria tudo o que resta, a Stripe trataria como reembolso total e o pedido
  // inteiro, com os dois vouchers, passaria a reembolsado. Nenhum botão limitado ao resto (Pacote 11, 16/11)
  assert.equal(botaoReembolsoDoVoucher('ON-AAA234', 24200, 39600 - 30800), null);
  assert.equal(botaoReembolsoDoVoucher('ON-AAA234', 24200, 24199), null, 'um centavo a menos do que o voucher');
  // nada a devolver (ou um voucher sem valor): nenhum botão
  for (const [valor, resta] of [
    [24200, 0],
    [24200, -500],
    [0, 39600],
    [-100, 39600],
  ])
    assert.equal(botaoReembolsoDoVoucher('ON-AAA234', valor, resta), null, `${valor} ${resta}`);
  // uma regra só, a do botão e a da rota
  for (const [valor, resta, cabe] of [
    [15400, 39600, true],
    [24200, 24200, true],
    [24200, 24199, false],
    [24200, 8800, false],
    [24200, 0, false],
    [0, 39600, false],
  ] as const)
    assert.equal(voucherCabeNoQueResta(valor, resta), cabe, `${valor} ${resta}`);
  // o voucher devolvido por OUTRO MEIO continua limitado ao que resta (ali a Stripe não entra, e o pedido só vira
  // reembolsado quando não sobra voucher pago)
  assert.equal(valorDoVoucherPorFora, valorADevolver);
  assert.equal(valorADevolver(24200, 8800), 8800);
  assert.equal(valorADevolver(15400, 39600), 15400);

  // no pedido como o painel o agrupa: o voucher ON-BBB234 devolvido pelo site e um desconto feito direto na Stripe, que a
  // equipe anotou como desconto. Resta R$ 88,00, e o único voucher ainda ativo vale R$ 242,00: sem botão
  const comDesconto = historico(
    'Pago (webhook da Stripe)',
    linhaDoReembolsoSemVoucher(SEM_VOUCHER),
    linhaDoReembolsoSemMudarVoucher('re_direto'),
  );
  const m = reembolsoNoPainel(doisItens({ reembolsoCentavos: 30800, historico: comDesconto }, [undefined, 'reembolsado']));
  assert.equal(m.tipo, 'stripe');
  if (m.tipo !== 'stripe') return;
  assert.equal(m.restanteCentavos, 8800);
  assert.deepEqual(
    m.vouchers.map((v) => v.codigo),
    ['ON-AAA234'],
  );
  assert.equal(botaoReembolsoDoVoucher(m.vouchers[0].codigo, valorRecebido(m.vouchers[0]), m.restanteCentavos), null);
  // fica o "Reembolsar tudo", que pede só o que resta e diz o efeito de verdade (o pedido inteiro)
  assert.equal(confirmacaoDoReembolso(m.restanteCentavos), `Confirmo: devolver ${cifra(8800)} ao cliente. Não dá para desfazer.`);
  // o pedido de dois itens sem reembolso nenhum continua com os dois botões, cada um pelo valor inteiro do voucher
  const inteiro = reembolsoNoPainel(doisItens());
  assert.equal(inteiro.tipo, 'stripe');
  if (inteiro.tipo !== 'stripe') return;
  assert.deepEqual(
    inteiro.vouchers.map((v) => botaoReembolsoDoVoucher(v.codigo, valorRecebido(v), inteiro.restanteCentavos)?.rotulo),
    [`Reembolsar só o voucher ON-AAA234 (${cifra(24200)})`, `Reembolsar só o voucher ON-BBB234 (${cifra(15400)})`],
  );
});

test('os códigos novos de erro do painel têm a sua frase, e cada uma diz que nada saiu agora ou o que fazer', () => {
  assert.equal(
    ERROS_DO_PAINEL['stripe-devolveu-menos'],
    'A Stripe tem menos dinheiro devolvido neste pagamento do que o site registra: um reembolso falhou ou foi cancelado lá. O site não pediu outro. Veja o aviso no pedido ou confira no painel da Stripe.',
  );
  assert.equal(
    ERROS_DO_PAINEL['contestado-nao-reembolsa'],
    'Este pagamento está contestado: o reembolso não é feito pelo site enquanto a contestação estiver aberta. Veja no painel da Stripe o que fazer. Nada foi devolvido agora.',
  );
  assert.equal(
    ERROS_DO_PAINEL['reembolso-sem-voucher'],
    'A Stripe já devolveu parte deste pedido por fora do site, sem dizer de qual voucher. Diga primeiro de qual voucher foi; nada foi devolvido agora.',
  );
  assert.equal(ERROS_DO_PAINEL['falta-confirmar'], 'Marque a caixa de confirmação antes de continuar. Nada foi feito.');
  for (const c of ['stripe-devolveu-menos', 'contestado-nao-reembolsa', 'reembolso-sem-voucher', 'falta-confirmar'])
    assert.equal(fraseDoErro(c), ERROS_DO_PAINEL[c as keyof typeof ERROS_DO_PAINEL], c);
});

/** O código de um arquivo de src/, sem as linhas de comentário (e sem o \r dos arquivos gravados com CRLF). */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
    .join('\n');

/** O trecho de uma ação da rota do painel: do `if (acao === '<nome>'` até a ação seguinte. */
function trechoDaAcao(rota: string, acao: string): string {
  const inicio = rota.indexOf(`if (acao === '${acao}'`);
  assert.notEqual(inicio, -1, acao);
  const fim = rota.slice(inicio + 1).search(/\n {2}if \(acao === '|\n {2}const manual = ACOES_MANUAIS/);
  return rota.slice(inicio, fim === -1 ? undefined : inicio + 1 + fim);
}

test('a rota do painel: contestado e "Confirmo" antes da Stripe; a Stripe com menos devolvido barra; a linha do aviso antes da resposta', () => {
  const rota = codigo('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  assert.match(rota, /const confirmou = form\.get\('confirmo'\) === 'sim';/);
  const reembolsar = trechoDaAcao(rota, 'reembolsar');
  const contestado = reembolsar.indexOf("if (alvo.status === 'contestado') return voltar('contestado-nao-reembolsa');");
  const confirmo = reembolsar.indexOf("if (!confirmou) return voltar('falta-confirmar');");
  const lista = reembolsar.indexOf('await reembolsosDoPagamento(alvo.paymentIntentId)');
  const menos = reembolsar.indexOf(
    "if (stripeDevolveuMenos(reembolsos, alvo.reembolsoCentavos ?? 0)) return voltar('stripe-devolveu-menos');",
  );
  const tudo = reembolsar.indexOf('criarReembolso(alvo.paymentIntentId)');
  const doItem = reembolsar.indexOf('criarReembolso(alvo.paymentIntentId, centavos, voucher)');
  for (const [nome, onde] of Object.entries({ contestado, confirmo, lista, menos, tudo, doItem })) assert.notEqual(onde, -1, nome);
  // nessa ordem: o contestado e a caixa antes de ler a Stripe; a lista relida e a trava antes dos dois pedidos de reembolso
  assert.ok(contestado < confirmo && confirmo < lista && lista < menos && menos < tudo && tudo < doItem);
  assert.equal(reembolsar.match(/criarReembolso\(/g)?.length, 2);
  assert.equal(reembolsar.match(/reembolsosDoPagamento\(/g)?.length, 1, 'a lista é lida uma vez, para os dois');

  // o reembolso feito direto na Stripe sem voucher: as linhas de aviso gravadas (conferidas dentro da trava) e só então a
  // resposta, antes do pedido de reembolso do voucher
  const semDono = reembolsar.indexOf('if (semDono.length) {');
  const grava = reembolsar.indexOf('await atualizarReserva(alvo.codigo, (r) => {', semDono);
  const faltam = reembolsar.indexOf('avisosDeReembolsoSemVoucher(r, { doPedido: true, total: false, foraDoSite: semDono }', semDono);
  const resposta = reembolsar.indexOf("return voltar('reembolso-sem-voucher');");
  assert.ok(
    semDono !== -1 && semDono < grava && grava < faltam && faltam < resposta && resposta < doItem,
    `${semDono} ${grava} ${faltam} ${resposta}`,
  );

  // a Stripe que recusa o pagamento contestado (charge_disputed) volta como contestado-nao-reembolsa
  const captura = reembolsar.slice(reembolsar.indexOf('} catch (e) {'));
  assert.match(
    captura,
    /if \(e instanceof Stripe\.errors\.StripeError && e\.code === 'charge_disputed'\) \{[\s\S]*?return voltar\('contestado-nao-reembolsa'\);/,
  );
  assert.ok(captura.indexOf("voltar('contestado-nao-reembolsa')") < captura.indexOf("voltar('stripe-falhou')"));
});

test('a rota do painel: o voucher sai pelo valor inteiro e só quando cabe no que resta; senão, recusa antes de qualquer chamada à Stripe', () => {
  const rota = codigo('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  const reembolsar = trechoDaAcao(rota, 'reembolsar');
  // o que resta do pagamento: o que entrou (a conta do painel, valorRecebido de cada voucher) menos o que já voltou
  const resta = reembolsar.indexOf(
    'const restante = vouchers.reduce((soma, v) => soma + valorRecebido(v), 0) - (alvo.reembolsoCentavos ?? 0);',
  );
  const nada = reembolsar.indexOf("if (acao === 'reembolsar_item' && restante <= 0) return voltar('nada-a-devolver');");
  const doVoucher = reembolsar.indexOf("if (acao === 'reembolsar_item') {");
  const conta = reembolsar.indexOf('const centavos = item ? valorDoVoucher(alvo, item) : 0;');
  const semValor = reembolsar.indexOf("if (centavos <= 0) return voltar('nada-a-devolver');");
  const maior = reembolsar.indexOf("if (!voucherCabeNoQueResta(centavos, restante)) return voltar('voucher-maior-que-o-resto');");
  const tentativa = reembolsar.indexOf('try {');
  const lista = reembolsar.indexOf('await reembolsosDoPagamento(alvo.paymentIntentId)');
  const tudo = reembolsar.indexOf('criarReembolso(alvo.paymentIntentId)');
  const doItem = reembolsar.indexOf('criarReembolso(alvo.paymentIntentId, centavos, voucher)');
  for (const [nome, onde] of Object.entries({ resta, nada, doVoucher, conta, semValor, maior, tentativa, lista, tudo, doItem }))
    assert.notEqual(onde, -1, nome);
  // sem nada a devolver, ou com o voucher que vale mais do que resta, a recusa vem antes de qualquer chamada à Stripe (a
  // lista relida e os dois pedidos de reembolso): o voucher é conferido antes do try
  assert.ok(resta < nada && nada < conta && conta < doVoucher && doVoucher < semValor && semValor < maior && maior < tentativa);
  assert.ok(tentativa < lista && lista < tudo && tudo < doItem);
  // as recusas do voucher ficam no bloco só do reembolsar_item: o "Reembolsar tudo" segue sem elas
  const bloco = reembolsar.slice(doVoucher, tentativa);
  for (const recusa of [
    "voltar('voucher-de-fora')",
    "voltar('item-ja-devolvido')",
    "voltar('nada-a-devolver')",
    "voltar('voucher-maior-que-o-resto')",
  ])
    assert.ok(bloco.includes(recusa), recusa);
  assert.equal(
    reembolsar.match(/voltar\('voucher-de-fora'\)|voltar\('item-ja-devolvido'\)|voltar\('voucher-maior-que-o-resto'\)/g)?.length,
    3,
  );
  // o valor pedido à Stripe é o do voucher, inteiro: nunca limitado ao que resta, e não muda depois da conferência
  assert.equal(reembolsar.match(/\bcentavos = /g)?.length, 1);
  assert.doesNotMatch(rota, /valorADevolver\(/);
  // o botão do painel usa a mesma regra, e nenhum rótulo diz "o que resta do pagamento"
  const painel = codigo('lib', 'pedidos-painel.ts');
  assert.match(painel, /if \(!voucherCabeNoQueResta\(valorCentavos, restanteCentavos\)\) return null;/);
  assert.match(
    painel,
    /export const voucherCabeNoQueResta = \(valorCentavos: number, restanteCentavos: number\): boolean =>\s+valorCentavos > 0 && valorCentavos <= restanteCentavos;/,
  );
  assert.doesNotMatch(painel, /o que resta do pagamento/);
  // e as recusas dizem que nada saiu
  assert.equal(
    ERROS_DO_PAINEL['nada-a-devolver'],
    'Este pagamento não tem mais nada a devolver: o site já registra como devolvido tudo o que entrou. Nada foi pedido à Stripe.',
  );
  assert.equal(
    ERROS_DO_PAINEL['voucher-maior-que-o-resto'],
    'Este voucher vale mais do que ainda resta deste pagamento: devolver só ele levaria tudo o que resta, e a Stripe trataria como reembolso total, com o pedido inteiro e todos os vouchers passando a reembolsado. Se é isso, use "Reembolsar tudo". Nada foi pedido à Stripe.',
  );
  for (const c of ['nada-a-devolver', 'voucher-maior-que-o-resto'])
    assert.equal(fraseDoErro(c), ERROS_DO_PAINEL[c as keyof typeof ERROS_DO_PAINEL]);
});

test('a rota do painel: as ações novas não devolvem dinheiro pela Stripe, só uma muda o status e as três de dinheiro pedem "Confirmo"', () => {
  const rota = codigo('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  const acoes = ['devolvido_por_fora', 'voucher_por_fora', 'voucher_da_stripe', 'reembolso_sem_voucher'] as const;
  for (const acao of acoes) {
    const trecho = trechoDaAcao(rota, acao);
    assert.doesNotMatch(trecho, /criarReembolso|reembolsosDoPagamento|stripe\(/, acao);
    // só o voucher devolvido por outro meio, quando não sobra voucher pago, leva o pedido a reembolsado
    if (acao === 'voucher_por_fora')
      assert.match(trecho, /if \(ultimo && podeMudar\(r\.status, 'reembolsado'\)\) r\.status = 'reembolsado';/);
    else assert.doesNotMatch(trecho, /\.status = /, acao);
    // a caixa "Confirmo" antes de qualquer gravação (o desconto não mexe em dinheiro nem em voucher: não pede)
    const confirmo = trecho.indexOf("if (!confirmou) return voltar('falta-confirmar');");
    const gravacoes = [trecho.indexOf('atualizarReserva('), trecho.indexOf('atualizarItem(')].filter((n) => n !== -1);
    assert.ok(gravacoes.length > 0, acao);
    if (acao === 'reembolso_sem_voucher') assert.equal(confirmo, -1);
    else assert.ok(confirmo !== -1 && gravacoes.every((n) => confirmo < n), acao);
  }
  // o voucher por fora: soma uma vez por voucher (a conferência dentro da trava) e marca o voucher depois do pedido
  const porFora = trechoDaAcao(rota, 'voucher_por_fora');
  assert.match(porFora, /gravado\.linha = vouchersDevolvidosPorOutroMeio\(r\.historico\)\.some\(\(v\) => v\.voucher === voucher\);/);
  assert.match(porFora, /const centavos = valorDoVoucherPorFora\(valor, recebido - \(r\.reembolsoCentavos \?\? 0\)\);/);
  assert.ok(porFora.indexOf('await atualizarReserva(') < porFora.indexOf('await atualizarItem('));
  // o registro por fora repetido não grava de novo: a conferência é dentro da trava de versão
  assert.match(
    trechoDaAcao(rota, 'devolvido_por_fora'),
    /return falho && !falho\.devolvido \? registrar\(r, linhaDaDevolucaoPorOutroMeio\(falho\)\) : null;/,
  );
});

test('a página do painel: a caixa "Confirmo" nos botões de devolver, nenhuma caixa da Stripe no contestado, o filtro e as faixas', () => {
  const pagina = codigo('app', 'admin', 'page.tsx');
  /** O elemento <BotaoAcao … /> de uma ação (o primeiro). */
  const botao = (acao: string) => {
    const inicio = pagina.indexOf(`acao="${acao}"`);
    assert.notEqual(inicio, -1, acao);
    return pagina.slice(pagina.lastIndexOf('<BotaoAcao', inicio), pagina.indexOf('/>', inicio));
  };
  assert.match(botao('reembolsar'), /confirmacao=\{confirmacaoDoReembolso\(restante\)\}/);
  // o voucher: o rótulo e a caixa saem de botaoReembolsoDoVoucher, com o mesmo valor (o inteiro do voucher), e o botão não
  // aparece quando o voucher não cabe no que resta do pagamento (16/11, depois do ON-4KPC6F; Pacote 11)
  assert.match(botao('reembolsar_item'), /rotulo=\{botao\.rotulo\}/);
  assert.match(botao('reembolsar_item'), /confirmacao=\{botao\.confirmacao\}/);
  assert.match(
    pagina,
    /const botao = botaoReembolsoDoVoucher\(i\.codigo, valorRecebido\(i\), restante\);\s+return \(\s+botao && \(\s+<BotaoAcao\s[^>]*?acao="reembolsar_item"/,
  );
  assert.doesNotMatch(pagina, /Reembolsar só o voucher \$\{/);
  // o rótulo mais comprido quebra a linha dentro do botão no celular: nada no botão impede a quebra
  const botaoAcao = pagina.slice(pagina.indexOf('function BotaoAcao('), pagina.indexOf('function ReembolsoStripe('));
  assert.match(botaoAcao, /<button type="submit" className=\{`min-h-10 px-4 text-small font-semibold/);
  assert.doesNotMatch(botaoAcao, /whitespace-nowrap|text-nowrap|truncate/);
  for (const acao of ['devolvido_por_fora', 'voucher_por_fora', 'voucher_da_stripe'])
    assert.match(botao(acao), /confirmacao=\{botao\.confirmacao\}/, acao);
  assert.doesNotMatch(botao('reembolso_sem_voucher'), /confirmacao=/);
  // a caixa é obrigatória no formulário (o navegador não envia sem ela) e manda o valor que a rota confere
  assert.match(pagina, /<input type="checkbox" name="confirmo" value="sim" required/);
  // o contestado não tem a caixa "Reembolsar na Stripe…": só o tipo "stripe" de reembolsoNoPainel a mostra
  assert.match(pagina, /reembolso\.tipo === 'stripe' && \(\s*<ReembolsoStripe /);
  assert.doesNotMatch(pagina, /pagoNaStripe && <ReembolsoStripe/);
  assert.match(pagina, /reembolso\.tipo === 'contestado' && <p [^>]*>\{SEM_REEMBOLSO_NA_CONTESTACAO\}<\/p>/);
  // o filtro e as faixas, todas levando a ele
  assert.match(pagina, /\{ valor: 'reembolsos', rotulo: 'Reembolsos a resolver', so: \(p\) => reembolsoParaResolver\(p\) \}/);
  assert.match(pagina, /const reembolsos = avisosDeReembolso\(contarReembolsosAResolver\(pedidos\)\);/);
  assert.match(pagina, /reembolsos\.map\(\(aviso\) => \(\s*<a key=\{aviso\} href="\/admin\?status=reembolsos"/);
});
