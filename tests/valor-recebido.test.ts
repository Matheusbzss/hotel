import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  linhaDaDevolucaoDeOutroPagamento,
  mesmaDevolucaoDeOutroPagamento,
  mudancaDoReembolso,
  pedidoSemPagamentoProprio,
  planoDoReembolso,
} from '../src/app/api/webhooks/stripe/eventos.ts';
import { dicionario } from '../src/i18n/index.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { calcularEstatisticas } from '../src/lib/estatisticas.ts';
import { frasesDoReembolso } from '../src/lib/frases-do-reembolso.ts';
import { anotarValorRecebido, avisoDeValorDiferente, reativarPedidoRetido } from '../src/lib/pagamento-stripe.ts';
import {
  agruparPedidos,
  botaoReembolsoDoVoucher,
  confirmacaoDoReembolso,
  devolucaoNoPainel,
  linhaDaReativacao,
  naoPagoNoPainel,
  recebidoDoPedido,
  recebidoNaPaginaDoCliente,
  recebidoPelaStripe,
  reembolsoNoPainel,
  valorEsperadoDoPedido,
  valorRecebido,
} from '../src/lib/pedidos-painel.ts';
import type { Reserva, ReservaPasseio } from '../src/lib/reservas.ts';
import { opcoesDoReembolso } from '../src/lib/resumo-do-painel.ts';

/**
 * Pacote 23 (retestes de dinheiro de 23/11): o valor que a Stripe recebeu de verdade. Quando ela recebeu um valor diferente
 * do que o pedido esperava (só com uma sessão criada fora do site: ON-HHPGZR e ON-6EJT3U receberam R$ 100,00 por
 * R$ 154,00; ON-R4MM9Q, R$ 386,00 por R$ 396,00, e foi reativado), o histórico ganhava o aviso, mas o painel, a rota, as
 * estatísticas e a página do cliente seguiam com o valor esperado: "Reembolsar tudo (R$ 154,00)", "Confirmo: devolver
 * R$ 154,00", o faturamento com R$ 154,00 e, depois do reembolso, a página do cliente com "Reembolsado R$ 154,00" e
 * "Reembolso parcial de R$ 100,00". E a palavra "repetido" na devolução de um pagamento de um pedido cancelado.
 */

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
const fonte = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
    .join('\n');
const historico = (...eventos: string[]) =>
  eventos.map((evento, n) => ({ em: `2026-11-23T10:39:${String(n).padStart(2, '0')}.000Z`, evento }));

/** Um voucher de exemplo, de um pedido de cartão pago pela Stripe (nenhum é de cliente). */
function pago(parcial: Partial<ReservaPasseio> = {}): ReservaPasseio {
  return {
    codigo: 'ON-VAL234',
    token: 'token-de-teste',
    criadaEm: '2026-11-23T10:30:00.000Z',
    atualizadaEm: '2026-11-23T10:39:03.000Z',
    idioma: 'pt',
    status: 'pago',
    provedor: 'stripe',
    pagamentoExternoId: 'cs_test_fora',
    paymentIntentId: 'pi_do_pedido',
    tipo: 'passeio',
    data: '2026-12-20',
    horario: { hora: '09:00', busca: false },
    totalCentavos: 15400,
    totalPixCentavos: 13860,
    cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+55 21 90000-0000' },
    pagamento: { metodo: 'cartao', cartaoBandeira: 'visa', cartaoFinal: '4242', pagoEm: '2026-11-23T10:39:01.000Z' },
    historico: historico('Reserva criada', 'Pago (webhook da Stripe)'),
    passeio: { slug: 'escuna-buzios', nome: 'Escuna', cidade: 'Búzios', unidade: 'pessoa' },
    adultos: 2,
    criancas: 0,
    unidades: 2,
    hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
    ...parcial,
  };
}

/** O ON-HHPGZR como ficou gravado ANTES do Pacote 23: só a linha do aviso diz o que entrou. */
const comAvisoNoHistorico = (parcial: Partial<ReservaPasseio> = {}) =>
  pago({ historico: historico('Reserva criada', 'Pago (webhook da Stripe)', avisoDeValorDiferente(10000, 15400)), ...parcial });

/** Um pedido de dois vouchers (R$ 154,00 + R$ 242,00 = R$ 396,00 no cartão), como o ON-R4MM9Q. */
function doisVouchers(pagamento: Reserva['pagamento'], parcial: Partial<ReservaPasseio> = {}): ReservaPasseio[] {
  const pedido = { codigo: 'ON-PED234', totalCentavos: 39600, totalPixCentavos: 35640 };
  return [
    pago({ codigo: 'ON-UMA234', pedido, totalCentavos: 15400, totalPixCentavos: 13860, pagamento, ...parcial }),
    pago({ codigo: 'ON-DUA234', pedido, totalCentavos: 24200, totalPixCentavos: 21780, data: '2026-12-21', pagamento, ...parcial }),
  ];
}

const NOVEMBRO = { chave: 'outro', periodo: { de: '2026-11-20', ate: '2026-11-26' } };

/* ------------------------------------------------------------------ */
/* Com o valor igual ao esperado, nada muda                              */

test('com o valor recebido igual ao esperado, nada muda: o painel, a rota, as estatísticas e as páginas fazem a conta de sempre', () => {
  const casos: { nome: string; itens: Reserva[]; esperado: number }[] = [
    { nome: 'cartão, um item', itens: [pago()], esperado: 15400 },
    { nome: 'Pix, um item', itens: [pago({ pagamento: { metodo: 'pix', pagoEm: '2026-11-23T10:39:01.000Z' } })], esperado: 13860 },
    { nome: 'cartão, dois itens', itens: doisVouchers({ metodo: 'cartao', pagoEm: '2026-11-23T10:39:01.000Z' }), esperado: 39600 },
    // o valor gravado igual ao esperado (uma leitura antiga) não muda nada
    { nome: 'gravado igual', itens: [pago({ pagamento: { metodo: 'cartao', recebidoCentavos: 15400 } })], esperado: 15400 },
    // o pagamento parado reativado com o valor exato (ON-QVYCRL da conferência)
    {
      nome: 'reativado com o valor exato',
      itens: doisVouchers({
        metodo: 'cartao',
        pagoEm: '2026-11-23T17:17:42.000Z',
        retido: {
          paymentIntentId: 'pi_do_pedido',
          sessaoId: 'cs_test_fora',
          valorCentavos: 39600,
          pagoEm: '2026-11-23T17:17:42.000Z',
          decisao: { acao: 'reativar', em: '2026-11-23T17:20:00.000Z' },
        },
      }),
      esperado: 39600,
    },
  ];
  for (const { nome, itens, esperado } of casos) {
    const soma = itens.reduce((s, i) => s + valorRecebido(i), 0);
    assert.equal(soma, esperado, nome);
    assert.equal(recebidoPelaStripe(itens[0]), undefined, nome);
    assert.equal(recebidoNaPaginaDoCliente(itens[0]), undefined, nome);
    assert.equal(recebidoDoPedido(itens), soma, nome);
    const [p] = agruparPedidos(itens);
    assert.equal(p.recebidoCentavos, soma, nome);
    const m = reembolsoNoPainel(p);
    assert.equal(m.tipo, 'stripe', nome);
    if (m.tipo === 'stripe') assert.equal(m.restanteCentavos, soma, nome);
    assert.equal(calcularEstatisticas(itens, [], NOVEMBRO).resumo.centavos, soma, nome);
  }
  // a gravação também não muda nada com o valor igual: nenhum campo, nenhum aviso
  const igual = pago();
  assert.equal(anotarValorRecebido(igual, 15400), undefined);
  assert.equal('recebidoCentavos' in igual.pagamento, false);
  // sem o valor na leitura, nada muda
  assert.equal(anotarValorRecebido(igual, undefined), undefined);
  assert.equal('recebidoCentavos' in igual.pagamento, false);
});

/* ------------------------------------------------------------------ */
/* O valor diferente: gravado e lido                                     */

test('o valor diferente fica gravado no pedido junto com o aviso (aplicarSessao e a reativação); o igual sai', () => {
  const r = pago();
  assert.equal(anotarValorRecebido(r, 10000), avisoDeValorDiferente(10000, 15400));
  assert.equal(r.pagamento.recebidoCentavos, 10000);
  // no pedido de vários itens, a conta é a do pedido inteiro (no Pix, com o desconto)
  const [pix] = doisVouchers({ metodo: 'pix' });
  assert.equal(valorEsperadoDoPedido(pix), 35640);
  assert.equal(anotarValorRecebido(pix, 35640), undefined);
  assert.equal(anotarValorRecebido(pix, 30000), avisoDeValorDiferente(30000, 35640));
  assert.equal(pix.pagamento.recebidoCentavos, 30000);
  // uma leitura igual depois tira o valor velho
  assert.equal(anotarValorRecebido(pix, 35640), undefined);
  assert.equal('recebidoCentavos' in pix.pagamento, false);
  // aplicarSessao grava pela mesma função, na transição para pago; a reativação também
  const aplicar = fonte('lib', 'pagamento-stripe.ts');
  const porta = aplicar.slice(aplicar.indexOf('export async function aplicarSessao('));
  assert.match(
    porta,
    /registrar\(r, `Pago \(\$\{quem\}\)`\);\s+const aviso = anotarValorRecebido\(r, leitura\.valorCentavos\);\s+if \(aviso\) registrar\(r, aviso\);/,
  );
  // o ON-R4MM9Q: R$ 386,00 parados por R$ 396,00, reativado
  const [primeiro] = doisVouchers(
    {
      metodo: 'cartao',
      retido: {
        paymentIntentId: 'pi_parado',
        sessaoId: 'cs_test_fora',
        valorCentavos: 38600,
        forma: 'cartao',
        pagoEm: '2026-11-23T16:59:57.000Z',
      },
    },
    { status: 'cancelado' },
  );
  const linhas = reativarPedidoRetido(primeiro, [], new Date('2026-11-23T17:00:00Z'), linhaDaReativacao);
  assert.deepEqual(linhas, [linhaDaReativacao('pi_parado', 38600), avisoDeValorDiferente(38600, 39600)]);
  assert.equal(primeiro.pagamento.recebidoCentavos, 38600);
});

test('o que entrou: o gravado, o pagamento parado ou, nos pedidos de antes, a linha do aviso; o pedido custa o mesmo', () => {
  // gravado (Pacote 23)
  assert.equal(recebidoPelaStripe(pago({ pagamento: { metodo: 'cartao', recebidoCentavos: 10000 } })), 10000);
  // os pedidos pagos antes do Pacote 23 (ON-HHPGZR, ON-6EJT3U): da linha do aviso
  const antigo = comAvisoNoHistorico();
  assert.equal(recebidoPelaStripe(antigo), 10000);
  assert.equal(recebidoDoPedido([antigo]), 10000);
  // o reativado antes do Pacote 23 (ON-R4MM9Q): o pagamento parado diz o que entrou
  const reativado = doisVouchers({
    metodo: 'cartao',
    retido: {
      paymentIntentId: 'pi_parado',
      sessaoId: 'cs_test_fora',
      valorCentavos: 38600,
      pagoEm: '2026-11-23T16:59:57.000Z',
      decisao: { acao: 'reativar', em: '2026-11-23T17:00:00.000Z' },
    },
  });
  assert.equal(recebidoDoPedido(reativado), 38600);
  const [p] = agruparPedidos(reativado);
  assert.equal(p.recebidoCentavos, 38600);
  // o que o pedido custa continua o mesmo (o painel e a página dizem o preço onde descrevem o pedido)
  assert.equal(p.totalCentavos, 39600);
  assert.deepEqual(
    p.itens.map((i) => valorRecebido(i)),
    [15400, 24200],
  );
});

/* ------------------------------------------------------------------ */
/* O painel e a rota                                                     */

test('o painel: o valor pago, "Reembolsar tudo" e a caixa "Confirmo" dizem o que a Stripe recebeu (R2, ON-6EJT3U)', () => {
  const [p] = agruparPedidos([comAvisoNoHistorico()]);
  assert.equal(p.recebidoCentavos, 10000);
  const m = reembolsoNoPainel(p);
  assert.equal(m.tipo, 'stripe');
  if (m.tipo !== 'stripe') return;
  assert.equal(m.restanteCentavos, 10000);
  // antes: "Reembolsar tudo (R$ 154,00)" e "Confirmo: devolver R$ 154,00 ao cliente. Não dá para desfazer."
  assert.equal(confirmacaoDoReembolso(m.restanteCentavos), `Confirmo: devolver ${cifra(10000)} ao cliente. Não dá para desfazer.`);
  // desde o Pacote 33, o botão e a caixa ficam na tela de resumo (src/lib/resumo-do-painel.ts), com o mesmo número
  const [tudo] = opcoesDoReembolso(p);
  assert.equal(tudo.botao, `Reembolsar tudo (${cifra(10000)})`);
  assert.equal(tudo.confirmacao, confirmacaoDoReembolso(m.restanteCentavos));
  assert.equal(tudo.centavos, 10000);
  const resumo = fonte('lib', 'resumo-do-painel.ts');
  assert.match(
    resumo,
    /botao: `Reembolsar tudo \(\$\{cifra\(m\.restanteCentavos\)\}\)`,\s+confirmacao: confirmacaoDoReembolso\(m\.restanteCentavos\),/,
  );
  const pagina = fonte('app', 'admin', 'page.tsx');
  assert.match(pagina, /\{formatarPreco\(p\.recebidoCentavos\)\}/);
  // depois do reembolso total (a Stripe devolveu R$ 100,00): o cartão diz R$ 100,00 e "Reembolsado R$ 100,00", nada a mais
  const [depois] = agruparPedidos([comAvisoNoHistorico({ status: 'reembolsado', reembolsoCentavos: 10000 })]);
  assert.equal(depois.recebidoCentavos, 10000);
  assert.deepEqual(devolucaoNoPainel(depois), { reembolsado: `Reembolsado ${cifra(10000)}` });
  assert.equal(reembolsoNoPainel(depois).tipo, 'nenhum');
});

test('o painel e a rota: o limite de "Reembolsar só o voucher" e o resto contam com o que entrou (ON-R4MM9Q, R$ 386,00 por R$ 396,00)', () => {
  const retido = {
    paymentIntentId: 'pi_parado',
    sessaoId: 'cs_test_fora',
    valorCentavos: 38600,
    pagoEm: '2026-11-23T16:59:57.000Z',
    decisao: { acao: 'reativar' as const, em: '2026-11-23T17:00:00.000Z' },
  };
  // o primeiro voucher já devolvido sozinho (R$ 154,00): sobram R$ 232,00 dos R$ 386,00, e o de R$ 242,00 não cabe
  const itens = doisVouchers({ metodo: 'cartao', retido }, { reembolsoCentavos: 15400 });
  itens[0].statusItem = 'reembolsado';
  const [p] = agruparPedidos(itens);
  const m = reembolsoNoPainel(p);
  assert.equal(m.tipo, 'stripe');
  if (m.tipo !== 'stripe') return;
  assert.equal(m.restanteCentavos, 23200);
  // antes: R$ 396,00 - R$ 154,00 = R$ 242,00, e o botão oferecia devolver R$ 242,00, mais do que restava na Stripe
  assert.equal(botaoReembolsoDoVoucher('ON-DUA234', valorRecebido(itens[1]), m.restanteCentavos), null);
  // sem o reembolso, os dois cabem
  const [inteiro] = agruparPedidos(doisVouchers({ metodo: 'cartao', retido }));
  const n = reembolsoNoPainel(inteiro);
  assert.equal(n.tipo === 'stripe' && n.restanteCentavos, 38600);
  // a rota faz a mesma conta (o resto do "Reembolsar só o voucher" e o do voucher devolvido por outro meio)
  const rota = fonte('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  assert.match(rota, /const restante = recebidoDoPedido\(vouchers\) - \(alvo\.reembolsoCentavos \?\? 0\);/);
  assert.match(rota, /const recebido = recebidoDoPedido\(vouchers\);/);
  assert.doesNotMatch(rota, /valorRecebido/);
});

test('o pagamento parado devolvido: o cartão do pedido cancelado diz o que entrou e o que voltou, o mesmo número', () => {
  const [p] = agruparPedidos(
    doisVouchers(
      {
        metodo: 'cartao',
        retido: {
          paymentIntentId: 'pi_parado',
          sessaoId: 'cs_test_fora',
          valorCentavos: 38600,
          pagoEm: '2026-11-23T16:59:57.000Z',
          decisao: { acao: 'devolver', em: '2026-11-23T17:00:00.000Z', reembolsoId: 're_1' },
        },
      },
      { status: 'cancelado', reembolsoCentavos: 38600 },
    ),
  );
  assert.equal(p.recebidoCentavos, 38600);
  assert.deepEqual(devolucaoNoPainel(p), { reembolsado: `Reembolsado ${cifra(38600)}` });
});

/* ------------------------------------------------------------------ */
/* As estatísticas                                                       */

test('as estatísticas: "Faturamento (menos reembolsos)" soma o que a Stripe recebeu', () => {
  const e = calcularEstatisticas([comAvisoNoHistorico()], [], NOVEMBRO);
  assert.equal(e.resumo.pedidos, 1);
  // antes: R$ 154,00
  assert.equal(e.resumo.centavos, 10000);
  // com uma parte devolvida, o líquido é o que entrou menos o que voltou
  assert.equal(calcularEstatisticas([comAvisoNoHistorico({ reembolsoCentavos: 3000 })], [], NOVEMBRO).resumo.centavos, 7000);
  // o "Vendido" da página de pedidos faz a mesma conta (p.recebidoCentavos)
  assert.match(
    fonte('app', 'admin', 'page.tsx'),
    /const receita = pagos\.reduce\(\(s, p\) => s \+ p\.recebidoCentavos - p\.reembolsoCentavos, 0\);/,
  );
});

/* ------------------------------------------------------------------ */
/* As páginas do cliente                                                 */

test('as páginas do cliente: "Pago R$ …", "Reembolsado R$ …" e a frase do reembolso contam com o mesmo número', () => {
  const T = dicionario('pt').pedido;
  const textos = {
    reembolsadoTexto: T.reembolsadoTexto,
    reembolsadoParcial: T.reembolsadoParcial,
    reembolsoFalhou: T.reembolsoFalhou,
    reembolsoOutroMeio: T.reembolsoOutroMeio,
  };
  // a conta da página da reserva (StatusReserva): o reembolso é parcial quando é menor que o total da faixa
  const naPagina = (r: Reserva) => {
    const total = recebidoNaPaginaDoCliente(r) ?? valorRecebido(r);
    const reembolso = r.reembolsoCentavos ?? 0;
    const parcial = reembolso > 0 && reembolso < total;
    const partes = { originalCentavos: reembolso, pendenteCentavos: 0, outroMeioCentavos: 0 };
    return { total, frases: frasesDoReembolso(partes, !parcial, textos, cifra) };
  };
  // o ON-6EJT3U depois de "Reembolsar tudo": antes, "Reembolsado R$ 154,00" e "Reembolso parcial de R$ 100,00"
  const reembolsado = naPagina(comAvisoNoHistorico({ status: 'reembolsado', reembolsoCentavos: 10000 }));
  assert.equal(reembolsado.total, 10000);
  assert.deepEqual(reembolsado.frases, [T.reembolsadoTexto]);
  // pago, com R$ 30,00 devolvidos: "Pago R$ 100,00" e a frase do parcial de R$ 30,00
  const parcial = naPagina(comAvisoNoHistorico({ reembolsoCentavos: 3000 }));
  assert.equal(parcial.total, 10000);
  assert.ok(parcial.frases[0].includes(cifra(3000)));
  // o valor igual: a conta de sempre
  assert.equal(naPagina(pago({ status: 'reembolsado', reembolsoCentavos: 15400 })).total, 15400);
  // o pedido cancelado nunca mostra o valor do pagamento parado (Pacote 22): fica o que ele custa
  const parado = pago({
    status: 'cancelado',
    pagamento: {
      metodo: 'cartao',
      retido: { paymentIntentId: 'pi_parado', sessaoId: 'cs', valorCentavos: 38600, pagoEm: '2026-11-23T16:59:57.000Z' },
    },
  });
  assert.equal(recebidoPelaStripe(parado), 38600);
  assert.equal(recebidoNaPaginaDoCliente(parado), undefined);
  // as duas páginas usam a mesma regra: a da reserva (paraPublico, no pedido de um item) e a do pedido (a faixa do total)
  assert.match(
    fonte('lib', 'reserva-publica.ts'),
    /totalCentavos: emAberto \? r\.totalCentavos : \(\(r\.pedido \? undefined : recebidoNaPaginaDoCliente\(r\)\) \?\? valorRecebido\(r\)\),/,
  );
  assert.match(
    fonte('app', '[locale]', 'pedido', '[codigo]', 'page.tsx'),
    /const fechado = recebidoNaPaginaDoCliente\(primeira\) \?\? \(primeira\.pagamento\.metodo === 'pix' \? noPix : pedido\.totalCentavos\);/,
  );
  // e o e-mail do pagamento aprovado diz o que entrou
  assert.match(fonte('lib', 'email', 'pedidos.ts'), /const recebido = recebidoDoPedido\(lista\);/);
});

/* ------------------------------------------------------------------ */
/* "Repetido" só no pedido que já tem outro pagamento                    */

const COBRANCA = { id: 'ch_1', amount: 13860, amount_refunded: 13860, refunded: true, payment_intent: 'pi_novo' };

test('a devolução de outro pagamento: "de um pedido cancelado" no cancelado, "repetido" no pago (R3)', () => {
  const noCancelado = planoDoReembolso(COBRANCA, [], ['ON-VAL234'], 'pi_do_pedido', 0, 'cancelado');
  assert.equal(noCancelado.doPedido, false);
  assert.equal(noCancelado.evento, `Pagamento de um pedido cancelado (pi_novo) devolvido ao cliente pela Stripe: ${cifra(13860)}`);
  for (const status of ['pago', 'contestado', 'reembolsado', undefined] as const) {
    assert.equal(
      planoDoReembolso(COBRANCA, [], ['ON-VAL234'], 'pi_do_pedido', 0, status).evento,
      `Pagamento repetido (pi_novo) devolvido ao cliente pela Stripe: ${cifra(13860)}`,
      String(status),
    );
  }
  assert.equal(
    linhaDaDevolucaoDeOutroPagamento('pi_x', 100, 'cancelado'),
    `Pagamento de um pedido cancelado (pi_x) devolvido ao cliente pela Stripe: ${cifra(100)}`,
  );
  // o webhook passa o status do pedido
  assert.match(
    fonte('app', 'api', 'webhooks', 'stripe', 'route.ts'),
    /planoDoReembolso\(\s+atual,\s+reembolsos\.data,\s+vouchers\.map\(\(v\) => v\.codigo\),\s+alvo\.paymentIntentId,\s+alvo\.reembolsoCentavos \?\? 0,\s+alvo\.status,\s+pedidoSemPagamentoProprio\(alvo\),\s+\)/,
  );
});

test('o pedido do WhatsApp cancelado e nunca pago: a devolução da sessão paga é "de um pedido cancelado" e o pedido não ganha reembolso (V4, Pacote 25)', () => {
  // o ON-NF9PHD do reteste: aplicarSessao gravou o pi_ da sessão paga no pedido, que continuou cancelado, e o webhook
  // devolveu o dinheiro sozinho (um reembolso só, com a referência da devolução)
  const whatsapp = pago({
    status: 'cancelado',
    provedor: 'whatsapp',
    pagamentoExternoId: undefined,
    paymentIntentId: 'pi_novo',
    pagamento: { metodo: 'whatsapp' },
    historico: historico(
      'Reserva criada',
      'Cancelado no admin',
      `Devolução de ${cifra(13860)} do pagamento pi_novo (pedido cancelado) pedida à Stripe (re_1)`,
    ),
  });
  assert.equal(pedidoSemPagamentoProprio(whatsapp), true);
  const plano = planoDoReembolso(
    COBRANCA,
    [{ id: 're_1', amount: 13860, status: 'succeeded', metadata: { referencia: 'pagamento-repetido' } }],
    ['ON-VAL234'],
    whatsapp.paymentIntentId,
    0,
    whatsapp.status,
    pedidoSemPagamentoProprio(whatsapp),
  );
  assert.equal(plano.doPedido, false);
  assert.equal(plano.total, false);
  assert.equal(plano.evento, `Pagamento de um pedido cancelado (pi_novo) devolvido ao cliente pela Stripe: ${cifra(13860)}`);
  // sem a regra nova, era o reembolso do pedido (o que o reteste viu)
  assert.equal(
    planoDoReembolso(COBRANCA, [], ['ON-VAL234'], 'pi_novo', 0, 'cancelado').evento,
    `Reembolso total (${cifra(13860)}) confirmado pela Stripe`,
  );
  // o pedido guarda só a linha: nem valor devolvido nem status novo
  const mudanca = mudancaDoReembolso(whatsapp, plano);
  assert.deepEqual(mudanca, { evento: plano.evento });
  const depois = { ...whatsapp, historico: [...whatsapp.historico, { em: '2026-11-23T10:40:00.000Z', evento: plano.evento ?? '' }] };
  // o mesmo aviso de novo não repete a linha
  assert.equal(mudancaDoReembolso(depois, plano), null);
  // o cartão do painel continua "não pago", sem "Reembolsado R$ …", e as estatísticas não contam nada
  const [cartao] = agruparPedidos([depois]);
  assert.equal(cartao.reembolsoCentavos, 0);
  assert.equal(naoPagoNoPainel(cartao), true);
  assert.deepEqual(devolucaoNoPainel(cartao), {});
  assert.equal(reembolsoNoPainel(cartao).tipo, 'nenhum');
  const { resumo } = calcularEstatisticas([depois], [], NOVEMBRO);
  assert.equal(resumo.centavos, 0);
  assert.equal(resumo.pedidos, 0);
});

test('só o pedido cancelado e nunca pago, sem pagamento parado, fica sem pagamento próprio', () => {
  const cancelado = (parcial: Partial<ReservaPasseio>) =>
    pago({
      status: 'cancelado',
      pagamento: { metodo: 'whatsapp' },
      historico: historico('Reserva criada', 'Cancelado no admin'),
      ...parcial,
    });
  assert.equal(pedidoSemPagamentoProprio(cancelado({})), true);
  // o da Stripe cancelado e nunca pago, sem o parado (a leitura sem o valor cobrado não para o pagamento): também
  assert.equal(pedidoSemPagamentoProprio(cancelado({ provedor: 'stripe', pagamento: { metodo: 'pix' } })), true);
  // o pagamento parado é o pagamento do pedido (Pacote 22): a devolução dele conta no pedido, como antes
  const retido = {
    paymentIntentId: 'pi_parado',
    sessaoId: 'cs_parado',
    valorCentavos: 15400,
    pagoEm: '2026-11-23T10:39:01.000Z',
    decisao: { acao: 'devolver' as const, em: '2026-11-23T10:45:00.000Z', reembolsoId: 're_parado' },
  };
  assert.equal(pedidoSemPagamentoProprio(cancelado({ provedor: 'stripe', pagamento: { metodo: 'cartao', retido } })), false);
  // o pedido pago, mesmo cancelado depois, e os outros status ficam com as regras de sempre
  assert.equal(pedidoSemPagamentoProprio(cancelado({ pagamento: { metodo: 'whatsapp', pagoEm: '2026-11-23T10:39:01.000Z' } })), false);
  assert.equal(
    pedidoSemPagamentoProprio(cancelado({ historico: historico('Reserva criada', 'Marcada como paga (Pix)', 'Cancelado no admin') })),
    false,
  );
  for (const status of ['pago', 'reembolsado', 'contestado', 'pendente', 'expirado', 'aguardando_whatsapp'] as const) {
    assert.equal(pedidoSemPagamentoProprio(cancelado({ status, pagamento: { metodo: 'whatsapp' } })), false, status);
  }
});

test('a mesma devolução, com qualquer um dos dois começos, entra uma vez só', () => {
  const plano = planoDoReembolso(COBRANCA, [], ['ON-VAL234'], 'pi_do_pedido', 0, 'cancelado');
  const repetido = `Pagamento repetido (pi_novo) devolvido ao cliente pela Stripe: ${cifra(13860)}`;
  const cancelado = plano.evento ?? '';
  assert.equal(mesmaDevolucaoDeOutroPagamento(repetido, cancelado), true);
  assert.equal(mesmaDevolucaoDeOutroPagamento(cancelado, cancelado), true);
  // outro pagamento ou outro valor não é a mesma devolução
  assert.equal(mesmaDevolucaoDeOutroPagamento(repetido.replace('pi_novo', 'pi_outro'), cancelado), false);
  assert.equal(mesmaDevolucaoDeOutroPagamento(repetido.replace(cifra(13860), cifra(100)), cancelado), false);
  assert.equal(mesmaDevolucaoDeOutroPagamento('Reembolso total (R$ 138,60) confirmado pela Stripe', cancelado), false);
  const pedido = (...eventos: string[]) => ({
    status: 'cancelado' as const,
    historico: historico(...eventos),
    reembolsoCentavos: undefined,
  });
  // a primeira vez entra; a linha antiga (escrita antes do Pacote 23) ou a nova já no histórico: nada novo
  assert.deepEqual(mudancaDoReembolso(pedido('Cancelado no admin'), plano), { evento: cancelado });
  assert.equal(mudancaDoReembolso(pedido('Cancelado no admin', repetido), plano), null);
  assert.equal(mudancaDoReembolso(pedido('Cancelado no admin', cancelado), plano), null);
  // e a do pedido pago também não repete a do cancelado
  const noPago = planoDoReembolso(COBRANCA, [], ['ON-VAL234'], 'pi_do_pedido', 0, 'pago');
  assert.equal(mudancaDoReembolso({ ...pedido(cancelado), status: 'pago' }, noPago), null);
  // nada lê a linha para somar dinheiro: o pedido não ganha valor devolvido por ela
  assert.equal('reembolsoCentavos' in (mudancaDoReembolso(pedido(), plano) ?? {}), false);
});
