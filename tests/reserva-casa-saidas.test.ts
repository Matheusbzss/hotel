import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CANCELAMENTO_DAS_CASAS, REGRAS_DAS_CASAS } from '../src/data/regras-casas.ts';
import { dicionario } from '../src/i18n/index.ts';
import { IDIOMAS, LOCALE_INTL, type Idioma } from '../src/i18n/config.ts';
import { texto } from '../src/i18n/conteudo.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { arquivoDoGoogle, eventoDeCompra } from '../src/lib/conversoes.ts';
import {
  emailAvisoDoPagamentoRetido,
  emailAvisoDoPedidoPago,
  emailPagamentoAprovado,
  emailPedidoRecebido,
  emailPixVencido,
  type DadosDoPedido,
  type MensagemEmail,
} from '../src/lib/email/mensagens.ts';
import { textosEmail } from '../src/lib/email/textos.ts';
import { calcularEstatisticas } from '../src/lib/estatisticas.ts';
import { valorACobrar, valorDoItem } from '../src/lib/formas-pagamento.ts';
import {
  ERROS_DO_PAINEL,
  RETIDO_COM_CASA,
  aCobrarHojeNoPainel,
  agruparPedidos,
  linhasDaCasaNoPainel,
  recebidoDoPedido,
  reembolsoNoPainel,
  retidoComCasa,
  valorRecebido,
} from '../src/lib/pedidos-painel.ts';
import { cartaoEmDestaque } from '../src/lib/preco-destaque.ts';
import { opcoesDoReembolso } from '../src/lib/resumo-do-painel.ts';
import type { Reserva, ReservaCasa, ReservaPasseio } from '../src/lib/reservas.ts';
import {
  ESTADO_DA_RESERVA_QUE_SEGURA,
  avisoDasDatasNaoPresas,
  avisosDasDatasNaoPresas,
  linhaDaReservaQueSegura,
  reservasQueImpedemOBloqueio,
  type ReservaQueSegura,
} from '../src/lib/trava-das-casas.ts';
import {
  chegadaDasCasas,
  chegadaESaida,
  conteudoDoVoucherDaCasa,
  formaDaCasa,
  noitesDaEstadia,
  textoDasDiarias,
  textoDosHospedes,
  valoresDaCasa,
} from '../src/lib/voucher-casa.ts';

// A reserva completa das casas (Etapa 7, pacote 1, parte 2: as SAÍDAS do pedido de casa): o voucher em PDF, as páginas do
// pedido e da reserva, os e-mails, o painel (o bloco da casa, o "a cobrar hoje", os reembolsos nunca acima do sinal pago e o
// "Reativar" escondido), as conversões e as estatísticas, os lembretes, o preço em destaque e o bloqueio à mão que não passa
// por cima de uma reserva do site. As regras rodam aqui em node, sem banco e sem Next; as telas, a rota e o PDF (que usam o
// atalho "@/") são conferidos pela leitura do código, no fim. Só leitura: nada é gravado, os pedidos são fictícios.

delete process.env.SUPABASE_URL;

const cifra = (centavos: number, idioma: Idioma = 'pt') => formatarCifra(centavos, LOCALE_INTL[idioma]);
const PAGO_EM = '2026-11-26T15:05:00.000Z';

/**
 * A casa paga no Pix: 2 diárias de semana na Ferradura, de segunda 14/12 a quarta 16/12 (R$ 2.000,00 no cartão e
 * R$ 1.800,00 no Pix), com o sinal de R$ 900,00 no Pix (R$ 1.000,00 no cartão) guardado na compra.
 */
const CASA: ReservaCasa = {
  codigo: 'ON-CASA01',
  token: 'token-de-teste',
  criadaEm: '2026-11-26T15:00:00.000Z',
  atualizadaEm: PAGO_EM,
  idioma: 'pt',
  status: 'pago',
  provedor: 'stripe',
  paymentIntentId: 'pi_da_casa',
  pagamentoExternoId: 'cs_test_da_casa',
  data: '2026-12-14',
  totalCentavos: 200000,
  totalPixCentavos: 180000,
  cliente: { nome: 'Teste da Silva', email: 'teste@exemplo.com', telefone: '+54 911 0000-0000' },
  pagamento: { metodo: 'pix', pagoEm: PAGO_EM, cobrar: { cartao: 100000, pix: 90000 } },
  historico: [
    { em: '2026-11-26T15:00:00.000Z', evento: 'Reserva criada' },
    { em: PAGO_EM, evento: 'Pago (webhook da Stripe)' },
  ],
  tipo: 'casa',
  casa: {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'mansao-ferradura-vista-mar',
    nome: 'Mansão Ferradura Vista Mar',
    cidade: 'buzios',
  },
  saida: '2026-12-16',
  hospedes: 10,
  sinalCentavos: 100000,
  sinalPixCentavos: 90000,
  linhas: [{ tipo: 'semana', noites: 2, diariaCentavos: 100000 }],
};

/** Um passeio pago pela Stripe (R$ 154,00 no cartão, R$ 138,60 no Pix), para os pedidos com casa e passeio. */
const PASSEIO: ReservaPasseio = {
  codigo: 'ON-PAS001',
  token: 'token-de-teste',
  criadaEm: '2026-11-26T15:00:00.000Z',
  atualizadaEm: PAGO_EM,
  idioma: 'pt',
  status: 'pago',
  provedor: 'stripe',
  paymentIntentId: 'pi_da_casa',
  tipo: 'passeio',
  data: '2026-12-15',
  horario: { hora: '09:00', busca: false },
  totalCentavos: 15400,
  totalPixCentavos: 13860,
  cliente: CASA.cliente,
  pagamento: CASA.pagamento,
  historico: CASA.historico,
  passeio: { slug: 'escuna-buzios', nome: 'Escuna em Búzios', cidade: 'buzios', unidade: 'pessoa' },
  adultos: 2,
  criancas: 0,
  unidades: 2,
  hospedagem: { cidade: 'buzios', hotel: 'Pousada de teste' },
};

/** A casa e o passeio no mesmo pedido, pagos no cartão: um pagamento só, de R$ 1.000,00 (o sinal) + R$ 154,00. */
function casaComPasseio(mudar: { casa?: Partial<ReservaCasa>; passeio?: Partial<ReservaPasseio> } = {}): Reserva[] {
  const pedido = { codigo: 'ON-PEDCAS', totalCentavos: 215400, totalPixCentavos: 193860 };
  const pagamento: ReservaCasa['pagamento'] = { metodo: 'cartao', pagoEm: PAGO_EM, cobrar: { cartao: 115400, pix: 103860 } };
  return [
    { ...CASA, pedido, pagamento, ...mudar.casa },
    { ...PASSEIO, pedido, pagamento, ...mudar.passeio },
  ];
}

/* ------------------------------------------------------------------ */
/* O voucher da casa (src/lib/voucher-casa.ts; o PDF desenha)          */

test('o voucher da casa: a casa, a chegada a partir das 15h, a saída até as 12h, as diárias e os hóspedes, nos quatro idiomas', () => {
  const horas: Record<Idioma, [RegExp, RegExp]> = {
    pt: [/, a partir das 15h$/, /, até as 12h$/],
    es: [/, desde las 15\sh$/, /, hasta las 12\sh$/],
    'es-ar': [/, desde las 15\sh$/, /, hasta las 12\sh$/],
    en: [/, from 3pm$/, /, by 12pm$/],
  };
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    const c = conteudoDoVoucherDaCasa({ ...CASA, idioma }, d);
    assert.deepEqual(
      c.campos.map(([rotulo]) => rotulo),
      [
        d.reserva.casa,
        d.casas.chegada,
        d.casas.saida,
        d.casas.diarias,
        d.casas.hospedes,
        d.reserva.nome,
        d.casas.sinalPago,
        d.casas.naChegada,
        d.casas.totalDaEstadia,
      ],
      idioma,
    );
    const valor = (rotulo: string) => c.campos.find(([r]) => r === rotulo)?.[1].join(' ') ?? '';
    assert.equal(valor(d.reserva.casa), 'Mansão Ferradura Vista Mar');
    assert.match(valor(d.casas.chegada), horas[idioma][0], idioma);
    assert.match(valor(d.casas.saida), horas[idioma][1], idioma);
    assert.equal(valor(d.casas.diarias), textoDasDiarias(2, d.casas));
    assert.equal(valor(d.casas.hospedes), textoDosHospedes(10, d.casas));
    // nenhum marcador sobrando, em nada do voucher
    for (const parte of [...c.campos.flatMap(([r, v]) => [r, ...v]), c.mensagem, ...c.avisos])
      assert.doesNotMatch(parte, /\{\w+\}/, `${idioma}: ${parte}`);
  }
  // em português, por extenso
  const pt = conteudoDoVoucherDaCasa(CASA, dicionario('pt'));
  assert.deepEqual(pt.campos.slice(1, 5), [
    ['Chegada', ['seg., 14 de dez. de 2026, a partir das 15h']],
    ['Saída', ['qua., 16 de dez. de 2026, até as 12h']],
    ['Diárias', ['2 diárias']],
    ['Hóspedes', ['10 hóspedes']],
  ]);
  // a mensagem do botão do WhatsApp: o voucher, a casa, as datas e os hóspedes
  assert.equal(
    pt.mensagem,
    'Olá! Minha reserva está confirmada. Voucher ON-CASA01 — Mansão Ferradura Vista Mar, de seg 14/12 a qua 16/12, 10 hóspedes.',
  );
  assert.equal(
    conteudoDoVoucherDaCasa({ ...CASA, idioma: 'en' }, dicionario('en')).mensagem,
    'Hi! My booking is confirmed. Voucher ON-CASA01 — Mansão Ferradura Vista Mar, from Mon, Dec 14 to Wed, Dec 16, 10 guests.',
  );
  // a chegada e a saída que as páginas usam são as mesmas do voucher
  assert.deepEqual(chegadaESaida(CASA, 'pt', dicionario('pt').casas), {
    entrada: 'seg., 14 de dez. de 2026, a partir das 15h',
    saida: 'qua., 16 de dez. de 2026, até as 12h',
  });
});

test('o voucher da casa pago mostra só os valores da forma paga: no Pix, os do Pix; no cartão, os do cartão (furo 20)', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    const noPix = conteudoDoVoucherDaCasa({ ...CASA, idioma }, d);
    const tudoNoPix = JSON.stringify(noPix);
    assert.deepEqual(noPix.campos.slice(6), [
      [d.casas.sinalPago, [cifra(90000, idioma)]],
      [d.casas.naChegada, [`${cifra(90000, idioma)}, ${d.casas.formasNaChegada}`]],
      [d.casas.totalDaEstadia, [cifra(180000, idioma)]],
    ]);
    // nada do cartão: quem pagou o sinal no Pix paga o restante do Pix na chegada
    for (const doCartao of [cifra(100000, idioma), cifra(200000, idioma)])
      assert.ok(!tudoNoPix.includes(doCartao), `${idioma}: ${doCartao}`);

    const noCartao = conteudoDoVoucherDaCasa({ ...CASA, idioma, pagamento: { ...CASA.pagamento, metodo: 'cartao' } }, d);
    const tudoNoCartao = JSON.stringify(noCartao);
    assert.deepEqual(noCartao.campos.slice(6), [
      [d.casas.sinalPago, [cifra(100000, idioma)]],
      [d.casas.naChegada, [`${cifra(100000, idioma)}, ${d.casas.formasNaChegada}`]],
      [d.casas.totalDaEstadia, [cifra(200000, idioma)]],
    ]);
    for (const doPix of [cifra(90000, idioma), cifra(180000, idioma)]) assert.ok(!tudoNoCartao.includes(doPix), `${idioma}: ${doPix}`);
  }
});

test('o voucher da casa não tem endereço: os avisos são a entrada e a saída, a localização pelo WhatsApp, a recepção, o cadastro, o restante na chegada e o cancelamento das casas', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    const c = conteudoDoVoucherDaCasa({ ...CASA, idioma }, d);
    assert.deepEqual(c.avisos, [
      texto(REGRAS_DAS_CASAS.entradaSaida, idioma),
      d.reserva.casaLocalizacao,
      texto(REGRAS_DAS_CASAS.recepcao, idioma),
      texto(REGRAS_DAS_CASAS.cadastro, idioma),
      d.reserva.casaProximo3.replace('{valor}', cifra(90000, idioma)),
      ...CANCELAMENTO_DAS_CASAS.map((regra) => texto(regra, idioma)),
    ]);
    // nada dos passeios (o cancelamento de 24 horas, o ponto de encontro) e nenhum endereço
    const tudo = JSON.stringify(c);
    assert.doesNotMatch(tudo, /24\s?h|24 horas|24 hours|encontro|meeting point|Rua |Avenida |Estrada /i, idioma);
  }
});

test('os valores guardados na compra: o total e o sinal de cada forma, e o restante da chegada das casas que ainda valem', () => {
  assert.deepEqual(valoresDaCasa(CASA, 'pix'), { totalCentavos: 180000, sinalCentavos: 90000, chegadaCentavos: 90000 });
  assert.deepEqual(valoresDaCasa(CASA, 'cartao'), { totalCentavos: 200000, sinalCentavos: 100000, chegadaCentavos: 100000 });
  // o sinal guardado vale, mesmo que a regra do sinal mude um dia: nada é refeito depois da compra
  assert.deepEqual(valoresDaCasa({ ...CASA, sinalPixCentavos: 85000 }, 'pix'), {
    totalCentavos: 180000,
    sinalCentavos: 85000,
    chegadaCentavos: 95000,
  });
  assert.equal(valorRecebido({ ...CASA, sinalPixCentavos: 85000 }), 85000);
  // a reserva sem o total no Pix: o Pix usa o total de sempre
  assert.equal(valoresDaCasa({ ...CASA, totalPixCentavos: undefined }, 'pix').totalCentavos, 200000);
  assert.equal(formaDaCasa(CASA), 'pix');
  assert.equal(formaDaCasa({ ...CASA, pagamento: { metodo: 'cartao' } }), 'cartao');
  // as diárias pelas datas guardadas; uma diária e um hóspede no singular
  assert.equal(noitesDaEstadia(CASA), 2);
  assert.equal(noitesDaEstadia({ data: '2026-12-28', saida: '2027-01-02' }), 5);
  assert.equal(textoDasDiarias(1, dicionario('pt').casas), '1 diária');
  assert.equal(textoDosHospedes(1, dicionario('pt').casas), '1 hóspede');
  assert.equal(textoDosHospedes(12, dicionario('es-ar').casas), '12 huéspedes');
  // o restante da chegada do pedido: a soma das casas que ainda valem (o passeio não tem chegada)
  const [casa, passeio] = casaComPasseio();
  assert.equal(chegadaDasCasas([casa, passeio], 'cartao'), 100000);
  assert.equal(chegadaDasCasas([casa, passeio], 'pix'), 90000);
  assert.equal(chegadaDasCasas([{ ...casa, statusItem: 'cancelado' }, passeio], 'cartao'), 0);
  assert.equal(chegadaDasCasas([{ ...casa, statusItem: 'reembolsado' }], 'pix'), 0);
  assert.equal(chegadaDasCasas([casa, { ...casa, codigo: 'ON-CASA02' }], 'pix'), 180000);
  assert.equal(chegadaDasCasas([passeio], 'pix'), 0);
});

/* ------------------------------------------------------------------ */
/* O painel                                                            */

test('o painel: a casa em aberto diz o que se cobra hoje (o sinal); paga, o sinal pago, o restante e o total, só da forma paga', () => {
  const comuns = ['Entrada seg., 14 de dez. de 2026 às 15h · saída qua., 16 de dez. de 2026 às 12h', '2 diárias · 10 hóspedes'];
  assert.deepEqual(linhasDaCasaNoPainel({ ...CASA, status: 'pendente' }, 'pendente'), [
    ...comuns,
    `A cobrar hoje (o sinal): ${cifra(90000)} no Pix ou ${cifra(100000)} no cartão`,
    `Total da estadia: ${cifra(180000)} no Pix ou ${cifra(200000)} no cartão; o restante é pago na chegada`,
  ]);
  // o vencido também está em aberto
  assert.match(linhasDaCasaNoPainel({ ...CASA, status: 'expirado' }, 'expirado').join('\n'), /^A cobrar hoje \(o sinal\)/m);
  // paga no Pix: os números do Pix e o que mandar pelo WhatsApp; nenhum número do cartão
  const noPix = linhasDaCasaNoPainel(CASA, 'pago');
  assert.deepEqual(noPix, [
    ...comuns,
    `Sinal pago no Pix: ${cifra(90000)} · restante na chegada: ${cifra(90000)} · total da estadia: ${cifra(180000)}`,
    'Mandar ao cliente pelo WhatsApp a localização exata da casa e pedir o cadastro de todos os hóspedes',
  ]);
  assert.ok(!noPix.join(' ').includes(cifra(100000)));
  // paga no cartão
  assert.equal(
    linhasDaCasaNoPainel({ ...CASA, pagamento: { ...CASA.pagamento, metodo: 'cartao' } }, 'pago')[2],
    `Sinal pago no cartão: ${cifra(100000)} · restante na chegada: ${cifra(100000)} · total da estadia: ${cifra(200000)}`,
  );
  // o voucher devolvido sozinho, num pedido que continua pago: sem o "mandar pelo WhatsApp"
  assert.equal(linhasDaCasaNoPainel({ ...CASA, statusItem: 'reembolsado' }, 'pago').length, 3);
  // o pedido que nunca foi pago (cancelado antes): só o total
  const nunca = {
    ...CASA,
    status: 'cancelado' as const,
    pagamento: { metodo: 'pix' as const },
    historico: [{ em: PAGO_EM, evento: 'Cancelado no admin' }],
  };
  assert.deepEqual(linhasDaCasaNoPainel(nunca, 'cancelado'), [
    ...comuns,
    `Total da estadia: ${cifra(180000)} no Pix ou ${cifra(200000)} no cartão`,
  ]);
  // uma diária e um hóspede
  assert.equal(linhasDaCasaNoPainel({ ...CASA, saida: '2026-12-15', hospedes: 1 }, 'pago')[1], '1 diária · 1 hóspede');
});

test('o painel em aberto: "a cobrar hoje" é o sinal da casa mais o resto do pedido; no pedido sem casa, nada muda', () => {
  const [sozinha] = agruparPedidos([{ ...CASA, status: 'pendente' }]);
  assert.deepEqual(aCobrarHojeNoPainel(sozinha), { cartao: 100000, pix: 90000 });
  const [junto] = agruparPedidos(casaComPasseio({ casa: { status: 'pendente' }, passeio: { status: 'pendente' } }));
  assert.deepEqual(aCobrarHojeNoPainel(junto), { cartao: 115400, pix: 103860 });
  // sem o `cobrar` gravado (uma leitura antiga), a soma do que cada voucher cobra, com o sinal GUARDADO da casa
  const semCobrar = casaComPasseio({ casa: { sinalPixCentavos: 85000 } }).map((v) => ({ ...v, pagamento: { metodo: 'pix' as const } }));
  assert.deepEqual(aCobrarHojeNoPainel({ itens: semCobrar }), { cartao: 100000 + 15400, pix: 85000 + 13860 });
  // o pedido sem casa não tem "a cobrar hoje": o painel mostra os totais de sempre
  const [soPasseio] = agruparPedidos([{ ...PASSEIO, status: 'pendente', pagamento: { metodo: 'pix' } }]);
  assert.equal(aCobrarHojeNoPainel(soPasseio), undefined);
  assert.equal(soPasseio.totalCentavos, 15400);
  assert.equal(soPasseio.totalPixCentavos, 13860);
});

test('o reembolso nunca passa do sinal pago: "Reembolsar tudo" da casa é o sinal; "só o voucher" da casa é o sinal; com o passeio, cabe no que resta', () => {
  // a casa sozinha, paga no Pix: o que entrou e o que dá para devolver é o sinal no Pix, R$ 900,00 (nunca a estadia)
  const [sozinha] = agruparPedidos([CASA]);
  assert.equal(sozinha.recebidoCentavos, 90000);
  assert.deepEqual(reembolsoNoPainel(sozinha), { tipo: 'stripe', restanteCentavos: 90000, vouchers: [], semVoucher: [] });
  assert.deepEqual(
    opcoesDoReembolso(sozinha).map((o) => [o.rotulo, o.centavos]),
    [[`Tudo (${cifra(90000)})`, 90000]],
  );
  // a casa e o passeio, pagos no cartão: R$ 1.000,00 (o sinal) + R$ 154,00
  const [junto] = agruparPedidos(casaComPasseio());
  assert.equal(recebidoDoPedido(junto.itens), 115400);
  assert.deepEqual(
    opcoesDoReembolso(junto).map((o) => [o.rotulo, o.centavos]),
    [
      [`Tudo (${cifra(115400)})`, 115400],
      [`Só o voucher ON-CASA01 (${cifra(100000)})`, 100000],
      [`Só o voucher ON-PAS001 (${cifra(15400)})`, 15400],
    ],
  );
  // o passeio já devolvido sozinho: o que resta é o sinal, e o voucher da casa cabe inteiro nele
  const [depois] = agruparPedidos(
    casaComPasseio({ passeio: { statusItem: 'reembolsado' } }).map((v) => ({ ...v, reembolsoCentavos: 15400 })),
  );
  assert.deepEqual(
    opcoesDoReembolso(depois).map((o) => [o.rotulo, o.centavos]),
    [
      [`Tudo (${cifra(100000)})`, 100000],
      [`Só o voucher ON-CASA01 (${cifra(100000)})`, 100000],
    ],
  );
  // o valor de um voucher de casa é o sinal guardado na forma paga, nunca o total da estadia
  for (const opcao of [...opcoesDoReembolso(sozinha), ...opcoesDoReembolso(junto)]) assert.ok(opcao.centavos <= 115400);
});

test('o pedido com casa e o pagamento parado: desde o pacote 2, o "Reativar" prende as datas de novo ou recusa com o motivo', () => {
  assert.equal(retidoComCasa([CASA]), true);
  assert.equal(retidoComCasa(casaComPasseio()), true);
  assert.equal(retidoComCasa([PASSEIO]), false);
  assert.match(
    ERROS_DO_PAINEL['reativar-datas-ocupadas'],
    /já foram reservadas por outra pessoa.*Devolva o pagamento ao cliente\. Nada foi feito\.$/,
  );
  assert.match(ERROS_DO_PAINEL['datas-sem-conferir'], /Nada foi feito\. Tente de novo em instantes\.$/);
  assert.match(RETIDO_COM_CASA, /reativar prende as datas da casa de novo/);
  // o e-mail à equipe do pagamento parado: no pedido com casa, as duas escolhas, e o que acontece com as datas
  const site = {
    url: 'https://orlanativa.online',
    logo: 'https://orlanativa.online/logo.png',
    nome: 'Orla Nativa',
    dominio: 'orlanativa.online',
  };
  const comCasa = emailAvisoDoPagamentoRetido({
    codigo: 'ON-CASA01',
    valor: 'R$ 900,00',
    linkPainel: 'https://orlanativa.online/admin?q=ON-CASA01',
    site,
    comCasa: true,
  });
  assert.match(comCasa.texto, /Este pedido tem casa de temporada/);
  assert.match(comCasa.texto, /devolver o dinheiro ao cliente, ou reativar o pedido/);
  assert.match(comCasa.texto, /Reativar prende as datas da casa de novo; se outra pessoa já reservou alguma noite, o painel recusa/);
  const semCasa = emailAvisoDoPagamentoRetido({
    codigo: 'ON-PAS001',
    valor: 'R$ 154,00',
    linkPainel: 'https://orlanativa.online/admin?q=ON-PAS001',
    site,
  });
  assert.match(semCasa.texto, /reativar o pedido \(ele fica pago/);
});

/* ------------------------------------------------------------------ */
/* As conversões e as estatísticas                                     */

test('as conversões: a casa vai pelo slug e pelo valor COBRADO (o sinal), na Meta e no Google (decisão 5 do dono)', () => {
  const agora = new Date('2026-11-27T12:00:00.000Z');
  const [sozinha] = agruparPedidos([{ ...CASA, origem: { gclid: 'gclid-de-teste' } }]);
  const e = eventoDeCompra(sozinha, 'https://orlanativa.online', agora);
  assert.equal(e.custom_data.value, 900);
  assert.deepEqual(e.custom_data.content_ids, ['mansao-ferradura-vista-mar']);
  assert.equal(e.custom_data.num_items, 1);
  assert.match(arquivoDoGoogle([sozinha], agora), /^gclid-de-teste,Compra no site,2026-11-26T15:05:00\+0000,900\.00,BRL,ON-CASA01$/m);
  // a casa e o passeio: o sinal mais o passeio, os dois produtos
  const [junto] = agruparPedidos(casaComPasseio());
  const j = eventoDeCompra(junto, 'https://orlanativa.online', agora);
  assert.equal(j.custom_data.value, 1154);
  assert.deepEqual(j.custom_data.content_ids, ['mansao-ferradura-vista-mar', 'escuna-buzios']);
  // o passeio sozinho: o mesmo número de antes (o total no Pix)
  const [soPasseio] = agruparPedidos([{ ...PASSEIO, pagamento: { metodo: 'pix', pagoEm: PAGO_EM } }]);
  assert.equal(eventoDeCompra(soPasseio, 'https://orlanativa.online', agora).custom_data.value, 138.6);
});

test('as estatísticas: a casa entra no faturamento pelo que entrou (o sinal), no ranking pelo slug e na cidade', () => {
  const periodo = { chave: 'outro', periodo: { de: '2026-11-20', ate: '2026-11-30' } };
  const e = calcularEstatisticas([CASA], [], periodo);
  assert.equal(e.resumo.pedidos, 1);
  assert.equal(e.resumo.centavos, 90000);
  assert.deepEqual(
    e.porPasseio.map((f) => [f.chave, f.rotulo, f.centavos, f.quantidade]),
    [['mansao-ferradura-vista-mar', 'Mansão Ferradura Vista Mar', 90000, 1]],
  );
  assert.deepEqual(
    e.porCidade.map((f) => [f.chave, f.centavos]),
    [['buzios', 90000]],
  );
  // a casa nunca conta como venda da sugestão do carrinho
  assert.equal(e.sugestoes.itens, 0);
  // a casa com o passeio: um pedido, o que entrou fecha com os rankings
  const j = calcularEstatisticas(casaComPasseio(), [], periodo);
  assert.equal(j.resumo.pedidos, 1);
  assert.equal(j.resumo.centavos, 115400);
  assert.equal(
    j.porPasseio.reduce((s, f) => s + f.centavos, 0),
    115400,
  );
});

/* ------------------------------------------------------------------ */
/* Os e-mails (src/lib/email/mensagens.ts; quem busca e formata é pedidos.ts)   */

const SITE = {
  url: 'https://orlanativa.online',
  logo: 'https://orlanativa.online/logo/orla-nativa-emblema-512.png',
  nome: 'Orla Nativa',
  dominio: 'orlanativa.online',
};

const dadosDaCasa = (idioma: Idioma, pago = false): DadosDoPedido => {
  const d = dicionario(idioma);
  return {
    idioma,
    nome: 'Ana Souza',
    codigo: 'ON-CASA01',
    linkPedido: 'https://orlanativa.online/reserva/ON-CASA01?t=abc_DEF-123',
    itens: [
      {
        nome: 'Mansão Ferradura Vista Mar',
        linhas: ['2 diárias, de seg 14/12 a qua 16/12', d.casas.regraHorario, textoDosHospedes(10, d.casas)],
        ...(pago
          ? {
              voucher: {
                codigo: 'ON-CASA01',
                link: 'https://orlanativa.online/reserva/ON-CASA01?t=x',
                pdf: 'https://orlanativa.online/api/voucher/ON-CASA01?t=x',
              },
            }
          : {}),
      },
    ],
    site: SITE,
    comCasa: true,
  };
};

const valorEmail = (centavos: number, idioma: Idioma) => ({
  valor: cifra(centavos, idioma),
  ...(idioma === 'pt' ? {} : { dolar: '≈ US$ 165,00' }),
});

/** O e-mail inteiro está montado: assunto, HTML e texto, sem marcador sobrando e sem o "24 h" dos passeios. */
function semSobras(m: MensagemEmail, onde: string) {
  for (const parte of [m.assunto, m.html, m.texto]) {
    assert.ok(parte.length > 0, onde);
    assert.doesNotMatch(parte, /\{\w+\}/, `${onde}: marcador sobrando`);
    assert.doesNotMatch(parte, /24\s?h\b|24 horas|24 hours/, `${onde}: o prazo dos passeios`);
  }
}

test('os e-mails do pedido com casa, nos quatro idiomas: "A pagar agora", o que fica para a chegada e o parágrafo da casa', () => {
  for (const idioma of IDIOMAS) {
    const T = textosEmail(idioma);
    const sinal = valorEmail(90000, idioma);
    const sinalNoCartao = valorEmail(100000, idioma);

    // pedido recebido (sempre online): o que se paga agora na forma escolhida e o que fica para a chegada
    const recebido = emailPedidoRecebido({ ...dadosDaCasa(idioma), caminho: 'online', totais: { pix: sinal }, casa: { chegada: sinal } });
    semSobras(recebido, `${idioma} pedido recebido`);
    assert.ok(recebido.texto.includes(T.comum.aPagarNoPix), idioma);
    assert.ok(recebido.texto.includes(T.comum.naChegadaDaCasa), idioma);
    assert.ok(!recebido.texto.includes(T.comum.totalNoPix), idioma);

    // pagamento aprovado: o total pago (o sinal), o que fica para a chegada e o parágrafo do restante e do WhatsApp
    const aprovado = emailPagamentoAprovado({
      ...dadosDaCasa(idioma, true),
      total: sinal,
      forma: 'pix',
      anexos: true,
      whatsapp: 'https://wa.me/5521990502377?text=oi',
      casa: { chegada: sinal },
    });
    semSobras(aprovado, `${idioma} pagamento aprovado`);
    assert.ok(aprovado.texto.includes(T.pagamentoAprovado.casa), idioma);
    assert.ok(aprovado.texto.includes(`${T.comum.totalPago} (${T.comum.formaPix})`), idioma);
    assert.ok(aprovado.texto.includes(T.comum.naChegadaDaCasa), idioma);

    // Pix vencido: o que se paga agora nas formas que ainda valem, as datas livres de novo e a chegada de cada forma
    const vencido = emailPixVencido({
      ...dadosDaCasa(idioma),
      totais: { pix: sinal, cartao: sinalNoCartao },
      chegadas: { pix: sinal, cartao: sinalNoCartao },
    });
    semSobras(vencido, `${idioma} Pix vencido`);
    for (const trecho of [
      T.pixVencido.casa,
      T.comum.aPagarNoPix,
      T.comum.aPagarNoCartao,
      `${T.comum.naChegadaDaCasa} (${T.comum.formaPix})`,
      `${T.comum.naChegadaDaCasa} (${T.comum.formaCartao})`,
    ])
      assert.ok(vencido.texto.includes(trecho), `${idioma}: ${trecho}`);
    assert.ok(!vencido.texto.includes(T.comum.totalNoPix), idioma);
  }
  // o es-ar fala com "vos"; o es neutro, com "tú"; ninguém com "usted"
  assert.match(textosEmail('es-ar').pixVencido.casa, /pagá de nuevo/);
  assert.match(textosEmail('es').pixVencido.casa, /paga de nuevo/);
  for (const idioma of ['es', 'es-ar'] as const) {
    const T = textosEmail(idioma);
    for (const frase of [T.pixVencido.casa, T.pagamentoAprovado.casa, T.comum.aPagarNoPix, T.comum.naChegadaDaCasa])
      assert.doesNotMatch(frase, /\busted(es)?\b/i);
  }
});

test('os e-mails do pedido sem casa não mudam: "Total no Pix" e nada da chegada', () => {
  for (const idioma of IDIOMAS) {
    const T = textosEmail(idioma);
    const valor = valorEmail(27000, idioma);
    const semCasa = { ...dadosDaCasa(idioma), comCasa: undefined, itens: [{ nome: 'Passeio de Escuna em Búzios', linhas: ['2 adultos'] }] };
    const recebido = emailPedidoRecebido({ ...semCasa, caminho: 'online', totais: { pix: valor } });
    assert.ok(recebido.texto.includes(T.comum.totalNoPix), idioma);
    assert.ok(!recebido.texto.includes(T.comum.aPagarNoPix), idioma);
    assert.ok(!recebido.texto.includes(T.comum.naChegadaDaCasa), idioma);
    const vencido = emailPixVencido({ ...semCasa, totais: { pix: valor, cartao: valor } });
    assert.ok(vencido.texto.includes(T.comum.totalNoCartao), idioma);
    assert.ok(!vencido.texto.includes(T.pixVencido.casa), idioma);
    const aprovado = emailPagamentoAprovado({ ...semCasa, total: valor, forma: 'pix', anexos: false });
    assert.ok(!aprovado.texto.includes(T.pagamentoAprovado.casa), idioma);
  }
});

test('o aviso à equipe do pedido pago com casa: a localização e o cadastro pelo WhatsApp, o restante e, sem as datas presas, o aviso no assunto', () => {
  const base = {
    codigo: 'ON-CASA01',
    valor: 'R$ 900,00',
    forma: 'pix' as const,
    origem: 'stripe' as const,
    primeiroServico: 'seg., 14 de dez. de 2026 às 15h',
    itens: dadosDaCasa('pt').itens,
    linkPainel: 'https://orlanativa.online/admin?q=ON-CASA01',
    site: SITE,
  };
  const pago = emailAvisoDoPedidoPago({ ...base, casa: { chegada: 'R$ 900,00' } });
  semSobras(pago, 'aviso do pedido pago');
  assert.match(
    pago.texto,
    /Casa de temporada: mande ao cliente pelo WhatsApp a localização exata da casa e peça o cadastro de todos os hóspedes/,
  );
  assert.match(pago.texto, /O restante, R\$ 900,00, é pago na chegada, em Pix, dinheiro ou cartão\./);
  assert.equal(pago.assunto, 'Pedido pago: ON-CASA01 (R$ 900,00)');
  // as datas que o aviso da Stripe não conseguiu prender: as linhas "Aviso:" do histórico, sem repetir e sem as outras
  const historico = [
    { em: PAGO_EM, evento: 'Pago (webhook da Stripe)' },
    { em: PAGO_EM, evento: avisoDasDatasNaoPresas(CASA) },
    { em: PAGO_EM, evento: 'Aviso: a Stripe recebeu R$ 1,00 e o pedido esperava R$ 2,00: conferir na Stripe' },
    { em: PAGO_EM, evento: avisoDasDatasNaoPresas(CASA) },
  ];
  const datasNaoPresas = avisosDasDatasNaoPresas(historico);
  assert.equal(datasNaoPresas.length, 1);
  assert.match(
    datasNaoPresas[0],
    /^as datas da casa Mansão Ferradura Vista Mar \(entrada 14\/12\/2026, saída 16\/12\/2026, voucher ON-CASA01\)/,
  );
  const semDatas = emailAvisoDoPedidoPago({ ...base, casa: { chegada: 'R$ 900,00', datasNaoPresas } });
  assert.equal(semDatas.assunto, 'Pedido pago: ON-CASA01 (R$ 900,00) · datas da casa não presas');
  assert.match(semDatas.texto, /Atenção: as datas da casa Mansão Ferradura Vista Mar .*antes de confirmar com o cliente\./);
  // o pedido sem casa: como antes, sem nenhuma linha da casa
  const semCasa = emailAvisoDoPedidoPago(base);
  assert.doesNotMatch(semCasa.texto, /Casa de temporada/);
  assert.equal(avisosDasDatasNaoPresas([{ em: PAGO_EM, evento: 'Pago (webhook da Stripe)' }]).length, 0);
});

/* ------------------------------------------------------------------ */
/* O bloqueio à mão do painel por cima de uma reserva do site (furo 6)  */

test('o bloqueio à mão: a reserva do site paga ou esperando o pagamento impede; a vencida, a cancelada e a devolvida, não', () => {
  const reserva = (status: ReservaQueSegura['status'], statusItem?: ReservaQueSegura['statusItem']): ReservaQueSegura => ({
    voucher: 'ON-CASA01',
    pedido: 'ON-PEDCAS',
    status,
    ...(statusItem ? { statusItem } : {}),
    inicio: '2026-12-14',
    fim: '2026-12-16',
  });
  const impedem = (lista: ReservaQueSegura[]) => reservasQueImpedemOBloqueio(lista).map((r) => r.status);
  assert.deepEqual(impedem([reserva('pago'), reserva('contestado'), reserva('pendente')]), ['pago', 'contestado', 'pendente']);
  // a trava que sobrou de um pedido que não vale mais (um aviso da Stripe que se perdeu) não é reserva de ninguém
  assert.deepEqual(impedem([reserva('expirado'), reserva('cancelado'), reserva('reembolsado')]), []);
  // o voucher da casa devolvido ou cancelado sozinho, num pedido que continua pago
  assert.deepEqual(impedem([reserva('pago', 'reembolsado'), reserva('pago', 'cancelado')]), []);
  assert.deepEqual(impedem([reserva('pago', 'ativo')]), ['pago']);
  // a linha de cada reserva na recusa, só para a equipe
  assert.equal(linhaDaReservaQueSegura(reserva('pago')), 'ON-CASA01 (pedido ON-PEDCAS), de 14/12/2026 a 16/12/2026: paga');
  assert.equal(
    linhaDaReservaQueSegura({ ...reserva('pendente'), pedido: 'ON-CASA01' }),
    'ON-CASA01, de 14/12/2026 a 16/12/2026: esperando o pagamento',
  );
  assert.equal(ESTADO_DA_RESERVA_QUE_SEGURA.contestado, 'paga, com contestação aberta no banco');
});

/* ------------------------------------------------------------------ */
/* O que só dá para ver no código (as telas, a rota e o PDF usam o "@/") */

/** O código de um arquivo, sem as linhas de comentário. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join(...partes), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
    .join('\n');

/** Sem espaços nem vírgulas finais: o mesmo trecho, quebrado ou não em várias linhas pelo formatador, compara igual. */
const semEspaco = (s: string) => s.replace(/\s+/g, '').replace(/,([)\]}])/g, '$1');
const tem = (fonte: string, trecho: string) => assert.ok(semEspaco(fonte).includes(semEspaco(trecho)), trecho);
const onde = (fonte: string, trecho: string) => semEspaco(fonte).indexOf(semEspaco(trecho));

test('o bloqueio à mão confere as reservas do site antes E depois de gravar e, sem conseguir conferir, nada fica bloqueado', () => {
  const rota = codigo('src', 'app', 'api', 'admin', 'casas', '[id]', 'acoes', 'route.ts');
  const bloqueio = rota.slice(rota.indexOf('async novo_bloqueio('), rota.indexOf('async apagar_bloqueio('));
  tem(bloqueio, 'return reservasQueImpedemOBloqueio(await reservasDoSiteNasDatas(casa.id, r.data.inicio, r.data.fim));');
  tem(bloqueio, "const recusa = { aviso: 'bloqueio-cruza-reserva', parametros: { inicio: r.data.inicio, fim: r.data.fim } };");
  // antes de gravar: sem conseguir conferir, nada é gravado; com reserva no caminho, a recusa, sem gravar
  const antes = onde(bloqueio, 'const antes = await reservasQueImpedem();');
  const semConferir = onde(bloqueio, "if (!antes) return 'bloqueio-sem-conferir';");
  const recusa = onde(bloqueio, 'if (antes.length) return recusa;');
  const grava = onde(bloqueio, 'const id = await criarBloqueio(casa.id, r.data);');
  // depois de gravar (revisão de 26/11, achado 4: a corrida com o "Pagar" de um cliente no mesmo instante): com reserva no
  // caminho, ou sem conseguir conferir, o bloqueio que acabou de ser gravado sai
  const depois = onde(bloqueio, 'const depois = await reservasQueImpedem();');
  const apaga = onde(bloqueio, 'if (!depois || depois.length) { await apagarBloqueio(casa.id, id);');
  const volta = onde(bloqueio, "return depois ? recusa : 'bloqueio-sem-conferir';");
  const salvo = onde(bloqueio, "return 'bloqueio-salvo';");
  const ordem = [antes, semConferir, recusa, grava, depois, apaga, volta, salvo];
  assert.ok(
    ordem.every((p, i) => p > 0 && (i === 0 || ordem[i - 1] < p)),
    ordem.join(' '),
  );
  // o bloqueio gravado volta com o id, para sair se a conferência de depois achar reserva
  tem(
    codigo('src', 'lib', 'casas.ts'),
    'export async function criarBloqueio(casaId: string, b: { inicio: string; fim: string; referencia: string }): Promise<string> {',
  );
  // a página da casa no painel: os dois avisos e a lista das reservas no caminho, cada uma com o link do pedido
  const pagina = codigo('src', 'app', 'admin', 'casas', '[id]', 'page.tsx');
  tem(pagina, "'bloqueio-cruza-reserva': {");
  tem(pagina, "'bloqueio-sem-conferir': {");
  tem(pagina, "const reservasNoCaminho = chave === 'bloqueio-cruza-reserva' ? await reservasQueImpediram(casa.id, q.inicio, q.fim) : [];");
  tem(pagina, '<a href={`/admin?q=${encodeURIComponent(r.pedido)}`}');
  // a leitura das reservas: as do site que cruzam as noites, sem cache (a noite da saída fica livre)
  const casas = codigo('src', 'lib', 'casas.ts');
  tem(casas, ".eq('casa_id', casaId).eq('origem', 'site').lt('inicio', fim).gt('fim', inicio);");
});

test('o painel: o bloco da casa, o "a cobrar hoje" no pedido em aberto, o valor do voucher com o sinal guardado e o "Reativar" que prende as datas', () => {
  const pagina = codigo('src', 'app', 'admin', 'page.tsx');
  tem(pagina, '{linhasDaCasaNoPainel(r, status).map((linha) => (');
  tem(pagina, '<DetalhesCasa r={i} status={p.status} />');
  tem(pagina, 'const cobrar = aCobrarHojeNoPainel(p);');
  tem(pagina, "{cobrar ? 'a cobrar hoje no Pix' : 'no Pix'}");
  // pacote 2: o "Reativar" aparece também no pedido com casa, com a frase das datas embaixo
  tem(pagina, '{r.pagamento.retido && pagamentoRetidoADecidir(r) && retidoComCasa(p.itens) && (');
  // a rota: o pedido com casa prende as datas de novo ANTES de reativar, ou recusa com o motivo
  const rota = codigo('src', 'app', 'api', 'admin', 'reservas', '[codigo]', 'route.ts');
  tem(rota, 'await prenderDatasDoPedido(vouchers, retido.sessaoId, { todas: true });');
  tem(rota, "if (e instanceof DatasIndisponiveis) return 'reativar-datas-ocupadas';");
  // o reembolso de um voucher: o sinal GUARDADO na compra (furo 19), nunca a conta de hoje
  tem(rota, '...(ehCasa(item) ? { sinalCentavos: item.sinalCentavos, sinalPixCentavos: item.sinalPixCentavos } : {})');
  // o cancelamento do pedido em aberto com casa refaz o calendário das páginas das casas
  tem(rota, 'if (r && vouchers.some(ehCasa)) calendarioMudou();');
  // o resumo antes do reembolso: a casa com a entrada e a saída
  tem(
    codigo('src', 'app', 'admin', 'resumo', '[codigo]', 'page.tsx'),
    "if (ehCasa(r)) return `${r.casa.nome} · entrada ${data} às 15h, saída ${formatarDataIso(r.saida, 'pt-BR')} às 12h`;",
  );
  // o valor do item para cobrar e devolver: com o sinal guardado, ele é o número da compra
  assert.equal(valorDoItem({ tipo: 'casa', totalCentavos: 200000, totalPixCentavos: 180000, sinalPixCentavos: 85000 }, 'pix'), 85000);
  assert.equal(valorACobrar([CASA, PASSEIO], 'cartao'), 100000 + 15400);
});

test('as páginas do pedido e da reserva com a casa: a grade da casa, os próximos passos da casa, a mensagem com as datas e a faixa com o sinal', () => {
  const status = codigo('src', 'components', 'StatusReserva.tsx');
  // a casa paga: só os valores da forma paga (furo 20)
  tem(status, "const formaPaga: FormaPagamento = r.forma ?? 'cartao';");
  tem(status, "{r.status === 'pago' && pagaNaForma ? (");
  tem(status, '{t ? textos.transferConfirmado : c ? textos.casaConfirmadoTexto : textos.confirmadoTexto}');
  tem(
    status,
    'fmt(textos.casaMsgVoucher, { codigo: r.codigo, casa: r.passeioNome, entrada: c.entradaCurta, saida: c.saidaCurta, hospedes: pessoas })',
  );
  // os próximos passos da casa: nada de remarcar com 24 horas, que é dos passeios
  const proximos = status.slice(status.indexOf('{c && pagaNaForma ? ('), status.indexOf(') : (', status.indexOf('{c && pagaNaForma ? (')));
  for (const passo of [
    'textos.casaProximo1',
    'textos.casaProximo2',
    'fmt(textos.casaProximo3, { valor: formatarCentavos(pagaNaForma.chegada, locale) })',
    'textos.proximo2',
  ])
    tem(proximos, passo);
  assert.doesNotMatch(proximos, /proximo3\}|proximo1Saida|proximo1Busca/);
  // a reserva: a nova reserva volta à página da casa
  tem(
    codigo('src', 'app', '[locale]', 'reserva', '[codigo]', 'page.tsx'),
    "publica.tipo === 'casa' ? `/casas-de-temporada/${publica.passeioSlug}`",
  );
  // o que as páginas recebem: em aberto, a faixa é o sinal; pago, o sinal pago (valorRecebido)
  const publica = codigo('src', 'lib', 'reserva-publica.ts');
  tem(publica, '...(emAberto ? { totalCentavos: r.sinalCentavos, totalPixCentavos: r.sinalPixCentavos } : {})');
  tem(publica, 'const { entrada: quandoEntra, saida: quandoSai } = chegadaESaida(r, idioma, d.casas);');
  // o pedido: em aberto, o que ele cobra hoje (pagamento.cobrar); pago, o sinal pago e a chegada da forma paga
  const pedido = codigo('src', 'app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  tem(pedido, 'const cobrado = reservas.some(ehCasa) ? (primeira.pagamento.cobrar ?? {');
  tem(
    pedido,
    'const pedido = cobrado ? { ...primeira.pedido, totalCentavos: cobrado.cartao, totalPixCentavos: cobrado.pix } : primeira.pedido;',
  );
  tem(pedido, "{d.casas.sinalPago}: {brl(r.forma === 'pix' ? r.casa.sinalPixCentavos : r.casa.sinalCentavos)}");
  tem(pedido, "{d.casas.naChegada}: {brl(r.forma === 'pix' ? r.casa.chegadaPixCentavos : r.casa.chegadaCentavos)},{' '}");
  tem(pedido, 'texto: casaValendo ? [d.pedido.confirmadoTexto, d.pedido.casaNoPedido] : d.pedido.confirmadoTexto');
  tem(pedido, 'fmt(d.carrinho.casaTotalDaEstadia, { pix: brl(r.casa.totalPixCentavos), cartao: brl(r.casa.totalCentavos) })');
});

test('o voucher em PDF da casa sai das regras de voucher-casa.ts, e os e-mails do pedido com casa usam o que ele cobra e a chegada', () => {
  const pdf = codigo('src', 'lib', 'pdf-voucher.ts');
  tem(pdf, 'ehCasa(reserva) ? conteudoDoVoucherDaCasa(reserva, d) : conteudoPasseio(reserva, d);');
  // o PDF sai só do voucher pago (a rota), e o WhatsApp da equipe só com o pagamento aprovado
  tem(pdf, 'const whatsappLiberado = mostrarWhatsApp(statusVoucher);');
  const emails = codigo('src', 'lib', 'email', 'pedidos.ts');
  tem(emails, 'const comCasa = lista.some(ehCasa);');
  tem(
    emails,
    "r.pagamento.cobrar ?? { cartao: valorACobrar(itensPagaveis(lista), 'cartao'), pix: valorACobrar(itensPagaveis(lista), 'pix') }",
  );
  tem(emails, "const casa = casaNaForma(forma === 'pix' ? 'pix' : 'cartao');");
  tem(emails, 'emailPixVencido({ ...base, totais: totaisQueValem(formas, ambos), ...chegadas(formas) })');
  tem(emails, 'const datasNaoPresas = avisosDasDatasNaoPresas(r.historico);');
  // a casa nas linhas de cada item: as diárias com as datas, a entrada e a saída, os hóspedes
  tem(emails, 'const linhas = p.casa ? [p.casa.periodo, d.casas.regraHorario, p.pessoasTexto]');
});

test('os lembretes do carrinho: um erro num carrinho não para a rodada dos outros, e o lembrete reservado volta', () => {
  const fonte = codigo('src', 'lib', 'carrinho-lembretes.ts');
  const laco = fonte.slice(fonte.indexOf('for (const c of lista) {'));
  const abre = onde(laco, 'let marcado: 1 | 2 | null = null; try { const decisao = decidirLembrete(c, agora, {');
  const captura = onde(laco, "} catch (e) { pular('erro-no-carrinho');");
  const desmarca = onde(laco, 'if (n) await desmarcarLembrete(c.id, n)');
  assert.ok(abre > 0 && abre < captura && captura < desmarca, `${abre} ${captura} ${desmarca}`);
  tem(laco, 'marcado = n;');
});

test('o preço em destaque nas casas (decisão D1-A, decisão 6 do dono): o cartão grande em espanhol e inglês, o Pix em português', () => {
  assert.equal(cartaoEmDestaque('pt'), false);
  for (const idioma of ['es', 'es-ar', 'en']) assert.equal(cartaoEmDestaque(idioma), true, idioma);
  // a lista das casas e as opções do feriado na página da casa seguem a mesma regra
  const cartao = codigo('src', 'components', 'casas', 'CardCasa.tsx');
  tem(cartao, 'const cartaoPrimeiro = cartaoEmDestaque(idioma);');
  tem(cartao, 'const grande = cartaoPrimeiro ? { ...cartao, rotulo: d.preco.noCartao } : { ...pix, rotulo: d.preco.noPix };');
  const quadro = codigo('src', 'components', 'casas', 'ReservaCasa.tsx');
  const opcoes = quadro.slice(quadro.indexOf('{opcoes.map((p) => {'), quadro.indexOf('<CalendarioCasa'));
  tem(opcoes, '{cartaoPrimeiro ? (');
  tem(opcoes, '<span className="numeros font-semibold">{cifra(v.totalCentavos)}</span> {T.noCartao}');
});

test('os textos novos da casa existem nos quatro idiomas, com os marcadores certos e o "vos" só no es-ar', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    for (const [nome, frase] of Object.entries({
      'reserva.casa': d.reserva.casa,
      'reserva.casaConfirmadoTexto': d.reserva.casaConfirmadoTexto,
      'reserva.casaProximo2': d.reserva.casaProximo2,
      'reserva.casaLocalizacao': d.reserva.casaLocalizacao,
      'casas.diarias': d.casas.diarias,
      'casas.sinalPago': d.casas.sinalPago,
      'casas.totalDaEstadia': d.casas.totalDaEstadia,
      'casas.formasNaChegada': d.casas.formasNaChegada,
      'pedido.casaNoPedido': d.pedido.casaNoPedido,
    })) {
      assert.ok(frase.trim().length > 0, `${idioma} ${nome}`);
      assert.doesNotMatch(frase, /\{\w+\}|\busted(es)?\b/i, `${idioma} ${nome}`);
    }
    assert.match(d.reserva.casaProximo1, /\{hora\}/, idioma);
    assert.match(d.reserva.casaProximo3, /\{valor\}/, idioma);
    assert.match(d.casas.quandoEntra, /^\{data\}, .*\{hora\}$/, idioma);
    assert.match(d.casas.quandoSai, /^\{data\}, .*\{hora\}$/, idioma);
    for (const marcador of ['{codigo}', '{casa}', '{entrada}', '{saida}', '{hospedes}'])
      assert.ok(d.reserva.casaMsgVoucher.includes(marcador), `${idioma} ${marcador}`);
    // sem endereço em nenhuma frase da casa: a equipe manda a localização pelo WhatsApp
    assert.match(d.reserva.casaLocalizacao, /WhatsApp/);
  }
  // o es-ar com "vos" e "seña"; o es neutro com "tú" e "anticipo"
  assert.match(dicionario('es-ar').reserva.casaProximo1, /con vos/);
  assert.match(dicionario('es-ar').reserva.casaProximo3, /pagás/);
  assert.equal(dicionario('es-ar').casas.sinalPago, 'Seña pagada');
  assert.match(dicionario('es').reserva.casaProximo1, /contigo/);
  assert.match(dicionario('es').reserva.casaProximo3, /pagas/);
  assert.equal(dicionario('es').casas.sinalPago, 'Anticipo pagado');
});
