import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EscolhaItem } from '../src/lib/carrinho';
import {
  assinarLink,
  chaveDosLinks,
  idiomaDoLink,
  lerLink,
  linkDeSair,
  linkDeVoltar,
  VALIDADE_DO_VOLTAR_DIAS,
} from '../src/lib/email/links.ts';
import { lembretesDe, type CarrinhoNoFunil } from '../src/lib/estatisticas.ts';
import {
  INTERVALO_ENTRE_LEMBRETES_HORAS,
  LEMBRETE_1_DEPOIS_HORAS,
  LEMBRETE_2_DEPOIS_HORAS,
  LEMBRETE_ATE_HORAS,
  LEMBRETES_POR_DIA,
  decidirLembrete,
  inicioDoDiaUtc,
  referenciaDoCarrinho,
  type CarrinhoParaLembrete,
} from '../src/lib/lembretes.ts';

// Etapa 6: o carrinho abandonado. Quando o lembrete sai (e quando não sai), os links assinados de voltar ao carrinho e
// de sair da lista, e o que a página de estatísticas conta.

/** Quinta, 12/11/2026, 15h em Búzios (18h UTC). */
const AGORA = new Date('2026-11-12T18:00:00Z');
const horasAntes = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();

const passeio = (data: string, hora = '10:00'): { escolha: EscolhaItem } => ({
  escolha: { tipo: 'passeio', slug: 'escuna-buzios', data, hora, adultos: 2, meia: 0, gratis: 0 },
});
const transfer = (data: string, hora: string): { escolha: EscolhaItem } => ({
  escolha: {
    tipo: 'transfer',
    veiculo: 'carro',
    ida: { saida: { lugar: 'galeao' }, destino: { lugar: 'buzios', endereco: 'Pousada X' }, data, hora },
    passageiros: 2,
    malas: { grandes: 1, medias: 0, mao: 2 },
  },
});

const carrinho = (mudar: Partial<CarrinhoParaLembrete> = {}): CarrinhoParaLembrete => ({
  email: 'cliente@exemplo.com',
  itens: [passeio('2026-11-20')],
  pedidoId: null,
  atualizadoEm: horasAntes(2),
  lembrete1Em: null,
  lembrete2Em: null,
  ...mudar,
});
const decidir = (c: CarrinhoParaLembrete, descadastrado = false) => decidirLembrete(c, AGORA, { descadastrado });

test('os prazos combinados: 1 hora, 24 horas, 12 horas entre os dois, nada depois de 3 dias, até 30 por dia', () => {
  assert.equal(LEMBRETE_1_DEPOIS_HORAS, 1);
  assert.equal(LEMBRETE_2_DEPOIS_HORAS, 24);
  assert.equal(INTERVALO_ENTRE_LEMBRETES_HORAS, 12);
  assert.equal(LEMBRETE_ATE_HORAS, 72);
  assert.equal(LEMBRETES_POR_DIA, 30);
});

test('o primeiro lembrete sai a partir de 1 hora sem mexer no carrinho; antes disso, nada', () => {
  assert.deepEqual(decidir(carrinho({ atualizadoEm: horasAntes(0.5) })), { pular: 'cedo' });
  assert.deepEqual(decidir(carrinho({ atualizadoEm: horasAntes(0.99) })), { pular: 'cedo' });
  assert.deepEqual(decidir(carrinho({ atualizadoEm: horasAntes(1) })), { lembrete: 1 });
  assert.deepEqual(decidir(carrinho({ atualizadoEm: horasAntes(5) })), { lembrete: 1 });
  // o agendamento ficou parado: o primeiro ainda sai, desde que o carrinho não tenha mais de 3 dias
  assert.deepEqual(decidir(carrinho({ atualizadoEm: horasAntes(30) })), { lembrete: 1 });
  assert.deepEqual(decidir(carrinho({ atualizadoEm: horasAntes(73) })), { pular: 'velho' });
  // data que não presta não manda nada
  assert.deepEqual(decidir(carrinho({ atualizadoEm: 'ontem' })), { pular: 'cedo' });
});

test('o segundo lembrete: a partir de 24 horas sem mexer, e pelo menos 12 horas depois do primeiro', () => {
  const comPrimeiro = (parado: number, primeiro: number) =>
    carrinho({ atualizadoEm: horasAntes(parado), lembrete1Em: horasAntes(primeiro) });
  assert.deepEqual(decidir(comPrimeiro(5, 4)), { pular: 'cedo' });
  assert.deepEqual(decidir(comPrimeiro(23.9, 22.9)), { pular: 'cedo' });
  assert.deepEqual(decidir(comPrimeiro(24, 23)), { lembrete: 2 });
  // o primeiro saiu atrasado (agendamento parado): o segundo espera as 12 horas
  assert.deepEqual(decidir(comPrimeiro(30, 2)), { pular: 'intervalo' });
  assert.deepEqual(decidir(comPrimeiro(36, 12)), { lembrete: 2 });
  assert.deepEqual(decidir(comPrimeiro(72.5, 70)), { pular: 'velho' });
  // os dois já saíram: nunca um terceiro
  assert.deepEqual(decidir(carrinho({ atualizadoEm: horasAntes(48), lembrete1Em: horasAntes(47), lembrete2Em: horasAntes(24) })), {
    pular: 'ja-mandado',
  });
});

test('nenhum lembrete: sem e-mail, carrinho que virou pedido, quem saiu da lista e carrinho vazio', () => {
  assert.deepEqual(decidir(carrinho({ email: null })), { pular: 'sem-email' });
  assert.deepEqual(decidir(carrinho({ email: '' })), { pular: 'sem-email' });
  assert.deepEqual(decidir(carrinho({ pedidoId: '6f1d…' })), { pular: 'virou-pedido' });
  assert.deepEqual(decidir(carrinho(), true), { pular: 'saiu-da-lista' });
  assert.deepEqual(decidir(carrinho({ itens: [] })), { pular: 'vazio' });
});

test('nenhum lembrete se a data de algum item já passou ou se falta menos de 2 horas para o primeiro serviço', () => {
  // hoje às 10h já passou (agora são 15h em Búzios)
  assert.deepEqual(decidir(carrinho({ itens: [passeio('2026-11-20'), passeio('2026-11-12', '10:00')] })), { pular: 'data-passou' });
  assert.deepEqual(decidir(carrinho({ itens: [passeio('2026-11-11')] })), { pular: 'data-passou' });
  // hoje às 16h30: começa em 1h30
  assert.deepEqual(decidir(carrinho({ itens: [passeio('2026-11-12', '16:30')] })), { pular: 'servico-proximo' });
  // hoje às 17h: exatamente 2 horas, ainda dá
  assert.deepEqual(decidir(carrinho({ itens: [passeio('2026-11-12', '17:00')] })), { lembrete: 1 });
  // o transfer conta pela hora da ida
  assert.deepEqual(decidir(carrinho({ itens: [transfer('2026-11-12', '16:00')] })), { pular: 'servico-proximo' });
  assert.deepEqual(decidir(carrinho({ itens: [transfer('2026-11-13', '08:00')] })), { lembrete: 1 });
});

test('o dia do limite é o do Resend (UTC) e a referência do carrinho nunca leva o e-mail', () => {
  assert.equal(inicioDoDiaUtc(new Date('2026-11-12T23:30:00-03:00')), '2026-11-13T00:00:00.000Z');
  assert.equal(referenciaDoCarrinho('3f2a9c10-7d1b-4e2a-9a55-0c1d2e3f4a5b'), 'carrinho 3f2a9c10');
});

/* ------------------------------------------------------------------ */
/* Os links assinados                                                  */

const CHAVE = chaveDosLinks('segredo-do-agendamento-de-teste') as Buffer;
const CARRINHO = '3f2a9c10-7d1b-4e2a-9a55-0c1d2e3f4a5b';

test('sem o CRON_SECRET não há chave (e os lembretes não saem); a chave muda com o segredo', () => {
  assert.equal(chaveDosLinks(undefined), null);
  assert.equal(chaveDosLinks(''), null);
  assert.ok(CHAVE.length === 32);
  assert.notDeepEqual(chaveDosLinks('outro-segredo'), CHAVE);
});

test('o link de sair da lista: confere, não vence e só serve para sair', () => {
  const token = linkDeSair(CARRINHO, 'es-ar', CHAVE);
  assert.match(token, /^[\w-]+\.[\w-]+$/, 'só caracteres que cabem no endereço');
  assert.ok(!token.includes('@'), 'nada de e-mail no link');
  assert.deepEqual(lerLink(token, 'sair', CHAVE, new Date('2030-01-01')), { f: 'sair', c: CARRINHO, i: 'es-ar' });
  assert.equal(lerLink(token, 'voltar', CHAVE), null, 'o de sair não abre o carrinho');
  assert.equal(idiomaDoLink(token), 'es-ar');
});

test('o link adulterado, de outra chave ou malformado não vale', () => {
  const token = linkDeSair(CARRINHO, 'pt', CHAVE);
  const [conteudo, assinatura] = token.split('.');
  const outroCarrinho = Buffer.from(JSON.stringify({ f: 'sair', c: '00000000-0000-4000-8000-000000000000', i: 'pt' })).toString(
    'base64url',
  );
  assert.equal(lerLink(`${outroCarrinho}.${assinatura}`, 'sair', CHAVE), null, 'conteúdo trocado');
  assert.equal(lerLink(`${conteudo}.${assinatura.slice(0, -2)}xx`, 'sair', CHAVE), null, 'assinatura trocada');
  assert.equal(lerLink(token, 'sair', chaveDosLinks('outro-segredo') as Buffer), null, 'outra chave');
  for (const ruim of ['', 'abc', 'a.b.c', `${conteudo}.`, '.x', null, undefined, 'x'.repeat(700)]) {
    assert.equal(lerLink(ruim, 'sair', CHAVE), null, String(ruim).slice(0, 20));
  }
  // assinatura certa, mas dados que não prestam (idioma que não existe, sem carrinho)
  assert.equal(lerLink(assinarLink({ f: 'sair', c: '', i: 'pt' }, CHAVE), 'sair', CHAVE), null);
  assert.equal(lerLink(assinarLink({ f: 'sair', c: CARRINHO, i: 'fr' as never }, CHAVE), 'sair', CHAVE), null);
  assert.equal(idiomaDoLink('lixo'), 'pt');
});

test('o link de voltar ao carrinho vale 30 dias e leva o número do lembrete', () => {
  const token = linkDeVoltar(CARRINHO, 'en', 2, CHAVE, AGORA);
  const lido = lerLink(token, 'voltar', CHAVE, AGORA);
  assert.equal(lido?.c, CARRINHO);
  assert.equal(lido?.i, 'en');
  assert.equal(lido?.n, 2);
  assert.equal(VALIDADE_DO_VOLTAR_DIAS, 30);
  const vence = new Date(AGORA.getTime() + 30 * 86_400_000);
  assert.ok(lerLink(token, 'voltar', CHAVE, new Date(vence.getTime() - 60_000)));
  assert.equal(lerLink(token, 'voltar', CHAVE, new Date(vence.getTime() + 60_000)), null, 'vencido');
  assert.equal(lerLink(token, 'sair', CHAVE, AGORA), null, 'o de voltar não tira da lista');
});

/* ------------------------------------------------------------------ */
/* As estatísticas                                                     */

test('estatísticas: carrinhos lembrados no período, e-mails enviados, quem voltou pelo link e quem comprou depois', () => {
  const NOV = { de: '2026-11-01', ate: '2026-11-30' };
  const c = (mudar: Partial<CarrinhoNoFunil>): CarrinhoNoFunil => ({
    criadoEm: '2026-11-05T12:00:00Z',
    fezPedido: false,
    pagou: false,
    ...mudar,
  });
  const carrinhos: CarrinhoNoFunil[] = [
    // lembrado, não voltou
    c({ lembrete1Em: '2026-11-05T13:10:00Z' }),
    // dois lembretes, voltou pelo link e pagou
    c({
      lembrete1Em: '2026-11-06T13:10:00Z',
      lembrete2Em: '2026-11-07T13:10:00Z',
      voltouEm: '2026-11-07T15:00:00Z',
      fezPedido: true,
      pedidoEm: '2026-11-07T15:20:00Z',
      pagou: true,
    }),
    // voltou, fez o pedido e não pagou
    c({ lembrete1Em: '2026-11-08T13:10:00Z', voltouEm: '2026-11-08T14:00:00Z', fezPedido: true, pedidoEm: '2026-11-08T14:05:00Z' }),
    // voltou, mas o pedido veio antes da volta (não conta como pedido do lembrete)
    c({
      lembrete1Em: '2026-11-09T13:10:00Z',
      voltouEm: '2026-11-09T18:00:00Z',
      fezPedido: true,
      pedidoEm: '2026-11-09T16:00:00Z',
      pagou: true,
    }),
    // lembrado em outubro: fica fora de novembro, mas o segundo e-mail (em novembro) conta como enviado
    c({ criadoEm: '2026-10-30T12:00:00Z', lembrete1Em: '2026-10-31T12:00:00Z', lembrete2Em: '2026-11-01T13:00:00Z' }),
    // sem lembrete
    c({ fezPedido: true, pagou: true }),
  ];
  assert.deepEqual(lembretesDe(carrinhos, NOV), { carrinhos: 4, enviados: 6, voltaram: 3, pedidos: 2, pagos: 1 });
  assert.deepEqual(lembretesDe(carrinhos, { de: '2026-10-01', ate: '2026-10-31' }), {
    carrinhos: 1,
    enviados: 1,
    voltaram: 0,
    pedidos: 0,
    pagos: 0,
  });
  assert.deepEqual(lembretesDe([], NOV), { carrinhos: 0, enviados: 0, voltaram: 0, pedidos: 0, pagos: 0 });
});
