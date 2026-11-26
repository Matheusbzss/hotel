import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IDIOMAS, fmt, type Idioma } from '../src/i18n/config.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { textosEmail } from '../src/lib/email/textos.ts';
import {
  agruparPedidos,
  botaoReembolsoDoVoucher,
  botaoVoucherPorFora,
  confirmacaoDoReembolso,
  reembolsoNoPainel,
} from '../src/lib/pedidos-painel.ts';
import {
  linhaDoReembolsoFalho,
  linhaDoReembolsoSemVoucher,
  linhaDoReembolsoSolicitado,
  linhaDoVoucherDevolvidoPorOutroMeio,
} from '../src/lib/reembolsos-a-resolver.ts';
import type { Reserva, ReservaPasseio } from '../src/lib/reservas.ts';
import {
  ACOES_DO_RESUMO,
  AVISO_DA_CHAVE_COMPLETA,
  NOME_DO_IDIOMA,
  NOTA_DO_REEMBOLSO,
  O_REEMBOLSO_CONTINUA,
  PRAZO_DO_REEMBOLSO_DO_PIX_DIAS,
  REGISTRE_OS_OUTROS,
  RESUMO_NAO_VALE,
  SALDO_INDISPONIVEL,
  SALDO_NAO_LIDO,
  SEM_EMAIL_NA_TRANSFERENCIA,
  SEM_STRIPE_DEPOIS_DE_OUTRO_MEIO,
  avisoDoSaldo,
  devolucaoPelaStripe,
  diasDesdeOPagamento,
  enderecoDoPainel,
  enderecoDoResumo,
  filtroDoPainel,
  lerEscolhaDoResumo,
  opcaoEscolhida,
  opcoesDoReembolso,
  pixForaDoPrazoDaStripe,
  telaDoReembolso,
  transferenciaDoPixOferecida,
  type ContextoDoResumo,
  type TelaDoResumo,
} from '../src/lib/resumo-do-painel.ts';
import type { LeituraDoSaldo, SaldoIndisponivel } from '../src/lib/saldo-stripe.ts';

// Pacote 33, item 1 e D1 (FASE-5, Etapa 2: "antes de confirmar, o painel mostra o resumo e pede um segundo toque"; o
// saldo da Stripe antes do "com reembolso"). O "Reembolsar na Stripe…" do cartão do pedido leva à tela de resumo
// (/admin/resumo/<pedido>): o que volta e o valor, os vouchers que deixam de valer, a forma, o prazo da Stripe, o e-mail
// que o cliente recebe e o saldo lido na hora; o segundo toque (a caixa "Confirmo" e o botão) manda para as MESMAS ações
// de antes da rota do painel. E o Pix pago há mais de 90 dias, que a Stripe não devolve mais: o aviso e a devolução por
// transferência. Só leitura: nada é gravado, nada vai à Stripe; os pedidos são fictícios.

const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
const dataHora = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
/** Um histórico com as linhas na ordem, um segundo entre uma e outra, a partir de `inicio`. */
const historico = (inicio: string, ...eventos: string[]) =>
  eventos.map((evento, n) => ({ em: new Date(Date.parse(inicio) + n * 1000).toISOString(), evento }));

/** O código de um arquivo de src/, sem as linhas de comentário (e sem o \r dos arquivos gravados com CRLF). */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
    .join('\n');

/** Um voucher de exemplo, pago pela Stripe no cartão em 15/11 (nenhum é de cliente). */
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
    data: '2026-12-20',
    horario: { hora: '09:00', busca: false },
    totalCentavos: 15400,
    cliente: { nome: 'Teste da Silva', email: 'teste@exemplo.com', telefone: '+55 21 90000-0000' },
    pagamento: { metodo: 'cartao', pagoEm: '2026-11-15T12:00:00Z', cartaoBandeira: 'visa', cartaoFinal: '4242' },
    historico: historico('2026-11-15T12:00:00Z', 'Pago (webhook da Stripe)'),
    passeio: { slug: 'escuna-buzios', nome: 'Escuna', cidade: 'Búzios', unidade: 'pessoa' },
    adultos: 2,
    criancas: 0,
    unidades: 2,
    hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
    ...parcial,
  } as ReservaPasseio;
}

const umItem = (parcial: Partial<ReservaPasseio> = {}) => agruparPedidos([voucher(parcial)])[0];

/** Um pedido de dois itens: ON-AAA234 (R$ 242,00, o primeiro da viagem: representa o pedido) e ON-BBB234 (R$ 154,00). */
function doisItens(
  comum: Partial<ReservaPasseio> = {},
  statusItens: [Reserva['statusItem'], Reserva['statusItem']] = [undefined, undefined],
) {
  const pedido = { codigo: 'ON-PED234', totalCentavos: 39600, ...(comum.pedido ?? {}) };
  const item = (codigoDoVoucher: string, data: string, totalCentavos: number, statusItem: Reserva['statusItem']) =>
    voucher({ codigo: codigoDoVoucher, data, totalCentavos, ...comum, pedido, ...(statusItem ? { statusItem } : {}) });
  return agruparPedidos([
    item('ON-AAA234', '2026-12-20', 24200, statusItens[0]),
    item('ON-BBB234', '2026-12-21', 15400, statusItens[1]),
  ])[0];
}

const AGORA = new Date('2026-11-26T12:00:00Z');
const LIDO: LeituraDoSaldo = {
  estado: 'lido',
  disponivelCentavos: 100000,
  aLiberarCentavos: 25000,
  lidoEm: '2026-11-26T12:00:01Z',
  chaveCompleta: false,
};
const contexto = (parcial: Partial<ContextoDoResumo> = {}): ContextoDoResumo => ({
  agora: AGORA,
  saldo: LIDO,
  emailLigado: true,
  descrever: (r) => `${r.tipo === 'transfer' ? 'Transfer' : r.passeio.nome} · ${r.data}`,
  volta: { filtro: 'pagas', busca: 'teste' },
  ...parcial,
});
const linha = (tela: TelaDoResumo, rotulo: string) => tela.linhas.find((l) => l.rotulo === rotulo)?.valor;

test('a escolha que vem no endereço: só as ações da rota que a tela conhece, e o voucher no formato do site', () => {
  // as duas de antes do "com reembolso" e, desde os passos 2 e 3 do Pacote 33, as duas do "sem reembolso"
  assert.deepEqual(ACOES_DO_RESUMO, ['reembolsar', 'reembolsar_item', 'cancelar_sem_reembolso', 'cancelar_item_sem_reembolso']);
  assert.deepEqual(lerEscolhaDoResumo({ acao: 'reembolsar' }), { acao: 'reembolsar' });
  assert.deepEqual(lerEscolhaDoResumo({ acao: 'reembolsar', voucher: 'ON-AAA234' }), { acao: 'reembolsar' });
  assert.deepEqual(lerEscolhaDoResumo({ acao: 'reembolsar_item', voucher: ' on-aaa234 ' }), {
    acao: 'reembolsar_item',
    voucher: 'ON-AAA234',
  });
  assert.deepEqual(lerEscolhaDoResumo({ acao: 'cancelar_sem_reembolso', voucher: 'ON-AAA234' }), { acao: 'cancelar_sem_reembolso' });
  assert.deepEqual(lerEscolhaDoResumo({ acao: 'cancelar_item_sem_reembolso', voucher: 'on-bbb234' }), {
    acao: 'cancelar_item_sem_reembolso',
    voucher: 'ON-BBB234',
  });
  assert.equal(lerEscolhaDoResumo({ acao: 'cancelar_item_sem_reembolso' }), null);
  assert.equal(lerEscolhaDoResumo({ acao: 'cancelar_item_sem_reembolso', voucher: 'ON-BBB23' }), null);
  for (const q of [
    {},
    { acao: 'reembolsar_item' },
    { acao: 'reembolsar_item', voucher: 'ON-AAA23' },
    { acao: 'reembolsar_item', voucher: ['ON-AAA234'] },
    { acao: ['reembolsar'] },
    { acao: 'cancelar' },
    { acao: 'voucher_por_fora', voucher: 'ON-AAA234' },
    { acao: 'devolvido_por_fora' },
    { acao: 'constructor' },
  ])
    assert.equal(lerEscolhaDoResumo(q), null, JSON.stringify(q));
});

test('os endereços: a tela e a volta ao painel levam o filtro e a busca pelo URLSearchParams, nunca colados', () => {
  assert.equal(
    enderecoDoResumo('ON-PED234', { acao: 'reembolsar' }, { filtro: 'pagas', busca: ' maria & cia ' }),
    '/admin/resumo/ON-PED234?acao=reembolsar&status=pagas&q=maria+%26+cia',
  );
  assert.equal(
    enderecoDoResumo('ON-PED234', { acao: 'reembolsar_item', voucher: 'ON-BBB234' }, {}),
    '/admin/resumo/ON-PED234?acao=reembolsar_item&voucher=ON-BBB234',
  );
  // a busca sai pela regra de sempre do painel: aparada e cortada no máximo da caixa
  const longa = new URL(enderecoDoResumo('ON-PED234', { acao: 'reembolsar' }, { busca: 'x'.repeat(300) }), 'https://exemplo.test');
  assert.equal(longa.searchParams.get('q')?.length, 160);
  assert.equal(enderecoDoPainel({}), '/admin');
  assert.equal(enderecoDoPainel({ filtro: 'pagas', busca: 'a#b' }), '/admin?status=pagas&q=a%23b');
  // o filtro que veio no endereço da tela só passa com cara de filtro do painel
  assert.equal(filtroDoPainel('pagas'), 'pagas');
  assert.equal(filtroDoPainel('pagamentos-a-decidir'), 'pagamentos-a-decidir');
  for (const lixo of ['"><script>', 'PAGAS', 'pagas&erro=x', '', 'a'.repeat(41), 42, undefined, ['pagas']])
    assert.equal(filtroDoPainel(lixo), '', String(lixo));
});

test('as opções: as mesmas do cartão do pedido, com o botão e a caixa "Confirmo" de antes', () => {
  // um item: só "tudo"
  const [tudo, ...resto] = opcoesDoReembolso(umItem());
  assert.equal(resto.length, 0);
  assert.deepEqual(tudo, {
    escolha: { acao: 'reembolsar' },
    rotulo: `Tudo (${cifra(15400)})`,
    centavos: 15400,
    botao: `Reembolsar tudo (${cifra(15400)})`,
    confirmacao: confirmacaoDoReembolso(15400),
  });
  // dois itens: tudo e cada voucher, pelo valor inteiro, com o rótulo e a caixa de botaoReembolsoDoVoucher
  const dois = opcoesDoReembolso(doisItens());
  assert.deepEqual(
    dois.map((o) => o.escolha),
    [{ acao: 'reembolsar' }, { acao: 'reembolsar_item', voucher: 'ON-AAA234' }, { acao: 'reembolsar_item', voucher: 'ON-BBB234' }],
  );
  for (const o of dois.slice(1)) {
    const v = o.escolha.acao === 'reembolsar_item' ? o.escolha.voucher : '';
    const b = botaoReembolsoDoVoucher(v, o.centavos, 39600);
    assert.equal(o.botao, b?.rotulo);
    assert.equal(o.confirmacao, b?.confirmacao);
  }
  // o ON-4KPC6F do teste de 15/11 (R$ 396,00 pagos e R$ 308,00 já devolvidos): só "tudo", pelos R$ 88,00 que restam
  const quase = opcoesDoReembolso(doisItens({ reembolsoCentavos: 30800 }));
  assert.deepEqual(
    quase.map((o) => [o.escolha.acao, o.centavos]),
    [['reembolsar', 8800]],
  );
  // o que o cartão do pedido não mostra, a tela também não mostra
  for (const [nome, p] of [
    ['contestado', umItem({ status: 'contestado' })],
    ['reembolsado', umItem({ status: 'reembolsado', reembolsoCentavos: 15400 })],
    ['cancelado', umItem({ status: 'cancelado' })],
    ['pendente', umItem({ status: 'pendente' })],
    ['whatsapp', umItem({ provedor: 'whatsapp', paymentIntentId: undefined })],
    [
      'falhou',
      umItem({ historico: historico('2026-11-16T12:00:00Z', linhaDoReembolsoFalho({ id: 're_f', centavos: 15400, motivo: 'declined' })) }),
    ],
  ] as const) {
    assert.deepEqual(opcoesDoReembolso(p), [], nome);
    assert.equal(opcaoEscolhida(p, { acao: 'reembolsar' }), null, nome);
  }
  // o reembolso de parte feito direto na Stripe sem voucher, ainda sem resposta: só "tudo" (como o cartão)
  const semVoucher = doisItens({
    historico: historico('2026-11-16T12:00:00Z', 'Pago (webhook da Stripe)', linhaDoReembolsoSemVoucher({ id: 're_d', centavos: 5000 })),
    reembolsoCentavos: 5000,
  });
  assert.equal(reembolsoNoPainel(semVoucher).tipo, 'stripe');
  assert.deepEqual(
    opcoesDoReembolso(semVoucher).map((o) => o.escolha.acao),
    ['reembolsar'],
  );
});

test('a tela do "Reembolsar tudo": o que volta, os vouchers que deixam de valer, a forma, o prazo, o e-mail e o formulário de antes', () => {
  const p = doisItens();
  const tela = telaDoReembolso(p, { acao: 'reembolsar' }, contexto());
  assert.ok(tela);
  assert.equal(tela.titulo, 'Reembolsar na Stripe');
  assert.equal(tela.subtitulo, 'Pedido ON-PED234 · Teste da Silva');
  // o segundo toque: a ação 'reembolsar' no código do voucher que representa o pedido, sem campo voucher, com a caixa e
  // o rótulo de antes, em vermelho claro como o "Reembolsar tudo" de antes
  assert.deepEqual(tela.formulario, {
    acao: 'reembolsar',
    codigoNaRota: 'ON-AAA234',
    confirmacoes: [{ nome: 'confirmo', texto: confirmacaoDoReembolso(39600) }],
    campos: [],
    botao: `Reembolsar tudo (${cifra(39600)})`,
    perigo: true,
    nota: NOTA_DO_REEMBOLSO,
  });
  assert.equal(tela.transferencia, null);
  assert.deepEqual(linha(tela, 'Volta ao cliente'), [`${cifra(39600)}: o pedido inteiro`]);
  assert.deepEqual(linha(tela, 'Deixam de valer'), [
    `ON-AAA234 · Escuna · 2026-12-20 · ${cifra(24200)}`,
    `ON-BBB234 · Escuna · 2026-12-21 · ${cifra(15400)}`,
  ]);
  assert.equal(linha(tela, 'Continuam valendo'), undefined);
  assert.deepEqual(linha(tela, 'Forma de pagamento'), ['Cartão Visa •••• 4242', `Pago em ${dataHora('2026-11-15T12:00:00Z')}`]);
  // o prazo é o da página da Stripe, a mesma frase que o e-mail do cliente leva
  assert.deepEqual(linha(tela, 'Prazo da Stripe para o dinheiro aparecer'), [textosEmail('pt').reembolso.prazoCartao]);
  const email = linha(tela, 'E-mail que o cliente recebe') ?? [];
  assert.equal(email[0], '«Reembolso do pedido ON-PED234», para teste@exemplo.com, em português.');
  assert.match(
    email[1],
    /^Sai sozinho quando a Stripe registrar o reembolso: diz que o pedido foi cancelado e que o valor volta pela mesma forma/,
  );
  assert.match(email[2], /«Reembolso concluído: pedido ON-PED234»/);
  assert.deepEqual(linha(tela, 'Saldo da Stripe'), [
    `Disponível: ${cifra(100000)}`,
    `A liberar: ${cifra(25000)}`,
    linha(tela, 'Saldo da Stripe')?.[2],
  ]);
  assert.match(linha(tela, 'Saldo da Stripe')?.[2] ?? '', /^Lido agora, às \d\d:\d\d:\d\d\.$/);
  // com R$ 1.000,00 disponível, nenhum aviso
  assert.deepEqual(tela.avisos, []);
  // as opções do alto: tudo e os dois vouchers, com o filtro e a busca, a escolhida marcada
  assert.deepEqual(
    tela.opcoes.map((o) => [o.rotulo, o.atual]),
    [
      [`Tudo (${cifra(39600)})`, true],
      [`Só o voucher ON-AAA234 (${cifra(24200)})`, false],
      [`Só o voucher ON-BBB234 (${cifra(15400)})`, false],
    ],
  );
  assert.equal(tela.opcoes[2].href, '/admin/resumo/ON-PED234?acao=reembolsar_item&voucher=ON-BBB234&status=pagas&q=teste');
  // num pedido de um item, nenhuma opção no alto (só há uma)
  assert.deepEqual(telaDoReembolso(umItem(), { acao: 'reembolsar' }, contexto())?.opcoes, []);
  // depois de um reembolso de parte, "tudo" diz que é o que resta, e só os vouchers que ainda valem deixam de valer
  const parte = telaDoReembolso(doisItens({ reembolsoCentavos: 15400 }, [undefined, 'reembolsado']), { acao: 'reembolsar' }, contexto());
  assert.ok(parte);
  assert.deepEqual(linha(parte, 'Volta ao cliente'), [
    `${cifra(24200)}: tudo o que ainda resta do pagamento (${cifra(15400)} já voltaram ao cliente)`,
  ]);
  assert.deepEqual(linha(parte, 'Deixa de valer'), [`ON-AAA234 · Escuna · 2026-12-20 · ${cifra(24200)}`]);
});

test('a tela de um voucher só: o formulário de antes no endereço do voucher, com o campo voucher, e o que continua valendo', () => {
  const p = doisItens();
  const tela = telaDoReembolso(p, { acao: 'reembolsar_item', voucher: 'ON-BBB234' }, contexto());
  assert.ok(tela);
  const b = botaoReembolsoDoVoucher('ON-BBB234', 15400, 39600);
  assert.deepEqual(tela.formulario, {
    acao: 'reembolsar_item',
    codigoNaRota: 'ON-BBB234',
    voucher: 'ON-BBB234',
    confirmacoes: [{ nome: 'confirmo', texto: b?.confirmacao }],
    campos: [],
    botao: b?.rotulo,
    perigo: false,
    nota: NOTA_DO_REEMBOLSO,
  });
  assert.deepEqual(linha(tela, 'Volta ao cliente'), [`${cifra(15400)}: só o voucher ON-BBB234`]);
  assert.deepEqual(linha(tela, 'Deixa de valer'), [`ON-BBB234 · Escuna · 2026-12-21 · ${cifra(15400)}`]);
  assert.deepEqual(linha(tela, 'Continua valendo'), [`ON-AAA234 · Escuna · 2026-12-20 · ${cifra(24200)}`]);
  const email = linha(tela, 'E-mail que o cliente recebe') ?? [];
  assert.match(email[1], /diz que o voucher ON-BBB234 foi cancelado .*"O que continua valendo", os links do voucher ON-AAA234\.$/);
  assert.deepEqual(
    tela.opcoes.map((o) => o.atual),
    [false, false, true],
  );
});

test('a escolha que não vale mais: nenhuma tela (o voucher já devolvido, fora do pedido, maior que o resto; o pedido contestado)', () => {
  const c = contexto();
  assert.equal(telaDoReembolso(doisItens({}, ['reembolsado', undefined]), { acao: 'reembolsar_item', voucher: 'ON-AAA234' }, c), null);
  assert.equal(telaDoReembolso(doisItens({}, [undefined, 'cancelado']), { acao: 'reembolsar_item', voucher: 'ON-BBB234' }, c), null);
  assert.equal(telaDoReembolso(doisItens({}, [undefined, 'usado']), { acao: 'reembolsar_item', voucher: 'ON-BBB234' }, c), null);
  assert.equal(telaDoReembolso(doisItens(), { acao: 'reembolsar_item', voucher: 'ON-ZZZ234' }, c), null);
  assert.equal(telaDoReembolso(umItem(), { acao: 'reembolsar_item', voucher: 'ON-ABC234' }, c), null);
  // ON-4KPC6F: o voucher que vale mais do que resta não tem tela; o "tudo" dos R$ 88,00, tem
  const quase = doisItens({ reembolsoCentavos: 30800 });
  assert.equal(telaDoReembolso(quase, { acao: 'reembolsar_item', voucher: 'ON-AAA234' }, c), null);
  assert.equal(telaDoReembolso(quase, { acao: 'reembolsar' }, c)?.formulario?.botao, `Reembolsar tudo (${cifra(8800)})`);
  for (const status of ['contestado', 'reembolsado', 'cancelado', 'expirado'] as const)
    assert.equal(telaDoReembolso(umItem({ status }), { acao: 'reembolsar' }, c), null, status);
  assert.match(RESUMO_NAO_VALE, /Nada foi feito/);
});

test('o saldo: cobrindo, sem aviso; sem cobrir, o aviso diz "pode" (cartão e Pix); indisponível, a frase e o reembolso continua possível', () => {
  const tudo = { acao: 'reembolsar' } as const;
  const saldo = (disponivelCentavos: number, chaveCompleta = false): LeituraDoSaldo => ({ ...LIDO, disponivelCentavos, chaveCompleta });
  // o disponível igual ao reembolso cobre
  assert.deepEqual(telaDoReembolso(umItem(), tudo, contexto({ saldo: saldo(15400) }))?.avisos, []);
  // um centavo a menos: o aviso amarelo, e o formulário continua lá (o saldo só avisa)
  const cartao = telaDoReembolso(umItem(), tudo, contexto({ saldo: saldo(15399) }));
  assert.ok(cartao?.formulario);
  assert.deepEqual(cartao.avisos, [{ tom: 'atencao', texto: avisoDoSaldo(15399, 15400, 'cartao') }]);
  const noCartao = cartao.avisos[0].texto;
  assert.match(noCartao, /não cobre este reembolso/);
  assert.match(noCartao, /no cartão pode ficar pendente até entrar saldo \(até 45 dias; depois disso, ele falha\)/);
  assert.match(noCartao, /No teste de 24\/11, os reembolsos no cartão e no Pix passaram na hora/);
  assert.match(noCartao, /Você pode seguir: o painel só avisa\./);
  // no Pix, a frase do Pix
  const pix = telaDoReembolso(
    umItem({ pagamento: { metodo: 'pix', pagoEm: '2026-11-15T12:00:00Z' }, totalPixCentavos: 13860 }),
    tudo,
    contexto({ saldo: saldo(0) }),
  );
  assert.match(pix?.avisos[0]?.texto ?? '', /Sem saldo disponível, o reembolso no Pix pode falhar\./);
  assert.deepEqual(linha(pix as TelaDoResumo, 'Prazo da Stripe para o dinheiro aparecer'), [textosEmail('pt').reembolso.prazoPix]);
  // "pode", nunca "vai" nem "vão"
  for (const t of [noCartao, pix?.avisos[0]?.texto ?? '']) assert.doesNotMatch(t, /\bvai\b|\bvão\b|\bvai falhar|\bfica pendente\b/);
  // o saldo devedor (negativo) também não cobre
  assert.equal(telaDoReembolso(umItem(), tudo, contexto({ saldo: saldo(-500) }))?.avisos[0]?.tom, 'atencao');
  // a chave completa (sk_…): o aviso de trocar pela restrita
  assert.deepEqual(telaDoReembolso(umItem(), tudo, contexto({ saldo: saldo(100000, true) }))?.avisos, [
    { tom: 'info', texto: AVISO_DA_CHAVE_COMPLETA },
  ]);
  // indisponível, por qualquer motivo: "Saldo indisponível", o reembolso continua possível e o formulário está lá
  for (const motivo of ['sem-chave', 'chave-errada', 'modo-diferente', 'erro', 'demora'] as SaldoIndisponivel[]) {
    const tela = telaDoReembolso(umItem(), tudo, contexto({ saldo: { estado: 'indisponivel', motivo } }));
    assert.ok(tela?.formulario, motivo);
    assert.deepEqual(linha(tela, 'Saldo da Stripe'), [SALDO_INDISPONIVEL[motivo], O_REEMBOLSO_CONTINUA], motivo);
    assert.match(SALDO_INDISPONIVEL[motivo], /^Saldo indisponível/);
    assert.deepEqual(tela.avisos, [], motivo);
  }
});

test('o e-mail: o assunto no idioma do cliente nos 4 idiomas, para o e-mail do pedido; desligado, o aviso de avisar por fora', () => {
  for (const idioma of IDIOMAS as readonly Idioma[]) {
    const tela = telaDoReembolso(umItem({ idioma }), { acao: 'reembolsar' }, contexto());
    const email = linha(tela as TelaDoResumo, 'E-mail que o cliente recebe') ?? [];
    const assunto = fmt(textosEmail(idioma).reembolso.assunto, { codigo: 'ON-ABC234' });
    assert.equal(email[0], `«${assunto}», para teste@exemplo.com, em ${NOME_DO_IDIOMA[idioma]}.`, idioma);
    assert.match(email[2], new RegExp(`«${fmt(textosEmail(idioma).reembolso.assuntoConcluido, { codigo: 'ON-ABC234' })}»`), idioma);
  }
  assert.equal(NOME_DO_IDIOMA['es-ar'], 'espanhol da Argentina (com "vos")');
  const desligado = telaDoReembolso(umItem(), { acao: 'reembolsar' }, contexto({ emailLigado: false }));
  assert.deepEqual(linha(desligado as TelaDoResumo, 'E-mail que o cliente recebe'), [
    'Os e-mails automáticos estão desligados (falta a chave do Resend na Vercel): o cliente não recebe e-mail deste reembolso. Avise-o pelo e-mail ou pelo WhatsApp do pedido.',
  ]);
});

/** Um pedido pago no Pix pela Stripe em `pagoEm` (R$ 138,60, o Pix com o desconto de R$ 154,00). */
const doPix = (pagoEm: string, parcial: Partial<ReservaPasseio> = {}) =>
  voucher({
    pagamento: { metodo: 'pix', pagoEm },
    totalPixCentavos: 13860,
    historico: historico(pagoEm, 'Pago (webhook da Stripe)'),
    ...parcial,
  });

test('o Pix pago há mais de 90 dias: a conta dos dias, só no Pix da Stripe e só depois do prazo cravado', () => {
  const pago = '2026-08-01T15:00:00.000Z';
  const fim = new Date(Date.parse(pago) + PRAZO_DO_REEMBOLSO_DO_PIX_DIAS * 86_400_000);
  assert.equal(PRAZO_DO_REEMBOLSO_DO_PIX_DIAS, 90);
  // no prazo cravado ainda vale; um milissegundo depois, não
  assert.equal(pixForaDoPrazoDaStripe(doPix(pago), fim), false);
  assert.equal(pixForaDoPrazoDaStripe(doPix(pago), new Date(fim.getTime() + 1)), true);
  assert.equal(pixForaDoPrazoDaStripe(doPix(pago), AGORA), true);
  assert.equal(diasDesdeOPagamento(pago, AGORA), 116);
  assert.equal(diasDesdeOPagamento(undefined, AGORA), null);
  // o cartão, o Pix recente, o Pix sem a hora do pagamento e o pedido fora da Stripe não entram
  assert.equal(pixForaDoPrazoDaStripe(voucher({ pagamento: { metodo: 'cartao', pagoEm: pago } }), AGORA), false);
  assert.equal(pixForaDoPrazoDaStripe(doPix('2026-10-01T15:00:00.000Z'), AGORA), false);
  assert.equal(pixForaDoPrazoDaStripe(voucher({ pagamento: { metodo: 'pix' } }), AGORA), false);
  assert.equal(pixForaDoPrazoDaStripe(doPix(pago, { provedor: 'whatsapp' }), AGORA), false);
});

test('o Pix pago há mais de 90 dias: o aviso vermelho e a devolução por transferência, com o botão de sempre do voucher por outro meio', () => {
  const pago = '2026-08-01T15:00:00.000Z';
  const p = agruparPedidos([doPix(pago)])[0];
  const tela = telaDoReembolso(p, { acao: 'reembolsar' }, contexto());
  assert.ok(tela);
  // o aviso vermelho vem antes de qualquer outro
  assert.equal(tela.avisos[0].tom, 'perigo');
  assert.match(tela.avisos[0].texto, /^Este Pix foi pago em .+, há 116 dias\. A Stripe só aceita pedido de reembolso de Pix até 90 dias/);
  assert.match(tela.avisos[0].texto, /docs\.stripe\.com\/payments\/pix/);
  assert.match(tela.avisos[0].texto, /devolver por transferência para uma conta que o cliente indicar/);
  // o botão da Stripe continua (o aviso não trava) e, embaixo, a transferência com o botão de sempre, que não chama a Stripe
  assert.equal(tela.formulario?.acao, 'reembolsar');
  const b = botaoVoucherPorFora('ON-ABC234', 13860);
  assert.deepEqual(tela.transferencia?.formularios, [
    {
      acao: 'voucher_por_fora',
      codigoNaRota: 'ON-ABC234',
      voucher: 'ON-ABC234',
      confirmacoes: [{ nome: 'confirmo', texto: b.confirmacao }],
      campos: [],
      botao: b.rotulo,
      perigo: false,
    },
  ]);
  assert.match(
    tela.transferencia?.texto.join(' ') ?? '',
    /só para o titular do pedido.*Nada é pedido à Stripe, e o site não manda e-mail ao cliente/,
  );
  // o Pix de 1º de outubro (56 dias) e o cartão de agosto: nada disso
  for (const outro of [agruparPedidos([doPix('2026-10-01T15:00:00.000Z')])[0], umItem({ pagamento: { metodo: 'cartao', pagoEm: pago } })]) {
    const t = telaDoReembolso(outro, { acao: 'reembolsar' }, contexto());
    assert.equal(t?.transferencia, null);
    assert.ok(t?.avisos.every((a) => a.tom !== 'perigo'));
  }
});

test('a transferência do Pix fora do prazo: nunca junto com um reembolso que a Stripe aceitou depois do prazo; depois da primeira, nada de Stripe', () => {
  const pago = '2026-08-01T15:00:00.000Z';
  const depoisDoPrazo = '2026-11-20T12:00:00.000Z';
  // a Stripe aceitou um pedido de reembolso depois do prazo (ao contrário da página dela): a equipe espera o resultado. O
  // reembolso do Pix tem o id pyr_… (o de cartão, re_…)
  const aceito = doPix(pago, {
    historico: historico(pago, 'Pago (webhook da Stripe)').concat(
      historico(depoisDoPrazo, linhaDoReembolsoSolicitado({ id: 'pyr_depois', centavos: 13860 })),
    ),
  });
  assert.equal(transferenciaDoPixOferecida(aceito, AGORA, [aceito]), false);
  // e já concluído (o pedido reembolsado ou a linha da Stripe com o id): também nada de transferência
  const concluido = doPix(pago, {
    historico: historico(pago, 'Pago (webhook da Stripe)').concat(
      historico(depoisDoPrazo, `Reembolso concluído na Stripe (reembolso pyr_depois, ${cifra(13860)}): o dinheiro saiu para o cliente`),
    ),
  });
  assert.equal(transferenciaDoPixOferecida(concluido, AGORA, [concluido]), false);
  const semTransferencia = telaDoReembolso(agruparPedidos([aceito])[0], { acao: 'reembolsar' }, contexto());
  assert.equal(semTransferencia?.transferencia, null);
  // o aviso vermelho continua, sem apontar para uma transferência que a tela não mostra
  assert.equal(semTransferencia?.avisos[0]?.tom, 'perigo');
  assert.match(semTransferencia?.avisos[0]?.texto ?? '', /para uma conta que o cliente indicar\.$/);
  assert.doesNotMatch(semTransferencia?.avisos[0]?.texto ?? '', /embaixo/);
  // um reembolso de parte de antes do fim do prazo (já resolvido há tempo) não segura a transferência do resto
  const antigo = doisItens(
    {
      pagamento: { metodo: 'pix', pagoEm: pago },
      pedido: { codigo: 'ON-PED234', totalCentavos: 39600, totalPixCentavos: 35640 },
      historico: historico(pago, 'Pago (webhook da Stripe)').concat(
        historico('2026-08-10T12:00:00.000Z', linhaDoReembolsoSolicitado({ id: 're_antes', centavos: 13860, voucher: 'ON-BBB234' })),
      ),
      reembolsoCentavos: 13860,
    },
    [undefined, 'reembolsado'],
  );
  assert.equal(transferenciaDoPixOferecida(antigo.itens[0], AGORA, antigo.itens), true);
  // o reembolso que falhou já tem o caminho dele (a tela nem existe: o cartão mostra os botões de registrar)
  const falho = doPix(pago, {
    historico: historico(pago, 'Pago (webhook da Stripe)', linhaDoReembolsoFalho({ id: 're_f', centavos: 13860, motivo: 'declined' })),
  });
  assert.equal(transferenciaDoPixOferecida(falho, AGORA, [falho]), false);
  // fora do pago, nada
  const reembolsado = doPix(pago, { status: 'reembolsado' });
  assert.equal(transferenciaDoPixOferecida(reembolsado, AGORA, [reembolsado]), false);

  // dois vouchers: a transferência do primeiro registrada; o botão da Stripe sai (a rota também recusaria) e fica o do outro
  const umPorFora = doisItens(
    {
      pagamento: { metodo: 'pix', pagoEm: pago },
      totalPixCentavos: undefined,
      reembolsoCentavos: 21780,
      historico: historico(pago, 'Pago (webhook da Stripe)').concat(
        historico('2026-11-25T12:00:00.000Z', linhaDoVoucherDevolvidoPorOutroMeio('ON-AAA234', 21780)),
      ),
    },
    ['reembolsado', undefined],
  );
  assert.equal(devolucaoPelaStripe(umPorFora), false);
  // com o saldo que não cobre: nada do saldo, do prazo nem do e-mail do reembolso da Stripe (só o aviso dos 90 dias)
  const tela = telaDoReembolso(umPorFora, { acao: 'reembolsar' }, contexto({ saldo: { ...LIDO, disponivelCentavos: 0 } }));
  assert.ok(tela);
  assert.equal(tela.formulario, null);
  assert.equal(tela.semFormulario, `${SEM_STRIPE_DEPOIS_DE_OUTRO_MEIO} ${REGISTRE_OS_OUTROS}`);
  assert.deepEqual(
    tela.transferencia?.formularios.map((f) => f.voucher),
    ['ON-BBB234'],
  );
  assert.deepEqual(
    tela.linhas.map((l) => l.rotulo),
    ['Volta ao cliente', 'Deixa de valer', 'Forma de pagamento', 'E-mail que o cliente recebe'],
  );
  assert.deepEqual(linha(tela, 'E-mail que o cliente recebe'), [SEM_EMAIL_NA_TRANSFERENCIA]);
  assert.deepEqual(
    tela.avisos.map((a) => a.tom),
    ['perigo'],
  );
  // a página nem lê o saldo nesse caso (saldo null), e a tela é a mesma
  assert.deepEqual(telaDoReembolso(umPorFora, { acao: 'reembolsar' }, contexto({ saldo: null })), tela);
  // sem nenhuma devolução por outro meio, a Stripe entra (e o saldo não lido vira "Saldo indisponível")
  assert.equal(devolucaoPelaStripe(doisItens()), true);
  assert.deepEqual(
    linha(telaDoReembolso(doisItens(), { acao: 'reembolsar' }, contexto({ saldo: null })) as TelaDoResumo, 'Saldo da Stripe'),
    [SALDO_NAO_LIDO, O_REEMBOLSO_CONTINUA],
  );
});

test('a transferência do Pix fora do prazo: nunca com um reembolso que o painel pediu à Stripe, de qualquer data, ainda sem a confirmação dela', () => {
  const pago = '2026-08-01T15:00:00.000Z';
  // o "Reembolsar tudo" pedido no 89º dia (29/10), antes do fim do prazo, cujo aviso da Stripe não foi processado (o webhook
  // fora do ar, por exemplo): o pedido continua pago, e o reembolso pode ainda chegar ao cliente
  const tudoPedido = doPix(pago, {
    historico: historico(pago, 'Pago (webhook da Stripe)').concat(
      historico('2026-10-29T12:00:00.000Z', linhaDoReembolsoSolicitado({ id: 'pyr_tudo', centavos: 13860 })),
    ),
  });
  assert.equal(transferenciaDoPixOferecida(tudoPedido, AGORA, [tudoPedido]), false);
  const tela = telaDoReembolso(agruparPedidos([tudoPedido])[0], { acao: 'reembolsar' }, contexto());
  assert.ok(tela);
  assert.equal(tela.transferencia, null);
  // o botão da Stripe e o aviso vermelho dos 90 dias continuam, sem apontar para uma transferência que a tela não mostra
  assert.equal(tela.formulario?.acao, 'reembolsar');
  assert.equal(tela.avisos[0]?.tom, 'perigo');
  assert.doesNotMatch(tela.avisos[0]?.texto ?? '', /embaixo/);
  // o de um voucher só, pedido antes do fim do prazo, com o voucher ainda valendo: a transferência do pedido inteiro espera
  const comPedidoDoA = (statusItens: [Reserva['statusItem'], Reserva['statusItem']]) =>
    doisItens(
      {
        pagamento: { metodo: 'pix', pagoEm: pago },
        pedido: { codigo: 'ON-PED234', totalCentavos: 39600, totalPixCentavos: 35640 },
        historico: historico(pago, 'Pago (webhook da Stripe)').concat(
          historico('2026-10-29T12:00:00.000Z', linhaDoReembolsoSolicitado({ id: 'pyr_a', centavos: 21780, voucher: 'ON-AAA234' })),
        ),
      },
      statusItens,
    );
  const aCaminho = comPedidoDoA([undefined, undefined]);
  assert.equal(transferenciaDoPixOferecida(aCaminho.itens[0], AGORA, aCaminho.itens), false);
  const telaDoA = telaDoReembolso(aCaminho, { acao: 'reembolsar' }, contexto());
  assert.ok(telaDoA);
  assert.equal(telaDoA.transferencia, null);
  // com o voucher A já reembolsado (a Stripe confirmou), a transferência do resto volta
  const confirmado = comPedidoDoA(['reembolsado', undefined]);
  assert.equal(transferenciaDoPixOferecida(confirmado.itens[0], AGORA, confirmado.itens), true);
});

test('a rota: o voucher por outro meio vale também no Pix fora do prazo, pela mesma regra, conferida de novo dentro da trava', () => {
  const rota = codigo('app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  const inicio = rota.indexOf("if (acao === 'voucher_por_fora')");
  const trecho = rota.slice(inicio, rota.indexOf("if (acao === 'voucher_da_stripe')"));
  assert.match(
    trecho,
    /const porForaVale = \(r: Reserva\) => reembolsosFalhos\(r\.historico\)\.length > 0 \|\| transferenciaDoPixOferecida\(r, agora, vouchers\);/,
  );
  assert.match(trecho, /if \(!daStripe \|\| alvo\.status !== 'pago' \|\| !porForaVale\(alvo\)\) return voltar\('acao-nao-vale'\);/);
  // dentro da trava, com o pedido relido, antes de somar o valor
  const linhaEm = trecho.indexOf("if (gravado.linhaEm !== undefined || r.status !== 'pago') return null;");
  const relida = trecho.indexOf('gravado.foraDaRegra = !porForaVale(r);\n      if (gravado.foraDaRegra) return null;');
  // e, sem gravar nada, a volta é a da ação que não vale (antes da marca do voucher)
  const recusa = trecho.indexOf("if (gravado.foraDaRegra) return voltar('acao-nao-vale');");
  assert.ok(recusa !== -1 && recusa < trecho.indexOf('if (marcaOVoucherPorFora(gravado, new Date(), item)) {'), String(recusa));
  const soma = trecho.indexOf('const centavos = valorDoVoucherPorFora(valor, recebido - (r.reembolsoCentavos ?? 0));');
  assert.ok(linhaEm !== -1 && linhaEm < relida && relida < soma, `${linhaEm} ${relida} ${soma}`);
  // a Stripe nunca entra nesta ação, e a caixa "Confirmo" continua antes de qualquer gravação
  assert.doesNotMatch(trecho, /criarReembolso|reembolsosDoPagamento|stripe\(/);
  assert.ok(trecho.indexOf("if (!confirmou) return voltar('falta-confirmar');") < trecho.indexOf('await atualizarReserva('));
  // o caminho do dinheiro não muda: as mesmas três chamadas que devolvem dinheiro na rota (tudo, um voucher, o pagamento
  // parado), e nada do saldo nem da tela de resumo nas ações de reembolso
  assert.equal(rota.match(/\bcriarReembolso\(/g)?.length, 3);
  const reembolsar = rota.slice(
    rota.indexOf("if (acao === 'reembolsar' || acao === 'reembolsar_item')"),
    rota.indexOf("if (acao === 'desistencia_respondida')"),
  );
  assert.doesNotMatch(reembolsar, /saldo|resumo|transferencia|porForaVale/i);
  assert.match(rota, /import \{ transferenciaDoPixOferecida \} from '@\/lib\/resumo-do-painel';/);
});

test('a página da tela: no servidor e sem JavaScript, só com o login, o saldo só com a escolha que vale e os formulários de antes', () => {
  const tela = codigo('app', 'admin', 'resumo', '[codigo]', 'page.tsx');
  assert.doesNotMatch(tela, /['"]use client['"]|onClick|onSubmit|useState|useEffect/);
  assert.match(tela, /export const dynamic = 'force-dynamic';/);
  // sem a sessão, a entrada do painel com o aviso da sessão vencida
  assert.match(tela, /if \(!sessaoValida\(loja\.get\(COOKIE_ADMIN\)\?\.value\)\) redirect\(ENDERECO_DA_SESSAO_VENCIDA\);/);
  // a escolha é conferida pela regra do cartão do pedido antes de ler o saldo (e o limite curto dele)
  const confere = tela.indexOf(
    'if (!escolha || !opcaoEscolhida(p, escolha)) return <SemResumo frase={RESUMO_NAO_VALE} painel={painel} />;',
  );
  const saldo = tela.indexOf('saldo: devolucaoPelaStripe(p) ? await lerSaldoDaStripe() : null,');
  assert.ok(confere !== -1 && confere < saldo, `${confere} ${saldo}`);
  // o formulário: o POST para a rota do painel, com a ação, o voucher e as caixas obrigatórias
  assert.match(tela, /<form method="post" action=\{`\/api\/admin\/reservas\/\$\{f\.codigoNaRota\}`\}/);
  assert.match(tela, /\{f\.voucher && <input type="hidden" name="voucher" value=\{f\.voucher\} \/>\}/);
  assert.match(
    tela,
    /<input type="checkbox" name=\{c\.nome\} value="sim" required className="size-6 shrink-0 accent-\[var\(--color-mar\)\]" \/>/,
  );
  // o motivo do "sem reembolso" (passo 2) já tem onde entrar: a escolha obrigatória e o texto curto com o máximo
  assert.match(tela, /<input type="radio" name=\{campo\.nome\} value=\{o\.valor\} required/);
  assert.match(tela, /maxLength=\{campo\.maximo\}/);
  // o cartão do pedido: o "Reembolsar na Stripe…" é um link para a tela, com o filtro e a busca
  const painel = codigo('app', 'admin', 'page.tsx');
  const reembolso = painel.slice(
    painel.indexOf('function ReembolsoStripe('),
    painel.indexOf('\nfunction ', painel.indexOf('function ReembolsoStripe(') + 1),
  );
  assert.match(reembolso, /<a\s+href=\{enderecoDoResumo\(p\.codigo, \{ acao: 'reembolsar' \}, \{ filtro, busca \}\)\}/);
  assert.match(reembolso, /Reembolsar na Stripe…/);
  assert.doesNotMatch(reembolso, /<details|<form|BotaoAcao/);
  // a frase do Pix da caixa antiga ("o prazo depende do banco do cliente") saiu: o prazo é o da Stripe, na tela
  assert.doesNotMatch(painel, /o prazo depende do banco do cliente/);
});
