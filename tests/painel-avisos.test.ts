import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventoDoReembolsoFalho } from '../src/app/api/webhooks/stripe/eventos.ts';
import { AVISO_PAGO_DEPOIS_DO_HORARIO, avisoDeValorDiferente } from '../src/lib/pagamento-stripe.ts';
import { AVISO_EMAIL_PAGO_SAINDO, MARCA_DO_AVISO_A_EQUIPE, MARCA_DO_EMAIL } from '../src/lib/email/marcas.ts';
import {
  ERROS_DO_PAINEL,
  avisoAberto,
  avisosDeContestacao,
  contestacoesAbertas,
  ehAviso,
  fraseDoErro,
  motivoNoPainel,
  oQueFazerNaContestacao,
} from '../src/lib/pedidos-painel.ts';

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
