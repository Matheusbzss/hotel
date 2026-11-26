import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { eventoDoItemReembolsado } from '../src/app/api/webhooks/stripe/eventos.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import {
  ACOES_MANUAIS_DO_PAINEL,
  BUSCA_DO_PAINEL_MAXIMO,
  EM_ABERTO,
  ERROS_DO_PAINEL,
  ESPERA_PARA_COMPLETAR_O_VOUCHER_MS,
  ROTULO_DO_PROVEDOR,
  acaoManualOferecida,
  acaoManualRepetida,
  agruparPedidos,
  buscaDoPainel,
  formaEProvedorNoPainel,
  marcaOVoucherPorFora,
  naoPagoNoPainel,
  provedorDaReserva,
  voltaAoPainel,
  voucherDaStripeAindaLiga,
  type PedidoPainel,
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
import type { MetodoPagamento, Provedor, Reserva, ReservaPasseio, StatusItem, StatusReserva } from '../src/lib/reservas.ts';

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
  // "Marcar reembolsado" num pago, ou num cancelado depois de pago (os dois têm o botão), muda. O do WhatsApp cancelado
  // antes de pagar não tem o botão desde o Pacote 18, e a rota o recusa antes desta regra (tests/painel-avisos.test.ts)
  assert.equal(acaoManualRepetida(pedido('pago', 'pix'), ACOES.reembolsado), false);
  assert.equal(acaoManualRepetida(pedido('cancelado', 'pix'), ACOES.reembolsado), false);
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
  // o status, o provedor do WhatsApp, a forma, a hora do pagamento e a linha. Desde o Pacote 19 (reteste de 22/11), entre
  // a repetida e a gravação, a ação que o painel não oferece naquele status também devolve null (os testes da seção 1b).
  // Desde o Pacote 29 (revisão), o cancelamento do pedido que já estava vencido grava a linha com o final " (já estava
  // vencido)" (linhaDoCancelamento, com o status de antes): o e-mail "Pedido cancelado" não sai para ele. Desde o Pacote 33
  // (D2), depois da ação fora de hora, a que passou a pedir a caixa "Confirmo" com o pedido relido (o pedido que virou pago
  // numa outra aba) e veio sem ela também devolve null, sem gravar nada
  assert.match(
    MANUAIS,
    /const atualizada = await atualizarReserva\(alvo\.codigo, \(r\) => \{\s+virouPago = manual\.status === 'pago' && r\.status !== 'pago';\s+virouCancelado = manual\.status === 'cancelado' && r\.status !== 'cancelado';\s+foraDeHora = false;\s+semConfirmar = false;\s+if \(acaoManualRepetida\(r, manual\)\) return null;\s+if \(!daStripe && !acaoManualOferecida\(r, acao\)\) \{\s+foraDeHora = true;\s+virouPago = false;\s+virouCancelado = false;\s+return null;\s+\}\s+if \(acaoManualPedeConfirmacao\(r, acao\) && !confirmou\) \{\s+semConfirmar = true;\s+virouPago = false;\s+virouCancelado = false;\s+return null;\s+\}\s+const statusAntes = r\.status;\s+r\.status = manual\.status;\s+if \(provedorDaReserva\(r\) === 'whatsapp'\) r\.provedor = 'whatsapp';\s+if \(manual\.metodo\) r\.pagamento\.metodo = manual\.metodo;\s+if \(manual\.status === 'pago' && !r\.pagamento\.pagoEm\) r\.pagamento\.pagoEm = new Date\(\)\.toISOString\(\);\s+return registrar\(r, manual\.status === 'cancelado' \? linhaDoCancelamento\(manual\.evento, statusAntes\) : manual\.evento\);\s+\}\);/,
  );
  // o aviso de compra e o e-mail só quando virou pago (a repetida já é pago: virouPago false), e a volta de sempre; a ação
  // fora de hora volta antes dos dois, com o erro. Desde o Pacote 28, junto com o e-mail, o aviso do pedido pago à equipe,
  // e o e-mail do pedido cancelado só quando virou cancelado (a repetida e a fora de hora não). Desde o Pacote 33 (D2), a
  // que veio sem a caixa volta com falta-confirmar, também antes dos dois
  assert.match(
    MANUAIS,
    /if \(foraDeHora\) return voltar\('acao-nao-vale'\);\s+if \(semConfirmar\) return voltar\('falta-confirmar'\);\s+if \(virouPago && atualizada\) \{\s+await avisarCompra\(atualizada\);\s+agendarEmailDoPedido\('pagamento-aprovado', codigoDoPedido\);\s+agendarAvisoDoPedidoPago\(codigoDoPedido\);\s+\}\s+if \(virouCancelado && atualizada\) agendarEmailDoCancelamento\(codigoDoPedido\);\s+return voltar\(\);\s+\}\s*$/,
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
/* 1b. As ações manuais pelo status de partida (Pacote 19, reteste de 22/11) */

// O conferente do painel, no ON-ZELYQN: uma aba do painel aberta às 20:32:25 (ainda com "Pago no Pix"), o pedido cancelado
// às 20:32:27 e o toque em "Pago no Pix" na aba antiga às 20:52:36. A rota voltou sem erro, o pedido cancelado virou "Pago"
// e o e-mail do pagamento aprovado, com o voucher, foi agendado. A rota só conferia se a ação era repetida; de qual status
// o pedido partia, só a tela sabia. Agora uma regra só (acaoManualOferecida) monta os botões da página e é conferida de novo
// pela rota, dentro da trava de versão, depois da repetida.

const PAGO_EM = '2026-11-22T23:20:00.000Z';
const AGORA = '2026-11-22T23:52:36.000Z';

/** Os nove estados de partida de um pedido do WhatsApp (1 item), como o painel os grava. */
const ESTADOS = {
  'aguardando o WhatsApp': {},
  pendente: { status: 'pendente' },
  expirado: { status: 'expirado' },
  recusado: { status: 'recusado' },
  'pago no Pix': {
    status: 'pago',
    pagamento: { metodo: 'pix', pagoEm: PAGO_EM },
    historico: historico('Reserva criada', 'Marcada como paga no Pix, no admin'),
  },
  'pago no cartão': {
    status: 'pago',
    pagamento: { metodo: 'cartao', pagoEm: PAGO_EM },
    historico: historico('Reserva criada', 'Marcada como paga no cartão, no admin'),
  },
  // o ON-ZELYQN: cancelado no painel antes de qualquer pagamento
  'cancelado nunca pago': { status: 'cancelado', historico: historico('Reserva criada', 'Cancelada no admin') },
  'cancelado depois de pago': {
    status: 'cancelado',
    pagamento: { metodo: 'pix', pagoEm: PAGO_EM },
    historico: historico('Reserva criada', 'Marcada como paga no Pix, no admin', 'Cancelada no admin'),
  },
  reembolsado: {
    status: 'reembolsado',
    pagamento: { metodo: 'pix', pagoEm: PAGO_EM },
    historico: historico('Reserva criada', 'Marcada como paga no Pix, no admin', 'Marcada como reembolsada no admin (fora da Stripe)'),
  },
} satisfies Record<string, Partial<ReservaPasseio>>;
type Estado = keyof typeof ESTADOS;

/** O que a trava faz com a ação: grava, não grava porque já está feito (a volta de sempre), ou recusa (acao-nao-vale). */
type NaTrava = 'grava' | 'repetida' | 'nao-vale';
const G = 'grava';
const R = 'repetida';
const N = 'nao-vale';

/**
 * A tabela inteira: cada estado de partida por cada ação, na ordem pago_pix, pago_cartao, marcar_pago, cancelar,
 * reembolsado. Grava só o que o painel oferece naquele estado; o que ele não oferece é recusado, menos o que já está feito
 * (a repetida continua voltando como a que deu certo).
 */
const TABELA: Record<Estado, [NaTrava, NaTrava, NaTrava, NaTrava, NaTrava]> = {
  // em aberto: "Pago no Pix", "Pago no cartão" e "Cancelar"
  'aguardando o WhatsApp': [G, G, N, G, N],
  pendente: [G, G, N, G, N],
  expirado: [G, G, N, G, N],
  recusado: [G, G, N, G, N],
  // pago: "Corrigir" só para a outra forma, "Cancelar" e "Marcar reembolsado"; a mesma forma e o "Marcar como pago" já estão feitos
  'pago no Pix': [R, G, R, G, G],
  'pago no cartão': [G, R, R, G, G],
  // cancelado antes de pagar: nenhum botão. O "Pago no Pix" da aba antiga era o defeito
  'cancelado nunca pago': [N, N, N, R, N],
  // pago e depois cancelado: só "Marcar reembolsado"
  'cancelado depois de pago': [N, N, N, R, G],
  // reembolsado: nenhum botão ("Cancelar" num reembolsado gravava "Cancelada no admin")
  reembolsado: [N, N, N, N, R],
};
const ORDEM = ['pago_pix', 'pago_cartao', 'marcar_pago', 'cancelar', 'reembolsado'] as const;

/**
 * O que a trava das ações manuais da rota faz com o pedido relido, na mesma sequência do código dela (o teste de leitura
 * de cima confere a sequência letra por letra): o virouPago, a repetida, a ação fora de hora (só fora da Stripe) e a
 * gravação de sempre. `comARegra: false` é a trava de antes do Pacote 19, só com a repetida.
 */
function naTrava(pedido: Reserva, nome: string, comARegra = true) {
  const manual = ACOES[nome];
  const r = structuredClone(pedido);
  const daStripe = provedorDaReserva(pedido) === 'stripe';
  const virouPago = manual.status === 'pago' && r.status !== 'pago';
  if (acaoManualRepetida(r, manual)) return { resultado: R, gravado: null, virouPago } as const;
  if (comARegra && !daStripe && !acaoManualOferecida(r, nome)) return { resultado: N, gravado: null, virouPago: false } as const;
  r.status = manual.status;
  if (provedorDaReserva(r) === 'whatsapp') r.provedor = 'whatsapp';
  if (manual.metodo) r.pagamento.metodo = manual.metodo;
  if (manual.status === 'pago' && !r.pagamento.pagoEm) r.pagamento.pagoEm = AGORA;
  r.historico = [...r.historico, { em: AGORA, evento: manual.evento }];
  return { resultado: G, gravado: r, virouPago } as const;
}

test('as ações manuais do painel são as da rota, na ordem dos botões', () => {
  assert.deepEqual([...ACOES_MANUAIS_DO_PAINEL], [...ORDEM]);
  assert.deepEqual([...ACOES_MANUAIS_DO_PAINEL].sort(), Object.keys(ACOES).sort());
  assert.deepEqual(EM_ABERTO, ['aguardando_whatsapp', 'pendente', 'expirado', 'recusado']);
  // uma ação que a lista não conhece nunca é oferecida, em estado nenhum (as outras ações do painel têm as conferências delas)
  for (const estado of Object.keys(ESTADOS) as Estado[])
    for (const outra of ['', 'reembolsar', 'reembolsar_item', 'desistencia_respondida', 'devolvido_por_fora', 'PAGO_PIX', 'constructor'])
      assert.equal(acaoManualOferecida(voucher(ESTADOS[estado]), outra), false, `${estado} ${outra}`);
});

test('a tabela inteira das ações manuais: o que o painel não oferece é recusado e não grava nada; o que ele oferece grava como antes', () => {
  for (const estado of Object.keys(ESTADOS) as Estado[]) {
    const pedido = voucher(ESTADOS[estado]);
    ORDEM.forEach((nome, n) => {
      const caso = `${estado} + ${nome}`;
      const esperado = TABELA[estado][n];
      const { resultado, gravado, virouPago } = naTrava(pedido, nome);
      assert.equal(resultado, esperado, caso);
      // a regra dos botões diz o mesmo: o painel oferece exatamente o que a trava grava
      assert.equal(acaoManualOferecida(pedido, nome), esperado === G, `${caso}: o botão`);
      if (gravado === null) {
        // nada gravado (o pedido lido fica como estava) e nenhum aviso de compra nem e-mail: nem na recusa, nem na repetida
        assert.equal(virouPago, false, caso);
        return;
      }
      // o que o painel oferece grava como sempre: o status da ação, a linha uma vez, a forma quando a ação a diz
      const acao = ACOES[nome];
      assert.equal(gravado.status, acao.status, caso);
      assert.deepEqual(
        gravado.historico.map((h) => h.evento),
        [...pedido.historico.map((h) => h.evento), acao.evento],
        caso,
      );
      assert.equal(gravado.pagamento.metodo, acao.metodo ?? pedido.pagamento.metodo, caso);
      assert.equal(gravado.provedor, 'whatsapp', caso);
      // a hora do pagamento: gravada quando vira pago, e a de antes fica (corrigir a forma, cancelar, reembolsar)
      assert.equal(gravado.pagamento.pagoEm, pedido.pagamento.pagoEm ?? (acao.status === 'pago' ? AGORA : undefined), caso);
      // o aviso de compra e o e-mail com o voucher só quando o pedido vira pago agora (nunca ao corrigir a forma)
      assert.equal(virouPago, acao.status === 'pago' && pedido.status !== 'pago', caso);
    });
  }
  // o ON-ZELYQN: cancelado, e o "Pago no Pix" (ou "no cartão") da aba antiga. Antes: virava pago e o e-mail saía
  const cancelado = voucher(ESTADOS['cancelado nunca pago']);
  for (const nome of ['pago_pix', 'pago_cartao'] as const) {
    assert.deepEqual(naTrava(cancelado, nome), { resultado: N, gravado: null, virouPago: false }, nome);
    const antes = naTrava(cancelado, nome, false);
    assert.equal(antes.gravado?.status, 'pago', `antes, ${nome}`);
    assert.equal(antes.virouPago, true, `antes, ${nome}`);
  }
  // os outros sentidos que o crítico leu no código: "Pago no Pix" num reembolsado e "Cancelar" num reembolsado
  const reembolsado = voucher(ESTADOS.reembolsado);
  for (const nome of ['pago_pix', 'pago_cartao', 'marcar_pago', 'cancelar'] as const) {
    assert.equal(naTrava(reembolsado, nome).resultado, N, nome);
    assert.equal(naTrava(reembolsado, nome, false).resultado, G, `antes, ${nome}`);
  }
});

test('só muda o que o painel já não oferecia: fora das recusas, a trava faz exatamente o de antes, e a repetida continua igual', () => {
  let recusas = 0;
  let repetidas = 0;
  for (const estado of Object.keys(ESTADOS) as Estado[]) {
    const pedido = voucher(ESTADOS[estado]);
    for (const nome of ORDEM) {
      const agora = naTrava(pedido, nome);
      const antes = naTrava(pedido, nome, false);
      if (agora.resultado === N) {
        recusas++;
        // toda recusa é de um botão que a página não mostra naquele estado; antes, a trava gravava (só o "Marcar
        // reembolsado" do pedido nunca pago já era barrado antes dela, desde o Pacote 18)
        assert.equal(acaoManualOferecida(pedido, nome), false, `${estado} + ${nome}`);
        assert.equal(antes.resultado, G, `${estado} + ${nome}`);
      } else {
        // o que não é recusa sai igual a antes, letra por letra (a gravação, a repetida e o virouPago)
        assert.deepEqual(agora, antes, `${estado} + ${nome}`);
      }
      if (agora.resultado === R) {
        repetidas++;
        // a repetida vem antes da regra: volta como a que deu certo, mesmo onde o painel não mostra mais o botão
        assert.equal(acaoManualRepetida(pedido, ACOES[nome]), true, `${estado} + ${nome}`);
        assert.equal(acaoManualOferecida(pedido, nome), false, `${estado} + ${nome}`);
      }
    }
  }
  // as contas da tabela: 9 estados por 5 ações; 19 recusas, 7 repetidas e 19 gravações
  assert.equal(Object.keys(ESTADOS).length * ORDEM.length, 45);
  assert.deepEqual([recusas, repetidas], [19, 7]);
});

/** Um pedido do painel com um voucher só, montado de qualquer combinação (também as que não existem de verdade). */
const pedidoDe = (parcial: Partial<ReservaPasseio>): PedidoPainel => agruparPedidos([voucher(parcial)])[0];

/**
 * Os botões das ações manuais como a página do painel os montava até o Pacote 18 (o Acoes de src/app/admin/page.tsx no
 * commit 54a4536), copiados de lá sem os rótulos: é com eles que a regra nova tem de bater, botão por botão.
 */
function botoesDeAntes(p: PedidoPainel): string[] {
  const r = p.itens[0];
  const stripe = p.provedor === 'stripe';
  const acoes: string[] = [];
  if ((['aguardando_whatsapp', 'pendente', 'expirado', 'recusado'] as StatusReserva[]).includes(p.status)) {
    if (p.metodo === 'whatsapp') acoes.push('pago_pix', 'pago_cartao');
    else if (!stripe) acoes.push('marcar_pago');
  }
  if (p.status === 'pago' && !stripe && !r.pagamento.pedidoId) {
    if (p.metodo !== 'pix') acoes.push('pago_pix');
    if (p.metodo !== 'cartao') acoes.push('pago_cartao');
  }
  const pagoNaStripe = stripe && (p.status === 'pago' || p.status === 'contestado');
  if (p.status !== 'cancelado' && p.status !== 'reembolsado' && !pagoNaStripe) acoes.push('cancelar');
  if (!stripe && (p.status === 'pago' || p.status === 'cancelado') && !naoPagoNoPainel(p)) acoes.push('reembolsado');
  return acoes;
}

const TODOS_OS_STATUS: StatusReserva[] = [
  'pendente',
  'pago',
  'recusado',
  'cancelado',
  'expirado',
  'aguardando_whatsapp',
  'reembolsado',
  'contestado',
];

test('nenhum botão aparece nem some: a regra dá os botões de antes em toda combinação de status, forma, quem cobrou e histórico', () => {
  let combinacoes = 0;
  for (const status of TODOS_OS_STATUS)
    for (const metodo of ['whatsapp', 'pix', 'cartao'] as const)
      for (const provedor of [undefined, 'whatsapp', 'pagarme', 'stripe'] as (Provedor | undefined)[])
        for (const pedidoId of [undefined, 'or_antigo'])
          for (const pagoEm of [undefined, PAGO_EM])
            for (const linhaDePago of [false, true]) {
              const p = pedidoDe({
                status,
                provedor,
                pagamento: { metodo, ...(pedidoId ? { pedidoId } : {}), ...(pagoEm ? { pagoEm } : {}) },
                historico: historico('Reserva criada', ...(linhaDePago ? ['Marcada como paga no admin'] : [])),
              });
              const caso = `${status} ${metodo} ${provedor} ${pedidoId} ${pagoEm} ${linhaDePago}`;
              assert.deepEqual(
                ACOES_MANUAIS_DO_PAINEL.filter((acao) => acaoManualOferecida(p.itens[0], acao)),
                botoesDeAntes(p),
                caso,
              );
              combinacoes++;
            }
  assert.equal(combinacoes, 8 * 3 * 4 * 2 * 2 * 2);
  // os rótulos de antes, um por um, nos estados da tabela (o que a página escreve em cada botão não mudou)
  const botoes = (estado: Estado) => ACOES_MANUAIS_DO_PAINEL.filter((acao) => acaoManualOferecida(voucher(ESTADOS[estado]), acao));
  assert.deepEqual(botoes('aguardando o WhatsApp'), ['pago_pix', 'pago_cartao', 'cancelar']);
  assert.deepEqual(botoes('pago no Pix'), ['pago_cartao', 'cancelar', 'reembolsado']);
  assert.deepEqual(botoes('pago no cartão'), ['pago_pix', 'cancelar', 'reembolsado']);
  assert.deepEqual(botoes('cancelado nunca pago'), []);
  assert.deepEqual(botoes('cancelado depois de pago'), ['reembolsado']);
  assert.deepEqual(botoes('reembolsado'), []);
  // o checkout antigo (com o id do pedido de lá): "Marcar como pago" em aberto; pago, nenhum "Corrigir"
  const antigo = (status: StatusReserva) =>
    ACOES_MANUAIS_DO_PAINEL.filter((acao) =>
      acaoManualOferecida(
        voucher({
          status,
          provedor: undefined,
          pagamento: { metodo: 'pix', pedidoId: 'or_antigo', ...(status === 'pago' ? { pagoEm: PAGO_EM } : {}) },
        }),
        acao,
      ),
    );
  assert.deepEqual(antigo('pendente'), ['marcar_pago', 'cancelar']);
  assert.deepEqual(antigo('pago'), ['cancelar', 'reembolsado']);
});

test('no pedido da Stripe a regra dá só o "Cancelar" de sempre, e a rota continua com as conferências dela, sem a regra', () => {
  // os botões: nunca marcar pago, corrigir nem "Marcar reembolsado"; "Cancelar" só enquanto ninguém pagou
  for (const status of TODOS_OS_STATUS)
    for (const metodo of ['pix', 'cartao'] as const) {
      const r = voucher({
        status,
        provedor: 'stripe',
        paymentIntentId: 'pi_1',
        pagamento: { metodo, ...(status === 'pago' ? { pagoEm: PAGO_EM } : {}) },
      });
      const semCancelar = status === 'pago' || status === 'contestado' || status === 'cancelado' || status === 'reembolsado';
      assert.deepEqual(
        ACOES_MANUAIS_DO_PAINEL.filter((acao) => acaoManualOferecida(r, acao)),
        semCancelar ? [] : ['cancelar'],
        `${status} ${metodo}`,
      );
      // e a trava não aplica a regra ao pedido da Stripe: o que chega até ela faz o de antes
      for (const nome of ORDEM) assert.deepEqual(naTrava(r, nome), naTrava(r, nome, false), `${status} ${metodo} ${nome}`);
    }
  // a rota: as três conferências do pedido da Stripe ficam como eram, antes da trava (marcar pago recusado, cancelar pela
  // sessão, "reembolsado" só de onde a Stripe deixa), e a regra dos botões só entra fora da Stripe. Desde a reserva das
  // casas (26/11), o cancelamento de um pedido com casa refaz o calendário das páginas das casas, depois do e-mail agendado
  assert.match(
    MANUAIS,
    /if \(daStripe\) \{\s+if \(manual\.status === 'pago'\) return voltar\('so-pelo-aviso'\);\s+if \(manual\.status === 'cancelado'\) \{\s+const r = await cancelarPedidoAberto\(codigoDoPedido, 'Cancelado no admin'\);\s+if \(r && r\.status !== 'cancelado'\) return voltar\('ja-pago'\);\s+if \(r\) agendarEmailDoCancelamento\(codigoDoPedido\);\s+if \(r && vouchers\.some\(ehCasa\)\) calendarioMudou\(\);\s+return voltar\(\);\s+\}\s+if \(!podeMudar\(alvo\.status, manual\.status\)\) return voltar\('acao-nao-vale'\);\s+\}/,
  );
  assert.match(
    MANUAIS,
    /if \(!daStripe && manual\.status === 'reembolsado' && pedidoNuncaPago\(alvo\)\) return voltar\('acao-nao-vale'\);/,
  );
  assert.match(MANUAIS, /if \(!daStripe && !acaoManualOferecida\(r, acao\)\) \{/);
  assert.match(ROTA, /const daStripe = provedorDaReserva\(alvo\) === 'stripe';/);
});

test('a página e a rota chamam a mesma regra: os botões do Acoes e a conferência dentro da trava', () => {
  const pagina = codigo('app', 'admin', 'page.tsx');
  const inicio = pagina.indexOf('function Acoes(');
  assert.notEqual(inicio, -1);
  const acoes = pagina.slice(inicio, pagina.indexOf('\nfunction ', inicio + 1));
  // a página: os botões das ações manuais nascem só da regra, com o voucher que representa o pedido
  assert.match(acoes, /const r = p\.itens\[0\];/);
  assert.match(acoes, /ACOES_MANUAIS_DO_PAINEL\.filter\(\(acao\) => acaoManualOferecida\(r, acao\)\)\.map\(/);
  assert.equal(pagina.match(/acaoManualOferecida\(/g)?.length, 1);
  // nenhuma conta de status, de forma ou de quem cobrou sobrou no Acoes para decidir esses botões
  assert.doesNotMatch(acoes, /EM_ABERTO|p\.metodo|p\.provedor|naoPagoNoPainel|pedidoId|pagoNaStripe/);
  assert.doesNotMatch(acoes, /acoes\.push\(\{ acao: '(?:pago_pix|pago_cartao|marcar_pago|cancelar|reembolsado)'/);
  // os rótulos de sempre, um por ação; no pago, os dois da forma são os "Corrigir"
  assert.match(acoes, /const corrigir = p\.status === 'pago';/);
  assert.match(
    acoes,
    /pago_pix: corrigir \? 'Corrigir: foi no Pix' : `Pago no Pix \(\$\{formatarPreco\(p\.totalPixCentavos \?\? p\.totalCentavos\)\}\)`,/,
  );
  assert.match(acoes, /pago_cartao: corrigir \? 'Corrigir: foi no cartão' : `Pago no cartão \(\$\{formatarPreco\(p\.totalCentavos\)\}\)`,/);
  assert.match(acoes, /marcar_pago: 'Marcar como pago',\s+cancelar: 'Cancelar',\s+reembolsado: 'Marcar reembolsado',/);
  // a lista dos status em aberto mora na regra: a página a importa (o valor do pedido em aberto continua a usá-la; desde a
  // reserva das casas, 26/11, com o preço no Pix do que o pedido cobra hoje: no pedido sem casa, o total de sempre)
  assert.doesNotMatch(pagina, /const EM_ABERTO\b/);
  assert.match(pagina, /const precoPix = cobrar \? cobrar\.pix : p\.totalPixCentavos;/);
  assert.match(pagina, /if \(EM_ABERTO\.includes\(p\.status\) && precoPix !== undefined\) \{/);
  // a rota: a mesma chamada, uma vez, dentro da trava (com o pedido relido, `r`) e depois da repetida
  assert.equal(ROTA.match(/acaoManualOferecida\(/g)?.length, 1);
  const trava = MANUAIS.slice(MANUAIS.indexOf('await atualizarReserva(alvo.codigo, (r) => {'));
  const repetida = trava.indexOf('if (acaoManualRepetida(r, manual)) return null;');
  const regra = trava.indexOf('acaoManualOferecida(r, acao)');
  const grava = trava.indexOf('r.status = manual.status;');
  assert.ok(repetida !== -1 && repetida < regra && regra < grava, `${repetida} ${regra} ${grava}`);
  // as duas importam a regra do mesmo arquivo
  for (const fonte of [pagina, ROTA]) assert.match(fonte, /^import \{[^}]*\bacaoManualOferecida\b[^}]*\} from '@\/lib\/pedidos-painel';$/m);
  assert.match(codigo('lib', 'pedidos-painel.ts'), /^export function acaoManualOferecida\(/m);
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
    /await atualizarReserva\(voucher, \(r\) => \{\s+if \(!voucherDaStripeAindaLiga\(r, id\)\) return null;\s+r\.statusItem = 'reembolsado';\s+return registrar\(r, linhaDoVoucherLigado\(id, voucher\)\);\s+\}\);\s+agendarEmailDoReembolso\(codigoDoPedido, id\);\s+return voltar\(\);/,
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

/* ------------------------------------------------------------------ */
/* 6. A volta ao painel guarda a busca (Pacote 19, reteste de 22/11)    */

// A equipe busca um pedido, toca num botão ("Pago no Pix", "Cancelar", um reembolso) e a rota voltava para /admin só com
// o filtro de status: o painel desenhava a lista inteira (uns 420 cartões na bancada) e era preciso buscar de novo para
// ver o resultado. Agora o botão manda a busca num campo escondido e a volta a devolve, com sucesso ou com erro.

const BASE = 'https://orlanativa.online/api/admin/reservas/ON-WAP234';

test('a volta ao painel leva a busca: com e sem erro, com e sem o filtro de status, sempre para /admin no mesmo site', () => {
  const partes = (volta: Parameters<typeof voltaAoPainel>[1]) => {
    const endereco = voltaAoPainel(BASE, volta);
    assert.equal(endereco.origin, 'https://orlanativa.online');
    assert.equal(endereco.pathname, '/admin');
    assert.equal(endereco.hash, '');
    return endereco.search;
  };
  // como antes: sem nada, com o filtro, com o erro, com os dois
  assert.equal(partes({}), '');
  assert.equal(partes({ filtro: 'pagas' }), '?status=pagas');
  assert.equal(partes({ erro: 'acao-nao-vale' }), '?erro=acao-nao-vale');
  assert.equal(partes({ filtro: 'pagas', erro: 'acao-nao-vale' }), '?status=pagas&erro=acao-nao-vale');
  assert.equal(partes({ filtro: '', busca: '', erro: undefined }), '');
  // a busca volta sozinha, com o erro, com o filtro e com os três
  assert.equal(partes({ busca: 'on-zelyqn' }), '?q=on-zelyqn');
  assert.equal(partes({ busca: 'on-zelyqn', erro: 'acao-nao-vale' }), '?q=on-zelyqn&erro=acao-nao-vale');
  assert.equal(partes({ filtro: 'outras', busca: 'on-zelyqn' }), '?status=outras&q=on-zelyqn');
  assert.equal(partes({ filtro: 'outras', busca: 'on-zelyqn', erro: 'acao-nao-vale' }), '?status=outras&q=on-zelyqn&erro=acao-nao-vale');
  // qualquer código de erro do painel, junto da busca
  for (const erro of Object.keys(ERROS_DO_PAINEL) as (keyof typeof ERROS_DO_PAINEL)[]) {
    const volta = voltaAoPainel(BASE, { filtro: 'reembolsos', busca: 'maria', erro });
    assert.deepEqual(
      [...volta.searchParams],
      [
        ['status', 'reembolsos'],
        ['q', 'maria'],
        ['erro', erro],
      ],
      erro,
    );
  }
  // a base pode ser o endereço da requisição como texto ou como URL; em http://localhost também
  assert.equal(voltaAoPainel(new URL(BASE), { busca: 'ana' }).href, 'https://orlanativa.online/admin?q=ana');
  assert.equal(
    voltaAoPainel('http://localhost:3401/api/admin/reservas/ON-WAP234', { busca: 'ana' }).href,
    'http://localhost:3401/admin?q=ana',
  );
});

test('a busca com "&", "#", espaços e acentos volta inteira, sem virar outro parâmetro nem outro endereço', () => {
  const buscas = [
    'joão & maria',
    'pousada #2',
    'escuna búzios 09h',
    'a=1&erro=nao-encontrado&status=pagas',
    'maria+josé@exemplo.com',
    '+55 21 90000-0000',
    '100% açaí?',
    'https://outro.exemplo/admin',
    '//outro.exemplo',
    '../../api',
    '"aspas" <b>e</b> \\ barra',
  ];
  const extras: { filtro?: string; erro?: 'acao-nao-vale' }[] = [
    {},
    { erro: 'acao-nao-vale' },
    { filtro: 'abertas' },
    { filtro: 'abertas', erro: 'acao-nao-vale' },
  ];
  for (const busca of buscas) {
    for (const extra of extras) {
      const volta = voltaAoPainel(BASE, { busca, ...extra });
      // relida do endereço (como a página do painel lê), a busca é a mesma, letra por letra
      const relido = new URL(volta.href);
      assert.equal(relido.searchParams.get('q'), busca, busca);
      // e só os parâmetros que a rota pôs: a busca não inventa filtro, erro nem âncora
      const chaves = [...(extra.filtro ? ['status'] : []), 'q', ...(extra.erro ? ['erro'] : [])];
      assert.deepEqual([...relido.searchParams.keys()], chaves, busca);
      assert.equal(relido.searchParams.get('erro'), extra.erro ?? null, busca);
      assert.equal(relido.searchParams.get('status'), extra.filtro ?? null, busca);
      assert.equal(relido.hash, '', busca);
      assert.equal(relido.origin, 'https://orlanativa.online', busca);
      assert.equal(relido.pathname, '/admin', busca);
    }
  }
  // escrita pelo URLSearchParams: o "&" e o "#" da busca vão codificados, nunca crus no endereço
  const href = voltaAoPainel(BASE, { busca: 'joão & maria #2' }).href;
  assert.equal(href, 'https://orlanativa.online/admin?q=jo%C3%A3o+%26+maria+%232');
});

test('a busca é aparada e cortada no máximo que a caixa aceita; o que não é texto não é busca', () => {
  assert.equal(BUSCA_DO_PAINEL_MAXIMO, 160);
  assert.equal(buscaDoPainel('  maria  '), 'maria');
  assert.equal(buscaDoPainel('\n\tON-ZELYQN \n'), 'ON-ZELYQN');
  assert.equal(buscaDoPainel('escuna  búzios'), 'escuna  búzios');
  // só espaços, vazia, ausente ou outra coisa (um arquivo num formulário montado à mão): busca nenhuma
  for (const nada of ['', '   ', null, undefined, 12, ['maria'], { name: 'arquivo.txt' }])
    assert.equal(buscaDoPainel(nada), '', String(nada));
  // comprida demais: cortada no máximo (depois de aparada), e a volta leva só o pedaço
  const comprida = `  ${'a'.repeat(100)}${'b'.repeat(100)}${'c'.repeat(300)}  `;
  assert.equal(buscaDoPainel(comprida), `${'a'.repeat(100)}${'b'.repeat(60)}`);
  assert.equal(buscaDoPainel(comprida).length, BUSCA_DO_PAINEL_MAXIMO);
  const volta = voltaAoPainel(BASE, { filtro: 'pagas', busca: comprida, erro: 'acao-nao-vale' });
  assert.equal(volta.searchParams.get('q'), `${'a'.repeat(100)}${'b'.repeat(60)}`);
  assert.equal(volta.searchParams.get('status'), 'pagas');
  assert.equal(volta.searchParams.get('erro'), 'acao-nao-vale');
  // no limite cravado, inteira; só espaços não criam o parâmetro
  assert.equal(voltaAoPainel(BASE, { busca: 'x'.repeat(160) }).searchParams.get('q'), 'x'.repeat(160));
  assert.equal(voltaAoPainel(BASE, { busca: '   ' }).search, '');
  // o maior campo que a busca compara (o e-mail do pedido, até 160 letras) cabe inteiro
  assert.match(codigo('app', 'api', 'pedido', 'route.ts'), /email: texto\(160\),/);
});

test('o botão do painel manda a busca num campo escondido, e a rota a devolve em toda volta (sucesso e erro)', () => {
  const pagina = codigo('app', 'admin', 'page.tsx');
  // a página lê a busca pela mesma regra da rota e a mostra na caixa, que não aceita mais que o máximo
  assert.match(pagina, /const busca = buscaDoPainel\(q\.q\)\.toLowerCase\(\);/);
  assert.match(pagina, /<input\s+id="q"\s+name="q"\s+defaultValue=\{busca\}\s+maxLength=\{BUSCA_DO_PAINEL_MAXIMO\}/);
  // o botão: o campo escondido "q" ao lado do "filtro", só quando há busca
  const inicio = pagina.indexOf('function BotaoAcao(');
  assert.notEqual(inicio, -1);
  const botao = pagina.slice(inicio, pagina.indexOf('\nfunction ', inicio + 1));
  assert.match(
    botao,
    /<input type="hidden" name="filtro" value=\{filtro\} \/>\s+\{busca && <input type="hidden" name="q" value=\{busca\} \/>\}/,
  );
  // todo botão do painel leva a busca, e ela desce da página até ele por todos os componentes do pedido
  const botoes = [...pagina.matchAll(/<BotaoAcao\b[^>]*?\/>/g)].map((m) => m[0]);
  // 7 + 1 do Pacote 22 (os dois botões do pagamento parado de um pedido cancelado, num BotaoAcao só, de uma lista), menos
  // os 2 do reembolso pela Stripe, que desde o Pacote 33 ficam na tela de resumo (o cartão leva a ela, com o filtro e a busca)
  assert.equal(botoes.length, 6);
  for (const b of botoes) assert.match(b, /\sfiltro=\{filtro\}\s+busca=\{busca\}/, b);
  assert.match(pagina, /href=\{enderecoDoResumo\(p\.codigo, \{ acao: 'reembolsar' \}, \{ filtro, busca \}\)\}/);
  // a tela de resumo manda o filtro e a busca nos mesmos campos escondidos dos botões do painel
  const tela = codigo('app', 'admin', 'resumo', '[codigo]', 'page.tsx');
  assert.match(
    tela,
    /<input type="hidden" name="acao" value=\{f\.acao\} \/>\s+<input type="hidden" name="filtro" value=\{volta\.filtro \?\? ''\} \/>\s+\{volta\.busca && <input type="hidden" name="q" value=\{volta\.busca\} \/>\}/,
  );
  assert.match(tela, /const volta: VoltaDoPainel = \{ filtro: filtroDoPainel\(q\.status\), busca: buscaDoPainel\(q\.q\) \};/);
  for (const componente of ['Acoes', 'ReembolsoStripe', 'ReembolsoQueFalhou', 'ReembolsoSemVoucherNoPainel'])
    assert.match(pagina, new RegExp(`<${componente} p=\\{p\\} filtro=\\{filtro\\} busca=\\{busca\\}`), componente);
  assert.match(pagina, /<CartaoPedido key=\{p\.codigo\} p=\{p\} filtro=\{filtro\.valor\} busca=\{busca\} \/>/);
  // a rota: a busca do campo escondido, pela regra, e a volta única (voltar) com o filtro, a busca e o erro
  assert.match(ROTA, /const busca = buscaDoPainel\(form\.get\('q'\)\);/);
  assert.match(
    ROTA,
    /const voltar = \(erro\?: ErroDoPainel\) =>\s+NextResponse\.redirect\(voltaAoPainel\(req\.url, \{ filtro: filtro \? String\(filtro\) : undefined, busca, erro \}\), 303\);/,
  );
  // nenhum endereço montado à mão na rota: toda resposta dela é o voltar (fora a falta de login, de pedidoRecusado)
  assert.doesNotMatch(ROTA, /new URL\(|searchParams|\/admin\?|`\/admin/);
  assert.equal(ROTA.match(/NextResponse\./g)?.length, 1);
  assert.ok((ROTA.match(/return voltar\(/g)?.length ?? 0) >= 30);
});
