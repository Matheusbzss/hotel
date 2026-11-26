import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pagamentoParaDevolver } from '../src/app/api/webhooks/stripe/eventos.ts';
import { IDIOMAS, fmt, type Idioma } from '../src/i18n/config.ts';
import { dicionario } from '../src/i18n/index.ts';
import {
  ACOES_SEM_REEMBOLSO,
  CIENTE_DOS_SETE_DIAS,
  INICIO_DA_TRAVA_DOS_SETE_DIAS,
  INICIO_DO_CANCELAMENTO_SEM_REEMBOLSO,
  ROTULO_DO_MOTIVO,
  alcanceDoEmail,
  aplicarCancelamento,
  avisoDaDesistenciaNosSeteDias,
  avisoDosSeteDias,
  cancelamentoJaFeito,
  cancelamentosDosVouchers,
  conferirNaTrava,
  confirmacaoDoCancelamento,
  escolhasDoCancelamento,
  frasesDoCancelamentoSemReembolso,
  linhaDaTravaDosSeteDias,
  linhaDoCancelamentoSemReembolso,
  motivoCombinaComAData,
  motivoDoFormulario,
  motivosQueCombinam,
  motivosQueNaoAparecem,
  planoDoCancelamento,
  reembolsoACaminhoDoSite,
  registroDoCancelamento,
  travaDaDesistencia,
  travaDosSeteDias,
  travaPelaDesistencia,
  voucherACompletar,
  vouchersACompletar,
  type EscolhaDoCancelamento,
} from '../src/lib/cancelar-sem-reembolso.ts';
import { CANCELAMENTO } from '../src/content/legal/cancelamento.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import {
  DESISTENCIA_RESPONDIDA,
  desistenciaParaResponder,
  estadoDaDesistencia,
  linhaDaDesistencia,
  podeDesistir,
} from '../src/lib/desistencia.ts';
import { emailEssencial } from '../src/lib/email/cota.ts';
import { EMAILS_AUTOMATICOS } from '../src/lib/email/lista-dos-emails.ts';
import {
  MARCA_DO_EMAIL_DO_CANCELAMENTO,
  MARCA_DO_EMAIL_DO_PEDIDO_SEM_REEMBOLSO,
  avisoDoEmailSemReembolsoQueNaoSaiu,
  marcaDoEmailDoVoucherCancelado,
  marcasQueFechamOAviso,
} from '../src/lib/email/marcas.ts';
import { emailPedidoCanceladoSemReembolso, emailVoucherCancelado, type MotivoDoEmail } from '../src/lib/email/mensagens.ts';
import { escaparHtml } from '../src/lib/email/modelo.ts';
import { emailSemReembolsoSai, pagamentoAprovadoAindaVale } from '../src/lib/email/regras-dos-avisos.ts';
import { TEXTOS_EMAIL } from '../src/lib/email/textos.ts';
import { calcularEstatisticas } from '../src/lib/estatisticas.ts';
import { pagamentoAMais, pagamentoParaReter, podeMudar } from '../src/lib/pagamento-stripe.ts';
import {
  CONFIRMACAO_DA_ACAO_MANUAL,
  ERROS_DO_PAINEL,
  acaoManualPedeConfirmacao,
  agruparPedidos,
  confirmacaoDaAcaoManual,
  fraseDoErro,
  irmaosAindaCancelados,
  seloDoPedidoNoPainel,
  statusDoSelo,
  statusDoVoucherNoPainel,
  ultimoVoucherDoPedido,
} from '../src/lib/pedidos-painel.ts';
import { linhaDoReembolsoFalho, linhaDoReembolsoSemVoucher, linhaDoReembolsoSolicitado } from '../src/lib/reembolsos-a-resolver.ts';
import type { Reserva, ReservaPasseio } from '../src/lib/reservas.ts';
import {
  NADA_VOLTA,
  NOME_DO_IDIOMA,
  NOTA_DO_CANCELAMENTO,
  TITULO_DO_CANCELAMENTO,
  enderecoDoResumo,
  telaDoCancelamento,
  telaDoReembolso,
  type ContextoDoResumo,
  type TelaDoResumo,
} from '../src/lib/resumo-do-painel.ts';
import {
  MOTIVOS_SEM_REEMBOLSO,
  TEXTO_DO_MOTIVO_MAXIMO,
  canceladoSemReembolso,
  cancelamentoDoVoucher,
  cancelamentosSemReembolso,
  limparTextoDoMotivo,
  pedidoCanceladoSemReembolso,
  type CancelamentoSemReembolso,
} from '../src/lib/sem-reembolso.ts';
import { suspeitasDeVos } from './ajuda/regra-neutra.ts';

// Pacote 33, passos 2 e 3 do plano de 25/11 (FASE-5, Etapa 2: "Cancelar sem reembolso"), e o D2 do painel de 25/11. O
// pedido pago pela Stripe cancelado sem reembolso pela equipe: o pedido continua 'pago' e os vouchers ficam 'cancelado', com
// o motivo no JSON do pagamento; a trava dos 7 dias do arrependimento; a reentrega do aviso do pagamento que não muda nada;
// o e-mail novo nos 4 idiomas; a página do cliente sem nenhuma opção de estorno; as caixas conferidas na rota. Só leitura:
// nada é gravado, nada vai à Stripe nem ao Resend; os pedidos são fictícios.

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');

/** O código de um arquivo de src/, sem as linhas de comentário (e sem o \r dos arquivos gravados com CRLF). */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
    .join('\n');

/** Um histórico com as linhas na ordem, um segundo entre uma e outra, a partir de `inicio`. */
const historico = (inicio: string, ...eventos: string[]) =>
  eventos.map((evento, n) => ({ em: new Date(Date.parse(inicio) + n * 1000).toISOString(), evento }));

/** Hoje, nos testes: 26/11/2026, meio-dia (UTC). */
const AGORA = new Date('2026-11-26T12:00:00Z');
/** Pago há 2 dias (dentro dos 7 do arrependimento). */
const PAGO_HA_2_DIAS = '2026-11-24T12:00:00.000Z';
/** Pago há 11 dias (fora dos 7). */
const PAGO_HA_11_DIAS = '2026-11-15T12:00:00.000Z';

/** Um voucher de exemplo, pago pela Stripe no cartão (nenhum é de cliente). */
function voucher(parcial: Partial<ReservaPasseio> = {}): Reserva {
  return {
    codigo: 'ON-ABC234',
    token: 'token-de-teste',
    criadaEm: '2026-11-15T11:50:00Z',
    atualizadaEm: '2026-11-15T12:00:00Z',
    idioma: 'pt',
    status: 'pago',
    provedor: 'stripe',
    paymentIntentId: 'pi_do_pedido',
    pagamentoExternoId: 'cs_test_do_pedido',
    tipo: 'passeio',
    data: '2026-12-20',
    horario: { hora: '09:00', busca: false },
    totalCentavos: 15400,
    cliente: { nome: 'Teste da Silva', email: 'teste@exemplo.com', telefone: '+55 21 90000-0000' },
    pagamento: { metodo: 'cartao', pagoEm: PAGO_HA_11_DIAS, cartaoBandeira: 'visa', cartaoFinal: '4242' },
    historico: historico(PAGO_HA_11_DIAS, 'Pago (webhook da Stripe)'),
    passeio: { slug: 'escuna-buzios', nome: 'Escuna', cidade: 'Búzios', unidade: 'pessoa' },
    adultos: 2,
    criancas: 0,
    unidades: 2,
    hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
    ...parcial,
  } as ReservaPasseio;
}

/** Um pedido de dois itens: ON-AAA234 (R$ 242,00, o primeiro da viagem: representa o pedido) e ON-BBB234 (R$ 154,00). */
function doisVouchers(comum: Partial<ReservaPasseio> = {}, statusItens: [Reserva['statusItem'], Reserva['statusItem']] = [undefined, undefined]) {
  const pedido = { codigo: 'ON-PED234', totalCentavos: 39600 };
  const item = (codigoDoVoucher: string, data: string, totalCentavos: number, statusItem: Reserva['statusItem']) =>
    voucher({ codigo: codigoDoVoucher, data, totalCentavos, ...comum, pedido, ...(statusItem ? { statusItem } : {}) });
  return [item('ON-AAA234', '2026-12-20', 24200, statusItens[0]), item('ON-BBB234', '2026-12-21', 15400, statusItens[1])];
}

const TUDO: EscolhaDoCancelamento = { acao: 'cancelar_sem_reembolso' };
const so = (v: string): EscolhaDoCancelamento => ({ acao: 'cancelar_item_sem_reembolso', voucher: v });

/** O cancelamento gravado num pedido (o JSON do pagamento, em todos os vouchers, como no banco e nos arquivos). */
const comCancelamento = (vouchers: Reserva[], ...lista: CancelamentoSemReembolso[]): Reserva[] =>
  vouchers.map((v) => ({ ...v, pagamento: { ...v.pagamento, semReembolso: lista } }) as Reserva);

const NAO_COMPARECEU: CancelamentoSemReembolso = {
  alcance: 'pedido',
  vouchers: ['ON-AAA234', 'ON-BBB234'],
  motivo: 'nao-compareceu',
  em: '2026-11-26T11:00:00.000Z',
};

/* ------------------------------------------------------------------ */
/* 1. A forma gravada e a leitura dela                                  */

test('o cancelamento gravado no JSON do pagamento: só a forma certa conta, e o voucher listado e cancelado é "sem reembolso"', () => {
  assert.deepEqual(MOTIVOS_SEM_REEMBOLSO, ['fora-da-politica', 'nao-compareceu', 'outro']);
  assert.equal(TEXTO_DO_MOTIVO_MAXIMO, 200);
  // o que vem do banco pode vir sujo: só os registros com a forma certa
  const sujo = {
    semReembolso: [
      NAO_COMPARECEU,
      { alcance: 'pedido', vouchers: 'ON-AAA234', motivo: 'outro', em: 'x' },
      { alcance: 'tudo', vouchers: [], motivo: 'outro', em: 'x' },
      { alcance: 'voucher', vouchers: ['ON-BBB234'], motivo: 'chuva', em: 'x' },
      null,
      'texto',
    ],
  } as unknown as Reserva['pagamento'];
  assert.deepEqual(cancelamentosSemReembolso(sujo), [NAO_COMPARECEU]);
  assert.deepEqual(cancelamentosSemReembolso({ metodo: 'cartao' }), []);
  assert.deepEqual(cancelamentosSemReembolso(undefined), []);
  assert.equal(cancelamentoDoVoucher(sujo, 'ON-BBB234'), NAO_COMPARECEU);
  assert.equal(cancelamentoDoVoucher(sujo, 'ON-ZZZ234'), undefined);

  const [a, b] = comCancelamento(doisVouchers({}, ['cancelado', 'cancelado']), NAO_COMPARECEU);
  assert.equal(canceladoSemReembolso(a), true);
  assert.equal(pedidoCanceladoSemReembolso([a, b]), true);
  // ainda valendo, ou cancelado sem registro (o cancelamento de sempre do pedido): não é "sem reembolso"
  const [ativo] = comCancelamento(doisVouchers(), NAO_COMPARECEU);
  assert.equal(canceladoSemReembolso(ativo), false);
  assert.equal(canceladoSemReembolso(doisVouchers({}, ['cancelado', 'cancelado'])[0]), false);
  // um voucher ainda valendo: o pedido não está cancelado inteiro
  assert.equal(pedidoCanceladoSemReembolso(comCancelamento(doisVouchers({}, ['cancelado', undefined]), NAO_COMPARECEU)), false);
  // um cancelado sem reembolso e o outro reembolsado sozinho: o pedido inteiro está cancelado (nenhum voucher vale)
  assert.equal(pedidoCanceladoSemReembolso(comCancelamento(doisVouchers({}, ['cancelado', 'reembolsado']), NAO_COMPARECEU)), true);
  // a equipe mudou de ideia e usou "Reembolsar tudo": o pedido reembolsado inteiro não é mais "sem reembolso"
  const reembolsado = comCancelamento(doisVouchers({ status: 'reembolsado', reembolsoCentavos: 39600 }, ['cancelado', 'cancelado']), NAO_COMPARECEU);
  assert.equal(canceladoSemReembolso(reembolsado[0]), false);
  assert.equal(pedidoCanceladoSemReembolso(reembolsado), false);
});

test('o motivo: um dos três; o texto só com "outro" (obrigatório nele), limpo e com no máximo 200 letras', () => {
  assert.deepEqual(motivoDoFormulario('nao-compareceu', ''), { ok: true, motivo: 'nao-compareceu' });
  assert.deepEqual(motivoDoFormulario('fora-da-politica', null), { ok: true, motivo: 'fora-da-politica' });
  assert.deepEqual(motivoDoFormulario('outro', '  Chuva forte na hora da saída  '), {
    ok: true,
    motivo: 'outro',
    texto: 'Chuva forte na hora da saída',
  });
  // sem motivo, um motivo inventado, ou outra coisa que não texto
  for (const m of [null, '', 'chuva', 'constructor', ['outro'], 42]) assert.deepEqual(motivoDoFormulario(m, ''), { ok: false, erro: 'falta-motivo' });
  // "outro" sem texto (ou só espaços e quebras)
  for (const t of ['', '   ', '\n\t', null, undefined]) assert.deepEqual(motivoDoFormulario('outro', t), { ok: false, erro: 'falta-texto-do-motivo' });
  // o texto com outro motivo não vai ao cliente: melhor dizer do que sumir com ele
  assert.deepEqual(motivoDoFormulario('nao-compareceu', 'chegou atrasado'), { ok: false, erro: 'texto-sem-outro' });
  // limpo: uma linha só, sem espaços sobrando, as aspas e os « » trocados (o histórico fecha o trecho com « »), cortado
  assert.equal(limparTextoDoMotivo('a\u0000b\nc  «d» "e"'), "a b c 'd' 'e'");
  assert.equal(limparTextoDoMotivo('x'.repeat(250)).length, 200);
  assert.equal(limparTextoDoMotivo({ texto: 'oi' }), '');
  for (const e of ['falta-motivo', 'falta-texto-do-motivo', 'texto-sem-outro', 'falta-ciente'] as const)
    assert.match(ERROS_DO_PAINEL[e], /Nada foi feito\.$/, e);
  assert.equal(fraseDoErro('falta-ciente'), ERROS_DO_PAINEL['falta-ciente']);
  assert.deepEqual(Object.keys(ROTULO_DO_MOTIVO), [...MOTIVOS_SEM_REEMBOLSO]);
});

/* ------------------------------------------------------------------ */
/* 2. O que vale                                                        */

test('o que vale: o pedido pago pela Stripe, sem contestação e sem reembolso a resolver ou a caminho', () => {
  assert.deepEqual(ACOES_SEM_REEMBOLSO, ['cancelar_sem_reembolso', 'cancelar_item_sem_reembolso']);
  const um = [voucher()];
  const plano = planoDoCancelamento(um, TUDO, AGORA);
  assert.ok(plano.ok);
  assert.deepEqual(
    plano.cancelar.map((v) => v.codigo),
    ['ON-ABC234'],
  );
  assert.equal(plano.trava, null);
  // o que não vale
  const erro = (vouchers: Reserva[], escolha: EscolhaDoCancelamento = TUDO) => {
    const p = planoDoCancelamento(vouchers, escolha, AGORA);
    return p.ok ? 'ok' : p.erro;
  };
  assert.equal(erro([]), 'nao-encontrado');
  for (const status of ['contestado', 'reembolsado', 'cancelado', 'pendente', 'expirado'] as const)
    assert.equal(erro([voucher({ status })]), 'cancelamento-nao-vale', status);
  // o pedido do WhatsApp continua com o "Cancelar" de sempre
  assert.equal(erro([voucher({ provedor: 'whatsapp', paymentIntentId: undefined })]), 'cancelamento-nao-vale');
  assert.equal(erro([voucher({ paymentIntentId: undefined })]), 'cancelamento-nao-vale');
  // um reembolso que falhou e ainda não foi devolvido por outro meio, e o feito direto na Stripe sem voucher
  const falho = linhaDoReembolsoFalho({ id: 're_f', centavos: 15400, motivo: 'declined' });
  assert.equal(erro([voucher({ historico: historico(PAGO_HA_11_DIAS, 'Pago (webhook da Stripe)', falho) })]), 'reembolso-a-resolver');
  const semVoucher = linhaDoReembolsoSemVoucher({ id: 're_d', centavos: 5000 });
  assert.equal(
    erro(doisVouchers({ reembolsoCentavos: 5000, historico: historico(PAGO_HA_11_DIAS, 'Pago (webhook da Stripe)', semVoucher) })),
    'reembolso-a-resolver',
  );
  // o "Reembolsar tudo" pedido à Stripe e ainda não confirmado: o dinheiro está voltando
  const tudoPedido = linhaDoReembolsoSolicitado({ id: 're_t', centavos: 15400 });
  assert.equal(erro([voucher({ historico: historico(PAGO_HA_11_DIAS, 'Pago (webhook da Stripe)', tudoPedido) })]), 'reembolso-a-caminho');
  // o de um voucher ainda valendo também; depois que a Stripe confirma (o voucher reembolsado), não
  const doItem = linhaDoReembolsoSolicitado({ id: 're_b', centavos: 15400, voucher: 'ON-BBB234' });
  const comPedidoDoItem = { historico: historico(PAGO_HA_11_DIAS, 'Pago (webhook da Stripe)', doItem) };
  assert.equal(erro(doisVouchers(comPedidoDoItem)), 'reembolso-a-caminho');
  assert.equal(erro(doisVouchers(comPedidoDoItem, [undefined, 'reembolsado'])), 'ok');
  // o reembolso que a Stripe cancelou não está voltando
  const cancelado = `Reembolso cancelado na Stripe (reembolso re_b, ${cifra(15400)}): este dinheiro não voltou ao cliente, e o pedido continua contando o valor como devolvido`;
  assert.equal(
    reembolsoACaminhoDoSite({ status: 'pago', historico: historico(PAGO_HA_11_DIAS, doItem, cancelado) }, doisVouchers()),
    false,
  );
  // um voucher só: só no pedido com vários itens, e só o voucher que ainda vale
  assert.equal(erro(doisVouchers(), so('ON-ZZZ234')), 'voucher-de-fora');
  assert.equal(erro(um, so('ON-ABC234')), 'cancelamento-nao-vale');
  assert.equal(erro(doisVouchers({}, [undefined, 'cancelado']), so('ON-BBB234')), 'item-ja-devolvido');
  assert.equal(erro(doisVouchers({}, [undefined, 'usado']), so('ON-BBB234')), 'item-ja-devolvido');
  // o pedido inteiro sem nenhum voucher valendo: nada a cancelar
  assert.equal(erro(doisVouchers({}, ['cancelado', 'reembolsado'])), 'nada-a-cancelar');
  // o pedido inteiro cancela só os que ainda valem (o reembolsado sozinho e o usado ficam como estão)
  const parte = planoDoCancelamento(doisVouchers({}, ['reembolsado', undefined]), TUDO, AGORA);
  assert.ok(parte.ok);
  assert.deepEqual(
    parte.cancelar.map((v) => v.codigo),
    ['ON-BBB234'],
  );
  // as opções da tela: o pedido inteiro e, com dois vouchers ou mais valendo, cada um
  assert.deepEqual(escolhasDoCancelamento(doisVouchers(), AGORA), [TUDO, so('ON-AAA234'), so('ON-BBB234')]);
  assert.deepEqual(escolhasDoCancelamento(doisVouchers({}, ['reembolsado', undefined]), AGORA), [TUDO]);
  assert.deepEqual(escolhasDoCancelamento(um, AGORA), [TUDO]);
  assert.deepEqual(escolhasDoCancelamento([voucher({ status: 'contestado' })], AGORA), []);
});

/* ------------------------------------------------------------------ */
/* 3. A trava dos 7 dias                                                */

test('a trava dos 7 dias: a compra paga há até 7 dias e algum voucher ainda por começar; na dúvida, avisa', () => {
  const dentro = (pagoEm: string | undefined, parcial: Partial<ReservaPasseio> = {}, criadaEm = '2026-11-15T11:50:00Z') =>
    travaDosSeteDias(voucher({ pagamento: { metodo: 'cartao', ...(pagoEm ? { pagoEm } : {}) }, criadaEm }), [voucher(parcial)], AGORA);
  assert.deepEqual(dentro(PAGO_HA_2_DIAS), { compraEm: PAGO_HA_2_DIAS, dias: 2 });
  // o sétimo dia inteiro ainda vale (os 7 dias contados do pagamento, como na desistência pelo site)
  assert.equal(dentro('2026-11-19T12:00:00.000Z')?.dias, 7);
  assert.equal(dentro('2026-11-19T11:59:59.000Z'), null);
  assert.equal(dentro(PAGO_HA_11_DIAS), null);
  // o serviço já começou (ou passou): sem trava
  assert.equal(dentro(PAGO_HA_2_DIAS, { data: '2026-11-25' }), null);
  assert.equal(dentro(PAGO_HA_2_DIAS, { data: '2026-11-26', horario: { hora: '08:00', busca: false } }), null);
  // hoje mais tarde ainda vale (Búzios, UTC−3: meio-dia UTC são 9h)
  assert.deepEqual(dentro(PAGO_HA_2_DIAS, { data: '2026-11-26', horario: { hora: '10:00', busca: false } })?.dias, 2);
  // sem a data do pagamento, a criação do pedido; sem nenhuma que dê para ler, avisa (dias null)
  assert.equal(dentro(undefined, {}, PAGO_HA_2_DIAS)?.dias, 2);
  assert.deepEqual(dentro(undefined, {}, 'não é data'), { compraEm: 'não é data', dias: null });
  // a data do serviço que não dá para ler: avisa
  assert.ok(dentro(PAGO_HA_2_DIAS, { data: 'sem data' }));
  // dois vouchers, um já começou e o outro não: avisa
  const r = voucher({ pagamento: { metodo: 'cartao', pagoEm: PAGO_HA_2_DIAS } });
  assert.ok(travaDosSeteDias(r, [voucher({ data: '2026-11-25' }), voucher({ data: '2026-12-01' })], AGORA));
  assert.equal(travaDosSeteDias(r, [voucher({ data: '2026-11-25' })], AGORA), null);

  // o plano leva a trava; a tela pede a segunda caixa
  const plano = planoDoCancelamento([voucher({ pagamento: { metodo: 'pix', pagoEm: PAGO_HA_2_DIAS }, totalPixCentavos: 13860 })], TUDO, AGORA);
  assert.ok(plano.ok && plano.trava);
  const aviso = avisoDosSeteDias({ compraEm: PAGO_HA_2_DIAS, dias: 2 });
  assert.match(aviso, /^Atenção: esta compra foi paga em .+, há 2 dias, e o serviço ainda não começou\./);
  assert.match(aviso, /art\. 49 do Código de Defesa do Consumidor/);
  assert.match(aviso, /o cliente tem direito ao dinheiro de volta/);
  assert.match(aviso, /"Estou ciente"/);
  assert.match(avisoDosSeteDias({ compraEm: PAGO_HA_2_DIAS, dias: 0 }), /, há menos de 1 dia,/);
  assert.match(CIENTE_DOS_SETE_DIAS, /^Estou ciente: .*direito ao dinheiro de volta/);
  // a linha do histórico: o painel avisou e a equipe seguiu; nunca um "Aviso:" (nada a resolver depois)
  for (const onde of ['cancelamento', 'desistencia'] as const) {
    const linha = linhaDaTravaDosSeteDias({ compraEm: PAGO_HA_2_DIAS, dias: 2 }, onde);
    assert.ok(linha.startsWith(`${INICIO_DA_TRAVA_DOS_SETE_DIAS}: o painel avisou`), onde);
    assert.match(linha, /o cliente tem direito ao dinheiro de volta; a equipe marcou "Estou ciente"/);
    assert.doesNotMatch(linha, /^Aviso:/);
  }
});

test('a trava na desistência respondida sem reembolso: a desistência que chegou dentro dos 7 dias pede "Estou ciente"', () => {
  const comDesistencia = (pagoEm: string, chegou: string, reembolsoCentavos?: number) =>
    voucher({
      pagamento: { metodo: 'cartao', pagoEm },
      ...(reembolsoCentavos ? { reembolsoCentavos } : {}),
      historico: [
        { em: pagoEm, evento: 'Pago (webhook da Stripe)' },
        { em: chegou, evento: linhaDaDesistencia('mudei de ideia', { compraEm: pagoEm, agora: new Date(chegou) }) },
      ],
    });
  // chegou 3 dias depois da compra: a trava vale, mesmo que a equipe responda dias depois (com a hora em que ela chegou)
  assert.deepEqual(travaDaDesistencia(comDesistencia(PAGO_HA_11_DIAS, '2026-11-18T12:00:00.000Z')), {
    compraEm: PAGO_HA_11_DIAS,
    dias: 3,
    desistenciaEm: '2026-11-18T12:00:00.000Z',
  });
  // chegou 9 dias depois: fora dos 7, vale a política
  assert.equal(travaDaDesistencia(comDesistencia(PAGO_HA_11_DIAS, '2026-11-24T12:00:00.000Z')), null);
  // com uma parte já reembolsada, o botão é o de "o resto do pedido segue pago": sem trava
  assert.equal(travaDaDesistencia(comDesistencia(PAGO_HA_11_DIAS, '2026-11-18T12:00:00.000Z', 15400)), null);
  // sem desistência, sem trava
  assert.equal(travaDaDesistencia(voucher()), null);
  assert.match(avisoDaDesistenciaNosSeteDias({ compraEm: PAGO_HA_11_DIAS, dias: 3 }), /o cliente tem direito ao dinheiro de volta/);

  // a página e a rota: o aviso e a caixa no botão de sempre, conferidos de novo na rota (antes e dentro da trava)
  const pagina = codigo('app', 'admin', 'page.tsx');
  // revisão do pacote 2 das casas: o segundo argumento só liga os 7 dias corridos da casa (sem casa, false: a conta de sempre)
  assert.match(pagina, /const trava = travaDaDesistencia\(r, p\.itens\.some\(ehCasa\)\);/);
  assert.match(pagina, /\.\.\.\(trava \? \{ aviso: avisoDaDesistenciaNosSeteDias\(trava\), ciente: CIENTE_DOS_SETE_DIAS \} : \{\}\),/);
  const botao = pagina.slice(pagina.indexOf('function BotaoAcao('), pagina.indexOf('function ReembolsoStripe('));
  assert.match(botao, /<input type="checkbox" name="ciente" value="sim" required/);
  const rota = codigo('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  assert.match(rota, /const ciente = form\.get\('ciente'\) === 'sim';/);
  assert.match(rota, /if \(travaDaDesistencia\(alvo, comCasa\) && !ciente\) return voltar\('falta-ciente'\);/);
  // o pedido sem casa passa false: a mesma trava de antes, também com a desistência pedida pelo site
  assert.deepEqual(
    travaDaDesistencia(comDesistencia(PAGO_HA_11_DIAS, '2026-11-18T12:00:00.000Z'), false),
    travaDaDesistencia(comDesistencia(PAGO_HA_11_DIAS, '2026-11-18T12:00:00.000Z')),
  );
});

/* ------------------------------------------------------------------ */
/* 4. A gravação: o pedido continua pago e os vouchers ficam 'cancelado' */

/** O que levarAosIrmaos (nos arquivos) e a linha do pedido (no banco) fazem: o que é do pedido, de um voucher para o outro. */
const comOPedido = (v: Reserva, de: Reserva): Reserva =>
  ({ ...v, status: de.status, pagamento: structuredClone(de.pagamento), historico: [...de.historico] }) as Reserva;

test('a gravação: o cancelamento no JSON do pagamento, o pedido continua pago e cada voucher fica "cancelado", uma vez', () => {
  const vouchers = doisVouchers();
  const plano = planoDoCancelamento(vouchers, TUDO, AGORA);
  assert.ok(plano.ok);
  const registro = registroDoCancelamento(TUDO, plano.cancelar.map((v) => v.codigo), { motivo: 'nao-compareceu' }, AGORA, false);
  assert.deepEqual(registro, { alcance: 'pedido', vouchers: ['ON-AAA234', 'ON-BBB234'], motivo: 'nao-compareceu', em: AGORA.toISOString() });
  // dentro da trava, com o primeiro voucher relido: a mesma regra, os mesmos vouchers; grava
  const primeiro = structuredClone(vouchers[0]);
  const conferencia = conferirNaTrava(primeiro, vouchers, TUDO, registro, AGORA, false);
  assert.deepEqual(conferencia, { resultado: 'gravar', trava: null });
  const linhas = aplicarCancelamento(primeiro, registro, null);
  // o pedido continua pago (nunca 'cancelado': a reentrega do aviso do pagamento devolveria o dinheiro sozinho)
  assert.equal(primeiro.status, 'pago');
  assert.equal(primeiro.statusItem, 'cancelado');
  assert.deepEqual(primeiro.pagamento.semReembolso, [registro]);
  assert.equal(linhas.length, 1);
  assert.equal(
    linhas[0],
    `${INICIO_DO_CANCELAMENTO_SEM_REEMBOLSO} (o pedido inteiro): os vouchers ON-AAA234 e ON-BBB234 deixam de valer, e nada é devolvido ao cliente. Motivo: não compareceu no horário e no local combinados`,
  );
  assert.doesNotMatch(linhas[0], /^Aviso:/);
  // o outro voucher, com o que é do pedido já gravado: a gravação dele completa (só o status do item muda)
  const segundo = comOPedido(vouchers[1], primeiro);
  assert.equal(voucherACompletar(segundo), true);
  segundo.statusItem = 'cancelado';
  assert.equal(voucherACompletar(segundo), false, 'o segundo toque não grava de novo');
  assert.equal(segundo.status, 'pago');
  // o estado do passo 2: o selo do painel, a cor do cancelado e o voucher no painel
  const depois = [primeiro, segundo];
  assert.equal(pedidoCanceladoSemReembolso(depois), true);
  const p = agruparPedidos(depois)[0];
  assert.equal(p.status, 'pago');
  assert.equal(seloDoPedidoNoPainel(p), 'Cancelado sem reembolso');
  assert.equal(statusDoSelo(p), 'cancelado');
  assert.equal(statusDoVoucherNoPainel(segundo), 'Cancelado sem reembolso');
  // o toque repetido (o duplo toque, a aba antiga): a escolha já está feita, e a conferência dentro da trava também diz
  assert.equal(cancelamentoJaFeito(primeiro, TUDO), registro);
  assert.equal(cancelamentoJaFeito(primeiro, so('ON-BBB234')), registro);
  assert.deepEqual(conferirNaTrava(primeiro, vouchers, TUDO, registro, AGORA, false), { resultado: 'repetida' });
  // a gravação que ficou pela metade (o segundo voucher ainda valendo): completada sem outro cancelamento
  const pelaMetade = [primeiro, comOPedido(vouchers[1], primeiro)];
  assert.deepEqual(
    vouchersACompletar(pelaMetade).map((v) => v.codigo),
    ['ON-BBB234'],
  );
  assert.deepEqual(cancelamentosDosVouchers(primeiro, vouchersACompletar(pelaMetade)), [registro]);
  assert.deepEqual(vouchersACompletar(depois), []);
  assert.deepEqual(alcanceDoEmail(registro), { tipo: 'pedido' });
});

test('a conferência dentro da trava: o pedido que mudou no meio-tempo não grava, e a trava pede "Estou ciente"', () => {
  const vouchers = doisVouchers();
  const registro = registroDoCancelamento(TUDO, ['ON-AAA234', 'ON-BBB234'], { motivo: 'fora-da-politica' }, AGORA, false);
  const relido = (parcial: Partial<ReservaPasseio>) => ({ ...structuredClone(vouchers[0]), ...parcial }) as Reserva;
  // reembolsado, contestado, ou com um reembolso pedido à Stripe no meio-tempo
  assert.deepEqual(conferirNaTrava(relido({ status: 'reembolsado' }), vouchers, TUDO, registro, AGORA, true), {
    resultado: 'cancelamento-nao-vale',
  });
  assert.deepEqual(conferirNaTrava(relido({ status: 'contestado' }), vouchers, TUDO, registro, AGORA, true), {
    resultado: 'cancelamento-nao-vale',
  });
  const pedido = linhaDoReembolsoSolicitado({ id: 're_t', centavos: 39600 });
  assert.deepEqual(
    conferirNaTrava(relido({ historico: historico(PAGO_HA_11_DIAS, 'Pago (webhook da Stripe)', pedido) }), vouchers, TUDO, registro, AGORA, true),
    { resultado: 'reembolso-a-caminho' },
  );
  // o primeiro voucher reembolsado sozinho no meio-tempo: os vouchers do cancelamento não são mais os mesmos
  assert.deepEqual(conferirNaTrava(relido({ statusItem: 'reembolsado' }), vouchers, TUDO, registro, AGORA, true), {
    resultado: 'acao-nao-vale',
  });
  // dentro dos 7 dias: sem a caixa, nada; com ela, grava com a trava (a linha da trava vai junto)
  const recente = doisVouchers({ pagamento: { metodo: 'cartao', pagoEm: PAGO_HA_2_DIAS } });
  const comTrava = registroDoCancelamento(TUDO, ['ON-AAA234', 'ON-BBB234'], { motivo: 'fora-da-politica' }, AGORA, true);
  assert.equal(comTrava.avisoDosSeteDias, true);
  assert.deepEqual(conferirNaTrava(structuredClone(recente[0]), recente, TUDO, comTrava, AGORA, false), { resultado: 'falta-ciente' });
  const conferida = conferirNaTrava(structuredClone(recente[0]), recente, TUDO, comTrava, AGORA, true);
  assert.equal(conferida.resultado, 'gravar');
  const r = structuredClone(recente[0]);
  const linhas = aplicarCancelamento(r, comTrava, conferida.resultado === 'gravar' ? conferida.trava : null);
  assert.equal(linhas.length, 2);
  assert.ok(linhas[1].startsWith(INICIO_DA_TRAVA_DOS_SETE_DIAS));
  // um voucher só: o registro do voucher, e a primeira gravação é a do próprio voucher (o outro continua valendo)
  const doB = registroDoCancelamento(so('ON-BBB234'), ['ON-BBB234'], { motivo: 'outro', texto: 'Documento não apresentado' }, AGORA, false);
  assert.deepEqual(doB, {
    alcance: 'voucher',
    vouchers: ['ON-BBB234'],
    motivo: 'outro',
    texto: 'Documento não apresentado',
    em: AGORA.toISOString(),
  });
  const b = structuredClone(vouchers[1]);
  assert.deepEqual(conferirNaTrava(b, vouchers, so('ON-BBB234'), doB, AGORA, false), { resultado: 'gravar', trava: null });
  const [linhaDoB] = aplicarCancelamento(b, doB, null);
  assert.equal(b.statusItem, 'cancelado');
  assert.match(linhaDoB, /\(um voucher só\): o voucher ON-BBB234 deixa de valer, e nada é devolvido ao cliente\. Motivo: outro, escrito para o cliente: «Documento não apresentado»$/);
  const a = comOPedido(vouchers[0], b);
  assert.equal(voucherACompletar(a), false, 'o outro voucher não entra no cancelamento');
  assert.equal(pedidoCanceladoSemReembolso([a, b]), false);
  assert.equal(seloDoPedidoNoPainel(agruparPedidos([a, b])[0]), 'Pago');
  assert.deepEqual(alcanceDoEmail(doB), { tipo: 'voucher', voucher: 'ON-BBB234' });
  // o último voucher cancelado depois: o pedido inteiro fica no estado do passo 2
  const doA = registroDoCancelamento(so('ON-AAA234'), ['ON-AAA234'], { motivo: 'nao-compareceu' }, AGORA, false);
  assert.deepEqual(conferirNaTrava(a, [a, b], so('ON-AAA234'), doA, AGORA, false), { resultado: 'gravar', trava: null });
  aplicarCancelamento(a, doA, null);
  const final = [a, comOPedido(b, a)];
  assert.equal(pedidoCanceladoSemReembolso(final), true);
  assert.equal(seloDoPedidoNoPainel(agruparPedidos(final)[0]), 'Cancelado sem reembolso');
});

/* ------------------------------------------------------------------ */
/* 5. A reentrega do aviso do pagamento                                 */

test('a reentrega do aviso do pagamento num pedido cancelado sem reembolso: nada muda, nada é devolvido, nenhum e-mail', () => {
  const [a, b] = comCancelamento(doisVouchers({}, ['cancelado', 'cancelado']), NAO_COMPARECEU);
  const leitura = { status: 'pago' as const, paymentIntentId: 'pi_do_pedido', valorCentavos: 39600 };
  // o pagamento do próprio pedido, de novo: nem parado (o pedido não está cancelado), nem "a mais" (é o mesmo pagamento)
  assert.equal(pagamentoParaReter(a, leitura), undefined);
  assert.equal(pagamentoAMais(a, leitura), undefined);
  // e o webhook não devolve nada: o pedido pago com o mesmo pagamento
  assert.equal(pagamentoParaDevolver(a, a, leitura), null);
  assert.equal(podeMudar('pago', 'pago'), false);
  // com o status 'cancelado' no pedido pago (o que o site NÃO grava), a reentrega devolveria o dinheiro sozinho
  const comoNaoGravar = { ...a, status: 'cancelado' as const };
  assert.equal(pagamentoParaDevolver(comoNaoGravar, comoNaoGravar, leitura), 'pi_do_pedido');
  // a porta do pagamento: o pedido já pago pelo mesmo pagamento não grava nada (nem o status do item), nem chama pedidoPago
  const pagamento = codigo('lib', 'pagamento-stripe.ts');
  const aplicar = pagamento.slice(pagamento.indexOf('export async function aplicarSessao('), pagamento.indexOf('export async function pedidoPago('));
  assert.match(aplicar, /if \(leitura\.status === 'pago'\) \{\s+if \(r\.status === 'pago'\) return origem === 'consulta' \? r : null;/);
  assert.doesNotMatch(aplicar, /statusItem/);
  assert.match(aplicar, /if \(virouPago && reserva\) await pedidoPago\(reserva, leitura\);/);
  // os vouchers continuam cancelados; o e-mail do pagamento aprovado (com os vouchers) não sai para ele
  assert.equal(pagamentoAprovadoAindaVale([a, b]), false);
  assert.equal(pagamentoAprovadoAindaVale(doisVouchers({}, ['cancelado', undefined])), true);
  const pedidos = codigo('lib', 'email', 'pedidos.ts');
  assert.match(pedidos, /if \(tipo === 'pagamento-aprovado' && !pagamentoAprovadoAindaVale\(lista\)\) \{/);
  // e o selo do painel continua o do cancelado sem reembolso
  assert.equal(seloDoPedidoNoPainel(agruparPedidos([a, b])[0]), 'Cancelado sem reembolso');
});

/* ------------------------------------------------------------------ */
/* 6. A rota: as caixas, o motivo e a trava antes de gravar             */

const ROTA = codigo('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
/** O trecho de uma ação da rota do painel: do `if (acao === '<nome>'` até a ação seguinte. */
function trechoDaAcao(acao: string): string {
  const inicio = ROTA.indexOf(`if (acao === '${acao}'`);
  assert.notEqual(inicio, -1, acao);
  const fim = ROTA.slice(inicio + 1).search(/\n {2}if \(acao === '|\n {2}const manual = ACOES_MANUAIS/);
  return ROTA.slice(inicio, fim === -1 ? undefined : inicio + 1 + fim);
}

test('a rota do cancelamento sem reembolso: a caixa, o motivo e a trava antes de gravar; nada da Stripe; o pedido continua pago', () => {
  const trecho = trechoDaAcao('cancelar_sem_reembolso');
  assert.match(trecho, /^if \(acao === 'cancelar_sem_reembolso' \|\| acao === 'cancelar_item_sem_reembolso'\) \{/);
  // nenhum dinheiro sai: nada da Stripe, e o caminho do dinheiro de sempre continua com as três chamadas de antes
  assert.doesNotMatch(trecho, /criarReembolso|reembolsosDoPagamento|stripe\(|obterSessao/);
  assert.equal(ROTA.match(/\bcriarReembolso\(/g)?.length, 3);
  // o status do pedido nunca muda aqui (só o do voucher, em completarCancelados e em aplicarCancelamento)
  assert.doesNotMatch(trecho, /\.status = /);
  // a ordem: o que ficou pela metade (com a caixa), o toque repetido, a regra, a caixa, o motivo, a trava, a gravação
  const ordem = [
    'const pendentes = vouchersACompletar(vouchers);',
    "if (!confirmou) return voltar('falta-confirmar');",
    'if (cancelamentoJaFeito(alvo, escolha)) return voltar();',
    'const plano = planoDoCancelamento(depois, escolha, agora);',
    'if (!plano.ok) return voltar(plano.erro);',
    "if (!confirmou) return voltar('falta-confirmar');",
    "const motivo = motivoDoFormulario(form.get('motivo'), form.get('texto'));",
    'if (!motivo.ok) return voltar(motivo.erro);',
    "if (plano.trava && !ciente) return voltar('falta-ciente');",
    'await atualizarReserva(primeiro.codigo, (r) => {',
    'const conferencia = conferirNaTrava(r, depois, escolha, registro, agora, ciente);',
    "if (conferencia.resultado !== 'gravar') return null;",
    // Etapa 7, pacote 2: o motivo no histórico com a regra dos vouchers cancelados (a das casas, a dos passeios ou as duas) e,
    // desde a revisão do pacote 2, o dia do pedido do cliente de que a regra das casas foi contada
    'for (const linha of aplicarCancelamento(r, registro, conferencia.trava, regraDosVouchers(plano.cancelar), pedido)) registrar(r, linha);',
    "if (resultado === 'repetida') return voltar();",
    'if (resultado !== \'gravar\') return voltar(resultado);',
    "if (!(await completarCancelados(resto, codigoDoPedido))) return voltar('cancelamento-pela-metade');",
    'agendarEmailSemReembolso(codigoDoPedido, alcanceDoEmail(registro));',
  ];
  let ultimo = -1;
  for (const passo of ordem) {
    const onde = trecho.indexOf(passo, ultimo + 1);
    assert.ok(onde > ultimo, passo);
    ultimo = onde;
  }
  // o que ficou pela metade: o voucher só fica cancelado dentro da trava dele, conferido de novo (nunca o status do pedido)
  const completar = ROTA.slice(ROTA.indexOf('async function completarCancelados('), ROTA.indexOf('export async function POST('));
  assert.match(completar, /await atualizarReserva\(v\.codigo, \(x\) => \{\s+if \(!voucherACompletar\(x\)\) return null;\s+x\.statusItem = 'cancelado';\s+return x;\s+\}\);/);
  assert.doesNotMatch(completar, /\.status = /);
  // a tela de resumo manda para estas ações, com os campos que a rota lê
  const resumo = codigo('lib', 'resumo-do-painel.ts');
  assert.match(resumo, /nome: 'motivo',/);
  assert.match(resumo, /nome: 'texto',/);
  assert.match(resumo, /\.\.\.\(plano\.trava \? \[\{ nome: 'ciente', texto: CIENTE_DOS_SETE_DIAS \}\] : \[\]\),/);
  assert.match(resumo, /\{ nome: 'confirmo', texto: confirmacaoDoCancelamento\(codigos\) \},/);
});

/* ------------------------------------------------------------------ */
/* 7. D2: o pedido do WhatsApp já pago                                   */

test('D2: "Cancelar" no pedido que já foi pago e "Marcar reembolsado" pedem a caixa; o cancelamento de quem nunca pagou, um toque', () => {
  const doWhats = (parcial: Partial<ReservaPasseio>) =>
    voucher({ provedor: 'whatsapp', paymentIntentId: undefined, pagamentoExternoId: undefined, historico: [], ...parcial });
  const naoPago = doWhats({ status: 'aguardando_whatsapp', pagamento: { metodo: 'whatsapp' } });
  const pago = doWhats({ status: 'pago', pagamento: { metodo: 'pix', pagoEm: PAGO_HA_2_DIAS } });
  const canceladoDepois = doWhats({ status: 'cancelado', pagamento: { metodo: 'pix', pagoEm: PAGO_HA_2_DIAS } });
  assert.equal(acaoManualPedeConfirmacao(naoPago, 'cancelar'), false);
  assert.equal(acaoManualPedeConfirmacao(pago, 'cancelar'), true);
  assert.equal(acaoManualPedeConfirmacao(pago, 'reembolsado'), true);
  assert.equal(acaoManualPedeConfirmacao(canceladoDepois, 'reembolsado'), true);
  for (const outra of ['pago_pix', 'pago_cartao', 'marcar_pago', 'desistencia_respondida', ''])
    assert.equal(acaoManualPedeConfirmacao(pago, outra), false, outra);
  // o pedido em aberto da Stripe (o "Cancelar" que fecha a sessão): ninguém pagou, um toque
  assert.equal(acaoManualPedeConfirmacao(voucher({ status: 'pendente', pagamento: { metodo: 'pix' }, historico: [] }), 'cancelar'), false);
  assert.equal(confirmacaoDaAcaoManual(pago, 'cancelar'), CONFIRMACAO_DA_ACAO_MANUAL.cancelar);
  assert.equal(confirmacaoDaAcaoManual(pago, 'reembolsado'), CONFIRMACAO_DA_ACAO_MANUAL.reembolsado);
  assert.equal(confirmacaoDaAcaoManual(naoPago, 'cancelar'), undefined);
  assert.equal(confirmacaoDaAcaoManual(pago, 'pago_cartao'), undefined);
  for (const frase of Object.values(CONFIRMACAO_DA_ACAO_MANUAL)) assert.match(frase, /^Confirmo: .*Os vouchers deixam de valer/);
  // a página: o botão das ações manuais leva a caixa pela regra; a rota confere antes e dentro da trava
  const pagina = codigo('app', 'admin', 'page.tsx');
  assert.match(pagina, /const confirmacao = confirmacaoDaAcaoManual\(r, acao\);/);
  assert.match(pagina, /confirmacao=\{a\.confirmacao\}/);
  const manuais = ROTA.slice(ROTA.indexOf('const manual = ACOES_MANUAIS[acao];'));
  const antes = manuais.indexOf("if (acaoManualPedeConfirmacao(alvo, acao) && !confirmou) return voltar('falta-confirmar');");
  const trava = manuais.indexOf('const atualizada = await atualizarReserva(alvo.codigo, (r) => {');
  const dentro = manuais.indexOf('if (acaoManualPedeConfirmacao(r, acao) && !confirmou) {');
  const grava = manuais.indexOf('r.status = manual.status;');
  assert.ok(antes !== -1 && antes < trava && trava < dentro && dentro < grava, `${antes} ${trava} ${dentro} ${grava}`);
});

/* ------------------------------------------------------------------ */
/* 8. A tela de resumo do cancelamento                                   */

const contexto = (parcial: Partial<ContextoDoResumo> = {}): ContextoDoResumo => ({
  agora: AGORA,
  saldo: null,
  emailLigado: true,
  descrever: (r) => `${r.tipo === 'transfer' ? 'Transfer' : r.passeio.nome} · ${r.data}`,
  volta: { filtro: 'pagas', busca: 'teste' },
  ...parcial,
});
const linha = (tela: TelaDoResumo, rotulo: string) => tela.linhas.find((l) => l.rotulo === rotulo)?.valor;

test('a tela do "Cancelar sem reembolso…": nada volta, os vouchers, o idioma, o e-mail, o motivo e a caixa; a trava em vermelho', () => {
  const p = agruparPedidos(doisVouchers({ idioma: 'es' }))[0];
  const tela = telaDoCancelamento(p, TUDO, contexto());
  assert.ok(tela);
  assert.equal(tela.titulo, TITULO_DO_CANCELAMENTO);
  assert.equal(tela.subtitulo, 'Pedido ON-PED234 · Teste da Silva');
  assert.deepEqual(
    tela.opcoes.map((o) => [o.rotulo, o.atual]),
    [
      ['O pedido inteiro (2 vouchers)', true],
      ['Só o voucher ON-AAA234', false],
      ['Só o voucher ON-BBB234', false],
    ],
  );
  assert.equal(tela.opcoes[2].href, '/admin/resumo/ON-PED234?acao=cancelar_item_sem_reembolso&voucher=ON-BBB234&status=pagas&q=teste');
  assert.deepEqual(linha(tela, 'Volta ao cliente'), [NADA_VOLTA]);
  assert.deepEqual(linha(tela, 'Deixam de valer'), [`ON-AAA234 · Escuna · 2026-12-20 · ${cifra(24200)}`, `ON-BBB234 · Escuna · 2026-12-21 · ${cifra(15400)}`]);
  assert.deepEqual(linha(tela, 'Idioma da compra'), [NOME_DO_IDIOMA.es]);
  const email = linha(tela, 'E-mail que o cliente recebe') ?? [];
  assert.equal(email[0], `«${fmt(TEXTOS_EMAIL.es.semReembolso.assuntoPedido, { codigo: 'ON-PED234' })}», para teste@exemplo.com, em ${NOME_DO_IDIOMA.es}.`);
  assert.match(email[2], /^Nenhuma opção de pedir estorno ou cancelamento/);
  // fora dos 7 dias: nenhum aviso, uma caixa só
  assert.deepEqual(tela.avisos, []);
  assert.deepEqual(tela.formulario, {
    acao: 'cancelar_sem_reembolso',
    codigoNaRota: 'ON-AAA234',
    confirmacoes: [{ nome: 'confirmo', texto: confirmacaoDoCancelamento(['ON-AAA234', 'ON-BBB234']) }],
    campos: [
      {
        tipo: 'escolha',
        nome: 'motivo',
        rotulo: 'Motivo',
        // os passeios de 20 e 21/12, daqui a semanas: só "Outro motivo" combina com a data (motivosQueCombinam), e a frase
        // embaixo diz por quê
        opcoes: [{ valor: 'outro', rotulo: ROTULO_DO_MOTIVO.outro }],
        ajuda: motivosQueNaoAparecem(['outro']),
      },
      {
        tipo: 'texto',
        nome: 'texto',
        rotulo: 'Só com "Outro motivo": o texto que o cliente lê',
        maximo: 200,
        ajuda: `O cliente comprou em ${NOME_DO_IDIOMA.es}: escreva nesse idioma. O texto vai ao cliente do jeito que você escrever, até 200 letras.`,
      },
    ],
    botao: 'Cancelar sem reembolso',
    perigo: true,
    nota: NOTA_DO_CANCELAMENTO,
  });
  assert.equal(tela.transferencia, null);
  // os passeios que já aconteceram: os três motivos, sem a frase
  const passados = agruparPedidos(doisVouchers({ data: '2026-11-25' }))[0];
  const campoDoMotivo = telaDoCancelamento(passados, TUDO, contexto())?.formulario?.campos[0];
  assert.deepEqual(campoDoMotivo, {
    tipo: 'escolha',
    nome: 'motivo',
    rotulo: 'Motivo',
    opcoes: MOTIVOS_SEM_REEMBOLSO.map((m) => ({ valor: m, rotulo: ROTULO_DO_MOTIVO[m] })),
  });
  // um voucher só: o campo voucher, no endereço dele, e o que continua valendo (com o link no e-mail)
  const doB = telaDoCancelamento(p, so('ON-BBB234'), contexto());
  assert.ok(doB?.formulario);
  assert.equal(doB.formulario.codigoNaRota, 'ON-BBB234');
  assert.equal(doB.formulario.voucher, 'ON-BBB234');
  assert.equal(doB.formulario.botao, 'Cancelar só o voucher ON-BBB234 sem reembolso');
  assert.deepEqual(linha(doB, 'Continua valendo'), [`ON-AAA234 · Escuna · 2026-12-20 · ${cifra(24200)}`]);
  assert.match((linha(doB, 'E-mail que o cliente recebe') ?? [])[1], /"O que continua valendo", os links do voucher ON-AAA234\.$/);
  assert.match(
    (linha(doB, 'E-mail que o cliente recebe') ?? [])[0],
    new RegExp(`^«${fmt(TEXTOS_EMAIL.es.semReembolso.assuntoVoucher, { voucher: 'ON-BBB234', codigo: 'ON-PED234' }).replace(/[()]/g, '\\$&')}»`),
  );
  // dentro dos 7 dias: o aviso vermelho e a segunda caixa
  const recente = agruparPedidos(doisVouchers({ pagamento: { metodo: 'cartao', pagoEm: PAGO_HA_2_DIAS } }))[0];
  const comTrava = telaDoCancelamento(recente, TUDO, contexto());
  assert.equal(comTrava?.avisos[0]?.tom, 'perigo');
  assert.match(comTrava?.avisos[0]?.texto ?? '', /o cliente tem direito ao dinheiro de volta/);
  assert.deepEqual(
    comTrava?.formulario?.confirmacoes.map((c) => c.nome),
    ['confirmo', 'ciente'],
  );
  // os e-mails desligados: o aviso de avisar por fora
  assert.match((linha(telaDoCancelamento(p, TUDO, contexto({ emailLigado: false })) as TelaDoResumo, 'E-mail que o cliente recebe') ?? [])[0], /desligados/);
  // o que a regra não deixa, a tela também não mostra
  assert.equal(telaDoCancelamento(agruparPedidos([voucher({ status: 'contestado' })])[0], TUDO, contexto()), null);
  assert.equal(telaDoCancelamento(p, so('ON-ZZZ234'), contexto()), null);
  assert.equal(enderecoDoResumo('ON-PED234', TUDO, {}), '/admin/resumo/ON-PED234?acao=cancelar_sem_reembolso');
  // a tela do "com reembolso" num pedido com um voucher cancelado sem reembolso: o "tudo" diz que o valor dele também volta
  const [a, b] = comCancelamento(doisVouchers({}, [undefined, 'cancelado']), { ...NAO_COMPARECEU, alcance: 'voucher', vouchers: ['ON-BBB234'] });
  const reembolso = telaDoReembolso(agruparPedidos([a, b])[0], { acao: 'reembolsar' }, contexto());
  assert.deepEqual(linha(reembolso as TelaDoResumo, 'Cancelado antes, sem reembolso'), [
    `ON-BBB234 · Escuna · 2026-12-21 · ${cifra(15400)}: o valor dele também volta`,
  ]);
  assert.deepEqual(linha(reembolso as TelaDoResumo, 'Deixa de valer'), [`ON-AAA234 · Escuna · 2026-12-20 · ${cifra(24200)}`]);
});

/* ------------------------------------------------------------------ */
/* 9. A página do cliente                                               */

test('a página do cliente: "Pedido cancelado" com o motivo e a regra nos 4 idiomas, sem WhatsApp e sem nenhuma opção de estorno', () => {
  // o "Desistir da compra" some: nenhum voucher vale mais
  const cancelados = comCancelamento(doisVouchers({ pagamento: { metodo: 'cartao', pagoEm: PAGO_HA_2_DIAS } }, ['cancelado', 'cancelado']), NAO_COMPARECEU);
  assert.equal(podeDesistir(cancelados, AGORA), false);
  assert.equal(estadoDaDesistencia(cancelados, AGORA), null);
  // com um voucher ainda valendo, o link continua para ele (a desistência é da compra)
  assert.equal(estadoDaDesistencia(doisVouchers({ pagamento: { metodo: 'cartao', pagoEm: PAGO_HA_2_DIAS } }, ['cancelado', undefined]), AGORA), 'disponivel');
  // nenhum convite a pedir estorno, cancelamento ou desistência, nem o WhatsApp (o "foi pedido" do motivo é o que o cliente fez)
  const PEDIR =
    /\b(?:request|ask for) (?:a |the )?(?:refund|cancellation)|pedir (?:o )?(?:reembolso|estorno|cancelamento)|solicit|peça|\bpida\b|\bpide\b|desistir|desistimiento|arrepent|WhatsApp/i;
  for (const idioma of IDIOMAS as readonly Idioma[]) {
    const d = dicionario(idioma);
    const textos = [
      d.pedido.canceladoSemReembolsoTexto,
      d.reserva.canceladoSemReembolsoTexto,
      d.pedido.motivoForaDaPolitica,
      d.pedido.motivoNaoCompareceu,
      d.pedido.motivoOutro,
      d.pedido.regraSemReembolso,
      d.pedido.regraGeralSemReembolso,
    ];
    for (const t of textos) {
      assert.ok(t.trim(), idioma);
      assert.doesNotMatch(t, PEDIR, `${idioma}: ${t}`);
    }
    // os três motivos, com o texto do "outro" como a equipe escreveu (sem os $ especiais do replace)
    const frases = (c: Pick<CancelamentoSemReembolso, 'motivo' | 'texto'>) => frasesDoCancelamentoSemReembolso(d.pedido, c);
    assert.deepEqual(frases({ motivo: 'nao-compareceu' }), { motivo: d.pedido.motivoNaoCompareceu, regra: d.pedido.regraSemReembolso });
    assert.deepEqual(frases({ motivo: 'fora-da-politica' }), { motivo: d.pedido.motivoForaDaPolitica, regra: d.pedido.regraSemReembolso });
    assert.deepEqual(frases({ motivo: 'outro', texto: 'Custa $& e $1' }), {
      motivo: d.pedido.motivoOutro.replace('{texto}', () => 'Custa $& e $1'),
      regra: d.pedido.regraGeralSemReembolso,
    });
    assert.ok(frases({ motivo: 'outro', texto: 'Custa $& e $1' }).motivo.endsWith('Custa $& e $1'), idioma);
    // a regra é a do item 6 da política (o cancelamento com menos de 24 horas e o não comparecimento)
    assert.match(d.pedido.regraSemReembolso, /\(item 6\)|\(punto 6\)/);
    assert.match(d.pedido.regraSemReembolso, /24/);
  }
  // o espanhol: sem "vos" no neutro, e o argentino igual (nenhum verbo muda)
  for (const t of [dicionario('es').pedido.canceladoSemReembolsoTexto, dicionario('es').pedido.regraSemReembolso, dicionario('es').reserva.canceladoSemReembolsoTexto])
    assert.deepEqual(suspeitasDeVos(t), [], t);
  assert.equal(dicionario('es-ar').pedido.regraSemReembolso, dicionario('es').pedido.regraSemReembolso);
  assert.equal(dicionario('es-ar').reserva.canceladoSemReembolsoTexto, dicionario('es').reserva.canceladoSemReembolsoTexto);

  // a página do pedido: o estado da tela é "cancelado" no pedido cancelado sem reembolso inteiro (o título, as frases, a
  // faixa e o WhatsApp); a lista dos itens diz "Itens do pedido"; o link da política, só nele
  const pedido = codigo('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  assert.match(pedido, /const canceladoSemReembolso = pedidoCanceladoSemReembolso\(reservas\);/);
  assert.match(pedido, /const \{ titulo, texto \} = cabecalho\[estado\];/);
  assert.match(pedido, /mostrarWhatsApp\(estado\)/);
  assert.doesNotMatch(pedido, /mostrarWhatsApp\(status\)/);
  assert.match(pedido, /\{pago && !canceladoSemReembolso \? d\.pedido\.vouchers : d\.pedido\.itens\}/);
  assert.match(pedido, /\{canceladoSemReembolso && \(\s+<p className="mt-4">\s+<a href=\{rota\(locale, '\/politica-de-cancelamento'\)\}/);
  assert.match(pedido, /d\.pedido\.canceladoSemReembolsoTexto,/);
  // a página da reserva: o motivo e a regra do voucher (paraPublico), e o link da política só nela
  const status = codigo('components', 'StatusReserva.tsx');
  assert.match(status, /\{r\.status === 'cancelado' && r\.semReembolso && politica && \(/);
  const publica = codigo('lib', 'reserva-publica.ts');
  assert.match(publica, /const semReembolso = canceladoSemReembolso\(r\) \? cancelamentoDoVoucher\(r\.pagamento, r\.codigo\) : undefined;/);
  // Etapa 7, pacote 2: na casa, o motivo e a regra das casas (ehCasa)
  assert.match(
    publica,
    /\.\.\.\(semReembolso \? \{ semReembolso: frasesDoCancelamentoSemReembolso\(d\.pedido, semReembolso, ehCasa\(r\)\) \} : \{\}\),/,
  );
  // o voucher cancelado não tem PDF: a rota do voucher só entrega o que vale (statusDoVoucher, a regra do item)
  const pdf = codigo('app', 'api', 'voucher', '[codigo]', 'route.ts');
  assert.match(pdf, /if \(statusDoVoucher\(reserva\) !== 'pago'\) return semVoucher\(new URL\(pagina, req\.url\)\);/);
});

/* ------------------------------------------------------------------ */
/* 10. Os e-mails nos 4 idiomas                                          */

const SITE = { url: 'https://orlanativa.online', logo: 'https://orlanativa.online/logo.png', nome: 'Orla Nativa', dominio: 'orlanativa.online' };
const POLITICA = 'https://orlanativa.online/politica-de-cancelamento';
const dados = (idioma: Idioma, comVoucher = false) => ({
  idioma,
  nome: 'Ana Souza',
  codigo: 'ON-7K3P9Q',
  linkPedido: 'https://orlanativa.online/pedido/ON-7K3P9Q?t=abc',
  itens: [
    {
      nome: 'Passeio de Escuna em Búzios',
      linhas: ['sáb., 14 nov. 2026 às 10h', '2 adultos'],
      ...(comVoucher
        ? { voucher: { codigo: 'ON-AB2CD3', link: 'https://orlanativa.online/reserva/ON-AB2CD3?t=x', pdf: 'https://orlanativa.online/api/voucher/ON-AB2CD3?t=x' } }
        : {}),
    },
  ],
  site: SITE,
});

test('os e-mails novos nos 4 idiomas: o motivo, a regra da política, o link dela e nenhuma opção de pedir estorno', () => {
  const PEDIR =
    /\b(?:request|ask for) (?:a |the )?(?:refund|cancellation)|pedir (?:o )?(?:reembolso|estorno|cancelamento)|solicit|peça|\bpida\b|\bpide\b|desist|arrepent|wa\.me|WhatsApp/i;
  const motivos: MotivoDoEmail[] = [{ tipo: 'fora-da-politica' }, { tipo: 'nao-compareceu' }, { tipo: 'outro', texto: 'A <b>lancha</b> & o mar' }];
  for (const idioma of IDIOMAS as readonly Idioma[]) {
    const S = TEXTOS_EMAIL[idioma].semReembolso;
    for (const motivo of motivos) {
      const doPedido = emailPedidoCanceladoSemReembolso({ ...dados(idioma), motivo, linkPolitica: POLITICA });
      const doVoucher = emailVoucherCancelado({
        ...dados(idioma, true),
        voucher: { codigo: 'ON-XY7ZK2', nome: 'City Tour em Búzios' },
        motivo,
        linkPolitica: POLITICA,
      });
      const onde = `${idioma} ${motivo.tipo}`;
      assert.equal(doPedido.assunto, fmt(S.assuntoPedido, { codigo: 'ON-7K3P9Q' }), onde);
      assert.equal(doVoucher.assunto, fmt(S.assuntoVoucher, { voucher: 'ON-XY7ZK2', codigo: 'ON-7K3P9Q' }), onde);
      const frase = motivo.tipo === 'outro' ? fmt(S.motivoOutro, { texto: motivo.texto ?? '' }) : motivo.tipo === 'nao-compareceu' ? S.motivoNaoCompareceu : S.motivoForaDaPolitica;
      const regra = motivo.tipo === 'outro' ? S.regraGeral : S.regra;
      for (const m of [doPedido, doVoucher]) {
        // o motivo e a regra no texto e no HTML (o texto da equipe escapado: nada vira marcação)
        assert.ok(m.texto.includes(frase) && m.texto.includes(regra), onde);
        assert.ok(m.html.includes(escaparHtml(frase)) && m.html.includes(escaparHtml(regra)), onde);
        assert.ok(!m.html.includes('<b>lancha</b>'), `${onde}: o texto da equipe não vira HTML`);
        // o link da política no rodapé, e nenhuma opção de pedir estorno ou cancelamento
        assert.ok(m.html.includes(`href="${POLITICA}"`), `${onde}: o link da política`);
        assert.doesNotMatch(m.texto, PEDIR, onde);
        for (const parte of [m.assunto, m.html, m.texto]) assert.doesNotMatch(parte, /\{\w+\}/, `${onde}: marcador sobrando`);
      }
      // o do pedido inteiro: os vouchers não valem mais, e os itens cancelados sem link de voucher
      assert.ok(doPedido.texto.includes(S.semValer) && doPedido.texto.includes(S.textoPedido), onde);
      assert.ok(!doPedido.html.includes('/reserva/'), `${onde}: nenhum link de voucher no pedido cancelado`);
      // o do voucher: o código e o nome, e "O que continua valendo" com os links dos outros vouchers
      assert.ok(doVoucher.texto.includes(fmt(S.textoVoucher, { voucher: 'ON-XY7ZK2 (City Tour em Búzios)' })), onde);
      assert.ok(doVoucher.texto.includes(TEXTOS_EMAIL[idioma].reembolso.aindaValem), onde);
      assert.ok(doVoucher.html.includes('https://orlanativa.online/reserva/ON-AB2CD3?t=x'), `${onde}: o link do que continua valendo`);
    }
    // sem nenhum voucher valendo (o último cancelado), sem a lista
    const ultimo = emailVoucherCancelado({ ...dados(idioma), itens: [], voucher: { codigo: 'ON-XY7ZK2' }, motivo: { tipo: 'nao-compareceu' }, linkPolitica: POLITICA });
    assert.ok(!ultimo.texto.includes(TEXTOS_EMAIL[idioma].reembolso.aindaValem), idioma);
  }
  // o espanhol neutro sem "vos", e o argentino com as mesmas frases (nenhum verbo muda)
  for (const t of Object.values(TEXTOS_EMAIL.es.semReembolso)) assert.deepEqual(suspeitasDeVos(t), [], t);
  assert.deepEqual(TEXTOS_EMAIL['es-ar'].semReembolso, TEXTOS_EMAIL.es.semReembolso);
  // os dois são essenciais na cota, entram no cartão das estatísticas e são do cliente
  for (const tipo of ['pedido-cancelado-sem-reembolso', 'voucher-cancelado'] as const) {
    assert.equal(emailEssencial(tipo), true, tipo);
    assert.equal(EMAILS_AUTOMATICOS[tipo].para, 'cliente', tipo);
  }
});

test('quando o e-mail novo sai: o cancelamento gravado, o pedido ainda pago, os vouchers cancelados e uma vez só', () => {
  const [a, b] = comCancelamento(doisVouchers({}, ['cancelado', 'cancelado']), NAO_COMPARECEU);
  const sai = emailSemReembolsoSai(a, [a, b], { tipo: 'pedido' });
  assert.deepEqual(sai, { sai: true, cancelamento: NAO_COMPARECEU, cancelados: ['ON-AAA234', 'ON-BBB234'], aindaValem: [] });
  // já saiu (a marca dele, que não se confunde com a do "Pedido cancelado" de antes)
  const comMarca = { ...a, historico: [...a.historico, { em: AGORA.toISOString(), evento: MARCA_DO_EMAIL_DO_PEDIDO_SEM_REEMBOLSO }] };
  assert.deepEqual(emailSemReembolsoSai(comMarca, [comMarca, b], { tipo: 'pedido' }), { sai: false, motivo: 'já saiu' });
  assert.ok(!MARCA_DO_EMAIL_DO_PEDIDO_SEM_REEMBOLSO.startsWith(MARCA_DO_EMAIL_DO_CANCELAMENTO));
  // o pedido reembolsado ou contestado no meio-tempo; os vouchers ainda não cancelados; sem cancelamento gravado
  assert.deepEqual(emailSemReembolsoSai({ ...a, status: 'reembolsado' }, [a, b], { tipo: 'pedido' }), { sai: false, motivo: 'pedido reembolsado' });
  assert.equal(emailSemReembolsoSai(a, [a, { ...b, statusItem: undefined } as Reserva], { tipo: 'pedido' }).sai, false);
  assert.equal(emailSemReembolsoSai(voucher(), [voucher()], { tipo: 'pedido' }).sai, false);
  // o de um voucher só: o cancelamento do voucher, e o que continua valendo
  const doB: CancelamentoSemReembolso = { alcance: 'voucher', vouchers: ['ON-BBB234'], motivo: 'fora-da-politica', em: AGORA.toISOString() };
  const [x, y] = comCancelamento(doisVouchers({}, [undefined, 'cancelado']), doB);
  assert.deepEqual(emailSemReembolsoSai(x, [x, y], { tipo: 'voucher', voucher: 'ON-BBB234' }), {
    sai: true,
    cancelamento: doB,
    cancelados: ['ON-BBB234'],
    aindaValem: ['ON-AAA234'],
  });
  // o do pedido inteiro não sai para um cancelamento de voucher (e o contrário)
  assert.equal(emailSemReembolsoSai(x, [x, y], { tipo: 'pedido' }).sai, false);
  assert.equal(emailSemReembolsoSai(a, [a, b], { tipo: 'voucher', voucher: 'ON-BBB234' }).sai, false);
  // o aviso do e-mail que não saiu fecha com a marca do mesmo e-mail
  assert.deepEqual(marcasQueFechamOAviso(avisoDoEmailSemReembolsoQueNaoSaiu('o Resend não respondeu')), [MARCA_DO_EMAIL_DO_PEDIDO_SEM_REEMBOLSO]);
  assert.deepEqual(marcasQueFechamOAviso(avisoDoEmailSemReembolsoQueNaoSaiu('a cota de e-mails acabou', 'ON-BBB234')), [
    marcaDoEmailDoVoucherCancelado('ON-BBB234'),
  ]);
  assert.ok(avisoDoEmailSemReembolsoQueNaoSaiu('x').startsWith('Aviso:'));
});

/* ------------------------------------------------------------------ */
/* 11. O painel e as estatísticas: continua venda (P3)                  */

test('o pedido cancelado sem reembolso continua venda nas estatísticas (P3) e entra no filtro "Recusados / cancelados"', () => {
  const cancelados = comCancelamento(
    doisVouchers({ pagamento: { metodo: 'cartao', pagoEm: '2026-11-02T15:00:00.000Z' } }, ['cancelado', 'cancelado']),
    NAO_COMPARECEU,
  );
  const e = calcularEstatisticas(cancelados, [], { chave: 'outro', periodo: { de: '2026-11-01', ate: '2026-11-07' } });
  assert.equal(e.resumo.pedidos, 1);
  assert.equal(e.resumo.centavos, 39600);
  assert.equal(e.resumo.itens, 2);
  // o painel: o filtro "Recusados / cancelados" com o pedido cancelado sem reembolso inteiro (ele continua pago)
  const pagina = codigo('app', 'admin', 'page.tsx');
  assert.match(pagina, /ou: \(p\) => pedidoCanceladoSemReembolso\(p\.itens\),/);
  assert.match(pagina, /\(!filtro\.status \|\| filtro\.status\.includes\(p\.status\) \|\| Boolean\(filtro\.ou\?\.\(p\)\)\)/);
  // e o "Cancelar sem reembolso…" do cartão, pela regra única, ao lado do "Reembolsar na Stripe…", só com o segredo do
  // painel criado na Vercel (decisão P14; tests/segredo-do-painel.test.ts)
  assert.match(pagina, /const semReembolso = segredoDoPainelCriado\(\) && planoDoCancelamento\(p\.itens, \{ acao: 'cancelar_sem_reembolso' \}, new Date\(\)\)\.ok;/);
  assert.match(pagina, /\{semReembolso && <CancelarSemReembolso p=\{p\} filtro=\{filtro\} busca=\{busca\} \/>\}/);
  assert.match(pagina, /href=\{enderecoDoResumo\(p\.codigo, \{ acao: 'cancelar_sem_reembolso' \}, \{ filtro, busca \}\)\}/);
});

/* ------------------------------------------------------------------ */
/* 12. A revisão do Pacote 33 (26/11)                                   */

/** Uma data e hora no horário de Brasília, como o painel escreve. */
const dataHora = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

/** O pedido de desistência pelo site, gravado como a rota grava (a linha do histórico), na hora `chegou`; depois, `depois`. */
const comDesistenciaPeloSite = (vouchers: Reserva[], pagoEm: string, chegou: string, ...depois: string[]): Reserva[] =>
  vouchers.map(
    (v) =>
      ({
        ...v,
        pagamento: { ...v.pagamento, pagoEm },
        historico: [
          { em: pagoEm, evento: 'Pago (webhook da Stripe)' },
          { em: chegou, evento: linhaDaDesistencia('mudei de ideia', { compraEm: pagoEm, agora: new Date(chegou) }) },
          ...historico(new Date(Date.parse(chegou) + 60_000).toISOString(), ...depois),
        ],
      }) as Reserva,
  );

test('a trava pela desistência: a desistência pedida pelo site dentro dos 7 dias trava o "sem reembolso" também depois do 7º dia', () => {
  const PAGO = '2026-11-17T12:00:00.000Z';
  const CHEGOU = '2026-11-22T12:00:00.000Z';
  // pago em 17/11, desistência pelo site em 22/11 (5º dia), passeios em 20 e 21/12; hoje, 26/11 (9º dia)
  const vouchers = comDesistenciaPeloSite(doisVouchers(), PAGO, CHEGOU);
  const esperada = { compraEm: PAGO, dias: 5, desistenciaEm: CHEGOU };
  // a trava da compra sozinha não vale mais (9 dias), mas a da desistência vale, pela regra única
  assert.equal(travaDosSeteDias(vouchers[0], vouchers, AGORA), null);
  assert.deepEqual(travaPelaDesistencia(vouchers[0]), esperada);
  const plano = planoDoCancelamento(vouchers, TUDO, AGORA);
  assert.ok(plano.ok);
  assert.deepEqual(plano.trava, esperada);
  // a desistência ainda espera resposta (o que a faixa do topo conta)
  assert.equal(desistenciaParaResponder(vouchers), true);
  // um voucher só também
  const doB = planoDoCancelamento(vouchers, so('ON-BBB234'), AGORA);
  assert.ok(doB.ok);
  assert.deepEqual(doB.trava, esperada);
  // com uma parte já devolvida (o voucher A reembolsado sozinho): a trava continua no "sem reembolso" do resto, e o botão
  // "Desistência respondida (o resto do pedido segue pago)" continua como antes, sem trava
  const comParte = comDesistenciaPeloSite(doisVouchers({ reembolsoCentavos: 24200 }, ['reembolsado', undefined]), PAGO, CHEGOU);
  const planoDaParte = planoDoCancelamento(comParte, TUDO, AGORA);
  assert.ok(planoDaParte.ok);
  assert.deepEqual(
    planoDaParte.cancelar.map((v) => v.codigo),
    ['ON-BBB234'],
  );
  assert.deepEqual(planoDaParte.trava, esperada);
  assert.equal(travaDaDesistencia(comParte[0]), null);
  // respondida ou não: o direito foi pedido no prazo, e o painel avisa de novo
  const respondida = comDesistenciaPeloSite(doisVouchers(), PAGO, CHEGOU, DESISTENCIA_RESPONDIDA);
  const planoRespondida = planoDoCancelamento(respondida, TUDO, AGORA);
  assert.ok(planoRespondida.ok);
  assert.deepEqual(planoRespondida.trava, esperada);
  // a desistência que chegou depois dos 7 dias: sem trava (vale a política)
  const tarde = comDesistenciaPeloSite(doisVouchers(), PAGO, '2026-11-25T12:00:00.000Z');
  const planoTarde = planoDoCancelamento(tarde, TUDO, AGORA);
  assert.ok(planoTarde.ok);
  assert.equal(planoTarde.trava, null);

  // a tela: o aviso vermelho com as duas datas (nada de "paga há 9 dias") e a caixa "Estou ciente"
  const tela = telaDoCancelamento(agruparPedidos(vouchers)[0], TUDO, contexto());
  assert.ok(tela?.formulario);
  assert.equal(tela.avisos[0]?.tom, 'perigo');
  const aviso = tela.avisos[0]?.texto ?? '';
  assert.ok(
    aviso.startsWith(
      `Atenção: a desistência que o cliente pediu pelo site chegou dentro dos 7 dias do arrependimento (compra paga em ${dataHora(PAGO)}, desistência em ${dataHora(CHEGOU)}; art. 49 do Código de Defesa do Consumidor), antes do serviço: o cliente tem direito ao dinheiro de volta.`,
    ),
    aviso,
  );
  assert.match(aviso, /"Estou ciente"/);
  assert.doesNotMatch(aviso, /há \d+ dias|ainda não começou/);
  assert.equal(aviso, avisoDosSeteDias(esperada));
  assert.deepEqual(
    tela.formulario.confirmacoes.map((c) => c.nome),
    ['confirmo', 'ciente'],
  );

  // a conferência dentro da trava: sem a caixa, nada; com ela, grava com a linha da trava no histórico
  const registro = registroDoCancelamento(
    TUDO,
    ['ON-AAA234', 'ON-BBB234'],
    { motivo: 'outro', texto: 'Remarcado para data sem vaga' },
    AGORA,
    true,
  );
  assert.deepEqual(conferirNaTrava(structuredClone(vouchers[0]), vouchers, TUDO, registro, AGORA, false), { resultado: 'falta-ciente' });
  assert.deepEqual(conferirNaTrava(structuredClone(vouchers[0]), vouchers, TUDO, registro, AGORA, true), {
    resultado: 'gravar',
    trava: esperada,
  });
  const linhas = aplicarCancelamento(structuredClone(vouchers[0]), registro, esperada);
  assert.equal(linhas.length, 2);
  assert.equal(
    linhas[1],
    `${INICIO_DA_TRAVA_DOS_SETE_DIAS}: o painel avisou que a desistência pedida pelo site chegou dentro dos 7 dias do arrependimento (compra paga em ${dataHora(PAGO)}, desistência em ${dataHora(CHEGOU)}), antes do serviço, e que o cliente tem direito ao dinheiro de volta; a equipe marcou "Estou ciente" e seguiu com o cancelamento sem reembolso`,
  );
  // a linha do botão da desistência continua a de antes
  assert.equal(
    linhaDaTravaDosSeteDias(esperada, 'desistencia'),
    `${INICIO_DA_TRAVA_DOS_SETE_DIAS}: o painel avisou que a desistência chegou dentro dos 7 dias do arrependimento (paga em ${dataHora(PAGO)}), com o serviço ainda por começar, e que o cliente tem direito ao dinheiro de volta; a equipe marcou "Estou ciente" e respondeu sem reembolso`,
  );

  // a variante com o passeio já feito: pago no dia 22, desistência no dia 23, passeio no dia 24 e cancelamento no dia 26 (a
  // compra ainda nos 7 dias, mas o serviço já começou: só a trava da desistência vale)
  const feito = comDesistenciaPeloSite([voucher({ data: '2026-11-24' })], '2026-11-22T12:00:00.000Z', '2026-11-23T12:00:00.000Z');
  assert.equal(travaDosSeteDias(feito[0], feito, AGORA), null);
  const planoFeito = planoDoCancelamento(feito, TUDO, AGORA);
  assert.ok(planoFeito.ok);
  assert.deepEqual(planoFeito.trava, { compraEm: '2026-11-22T12:00:00.000Z', dias: 1, desistenciaEm: '2026-11-23T12:00:00.000Z' });
  // e o "não compareceu" combina com a data (o passeio já começou)
  assert.equal(motivoCombinaComAData('nao-compareceu', planoFeito.cancelar, AGORA), true);
});

test('o motivo combina com a data do serviço: "fora da política" só a menos de 24 horas do início, "não compareceu" só depois dele', () => {
  // hoje, 26/11, 9h em Búzios (meio-dia UTC)
  const em = (data: string, hora = '09:00') => voucher({ data, horario: { hora, busca: false } });
  // daqui a 3 semanas: só "outro" (o pedido feito até agora veio com 24 horas ou mais: reembolso integral, item 3)
  assert.deepEqual(motivosQueCombinam([em('2026-12-17')], AGORA), ['outro']);
  // daqui a exatamente 24 horas: ainda não é "menos de 24 horas"
  assert.deepEqual(motivosQueCombinam([em('2026-11-27', '09:00')], AGORA), ['outro']);
  // daqui a 23 horas: "fora da política" vale; "não compareceu", ainda não
  assert.deepEqual(motivosQueCombinam([em('2026-11-27', '08:00')], AGORA), ['fora-da-politica', 'outro']);
  // já começou (há uma hora) ou já passou: os três
  assert.deepEqual(motivosQueCombinam([em('2026-11-26', '08:00')], AGORA), [...MOTIVOS_SEM_REEMBOLSO]);
  assert.deepEqual(motivosQueCombinam([em('2026-11-20')], AGORA), [...MOTIVOS_SEM_REEMBOLSO]);
  // a data que não dá para ler deixa passar
  assert.deepEqual(motivosQueCombinam([em('sem data')], AGORA), [...MOTIVOS_SEM_REEMBOLSO]);
  // dois vouchers: vale o que combina com os dois
  assert.deepEqual(motivosQueCombinam([em('2026-11-20'), em('2026-12-17')], AGORA), ['outro']);
  assert.deepEqual(motivosQueCombinam([em('2026-11-20'), em('2026-11-27', '08:00')], AGORA), ['fora-da-politica', 'outro']);
  assert.equal(motivoCombinaComAData('fora-da-politica', [em('2026-12-17')], AGORA), false);
  assert.equal(motivoCombinaComAData('nao-compareceu', [em('2026-12-17')], AGORA), false);
  assert.equal(motivoCombinaComAData('outro', [em('2026-12-17')], AGORA), true);
  // a frase da tela, quando algum motivo não aparece
  assert.match(
    motivosQueNaoAparecem(['outro']) ?? '',
    /^"Fora da política" e "Não compareceu" não aparecem: .*\(item 3\), .*reembolso integral\.$/,
  );
  assert.equal(motivosQueNaoAparecem(['fora-da-politica', 'outro']), '"Não compareceu" só aparece depois do horário de início do serviço.');
  assert.equal(motivosQueNaoAparecem([...MOTIVOS_SEM_REEMBOLSO]), undefined);
  // a tela de um passeio daqui a 23 horas: os dois motivos que valem, com a frase
  const campo = telaDoCancelamento(agruparPedidos([em('2026-11-27', '08:00')])[0], TUDO, contexto())?.formulario?.campos[0];
  assert.ok(campo?.tipo === 'escolha');
  assert.deepEqual(
    campo.opcoes.map((o) => o.valor),
    ['fora-da-politica', 'outro'],
  );
  assert.equal(campo.ajuda, '"Não compareceu" só aparece depois do horário de início do serviço.');
  // a rota confere de novo, depois do motivo do formulário e antes da caixa "Estou ciente", com a frase fixa do painel
  const trecho = trechoDaAcao('cancelar_sem_reembolso');
  const motivo = trecho.indexOf('if (!motivo.ok) return voltar(motivo.erro);');
  // revisão do pacote 2 das casas: o quarto argumento é o momento do pedido do cliente, que só a regra das casas lê (sem
  // casa, o campo do dia nem é lido, e a conta dos passeios continua sendo a de agora)
  const data = trecho.indexOf(
    "if (!motivoCombinaComAData(motivo.motivo, plano.cancelar, agora, pedido.em)) return voltar('motivo-fora-da-data');",
  );
  const ciente = trecho.indexOf("if (plano.trava && !ciente) return voltar('falta-ciente');");
  assert.ok(motivo !== -1 && motivo < data && data < ciente, `${motivo} ${data} ${ciente}`);
  assert.ok(trecho.indexOf("const informado = comCasa ? String(form.get('pedidoEm') ?? '').trim() : '';") > motivo);
  // sem casa, o momento do pedido não muda nada nos passeios: qualquer dia dá os mesmos motivos de agora
  for (const v of [em('2026-12-17'), em('2026-11-27', '08:00'), em('2026-11-26', '08:00')]) {
    assert.deepEqual(motivosQueCombinam([v], AGORA, new Date('2026-11-01T12:00:00Z')), motivosQueCombinam([v], AGORA));
  }
  assert.match(ERROS_DO_PAINEL['motivo-fora-da-data'], /^Este motivo não combina com a data do serviço: .*Nada foi feito\.$/);
  assert.equal(fraseDoErro('motivo-fora-da-data'), ERROS_DO_PAINEL['motivo-fora-da-data']);
  // a página desenha a frase embaixo da escolha
  const pagina = codigo('app', 'admin', 'resumo', '[codigo]', 'page.tsx');
  assert.match(pagina, /\{campo\.ajuda && <p className="ajuda">\{campo\.ajuda\}<\/p>\}\s+<\/fieldset>/);
});

test('a devolução por outro meio com um voucher cancelado sem reembolso: o pedido continua pago e conta como venda, nas duas ordens', () => {
  const PIX = { metodo: 'pix' as const, pagoEm: '2026-08-01T15:00:00.000Z' };
  const doB: CancelamentoSemReembolso = { alcance: 'voucher', vouchers: ['ON-BBB234'], motivo: 'nao-compareceu', em: AGORA.toISOString() };
  /** O que a rota grava no 'voucher_por_fora' do voucher A: o valor dele, o voucher devolvido e, se for o último, o pedido reembolsado. */
  const devolverAPorFora = (vouchers: Reserva[]): Reserva[] => {
    const status = ultimoVoucherDoPedido(vouchers, 'ON-AAA234') ? ('reembolsado' as const) : vouchers[0].status;
    return vouchers.map(
      (v) =>
        ({
          ...v,
          status,
          reembolsoCentavos: 24200,
          ...(v.codigo === 'ON-AAA234' ? { statusItem: 'reembolsado' as const } : {}),
        }) as Reserva,
    );
  };
  /** O que o "Cancelar só o voucher ON-BBB234 sem reembolso" grava: o voucher cancelado e o cancelamento no JSON do pagamento. */
  const cancelarB = (vouchers: Reserva[]): Reserva[] =>
    comCancelamento(
      vouchers.map((v) => (v.codigo === 'ON-BBB234' ? ({ ...v, statusItem: 'cancelado' } as Reserva) : v)),
      doB,
    );
  const inicio = doisVouchers({ pagamento: PIX });
  // B cancelado sem reembolso antes: A não é o último (o dinheiro de B ficou)
  assert.equal(ultimoVoucherDoPedido(cancelarB(inicio), 'ON-AAA234'), false);
  const ordens: Record<string, Reserva[]> = {
    'cancelar e depois devolver': devolverAPorFora(cancelarB(inicio)),
    'devolver e depois cancelar': cancelarB(devolverAPorFora(inicio)),
  };
  for (const [ordem, final] of Object.entries(ordens)) {
    assert.equal(final[0].status, 'pago', ordem);
    assert.equal(pedidoCanceladoSemReembolso(final), true, ordem);
    assert.equal(seloDoPedidoNoPainel(agruparPedidos(final)[0]), 'Cancelado sem reembolso', ordem);
    assert.equal(statusDoVoucherNoPainel(final[1]), 'Cancelado sem reembolso', ordem);
    // a venda: R$ 396,00 recebidos menos R$ 242,00 devolvidos (P3: o dinheiro de B ficou)
    const e = calcularEstatisticas(final, [], { chave: 'outro', periodo: { de: '2026-08-01', ate: '2026-08-07' } });
    assert.equal(e.resumo.pedidos, 1, ordem);
    assert.equal(e.resumo.centavos, 15400, ordem);
  }
  // sem voucher cancelado sem reembolso, o de sempre: o último voucher pago devolvido leva o pedido a reembolsado
  assert.equal(ultimoVoucherDoPedido(doisVouchers({ pagamento: PIX }, [undefined, 'reembolsado']), 'ON-AAA234'), true);
  assert.equal(ultimoVoucherDoPedido(doisVouchers({ pagamento: PIX }), 'ON-AAA234'), false);
  assert.equal(ultimoVoucherDoPedido(doisVouchers({ pagamento: PIX }, [undefined, 'usado']), 'ON-AAA234'), false);
  // o voucher cancelado do jeito de antes (sem o registro do "sem reembolso") não segura
  assert.equal(ultimoVoucherDoPedido(doisVouchers({ pagamento: PIX }, [undefined, 'cancelado']), 'ON-AAA234'), true);
  // a rota usa esta regra
  assert.match(trechoDaAcao('voucher_por_fora'), /const ultimo = ultimoVoucherDoPedido\(vouchers, voucher\);/);
});

test('o "Reativar o pedido (fica pago)" repetido não faz voltar a valer o voucher cancelado sem reembolso depois da reativação', () => {
  const doB: CancelamentoSemReembolso = { alcance: 'voucher', vouchers: ['ON-BBB234'], motivo: 'nao-compareceu', em: AGORA.toISOString() };
  const [a, b] = comCancelamento(doisVouchers({}, [undefined, 'cancelado']), doB);
  assert.deepEqual(irmaosAindaCancelados([a, b], 'ON-AAA234'), []);
  // o irmão que ficou cancelado pela volta que falhou na reativação (sem o registro do "sem reembolso") continua voltando
  const [x, y] = doisVouchers({}, [undefined, 'cancelado']);
  assert.deepEqual(
    irmaosAindaCancelados([x, y], 'ON-AAA234').map((v) => v.codigo),
    ['ON-BBB234'],
  );
  // a rota roda a mesma regra no laço e na condição do toque repetido
  assert.match(ROTA, /for \(const v of irmaosAindaCancelados\(releitura, alvo\.codigo\)\) \{/);
  assert.match(ROTA, /pagoPeloRetidoReativado\(alvo\) &&\s+irmaosAindaCancelados\(vouchers, alvo\.codigo\)\.length/);
});

test('a regra da política que o cliente lê: o item 6 com a ressalva do começo dele, nas palavras da política, no e-mail e nas páginas', () => {
  const COMECO = {
    pt: 'Pela nossa política de cancelamento (item 6), ',
    en: 'Under our cancellation policy (item 6), ',
    es: 'Según nuestra política de cancelación (punto 6), ',
  } as const;
  for (const idioma of ['pt', 'en', 'es'] as const) {
    const item6 = CANCELAMENTO[idioma].secoes.find((s) => s.titulo.startsWith('6.'))?.paragrafos[0] ?? '';
    // "Fora das situações dos itens 2, 4 e 5, …" vira "… (item 6), fora das situações dos itens 2, 4 e 5, …"
    const esperada = `${COMECO[idioma]}${item6.charAt(0).toLowerCase()}${item6.slice(1)}`;
    assert.match(esperada, /\b2, 4 (?:e|and|y) 5, /, idioma);
    assert.equal(dicionario(idioma).pedido.regraSemReembolso, esperada, idioma);
    assert.equal(TEXTOS_EMAIL[idioma].semReembolso.regra, esperada, idioma);
  }
  assert.equal(dicionario('es-ar').pedido.regraSemReembolso, dicionario('es').pedido.regraSemReembolso);
  assert.equal(TEXTOS_EMAIL['es-ar'].semReembolso.regra, TEXTOS_EMAIL.es.semReembolso.regra);
});

test('o pedido cancelado sem reembolso com uma parte já devolvida: "o restante do seu pedido", na página e no e-mail, nos 4 idiomas', () => {
  const PEDIR =
    /\b(?:request|ask for) (?:a |the )?(?:refund|cancellation)|pedir (?:o )?(?:reembolso|estorno|cancelamento)|solicit|peça|\bpida\b|\bpide\b|desist|arrepent|wa\.me|WhatsApp/i;
  for (const idioma of IDIOMAS as readonly Idioma[]) {
    const d = dicionario(idioma);
    const S = TEXTOS_EMAIL[idioma].semReembolso;
    for (const t of [
      d.pedido.canceladoSemReembolsoComParteTexto,
      d.pedido.voucherCanceladoSemReembolso,
      S.textoPedidoComParte,
      S.preCabecalhoPedidoComParte,
    ]) {
      assert.ok(t.trim(), idioma);
      assert.doesNotMatch(t, PEDIR, `${idioma}: ${t}`);
    }
    // o e-mail do pedido inteiro com uma parte devolvida antes: a primeira frase e o pré-cabeçalho dizem "o restante"
    const comParte = emailPedidoCanceladoSemReembolso({
      ...dados(idioma),
      motivo: { tipo: 'nao-compareceu' },
      linkPolitica: POLITICA,
      parteDevolvida: true,
    });
    assert.ok(comParte.texto.includes(S.textoPedidoComParte), idioma);
    assert.ok(!comParte.texto.includes(S.textoPedido), idioma);
    assert.ok(comParte.html.includes(escaparHtml(S.preCabecalhoPedidoComParte)), idioma);
    assert.doesNotMatch(comParte.texto, PEDIR, idioma);
    // sem parte devolvida, a de sempre
    const semParte = emailPedidoCanceladoSemReembolso({ ...dados(idioma), motivo: { tipo: 'nao-compareceu' }, linkPolitica: POLITICA });
    assert.ok(semParte.texto.includes(S.textoPedido) && !semParte.texto.includes(S.textoPedidoComParte), idioma);
  }
  // o espanhol: sem "vos" no neutro, e o argentino igual (nenhum verbo muda)
  for (const t of [
    dicionario('es').pedido.canceladoSemReembolsoComParteTexto,
    dicionario('es').pedido.voucherCanceladoSemReembolso,
    TEXTOS_EMAIL.es.semReembolso.textoPedidoComParte,
  ])
    assert.deepEqual(suspeitasDeVos(t), [], t);
  assert.equal(dicionario('es-ar').pedido.canceladoSemReembolsoComParteTexto, dicionario('es').pedido.canceladoSemReembolsoComParteTexto);
  assert.equal(dicionario('es-ar').pedido.voucherCanceladoSemReembolso, dicionario('es').pedido.voucherCanceladoSemReembolso);
  // quem manda: o e-mail do pedido inteiro diz "o restante" quando o pedido já tem valor devolvido
  assert.match(codigo('lib', 'email', 'pedidos.ts'), /parteDevolvida: \(r\.reembolsoCentavos \?\? 0\) > 0,/);
  // a página do pedido: a mesma regra, o motivo no alto só quando há um só, e a linha de cada voucher cancelado sem
  // reembolso com o motivo embaixo e o link da página dele (onde ficam o motivo e a regra)
  const pedido = codigo('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  assert.match(pedido, /reembolso > 0 \? d\.pedido\.canceladoSemReembolsoComParteTexto : d\.pedido\.canceladoSemReembolsoTexto,/);
  assert.match(pedido, /\.\.\.\(motivosDoSemReembolso\.length === 1 \? motivosDoSemReembolso : \[\]\),/);
  assert.match(pedido, /\{r\.semReembolso \? d\.pedido\.voucherCanceladoSemReembolso : statusDoItem\(r\)\}/);
  assert.match(pedido, /<p className="mt-1 text-small">\{r\.semReembolso\.motivo\}<\/p>/);
  assert.match(
    pedido,
    /<a href=\{linkDoVoucher\(r\)\} className="link inline-flex min-h-11 items-center font-semibold">\s+\{d\.pedido\.verVoucher\}/,
  );
});
