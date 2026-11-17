import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eventoDoItemReembolsado } from '../src/app/api/webhooks/stripe/eventos.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import {
  ESPERA_PARA_COMPLETAR_O_VOUCHER_MS,
  ROTULO_DO_PROVEDOR,
  acaoManualRepetida,
  agruparPedidos,
  formaEProvedorNoPainel,
  marcaOVoucherPorFora,
  voucherDaStripeAindaLiga,
} from '../src/lib/pedidos-painel.ts';
import {
  horaDoVoucherDevolvidoPorOutroMeio,
  linhaDaDevolucaoPorOutroMeio,
  linhaDoReembolsoFalho,
  linhaDoReembolsoSemMudarVoucher,
  linhaDoReembolsoSemVoucher,
  linhaDoReembolsoSolicitado,
  linhaDoVoucherDevolvidoPorOutroMeio,
  linhaDoVoucherLigado,
  reembolsoNoHistorico,
  vouchersDevolvidosPorOutroMeio,
} from '../src/lib/reembolsos-a-resolver.ts';
import type { MetodoPagamento, Reserva, ReservaPasseio, StatusItem, StatusReserva } from '../src/lib/reservas.ts';

// O toque repetido nos botões do painel (Pacote 16, 17/11; a rodada com o banco de verdade de 17/11). Os botões são
// formulários simples: o duplo toque, ou uma aba antiga do painel, manda a mesma ação duas vezes, e a rota gravava a linha
// do histórico de novo ("Marcada como paga no Pix, no admin", "Reembolso do item … solicitado na Stripe (re_…)", "Item …
// marcado como devolvido no painel (por outro meio)"), sem mudar dinheiro nem status. Agora a rota confere de novo dentro da
// trava de versão do pedido, com as regras de src/lib/pedidos-painel.ts e src/lib/reembolsos-a-resolver.ts (rodam aqui em
// node), e a segunda vez não grava nada; a primeira grava como antes. A rota e a página do painel rodam no servidor do Next
// (o atalho "@/"), então os testes leem o código delas. Também o cartão do pedido do WhatsApp cancelado, que escrevia
// "WhatsApp" duas vezes. Só leitura: nada é gravado; os pedidos são fictícios.

/**
 * O código de um arquivo de src/, sem os comentários (os do JSX, os de bloco que começam a linha e as linhas de
 * comentário): só o que roda. As quebras de linha do Windows (o arquivo pode estar com CRLF no disco) viram \n.
 */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

const ROTA = codigo('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');

/** O trecho de uma ação da rota do painel: do `if (acao === '<nome>'` até a ação seguinte. */
function trechoDaAcao(acao: string): string {
  const inicio = ROTA.indexOf(`if (acao === '${acao}'`);
  assert.notEqual(inicio, -1, acao);
  const fim = ROTA.slice(inicio + 1).search(/\n {2}if \(acao === '|\n {2}const manual = ACOES_MANUAIS/);
  return ROTA.slice(inicio, fim === -1 ? undefined : inicio + 1 + fim);
}

/** O trecho das ações manuais: de `const manual = ACOES_MANUAIS[acao];` até o fim da rota. */
const MANUAIS = ROTA.slice(ROTA.indexOf('const manual = ACOES_MANUAIS[acao];'));

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
/** Um histórico com as linhas na ordem, um segundo entre uma e outra. */
const historico = (...eventos: string[]) =>
  eventos.map((evento, n) => ({ em: `2026-11-17T19:00:${String(n).padStart(2, '0')}.000Z`, evento }));

/** Um voucher de exemplo do caminho do WhatsApp, como o ON-F8538V da rodada (nenhum é de cliente). */
function voucher(parcial: Partial<ReservaPasseio> = {}): Reserva {
  return {
    codigo: 'ON-WAP234',
    token: 'token-de-teste',
    criadaEm: '2026-11-17T19:20:00Z',
    atualizadaEm: '2026-11-17T19:20:00Z',
    idioma: 'pt',
    status: 'aguardando_whatsapp',
    provedor: 'whatsapp',
    tipo: 'passeio',
    data: '2026-12-01',
    horario: { hora: '09:00', busca: false },
    totalCentavos: 15400,
    totalPixCentavos: 13860,
    cliente: { nome: 'Teste', email: 'teste@exemplo.com', telefone: '+55 21 90000-0000' },
    pagamento: { metodo: 'whatsapp' },
    historico: historico('Reserva criada'),
    passeio: { slug: 'escuna-buzios', nome: 'Escuna', cidade: 'Búzios', unidade: 'pessoa' },
    adultos: 2,
    criancas: 0,
    unidades: 2,
    hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
    ...parcial,
  } as ReservaPasseio;
}

/* ------------------------------------------------------------------ */
/* 1. As ações manuais (o caminho do WhatsApp, que está no ar)         */

type AcaoManual = { status: StatusReserva; evento: string; metodo?: MetodoPagamento };

/** A tabela ACOES_MANUAIS da rota, lida do código dela: os testes usam as ações de verdade. */
const ACOES: Record<string, AcaoManual> = (() => {
  const inicio = ROTA.indexOf('const ACOES_MANUAIS');
  assert.notEqual(inicio, -1);
  const tabela = ROTA.slice(inicio, ROTA.indexOf('\n};', inicio));
  const acoes: Record<string, AcaoManual> = {};
  for (const m of tabela.matchAll(/^\s+(\w+): \{ status: '(\w+)', evento: '([^']+)'(?:, metodo: '(\w+)')? \},$/gm)) {
    acoes[m[1]] = { status: m[2] as StatusReserva, evento: m[3], ...(m[4] ? { metodo: m[4] as MetodoPagamento } : {}) };
  }
  return acoes;
})();

test('as ações manuais da rota são as de sempre: o status, a linha e, no Pix e no cartão, a forma', () => {
  assert.deepEqual(ACOES, {
    marcar_pago: { status: 'pago', evento: 'Marcada como paga no admin' },
    pago_pix: { status: 'pago', evento: 'Marcada como paga no Pix, no admin', metodo: 'pix' },
    pago_cartao: { status: 'pago', evento: 'Marcada como paga no cartão, no admin', metodo: 'cartao' },
    cancelar: { status: 'cancelado', evento: 'Cancelada no admin' },
    reembolsado: { status: 'reembolsado', evento: 'Marcada como reembolsada no admin (fora da Stripe)' },
  });
});

test('a ação manual repetida não muda nada: o mesmo status e, quando a ação diz a forma, a mesma forma', () => {
  const pedido = (status: StatusReserva, metodo: MetodoPagamento) => ({ status, pagamento: { metodo } });
  // o ON-F8538V da rodada: o primeiro "Pago no Pix" muda (aguardando o WhatsApp → pago no Pix) e grava a linha
  assert.equal(acaoManualRepetida(pedido('aguardando_whatsapp', 'whatsapp'), ACOES.pago_pix), false);
  assert.equal(acaoManualRepetida(pedido('aguardando_whatsapp', 'whatsapp'), ACOES.pago_cartao), false);
  assert.equal(acaoManualRepetida(pedido('aguardando_whatsapp', 'whatsapp'), ACOES.cancelar), false);
  // o segundo (o duplo toque, a aba antiga do painel, o ON-3BAMLF da conferência): já pago no Pix, nada a gravar
  assert.equal(acaoManualRepetida(pedido('pago', 'pix'), ACOES.pago_pix), true);
  assert.equal(acaoManualRepetida(pedido('pago', 'cartao'), ACOES.pago_cartao), true);
  // corrigir a forma é mudança: "Pago no Pix" e depois "Corrigir: foi no cartão" (e o contrário) gravam a linha
  assert.equal(acaoManualRepetida(pedido('pago', 'pix'), ACOES.pago_cartao), false);
  assert.equal(acaoManualRepetida(pedido('pago', 'cartao'), ACOES.pago_pix), false);
  // "Cancelar" num pedido do WhatsApp já pago também muda (o ON-N5TB3J foi cancelado antes de pagar)
  for (const metodo of ['pix', 'cartao'] as const) assert.equal(acaoManualRepetida(pedido('pago', metodo), ACOES.cancelar), false);
  // o cancelado de novo, o reembolsado de novo: nada
  assert.equal(acaoManualRepetida(pedido('cancelado', 'whatsapp'), ACOES.cancelar), true);
  assert.equal(acaoManualRepetida(pedido('reembolsado', 'pix'), ACOES.reembolsado), true);
  // "Marcar reembolsado" num pago ou num cancelado (os dois têm o botão) muda
  assert.equal(acaoManualRepetida(pedido('pago', 'pix'), ACOES.reembolsado), false);
  assert.equal(acaoManualRepetida(pedido('cancelado', 'whatsapp'), ACOES.reembolsado), false);
  // "Marcar como pago" (o checkout antigo) não diz a forma: repetida em qualquer forma, mudança fora do pago
  for (const metodo of ['pix', 'cartao', 'whatsapp'] as const) {
    assert.equal(acaoManualRepetida(pedido('pago', metodo), ACOES.marcar_pago), true, metodo);
    for (const status of ['pendente', 'recusado', 'expirado', 'aguardando_whatsapp'] as const)
      assert.equal(acaoManualRepetida(pedido(status, metodo), ACOES.marcar_pago), false, `${status} ${metodo}`);
  }
  // nenhuma ação é repetida num status diferente do dela
  const status: StatusReserva[] = [
    'pendente',
    'pago',
    'recusado',
    'cancelado',
    'expirado',
    'aguardando_whatsapp',
    'reembolsado',
    'contestado',
  ];
  for (const [nome, acao] of Object.entries(ACOES))
    for (const s of status)
      for (const metodo of ['pix', 'cartao', 'whatsapp'] as const)
        if (s !== acao.status) assert.equal(acaoManualRepetida(pedido(s, metodo), acao), false, `${nome} ${s} ${metodo}`);
});

test('a rota das ações manuais: a repetida volta antes de qualquer gravação, e a primeira grava como antes', () => {
  // dentro da trava: o virouPago calculado primeiro (como antes), a repetida devolve null e, depois dela, o que já era:
  // o status, o provedor do WhatsApp, a forma, a hora do pagamento e a linha
  assert.match(
    MANUAIS,
    /const atualizada = await atualizarReserva\(alvo\.codigo, \(r\) => \{\s+virouPago = manual\.status === 'pago' && r\.status !== 'pago';\s+if \(acaoManualRepetida\(r, manual\)\) return null;\s+r\.status = manual\.status;\s+if \(provedorDaReserva\(r\) === 'whatsapp'\) r\.provedor = 'whatsapp';\s+if \(manual\.metodo\) r\.pagamento\.metodo = manual\.metodo;\s+if \(manual\.status === 'pago' && !r\.pagamento\.pagoEm\) r\.pagamento\.pagoEm = new Date\(\)\.toISOString\(\);\s+return registrar\(r, manual\.evento\);\s+\}\);/,
  );
  // o aviso de compra e o e-mail só quando virou pago (a repetida já é pago: virouPago false), e a volta de sempre
  assert.match(
    MANUAIS,
    /if \(virouPago && atualizada\) \{\s+await avisarCompra\(atualizada\);\s+agendarEmailDoPedido\('pagamento-aprovado', codigoDoPedido\);\s+\}\s+return voltar\(\);\s+\}\s*$/,
  );
  assert.equal(MANUAIS.match(/acaoManualRepetida\(/g)?.length, 1);
  assert.equal(MANUAIS.match(/registrar\(/g)?.length, 1);
  // toda ação que a regra dá como repetida tem o virouPago da rota (a conta de cima) false: nenhum aviso de compra nem
  // e-mail sai por ela, em nenhum status nem forma
  const status: StatusReserva[] = [
    'pendente',
    'pago',
    'recusado',
    'cancelado',
    'expirado',
    'aguardando_whatsapp',
    'reembolsado',
    'contestado',
  ];
  let repetidas = 0;
  for (const acao of Object.values(ACOES))
    for (const s of status)
      for (const metodo of ['pix', 'cartao', 'whatsapp'] as const)
        if (acaoManualRepetida({ status: s, pagamento: { metodo } }, acao)) {
          repetidas++;
          assert.equal(acao.status === 'pago' && s !== 'pago', false, `${acao.evento} ${s} ${metodo}`);
        }
  assert.ok(repetidas > 0);
  // e null na trava não grava nada: atualizarReserva devolve o pedido lido, antes de gravar (src/lib/reservas.ts)
  const reservas = codigo('lib', 'reservas.ts');
  assert.match(
    reservas,
    /const nova = alterar\(structuredClone\(atual\.reserva\)\);\s+if \(!nova\) return atual\.reserva;\s+nova\.atualizadaEm = new Date\(\)\.toISOString\(\);\s+if \(await principal\(\)\.gravar\(nova, atual\.versao\)\)/,
  );
});

/* ------------------------------------------------------------------ */
/* 2. As linhas do reembolso pedido à Stripe                           */

test('a linha do reembolso pedido à Stripe é a de antes, sem mudar uma letra (total e de um voucher)', () => {
  assert.equal(
    linhaDoReembolsoSolicitado({ id: 're_T', centavos: 24200 }),
    `Reembolso total (${cifra(24200)}) solicitado na Stripe (re_T): o status muda quando a Stripe confirmar`,
  );
  assert.equal(
    linhaDoReembolsoSolicitado({ id: 're_3UcslOAEba4R3ewo0Y11KgU8', centavos: 15400, voucher: 'ON-2ML9AD' }),
    `Reembolso do item ON-2ML9AD (${cifra(15400)}) solicitado na Stripe (re_3UcslOAEba4R3ewo0Y11KgU8): o item muda quando a Stripe confirmar`,
  );
  // com centavos e o ponto de milhar
  assert.ok(linhaDoReembolsoSolicitado({ id: 're_1', centavos: 123456 }).includes(cifra(123456)));
});

test('o segundo toque recebe o mesmo reembolso: com o id dele já no histórico, a linha não é gravada de novo', () => {
  const doVoucher = linhaDoReembolsoSolicitado({ id: 're_3UcslOAEba4R3ewo0Y11KgU8', centavos: 15400, voucher: 'ON-2ML9AD' });
  const tudo = linhaDoReembolsoSolicitado({ id: 're_T', centavos: 39600 });
  // o primeiro toque: nada no histórico cita o reembolso, e a linha é gravada
  assert.equal(
    reembolsoNoHistorico(historico('Pedido criado com 2 itens', 'Pago (webhook da Stripe)'), 're_3UcslOAEba4R3ewo0Y11KgU8'),
    false,
  );
  assert.equal(reembolsoNoHistorico([], 're_T'), false);
  // o segundo (o ON-RNV3SR da conferência: duas linhas iguais, 20:14:23 e 20:14:24): a linha do primeiro já está lá
  assert.equal(reembolsoNoHistorico(historico('Pago (webhook da Stripe)', doVoucher), 're_3UcslOAEba4R3ewo0Y11KgU8'), true);
  assert.equal(reembolsoNoHistorico(historico('Pago (webhook da Stripe)', tudo), 're_T'), true);
  // o aviso do charge.refunded que chegou antes da linha também cita o reembolso: a linha "solicitado" não faz falta
  const itemDoWebhook = eventoDoItemReembolsado({ voucher: 'ON-2ML9AD', centavos: 15400, reembolsoId: 're_X1', pendente: true });
  assert.equal(reembolsoNoHistorico(historico(itemDoWebhook), 're_X1'), true);
  // outro reembolso (o outro voucher, ou um reembolso novo depois de 24 horas): a linha é gravada
  assert.equal(reembolsoNoHistorico(historico(doVoucher, tudo), 're_OUTRO'), false);
  // os parênteses fecham o id: re_1 não é citado por (re_12), nem re_12 por (re_1)
  assert.equal(reembolsoNoHistorico(historico(linhaDoReembolsoSolicitado({ id: 're_12', centavos: 100 })), 're_1'), false);
  assert.equal(reembolsoNoHistorico(historico(linhaDoReembolsoSolicitado({ id: 're_1', centavos: 100 })), 're_12'), false);
  // a linha do reembolso que falhou traz o id com o motivo, "(re_…, motivo)": ela não conta (a rota nem pede outro
  // reembolso depois de uma falha: stripe-devolveu-menos)
  const falhou = linhaDoReembolsoFalho({ id: 're_F', centavos: 15400, voucher: 'ON-2ML9AD', motivo: 'expired_or_canceled_card' });
  assert.equal(reembolsoNoHistorico(historico(falhou), 're_F'), false);
});

test('a rota: "Reembolsar tudo" e "Reembolsar só o voucher" conferem o histórico dentro da trava antes de gravar a linha', () => {
  const reembolsar = trechoDaAcao('reembolsar');
  assert.match(
    reembolsar,
    /const re = await criarReembolso\(alvo\.paymentIntentId\);\s+await atualizarReserva\(alvo\.codigo, \(r\) =>\s+reembolsoNoHistorico\(r\.historico, re\.id\) \? null : registrar\(r, linhaDoReembolsoSolicitado\(\{ id: re\.id, centavos: re\.amount \}\)\),?\s+\);\s+return voltar\(\);/,
  );
  assert.match(
    reembolsar,
    /const re = await criarReembolso\(alvo\.paymentIntentId, centavos, voucher\);\s+await atualizarReserva\(alvo\.codigo, \(r\) =>\s+reembolsoNoHistorico\(r\.historico, re\.id\)\s+\? null\s+: registrar\(r, linhaDoReembolsoSolicitado\(\{ id: re\.id, centavos: re\.amount, voucher \}\)\),?\s+\);\s+return voltar\(\);/,
  );
  assert.equal(reembolsar.match(/reembolsoNoHistorico\(r\.historico, re\.id\)/g)?.length, 2);
  // nenhuma cópia da frase na rota: ela sai só de linhaDoReembolsoSolicitado
  assert.doesNotMatch(ROTA, /solicitado na Stripe/);
});

/* ------------------------------------------------------------------ */
/* 3. O voucher devolvido por outro meio e o voucher da Stripe          */

test('a hora da linha do voucher devolvido por outro meio: a primeira daquele voucher, ou nenhuma', () => {
  const linhaA = linhaDoVoucherDevolvidoPorOutroMeio('ON-LX2JZN', 24200);
  const linhaB = linhaDoVoucherDevolvidoPorOutroMeio('ON-2ML9AD', 15400);
  const h = [
    { em: '2026-11-17T20:10:00.000Z', evento: 'Pago (webhook da Stripe)' },
    { em: '2026-11-17T20:19:26.720Z', evento: linhaA },
    // a mesma linha repetida pelo banco (a hora em microssegundos): vale a primeira
    { em: '2026-11-17T20:19:26.955Z', evento: linhaA },
  ];
  assert.equal(horaDoVoucherDevolvidoPorOutroMeio(h, 'ON-LX2JZN'), '2026-11-17T20:19:26.720Z');
  assert.equal(horaDoVoucherDevolvidoPorOutroMeio(h, 'ON-2ML9AD'), undefined);
  assert.equal(
    horaDoVoucherDevolvidoPorOutroMeio([...h, { em: '2026-11-17T20:21:00.000Z', evento: linhaB }], 'ON-2ML9AD'),
    '2026-11-17T20:21:00.000Z',
  );
  assert.equal(horaDoVoucherDevolvidoPorOutroMeio([], 'ON-LX2JZN'), undefined);
  // a linha que fecha um reembolso que falhou, "… do item ON-… (reembolso re_…, que falhou na Stripe)", não é a do voucher
  // por fora (a mesma leitura de vouchersDevolvidosPorOutroMeio)
  const fecho = linhaDaDevolucaoPorOutroMeio({ id: 're_F', centavos: 24200, voucher: 'ON-LX2JZN' });
  assert.equal(horaDoVoucherDevolvidoPorOutroMeio(historico(fecho), 'ON-LX2JZN'), undefined);
  assert.deepEqual(vouchersDevolvidosPorOutroMeio(historico(fecho)), []);
  // achou a hora sempre que vouchersDevolvidosPorOutroMeio acha o voucher (a conferência de antes da trava)
  for (const lista of [h, historico(linhaB, linhaA), historico(fecho, linhaA)])
    for (const v of ['ON-LX2JZN', 'ON-2ML9AD'])
      assert.equal(
        horaDoVoucherDevolvidoPorOutroMeio(lista, v) !== undefined,
        vouchersDevolvidosPorOutroMeio(lista).some((x) => x.voucher === v),
      );
});

test('o voucher por outro meio: só quem gravou a linha marca o voucher; quem a acha marca só depois de 60 s, com o voucher ainda pago', () => {
  const agora = new Date('2026-11-17T20:30:00.000Z');
  const antes = (ms: number) => new Date(agora.getTime() - ms).toISOString();
  const pago: Pick<Reserva, 'statusItem'> = {};
  assert.equal(ESPERA_PARA_COMPLETAR_O_VOUCHER_MS, 60_000);
  // a primeira requisição gravou a linha: marca o voucher, como antes
  assert.equal(marcaOVoucherPorFora({ escreveu: true }, agora, pago), true);
  assert.equal(marcaOVoucherPorFora({ escreveu: true, linhaEm: undefined }, agora, { statusItem: 'ativo' }), true);
  // o duplo toque (o ON-RNV3SR: a segunda requisição 235 ms depois): acha a linha recém-gravada e não marca de novo
  assert.equal(marcaOVoucherPorFora({ escreveu: false, linhaEm: antes(235) }, agora, pago), false);
  // nem a aba antiga dentro do minuto, nem com o voucher "ativo" relido do banco
  for (const ms of [0, 1_000, 30_000, 59_999, 60_000])
    for (const v of [pago, { statusItem: 'ativo' as StatusItem }])
      assert.equal(marcaOVoucherPorFora({ escreveu: false, linhaEm: antes(ms) }, agora, v), false, String(ms));
  // a função cortada entre as duas gravações: o clique seguinte, com a linha de mais de um minuto, completa
  for (const ms of [60_001, 61_000, 5 * 60_000, 24 * 60 * 60_000])
    assert.equal(marcaOVoucherPorFora({ escreveu: false, linhaEm: antes(ms) }, agora, pago), true, String(ms));
  // ... só com o voucher ainda pago: reembolsado ou cancelado, não
  for (const statusItem of ['reembolsado', 'cancelado'] as const)
    assert.equal(marcaOVoucherPorFora({ escreveu: false, linhaEm: antes(5 * 60_000) }, agora, { statusItem }), false, statusItem);
  // sem linha nenhuma (a trava não gravou: o pedido não estava pago, ou nada a devolver), nada
  assert.equal(marcaOVoucherPorFora({ escreveu: false }, agora, pago), false);
  assert.equal(marcaOVoucherPorFora({}, agora, pago), false);
  // a hora no futuro (relógio adiantado) ou que não dá para ler não completa
  assert.equal(marcaOVoucherPorFora({ escreveu: false, linhaEm: '2026-11-17T20:35:00.000Z' }, agora, pago), false);
  assert.equal(marcaOVoucherPorFora({ escreveu: false, linhaEm: 'quando?' }, agora, pago), false);
});

test('a rota do voucher por outro meio: a linha e o valor na trava, uma vez; a marca do voucher só por marcaOVoucherPorFora', () => {
  const porFora = trechoDaAcao('voucher_por_fora');
  // dentro da trava, a leitura recomeça a cada volta: nada escrito e a hora da linha já gravada, se houver
  assert.match(
    porFora,
    /await atualizarReserva\(alvo\.codigo, \(r\) => \{\s+gravado\.escreveu = false;\s+gravado\.linhaEm = horaDoVoucherDevolvidoPorOutroMeio\(r\.historico, voucher\);\s+if \(gravado\.linhaEm !== undefined \|\| r\.status !== 'pago'\) return null;/,
  );
  // escreveu só logo antes de gravar a linha, depois da soma (uma vez) e do status
  assert.match(
    porFora,
    /r\.reembolsoCentavos = \(r\.reembolsoCentavos \?\? 0\) \+ centavos;\s+if \(ultimo && podeMudar\(r\.status, 'reembolsado'\)\) r\.status = 'reembolsado';\s+gravado\.escreveu = true;\s+return registrar\(r, linhaDoVoucherDevolvidoPorOutroMeio\(voucher, centavos\)\);\s+\}\);/,
  );
  assert.equal(porFora.match(/gravado\.escreveu = true;/g)?.length, 1);
  // a marca do voucher: uma chamada só, pela regra (quem gravou, ou a linha de mais de um minuto com o voucher pago)
  assert.match(
    porFora,
    /if \(marcaOVoucherPorFora\(gravado, new Date\(\), item\)\) \{\s+await atualizarItem\(voucher, 'reembolsado', `Item \$\{voucher\} marcado como devolvido no painel \(por outro meio\)`\);\s+\}\s+return voltar\(\);/,
  );
  assert.equal(porFora.match(/atualizarItem\(/g)?.length, 1);
  assert.ok(porFora.indexOf('await atualizarReserva(') < porFora.indexOf('await atualizarItem('));
  // a regra de antes (quem achava a linha já gravada marcava o voucher de novo) não volta
  assert.doesNotMatch(porFora, /gravado\.linha\b/);
  // o voucher passado à regra é o desta ação, já conferido como pago antes da trava
  assert.ok(porFora.indexOf("if (!voucherPago(item)) return voltar('item-ja-devolvido');") < porFora.indexOf('await atualizarReserva('));
});

test('"Foi o voucher …": só com o pedido pago, o voucher ativo e o reembolso da Stripe ainda sem dono (um reembolso, um voucher)', () => {
  const aviso = linhaDoReembolsoSemVoucher({ id: 're_direto', centavos: 15400 });
  const pedido = (status: StatusReserva, statusItem: StatusItem | undefined, ...depois: string[]) => ({
    status,
    ...(statusItem ? { statusItem } : {}),
    historico: historico('Pedido criado com 2 itens', 'Pago (webhook da Stripe)', aviso, ...depois),
  });
  // o primeiro toque: o aviso aberto, o voucher ativo (sem status próprio, ou "ativo" relido do banco)
  assert.equal(voucherDaStripeAindaLiga(pedido('pago', undefined), 're_direto'), true);
  assert.equal(voucherDaStripeAindaLiga(pedido('pago', 'ativo'), 're_direto'), true);
  // o segundo, relido na trava: o reembolso já ligado ao voucher; nada a gravar, nem neste voucher nem no outro
  const ligado = linhaDoVoucherLigado('re_direto', 'ON-AAA234');
  assert.equal(voucherDaStripeAindaLiga(pedido('pago', 'reembolsado', ligado), 're_direto'), false);
  assert.equal(voucherDaStripeAindaLiga(pedido('pago', undefined, ligado), 're_direto'), false);
  // anotado como desconto, ou o pedido reembolsado inteiro: também resolvido
  assert.equal(voucherDaStripeAindaLiga(pedido('pago', undefined, linhaDoReembolsoSemMudarVoucher('re_direto')), 're_direto'), false);
  assert.equal(
    voucherDaStripeAindaLiga(pedido('pago', undefined, `Reembolso total (${cifra(39600)}) confirmado pela Stripe`), 're_direto'),
    false,
  );
  // outro reembolso feito direto na Stripe, ainda aberto: esse ainda liga
  const outro = linhaDoReembolsoSemVoucher({ id: 're_outro', centavos: 24200 });
  assert.equal(voucherDaStripeAindaLiga(pedido('pago', undefined, ligado, outro), 're_outro'), true);
  // um id que não é de aviso nenhum, o pedido que deixou de estar pago, o voucher usado, reembolsado ou cancelado: não
  assert.equal(voucherDaStripeAindaLiga(pedido('pago', undefined), 're_nenhum'), false);
  for (const status of ['reembolsado', 'contestado', 'cancelado'] as const)
    assert.equal(voucherDaStripeAindaLiga(pedido(status, undefined), 're_direto'), false, status);
  for (const statusItem of ['usado', 'reembolsado', 'cancelado'] as const)
    assert.equal(voucherDaStripeAindaLiga(pedido('pago', statusItem), 're_direto'), false, statusItem);
});

test('a rota do voucher da Stripe: a marca e a linha numa gravação só, com a conferência dentro da trava', () => {
  const daStripe = trechoDaAcao('voucher_da_stripe');
  // a gravação é a do próprio voucher (o item e o histórico do pedido juntos, com a trava de versão do pedido): a
  // conferência relida lá dentro, e só então a marca e a linha de sempre
  assert.match(
    daStripe,
    /await atualizarReserva\(voucher, \(r\) => \{\s+if \(!voucherDaStripeAindaLiga\(r, id\)\) return null;\s+r\.statusItem = 'reembolsado';\s+return registrar\(r, linhaDoVoucherLigado\(id, voucher\)\);\s+\}\);\s+return voltar\(\);/,
  );
  // nada de atualizar_item (sem trava, sempre grava a linha) nesta ação
  assert.doesNotMatch(daStripe, /atualizarItem\(/);
  // as conferências de antes continuam, com os mesmos erros, e a caixa "Confirmo" antes da gravação
  const confirmo = daStripe.indexOf("if (!confirmou) return voltar('falta-confirmar');");
  for (const recusa of [
    "if (!daStripe || alvo.status !== 'pago' || !semVoucherAberto(alvo, id)) return voltar('acao-nao-vale');",
    "if (!item) return voltar('voucher-de-fora');",
    "if (!voucherAtivo(item)) return voltar(voucherPago(item) ? 'acao-nao-vale' : 'item-ja-devolvido');",
  ])
    assert.ok(daStripe.indexOf(recusa) !== -1 && daStripe.indexOf(recusa) < confirmo, recusa);
  assert.ok(confirmo !== -1 && confirmo < daStripe.indexOf('await atualizarReserva('));
  // sem o banco, atualizarItem é esta mesma gravação (o item marcado na própria reserva, a linha no histórico, levado aos
  // irmãos); com o banco, atualizar_reserva grava o status do item (itens_pedido.status) com a mesma trava
  const reservas = codigo('lib', 'reservas.ts');
  assert.match(
    reservas,
    /const r = await atualizarReserva\(voucher, \(reserva\) => \{\s+reserva\.statusItem = status;\s+return registrar\(reserva, evento\);\s+\}\);/,
  );
  const banco = codigo('lib', 'reservas-banco.ts');
  assert.match(banco, /status: r\.statusItem \?\? statusDoItem\(r\.status\),/);
  const migracao = readFileSync(path.join('supabase', 'migrations', '20261112025627_pagamentos_stripe.sql'), 'utf8');
  assert.match(
    migracao,
    /update public\.itens_pedido set\s[\s\S]*?status = i\.status\s+where pedido_id = v_id and voucher_codigo = i\.voucher_codigo;/,
  );
  // a trava: atualizar_reserva só grava com o atualizado_em lido (e o gatilho o troca a cada gravação)
  assert.match(migracao, /where codigo = p\.codigo and \(p_versao is null or atualizado_em = p_versao\)/);
});

/* ------------------------------------------------------------------ */
/* 5. O cartão do pedido: "WhatsApp" uma vez só                         */

test('o cartão do pedido: a forma e quem cobrou; no pedido do WhatsApp cancelado antes de pagar, "WhatsApp" uma vez só', () => {
  const linhas = (parcial: Partial<ReservaPasseio>) => formaEProvedorNoPainel(agruparPedidos([voucher(parcial)])[0]);
  // o ON-N5TB3J da rodada: cancelado pelo painel antes de a equipe anotar Pix ou cartão
  assert.deepEqual(linhas({ status: 'cancelado' }), { forma: 'WhatsApp' });
  // o pedido antigo, sem o provedor gravado, que terminava pelo WhatsApp: o mesmo
  assert.deepEqual(linhas({ status: 'cancelado', provedor: undefined }), { forma: 'WhatsApp' });
  // pago pelo WhatsApp: como antes, a forma e, embaixo, "WhatsApp" (o ON-F8538V: "R$ 138,60 · Pix · WhatsApp")
  assert.deepEqual(linhas({ status: 'pago', pagamento: { metodo: 'pix', pagoEm: '2026-11-17T19:23:25Z' } }), {
    forma: 'Pix',
    provedor: 'WhatsApp',
  });
  assert.deepEqual(linhas({ status: 'pago', pagamento: { metodo: 'cartao', pagoEm: '2026-11-17T19:23:25Z' } }), {
    forma: 'Cartão',
    provedor: 'WhatsApp',
  });
  // depois de pago, cancelado ou reembolsado à mão: a forma anotada continua, e "WhatsApp" embaixo
  assert.deepEqual(linhas({ status: 'cancelado', pagamento: { metodo: 'pix' } }), { forma: 'Pix', provedor: 'WhatsApp' });
  assert.deepEqual(linhas({ status: 'reembolsado', pagamento: { metodo: 'cartao' } }), { forma: 'Cartão', provedor: 'WhatsApp' });
  // pela Stripe: o cartão com a bandeira (a primeira letra maiúscula) e o final, ou o Pix, e "Stripe" embaixo
  const stripe = { provedor: 'stripe' as const, paymentIntentId: 'pi_1', status: 'pago' as const };
  assert.deepEqual(linhas({ ...stripe, pagamento: { metodo: 'cartao', cartaoBandeira: 'visa', cartaoFinal: '4242' } }), {
    forma: 'Cartão Visa •••• 4242',
    provedor: 'Stripe',
  });
  assert.deepEqual(linhas({ ...stripe, pagamento: { metodo: 'cartao', cartaoBandeira: 'mastercard' } }), {
    forma: 'Cartão Mastercard',
    provedor: 'Stripe',
  });
  assert.deepEqual(linhas({ ...stripe, pagamento: { metodo: 'cartao', cartaoFinal: '0002' } }), {
    forma: 'Cartão •••• 0002',
    provedor: 'Stripe',
  });
  assert.deepEqual(linhas({ ...stripe, pagamento: { metodo: 'pix' } }), { forma: 'Pix', provedor: 'Stripe' });
  // o checkout antigo (sem provedor gravado, com a forma online): "Pagar.me (checkout antigo)"
  assert.deepEqual(linhas({ status: 'pago', provedor: undefined, pagamento: { metodo: 'pix', pedidoId: 'or_1' } }), {
    forma: 'Pix',
    provedor: 'Pagar.me (checkout antigo)',
  });
  assert.deepEqual(ROTULO_DO_PROVEDOR, { stripe: 'Stripe', pagarme: 'Pagar.me (checkout antigo)', whatsapp: 'WhatsApp' });
});

test('a página do painel escreve as duas linhas pela regra, e a de quem cobrou só quando ela existe', () => {
  const pagina = codigo('app', 'admin', 'page.tsx');
  const inicio = pagina.indexOf('function ValorDoPedido(');
  assert.notEqual(inicio, -1);
  const valor = pagina.slice(inicio, pagina.indexOf('\nfunction ', inicio + 1));
  assert.match(valor, /const \{ forma, provedor \} = formaEProvedorNoPainel\(p\);/);
  // a forma, com o país do cartão, como antes; embaixo, quem cobrou, só quando ela não repete a forma
  assert.match(
    valor,
    /<p className="text-small text-tinta-suave">\s+\{forma\}\s+\{g\.cartaoPais \? ` · cartão \$\{g\.cartaoPais\}` : ''\}\s+<\/p>\s+\{provedor && <p className="text-small text-tinta-suave">\{provedor\}<\/p>\}/,
  );
  // a tabela e a conta de antes saíram da página: uma regra só, testada aqui
  assert.doesNotMatch(pagina, /\bPROVEDOR\[|const PROVEDOR\b|cartaoBandeira/);
  // o pedido em aberto continua com os dois preços, sem as duas linhas
  const emAberto = valor.slice(0, valor.indexOf('const devolucao = devolucaoNoPainel(p);'));
  assert.doesNotMatch(emAberto, /formaEProvedorNoPainel|\{provedor\}/);
});
