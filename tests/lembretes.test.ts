import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EscolhaItem } from '../src/lib/carrinho';
import {
  assinarLink,
  chaveDosLinks,
  cifrarEmail,
  decifrarEmail,
  idiomaDoLink,
  lerLink,
  linkDeSair,
  linkDeVoltar,
  VALIDADE_DO_VOLTAR_DIAS,
} from '../src/lib/email/links.ts';
import { juntarCopias, lembretesDe, type CarrinhoComCopia, type CarrinhoNoFunil } from '../src/lib/estatisticas.ts';
import {
  FOLGA_DO_LEMBRETE_MINUTOS,
  INTERVALO_ENTRE_LEMBRETES_HORAS,
  JA_COMPROU_HORAS,
  LEMBRETE_1_DEPOIS_HORAS,
  LEMBRETE_2_DEPOIS_HORAS,
  LEMBRETE_ATE_HORAS,
  LEMBRETES_POR_DIA,
  decidirLembrete,
  inicioDoDiaUtc,
  jaComprou,
  referenciaDoCarrinho,
  voltarAoCarrinho,
  type CarrinhoParaLembrete,
  type DependenciasDaVolta,
  type PedidoDoEmail,
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

test('nenhum lembrete se a data de algum item já passou ou se falta menos de 3 horas para o primeiro serviço', () => {
  // as 2 horas do prazo para reservar, mais 1 hora para ler o e-mail, voltar e pagar
  assert.equal(FOLGA_DO_LEMBRETE_MINUTOS, 180);
  // hoje às 10h já passou (agora são 15h em Búzios)
  assert.deepEqual(decidir(carrinho({ itens: [passeio('2026-11-20'), passeio('2026-11-12', '10:00')] })), { pular: 'data-passou' });
  assert.deepEqual(decidir(carrinho({ itens: [passeio('2026-11-11')] })), { pular: 'data-passou' });
  // hoje às 16h30: começa em 1h30; às 17h, em 2 horas (ainda dá para reservar, mas não para o lembrete chegar a tempo)
  assert.deepEqual(decidir(carrinho({ itens: [passeio('2026-11-12', '16:30')] })), { pular: 'servico-proximo' });
  assert.deepEqual(decidir(carrinho({ itens: [passeio('2026-11-12', '17:00')] })), { pular: 'servico-proximo' });
  // hoje às 18h: exatamente 3 horas, ainda dá
  assert.deepEqual(decidir(carrinho({ itens: [passeio('2026-11-12', '18:00')] })), { lembrete: 1 });
  // o transfer conta pela hora da ida
  assert.deepEqual(decidir(carrinho({ itens: [transfer('2026-11-12', '17:00')] })), { pular: 'servico-proximo' });
  assert.deepEqual(decidir(carrinho({ itens: [transfer('2026-11-13', '08:00')] })), { lembrete: 1 });
});

test('nenhum lembrete para quem comprou na cópia aberta pela volta, para a própria cópia e para quem já comprou', () => {
  const segundo = carrinho({ lembrete1Em: horasAntes(30), atualizadoEm: horasAntes(30) });
  // voltou pelo link do primeiro lembrete e fez o pedido na cópia: o carrinho de origem também virou pedido
  assert.deepEqual(decidirLembrete(segundo, AGORA, { descadastrado: false, copiaVirouPedido: true }), { pular: 'virou-pedido' });
  // a volta sozinha (que um filtro de e-mail também faz, abrindo o link) não segura o segundo lembrete
  assert.deepEqual(decidir(segundo), { lembrete: 2 });
  // a cópia, mesmo que o cliente digite o e-mail de novo nela
  assert.deepEqual(decidir(carrinho({ veioDe: '3f2a9c10-7d1b-4e2a-9a55-0c1d2e3f4a5b' })), { pular: 'copia' });
  // o dono do e-mail já fez um pedido por outro carrinho
  assert.deepEqual(decidirLembrete(carrinho(), AGORA, { descadastrado: false, jaComprou: true }), { pular: 'ja-comprou' });
});

test('"já comprou": pedido com o mesmo e-mail depois do carrinho ou nas últimas 72 horas, menos o cancelado', () => {
  assert.equal(JA_COMPROU_HORAS, 72);
  const pedido = (mudar: Partial<PedidoDoEmail>): PedidoDoEmail => ({
    email: 'cliente@exemplo.com',
    criadoEm: horasAntes(1),
    status: 'pago',
    ...mudar,
  });
  const comprou = (pedidos: PedidoDoEmail[], criadoEm: string | null = horasAntes(100)) =>
    jaComprou('Cliente@Exemplo.com ', criadoEm, pedidos, AGORA);
  // o caso do navegador do Instagram: o carrinho com o e-mail ficou, e a compra saiu por outro carrinho
  assert.equal(comprou([pedido({})]), true);
  // qualquer status conta (pendente, expirado, pelo WhatsApp), menos o cancelado
  for (const status of ['pendente', 'expirado', 'aguardando_whatsapp', 'reembolsado'])
    assert.equal(comprou([pedido({ status })]), true, status);
  assert.equal(comprou([pedido({ status: 'cancelado' })]), false);
  // outro e-mail não conta
  assert.equal(comprou([pedido({ email: 'outra@exemplo.com' })]), false);
  // o pedido antigo (antes do carrinho e há mais de 72 horas) é de outra viagem
  assert.equal(comprou([pedido({ criadoEm: horasAntes(90) })], horasAntes(80)), false);
  // mas o pedido feito depois do carrinho conta, mesmo há mais de 72 horas
  assert.equal(comprou([pedido({ criadoEm: horasAntes(90) })], horasAntes(95)), true);
  // sem a data do carrinho, só as 72 horas
  assert.equal(comprou([pedido({ criadoEm: horasAntes(71) })], null), true);
  assert.equal(comprou([pedido({ criadoEm: horasAntes(73) })], null), false);
  assert.equal(jaComprou('', null, [pedido({})], AGORA), false);
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

test('o link de sair leva, cifrado, o e-mail que recebeu o lembrete: sai exatamente esse, e o link não mostra o endereço', () => {
  const email = 'cliente.a@exemplo.com';
  const token = linkDeSair(CARRINHO, 'pt', CHAVE, email);
  const conteudo = Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
  assert.ok(!conteudo.includes('@') && !conteudo.includes('cliente'), 'o e-mail não vai em claro');
  const lido = lerLink(token, 'sair', CHAVE);
  assert.ok(lido?.e);
  assert.equal(decifrarEmail(lido.e, CHAVE), email);
  // outra chave não decifra; o texto mexido também não
  assert.equal(decifrarEmail(lido.e, chaveDosLinks('outro-segredo') as Buffer), null);
  assert.equal(decifrarEmail(`${lido.e.slice(0, -4)}AAAA`, CHAVE), null);
  assert.equal(decifrarEmail('curto', CHAVE), null);
  // cada cifra sai diferente (vetor novo), e as duas voltam ao mesmo e-mail
  const outra = cifrarEmail(email, CHAVE);
  assert.notEqual(outra, cifrarEmail(email, CHAVE));
  assert.equal(decifrarEmail(outra, CHAVE), email);
  // o e-mail mais comprido que um endereço pode ter ainda cabe no link
  const comprido = `${'a'.repeat(64)}@${'b'.repeat(180)}.com`;
  assert.equal(decifrarEmail(lerLink(linkDeSair(CARRINHO, 'es-ar', CHAVE, comprido), 'sair', CHAVE)?.e ?? '', CHAVE), comprido);
});

test('o link "voltar ao carrinho" nunca entrega o código do carrinho que recebeu o e-mail: abre uma cópia só com os itens', async () => {
  const ORIGINAL = 'codigo-do-cookie-do-cliente-original';
  type Item = { id: string };
  const itens: Item[] = [{ id: 'a' }, { id: 'b' }];
  const falso = (mudar: Partial<{ pedidoId: string | null; itens: Item[]; copiaComPedido: boolean; existe: boolean }> = {}) => {
    const chamadas = { copias: [] as { itens: Item[]; origem: string }[], voltas: [] as string[] };
    const deps: DependenciasDaVolta<Item> = {
      carrinho: async () =>
        mudar.existe === false ? null : { token: ORIGINAL, itens: mudar.itens ?? itens, pedidoId: mudar.pedidoId ?? null },
      copiaVirouPedido: async () => mudar.copiaComPedido ?? false,
      criarCopia: async (copiados, origem) => {
        chamadas.copias.push({ itens: copiados, origem });
        return `copia-${chamadas.copias.length}-com-codigo-novo`;
      },
      registrarVolta: async (id) => {
        chamadas.voltas.push(id);
      },
    };
    return { deps, chamadas };
  };

  // o caso de sempre: um carrinho NOVO, com os mesmos itens e ligado ao de origem; o cookie nunca é o do original
  const um = falso();
  const volta = await voltarAoCarrinho(CARRINHO, um.deps);
  assert.equal(volta.destino, 'checkout');
  assert.ok(volta.destino === 'checkout' && volta.cookie && volta.cookie !== ORIGINAL, 'o cookie é o da cópia');
  assert.deepEqual(um.chamadas.copias, [{ itens, origem: CARRINHO }]);
  assert.deepEqual(um.chamadas.voltas, [CARRINHO], 'a volta fica anotada no carrinho de origem');
  // o mesmo link de novo (encaminhado, ou aberto pelo filtro de spam): outra cópia, outro código, nunca o original
  const deNovo = await voltarAoCarrinho(CARRINHO, um.deps);
  assert.ok(deNovo.destino === 'checkout' && deNovo.cookie && deNovo.cookie !== ORIGINAL && deNovo.cookie !== volta.cookie);

  // o carrinho que já virou pedido (em qualquer status) e o cuja cópia virou pedido: "Consultar meu pedido", sem cookie
  for (const caso of [falso({ pedidoId: 'ON-7K3P9Q' }), falso({ copiaComPedido: true })]) {
    assert.deepEqual(await voltarAoCarrinho(CARRINHO, caso.deps), { destino: 'consultar' });
    assert.deepEqual(caso.chamadas.copias, []);
  }
  // vazio ou sumido: o checkout, sem cookie
  for (const caso of [falso({ itens: [] }), falso({ existe: false })]) {
    assert.deepEqual(await voltarAoCarrinho(CARRINHO, caso.deps), { destino: 'checkout' });
    assert.deepEqual(caso.chamadas.copias, []);
  }
  // se a cópia saísse com o código do original, a volta falha (a rota leva ao checkout sem cookie)
  const errado = falso();
  errado.deps.criarCopia = async () => ORIGINAL;
  await assert.rejects(voltarAoCarrinho(CARRINHO, errado.deps));
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

test('estatísticas: a cópia aberta pela volta conta como o carrinho que recebeu o e-mail (o pedido feito nela é dele)', () => {
  const NOV = { de: '2026-11-01', ate: '2026-11-30' };
  const lista: CarrinhoComCopia[] = [
    // recebeu o lembrete, o cliente voltou pelo link e pagou na cópia
    {
      id: 'origem',
      criadoEm: '2026-11-05T12:00:00Z',
      fezPedido: false,
      pagou: false,
      lembrete1Em: '2026-11-05T13:10:00Z',
      voltouEm: '2026-11-05T15:00:00Z',
    },
    {
      id: 'copia',
      veioDe: 'origem',
      criadoEm: '2026-11-05T15:00:00Z',
      checkoutEm: '2026-11-05T15:01:00Z',
      fezPedido: true,
      pedidoEm: '2026-11-05T15:05:00Z',
      pagou: true,
    },
    // a cópia de um carrinho que não está na lista continua um carrinho comum
    { id: 'orfa', veioDe: 'fora-da-lista', criadoEm: '2026-11-06T10:00:00Z', fezPedido: false, pagou: false },
    // um carrinho sem lembrete nenhum
    { id: 'comum', criadoEm: '2026-11-07T10:00:00Z', fezPedido: true, pedidoEm: '2026-11-07T10:30:00Z', pagou: false },
  ];
  const juntos = juntarCopias(lista);
  assert.equal(juntos.length, 3, 'a cópia não entra como um carrinho a mais');
  assert.deepEqual(juntos[0], {
    criadoEm: '2026-11-05T12:00:00Z',
    checkoutEm: '2026-11-05T15:01:00Z',
    fezPedido: true,
    pedidoEm: '2026-11-05T15:05:00Z',
    pagou: true,
    lembrete1Em: '2026-11-05T13:10:00Z',
    voltouEm: '2026-11-05T15:00:00Z',
  });
  assert.ok(juntos.every((c) => !('id' in c) && !('veioDe' in c)));
  // os lembretes: 1 carrinho lembrado, que voltou, fez o pedido depois da volta e pagou
  assert.deepEqual(lembretesDe(juntos, NOV), { carrinhos: 1, enviados: 1, voltaram: 1, pedidos: 1, pagos: 1 });
  // sem cópia, nada muda
  const sem = juntarCopias([{ id: 'x', criadoEm: '2026-11-05T12:00:00Z', fezPedido: false, pagou: false }]);
  assert.deepEqual(sem, [{ criadoEm: '2026-11-05T12:00:00Z', fezPedido: false, pagou: false }]);
});
