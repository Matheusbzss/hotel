import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  avisosDeReembolsoSemVoucher,
  efeitoDoReembolsoAtualizado,
  eventoDoItemReembolsado,
  linhasDosReembolsosPendentes,
} from '../src/app/api/webhooks/stripe/eventos.ts';
import { EMPRESA } from '../src/config/empresa.ts';
import { IDIOMAS } from '../src/i18n/config.ts';
import { emailEssencial } from '../src/lib/email/cota.ts';
import {
  FINAL_DO_CANCELAMENTO_DO_VENCIDO,
  MARCA_DO_AVISO_DO_PEDIDO_PAGO,
  MARCA_DO_EMAIL_DO_CANCELAMENTO,
  PREFIXO_DOS_AVISOS_DO_EMAIL_PAGO,
  avisoDoAvisoDoPedidoPagoQueNaoSaiu,
  avisoDoEmailDoCancelamentoQueNaoSaiu,
  avisoDoEmailDoReembolsoQueNaoSaiu,
  emailDoReembolsoJaSaiu,
  linhaDoCancelamento,
  marcaDoEmailDoReembolso,
} from '../src/lib/email/marcas.ts';
import {
  emailAvisoDoPedidoPago,
  emailAvisoDoReembolsoFalho,
  emailPedidoCancelado,
  emailReembolso,
  type DadosDoPedido,
} from '../src/lib/email/mensagens.ts';
import {
  JANELA_DO_EMAIL_DO_REEMBOLSO_MS,
  avisoDoPedidoPagoSai,
  emailDoCancelamentoSai,
  linhaDoConcluidoQueFalta,
  linhaDoReembolsoCancelado,
  linhaDoReembolsoConcluido,
  linhaDoReembolsoPendente,
  planoDoEmailDoReembolso,
  motivoDoEnvioQueNaoSaiu,
  reembolsosParaAvisar,
  versaoParaMarcar,
  type ReembolsoDoAviso,
} from '../src/lib/email/regras-dos-avisos.ts';
import { TEXTOS_EMAIL } from '../src/lib/email/textos.ts';
import { avisoAberto } from '../src/lib/pedidos-painel.ts';
import {
  linhaDoReembolsoSemMudarVoucher,
  linhaDoVoucherLigado,
  reembolsoNoHistorico,
  reembolsosFalhos,
} from '../src/lib/reembolsos-a-resolver.ts';
import type { Reserva } from '../src/lib/reservas.ts';

/**
 * Pacote 28 (FASE-5, Etapa 2, primeira parte; 25/11/2026): os três avisos novos, pendurados no que já acontece, sem mudar
 * dinheiro, status nem voucher. (1) O e-mail do reembolso ao cliente, um por reembolso que a Stripe registrou, com o prazo
 * da página oficial da Stripe; o pendente sai "a caminho", sem data, e o "concluído" só depois do refund.updated. (2) O
 * e-mail do pedido cancelado pela equipe no painel, sem dinheiro a devolver e sem opção de pedir estorno. (3) O aviso à
 * equipe do pedido pago. Cada gatilho e cada caso em que nada sai.
 */

const fonte = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

type Pedido = Pick<
  Reserva,
  'codigo' | 'status' | 'statusItem' | 'paymentIntentId' | 'historico' | 'pagamento' | 'provedor' | 'reembolsoCentavos'
>;

const h = (...eventos: string[]) => eventos.map((evento) => ({ em: '2026-11-25T12:00:00.000Z', evento }));

function pedido(extra: Partial<Pedido> = {}): Pedido {
  return {
    codigo: 'ON-AAAAAA',
    status: 'pago',
    statusItem: 'ativo',
    paymentIntentId: 'pi_1',
    historico: h('Pago (webhook da Stripe)'),
    pagamento: { metodo: 'cartao', pagoEm: '2026-11-25T11:00:00.000Z' },
    provedor: 'stripe',
    ...extra,
  } as Pedido;
}

const voucher = (codigo: string, statusItem: Reserva['statusItem'] = 'ativo', ...eventos: string[]) => ({
  codigo,
  statusItem,
  historico: h(...eventos),
});

const reembolso = (extra: Partial<ReembolsoDoAviso> = {}): ReembolsoDoAviso => ({
  id: 're_1',
  amount: 15400,
  status: 'succeeded',
  paymentIntentId: 'pi_1',
  ...extra,
});

/* ------------------------------------------------------------------ */
/* (1) O e-mail do reembolso                                            */

test('reembolso: o pedido inteiro (Reembolsar tudo), já concluído na Stripe → "confirmado", com a forma do pedido', () => {
  const p = pedido({ status: 'reembolsado', reembolsoCentavos: 15400 });
  const plano = planoDoEmailDoReembolso(p, [voucher('ON-AAAAAA', 'ativo')], reembolso({ referencia: 'total' }));
  assert.deepEqual(plano, {
    sai: true,
    versao: 'confirmado',
    centavos: 15400,
    forma: 'cartao',
    alcance: { tipo: 'pedido' },
    aindaValem: [],
  });
  // no Pix, a forma é Pix
  const pix = planoDoEmailDoReembolso(
    { ...p, pagamento: { metodo: 'pix' } } as Pedido,
    [voucher('ON-AAAAAA')],
    reembolso({ referencia: 'total' }),
  );
  assert.equal(pix.sai && pix.forma, 'pix');
});

test('reembolso: um voucher de um pedido com vários itens → o voucher, e o que continua valendo', () => {
  const p = pedido();
  const lista = [voucher('ON-AAAAAA', 'ativo'), voucher('ON-BBBBBB', 'reembolsado'), voucher('ON-CCCCCC', 'ativo')];
  const plano = planoDoEmailDoReembolso(p, lista, reembolso({ referencia: 'ON-BBBBBB', amount: 8800 }));
  assert.ok(plano.sai);
  assert.deepEqual(plano.alcance, { tipo: 'voucher', voucher: 'ON-BBBBBB' });
  assert.deepEqual(plano.aindaValem, ['ON-AAAAAA', 'ON-CCCCCC']);
  assert.equal(plano.centavos, 8800);
  // revisão B1: o último voucher, que levou o pedido inteiro a reembolsado, continua sendo o daquele voucher (a referência
  // vem antes do status), e nada vale mais
  const ultimo = planoDoEmailDoReembolso(pedido({ status: 'reembolsado' }), lista, reembolso({ referencia: 'ON-BBBBBB' }));
  assert.ok(ultimo.sai);
  assert.deepEqual(ultimo.alcance, { tipo: 'voucher', voucher: 'ON-BBBBBB' });
  assert.deepEqual(ultimo.aindaValem, []);
  // dois reembolsos de voucher avaliados depois de o pedido virar reembolsado: cada e-mail diz o seu voucher, nenhum diz
  // "o pedido foi cancelado"
  const outro = planoDoEmailDoReembolso(pedido({ status: 'reembolsado' }), lista, reembolso({ id: 're_2', referencia: 'ON-CCCCCC' }));
  assert.ok(outro.sai);
  assert.deepEqual(outro.alcance, { tipo: 'voucher', voucher: 'ON-CCCCCC' });
  // o Reembolsar tudo e o feito direto na Stripe que deixou o pedido reembolsado continuam sendo o pedido inteiro
  const tudo = planoDoEmailDoReembolso(pedido({ status: 'reembolsado' }), lista, reembolso({ referencia: 'total' }));
  assert.ok(tudo.sai);
  assert.deepEqual(tudo.alcance, { tipo: 'pedido' });
  const direto = planoDoEmailDoReembolso(pedido({ status: 'reembolsado' }), lista, reembolso());
  assert.ok(direto.sai);
  assert.deepEqual(direto.alcance, { tipo: 'pedido' });
});

test('reembolso feito direto na Stripe: num pedido de um item, parte do valor (o voucher continua valendo)', () => {
  const plano = planoDoEmailDoReembolso(pedido({ reembolsoCentavos: 5000 }), [voucher('ON-AAAAAA')], reembolso({ amount: 5000 }));
  assert.ok(plano.sai);
  assert.deepEqual(plano.alcance, { tipo: 'parte' });
  assert.deepEqual(plano.aindaValem, ['ON-AAAAAA']);
});

test('reembolso feito direto na Stripe num pedido com vários itens: espera a equipe dizer de qual voucher foi', () => {
  const lista = [voucher('ON-AAAAAA'), voucher('ON-BBBBBB')];
  const espera = planoDoEmailDoReembolso(pedido(), lista, reembolso({ id: 're_dash' }));
  assert.equal(espera.sai, false);
  // ligado a um voucher no painel (a linha fica no histórico do voucher): o voucher
  const ligado = [voucher('ON-AAAAAA'), voucher('ON-BBBBBB', 'reembolsado', linhaDoVoucherLigado('re_dash', 'ON-BBBBBB'))];
  const plano = planoDoEmailDoReembolso(pedido(), ligado, reembolso({ id: 're_dash' }));
  assert.ok(plano.sai);
  assert.deepEqual(plano.alcance, { tipo: 'voucher', voucher: 'ON-BBBBBB' });
  assert.deepEqual(plano.aindaValem, ['ON-AAAAAA']);
  // anotado como desconto (a linha no pedido): parte do valor, os dois vouchers continuam valendo
  const desconto = planoDoEmailDoReembolso(
    pedido({ historico: h('Pago (webhook da Stripe)', linhaDoReembolsoSemMudarVoucher('re_dash')) }),
    lista,
    reembolso({ id: 're_dash' }),
  );
  assert.ok(desconto.sai);
  assert.deepEqual(desconto.alcance, { tipo: 'parte' });
  assert.deepEqual(desconto.aindaValem, ['ON-AAAAAA', 'ON-BBBBBB']);
});

test('reembolso: o pagamento parado de um pedido cancelado, devolvido no painel → o pedido inteiro, na forma do pagamento parado', () => {
  const p = pedido({
    status: 'cancelado',
    paymentIntentId: 'pi_retido',
    pagamento: {
      metodo: 'cartao',
      retido: { paymentIntentId: 'pi_retido', sessaoId: 'cs_1', valorCentavos: 13860, forma: 'pix', pagoEm: '' },
    },
  } as Partial<Pedido>);
  const plano = planoDoEmailDoReembolso(
    p,
    [voucher('ON-AAAAAA', 'cancelado')],
    reembolso({ paymentIntentId: 'pi_retido', referencia: 'total' }),
  );
  assert.ok(plano.sai);
  assert.equal(plano.forma, 'pix');
  assert.deepEqual(plano.alcance, { tipo: 'pedido' });
});

test('reembolso: os casos em que nada sai', () => {
  const lista = [voucher('ON-AAAAAA')];
  const nao = (p: Pedido, re: ReembolsoDoAviso, porque: string) => assert.equal(planoDoEmailDoReembolso(p, lista, re).sai, false, porque);
  nao(pedido(), reembolso({ status: 'failed' }), 'falhou: a equipe resolve (o aviso do refund.failed)');
  nao(pedido(), reembolso({ status: 'canceled' }), 'cancelado na Stripe');
  nao(pedido(), reembolso({ referencia: 'pagamento-repetido' }), 'a devolução de um pagamento a mais não é reembolso do pedido');
  nao(pedido(), reembolso({ paymentIntentId: 'pi_outro' }), 'reembolso de outro pagamento');
  nao(pedido({ provedor: 'whatsapp', pagamento: { metodo: 'pix' } } as Partial<Pedido>), reembolso(), 'pedido fora da Stripe');
  nao(pedido({ status: 'contestado' }), reembolso(), 'contestado: o banco decide');
  nao(pedido({ status: 'pendente' }), reembolso(), 'pendente');
  // o pedido cancelado sem pagamento dele (o do WhatsApp com uma sessão paga, devolvida sozinha)
  nao(pedido({ status: 'cancelado' }), reembolso(), 'cancelado sem o pagamento parado');
  // um e-mail só: com a marca do confirmado ou do concluído, nada
  nao(pedido({ historico: h(marcaDoEmailDoReembolso('confirmado', 're_1')) }), reembolso(), 'já saiu');
  nao(pedido({ historico: h(marcaDoEmailDoReembolso('concluido', 're_1')) }), reembolso(), 'já saiu o concluído');
});

test('reembolso pendente: "a caminho" sem data; o "concluído" só depois da linha do refund.updated, e uma vez', () => {
  const lista = [voucher('ON-AAAAAA')];
  const pendente = planoDoEmailDoReembolso(pedido(), lista, reembolso({ status: 'pending' }));
  assert.ok(pendente.sai);
  assert.equal(pendente.versao, 'a-caminho');
  const comMarca = pedido({ historico: h(marcaDoEmailDoReembolso('a-caminho', 're_1')) });
  // ainda pendente, ou concluído na Stripe sem o site ter registrado (a linha do refund.updated): nada
  assert.equal(planoDoEmailDoReembolso(comMarca, lista, reembolso({ status: 'pending' })).sai, false);
  assert.equal(planoDoEmailDoReembolso(comMarca, lista, reembolso()).sai, false);
  const registrado = pedido({ historico: h(marcaDoEmailDoReembolso('a-caminho', 're_1'), linhaDoReembolsoConcluido('re_1', 15400)) });
  const concluido = planoDoEmailDoReembolso(registrado, lista, reembolso());
  assert.ok(concluido.sai);
  assert.equal(concluido.versao, 'concluido');
  const depois = pedido({ historico: [...registrado.historico, ...h(marcaDoEmailDoReembolso('concluido', 're_1'))] });
  assert.equal(planoDoEmailDoReembolso(depois, lista, reembolso()).sai, false);
  // o pendente que terminou antes de o "a caminho" sair: um e-mail só, o confirmado
  const semMarca = planoDoEmailDoReembolso(pedido({ historico: h(linhaDoReembolsoConcluido('re_1', 15400)) }), lista, reembolso());
  assert.ok(semMarca.sai);
  assert.equal(semMarca.versao, 'confirmado');
});

test('o charge.refunded avisa só os reembolsos em vigor das últimas 72 horas, sem a devolução de um pagamento a mais', () => {
  const agora = new Date('2026-11-25T12:00:00.000Z');
  const s = (ms: number) => Math.floor((agora.getTime() - ms) / 1000);
  const lista = [
    { id: 're_novo', status: 'succeeded', created: s(60_000) },
    { id: 're_pendente', status: 'pending', created: s(3600_000) },
    { id: 're_velho', status: 'succeeded', created: s(JANELA_DO_EMAIL_DO_REEMBOLSO_MS + 1000) },
    { id: 're_falho', status: 'failed', created: s(60_000) },
    { id: 're_cancelado', status: 'canceled', created: s(60_000) },
    { id: 're_repetido', status: 'succeeded', created: s(60_000), referencia: 'pagamento-repetido' },
  ];
  assert.deepEqual(
    reembolsosParaAvisar(lista, agora).map((r) => r.id),
    ['re_novo', 're_pendente'],
  );
});

test('as linhas do reembolso pendente, concluído e cancelado não mexem nas regras do painel e do webhook', () => {
  for (const linha of [
    linhaDoReembolsoPendente('re_X', 100),
    linhaDoReembolsoConcluido('re_X', 100),
    linhaDoReembolsoCancelado('re_X', 100),
  ]) {
    assert.doesNotMatch(linha, /^Aviso:/, 'não é destacada no painel');
    assert.doesNotMatch(linha, /^Reembolso (total \(|de )/, 'não é a linha do charge.refunded (reembolsosSemVoucher, avisoAberto)');
    assert.ok(!linha.startsWith('Reembolso re_X da Stripe'), 'não resolve o reembolso sem voucher');
    assert.equal(reembolsoNoHistorico(h(linha), 're_X'), false, 'não cita o reembolso como "(re_…)"');
  }
  assert.ok(!marcaDoEmailDoReembolso('confirmado', 're_X').includes('(re_X)'));
  // o aviso do reembolso sem voucher continua saindo com a linha do pendente já gravada
  const avisos = avisosDeReembolsoSemVoucher(
    { historico: h(linhaDoReembolsoPendente('re_X', 100)) },
    { doPedido: true, total: false, foraDoSite: [{ reembolsoId: 're_X', centavos: 100 }] },
    2,
  );
  assert.equal(avisos.length, 1);
});

test('charge.refunded: a linha do pendente, uma vez por reembolso pendente do pedido', () => {
  const reembolsos = [
    { id: 're_ok', amount: 100, status: 'succeeded', metadata: {} },
    { id: 're_pend', amount: 200, status: 'pending', metadata: {} },
    { id: 're_falho', amount: 300, status: 'failed', metadata: {} },
    { id: 're_rep', amount: 400, status: 'pending', metadata: { referencia: 'pagamento-repetido' } },
  ];
  assert.deepEqual(linhasDosReembolsosPendentes([], reembolsos), [linhaDoReembolsoPendente('re_pend', 200)]);
  assert.deepEqual(linhasDosReembolsosPendentes(h(linhaDoReembolsoPendente('re_pend', 200)), reembolsos), []);
});

test('refund.updated: concluído depois de pendente → a linha e o e-mail; os outros casos, nada (ou só a linha do cancelado)', () => {
  const pend = [h(linhaDoReembolsoPendente('re_1', 15400))];
  const re = (status: string, extra = {}) => ({ id: 're_1', amount: 15400, status, payment_intent: 'pi_1', metadata: {}, ...extra });
  assert.deepEqual(efeitoDoReembolsoAtualizado(pend, re('succeeded'), 'pi_1'), {
    linha: linhaDoReembolsoConcluido('re_1', 15400),
    avisar: true,
    resultado: 'reembolso concluído',
  });
  // o voucher reembolsado sozinho com o dinheiro a caminho (a linha no histórico do voucher, também antes do Pacote 28)
  const item = [[], h(eventoDoItemReembolsado({ voucher: 'ON-BBBBBB', centavos: 15400, reembolsoId: 're_1', pendente: true }))];
  assert.equal(efeitoDoReembolsoAtualizado(item, re('succeeded'), 'pi_1').avisar, true);
  // nunca pendente (a Stripe manda o aviso também quando só acrescenta a referência do banco): nada
  assert.deepEqual(efeitoDoReembolsoAtualizado([[]], re('succeeded'), 'pi_1').avisar, false);
  assert.equal(efeitoDoReembolsoAtualizado([[]], re('succeeded'), 'pi_1').linha, undefined);
  // já concluído no histórico: nada de novo
  const ja = [h(linhaDoReembolsoPendente('re_1', 15400), linhaDoReembolsoConcluido('re_1', 15400))];
  assert.equal(efeitoDoReembolsoAtualizado(ja, re('succeeded'), 'pi_1').avisar, false);
  // cancelado: só a linha, uma vez, sem e-mail ao cliente
  const cancelado = efeitoDoReembolsoAtualizado(pend, re('canceled'), 'pi_1');
  assert.equal(cancelado.linha, linhaDoReembolsoCancelado('re_1', 15400));
  assert.equal(cancelado.avisar, false);
  assert.equal(efeitoDoReembolsoAtualizado([h(linhaDoReembolsoCancelado('re_1', 15400))], re('canceled'), 'pi_1').linha, undefined);
  // falhou: o refund.failed de sempre cuida; pendente ainda: nada; outro pagamento ou devolução a mais: nada
  for (const efeito of [
    efeitoDoReembolsoAtualizado(pend, re('failed'), 'pi_1'),
    efeitoDoReembolsoAtualizado(pend, re('pending'), 'pi_1'),
    efeitoDoReembolsoAtualizado(pend, re('succeeded', { payment_intent: 'pi_outro' }), 'pi_1'),
    efeitoDoReembolsoAtualizado(pend, re('succeeded', { metadata: { referencia: 'pagamento-repetido' } }), 'pi_1'),
  ]) {
    assert.equal(efeito.avisar, false);
    assert.equal(efeito.linha, undefined);
  }
});

/* ------------------------------------------------------------------ */
/* (2) O e-mail do pedido cancelado                                     */

test('pedido cancelado no painel, sem dinheiro a devolver: sai, uma vez; "Nada foi cobrado" só no que nunca foi pago', () => {
  const nunca = { status: 'cancelado', historico: h('Cancelado no admin'), pagamento: { metodo: 'pix' } } as Pedido;
  assert.deepEqual(emailDoCancelamentoSai(nunca), { sai: true, nadaCobrado: true });
  // o do WhatsApp (ação manual), pago fora da Stripe e cancelado sem reembolso: sai, sem "Nada foi cobrado"
  const pagoWhats = {
    status: 'cancelado',
    historico: h('Marcada como paga no Pix, no admin', 'Cancelada no admin'),
    pagamento: { metodo: 'pix', pagoEm: '2026-11-20T10:00:00.000Z' },
  } as Pedido;
  assert.deepEqual(emailDoCancelamentoSai(pagoWhats), { sai: true, nadaCobrado: false });
  // uma vez
  assert.equal(emailDoCancelamentoSai({ ...nunca, historico: h('Cancelado no admin', MARCA_DO_EMAIL_DO_CANCELAMENTO) }).sai, false);
});

test('pedido cancelado: nada sai nos cancelamentos automáticos, com pagamento parado, com reembolso ou fora do cancelado', () => {
  const base = { status: 'cancelado', pagamento: { metodo: 'pix' } } as Pedido;
  const nao = (r: Pedido, porque: string) => assert.equal(emailDoCancelamentoSai(r).sai, false, porque);
  nao({ ...base, historico: h('Cancelado: o cliente refez o pedido (ON-BBBBBB)') }, 'o cliente refez o pedido');
  nao({ ...base, historico: h('Cancelado: a sessão de pagamento não pôde ser criada') }, 'a sessão não pôde ser criada');
  nao({ ...base, historico: h('Pix não pago no prazo (webhook da Stripe)') }, 'o Pix vencido é expirado, com o e-mail dele');
  nao(
    {
      ...base,
      historico: h('Cancelado no admin'),
      pagamento: { metodo: 'pix', retido: { paymentIntentId: 'pi_1', sessaoId: 'cs_1', valorCentavos: 100, pagoEm: '' } },
    } as Pedido,
    'o pagamento chegou no instante do cancelamento: a equipe decide',
  );
  nao({ ...base, historico: h('Cancelado no admin'), reembolsoCentavos: 100 } as Pedido, 'com reembolso: o e-mail do reembolso cobre');
  nao({ ...base, status: 'pago', historico: h('Cancelado no admin') } as Pedido, 'não está cancelado');
});

test('cancelar no painel um pedido que já tinha vencido não manda o e-mail (Pacote 29, decisão do dono de 25/11)', () => {
  assert.equal(linhaDoCancelamento('Cancelado no admin', 'expirado'), 'Cancelado no admin (já estava vencido)');
  assert.equal(linhaDoCancelamento('Cancelado no admin', 'pendente'), 'Cancelado no admin');
  assert.equal(linhaDoCancelamento('Cancelado: o cliente refez o pedido (ON-BBBBBB)', 'expirado').endsWith(FINAL_DO_CANCELAMENTO_DO_VENCIDO), true);
  const vencido = {
    status: 'cancelado',
    historico: h('Pix não pago no prazo (webhook da Stripe)', linhaDoCancelamento('Cancelado no admin', 'expirado')),
    pagamento: { metodo: 'pix' },
  } as Pedido;
  assert.deepEqual(emailDoCancelamentoSai(vencido), { sai: false, motivo: 'o pedido já estava vencido quando a equipe cancelou' });
  // o pedido que ainda esperava o pagamento (até o que venceu e o cliente reabriu) continua recebendo
  const aberto = { ...vencido, historico: h('Pix não pago no prazo (webhook da Stripe)', linhaDoCancelamento('Cancelado no admin', 'pendente')) };
  assert.deepEqual(emailDoCancelamentoSai(aberto), { sai: true, nadaCobrado: true });
  // quem cancela grava a linha com o status de antes de cancelar
  assert.match(
    fonte('app', 'api', 'pedido', 'pedido-stripe.ts'),
    /const linha = linhaDoCancelamento\(evento, r\.status\);\s+r\.status = 'cancelado';\s+return registrar\(r, linha\);/,
  );
});

/* ------------------------------------------------------------------ */
/* (3) O aviso à equipe do pedido pago                                  */

test('aviso do pedido pago: só com o pedido pago, uma vez', () => {
  assert.equal(avisoDoPedidoPagoSai({ status: 'pago', historico: [] }), true);
  assert.equal(avisoDoPedidoPagoSai({ status: 'pago', historico: h(MARCA_DO_AVISO_DO_PEDIDO_PAGO) }), false);
  for (const status of ['contestado', 'reembolsado', 'cancelado', 'pendente'] as const) {
    assert.equal(avisoDoPedidoPagoSai({ status, historico: [] }), false, status);
  }
});

/* ------------------------------------------------------------------ */
/* Os textos                                                            */

const SITE = {
  url: 'https://orlanativa.online',
  logo: 'https://orlanativa.online/logo.png',
  nome: 'Orla Nativa',
  dominio: 'orlanativa.online',
};
const dados = (idioma: (typeof IDIOMAS)[number]): DadosDoPedido => ({
  idioma,
  nome: 'Ana Souza',
  codigo: 'ON-7K3P9Q',
  linkPedido: 'https://orlanativa.online/pedido/ON-7K3P9Q?t=abc',
  itens: [],
  site: SITE,
});
const DADOS_LEGAIS = Object.entries(EMPRESA)
  .filter(([chave]) => /^(razao|endereco)/.test(chave) || chave === ['c', 'n', 'p', 'j'].join(''))
  .map(([, valor]) => String(valor));

test('o e-mail do reembolso: o código, o valor com a forma e o prazo da Stripe; o pendente não promete data', () => {
  for (const idioma of IDIOMAS) {
    const R = TEXTOS_EMAIL[idioma].reembolso;
    const valor = { valor: 'R$ 154,00' };
    const cartao = emailReembolso({ ...dados(idioma), versao: 'confirmado', valor, forma: 'cartao', alcance: { tipo: 'pedido' } });
    assert.ok(cartao.assunto.includes('ON-7K3P9Q') && cartao.texto.includes('R$ 154,00'), idioma);
    assert.ok(cartao.texto.includes(R.prazoCartao) && cartao.texto.includes(R.pedidoInteiro), idioma);
    assert.match(R.prazoCartao, /5 a 10|5 to 10/, `${idioma}: o prazo do cartão da página da Stripe`);
    assert.ok(cartao.texto.includes(`${R.valor} (${TEXTOS_EMAIL[idioma].comum.formaCartao})`), `${idioma}: a forma`);
    const pix = emailReembolso({
      ...dados(idioma),
      versao: 'confirmado',
      valor,
      forma: 'pix',
      alcance: { tipo: 'voucher', voucher: 'ON-AB2CD3 (Escuna)' },
    });
    assert.ok(pix.texto.includes(R.prazoPix) && pix.texto.includes('ON-AB2CD3 (Escuna)'), idioma);
    const caminho = emailReembolso({ ...dados(idioma), versao: 'a-caminho', valor, forma: 'cartao', alcance: { tipo: 'parte' } });
    assert.ok(caminho.texto.includes(R.aCaminho) && !caminho.texto.includes(R.prazoCartao), `${idioma}: o pendente sem o prazo`);
    assert.doesNotMatch(R.aCaminho, /\d/, `${idioma}: nenhum número de dias no pendente`);
    const concluido = emailReembolso({ ...dados(idioma), versao: 'concluido', valor, forma: 'cartao', alcance: { tipo: 'pedido' } });
    assert.ok(concluido.assunto.includes('ON-7K3P9Q') && concluido.assunto !== cartao.assunto, idioma);
    assert.ok(concluido.texto.includes(R.concluido) && concluido.texto.includes(R.prazoCartao), idioma);
    for (const m of [cartao, pix, caminho, concluido]) {
      for (const legal of DADOS_LEGAIS) assert.ok(!m.texto.includes(legal) && !m.html.includes(legal), `${idioma}: dado legal`);
    }
  }
});

test('o e-mail do pedido cancelado: sem opção de pedir estorno ou desistir, com o link da política no rodapé', () => {
  for (const idioma of IDIOMAS) {
    const politica = 'https://orlanativa.online/politica-de-cancelamento';
    const m = emailPedidoCancelado({ ...dados(idioma), nadaCobrado: true, linkPolitica: politica });
    const C = TEXTOS_EMAIL[idioma].pedidoCancelado;
    assert.ok(m.assunto.includes('ON-7K3P9Q') && m.texto.includes(C.nadaCobrado), idioma);
    assert.ok(m.html.includes(`href="${politica}"`) && m.texto.includes(politica), `${idioma}: o link da política`);
    assert.doesNotMatch(
      m.texto,
      /reembols|estorn|refund|desist|withdraw|desistir|pedir|solicit|request/i,
      `${idioma}: nada de pedir estorno`,
    );
    assert.doesNotMatch(m.html, /desistir|\/api\/pedido/, idioma);
    const pago = emailPedidoCancelado({ ...dados(idioma), nadaCobrado: false, linkPolitica: politica });
    assert.ok(pago.texto.includes(C.semValer) && !pago.texto.includes(C.nadaCobrado), idioma);
  }
});

test('o aviso à equipe do pedido pago: código, total, forma, itens e o painel; nada do cartão nem do cliente', () => {
  const m = emailAvisoDoPedidoPago({
    codigo: 'ON-7K3P9Q',
    valor: 'R$ 270,00',
    forma: 'pix',
    origem: 'stripe',
    primeiroServico: '14/11/2026 às 10h00',
    itens: [{ nome: 'Passeio de Escuna em Búzios', linhas: ['sáb., 14 nov. 2026 às 10h', '2 adultos'] }],
    linkPainel: 'https://orlanativa.online/admin?q=ON-7K3P9Q',
    site: SITE,
  });
  assert.equal(m.assunto, 'Pedido pago: ON-7K3P9Q (R$ 270,00)');
  assert.ok(m.texto.includes('R$ 270,00 no Pix, pela Stripe'));
  assert.ok(m.texto.includes('Passeio de Escuna em Búzios') && m.texto.includes('sáb., 14 nov. 2026 às 10h'));
  assert.ok(m.html.includes('href="https://orlanativa.online/admin?q=ON-7K3P9Q"'));
  assert.doesNotMatch(m.texto, /visa|master|final \d|\*\*\*\*|@/i);
  const painel = emailAvisoDoPedidoPago({
    codigo: 'ON-7K3P9Q',
    valor: 'R$ 300,00',
    forma: 'cartao',
    origem: 'painel',
    primeiroServico: '—',
    itens: [],
    linkPainel: 'https://orlanativa.online/admin?q=ON-7K3P9Q',
    site: SITE,
  });
  assert.ok(painel.texto.includes('R$ 300,00 no cartão, marcado como pago no painel'));
});

test('o aviso à equipe do pedido pago avisa do hotel a informar, no assunto e num parágrafo (Pacote 29)', () => {
  const base = {
    codigo: 'ON-7K3P9Q',
    valor: 'R$ 154,00',
    forma: 'cartao' as const,
    origem: 'stripe' as const,
    primeiroServico: '30/11/2026 às 9h00',
    itens: [{ nome: 'Passeio de Escuna em Búzios', linhas: ['seg., 30 nov. 2026 às 9h', '2 adultos'] }],
    linkPainel: 'https://orlanativa.online/admin?q=ON-7K3P9Q',
    site: SITE,
  };
  const com = emailAvisoDoPedidoPago({ ...base, hotelAInformar: true });
  assert.equal(com.assunto, 'Pedido pago: ON-7K3P9Q (R$ 154,00) · hotel a informar');
  assert.ok(com.texto.includes('o cliente ainda não sabe o hotel'));
  assert.ok(com.texto.includes('"Gravar o hotel"'));
  const sem = emailAvisoDoPedidoPago(base);
  assert.equal(sem.assunto, 'Pedido pago: ON-7K3P9Q (R$ 154,00)');
  assert.ok(!sem.texto.includes('ainda não sabe o hotel'));
  // quem envia confere os passeios do pedido
  assert.match(fonte('lib', 'email', 'pedidos.ts'), /hotelAInformar: lista\.some\(\(v\) => !ehTransfer\(v\) && v\.hospedagem\.aInformar === true\)/);
});

test('os quatro e-mails novos são essenciais na cota do dia', () => {
  for (const tipo of ['reembolso', 'reembolso-concluido', 'pedido-cancelado', 'pedido-pago-equipe'] as const) {
    assert.equal(emailEssencial(tipo), true, tipo);
  }
});

/* ------------------------------------------------------------------ */
/* Onde cada aviso está pendurado                                       */

test('os gatilhos: o webhook, o painel, o pagamento e o agendamento; nenhum caminho de dinheiro novo', () => {
  const webhook = fonte('app', 'api', 'webhooks', 'stripe', 'route.ts');
  assert.match(webhook, /case 'refund\.updated':\s+return reembolsoAtualizado\(evento\.data\.object\);/);
  // o charge.refunded: a linha do pendente e o e-mail de cada reembolso das últimas 72 horas, depois das gravações de sempre
  const cobranca = webhook.slice(webhook.indexOf('async function cobrancaReembolsada'), webhook.indexOf('async function reembolsoFalhou'));
  assert.match(
    cobranca,
    /if \(!plano\.doPedido\) return \{ codigo, resultado: 'devolução de um pagamento repetido registrada' \};[\s\S]+linhasDosReembolsosPendentes[\s\S]+reembolsosParaAvisar[\s\S]+agendarEmailDoReembolso\(codigo, re\.id\);/,
  );
  // o refund.failed continua sem e-mail ao cliente (só o aviso à equipe)
  const falhou = webhook.slice(webhook.indexOf('async function reembolsoFalhou'), webhook.indexOf('async function reembolsoAtualizado'));
  assert.doesNotMatch(falhou, /agendarEmailDoReembolso/);
  assert.match(falhou, /agendarAvisoDoReembolsoFalho\(codigo, atual\.id\);/);
  // o refund.updated só grava a linha e agenda o e-mail: nada de reembolso, status ou voucher
  const atualizado = webhook.slice(webhook.indexOf('async function reembolsoAtualizado'), webhook.indexOf('async function contestacao'));
  assert.doesNotMatch(atualizado, /criarReembolso|r\.status =|reembolsoCentavos =|atualizarItem/);
  assert.match(atualizado, /if \(efeito\.avisar\) agendarEmailDoReembolso\(codigo, atual\.id\);/);

  const painel = fonte('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  assert.match(painel, /if \(r\) agendarEmailDoCancelamento\(codigoDoPedido\);/);
  assert.match(painel, /if \(virouCancelado && atualizada\) agendarEmailDoCancelamento\(codigoDoPedido\);/);
  assert.match(painel, /agendarEmailDoPedido\('pagamento-aprovado', codigoDoPedido\);\s+agendarAvisoDoPedidoPago\(codigoDoPedido\);/);
  assert.equal(painel.match(/agendarEmailDoReembolso\(codigoDoPedido, id\);/g)?.length, 2, 'voucher da Stripe e desconto');

  const pagamento = fonte('lib', 'pagamento-stripe.ts');
  assert.match(
    pagamento,
    /agendarEmailDoPedido\('pagamento-aprovado', reserva\.pedido\?\.codigo \?\? reserva\.codigo\);\s+agendarAvisoDoPedidoPago\(/,
  );
  assert.match(fonte('lib', 'email', 'pendentes.ts'), /await enviarAvisoDoPedidoPago\(p\.codigo\)/);

  // os cancelamentos automáticos do site não mandam o e-mail do cancelamento
  for (const arquivo of [fonte('app', 'api', 'pedido', 'route.ts'), fonte('app', 'api', 'pedido', 'pedido-stripe.ts')]) {
    assert.doesNotMatch(arquivo, /agendarEmailDoCancelamento|enviarEmailDoCancelamento/);
  }
  // os envios novos não pedem reembolso nem mudam o pedido (só a marca do e-mail, por anotar)
  const envio = fonte('lib', 'email', 'pedidos.ts');
  const novos = envio.slice(envio.indexOf('export async function enviarEmailDoReembolso'));
  assert.doesNotMatch(novos, /criarReembolso|refunds\.create|atualizarItem|\.status =/);
  assert.match(novos, /chave: `\$\{tipo\}\/\$\{re\.id\}`/);
  assert.match(novos, /chave: `pedido-cancelado\/\$\{pedido\}`/);
  assert.match(novos, /chave: `pedido-pago-equipe\/\$\{pedido\}`/);
});

/* ------------------------------------------------------------------ */
/* Revisão: o e-mail que não saiu (M1), a mesma chave (B3), o reembolso que falha depois do e-mail (B4), a linha do      */
/* concluído que faltava (B5) e o prazo do Pix (B2)                                                                      */

test('M1: o e-mail novo que não saiu vira aviso no painel; o desligado, o repetido e o que saiu, não', () => {
  assert.equal(motivoDoEnvioQueNaoSaiu({ enviado: true, id: 'x' }), null);
  assert.equal(motivoDoEnvioQueNaoSaiu({ enviado: false, motivo: 'desligado' }), null, 'sem a chave do Resend, de propósito');
  assert.equal(motivoDoEnvioQueNaoSaiu({ enviado: false, motivo: 'repetido' }), null, 'a mesma chave já saiu');
  for (const motivo of ['cota', 'recusado', 'falha'] as const) {
    const texto = motivoDoEnvioQueNaoSaiu({ enviado: false, motivo });
    assert.ok(texto && texto.length > 5, motivo);
  }
});

test('M1: o aviso do e-mail que não saiu fica aberto até a marca do mesmo e-mail aparecer depois dele', () => {
  const aviso = avisoDoEmailDoReembolsoQueNaoSaiu('re_1', 'o Resend não respondeu', 'confirmado');
  assert.match(aviso, /^Aviso: /);
  assert.equal(avisoAberto(h(aviso), 0), true, 'aberto, destacado no painel');
  assert.equal(avisoAberto(h(aviso, marcaDoEmailDoReembolso('confirmado', 're_1')), 0), false, 'o envio seguinte saiu: fecha');
  assert.equal(avisoAberto(h(aviso, marcaDoEmailDoReembolso('confirmado', 're_2')), 0), true, 'a marca de outro reembolso não fecha');
  assert.equal(avisoAberto(h(marcaDoEmailDoReembolso('a-caminho', 're_1'), aviso), 1), true, 'a marca de antes não fecha');
  // a Stripe que não respondeu na hora de conferir (sem versão) fecha com qualquer versão do mesmo reembolso
  const semVersao = avisoDoEmailDoReembolsoQueNaoSaiu('re_1', 'a Stripe não respondeu na hora de conferir o reembolso');
  assert.equal(avisoAberto(h(semVersao, marcaDoEmailDoReembolso('a-caminho', 're_1')), 0), false);
  const cancelamento = avisoDoEmailDoCancelamentoQueNaoSaiu('a cota de e-mails acabou');
  assert.equal(avisoAberto(h(cancelamento), 0), true);
  assert.equal(avisoAberto(h(cancelamento, MARCA_DO_EMAIL_DO_CANCELAMENTO), 0), false);
  const pago = avisoDoAvisoDoPedidoPagoQueNaoSaiu('o Resend recusou');
  assert.equal(avisoAberto(h(pago), 0), true);
  assert.equal(avisoAberto(h(pago, MARCA_DO_AVISO_DO_PEDIDO_PAGO), 0), false);
  // os avisos novos não mexem nas outras regras: o reembolso no histórico, o reembolso falho e o e-mail do pagamento
  for (const linha of [aviso, semVersao, cancelamento, pago]) {
    assert.equal(reembolsoNoHistorico(h(linha), 're_1'), false, 'não cita "(re_…)"');
    assert.equal(reembolsosFalhos(h(linha)).length, 0, 'não é um reembolso falho');
    assert.ok(!linha.startsWith(PREFIXO_DOS_AVISOS_DO_EMAIL_PAGO), 'não segura o agendamento do e-mail do pagamento');
  }
});

test('M1: o envio grava o aviso quando não sai, também quando a Stripe não responde na releitura', () => {
  const envio = fonte('lib', 'email', 'pedidos.ts');
  const novos = envio.slice(envio.indexOf('export async function enviarEmailDoReembolso'));
  assert.match(novos, /catch \(e\) \{[\s\S]+?avisoDoEmailDoReembolsoQueNaoSaiu\(reembolsoId, 'a Stripe não respondeu/);
  assert.match(novos, /if \(motivo\) await anotar\(r\.codigo, avisoDoEmailDoReembolsoQueNaoSaiu\(re\.id, motivo, plano\.versao\)\);/);
  assert.match(novos, /if \(motivo\) await anotar\(r\.codigo, avisoDoEmailDoCancelamentoQueNaoSaiu\(motivo\)\);/);
  assert.match(novos, /if \(motivo\) await anotar\(r\.codigo, avisoDoAvisoDoPedidoPagoQueNaoSaiu\(motivo\)\);/);
  assert.match(novos, /marcaDoEmailDoReembolso\(versaoParaMarcar\(plano\.versao, resultado\), re\.id\)/);
});

test('B3: a mesma chave já usada marca o "a caminho", para o "concluído" ainda poder sair', () => {
  const repetido = { enviado: false as const, motivo: 'repetido' as const, status: 409 };
  assert.equal(versaoParaMarcar('confirmado', repetido), 'a-caminho');
  assert.equal(versaoParaMarcar('a-caminho', repetido), 'a-caminho');
  assert.equal(versaoParaMarcar('concluido', repetido), 'concluido', 'o concluído tem a chave dele');
  assert.equal(versaoParaMarcar('confirmado', { enviado: true, id: 'x' }), 'confirmado');
  // com a marca do "a caminho" e a linha do concluído, a regra manda o "concluído": nada se perde
  const p = pedido({
    historico: h(marcaDoEmailDoReembolso(versaoParaMarcar('confirmado', repetido), 're_1'), linhaDoReembolsoConcluido('re_1', 15400)),
  });
  const plano = planoDoEmailDoReembolso(p, [voucher('ON-AAAAAA')], reembolso());
  assert.ok(plano.sai);
  assert.equal(plano.versao, 'concluido');
});

test('B5: o reembolso relido já concluído, que o pedido tinha como pendente, ganha a linha do concluído uma vez', () => {
  const pend = [h(linhaDoReembolsoPendente('re_1', 15400))];
  const concluido = { id: 're_1', amount: 15400, status: 'succeeded' };
  assert.equal(linhaDoConcluidoQueFalta(pend, concluido), linhaDoReembolsoConcluido('re_1', 15400));
  assert.equal(linhaDoConcluidoQueFalta(pend, { ...concluido, status: 'pending' }), null, 'ainda pendente');
  assert.equal(linhaDoConcluidoQueFalta([h()], concluido), null, 'nunca ficou pendente');
  const jaTem = [h(linhaDoReembolsoPendente('re_1', 15400), linhaDoReembolsoConcluido('re_1', 15400))];
  assert.equal(linhaDoConcluidoQueFalta(jaTem, concluido), null, 'uma vez');
  // depois da linha, o refund.updated não grava de novo nem agenda outro e-mail
  const re = { id: 're_1', amount: 15400, status: 'succeeded' as const, payment_intent: 'pi_1', metadata: {} };
  assert.equal(efeitoDoReembolsoAtualizado(jaTem, re, 'pi_1').avisar, false);
  // no envio, a linha entra ANTES da regra decidir a versão (senão o "a caminho" já enviado ficaria sem o "concluído")
  const envio = fonte('lib', 'email', 'pedidos.ts');
  const corpo = envio.slice(
    envio.indexOf('export async function enviarEmailDoReembolso'),
    envio.indexOf('export function agendarEmailDoReembolso'),
  );
  assert.ok(corpo.indexOf('linhaDoConcluidoQueFalta') > 0);
  assert.ok(corpo.indexOf('linhaDoConcluidoQueFalta') < corpo.indexOf('planoDoEmailDoReembolso('));
});

test('B4: o aviso à equipe do reembolso que falhou diz quando o cliente já recebeu o e-mail do reembolso', () => {
  const base = {
    codigo: 'ON-7K3P9Q',
    valor: 'R$ 154,00',
    motivo: 'saldo insuficiente',
    contestacao: false,
    naoDizerOMotivo: false,
    linkPainel: 'https://orlanativa.online/admin?q=ON-7K3P9Q',
    site: SITE,
  };
  assert.doesNotMatch(emailAvisoDoReembolsoFalho(base).texto, /já recebeu o e-mail do site/);
  assert.match(emailAvisoDoReembolsoFalho({ ...base, clienteAvisado: true }).texto, /já recebeu o e-mail do site[\s\S]+avise-o/);
  assert.equal(emailDoReembolsoJaSaiu(h(marcaDoEmailDoReembolso('a-caminho', 're_1')), 're_1'), true);
  assert.equal(emailDoReembolsoJaSaiu(h(marcaDoEmailDoReembolso('a-caminho', 're_2')), 're_1'), false);
  assert.match(fonte('lib', 'email', 'pedidos.ts'), /clienteAvisado: emailDoReembolsoJaSaiu\(r\.historico, reembolsoId\)/);
});

test('B2: o prazo do Pix é o da página da Stripe: poucos minutos, sem prazo máximo garantido', () => {
  for (const idioma of IDIOMAS) {
    assert.match(TEXTOS_EMAIL[idioma].reembolso.prazoPix, /garantido|guaranteed|garantizado/, idioma);
    assert.doesNotMatch(TEXTOS_EMAIL[idioma].reembolso.prazoPix, /banco|bank/i, `${idioma}: nada que a Stripe não diga`);
  }
});
