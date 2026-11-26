import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarContestacao, eventoDoReembolsoFalho, leituraDaContestacao } from '../src/app/api/webhooks/stripe/eventos.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { ehAviso } from '../src/lib/pedidos-painel.ts';
import {
  DEVOLVIDO_POR_OUTRO_MEIO,
  avisoDeReembolsoFechado,
  falhaADevolverPorOutroMeio,
  falhasDaPagina,
  inicioDoReembolsoResolvido,
  linhaDaDevolucaoPorOutroMeio,
  linhaDaDevolucaoRepetidaQueFalhou,
  linhaDoReembolsoFalho,
  linhaDoReembolsoParadoPelaContestacao,
  linhaDoReembolsoSemMudarVoucher,
  linhaDoReembolsoSemVoucher,
  linhaDoVoucherDevolvidoPorOutroMeio,
  linhaDoVoucherLigado,
  partesDaPagina,
  partesDoReembolso,
  reembolsosFalhos,
  reembolsosSemVoucher,
  vouchersDevolvidosPorOutroMeio,
} from '../src/lib/reembolsos-a-resolver.ts';

// Os reembolsos que pedem uma ação da equipe moram no histórico do pedido: quem grava (o webhook, o painel) e quem lê
// (o painel, a página do cliente) usam as mesmas frases. Só a regra, sem rede nem banco; os pedidos são fictícios.

/** Os valores nas frases saem de formatarCifra (com o espaço que não quebra do pt-BR). */
const cifra = (centavos: number) => formatarCifra(centavos, 'pt-BR');
/** Um histórico com as linhas na ordem, um segundo entre uma e outra. */
const linhas = (...eventos: string[]) =>
  eventos.map((evento, n) => ({ em: `2026-11-16T12:00:${String(n).padStart(2, '0')}.000Z`, evento }));

test('a linha do reembolso que falhou vai e volta: o valor com centavos, com e sem voucher, re_ e pyr_, e o motivo', () => {
  for (const centavos of [100, 15400, 123456, 1000000])
    for (const voucher of [undefined, 'ON-5F4U5U'])
      for (const id of ['re_3UcDUbAEba4R3ewo1BgqTa0L', 'pyr_1Teste9Pix'])
        for (const motivo of ['expired_or_canceled_card', 'motivo não informado']) {
          const f = { id, centavos, ...(voucher ? { voucher } : {}), motivo };
          const linha = linhaDoReembolsoFalho(f);
          assert.deepEqual(reembolsosFalhos(linhas(linha)), [{ ...f, devolvido: false }], linha);
        }
  // o ponto de milhar e os centavos: R$ 1.234,56 e R$ 10.000,00
  assert.ok(linhaDoReembolsoFalho({ id: 're_1', centavos: 123456, motivo: 'declined' }).includes(cifra(123456)));
  assert.ok(cifra(1000000).includes('10.000,00'));
});

test('é a mesma linha que o webhook grava, sem mudar uma letra (o histórico do teste de 15/11 continua sendo lido)', () => {
  const doItem = eventoDoReembolsoFalho({
    id: 're_9',
    amount: 24200,
    status: 'failed',
    failure_reason: 'expired_or_canceled_card',
    metadata: { referencia: 'ON-5F4U5U' },
  });
  assert.equal(doItem, linhaDoReembolsoFalho({ id: 're_9', centavos: 24200, voucher: 'ON-5F4U5U', motivo: 'expired_or_canceled_card' }));
  const total = eventoDoReembolsoFalho({ id: 're_8', amount: 15400, status: 'failed', metadata: { referencia: 'total' } }, 'pi_1');
  assert.equal(total, linhaDoReembolsoFalho({ id: 're_8', centavos: 15400, motivo: 'motivo não informado' }));
  // o texto de antes, como ficou gravado no ON-SZA5W6
  const antiga = `Aviso: o reembolso de ${cifra(15400)} falhou na Stripe (re_3UcDUbAEba4R3ewo1BgqTa0L, expired_or_canceled_card): devolver por outro meio`;
  assert.deepEqual(reembolsosFalhos(linhas(antiga)), [
    { id: 're_3UcDUbAEba4R3ewo1BgqTa0L', centavos: 15400, motivo: 'expired_or_canceled_card', devolvido: false },
  ]);
  // continua sendo um aviso (destacado no painel)
  assert.equal(ehAviso(antiga), true);
});

test('a linha de fecho só fecha o reembolso do mesmo id, e só quando vem depois do aviso', () => {
  const a = { id: 're_A', centavos: 15400, motivo: 'expired_or_canceled_card' };
  const b = { id: 're_B', centavos: 24200, voucher: 'ON-5F4U5U', motivo: 'declined' };
  assert.ok(linhaDaDevolucaoPorOutroMeio(b).startsWith(DEVOLVIDO_POR_OUTRO_MEIO));
  const historico = linhas(linhaDoReembolsoFalho(a), linhaDoReembolsoFalho(b), linhaDaDevolucaoPorOutroMeio(b));
  assert.deepEqual(
    reembolsosFalhos(historico).map((f) => [f.id, f.voucher ?? null, f.centavos, f.devolvido]),
    [
      ['re_A', null, 15400, false],
      ['re_B', 'ON-5F4U5U', 24200, true],
    ],
  );
  // a linha de fecho que vem ANTES do aviso não conta
  assert.equal(reembolsosFalhos(linhas(linhaDaDevolucaoPorOutroMeio(a), linhaDoReembolsoFalho(a)))[0].devolvido, false);
  // o mesmo aviso duas vezes (a linha repetida no banco): um reembolso só
  assert.equal(reembolsosFalhos(linhas(linhaDoReembolsoFalho(a), linhaDoReembolsoFalho(a))).length, 1);
  // o painel destaca o aviso enquanto ele pede ação; o fecho não é aviso; fora do histórico, nada
  assert.equal(avisoDeReembolsoFechado(historico, 0), false);
  assert.equal(avisoDeReembolsoFechado(historico, 1), true);
  assert.equal(avisoDeReembolsoFechado(historico, 2), null);
  assert.equal(avisoDeReembolsoFechado(historico, 9), null);
  assert.equal(ehAviso(linhaDaDevolucaoPorOutroMeio(b)), false);
});

test('a contestação com o reembolso a caminho, a devolução de um pagamento repetido e a Stripe que não devolveu ficam de fora', () => {
  const contestado = linhaDoReembolsoParadoPelaContestacao({ id: 're_C', centavos: 15400 });
  const repetido = linhaDaDevolucaoRepetidaQueFalhou({
    id: 're_D',
    centavos: 95400,
    pagamento: 'pi_OUTRO',
    motivo: 'expired_or_canceled_card',
  });
  const naoDevolveu = 'Aviso: a Stripe não devolveu o pagamento pi_1 (pagamento repetido, charge_disputed): devolver por outro meio';
  const historico = linhas(contestado, repetido, naoDevolveu);
  assert.deepEqual(reembolsosFalhos(historico), []);
  assert.deepEqual(reembolsosSemVoucher(historico), []);
  assert.deepEqual(vouchersDevolvidosPorOutroMeio(historico), []);
  for (let n = 0; n < historico.length; n++) {
    // continuam destacadas no painel, mas não são avisos de reembolso que a equipe fecha registrando a devolução
    assert.equal(avisoDeReembolsoFechado(historico, n), null, historico[n].evento);
    assert.equal(ehAviso(historico[n].evento), true, historico[n].evento);
  }
  // nada pendente: as contas do pedido não mudam
  assert.deepEqual(partesDoReembolso(15400, reembolsosFalhos(historico)), {
    originalCentavos: 15400,
    pendenteCentavos: 0,
    outroMeioCentavos: 0,
  });
  // a da contestação manda NÃO devolver por fora; a do pagamento repetido diz de qual pagamento é
  assert.match(contestado, /não devolver por outro meio; aceitar ou responder a contestação no painel da Stripe$/);
  assert.doesNotMatch(contestado, /: devolver por outro meio$/);
  assert.ok(contestado.includes('(re_C)') && contestado.includes(cifra(15400)));
  assert.ok(repetido.includes('pi_OUTRO') && repetido.includes('(re_D, expired_or_canceled_card)') && repetido.includes(cifra(95400)));
});

test('as partes do que voltou: tudo pendente, tudo por outro meio, misto e nunca negativo', () => {
  const falho = (centavos: number, devolvido: boolean) => ({ centavos, devolvido });
  // sem falha: tudo pela forma original (o texto de hoje)
  assert.deepEqual(partesDoReembolso(15400, []), { originalCentavos: 15400, pendenteCentavos: 0, outroMeioCentavos: 0 });
  assert.deepEqual(partesDoReembolso(15400, [falho(15400, false)]), { originalCentavos: 0, pendenteCentavos: 15400, outroMeioCentavos: 0 });
  assert.deepEqual(partesDoReembolso(15400, [falho(15400, true)]), { originalCentavos: 0, pendenteCentavos: 0, outroMeioCentavos: 15400 });
  // R$ 396,00 registrados, R$ 242,00 falharam: R$ 154,00 pela forma original
  assert.deepEqual(partesDoReembolso(39600, [falho(24200, false)]), {
    originalCentavos: 15400,
    pendenteCentavos: 24200,
    outroMeioCentavos: 0,
  });
  assert.deepEqual(partesDoReembolso(39600, [falho(24200, true)]), {
    originalCentavos: 15400,
    pendenteCentavos: 0,
    outroMeioCentavos: 24200,
  });
  // nunca negativo
  assert.deepEqual(partesDoReembolso(0, [falho(24200, false)]), { originalCentavos: 0, pendenteCentavos: 24200, outroMeioCentavos: 0 });
  assert.deepEqual(partesDoReembolso(10000, [falho(15400, true)], [{ voucher: 'ON-J7W6WZ', centavos: 15400 }]), {
    originalCentavos: 0,
    pendenteCentavos: 0,
    outroMeioCentavos: 30800,
  });
});

test('o voucher devolvido por outro meio soma em "por outro meio", uma vez por voucher, mesmo com a linha repetida', () => {
  // o pedido de R$ 396,00: o reembolso do voucher ON-5F4U5U (R$ 242,00) falhou e a equipe devolveu por fora; depois, o
  // outro voucher (R$ 154,00) também por fora, sem a Stripe; a linha dele veio duas vezes (como no banco)
  const falho = { id: 're_E', centavos: 24200, voucher: 'ON-5F4U5U', motivo: 'expired_or_canceled_card' };
  const porFora = linhaDoVoucherDevolvidoPorOutroMeio('ON-J7W6WZ', 15400);
  assert.ok(porFora.startsWith(DEVOLVIDO_POR_OUTRO_MEIO));
  const historico = linhas(linhaDoReembolsoFalho(falho), linhaDaDevolucaoPorOutroMeio(falho), porFora, porFora);
  // o fecho do reembolso falho de um voucher não é lido como voucher devolvido por fora (ele não soma duas vezes)
  assert.deepEqual(vouchersDevolvidosPorOutroMeio(historico), [{ voucher: 'ON-J7W6WZ', centavos: 15400 }]);
  assert.deepEqual(partesDoReembolso(39600, reembolsosFalhos(historico), vouchersDevolvidosPorOutroMeio(historico)), {
    originalCentavos: 0,
    pendenteCentavos: 0,
    outroMeioCentavos: 39600,
  });
  // a lista com o mesmo voucher duas vezes também soma uma vez
  const duas = [
    { voucher: 'ON-J7W6WZ', centavos: 15400 },
    { voucher: 'ON-J7W6WZ', centavos: 15400 },
  ];
  assert.deepEqual(partesDoReembolso(15400, [], duas), { originalCentavos: 0, pendenteCentavos: 0, outroMeioCentavos: 15400 });
  // a linha do voucher por fora não é aviso
  assert.equal(ehAviso(porFora), false);
});

test('o reembolso feito direto na Stripe, sem voucher: vai e volta, e se resolve por qualquer linha do painel ou pelo reembolso total', () => {
  for (const centavos of [100, 15400, 123456, 1000000]) {
    const s = { id: 're_3UcGFeAEba4R3ewo0e9zbHK3', centavos };
    assert.deepEqual(reembolsosSemVoucher(linhas(linhaDoReembolsoSemVoucher(s))), [{ ...s, resolvido: false }]);
  }
  const aviso = linhaDoReembolsoSemVoucher({ id: 're_F', centavos: 15400 });
  assert.equal(ehAviso(aviso), true);
  for (const resolve of [linhaDoVoucherLigado('re_F', 'ON-XTE5BZ'), linhaDoReembolsoSemMudarVoucher('re_F')]) {
    assert.ok(resolve.startsWith(inicioDoReembolsoResolvido('re_F')));
    assert.equal(ehAviso(resolve), false);
    // depois do aviso, e também ANTES dele (a linha do voucher ligado vem de atualizar_item, com a hora do banco)
    assert.equal(reembolsosSemVoucher(linhas(aviso, resolve))[0].resolvido, true);
    assert.equal(reembolsosSemVoucher(linhas(resolve, aviso))[0].resolvido, true);
  }
  // a linha de outro reembolso não resolve este
  assert.equal(reembolsosSemVoucher(linhas(aviso, linhaDoVoucherLigado('re_G', 'ON-XTE5BZ')))[0].resolvido, false);
  // o pedido reembolsado inteiro: não há mais voucher para escolher
  assert.equal(reembolsosSemVoucher(linhas(aviso, `Reembolso total (${cifra(39600)}) confirmado pela Stripe`))[0].resolvido, true);
  // o aviso repetido é um reembolso só; o fechado deixa de ser destacado
  assert.equal(reembolsosSemVoucher(linhas(aviso, aviso)).length, 1);
  assert.equal(avisoDeReembolsoFechado(linhas(aviso), 0), false);
  assert.equal(avisoDeReembolsoFechado(linhas(aviso, linhaDoReembolsoSemMudarVoucher('re_F')), 0), true);
  // um aviso não é lido como o outro
  const falho = linhaDoReembolsoFalho({ id: 're_H', centavos: 15400, motivo: 'declined' });
  assert.deepEqual(reembolsosSemVoucher(linhas(falho)), []);
  assert.deepEqual(reembolsosFalhos(linhas(aviso)), []);
});

// O reembolso que falhou e, DEPOIS, uma contestação (achado da revisão do Pacote 3): o banco pode devolver pela
// contestação, e a equipe devolvendo também por outro meio pagaria o cliente duas vezes. As linhas são as que o webhook
// grava de verdade (leituraDaContestacao e, a de outro pagamento do mesmo pedido, aplicarContestacao).

/** A linha que o webhook grava para a contestação relida na Stripe. */
const contestacao = (status: string, id = 'du_teste', centavos = 15400) =>
  leituraDaContestacao({ id, amount: centavos, status: status as never, reason: 'fraudulent' }).evento;

/** A linha da contestação de OUTRO pagamento do mesmo pedido (duas abas), gravada por aplicarContestacao. */
async function contestacaoDeOutroPagamento(status: string): Promise<string> {
  const pedido = { codigo: 'ON-PED234', status: 'reembolsado', historico: [], reembolsoCentavos: 15400, paymentIntentId: 'pi_do_pedido' };
  const gravadas: string[] = [];
  await aplicarContestacao(
    pedido.codigo,
    { id: 'du_outro', amount: 15400, status: status as never, reason: 'fraudulent', payment_intent: 'pi_outro' },
    15400,
    {
      lerPedido: async () => pedido as never,
      acharSessao: async () => null,
      aplicarPago: async () => false,
      gravar: async (_codigo, alterar) => alterar(structuredClone(pedido) as never),
      registrar: (r, evento) => {
        gravadas.push(evento);
        return r;
      },
    },
  );
  assert.equal(gravadas.length, 1);
  return gravadas[0];
}

const DO_PEDIDO = { id: 're_inteiro', centavos: 15400, motivo: 'expired_or_canceled_card' };
const DO_VOUCHER = { id: 're_voucher', centavos: 24200, voucher: 'ON-5F4U5U', motivo: 'expired_or_canceled_card' };

test('a falha e, depois, a contestação: aberta suspende, perdida fecha, ganha volta a pedir; a anterior à falha não conta', () => {
  const aberta = contestacao('needs_response');
  const perdida = contestacao('lost');
  const ganha = contestacao('won');
  for (const falho of [DO_PEDIDO, DO_VOUCHER]) {
    const linha = linhaDoReembolsoFalho(falho);
    const ler = (...eventos: string[]) => reembolsosFalhos(linhas(...eventos))[0];
    const aPedir = { ...falho, devolvido: false };
    // sem contestação: a equipe devolve por outro meio
    assert.deepEqual(ler(linha), aPedir);
    assert.equal(falhaADevolverPorOutroMeio(ler(linha)), true);
    // a falha e, depois, a contestação aberta: suspensa (não devolver por fora agora)
    assert.deepEqual(ler(linha, aberta), { ...aPedir, contestacao: 'aberta' });
    assert.equal(falhaADevolverPorOutroMeio(ler(linha, aberta)), false);
    // depois, perdida: o banco devolveu ao cliente, nada mais a devolver
    assert.deepEqual(ler(linha, aberta, perdida), { ...aPedir, contestacao: 'perdida' });
    assert.equal(falhaADevolverPorOutroMeio(ler(linha, aberta, perdida)), false);
    // ou ganha: o dinheiro ficou com a empresa, e a falha volta a pedir a devolução por outro meio
    assert.deepEqual(ler(linha, aberta, ganha), aPedir);
    assert.equal(falhaADevolverPorOutroMeio(ler(linha, aberta, ganha)), true);
    // a contestação gravada ANTES da falha não conta, aberta, perdida ou ganha
    for (const antes of [[aberta], [aberta, perdida], [aberta, ganha]]) assert.deepEqual(ler(...antes, linha), aPedir, antes.join(' | '));
    // o painel deixa de destacar a linha da falha enquanto não se devolve por fora; ganha, volta a destacar
    assert.equal(avisoDeReembolsoFechado(linhas(linha, aberta), 0), true);
    assert.equal(avisoDeReembolsoFechado(linhas(linha, aberta, perdida), 0), true);
    assert.equal(avisoDeReembolsoFechado(linhas(linha, aberta, ganha), 0), false);
    assert.equal(avisoDeReembolsoFechado(linhas(aberta, linha), 1), false);
  }
});

test('a contestação depois da falha: o pedido de informação, a evitada, o alerta encerrado, outra contestação e a de outro pagamento', async () => {
  const linha = linhaDoReembolsoFalho(DO_PEDIDO);
  const estado = (...eventos: string[]) => reembolsosFalhos(linhas(linha, ...eventos))[0].contestacao;
  // o pedido de informação do banco e a contestação em análise também suspendem
  assert.equal(estado(contestacao('warning_needs_response')), 'aberta');
  assert.equal(estado(contestacao('needs_response'), contestacao('under_review')), 'aberta');
  // evitada e o alerta encerrado sem disputa: o dinheiro ficou com a empresa (como a ganha)
  assert.equal(estado(contestacao('needs_response'), contestacao('prevented')), undefined);
  assert.equal(estado(contestacao('warning_needs_response'), contestacao('warning_closed')), undefined);
  // o fim de OUTRA contestação não termina esta; uma nova depois da ganha suspende de novo
  assert.equal(estado(contestacao('needs_response', 'du_A'), contestacao('won', 'du_B')), 'aberta');
  assert.equal(estado(contestacao('needs_response', 'du_A'), contestacao('won', 'du_A'), contestacao('needs_response', 'du_B')), 'aberta');
  // perdida vale sobre tudo: o banco devolveu ao cliente
  assert.equal(
    estado(contestacao('needs_response', 'du_A'), contestacao('lost', 'du_A'), contestacao('needs_response', 'du_B')),
    'perdida',
  );
  // a perdida gravada depois da falha fecha mesmo se a contestação foi aberta antes (o banco devolveu depois da falha)
  assert.equal(reembolsosFalhos(linhas(contestacao('needs_response'), linha, contestacao('lost')))[0].contestacao, 'perdida');
  // a contestação de outro pagamento do mesmo pedido não devolve o dinheiro deste: não conta
  const outraAberta = await contestacaoDeOutroPagamento('needs_response');
  const outraPerdida = await contestacaoDeOutroPagamento('lost');
  assert.match(outraAberta, /^Contestação aberta na Stripe \(du_outro\): .+ \(pagamento repetido pi_outro\)$/);
  assert.match(outraPerdida, /^Contestação du_outro perdida: .+ \(pagamento repetido pi_outro\)$/);
  assert.equal(estado(outraAberta), undefined);
  assert.equal(estado(outraAberta, outraPerdida), undefined);
  // a devolução já registrada pela equipe vale sobre a contestação que veio depois
  const devolvido = reembolsosFalhos(linhas(linha, linhaDaDevolucaoPorOutroMeio(DO_PEDIDO), contestacao('needs_response')))[0];
  assert.deepEqual(devolvido, { ...DO_PEDIDO, devolvido: true });
  // a linha da contestação não é aviso de reembolso, nem é lida como falha
  assert.equal(avisoDeReembolsoFechado(linhas(contestacao('needs_response')), 0), null);
  assert.deepEqual(reembolsosFalhos(linhas(contestacao('needs_response'), contestacao('lost'))), []);
});

test('as partes com a contestação depois da falha: a equipe não devolve por fora; o cliente só deixa de ler pendente quando o banco devolveu', () => {
  const linha = linhaDoReembolsoFalho(DO_PEDIDO);
  const aberta = contestacao('needs_response');
  const partes = (eventos: string[], leitor?: 'equipe' | 'cliente') =>
    partesDoReembolso(15400, reembolsosFalhos(linhas(linha, ...eventos)), [], leitor);
  // aberta: para a equipe, nada a devolver por fora agora (como no reembolso parado pela contestação); para o cliente,
  // continua pendente (ele nunca lê que o dinheiro voltou quando não voltou)
  assert.deepEqual(partes([aberta]), { originalCentavos: 15400, pendenteCentavos: 0, outroMeioCentavos: 0 });
  assert.deepEqual(partes([aberta], 'equipe'), partes([aberta]));
  assert.deepEqual(partes([aberta], 'cliente'), { originalCentavos: 0, pendenteCentavos: 15400, outroMeioCentavos: 0 });
  // perdida: o banco devolveu ao cliente pela mesma forma de pagamento, para os dois
  for (const leitor of ['equipe', 'cliente'] as const)
    assert.deepEqual(partes([aberta, contestacao('lost')], leitor), { originalCentavos: 15400, pendenteCentavos: 0, outroMeioCentavos: 0 });
  // ganha: pendente para os dois
  for (const leitor of ['equipe', 'cliente'] as const)
    assert.deepEqual(partes([aberta, contestacao('won')], leitor), { originalCentavos: 0, pendenteCentavos: 15400, outroMeioCentavos: 0 });
  // sem contestação, os dois leem igual
  assert.deepEqual(partes([], 'cliente'), partes([], 'equipe'));
});

test('falhasDaPagina: no voucher de um pedido com vários itens, o daquele voucher e o do pedido inteiro; no pedido, tudo', () => {
  const doPedido = { id: 're_P', centavos: 39600, motivo: 'declined' };
  const deA = { id: 're_A', centavos: 24200, voucher: 'ON-AAA234', motivo: 'declined' };
  const deB = { id: 're_B', centavos: 15400, voucher: 'ON-BBB234', motivo: 'declined' };
  const falhos = reembolsosFalhos(linhas(linhaDoReembolsoFalho(deA), linhaDoReembolsoFalho(doPedido), linhaDoReembolsoFalho(deB)));
  const ids = (lista: { id: string }[]) => lista.map((f) => f.id);
  // o voucher ON-AAA234 de um pedido com 2 itens: a falha dele e a do pedido inteiro entram; a do outro voucher, não
  assert.deepEqual(ids(falhasDaPagina({ voucherDePedido: true, codigo: 'ON-AAA234' }, falhos)), ['re_A', 're_P']);
  assert.deepEqual(ids(falhasDaPagina({ voucherDePedido: true, codigo: 'ON-BBB234' }, falhos)), ['re_P', 're_B']);
  // a falha do pedido inteiro entra no voucher mesmo sozinha (a página aberta pelo "Ver o voucher" do e-mail)
  assert.deepEqual(ids(falhasDaPagina({ voucherDePedido: true, codigo: 'ON-AAA234' }, falhos.slice(1, 2))), ['re_P']);
  assert.deepEqual(ids(falhasDaPagina({ voucherDePedido: true, codigo: 'ON-CCC234' }, falhos)), ['re_P']);
  // o pedido (ou o pedido de um item só): todas
  assert.deepEqual(ids(falhasDaPagina({ voucherDePedido: false, codigo: 'ON-PED234' }, falhos)), ['re_A', 're_P', 're_B']);
  assert.deepEqual(ids(falhasDaPagina({ voucherDePedido: false, codigo: 'ON-AAA234' }, falhos)), ['re_A', 're_P', 're_B']);
  // os vouchers devolvidos por outro meio seguem a mesma regra (sempre têm voucher)
  const porFora = [
    { voucher: 'ON-AAA234', centavos: 24200 },
    { voucher: 'ON-BBB234', centavos: 15400 },
  ];
  assert.deepEqual(falhasDaPagina({ voucherDePedido: true, codigo: 'ON-BBB234' }, porFora), [porFora[1]]);
  assert.deepEqual(falhasDaPagina({ voucherDePedido: false, codigo: 'ON-PED234' }, porFora), porFora);
});

test('partesDaPagina: só quando muda o que o cliente lê, com os três valores; o voucher de um pedido com vários itens começa do zero', () => {
  const voucherA = { voucherDePedido: true, codigo: 'ON-5F4U5U' };
  const pedido = { voucherDePedido: false, codigo: 'ON-PED234' };
  const falhou = linhaDoReembolsoFalho(DO_VOUCHER);
  // sem falha: a página mostra o texto de sempre
  assert.equal(
    partesDaPagina(pedido, 15400, linhas('Pago (webhook da Stripe)', `Reembolso total (${cifra(15400)}) confirmado pela Stripe`)),
    undefined,
  );
  // o pedido de R$ 396,00 com o voucher de R$ 242,00 que falhou: R$ 154,00 pela mesma forma e R$ 242,00 pendentes
  assert.deepEqual(partesDaPagina(pedido, 39600, linhas(falhou)), {
    originalCentavos: 15400,
    pendenteCentavos: 24200,
    outroMeioCentavos: 0,
  });
  // a página do voucher: só o dele, sem nada do valor do pedido
  assert.deepEqual(partesDaPagina(voucherA, 39600, linhas(falhou)), { originalCentavos: 0, pendenteCentavos: 24200, outroMeioCentavos: 0 });
  assert.equal(partesDaPagina({ voucherDePedido: true, codigo: 'ON-OUTRO1' }, 39600, linhas(falhou)), undefined);
  // depois que a equipe devolveu por outro meio
  const devolvido = linhas(falhou, linhaDaDevolucaoPorOutroMeio(DO_VOUCHER));
  assert.deepEqual(partesDaPagina(voucherA, 24200, devolvido), { originalCentavos: 0, pendenteCentavos: 0, outroMeioCentavos: 24200 });
  // o outro voucher devolvido por outro meio (depois da falha): na página dele, "de outro jeito"
  const porFora = linhas(falhou, linhaDaDevolucaoPorOutroMeio(DO_VOUCHER), linhaDoVoucherDevolvidoPorOutroMeio('ON-J7W6WZ', 15400));
  assert.deepEqual(partesDaPagina({ voucherDePedido: true, codigo: 'ON-J7W6WZ' }, 39600, porFora), {
    originalCentavos: 0,
    pendenteCentavos: 0,
    outroMeioCentavos: 15400,
  });
  assert.deepEqual(partesDaPagina(pedido, 39600, porFora), { originalCentavos: 0, pendenteCentavos: 0, outroMeioCentavos: 39600 });
  // só os três valores: nunca o id do reembolso nem o motivo
  assert.deepEqual(Object.keys(partesDaPagina(pedido, 39600, linhas(falhou)) ?? {}).sort(), [
    'originalCentavos',
    'outroMeioCentavos',
    'pendenteCentavos',
  ]);
});

test('partesDaPagina com a contestação depois da falha: aberta, o cliente continua lendo "pendente"; perdida, o texto de sempre; ganha, pendente', () => {
  const aberta = contestacao('needs_response');
  for (const [falho, pagina, registrado] of [
    [DO_PEDIDO, { voucherDePedido: false, codigo: 'ON-PED234' }, 15400],
    [DO_VOUCHER, { voucherDePedido: true, codigo: 'ON-5F4U5U' }, 24200],
  ] as const) {
    const linha = linhaDoReembolsoFalho(falho);
    const pendente = { originalCentavos: 0, pendenteCentavos: falho.centavos, outroMeioCentavos: 0 };
    assert.deepEqual(partesDaPagina(pagina, registrado, linhas(linha)), pendente);
    assert.deepEqual(partesDaPagina(pagina, registrado, linhas(linha, aberta)), pendente, 'aberta: continua pendente');
    assert.equal(partesDaPagina(pagina, registrado, linhas(linha, aberta, contestacao('lost'))), undefined, 'perdida: o texto de sempre');
    assert.deepEqual(partesDaPagina(pagina, registrado, linhas(linha, aberta, contestacao('won'))), pendente, 'ganha: pendente');
    assert.deepEqual(
      partesDaPagina(pagina, registrado, linhas(aberta, contestacao('lost'), linha)),
      pendente,
      'a anterior à falha não conta',
    );
  }
});

test('partesDaPagina na página de um voucher de um pedido com vários itens, quando falhou o reembolso do pedido inteiro', () => {
  // um pedido de R$ 396,00 com dois vouchers (ON-AAA234 e ON-BBB234): "Reembolsar tudo" e, depois, o refund.failed do
  // reembolso do pedido inteiro (sem voucher na linha). Cada página de voucher é a aberta pelo "Ver o voucher" do e-mail
  const inteiro = { id: 're_tudo', centavos: 39600, motivo: 'expired_or_canceled_card' };
  const historico = linhas(
    'Pago (webhook da Stripe)',
    `Reembolso total (${cifra(39600)}) confirmado pela Stripe`,
    linhaDoReembolsoFalho(inteiro),
  );
  const voucherA = { voucherDePedido: true, codigo: 'ON-AAA234' };
  const voucherB = { voucherDePedido: true, codigo: 'ON-BBB234' };
  // a falha do pedido inteiro diz respeito a cada voucher: "Reembolso pendente", com o valor que falhou, e nada do valor
  // devolvido do pedido contado como deste voucher (nunca "foi devolvido", o dinheiro não voltou)
  const pendente = { originalCentavos: 0, pendenteCentavos: 39600, outroMeioCentavos: 0 };
  assert.deepEqual(partesDaPagina(voucherA, 39600, historico), pendente);
  assert.deepEqual(partesDaPagina(voucherB, 39600, historico), pendente);
  // a página do pedido lê o mesmo, a partir do valor do pedido
  assert.deepEqual(partesDaPagina({ voucherDePedido: false, codigo: 'ON-PED234' }, 39600, historico), pendente);
  // a equipe devolveu por outro meio: cada voucher passa a "devolvido de outro jeito"
  const devolvido = linhas(...historico.map((h) => h.evento), linhaDaDevolucaoPorOutroMeio(inteiro));
  const porOutroMeio = { originalCentavos: 0, pendenteCentavos: 0, outroMeioCentavos: 39600 };
  assert.deepEqual(partesDaPagina(voucherA, 39600, devolvido), porOutroMeio);
  assert.deepEqual(partesDaPagina(voucherB, 39600, devolvido), porOutroMeio);
  // a contestação aberta depois da falha: o cliente continua lendo "pendente"; perdida, o texto de sempre
  const aberta = contestacao('needs_response', 'du_depois', 39600);
  assert.deepEqual(partesDaPagina(voucherA, 39600, linhas(...historico.map((h) => h.evento), aberta)), pendente);
  assert.equal(
    partesDaPagina(voucherA, 39600, linhas(...historico.map((h) => h.evento), aberta, contestacao('lost', 'du_depois', 39600))),
    undefined,
  );
  // a falha de OUTRO voucher (com voucher na linha) continua fora da página deste
  const deB = linhas(
    'Pago (webhook da Stripe)',
    linhaDoReembolsoFalho({ id: 're_B', centavos: 15400, voucher: 'ON-BBB234', motivo: 'declined' }),
  );
  assert.equal(partesDaPagina(voucherA, 15400, deB), undefined);
  assert.deepEqual(partesDaPagina(voucherB, 15400, deB), { originalCentavos: 0, pendenteCentavos: 15400, outroMeioCentavos: 0 });
});
