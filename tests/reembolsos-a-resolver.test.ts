import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventoDoReembolsoFalho } from '../src/app/api/webhooks/stripe/eventos.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { ehAviso } from '../src/lib/pedidos-painel.ts';
import {
  DEVOLVIDO_POR_OUTRO_MEIO,
  avisoDeReembolsoFechado,
  inicioDoReembolsoResolvido,
  linhaDaDevolucaoPorOutroMeio,
  linhaDaDevolucaoRepetidaQueFalhou,
  linhaDoReembolsoFalho,
  linhaDoReembolsoParadoPelaContestacao,
  linhaDoReembolsoSemMudarVoucher,
  linhaDoReembolsoSemVoucher,
  linhaDoVoucherDevolvidoPorOutroMeio,
  linhaDoVoucherLigado,
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
