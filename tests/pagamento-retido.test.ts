import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pagamentoParaDevolver } from '../src/app/api/webhooks/stripe/eventos.ts';
import { dicionario } from '../src/i18n/index.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { emailEssencial } from '../src/lib/email/cota.ts';
import { MARCA_DO_AVISO_DO_PAGAMENTO_RETIDO, marcaDoAvisoDoPagamentoRetido } from '../src/lib/email/marcas.ts';
import { emailAvisoDoPagamentoRetido } from '../src/lib/email/mensagens.ts';
import { calcularEstatisticas } from '../src/lib/estatisticas.ts';
import {
  AVISO_PAGO_DEPOIS_DO_HORARIO,
  avisoDeValorDiferente,
  pagamentoAMais,
  pagamentoParaReter,
  reativarPedidoRetido,
  reterPagamento,
  type LeituraSessao,
} from '../src/lib/pagamento-stripe.ts';
import {
  ACOES_DO_PAGAMENTO_RETIDO,
  BOTAO_REATIVAR_RETIDO,
  ERROS_DO_PAINEL,
  acaoDoRetidoOferecida,
  acaoDoRetidoRepetida,
  agruparPedidos,
  avisoAberto,
  avisoDoPagamentoRetido,
  avisoDoPagamentoRetidoPorEmail,
  avisoDosPagamentosRetidos,
  botaoDevolverRetido,
  concluirDevolucaoDoRetido,
  contarPagamentosRetidos,
  desfazerDevolucaoDoRetido,
  devolucaoNoPainel,
  fraseDoPagamentoRetido,
  inicioDaDecisaoDoRetido,
  linhaDaDevolucaoDoRetido,
  linhaDaReativacao,
  marcarDevolucaoDoRetido,
  pagamentoRetidoADecidir,
  reembolsoNoPainel,
} from '../src/lib/pedidos-painel.ts';
import { linhaDoReembolsoFalho } from '../src/lib/reembolsos-a-resolver.ts';
import type { Reserva, ReservaPasseio, StatusReserva } from '../src/lib/reservas.ts';

/**
 * Pacote 22 (decisão do dono de 23/11/2026): o pagamento que chega para um pedido que a equipe já cancelou não volta
 * sozinho. O dinheiro fica parado na Stripe e a equipe decide no painel se devolve ou reativa o pedido. No quinto reteste
 * (cenário R3, ON-2HVKLP e ON-779JQJ) o site devolvia sozinho: "Pagamento na Stripe de um pedido cancelado (pi_…):
 * devolver ao cliente", e a Stripe fazia o reembolso.
 */

const fonte = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

/** O corpo de uma função de um arquivo já lido, até a próxima função do mesmo nível. */
function corpoDe(codigoDoArquivo: string, inicio: string, fim = '\nexport '): string {
  const de = codigoDoArquivo.indexOf(inicio);
  assert.notEqual(de, -1, inicio);
  const ate = codigoDoArquivo.indexOf(fim, de + 1);
  return codigoDoArquivo.slice(de, ate === -1 ? undefined : ate);
}

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
const historico = (...eventos: string[]) =>
  eventos.map((evento, n) => ({ em: `2026-11-23T10:30:${String(n).padStart(2, '0')}.000Z`, evento }));

/** Um voucher de exemplo, de um pedido de Pix pela Stripe que a equipe cancelou antes de alguém pagar (nenhum é de cliente). */
function cancelado(parcial: Partial<ReservaPasseio> = {}): ReservaPasseio {
  return {
    codigo: 'ON-RET234',
    token: 'token-de-teste',
    criadaEm: '2026-11-23T10:30:00.000Z',
    atualizadaEm: '2026-11-23T10:32:00.000Z',
    idioma: 'pt',
    status: 'cancelado',
    provedor: 'stripe',
    pagamentoExternoId: 'cs_test_do_pedido',
    // o pagamento do QR que o cancelamento matou (a Stripe o cancelou junto com a sessão)
    paymentIntentId: 'pi_do_qr',
    tipo: 'passeio',
    data: '2026-12-20',
    horario: { hora: '09:00', busca: false },
    totalCentavos: 15400,
    totalPixCentavos: 13860,
    cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+55 21 90000-0000' },
    pagamento: { metodo: 'pix' },
    historico: historico('Reserva criada', 'Sessão de pagamento criada: Pix (cs_test_do_pedido)', 'Cancelado no admin'),
    passeio: { slug: 'escuna-buzios', nome: 'Escuna', cidade: 'Búzios', unidade: 'pessoa' },
    adultos: 2,
    criancas: 0,
    unidades: 2,
    hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
    ...parcial,
  };
}

/** A sessão paga relida na Stripe: a de fora do site, criada com as marcas do site (como no quinto reteste). */
const PAGA: LeituraSessao = {
  status: 'pago',
  sessaoId: 'cs_test_fora',
  paymentIntentId: 'pi_parado',
  forma: 'pix',
  valorCentavos: 13860,
  pagoEm: '2026-11-23T10:37:49.000Z',
  clientePais: 'BR',
};

const registrar = (r: Reserva, evento: string): Reserva => {
  r.historico = [...r.historico, { em: '2026-11-23T10:38:00.000Z', evento }];
  return r;
};

/**
 * A porta (aplicarSessao, src/lib/pagamento-stripe.ts) até a escolha do caminho, como ela roda dentro da trava: primeiro o
 * pagamento parado, depois o pagamento a mais. Devolve o que gravaria (null: nada) e o que a rota do webhook faria depois
 * com o dinheiro (pagamentoParaDevolver, com o pedido antes e depois). A ordem é conferida no código logo abaixo.
 */
function porta(antes: Reserva, leitura: LeituraSessao, origem: 'webhook' | 'consulta') {
  const r = structuredClone(antes);
  const retencao = pagamentoParaReter(r, leitura);
  let gravado: Reserva | null;
  let retido: string | undefined;
  let repetido: string | undefined;
  if (retencao) {
    retido = leitura.paymentIntentId;
    gravado =
      retencao === 'ja-retido'
        ? origem === 'consulta'
          ? r
          : null
        : registrar(r, reterPagamento(r, leitura, leitura.sessaoId, '2026-11-23T10:37:52.000Z'));
  } else {
    repetido = pagamentoAMais(r, leitura);
    gravado = repetido ? registrar(r, `nota (${repetido}): devolver ao cliente`) : null;
  }
  const depois = gravado ?? antes;
  // a rota do webhook: o parado não volta; o a mais, ou o que pagamentoParaDevolver achar, volta
  const devolver = retido ? null : (repetido ?? pagamentoParaDevolver(antes, depois, leitura));
  return { gravado, depois, retido, devolver };
}

test('a porta: o pagamento que chega para o pedido cancelado e nunca pago fica parado, com uma linha, sem devolução', () => {
  const antes = cancelado();
  const { gravado, depois, retido, devolver } = porta(antes, PAGA, 'webhook');
  assert.ok(gravado);
  assert.equal(retido, 'pi_parado');
  // nada é pedido à Stripe
  assert.equal(devolver, null);
  // o pedido continua cancelado (os vouchers com ele), com o pagamento parado gravado no JSON do pagamento
  assert.equal(depois.status, 'cancelado');
  assert.equal(depois.statusItem, undefined);
  assert.deepEqual(depois.pagamento.retido, {
    paymentIntentId: 'pi_parado',
    sessaoId: 'cs_test_fora',
    valorCentavos: 13860,
    forma: 'pix',
    pagoEm: '2026-11-23T10:37:49.000Z',
    clientePais: 'BR',
  });
  // o pagamento do pedido passa a ser o parado (um segundo pagamento é "a mais")
  assert.equal(depois.paymentIntentId, 'pi_parado');
  // nada de hora do pagamento: o pedido não foi pago
  assert.equal(depois.pagamento.pagoEm, undefined);
  // a linha destacada, uma vez, com o valor e o pagamento
  const linha = `Aviso: chegou um pagamento de ${cifra(13860)} para este pedido cancelado (pi_parado): decidir no painel se devolve o dinheiro ou reativa o pedido`;
  assert.equal(avisoDoPagamentoRetido(13860, 'pi_parado'), linha);
  assert.deepEqual(
    depois.historico.slice(antes.historico.length).map((h) => h.evento),
    [linha],
  );
  // a leitura sem a hora da cobrança grava a hora em que o site viu o pagamento
  const semHora = porta(cancelado(), { ...PAGA, pagoEm: undefined }, 'consulta');
  assert.equal(semHora.depois.pagamento.retido?.pagoEm, '2026-11-23T10:37:52.000Z');
  // o QR do próprio pedido pago no instante do cancelamento (a corrida): o mesmo pagamento que o pedido já tinha
  const corrida = porta(cancelado(), { ...PAGA, sessaoId: 'cs_test_do_pedido', paymentIntentId: 'pi_do_qr' }, 'webhook');
  assert.equal(corrida.retido, 'pi_do_qr');
  assert.equal(corrida.devolver, null);
  // sem nenhum pagamento registrado antes, também
  const semNenhum = porta(cancelado({ paymentIntentId: undefined }), PAGA, 'webhook');
  assert.equal(semNenhum.retido, 'pi_parado');
  assert.equal(semNenhum.devolver, null);
});

test('a porta é idempotente e não depende da ordem: o aviso duas vezes e o aviso com a consulta dão uma linha e um registro', () => {
  const primeiro = porta(cancelado(), PAGA, 'webhook').depois;
  // o mesmo aviso de novo: nada é gravado, nada volta
  const deNovo = porta(primeiro, PAGA, 'webhook');
  assert.equal(deNovo.gravado, null);
  assert.equal(deNovo.retido, 'pi_parado');
  assert.equal(deNovo.devolver, null);
  // a consulta (a página aberta, sincronizarComStripe) com o mesmo pagamento: devolve o pedido como está, sem linha nova
  const consulta = porta(primeiro, PAGA, 'consulta');
  assert.equal(consulta.devolver, null);
  assert.equal(consulta.depois.historico.length, primeiro.historico.length);
  assert.deepEqual(consulta.depois.pagamento.retido, primeiro.pagamento.retido);
  // a consulta antes do aviso: a primeira grava, o aviso que chega depois não muda nada
  const pelaConsulta = porta(cancelado(), PAGA, 'consulta').depois;
  const avisoDepois = porta(pelaConsulta, PAGA, 'webhook');
  assert.equal(avisoDepois.gravado, null);
  assert.equal(avisoDepois.devolver, null);
  assert.equal(pelaConsulta.historico.filter((h) => h.evento.startsWith('Aviso: chegou um pagamento')).length, 1);
  // a rota do webhook, mesmo com o pedido relido depois de outra gravação, não devolve o parado
  assert.equal(pagamentoParaDevolver(primeiro, primeiro, PAGA), null);
});

test('o resto fica como hoje: o pago repetido volta, o segundo pagamento com um parado volta, o cancelado depois de pago tem as regras dele', () => {
  // o pagamento repetido de um pedido já PAGO continua voltando sozinho
  const pago = cancelado({ status: 'pago', paymentIntentId: 'pi_A', pagamento: { metodo: 'pix', pagoEm: '2026-11-23T10:31:00Z' } });
  const repetido = porta(pago, PAGA, 'webhook');
  assert.equal(repetido.retido, undefined);
  assert.equal(repetido.devolver, 'pi_parado');
  // um SEGUNDO pagamento com um já parado volta sozinho; o parado continua o mesmo
  const comParado = porta(cancelado(), PAGA, 'webhook').depois;
  const segundo = porta(comParado, { ...PAGA, sessaoId: 'cs_test_outra', paymentIntentId: 'pi_segundo' }, 'webhook');
  assert.equal(segundo.retido, undefined);
  assert.equal(segundo.devolver, 'pi_segundo');
  assert.equal(segundo.depois.pagamento.retido?.paymentIntentId, 'pi_parado');
  // depois de a equipe decidir devolver o parado, outro pagamento também volta sozinho
  const decidido = structuredClone(comParado);
  decidido.pagamento.retido!.decisao = { acao: 'devolver', em: '2026-11-23T11:00:00Z', reembolsoId: 're_1' };
  assert.equal(porta(decidido, { ...PAGA, paymentIntentId: 'pi_terceiro' }, 'webhook').devolver, 'pi_terceiro');
  // e o próprio parado relido depois da devolução não volta de novo pela rota (a devolução é a da equipe)
  assert.equal(porta(decidido, PAGA, 'webhook').devolver, null);
  // o pedido cancelado depois de pago (a hora do pagamento, ou a linha de pago no histórico), reembolsado ou contestado:
  // as regras de hoje
  for (const antes of [
    cancelado({ pagamento: { metodo: 'pix', pagoEm: '2026-11-22T10:00:00Z' } }),
    cancelado({ historico: historico('Reserva criada', 'Pago (webhook da Stripe)', 'Cancelado no admin') }),
    cancelado({ reembolsoCentavos: 13860 }),
  ]) {
    const caminho = porta(antes, PAGA, 'webhook');
    assert.equal(caminho.retido, undefined, JSON.stringify(antes.pagamento));
    assert.equal(caminho.devolver, 'pi_parado');
  }
  for (const status of ['reembolsado', 'contestado'] as StatusReserva[]) {
    const caminho = porta(cancelado({ status, paymentIntentId: 'pi_A' }), PAGA, 'webhook');
    assert.equal(caminho.retido, undefined, status);
    assert.equal(caminho.devolver, 'pi_parado', status);
  }
  // pendente e expirado esperam pagamento: entram no pedido como sempre (nem parado, nem devolvido)
  for (const status of ['pendente', 'expirado'] as StatusReserva[]) {
    assert.equal(pagamentoParaReter(cancelado({ status }), PAGA), undefined, status);
  }
  // a sessão não paga, ou sem o pagamento, ou sem o valor cobrado: nada fica parado
  assert.equal(pagamentoParaReter(cancelado(), { ...PAGA, status: 'pendente' }), undefined);
  assert.equal(pagamentoParaReter(cancelado(), { ...PAGA, paymentIntentId: undefined }), undefined);
  assert.equal(pagamentoParaReter(cancelado(), { ...PAGA, valorCentavos: undefined }), undefined);
  // o pedido do WhatsApp cancelado (com o provedor, ou sem ele e com o método): o pagamento volta sozinho, como hoje,
  // porque só o pedido da Stripe tem a decisão no painel (a mesma condição dos botões, da faixa e do e-mail)
  for (const doWhatsapp of [
    cancelado({ provedor: 'whatsapp', paymentIntentId: undefined }),
    cancelado({ provedor: undefined, pagamento: { metodo: 'whatsapp' }, paymentIntentId: undefined }),
  ]) {
    assert.equal(pagamentoParaReter(doWhatsapp, PAGA), undefined);
    const caminho = porta(doWhatsapp, PAGA, 'webhook');
    assert.equal(caminho.retido, undefined);
    assert.equal(caminho.devolver, 'pi_parado');
  }
  // as regras de antes do pagamentoParaDevolver continuam (sem pagamento parado, o cancelado devolve)
  assert.equal(
    pagamentoParaDevolver(
      { status: 'cancelado' },
      { status: 'cancelado', paymentIntentId: 'pi_B' },
      { status: 'pago', paymentIntentId: 'pi_B' },
    ),
    'pi_B',
  );
});

test('a porta no código: o pagamento parado vem antes do pagamento a mais, e o webhook não o devolve', () => {
  const pagamento = fonte('lib', 'pagamento-stripe.ts');
  const aplicar = corpoDe(pagamento, 'export async function aplicarSessao(');
  const reter = aplicar.indexOf('const retencao = pagamentoParaReter(r, leitura);');
  const aMais = aplicar.indexOf('const aMais = pagamentoAMais(r, leitura);');
  const trava = aplicar.indexOf('await atualizarReserva(alvo.codigo, (r) => {');
  assert.ok(trava !== -1 && reter > trava && aMais > reter, `${trava} ${reter} ${aMais}`);
  assert.match(
    aplicar,
    /if \(retencao\) \{\s+retido = leitura\.paymentIntentId;\s+if \(retencao === 'ja-retido'\) return origem === 'consulta' \? r : null;\s+return registrar\(r, reterPagamento\(r, leitura, sessao\.id, agoraIso\)\);\s+\}/,
  );
  // o resultado diz que o pagamento ficou parado, e o e-mail à equipe sai depois da gravação
  assert.match(aplicar, /if \(retido && reserva\) await pagamentoFicouRetido\(reserva, retido\);/);
  assert.match(aplicar, /\.\.\.\(retido \? \{ pagamentoRetido: retido \} : \{\}\),/);
  // o webhook sai antes de qualquer devolução quando o pagamento ficou parado
  const rota = fonte('app', 'api', 'webhooks', 'stripe', 'route.ts');
  const sessao = corpoDe(rota, 'async function sessaoMudou(', '\nasync function ');
  const parado = sessao.indexOf('if (pagamentoRetido) return {');
  const devolve = sessao.indexOf('await devolverPagamento(');
  assert.ok(parado !== -1 && devolve > parado, `${parado} ${devolve}`);
  // nenhum e-mail ao cliente agora: só o aviso à equipe
  const ficou = corpoDe(pagamento, 'async function pagamentoFicouRetido(', '\nasync function ');
  assert.match(ficou, /agendarAvisoDoPagamentoRetido\(/);
  assert.doesNotMatch(ficou, /agendarEmailDoPedido/);
});

/* ------------------------------------------------------------------ */
/* O painel: as duas ações                                              */

const comParado = (decisao?: NonNullable<Reserva['pagamento']['retido']>['decisao'], parcial: Partial<ReservaPasseio> = {}) => {
  const r = porta(cancelado(parcial), PAGA, 'webhook').depois;
  if (decisao) r.pagamento.retido!.decisao = decisao;
  return r;
};

test('a regra das duas ações do painel, para cada estado', () => {
  const D = 'devolver_retido';
  const R = 'reativar_retido';
  // à espera da decisão: as duas
  const espera = comParado();
  assert.deepEqual(
    ACOES_DO_PAGAMENTO_RETIDO.filter((a) => acaoDoRetidoOferecida(espera, a)),
    [D, R],
  );
  assert.equal(pagamentoRetidoADecidir(espera), true);
  // a devolução começada sem a resposta da Stripe: só o "Devolver" (completa com a mesma chave), nunca o "Reativar"
  const comecada = comParado({ acao: 'devolver', em: '2026-11-23T11:00:00Z' });
  assert.equal(acaoDoRetidoOferecida(comecada, D), true);
  assert.equal(acaoDoRetidoOferecida(comecada, R), false);
  // a devolução pedida (com o reembolso): nenhuma, e é a repetida do "Devolver"
  const devolvida = comParado({ acao: 'devolver', em: '2026-11-23T11:00:00Z', reembolsoId: 're_1' });
  for (const a of ACOES_DO_PAGAMENTO_RETIDO) assert.equal(acaoDoRetidoOferecida(devolvida, a), false, a);
  assert.equal(acaoDoRetidoRepetida(devolvida, D), true);
  assert.equal(acaoDoRetidoRepetida(devolvida, R), false);
  assert.equal(pagamentoRetidoADecidir(devolvida), false);
  // reativado: o pedido está pago; nenhuma, e é a repetida do "Reativar"
  const reativado = comParado({ acao: 'reativar', em: '2026-11-23T11:00:00Z' });
  reativado.status = 'pago';
  for (const a of ACOES_DO_PAGAMENTO_RETIDO) assert.equal(acaoDoRetidoOferecida(reativado, a), false, a);
  assert.equal(acaoDoRetidoRepetida(reativado, R), true);
  assert.equal(acaoDoRetidoRepetida(reativado, D), false);
  // um reembolso feito direto na Stripe (o valor devolvido no pedido) encerra a escolha
  assert.equal(acaoDoRetidoOferecida({ ...espera, reembolsoCentavos: 13860 }, D), false);
  assert.equal(acaoDoRetidoOferecida({ ...espera, reembolsoCentavos: 13860 }, R), false);
  // sem pagamento parado, fora da Stripe, ou em qualquer outro status: nenhuma
  assert.equal(acaoDoRetidoOferecida(cancelado(), D), false);
  assert.equal(acaoDoRetidoOferecida({ ...espera, provedor: 'whatsapp' }, D), false);
  for (const status of [
    'pendente',
    'pago',
    'expirado',
    'reembolsado',
    'contestado',
    'recusado',
    'aguardando_whatsapp',
  ] as StatusReserva[]) {
    for (const a of ACOES_DO_PAGAMENTO_RETIDO) assert.equal(acaoDoRetidoOferecida({ ...espera, status }, a), false, `${status} ${a}`);
  }
  // uma ação que a lista não conhece nunca vale
  assert.equal(acaoDoRetidoOferecida(espera, 'cancelar'), false);
  assert.equal(acaoDoRetidoRepetida(espera, 'cancelar'), false);
  // os textos do cartão, como o dono decidiu
  assert.equal(
    fraseDoPagamentoRetido(13860),
    `Este pedido estava cancelado e recebeu um pagamento de ${cifra(13860)}. O dinheiro está parado na Stripe: escolha devolver ao cliente ou reativar o pedido.`,
  );
  assert.deepEqual(botaoDevolverRetido(13860), {
    rotulo: `Devolver ${cifra(13860)} ao cliente`,
    confirmacao: `Confirmo: devolver ${cifra(13860)} ao cliente. Não dá para desfazer.`,
  });
  assert.deepEqual(BOTAO_REATIVAR_RETIDO, {
    rotulo: 'Reativar o pedido (fica pago)',
    confirmacao: 'Confirmo: o pedido volta a valer, pago, e o cliente recebe o e-mail com os vouchers.',
  });
});

test('a rota dentro da trava: o duplo toque e a aba antiga não gravam nada, e as duas ações se excluem', () => {
  const agora = '2026-11-23T11:00:00.000Z';
  // "Devolver", passo 1: o primeiro toque marca; o segundo (o duplo toque) acha a marca e não grava
  const r = comParado();
  assert.equal(marcarDevolucaoDoRetido(r, 'pi_parado', agora), 'gravar');
  assert.deepEqual(r.pagamento.retido?.decisao, { acao: 'devolver', em: agora });
  const antesDoSegundo = structuredClone(r);
  assert.equal(marcarDevolucaoDoRetido(r, 'pi_parado', '2026-11-23T11:00:01.000Z'), 'ja-marcada');
  assert.deepEqual(r, antesDoSegundo);
  // com a devolução começada, a reativação não vale mais (as duas se excluem)
  assert.equal(acaoDoRetidoOferecida(r, 'reativar_retido'), false);
  // passo 2: o reembolso da Stripe entra uma vez, com a linha; o segundo toque recebe o mesmo reembolso e não grava
  const reembolso = { id: 're_parado', centavos: 13860 };
  const linha = concluirDevolucaoDoRetido(r, 'pi_parado', reembolso, agora);
  assert.equal(linha, linhaDaDevolucaoDoRetido('pi_parado', 13860, 're_parado'));
  assert.equal(
    linha,
    `Decisão sobre o pagamento pi_parado: devolver ${cifra(13860)} ao cliente. Devolução solicitada na Stripe (re_parado); o pedido continua cancelado`,
  );
  registrar(r, linha!);
  assert.deepEqual(r.pagamento.retido?.decisao, { acao: 'devolver', em: agora, reembolsoId: 're_parado' });
  const gravado = structuredClone(r);
  assert.equal(concluirDevolucaoDoRetido(r, 'pi_parado', reembolso, '2026-11-23T11:00:05.000Z'), null);
  assert.deepEqual(r, gravado);
  // a aba antiga: a regra já não vale, e a ação está feita (a rota volta como a que deu certo, sem gravar)
  assert.equal(acaoDoRetidoOferecida(r, 'devolver_retido'), false);
  assert.equal(acaoDoRetidoRepetida(r, 'devolver_retido'), true);
  assert.equal(marcarDevolucaoDoRetido(r, 'pi_parado', agora), 'nao-vale');
  // o pedido continua cancelado
  assert.equal(r.status, 'cancelado');

  // a Stripe não devolveu: a marca sai e a escolha volta; sem marca começada, nada a desfazer
  const falhou = comParado();
  marcarDevolucaoDoRetido(falhou, 'pi_parado', agora);
  assert.equal(desfazerDevolucaoDoRetido(falhou, 'pi_parado'), true);
  assert.equal(falhou.pagamento.retido?.decisao, undefined);
  assert.equal(desfazerDevolucaoDoRetido(falhou, 'pi_parado'), false);
  assert.equal(desfazerDevolucaoDoRetido(gravado, 'pi_parado'), false);
  assert.equal(acaoDoRetidoOferecida(falhou, 'reativar_retido'), true);

  // "Reativar": dentro da trava, uma vez; depois, a regra já não vale (o duplo toque e a aba antiga não gravam)
  const reativar = comParado();
  const linhas = reativarPedidoRetido(reativar, [], new Date('2026-11-23T11:00:00Z'), linhaDaReativacao);
  assert.deepEqual(linhas, [
    `Decisão sobre o pagamento pi_parado: pedido reativado no painel, pago com este pagamento (${cifra(13860)}); os vouchers voltam a valer`,
  ]);
  assert.equal(acaoDoRetidoOferecida(reativar, 'reativar_retido'), false);
  assert.equal(acaoDoRetidoRepetida(reativar, 'reativar_retido'), true);
  // depois de reativado, o "Devolver" de uma aba antiga não vale (e nada marca)
  assert.equal(acaoDoRetidoOferecida(reativar, 'devolver_retido'), false);
  assert.equal(marcarDevolucaoDoRetido(reativar, 'pi_parado', agora), 'nao-vale');
  // e a devolução que chegasse da Stripe depois de reativado não grava nada
  assert.equal(concluirDevolucaoDoRetido(reativar, 'pi_parado', reembolso, agora), null);
  // outro pagamento nunca é o parado
  assert.equal(marcarDevolucaoDoRetido(comParado(), 'pi_outro', agora), 'nao-vale');

  // a rota no código: a regra conferida antes (a mesma da página) e de novo dentro da trava; a marca antes da Stripe
  const rota = fonte('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  const post = corpoDe(rota, 'export async function POST(');
  assert.match(
    post,
    /if \(acao === 'devolver_retido' \|\| acao === 'reativar_retido'\) \{\s+if \(!daStripe \|\| !acaoDoRetidoOferecida\(alvo, acao\)\) return voltar\(acaoDoRetidoRepetida\(alvo, acao\) \? undefined : 'acao-nao-vale'\);\s+if \(!confirmou\) return voltar\('falta-confirmar'\);/,
  );
  const devolver = corpoDe(rota, 'async function devolverPagamentoRetido(', '\nasync function ');
  const marca = devolver.indexOf('marcarDevolucaoDoRetido(r, pi,');
  const pede = devolver.indexOf('await criarReembolso(pi)');
  const conclui = devolver.indexOf('concluirDevolucaoDoRetido(r, pi,');
  assert.ok(marca !== -1 && pede > marca && conclui > pede, `${marca} ${pede} ${conclui}`);
  // a chave de idempotência dos outros reembolsos: criarReembolso com a referência "total" (sem valor)
  assert.match(devolver, /f\.metadata\?\.referencia === 'total' && reembolsoEmVigor\(f\.status\)\) \?\? \(await criarReembolso\(pi\)\)/);
  assert.match(devolver, /desfazerDevolucaoDoRetido\(r, pi\)/);
  const reativarNaRota = corpoDe(rota, 'async function reativarPagamentoRetido(');
  // relê na Stripe antes de gravar, confere a regra dentro da trava e só quem gravou manda o aviso de compra e o e-mail
  const rele = reativarNaRota.indexOf('obterSessao(retido.sessaoId)');
  const trava = reativarNaRota.indexOf('await atualizarReserva(alvo.codigo, (r) => {');
  assert.ok(rele !== -1 && trava > rele);
  assert.match(
    reativarNaRota,
    /if \(!acaoDoRetidoOferecida\(r, 'reativar_retido'\) \|\| r\.pagamento\.retido\?\.paymentIntentId !== retido\.paymentIntentId\) return null;/,
  );
  assert.match(reativarNaRota, /if \(!gravado\.reativou\) return gravado\.repetida \? null : 'acao-nao-vale';/);
  assert.equal(reativarNaRota.match(/pedidoPago\(/g)?.length, 1);
  assert.ok(reativarNaRota.indexOf('pedidoPago(') > reativarNaRota.indexOf('if (!gravado.reativou)'));
  // no banco, os outros vouchers que o cancelamento levou a 'cancelado' voltam a 'ativo': relidos DEPOIS da gravação
  // (com o pedido já pago o irmão parado aparece com statusItem 'cancelado') e antes do e-mail com os vouchers
  const releVouchers = reativarNaRota.indexOf('await vouchersDoPedido(alvo.pedido?.codigo ?? alvo.codigo)');
  const voltaAValer = reativarNaRota.indexOf("await atualizarItem(v.codigo, 'ativo',");
  assert.ok(trava !== -1 && releVouchers > trava, `${trava} ${releVouchers}`);
  assert.ok(voltaAValer > releVouchers && reativarNaRota.indexOf('pedidoPago(') > voltaAValer, `${releVouchers} ${voltaAValer}`);
  assert.match(reativarNaRota, /if \(v\.codigo === alvo\.codigo \|\| v\.statusItem !== 'cancelado'\) continue;/);
  assert.match(reativarNaRota, /try \{\s+await atualizarItem\(v\.codigo, 'ativo', [^;]+;\s+\} catch \(e\) \{\s+console\.error\(/);
  assert.ok(ERROS_DO_PAINEL['stripe-fora']);
  // a página monta os botões pela mesma regra
  const pagina = fonte('app', 'admin', 'page.tsx');
  assert.match(pagina, /ACOES_DO_PAGAMENTO_RETIDO\.filter\(\(acao\) => acaoDoRetidoOferecida\(r, acao\)\)/);
});

test('reativar: o pedido fica pago com o pagamento parado, os vouchers voltam a valer e os avisos de um pagamento normal entram', () => {
  // o pedido de cartão, de dois vouchers, que esperava R$ 154,00 e recebeu R$ 140,00 depois do horário do serviço
  const cartao = { ...PAGA, forma: 'cartao' as const, valorCentavos: 14000, cartao: { bandeira: 'visa', final: '4242', pais: 'BR' } };
  const r = porta(
    cancelado({ pagamento: { metodo: 'cartao' }, data: '2026-11-23', horario: { hora: '09:00', busca: false } }),
    cartao,
    'webhook',
  ).depois;
  const outro: ReservaPasseio = cancelado({ codigo: 'ON-OUT234', data: '2026-11-24' });
  const agora = new Date('2026-11-23T13:00:00Z');
  const linhas = reativarPedidoRetido(r, [outro], agora, linhaDaReativacao);
  assert.equal(r.status, 'pago');
  assert.equal(r.provedor, 'stripe');
  assert.equal(r.paymentIntentId, 'pi_parado');
  assert.equal(r.pagamentoExternoId, 'cs_test_fora');
  assert.equal(r.pagamento.metodo, 'cartao');
  // a hora da cobrança, não a da reativação
  assert.equal(r.pagamento.pagoEm, '2026-11-23T10:37:49.000Z');
  assert.equal(r.pagamento.cartaoBandeira, 'visa');
  assert.equal(r.pagamento.cartaoFinal, '4242');
  assert.equal(r.pagamento.cartaoPais, 'BR');
  assert.equal(r.cliente.pais, 'BR');
  assert.deepEqual(r.pagamento.retido?.decisao, { acao: 'reativar', em: agora.toISOString() });
  // os vouchers acompanham o pedido: nenhum fica cancelado sozinho
  assert.equal(r.statusItem, undefined);
  assert.deepEqual(linhas, [linhaDaReativacao('pi_parado', 14000), avisoDeValorDiferente(14000, 15400), AVISO_PAGO_DEPOIS_DO_HORARIO]);
  // o valor certo e antes do serviço: só a linha da decisão
  const certo = porta(cancelado(), PAGA, 'webhook').depois;
  assert.deepEqual(reativarPedidoRetido(certo, [], new Date('2026-11-23T11:00:00Z'), linhaDaReativacao), [
    linhaDaReativacao('pi_parado', 13860),
  ]);
  // a hora da linha "Pago" do painel: o pedido reativado deixa de ser "nunca pago"
  assert.equal(pagamentoParaReter(certo, PAGA), undefined);
});

/* ------------------------------------------------------------------ */
/* O histórico, a faixa do topo, a devolução que falha e as estatísticas */

test('o aviso abre o histórico até a decisão da equipe; a faixa do topo conta os pedidos à espera', () => {
  const parado = comParado();
  const n = parado.historico.findIndex((h) => h.evento.startsWith('Aviso: chegou um pagamento'));
  assert.equal(avisoAberto(parado.historico, n), true);
  // a decisão (devolver ou reativar) fecha o aviso; a de outro pagamento não
  for (const linha of [linhaDaDevolucaoDoRetido('pi_parado', 13860, 're_1'), linhaDaReativacao('pi_parado', 13860)]) {
    assert.ok(linha.startsWith(inicioDaDecisaoDoRetido('pi_parado')));
    assert.equal(avisoAberto([...parado.historico, { em: '2026-11-23T11:00:00Z', evento: linha }], n), false, linha);
  }
  assert.equal(avisoAberto([...parado.historico, { em: '2026-11-23T11:00:00Z', evento: linhaDaReativacao('pi_outro', 1) }], n), true);
  // o reembolso do parado feito direto na Stripe (ou confirmado antes da linha da decisão) também fecha o aviso
  for (const linha of [
    `Reembolso total (${cifra(13860)}) confirmado pela Stripe`,
    `Reembolso de ${cifra(5000)} confirmado pela Stripe: ${cifra(5000)} de ${cifra(13860)} devolvidos`,
  ]) {
    assert.equal(avisoAberto([...parado.historico, { em: '2026-11-23T11:00:00Z', evento: linha }], n), false, linha);
  }

  // a faixa: no singular e no plural, e nenhuma sem pedido
  const pedidos = agruparPedidos([
    parado,
    comParado(undefined, { codigo: 'ON-DOI234' }),
    comParado({ acao: 'devolver', em: '2026-11-23T11:00:00Z', reembolsoId: 're_1' }, { codigo: 'ON-TRE234' }),
    cancelado({ codigo: 'ON-QUA234' }),
  ]);
  assert.equal(contarPagamentosRetidos(pedidos), 2);
  assert.equal(avisoDosPagamentosRetidos(2), '2 pedidos cancelados receberam pagamento: decidir se devolve ou reativa');
  assert.equal(avisoDosPagamentosRetidos(1), '1 pedido cancelado recebeu pagamento: decidir se devolve ou reativa');
  assert.equal(avisoDosPagamentosRetidos(0), null);
  assert.equal(contarPagamentosRetidos(agruparPedidos([cancelado()])), 0);
  // a página: a faixa, a frase vermelha e o filtro que só a faixa abre (a barra de filtros não muda)
  const pagina = fonte('app', 'admin', 'page.tsx');
  assert.match(pagina, /const pagamentosRetidos = avisoDosPagamentosRetidos\(contarPagamentosRetidos\(pedidos\)\);/);
  assert.match(pagina, /href="\/admin\?status=pagamentos-a-decidir"/);
  assert.match(pagina, /fraseDoPagamentoRetido\(r\.pagamento\.retido\.valorCentavos\)/);
  assert.match(pagina, /\{FILTROS\.map\(\(f\) => \(/);
  assert.doesNotMatch(pagina, /\{FILTROS_DAS_FAIXAS\.map/);
});

test('a devolução do parado segue o caminho dos outros reembolsos: confirmada conta no pedido; falha leva ao "Falta devolver"', () => {
  const devolvido = comParado({ acao: 'devolver', em: '2026-11-23T11:00:00Z', reembolsoId: 're_1' });
  // pedido, ainda sem a confirmação da Stripe: sem botão de reembolso
  assert.deepEqual(reembolsoNoPainel(agruparPedidos([devolvido])[0]), { tipo: 'nenhum' });
  // a Stripe confirmou (charge.refunded, o pagamento do pedido é o parado): "Reembolsado R$ …" no valor do pedido
  const confirmado = { ...devolvido, reembolsoCentavos: 13860 };
  assert.equal(devolucaoNoPainel(agruparPedidos([confirmado])[0]).reembolsado, `Reembolsado ${cifra(13860)}`);
  // falhou (refund.failed): o "Falta devolver …", o botão de registrar a devolução por outro meio e a faixa
  const falho = {
    ...confirmado,
    historico: [
      ...confirmado.historico,
      { em: '2026-11-25T10:00:00Z', evento: linhaDoReembolsoFalho({ id: 're_1', centavos: 13860, motivo: 'declined' }) },
    ],
  };
  const p = agruparPedidos([falho])[0];
  assert.equal(devolucaoNoPainel(p).falta, `Falta devolver ${cifra(13860)}: o reembolso falhou na Stripe`);
  const m = reembolsoNoPainel(p);
  assert.equal(m.tipo, 'falhou');
  assert.equal(m.tipo === 'falhou' && m.pendentes.length, 1);
  // sem a decisão de devolver, o cancelado continua sem nada de reembolso no painel (como antes)
  assert.deepEqual(reembolsoNoPainel(agruparPedidos([{ ...falho, pagamento: { metodo: 'pix' } }])[0]), { tipo: 'nenhum' });
});

test('as estatísticas não contam o dinheiro parado até o pedido ser reativado', () => {
  const NOVEMBRO = { chave: 'outro', periodo: { de: '2026-11-20', ate: '2026-11-26' } };
  const parado = comParado();
  assert.equal(calcularEstatisticas([parado], [], NOVEMBRO).resumo.pedidos, 0);
  assert.equal(calcularEstatisticas([parado], [], NOVEMBRO).resumo.centavos, 0);
  // devolvido: continua de fora
  assert.equal(
    calcularEstatisticas([comParado({ acao: 'devolver', em: '2026-11-23T11:00:00Z', reembolsoId: 're_1' })], [], NOVEMBRO).resumo.centavos,
    0,
  );
  // reativado: entra, no dia da cobrança, pelo valor da forma paga
  const reativado = comParado();
  reativarPedidoRetido(reativado, [], new Date('2026-11-23T11:00:00Z'), linhaDaReativacao);
  const e = calcularEstatisticas([reativado], [], NOVEMBRO);
  assert.equal(e.resumo.pedidos, 1);
  assert.equal(e.resumo.centavos, 13860);
  // e o "Vendido" do painel faz a mesma conta (só os pagos)
  assert.match(fonte('app', 'admin', 'page.tsx'), /const pagos = pedidos\.filter\(\(p\) => p\.status === 'pago'\);/);
});

/* ------------------------------------------------------------------ */
/* O e-mail à equipe e a página do cliente                               */

const SITE = {
  url: 'https://orlanativa.online',
  logo: 'https://orlanativa.online/logo/orla-nativa-emblema-512.png',
  nome: 'Orla Nativa',
  dominio: 'orlanativa.online',
};

test('o e-mail à equipe: o assunto, o valor e o que fazer no painel; um por pagamento, essencial na cota, nada ao cliente', () => {
  const m = emailAvisoDoPagamentoRetido({
    codigo: 'ON-RET234',
    valor: 'R$ 138,60',
    linkPainel: 'https://orlanativa.online/admin?q=ON-RET234',
    site: SITE,
  });
  assert.equal(m.assunto, 'Pagamento recebido num pedido cancelado: ON-RET234');
  for (const parte of [m.html, m.texto]) {
    assert.ok(parte.includes('R$ 138,60'), 'o valor');
    assert.ok(parte.includes('devolver o dinheiro ao cliente'), 'o que fazer');
    assert.ok(parte.includes('reativar o pedido'), 'o que fazer');
    assert.ok(parte.includes('https://orlanativa.online/admin?q=ON-RET234'), 'o link do painel');
    assert.doesNotMatch(parte, /\{\w+\}/);
  }
  assert.equal(emailEssencial('pagamento-retido-equipe'), true);
  // lido do pedido: o valor; uma vez por pagamento; não sai depois da decisão, nem para outro pagamento
  const parado = comParado();
  assert.deepEqual(avisoDoPagamentoRetidoPorEmail(parado, 'pi_parado'), { centavos: 13860 });
  assert.equal(avisoDoPagamentoRetidoPorEmail(parado, 'pi_outro'), null);
  const enviado = {
    ...parado,
    historico: [...parado.historico, { em: '2026-11-23T10:39:00Z', evento: marcaDoAvisoDoPagamentoRetido('pi_parado') }],
  };
  assert.equal(avisoDoPagamentoRetidoPorEmail(enviado, 'pi_parado'), null);
  assert.ok(!MARCA_DO_AVISO_DO_PAGAMENTO_RETIDO.startsWith('Aviso:'));
  assert.equal(avisoDoPagamentoRetidoPorEmail(comParado({ acao: 'reativar', em: '2026-11-23T11:00:00Z' }), 'pi_parado'), null);
  assert.equal(avisoDoPagamentoRetidoPorEmail(cancelado(), 'pi_parado'), null);
  // o envio: pela equipe (responderPara), com a chave de idempotência do pagamento e a linha no histórico
  const pedidos = fonte('lib', 'email', 'pedidos.ts');
  const enviar = corpoDe(pedidos, 'export async function enviarAvisoDoPagamentoRetido(');
  assert.match(enviar, /para: responderPara\(\),/);
  assert.match(enviar, /chave: `pagamento-retido-equipe\/\$\{paymentIntentId\}`,/);
  assert.match(enviar, /if \(saiu\(resultado\)\) await anotar\(r\.codigo, marcaDoAvisoDoPagamentoRetido\(paymentIntentId\)\);/);
  assert.match(enviar, /const aviso = avisoDoPagamentoRetidoPorEmail\(r, paymentIntentId\);\s+if \(!aviso\) return;/);
});

test('a página do cliente: a frase nos 4 idiomas enquanto a equipe decide; depois, a do cancelado ou a do pago', () => {
  const frases = {
    pt: 'Recebemos um pagamento para este pedido, que estava cancelado. A nossa equipe vai falar com você para resolver.',
    en: 'We received a payment for this order, which had been cancelled. Our team will get in touch with you to sort it out.',
    es: 'Recibimos un pago para este pedido, que estaba cancelado. Nuestro equipo se va a comunicar contigo para resolverlo.',
    'es-ar': 'Recibimos un pago para este pedido, que estaba cancelado. Nuestro equipo se va a comunicar con vos para resolverlo.',
  } as const;
  for (const [idioma, frase] of Object.entries(frases)) {
    assert.equal(dicionario(idioma as keyof typeof frases).pedido.pagamentoRetido, frase, idioma);
    // sem valor e sem WhatsApp
    assert.doesNotMatch(frase, /R\$|\d|WhatsApp/);
  }
  // paraPublico marca só o cancelado à espera da decisão (a regra do painel), sem valor nem id
  const publica = fonte('lib', 'reserva-publica.ts');
  assert.match(publica, /\.\.\.\(status === 'cancelado' && pagamentoRetidoADecidir\(r\) \? \{ pagamentoRetido: true as const \} : \{\}\),/);
  // a página do pedido e a da reserva trocam o texto do cancelado pela frase; o título continua o do cancelado
  const pedido = fonte('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  assert.match(
    pedido,
    /cancelado: \{ titulo: d\.pedido\.canceladoTitulo, texto: itens\[0\]\?\.pagamentoRetido \? d\.pedido\.pagamentoRetido : d\.pedido\.canceladoTexto \},/,
  );
  const status = fonte('components', 'StatusReserva.tsx');
  assert.match(
    status,
    /cancelado: \{ titulo: textos\.canceladoTitulo, texto: r\.pagamentoRetido \? textos\.pagamentoRetido : textos\.canceladoTexto \},/,
  );
  assert.match(fonte('app', '[locale]', 'reserva', '[codigo]', 'page.tsx'), /pagamentoRetido: d\.pedido\.pagamentoRetido,/);
  // depois da devolução, o pedido continua cancelado sem a marca (o texto do cancelado); reativado, é o pago
  assert.equal(pagamentoRetidoADecidir(comParado({ acao: 'devolver', em: '2026-11-23T11:00:00Z', reembolsoId: 're_1' })), false);
  const reativado = comParado();
  reativarPedidoRetido(reativado, [], new Date('2026-11-23T11:00:00Z'), linhaDaReativacao);
  assert.equal(reativado.status, 'pago');
  // a página aberta se redesenha quando a marca muda (a equipe decidiu devolver: o status continua cancelado)
  assert.match(
    fonte('components', 'pagamento', 'useStatusDoPedido.ts'),
    /Boolean\(lido\.pagamentoRetido\) !== Boolean\(antes\.pagamentoRetido\)/,
  );
});
