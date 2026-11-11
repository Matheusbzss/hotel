import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HORA_ENTRADA_CASA, orcamentoCasa, orcamentoCasaCentavos, sinalCentavos, type TabelaDiarias } from '../src/lib/diarias.ts';
import {
  ANTECEDENCIA_CARTAO_MINUTOS,
  FORMAS_PAGAMENTO,
  cartaoDisponivel,
  dentroDoPrazo,
  formasDisponiveis,
  inicioDoItem,
  isFormaPagamento,
  modoPagamentoOnline,
  mostrarWhatsApp,
  pixDisponivel,
  totalDoItem,
  valorACobrar,
  valorDoItem,
  type ItemAgendado,
  type ItemCobravel,
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
  // 22h, transfer à meia-noite: faltam exatamente 120 minutos. O Pix ainda vale.
  assert.equal(pixDisponivel([transfer('2026-11-03', '00:00')], as('2026-11-02T22:00')), true);
  // 23h30, transfer às 2h de amanhã: faltam 150 minutos. O Pix vale.
  assert.equal(pixDisponivel([transfer('2026-11-03', '02:00')], as('2026-11-02T23:30')), true);
  // 23h30, transfer à 1h29 de amanhã: faltam 119 minutos. Só o cartão; um minuto depois (1h30), o Pix volta a valer.
  assert.equal(pixDisponivel([transfer('2026-11-03', '01:29')], as('2026-11-02T23:30')), false);
  assert.equal(pixDisponivel([transfer('2026-11-03', '01:30')], as('2026-11-02T23:30')), true);
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

test('o interruptor PAGAMENTO_ONLINE e as chaves da Stripe decidem se o checkout oferece cartão e Pix', async () => {
  const itens = [passeio('2026-11-03', '09:00')];
  const chaves = { STRIPE_SECRET_KEY: 'rk_test_chave_de_exemplo', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_exemplo' };
  await comAmbiente({ PAGAMENTO_ONLINE: undefined, ...chaves }, async () => {
    assert.equal(modoPagamentoOnline(), 'desligado');
    assert.deepEqual(await formasDisponiveis(itens, AGORA, { admin: true }), []);
  });
  await comAmbiente({ PAGAMENTO_ONLINE: 'qualquer coisa', ...chaves }, () => assert.equal(modoPagamentoOnline(), 'desligado'));
  await comAmbiente({ PAGAMENTO_ONLINE: 'admin', ...chaves }, async () => {
    assert.equal(modoPagamentoOnline(), 'admin');
    assert.deepEqual(await formasDisponiveis(itens, AGORA, { admin: false }), []);
    assert.deepEqual(await formasDisponiveis(itens, AGORA, { admin: true }), ['cartao', 'pix']);
  });
  await comAmbiente({ PAGAMENTO_ONLINE: 'publico', ...chaves }, async () => {
    assert.deepEqual(await formasDisponiveis(itens, AGORA), ['cartao', 'pix']);
    // item a menos de 2 horas: o Pix sai e fica só o cartão
    assert.deepEqual(await formasDisponiveis([passeio('2026-11-02', '15:00')], AGORA), ['cartao']);
    // item a menos de 30 minutos (aqui, 25): o cartão também sai e não sobra forma online
    assert.deepEqual(await formasDisponiveis([passeio('2026-11-02', '14:45')], AGORA), []);
    // serviço que já começou: nenhuma forma online
    assert.deepEqual(await formasDisponiveis([passeio('2026-11-02', '14:00')], AGORA), []);
  });
  // ligado, mas sem as chaves da Stripe: nada
  await comAmbiente(
    { PAGAMENTO_ONLINE: 'publico', STRIPE_SECRET_KEY: undefined, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined },
    async () => {
      assert.deepEqual(await formasDisponiveis(itens, AGORA), []);
    },
  );
  assert.deepEqual(FORMAS_PAGAMENTO, ['cartao', 'pix']);
  assert.equal(isFormaPagamento('pix'), true);
  assert.equal(isFormaPagamento('boleto'), false);
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
