import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HORA_ENTRADA_CASA, orcamentoCasa, orcamentoCasaCentavos, sinalCentavos, type TabelaDiarias } from '../src/lib/diarias.ts';
import {
  ANTECEDENCIA_CARTAO_MINUTOS,
  FORMAS_PAGAMENTO,
  PIX_EXPIRA_SEGUNDOS,
  PIX_LIMITE_DOLARES,
  PIX_TETO_SEM_COTACAO_CENTAVOS,
  PIX_VALIDADE_MINIMA_SEGUNDOS,
  cartaoDisponivel,
  dentroDoPrazo,
  escolherFormas,
  formasDisponiveis,
  formasDoPagamento,
  inicioDoItem,
  isFormaPagamento,
  limiteDoPixCentavos,
  modoPagamentoOnline,
  mostrarWhatsApp,
  pagamentoOnlineNoAr,
  pixCabeNoLimite,
  pixDisponivel,
  segundosAteOInicio,
  totalDoItem,
  validadeDoPix,
  valorACobrar,
  valorDoItem,
  type ItemAgendado,
  type ItemCobravel,
  type ItemPagavel,
} from '../src/lib/formas-pagamento.ts';
import { ANTECEDENCIA_MINIMA_MINUTOS } from '../src/lib/horarios.ts';
import { partesDoTotal } from '../src/lib/partes-do-total.ts';
import type { StatusReserva } from '../src/lib/reservas.ts';
import { VALIDADE_SESSAO_MINUTOS } from '../src/lib/stripe.ts';

// Búzios fica 3 horas atrás de UTC: 17h20 UTC = 14h20 em Búzios, no dia 2 de novembro de 2026
const AGORA = new Date('2026-11-02T17:20:00Z');

/** Roda com variáveis de ambiente de teste e devolve tudo como estava (as chaves aqui são inventadas). */
async function comAmbiente(vars: Record<string, string | undefined>, fazer: () => void | Promise<void>) {
  const antes = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const aplicar = (valores: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(valores)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  aplicar(vars);
  try {
    await fazer();
  } finally {
    aplicar(antes);
  }
}

// itens fictícios, só para as contas (nenhum é de cliente)
const PASSEIO: ItemCobravel = { tipo: 'passeio', totalCentavos: 15400, totalPixCentavos: 13860 };
const TRANSFER: ItemCobravel = { tipo: 'transfer', totalCentavos: 80000, totalPixCentavos: 72000 };
const CASA: ItemCobravel = { tipo: 'casa', totalCentavos: 340000, totalPixCentavos: 306000 };

test('quanto cobrar por item: o total no passeio e no transfer; o sinal de 50% na casa', () => {
  assert.equal(valorDoItem(PASSEIO, 'cartao'), 15400);
  assert.equal(valorDoItem(PASSEIO, 'pix'), 13860);
  assert.equal(valorDoItem(TRANSFER, 'cartao'), 80000);
  assert.equal(valorDoItem(TRANSFER, 'pix'), 72000);
  // a casa: metade do total; no Pix, metade do total com o desconto
  assert.equal(valorDoItem(CASA, 'cartao'), 170000);
  assert.equal(valorDoItem(CASA, 'pix'), 153000);
  // sem o preço do Pix gravado, o Pix cobra o do cartão (nunca cobra a menos do que foi calculado)
  assert.equal(valorDoItem({ totalCentavos: 9000 }, 'pix'), 9000);
  assert.equal(totalDoItem(CASA, 'pix'), 306000);
});

test('o sinal é arredondado em centavos, não em reais', () => {
  assert.equal(sinalCentavos(100001), 50001);
  assert.equal(sinalCentavos(100000), 50000);
  assert.equal(valorDoItem({ tipo: 'casa', totalCentavos: 100001 }, 'cartao'), 50001);
});

test('a sessão cobra a soma dos itens na forma escolhida', () => {
  assert.equal(valorACobrar([PASSEIO, TRANSFER, CASA], 'cartao'), 15400 + 80000 + 170000);
  assert.equal(valorACobrar([PASSEIO, TRANSFER, CASA], 'pix'), 13860 + 72000 + 153000);
  assert.equal(valorACobrar([], 'pix'), 0);
});

const passeio = (data: string, hora: string): ItemAgendado => ({ tipo: 'passeio', data, horario: { hora } });
const transfer = (data: string, hora: string): ItemAgendado => ({ tipo: 'transfer', data, transfer: { ida: { hora } } });
const casa = (data: string): ItemAgendado => ({ tipo: 'casa', data });

test('quando cada item começa: o horário do passeio, a saída do transfer, a entrada da casa às 15h', () => {
  assert.deepEqual(inicioDoItem(passeio('2026-11-02', '16:20')), { data: '2026-11-02', hora: '16:20' });
  assert.deepEqual(inicioDoItem(transfer('2026-11-02', '17:00')), { data: '2026-11-02', hora: '17:00' });
  assert.deepEqual(inicioDoItem(casa('2026-11-02')), { data: '2026-11-02', hora: HORA_ENTRADA_CASA });
  assert.equal(HORA_ENTRADA_CASA, '15:00');
});

test('a antecedência mínima (o prazo do Pix) são 2 horas antes do serviço, no fuso de Búzios', () => {
  assert.equal(ANTECEDENCIA_MINIMA_MINUTOS, 120);
  // 14h20 em Búzios: 16h20 ainda cabe, 16h19 não
  assert.equal(dentroDoPrazo(passeio('2026-11-02', '16:20'), AGORA), true);
  assert.equal(dentroDoPrazo(passeio('2026-11-02', '16:19'), AGORA), false);
  assert.equal(dentroDoPrazo(passeio('2026-11-03', '07:00'), AGORA), true);
  assert.equal(dentroDoPrazo(passeio('2026-11-01', '23:00'), AGORA), false);
  assert.equal(dentroDoPrazo(transfer('2026-11-02', '17:00'), AGORA), true);
  assert.equal(dentroDoPrazo(transfer('2026-11-02', '15:00'), AGORA), false);
  // a casa de hoje entra às 15h: já passou da antecedência; a de amanhã pode
  assert.equal(dentroDoPrazo(casa('2026-11-02'), AGORA), false);
  assert.equal(dentroDoPrazo(casa('2026-11-03'), AGORA), true);
});

test('o Pix vale até 2 horas antes do primeiro serviço; o cartão, até 30 minutos antes', () => {
  const ok = [passeio('2026-11-02', '17:00'), transfer('2026-11-03', '08:00')];
  assert.equal(pixDisponivel(ok, AGORA), true);
  assert.equal(cartaoDisponivel(ok, AGORA), true);
  // um item a 40 minutos de começar: o Pix sai, o cartão fica (FASE-4.md: "Depois disso, só cartão.")
  const tarde = [...ok, passeio('2026-11-02', '15:00')];
  assert.equal(pixDisponivel(tarde, AGORA), false);
  assert.equal(cartaoDisponivel(tarde, AGORA), true);
  // o Pix vale até 2 horas antes, como os textos dizem: às 14h20, o passeio das 16h20 ainda tem Pix; o das 16h19, não
  assert.equal(pixDisponivel([...ok, passeio('2026-11-02', '16:20')], AGORA), true);
  assert.equal(pixDisponivel([...ok, passeio('2026-11-02', '16:19')], AGORA), false);
  // o cartão fecha 30 minutos antes (decisão do dono de 11/11): com 30 minutos exatos ainda vale; com 29, não
  assert.equal(cartaoDisponivel([passeio('2026-11-02', '14:50')], AGORA), true);
  assert.equal(cartaoDisponivel([passeio('2026-11-02', '14:49')], AGORA), false);
  // um item fora do prazo fecha o cartão do pedido inteiro, mesmo com os outros itens longe
  assert.equal(cartaoDisponivel([...ok, passeio('2026-11-02', '14:49')], AGORA), false);
  // na hora do início, e depois dela, nenhuma forma
  assert.equal(cartaoDisponivel([passeio('2026-11-02', '14:20')], AGORA), false);
  const comecou = [...ok, passeio('2026-11-02', '14:19')];
  assert.equal(pixDisponivel(comecou, AGORA), false);
  assert.equal(cartaoDisponivel(comecou, AGORA), false);
  // um item de ontem fecha as duas formas
  const ontem = [...ok, transfer('2026-11-01', '23:00')];
  assert.equal(pixDisponivel(ontem, AGORA), false);
  assert.equal(cartaoDisponivel(ontem, AGORA), false);
  // casa com entrada hoje às 15h: faltam 40 minutos, só o cartão
  assert.equal(pixDisponivel([casa('2026-11-02')], AGORA), false);
  assert.equal(cartaoDisponivel([casa('2026-11-02')], AGORA), true);
  // sem itens não há o que pagar
  assert.equal(pixDisponivel([], AGORA), false);
  assert.equal(cartaoDisponivel([], AGORA), false);
});

test('o prazo do Pix atravessa a meia-noite: o serviço da madrugada de amanhã conta pelos minutos que faltam', () => {
  // os instantes vêm com o fuso de Búzios escrito (-03:00), para a conta não depender do relógio da máquina
  const as = (dataHora: string) => new Date(`${dataHora}:00-03:00`);
  // 23h30 de hoje, transfer à 0h30 de amanhã: faltam 60 minutos. Só o cartão.
  assert.equal(pixDisponivel([transfer('2026-11-03', '00:30')], as('2026-11-02T23:30')), false);
  assert.equal(cartaoDisponivel([transfer('2026-11-03', '00:30')], as('2026-11-02T23:30')), true);
  // 22h30, transfer à 0h29 de amanhã: faltam 119 minutos. Só o cartão.
  assert.equal(pixDisponivel([transfer('2026-11-03', '00:29')], as('2026-11-02T22:30')), false);
  assert.equal(cartaoDisponivel([transfer('2026-11-03', '00:29')], as('2026-11-02T22:30')), true);
  // 23h59, transfer à meia-noite: falta 1 minuto. Nenhuma forma.
  assert.equal(pixDisponivel([transfer('2026-11-03', '00:00')], as('2026-11-02T23:59')), false);
  assert.equal(cartaoDisponivel([transfer('2026-11-03', '00:00')], as('2026-11-02T23:59')), false);
  // o prazo do cartão também atravessa a virada: às 23h30 faltam 30 minutos (vale); às 23h31, 29 (não vale)
  assert.equal(cartaoDisponivel([transfer('2026-11-03', '00:00')], as('2026-11-02T23:30')), true);
  assert.equal(cartaoDisponivel([transfer('2026-11-03', '00:00')], as('2026-11-02T23:31')), false);
  // transfer à meia-noite: às 21h50 e às 21h51 (faltam 130 e 129 minutos) o Pix vale; às 22h, com as 2 horas cravadas,
  // ainda vale; às 22h01 (faltam 119), não
  assert.equal(pixDisponivel([transfer('2026-11-03', '00:00')], as('2026-11-02T21:50')), true);
  assert.equal(pixDisponivel([transfer('2026-11-03', '00:00')], as('2026-11-02T21:51')), true);
  assert.equal(pixDisponivel([transfer('2026-11-03', '00:00')], as('2026-11-02T22:00')), true);
  assert.equal(pixDisponivel([transfer('2026-11-03', '00:00')], as('2026-11-02T22:01')), false);
  // 23h30, transfer às 2h de amanhã: faltam 150 minutos. O Pix vale.
  assert.equal(pixDisponivel([transfer('2026-11-03', '02:00')], as('2026-11-02T23:30')), true);
  // 23h30, transfer à 1h29 de amanhã: faltam 119 minutos. Só o cartão; um minuto depois (1h30, faltam 120), o Pix vale.
  assert.equal(pixDisponivel([transfer('2026-11-03', '01:29')], as('2026-11-02T23:30')), false);
  assert.equal(cartaoDisponivel([transfer('2026-11-03', '01:29')], as('2026-11-02T23:30')), true);
  assert.equal(pixDisponivel([transfer('2026-11-03', '01:30')], as('2026-11-02T23:30')), true);
  assert.equal(pixDisponivel([transfer('2026-11-03', '01:39')], as('2026-11-02T23:30')), true);
  // a virada do mês e a do ano seguem a mesma conta
  assert.equal(pixDisponivel([transfer('2026-12-01', '00:30')], as('2026-11-30T23:30')), false);
  assert.equal(pixDisponivel([transfer('2027-01-01', '00:30')], as('2026-12-31T23:30')), false);
  assert.equal(pixDisponivel([transfer('2027-01-01', '03:00')], as('2026-12-31T23:30')), true);
  // no mesmo dia nada muda: 21h, serviço às 22h30 (faltam 90 minutos), só o cartão
  assert.equal(pixDisponivel([passeio('2026-11-02', '22:30')], as('2026-11-02T21:00')), false);
  assert.equal(cartaoDisponivel([passeio('2026-11-02', '22:30')], as('2026-11-02T21:00')), true);
  // depois de amanhã em diante, o Pix sempre vale; o que já passou não se paga
  assert.equal(dentroDoPrazo(transfer('2026-11-04', '00:00'), as('2026-11-02T23:59')), true);
  assert.equal(dentroDoPrazo(transfer('2026-11-02', '23:00'), as('2026-11-03T00:10'), 0), false);
  // uma data que não dá para ler nunca libera pagamento
  assert.equal(dentroDoPrazo(transfer('amanhã', '10:00'), as('2026-11-02T10:00')), false);
  assert.equal(dentroDoPrazo(transfer('amanhã', '10:00'), as('2026-11-02T10:00'), 0), false);
});

test('o cartão fecha 30 minutos antes do serviço, e esse prazo nunca fica menor que a duração da sessão de pagamento', () => {
  // decisão do dono de 11/11: "Até 30 min antes"
  assert.equal(ANTECEDENCIA_CARTAO_MINUTOS, 30);
  // quem abre a tela do cartão no último minuto do prazo ainda tem a sessão inteira para pagar antes de o serviço começar
  assert.ok(ANTECEDENCIA_CARTAO_MINUTOS >= VALIDADE_SESSAO_MINUTOS);
  // e o cartão fecha depois do Pix: sem isso, o "depois disso, só cartão" do FASE-4.md deixaria de existir
  assert.ok(ANTECEDENCIA_CARTAO_MINUTOS < ANTECEDENCIA_MINIMA_MINUTOS);
});

test('o WhatsApp da equipe só aparece depois do pagamento aprovado', () => {
  const TODOS: StatusReserva[] = [
    'pendente',
    'pago',
    'recusado',
    'cancelado',
    'expirado',
    'aguardando_whatsapp',
    'reembolsado',
    'contestado',
  ];
  assert.deepEqual(TODOS.filter(mostrarWhatsApp), ['pago']);
});

/** Um passeio com preço (fictício, só para as contas): o que as formas de pagamento recebem. */
const pago = (data: string, hora: string, totalCentavos = 15400, totalPixCentavos = 13860): ItemPagavel => ({
  ...passeio(data, hora),
  totalCentavos,
  totalPixCentavos,
});

test('o interruptor PAGAMENTO_ONLINE e as chaves da Stripe decidem se o checkout oferece cartão e Pix', async () => {
  const itens = [pago('2026-11-03', '09:00')];
  const chaves = { STRIPE_SECRET_KEY: 'rk_test_chave_de_exemplo', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_exemplo' };
  // a cotação vai fixa (os testes não buscam o câmbio na rede)
  const sem = { admin: false, cotacao: null };
  await comAmbiente({ PAGAMENTO_ONLINE: undefined, ...chaves }, async () => {
    assert.equal(modoPagamentoOnline(), 'desligado');
    assert.equal(pagamentoOnlineNoAr(), false);
    assert.deepEqual(await formasDisponiveis(itens, AGORA, { admin: true, cotacao: null }), []);
    assert.deepEqual(await formasDoPagamento(itens, AGORA, { admin: true, cotacao: null }), { formas: [] });
  });
  await comAmbiente({ PAGAMENTO_ONLINE: 'qualquer coisa', ...chaves }, () => assert.equal(modoPagamentoOnline(), 'desligado'));
  await comAmbiente({ PAGAMENTO_ONLINE: 'admin', ...chaves }, async () => {
    assert.equal(modoPagamentoOnline(), 'admin');
    // no modo 'admin' o público continua no caminho do WhatsApp: os textos ainda são os de hoje
    assert.equal(pagamentoOnlineNoAr(), false);
    assert.deepEqual(await formasDisponiveis(itens, AGORA, sem), []);
    assert.deepEqual(await formasDisponiveis(itens, AGORA, { admin: true, cotacao: null }), ['cartao', 'pix']);
  });
  await comAmbiente({ PAGAMENTO_ONLINE: 'publico', ...chaves }, async () => {
    assert.equal(pagamentoOnlineNoAr(), true);
    assert.deepEqual(await formasDisponiveis(itens, AGORA, sem), ['cartao', 'pix']);
    assert.deepEqual(await formasDoPagamento(itens, AGORA, sem), { formas: ['cartao', 'pix'] });
    // item a menos de 2 horas: o Pix sai e fica só o cartão, com o motivo
    assert.deepEqual(await formasDisponiveis([pago('2026-11-02', '15:00')], AGORA, sem), ['cartao']);
    assert.deepEqual(await formasDoPagamento([pago('2026-11-02', '15:00')], AGORA, sem), { formas: ['cartao'], semPix: 'prazo' });
    // item a menos de 30 minutos (aqui, 25): o cartão também sai e não sobra forma online
    assert.deepEqual(await formasDisponiveis([pago('2026-11-02', '14:45')], AGORA, sem), []);
    // serviço que já começou: nenhuma forma online
    assert.deepEqual(await formasDisponiveis([pago('2026-11-02', '14:00')], AGORA, sem), []);
    // valor no Pix acima do limite: só o cartão, com o motivo do limite
    const caro = [pago('2026-11-20', '09:00', 2_000_000, 1_800_000)];
    assert.deepEqual(await formasDoPagamento(caro, AGORA, { admin: false, cotacao: 5.4 }), { formas: ['cartao'], semPix: 'limite' });
    // pedido pequeno: nem precisa da cotação (sem `cotacao`, nada é buscado, porque cabe com qualquer dólar)
    assert.deepEqual(await formasDoPagamento(itens, AGORA), { formas: ['cartao', 'pix'] });
  });
  // ligado, mas sem as chaves da Stripe: nada
  await comAmbiente(
    { PAGAMENTO_ONLINE: 'publico', STRIPE_SECRET_KEY: undefined, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined },
    async () => {
      assert.deepEqual(await formasDisponiveis(itens, AGORA, sem), []);
    },
  );
  assert.deepEqual(FORMAS_PAGAMENTO, ['cartao', 'pix']);
  assert.equal(isFormaPagamento('pix'), true);
  assert.equal(isFormaPagamento('boleto'), false);
});

test('o QR do Pix: 30 minutos longe do prazo, só até o prazo perto dele, nunca menos de 10 minutos, e nada depois do prazo', () => {
  // os instantes vêm com o fuso de Búzios escrito (-03:00), para a conta não depender do relógio da máquina
  const as = (dataHora: string) => new Date(`${dataHora}-03:00`);
  assert.equal(PIX_EXPIRA_SEGUNDOS, 30 * 60);
  assert.equal(PIX_VALIDADE_MINIMA_SEGUNDOS, 10 * 60);
  const servico = [passeio('2026-11-02', '17:00')];
  // o prazo do Pix é 15h (2 horas antes das 17h). Longe dele, o QR inteiro
  assert.equal(validadeDoPix(servico, as('2026-11-02T09:00:00')), 30 * 60);
  assert.equal(validadeDoPix(servico, as('2026-11-02T14:30:00')), 30 * 60);
  // com menos de 30 minutos até o prazo, o QR dura só até ele, com os segundos
  assert.equal(validadeDoPix(servico, as('2026-11-02T14:31:00')), 29 * 60);
  assert.equal(validadeDoPix(servico, as('2026-11-02T14:40:30')), 19 * 60 + 30);
  assert.equal(validadeDoPix(servico, as('2026-11-02T14:50:00')), 10 * 60);
  // nos últimos 10 minutos do prazo, o Pix continua aparecendo, com o QR de 10 minutos (passa um pouco do prazo)
  assert.equal(validadeDoPix(servico, as('2026-11-02T14:50:01')), 10 * 60);
  assert.equal(validadeDoPix(servico, as('2026-11-02T14:55:00')), 10 * 60);
  assert.equal(validadeDoPix(servico, as('2026-11-02T14:59:59')), 10 * 60);
  // com as 2 horas cravadas, ainda aparece; um segundo depois, só o cartão
  assert.equal(validadeDoPix(servico, as('2026-11-02T15:00:00')), 10 * 60);
  assert.equal(validadeDoPix(servico, as('2026-11-02T15:00:01')), null);
  assert.equal(validadeDoPix(servico, as('2026-11-02T15:01:00')), null);
  assert.equal(validadeDoPix(servico, as('2026-11-02T18:00:00')), null);
  // num pedido com vários itens, vale o que começa primeiro
  const pedido = [passeio('2026-11-03', '09:00'), transfer('2026-11-02', '17:00'), casa('2026-11-04')];
  assert.equal(validadeDoPix(pedido, as('2026-11-02T14:45:00')), 15 * 60);
  // a casa conta pela entrada às 15h
  assert.equal(validadeDoPix([casa('2026-11-02')], as('2026-11-02T12:40:00')), 20 * 60);
  // atravessa a meia-noite: às 22h15, o transfer da 0h30 de amanhã tem o prazo do Pix às 22h30
  assert.equal(validadeDoPix([transfer('2026-11-03', '00:30')], as('2026-11-02T22:15:00')), 15 * 60);
  // sem itens, ou com uma data que não dá para ler, nunca
  assert.equal(validadeDoPix([], as('2026-11-02T09:00:00')), null);
  assert.equal(validadeDoPix([passeio('amanhã', '10:00')], as('2026-11-02T09:00:00')), null);
  // e pixDisponivel é exatamente "validadeDoPix tem valor", segundo a segundo perto do prazo: até as 15h em ponto, sim
  for (let s = 0; s < 120; s += 7) {
    const agora = new Date(as('2026-11-02T14:59:00').getTime() + s * 1000);
    assert.equal(pixDisponivel(servico, agora), validadeDoPix(servico, agora) !== null, agora.toISOString());
    assert.equal(pixDisponivel(servico, agora), s <= 60, agora.toISOString());
  }
  // os segundos até o começo do serviço, no fuso de Búzios
  assert.equal(segundosAteOInicio(passeio('2026-11-02', '17:00'), as('2026-11-02T16:59:30')), 30);
  assert.ok(Number.isNaN(segundosAteOInicio(passeio('amanhã', '17:00'), as('2026-11-02T16:59:30'))));
});

test('o QR, mesmo encurtado, fica dentro do que a Stripe aceita (de 60 a 1.209.600 segundos)', () => {
  const servico = [passeio('2026-11-02', '17:00')];
  const inicio = new Date('2026-11-02T08:00:00-03:00').getTime();
  for (let s = 0; s < 8 * 3600; s += 37) {
    const v = validadeDoPix(servico, new Date(inicio + s * 1000));
    if (v !== null) assert.ok(v >= 60 && v <= 1_209_600 && v >= PIX_VALIDADE_MINIMA_SEGUNDOS && v <= PIX_EXPIRA_SEGUNDOS, String(v));
  }
});

test('o reservado para o mesmo dia perto do limite de 2 horas ainda paga com Pix, e o QR nunca vence perto do serviço', () => {
  const as = (dataHora: string) => new Date(`${dataHora}-03:00`);
  // o caso da revisão: às 11h52, o passeio das 14h (que o site ainda deixa reservar) tem Pix, com o QR de 10 minutos
  const passeioDas14 = [pago('2026-11-02', '14:00')];
  assert.deepEqual(escolherFormas(passeioDas14, as('2026-11-02T11:52:00'), null), { formas: ['cartao', 'pix'] });
  assert.equal(validadeDoPix(passeioDas14, as('2026-11-02T11:52:00')), 10 * 60);
  // às 12h em ponto ainda; às 12h00min01s, só o cartão, e o motivo é o prazo
  assert.deepEqual(escolherFormas(passeioDas14, as('2026-11-02T12:00:00'), null), { formas: ['cartao', 'pix'] });
  assert.deepEqual(escolherFormas(passeioDas14, as('2026-11-02T12:00:01'), null), { formas: ['cartao'], semPix: 'prazo' });
  // o pior caso: a sessão criada em cima do prazo, o toque em pagar no último minuto dela (31 minutos, com a folga) e o
  // QR de 10 minutos. Ele vence 41 minutos depois do prazo: ainda 79 minutos antes do serviço, e antes de o cartão fechar
  const minutosDaSessao = VALIDADE_SESSAO_MINUTOS + 1;
  let piorFolga = Infinity;
  // das 9h às 12h02, de 5 em 5 segundos (passa pelas 12h em ponto, o último instante com Pix)
  for (let s = 0; s <= 3 * 3600 + 120; s += 5) {
    const criada = new Date(as('2026-11-02T09:00:00').getTime() + s * 1000);
    const v = validadeDoPix(passeioDas14, criada);
    if (v === null) continue;
    const venceEm = criada.getTime() / 1000 + minutosDaSessao * 60 + v;
    piorFolga = Math.min(piorFolga, as('2026-11-02T14:00:00').getTime() / 1000 - venceEm);
  }
  assert.equal(piorFolga, 79 * 60);
  assert.ok(piorFolga > ANTECEDENCIA_CARTAO_MINUTOS * 60);
});

test('o limite de um Pix: US$ 3.000 pela cotação, com 10% de folga; sem cotação, R$ 10.000,00', () => {
  assert.equal(PIX_LIMITE_DOLARES, 3000);
  // com o dólar a R$ 5,40: até US$ 2.700 em reais, R$ 14.580,00
  assert.equal(limiteDoPixCentavos(5.4), 1_458_000);
  assert.equal(limiteDoPixCentavos(5), 1_350_000);
  // sem cotação que valha (null, fora da faixa de 1 a 20 reais por dólar): o teto fixo
  assert.equal(PIX_TETO_SEM_COTACAO_CENTAVOS, 1_000_000);
  for (const ruim of [null, undefined, 0, 1, 25, Number.NaN]) assert.equal(limiteDoPixCentavos(ruim), 1_000_000, String(ruim));
  // o teto fixo cabe no limite da Stripe enquanto o dólar valer mais de R$ 3,34
  assert.ok(PIX_TETO_SEM_COTACAO_CENTAVOS <= PIX_LIMITE_DOLARES * 3.34 * 100);
  // o valor no Pix do pedido inteiro (nas casas, o sinal) é o que conta
  assert.equal(pixCabeNoLimite([{ totalCentavos: 1_200_000, totalPixCentavos: 1_080_000 }], 5.4), true);
  assert.equal(pixCabeNoLimite([{ totalCentavos: 1_200_000, totalPixCentavos: 1_080_000 }], null), false);
  assert.equal(pixCabeNoLimite([{ tipo: 'casa', totalCentavos: 2_400_000, totalPixCentavos: 2_160_000 }], null), false);
  assert.equal(pixCabeNoLimite([{ tipo: 'casa', totalCentavos: 1_800_000, totalPixCentavos: 1_620_000 }], null), true);
  // um valor que não dá para ler não cabe
  assert.equal(pixCabeNoLimite([{ totalCentavos: Number.NaN }], 5.4), false);
});

test('o maior pedido de hoje cabe no Pix: o sinal da Geribá no Réveillon (5 diárias), R$ 4.950,00', () => {
  // FASE-4.md, Etapa 7: Réveillon de 5 diárias na Geribá, R$ 11.000,00; no Pix, R$ 9.900,00; o sinal é metade
  const geriba: ItemPagavel = { tipo: 'casa', data: '2026-12-28', totalCentavos: 1_100_000, totalPixCentavos: 990_000 };
  assert.equal(valorACobrar([geriba], 'pix'), 495_000);
  // cabe sem cotação nenhuma e com o dólar bem mais barato que hoje
  assert.equal(pixCabeNoLimite([geriba], null), true);
  assert.equal(pixCabeNoLimite([geriba], 2), true);
  assert.deepEqual(escolherFormas([geriba], AGORA, null), { formas: ['cartao', 'pix'] });
  // o mesmo pedido com mais passeios no carrinho ainda cabe pelo teto fixo
  assert.deepEqual(escolherFormas([geriba, pago('2026-12-29', '09:00', 176000, 158400)], AGORA, null), { formas: ['cartao', 'pix'] });
});

test('sem o Pix, o motivo: o prazo vem antes do limite', () => {
  const caroEPerto = [pago('2026-11-02', '15:00', 2_000_000, 1_800_000)];
  assert.deepEqual(escolherFormas(caroEPerto, AGORA, 5.4), { formas: ['cartao'], semPix: 'prazo' });
  const caroELonge = [pago('2026-11-20', '09:00', 2_000_000, 1_800_000)];
  assert.deepEqual(escolherFormas(caroELonge, AGORA, 5.4), { formas: ['cartao'], semPix: 'limite' });
  // com a cotação mais alta, o mesmo valor cabe
  assert.deepEqual(escolherFormas(caroELonge, AGORA, 7.5), { formas: ['cartao', 'pix'] });
  // sem nenhum item, nada
  assert.deepEqual(escolherFormas([], AGORA, 5.4), { formas: [], semPix: 'prazo' });
});

// casa fictícia, só para as contas (o site não tem casas inventadas)
const TABELA: TabelaDiarias = {
  diaria: 1000,
  minimoNoites: 2,
  temporadas: [{ nome: { pt: 'Alta', en: 'High', es: 'Alta' }, de: '2026-12-15', ate: '2027-02-28', diaria: 1500.5, minimoNoites: 3 }],
  feriados: [],
  taxaLimpeza: 400,
};

test('a estadia em centavos: totais no cartão e no Pix, sinal de 50% e restante', () => {
  const o = orcamentoCasaCentavos(TABELA, '2026-11-10', '2026-11-13');
  assert.equal(o.ok, true);
  assert.deepEqual(
    o.noites.map((n) => n.diariaCentavos),
    [100000, 100000, 100000],
  );
  assert.equal(o.diariasCentavos, 300000);
  assert.equal(o.taxaLimpezaCentavos, 40000);
  assert.equal(o.totalCentavos, 340000);
  // o desconto do Pix em cada diária e na taxa, como nos passeios
  assert.equal(o.totalPixCentavos, 3 * 90000 + 36000);
  assert.equal(o.sinalCentavos, 170000);
  assert.equal(o.sinalPixCentavos, 153000);
  assert.equal(o.restanteCentavos, 170000);
  assert.equal(o.restantePixCentavos, 153000);
  // o mesmo item, como a sessão cobra
  const item: ItemCobravel = { tipo: 'casa', totalCentavos: o.totalCentavos, totalPixCentavos: o.totalPixCentavos };
  assert.equal(valorDoItem(item, 'cartao'), o.sinalCentavos);
  assert.equal(valorDoItem(item, 'pix'), o.sinalPixCentavos);
});

test('diária com centavos: a conta não arredonda em reais, e a página vê os mesmos números', () => {
  // 3 noites na alta (R$ 1.500,50) + limpeza R$ 400
  const c = orcamentoCasaCentavos(TABELA, '2026-12-20', '2026-12-23');
  assert.equal(c.totalCentavos, 3 * 150050 + 40000);
  assert.equal(c.totalPixCentavos, 3 * 135045 + 36000);
  assert.equal(c.sinalCentavos, Math.round(c.totalCentavos / 2));
  assert.equal(c.minimoNoites, 3);
  const r = orcamentoCasa(TABELA, '2026-12-20', '2026-12-23');
  assert.equal(r.total, c.totalCentavos / 100);
  assert.equal(r.sinal, c.sinalCentavos / 100);
  assert.equal(r.restante, c.restanteCentavos / 100);
  assert.deepEqual(
    r.noites.map((n) => n.diaria),
    [1500.5, 1500.5, 1500.5],
  );
});

test('sem noites ou abaixo do mínimo, a estadia em centavos também avisa', () => {
  const vazia = orcamentoCasaCentavos(TABELA, '2026-11-10', '2026-11-10');
  assert.equal(vazia.ok, false);
  assert.equal(vazia.motivo, 'datas');
  assert.equal(vazia.totalCentavos, 0);
  assert.equal(vazia.sinalPixCentavos, 0);
  const curta = orcamentoCasaCentavos(TABELA, '2026-12-20', '2026-12-21');
  assert.equal(curta.ok, false);
  assert.equal(curta.motivo, 'minimo');
});

test('em aberto, a tela mostra só os valores das formas que ainda valem', () => {
  const pix = { centavos: 72000, forma: 'pix' };
  const cartao = { centavos: 80000, forma: 'cartao' };
  // fechado pelo WhatsApp (sem formas): os dois valores, o do Pix primeiro
  assert.deepEqual(partesDoTotal(80000, 72000), [pix, cartao]);
  assert.deepEqual(partesDoTotal(80000, 72000, ['cartao', 'pix']), [pix, cartao]);
  // passado o prazo do Pix (2 horas antes do serviço), só o valor do cartão
  assert.deepEqual(partesDoTotal(80000, 72000, ['cartao']), [cartao]);
  assert.deepEqual(partesDoTotal(80000, 72000, ['pix']), [pix]);
  // sem forma nenhuma (o serviço começou ou o pagamento online está desligado), o total vai sozinho
  assert.deepEqual(partesDoTotal(80000, 72000, []), [{ centavos: 80000 }]);
  // pedido sem valor no Pix: o total sozinho, com ou sem formas
  assert.deepEqual(partesDoTotal(80000), [{ centavos: 80000 }]);
  assert.deepEqual(partesDoTotal(80000, undefined, ['cartao', 'pix']), [{ centavos: 80000 }]);
  assert.deepEqual(partesDoTotal(80000, 0, ['cartao']), [{ centavos: 80000 }]);
});
