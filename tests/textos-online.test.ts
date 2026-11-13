import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frasesDoDocumento } from '../src/content/legal/argentino.ts';
import { CANCELAMENTO } from '../src/content/legal/cancelamento.ts';
import { comMudancas, paresQueFicam } from '../src/content/legal/mudancas.ts';
import { ATUALIZADO_EM_ONLINE, CANCELAMENTO_ONLINE, PRIVACIDADE_ONLINE, TERMOS_ONLINE, textosLegais } from '../src/content/legal/online.ts';
import { PRIVACIDADE } from '../src/content/legal/privacidade.ts';
import { TERMOS } from '../src/content/legal/termos.ts';
import { ATUALIZADO_EM, type DocumentoLegal } from '../src/content/legal/tipos.ts';
import { DESCONTO_PIX_PORCENTO } from '../src/config/precos.ts';
import { IDIOMAS } from '../src/i18n/config.ts';
import { texto, type Traduzido } from '../src/i18n/conteudo.ts';
import { dicionario } from '../src/i18n/index.ts';
import { comPagamentoOnline } from '../src/lib/textos-do-site.ts';

// No dia em que o pagamento online vai ao ar para o público (PAGAMENTO_ONLINE=publico), os termos, a política de
// cancelamento, a privacidade, a FAQ das formas de pagamento e de segurança e o aviso do WhatsApp trocam de versão.
// Com o interruptor desligado (hoje), tudo continua exatamente como está.

const ONLINE: Record<string, [hoje: Traduzido<DocumentoLegal>, online: Traduzido<DocumentoLegal>]> = {
  termos: [TERMOS, TERMOS_ONLINE],
  cancelamento: [CANCELAMENTO, CANCELAMENTO_ONLINE],
  privacidade: [PRIVACIDADE, PRIVACIDADE_ONLINE],
};

const tudo = (doc: DocumentoLegal) => frasesDoDocumento(doc).join('\n');

test('com o interruptor desligado, os textos legais são os de hoje, os mesmos objetos, com a data de hoje', () => {
  const hoje = textosLegais(false);
  assert.equal(hoje.termos, TERMOS);
  assert.equal(hoje.cancelamento, CANCELAMENTO);
  assert.equal(hoje.privacidade, PRIVACIDADE);
  assert.equal(hoje.atualizadoEm, ATUALIZADO_EM);
  const online = textosLegais(true);
  assert.equal(online.termos, TERMOS_ONLINE);
  assert.equal(online.cancelamento, CANCELAMENTO_ONLINE);
  assert.equal(online.privacidade, PRIVACIDADE_ONLINE);
  // a data da versão online é a constante a trocar no dia de ligar, nunca antes da revisão de hoje
  assert.equal(ATUALIZADO_EM_ONLINE, '2026-11-13');
  assert.ok(ATUALIZADO_EM_ONLINE >= ATUALIZADO_EM);
});

test('a versão online muda só o que precisa: tudo que não foi trocado continua igual, palavra por palavra', () => {
  for (const [nome, [hoje, online]] of Object.entries(ONLINE)) {
    for (const idioma of IDIOMAS) {
      const antes = new Set(frasesDoDocumento(texto(hoje, idioma)));
      const depois = frasesDoDocumento(texto(online, idioma));
      // o título, a descrição e o resumo não mudam (a página e o Google veem o mesmo)
      assert.equal(texto(online, idioma).titulo, texto(hoje, idioma).titulo, `${nome}.${idioma}`);
      assert.equal(texto(online, idioma).resumo, texto(hoje, idioma).resumo, `${nome}.${idioma}`);
      // a maior parte do texto é a de hoje: as frases novas (e os títulos renumerados) são poucas
      const novas = depois.filter((f) => !antes.has(f));
      assert.ok(novas.length < depois.length / 2, `${nome}.${idioma}: ${novas.length} frases novas de ${depois.length}`);
    }
  }
});

test('os termos online: o pagamento pela Stripe no site, a seção do Pix e o WhatsApp só depois do pagamento', () => {
  const pt = tudo(TERMOS_ONLINE.pt);
  for (const trecho of [
    '5. Pagamento por Pix',
    'até 2 horas antes do início do primeiro serviço do pedido',
    'até 30 minutos antes do primeiro serviço',
    'valem por 30 minutos',
    'sem precisar de comprovante',
    'EBANX',
    'US$ 3.000,00',
    'Depois de 90 dias do pagamento',
    `${DESCONTO_PIX_PORCENTO}% de desconto`,
    'vale o item 8',
    'Depois do pagamento confirmado, o atendimento também é feito pelo WhatsApp.',
    'por e-mail ou, depois do pagamento, pelo WhatsApp',
    '12. Lei aplicável e foro',
    '8. Casas de temporada',
  ])
    assert.ok(pt.includes(trecho), trecho);
  // o texto de hoje do pagamento pelo WhatsApp sai
  assert.ok(!pt.includes('Enquanto o pagamento online é ativado'));
  // a seção nova existe nos três idiomas, no mesmo lugar, e a numeração segue
  for (const idioma of IDIOMAS) {
    const titulos = texto(TERMOS_ONLINE, idioma).secoes.map((s) => s.titulo);
    assert.equal(titulos.length, 12, idioma);
    titulos.forEach((t, i) => assert.ok(t.startsWith(`${i + 1}. `), `${idioma}: ${t}`));
    assert.match(titulos[4], /Pix/, idioma);
  }
  assert.ok(tudo(TERMOS_ONLINE.en).includes('US$ 3,000.00'));
  assert.ok(tudo(TERMOS_ONLINE.es).includes('US$ 3.000,00'));
  // o argentino ficou com o vos no item novo do contato por e-mail
  assert.ok(
    tudo(TERMOS_ONLINE['es-ar'] as DocumentoLegal).includes(
      'escribinos: la mayoría de las cuestiones se resuelven rápido por e-mail o, después del pago, por WhatsApp',
    ),
  );
});

test('a política de cancelamento online: o arrependimento pelo site, o estorno pela Stripe e os pedidos pagos por Pix', () => {
  const pt = tudo(CANCELAMENTO_ONLINE.pt);
  for (const trecho of [
    'pedimos o estorno à Stripe assim que o seu pedido de desistência chega',
    '“Desistir da compra”',
    'em até 2 (dois) dias úteis',
    'no arrependimento do item 2, assim que o pedido chega',
    'volta pela Stripe para a conta de onde o Pix saiu',
    'Depois de 90 dias do pagamento',
    '10. Pedidos pagos por Pix',
    '11. Casas de temporada',
    '(veja o item 11)',
    'Pagamento em dobro',
  ])
    assert.ok(pt.includes(trecho), trecho);
  // o nome do link na política é o mesmo do link na página do pedido, em cada idioma
  for (const idioma of IDIOMAS) {
    const link = dicionario(idioma).pedido.desistirLink;
    assert.ok(tudo(texto(CANCELAMENTO_ONLINE, idioma)).includes(`“${link}”`), `${idioma}: ${link}`);
  }
  // o resumen da tarjeta continua argentino no es-ar e estado de cuenta no neutro
  assert.ok(tudo(CANCELAMENTO_ONLINE['es-ar'] as DocumentoLegal).includes('uno o dos resúmenes'));
  assert.ok(tudo(CANCELAMENTO_ONLINE.es).includes('uno o dos estados de cuenta'));
});

test('a privacidade online: Stripe (com os cookies antifraude do formulário), Resend e o lembrete do carrinho', () => {
  const pt = tudo(PRIVACIDADE_ONLINE.pt);
  for (const trecho of [
    'Stripe: processamento dos pagamentos com cartão e Pix e prevenção a fraudes.',
    'usa cookies e informações do aparelho e da navegação',
    'stripe.com/privacy',
    'Resend: envio dos e-mails do pedido',
    'Todo lembrete traz um link para sair da lista.',
    'legítimo interesse (art. 7º, IX)',
    'Mandar por e-mail a confirmação do pedido',
  ])
    assert.ok(pt.includes(trecho), trecho);
  assert.ok(!pt.includes('Bancos e empresas de pagamento'));
  for (const idioma of IDIOMAS) {
    const t = tudo(texto(PRIVACIDADE_ONLINE, idioma));
    assert.ok(t.includes('Stripe') && t.includes('Resend') && t.includes('stripe.com/privacy'), idioma);
  }
});

test('comMudancas falha alto com frase ou seção que não existe, e sem mudanças devolve o mesmo texto', () => {
  const es = TERMOS.es;
  assert.deepEqual(comMudancas(es, {}), es);
  assert.throws(() => comMudancas(es, { trocas: [['Frase que não existe.', 'Outra.']] }), /Frase que não existe\./);
  assert.throws(() => comMudancas(es, { depois: [['Também não existe.', ['Nova.']]] }), /Também não existe\./);
  assert.throws(
    () => comMudancas(es, { secoes: [['99. Seção que não existe', { titulo: '100. Nova', paragrafos: [] }]] }),
    /99\. Seção que não existe/,
  );
  assert.throws(() => comMudancas(es, { trocas: [[es.titulo, es.titulo]] }), /sem efeito/);
  // a seção nova entra no lugar certo, com o número da posição, e renumera as seguintes
  const nova = comMudancas(es, { secoes: [[es.secoes[0].titulo, { titulo: '0. Nova', paragrafos: ['Texto.'] }]] });
  assert.equal(nova.secoes.length, es.secoes.length + 1);
  assert.equal(nova.secoes[1].titulo, '2. Nova');
  assert.equal(nova.secoes[2].titulo, es.secoes[1].titulo.replace(/^\d+\./, '3.'));
  // os pares das frases trocadas saem; os outros ficam
  const pares = [
    ['a', 'b'],
    ['c', 'd'],
  ] as const;
  assert.deepEqual(paresQueFicam(pares, { trocas: [['a', 'z']] }), [['c', 'd']]);
});

test('a FAQ e o aviso do WhatsApp: hoje, as frases de sempre; com o pagamento online no ar, as dele', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    // desligado: o mesmo dicionário, sem cópia
    assert.equal(comPagamentoOnline(d, false), d);
    const on = comPagamentoOnline(d, true);
    assert.equal(on.comum.avisoWhatsapp, d.comum.avisoWhatsappOnline);
    // só as respostas da forma de pagamento e da segurança mudam; as perguntas e as outras respostas ficam
    const mudaram = on.faq.map((f, i) => f.r !== d.faq[i].r);
    assert.deepEqual(
      mudaram.map((m, i) => (m ? i : -1)).filter((i) => i >= 0),
      [1, 9],
      idioma,
    );
    assert.deepEqual(
      on.faq.map((f) => f.p),
      d.faq.map((f) => f.p),
    );
    // a resposta online fala da Stripe e não do caminho do WhatsApp de hoje
    assert.match(on.faq[1].r, /Stripe/, idioma);
    assert.match(on.faq[9].r, /Stripe/, idioma);
    assert.doesNotMatch(on.faq[1].r, /WhatsApp/, idioma);
    // o dicionário de origem não muda
    assert.notEqual(d.faq[1].r, on.faq[1].r);
  }
});

test('os textos novos do Pix e da desistência: sem "promoção" e sem preço escrito à mão', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    const novos = [
      d.checkout.pixRecebedor,
      d.pedido.semPixLimite,
      d.comum.avisoWhatsappOnline,
      d.pedido.desistirTexto,
      d.pedido.desistirRecebido,
      d.pedido.desistirRepetido,
      d.faq[1].rOnline ?? '',
      d.faq[9].rOnline ?? '',
    ];
    for (const t of novos) {
      assert.ok(t.trim(), idioma);
      assert.doesNotMatch(t, /promo/i, `${idioma}: ${t}`);
      assert.doesNotMatch(t, /(R\$|US\$)\s*\d/, `${idioma}: ${t}`);
    }
    // o aviso do recebedor não promete um nome só (a Stripe não confirmou o da conta brasileira) e cita a marca
    assert.match(d.checkout.pixRecebedor, /EBANX/, idioma);
    assert.match(d.checkout.pixRecebedor, /Orla Nativa/, idioma);
  }
});
