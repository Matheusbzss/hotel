import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IDIOMAS } from '../src/i18n/config.ts';
import { texto } from '../src/i18n/conteudo.ts';
import { dicionario } from '../src/i18n/index.ts';
import { PASSEIOS } from '../src/data/passeios.ts';
import type { EscolhaItem } from '../src/lib/carrinho.ts';
import { hospedagemDoTransfer } from '../src/lib/hospedagem.ts';
import { DOMINIOS_COMUNS, semDdiRepetido, sugestaoDeEmail, telefoneParaGravar, telefoneValido } from '../src/lib/validacao.ts';

// Pacote 34, bloco "do carrinho ao pagamento" (revisão de conversão de 26/11): o telefone sem o código do país repetido
// (P5), a sugestão do e-mail com erro de digitação (P13), a hospedagem que vem do transfer (P12) e os textos novos nos
// quatro idiomas (P1, P2, P7 a P11). A troca do Pix para o cartão (P1) tem o arquivo dela: tests/troca-de-forma.test.ts.

/* ------------------------------------------------------------------ */
/* P5: o código do país repetido                                       */

test('o +54 digitado de novo sai do número (Argentina), com e sem o "+", e o resto fica como foi digitado', () => {
  assert.deepEqual(semDdiRepetido('54', '+54 9 11 5555-0000'), { ddi: '54', numero: '9 11 5555-0000' });
  assert.deepEqual(semDdiRepetido('54', '0054 9 11 5555-0000'), { ddi: '54', numero: '9 11 5555-0000' });
  assert.deepEqual(semDdiRepetido('54', '(+54) 9 11 5555-0000'), { ddi: '54', numero: '9 11 5555-0000' });
  assert.deepEqual(semDdiRepetido('54', '54 9 11 5555 0000'), { ddi: '54', numero: '9 11 5555 0000' });
  assert.deepEqual(semDdiRepetido('54', '5491155550000'), { ddi: '54', numero: '91155550000' });
  assert.deepEqual(semDdiRepetido('54', '54 11 5555-0000'), { ddi: '54', numero: '11 5555-0000' });
  // o número de sempre, sem o código, não muda
  assert.deepEqual(semDdiRepetido('54', '9 11 5555-0000'), { ddi: '54', numero: '9 11 5555-0000' });
  assert.deepEqual(semDdiRepetido('54', '011 15 5555-0000'), { ddi: '54', numero: '011 15 5555-0000' });
  // o que o pedido grava: "+54 91155550000", nunca "+54 5491155550000" (o defeito visto pela revisão)
  assert.equal(telefoneParaGravar('54', '+54 9 11 5555-0000'), '+54 91155550000');
  assert.equal(telefoneParaGravar('54', '9 11 5555-0000'), '+54 91155550000');
});

test('o +56 do Chile: o código repetido sai; o número chileno de 9 algarismos fica', () => {
  assert.deepEqual(semDdiRepetido('56', '+56 9 1234 5678'), { ddi: '56', numero: '9 1234 5678' });
  assert.deepEqual(semDdiRepetido('56', '56 9 1234 5678'), { ddi: '56', numero: '9 1234 5678' });
  assert.deepEqual(semDdiRepetido('56', '9 1234 5678'), { ddi: '56', numero: '9 1234 5678' });
  assert.equal(telefoneParaGravar('56', '+56 9 1234 5678'), '+56 912345678');
  assert.ok(telefoneValido('56', '+56 9 1234 5678'));
});

test('o +55 do Brasil: o código repetido sai, mas o DDD 55 (Rio Grande do Sul) nunca é confundido com ele', () => {
  assert.deepEqual(semDdiRepetido('55', '+55 21 99999-9999'), { ddi: '55', numero: '21 99999-9999' });
  assert.deepEqual(semDdiRepetido('55', '55 21 99999-9999'), { ddi: '55', numero: '21 99999-9999' });
  assert.deepEqual(semDdiRepetido('55', '5521999999999'), { ddi: '55', numero: '21999999999' });
  // DDD 55 com celular (11 algarismos) e fixo (10): são números brasileiros inteiros, ficam como estão
  assert.deepEqual(semDdiRepetido('55', '55 99123-4567'), { ddi: '55', numero: '55 99123-4567' });
  assert.deepEqual(semDdiRepetido('55', '55 3222-1234'), { ddi: '55', numero: '55 3222-1234' });
  // o DDD 55 com o código do país na frente perde só o código
  assert.deepEqual(semDdiRepetido('55', '+55 55 99123-4567'), { ddi: '55', numero: '55 99123-4567' });
  // a validação do Brasil (10 ou 11 algarismos) passa a aceitar o número com o código repetido, já sem ele
  assert.ok(telefoneValido('55', '+55 21 99999-9999'));
  assert.ok(telefoneValido('55', '55 99123-4567'));
  assert.ok(!telefoneValido('55', '99999-9999'));
});

test('com o "+", o código de outro país da lista passa para a caixa (a caixa na Argentina e o número do Chile)', () => {
  assert.deepEqual(semDdiRepetido('54', '+56 9 1234 5678'), { ddi: '56', numero: '9 1234 5678' });
  assert.deepEqual(semDdiRepetido('56', '+54 9 11 5555-0000'), { ddi: '54', numero: '9 11 5555-0000' });
  assert.deepEqual(semDdiRepetido('55', '+598 99 123 456'), { ddi: '598', numero: '99 123 456' });
  assert.equal(telefoneParaGravar('54', '+56 9 1234 5678'), '+56 912345678');
  // sem o "+", os algarismos de outro país não mudam a caixa (podem ser parte do número)
  assert.deepEqual(semDdiRepetido('54', '56 9 1234 5678'), { ddi: '54', numero: '56 9 1234 5678' });
  // um código fora da lista, ou curto demais depois dele: nada muda
  assert.deepEqual(semDdiRepetido('54', '+81 90 1234 5678'), { ddi: '54', numero: '+81 90 1234 5678' });
  assert.deepEqual(semDdiRepetido('54', '+54 123'), { ddi: '54', numero: '+54 123' });
});

test('o servidor e o navegador usam a mesma conta: a rota do pedido e a das cotações gravam pelo telefoneParaGravar', () => {
  const pedido = readFileSync(path.join('src', 'app', 'api', 'pedido', 'route.ts'), 'utf8');
  assert.match(pedido, /telefone: telefoneParaGravar\(e\.cliente\.ddi, e\.cliente\.telefone\),/);
  assert.doesNotMatch(pedido, /soDigitos\(e\.cliente\.telefone\)/);
  const cotacoes = readFileSync(path.join('src', 'app', 'api', 'cotacoes', 'route.ts'), 'utf8');
  assert.match(cotacoes, /telefone: telefoneParaGravar\(e\.ddi, e\.telefone\)/);
  const carrinho = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  assert.match(carrinho, /onBlur=\{aoSairDoTelefone\}/);
  assert.match(carrinho, /const tel = semDdiRepetido\(ddi, telefone\);/);
  assert.match(carrinho, /cliente: \{ nome: nome\.trim\(\), email: email\.trim\(\), ddi: tel\.ddi, telefone: tel\.numero \}/);
  assert.match(readFileSync(path.join('src', 'components', 'FormularioCotacao.tsx'), 'utf8'), /const t = semDdiRepetido\(ddi, telefone\);/);
});

test('a ajuda e o erro do telefone não pedem mais o código do país (que já está na caixa ao lado)', () => {
  const ajuda = {
    pt: 'Sem o código do país (já está ao lado). Ex.: 21 99999-9999',
    en: 'Don’t include the country code (it’s already selected). E.g. 212 555 0100',
    es: 'Sin el código del país (ya está al lado). Ej.: 9 1234 5678',
    'es-ar': 'Sin el código del país (ya está al lado). Ej.: 9 11 1234-5678',
  };
  const erro = {
    pt: 'Confira o número, com o DDD.',
    en: 'Check the number, including the area code.',
    es: 'Revisa el número, con el código de área.',
    'es-ar': 'Revisá el número, con el código de área.',
  };
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    assert.equal(d.checkout.telefoneAjuda, ajuda[idioma], idioma);
    assert.equal(d.checkout.erros.telefone, erro[idioma], idioma);
    assert.doesNotMatch(d.checkout.telefoneAjuda, /\+\d/, idioma);
    // a FAQ do estrangeiro também deixou de pedir o código do país
    assert.ok(!d.faq.some((f) => /(código del país|código do país|country code)\.$/.test(f.r)), idioma);
  }
  // o exemplo da ajuda continua inteiro numa linha (sem o "+" agora)
  const carrinho = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  assert.match(carrinho, /texto\.split\(\/\(\\\+\?\\d\[\\d -\]\*\\d\)\/\)/);
});

/* ------------------------------------------------------------------ */
/* P13: o e-mail com erro de digitação                                 */

test('a sugestão do e-mail: os erros comuns no domínio viram o domínio certo; nunca troca sozinha', () => {
  assert.equal(sugestaoDeEmail('prueba@gmial.con'), 'prueba@gmail.com');
  assert.equal(sugestaoDeEmail('prueba@gmail.con'), 'prueba@gmail.com');
  assert.equal(sugestaoDeEmail('Maria.Lopez@hotmial.com'), 'Maria.Lopez@hotmail.com');
  assert.equal(sugestaoDeEmail('x@yaho.com'), 'x@yahoo.com');
  assert.equal(sugestaoDeEmail('x@outlok.com'), 'x@outlook.com');
  assert.equal(sugestaoDeEmail('x@hotmail.com.arr'), 'x@hotmail.com.ar');
  assert.equal(sugestaoDeEmail('x@icloud.con'), 'x@icloud.com');
  // o Gmail só tem o gmail.com
  assert.equal(sugestaoDeEmail('x@gmail.com.ar'), 'x@gmail.com');
  assert.equal(sugestaoDeEmail('x@gmail.cl'), 'x@gmail.com');
  // os da lista, os de empresa e os longe de todos: nada
  for (const certo of ['x@gmail.com', 'x@yahoo.com.ar', 'x@hotmail.com.ar', 'x@live.cl', 'x@uol.com.br', 'x@bol.com.br', 'x@mail.com']) {
    assert.equal(sugestaoDeEmail(certo), null, certo);
  }
  assert.equal(sugestaoDeEmail('x@estudiocontable.com.ar'), null);
  assert.equal(sugestaoDeEmail('x@bol.com'), null);
  // revisão do Pacote 34: provedor certo de outro país e outro provedor de verdade nunca recebem sugestão
  for (const certo of ['ana@hotmail.fr', 'x@hotmail.it', 'x@hotmail.de', 'x@yahoo.fr', 'x@yahoo.de', 'x@yahoo.it']) {
    assert.equal(sugestaoDeEmail(certo), null, certo);
  }
  for (const certo of ['x@outlook.fr', 'x@outlook.de', 'x@outlook.it', 'x@live.fr', 'x@live.it', 'x@live.de']) {
    assert.equal(sugestaoDeEmail(certo), null, certo);
  }
  for (const certo of ['x@aol.com', 'x@att.net', 'x@qq.com', 'x@r7.com']) assert.equal(sugestaoDeEmail(certo), null, certo);
  // empate (dois domínios igualmente perto) ou e-mail sem formato: nada
  assert.equal(sugestaoDeEmail('x@live.co'), null);
  assert.equal(sugestaoDeEmail('x@gmail'), null);
  assert.equal(sugestaoDeEmail(''), null);
  // a lista tem os domínios da Argentina, do Chile e do Brasil
  for (const d of ['gmail.com', 'hotmail.com.ar', 'yahoo.com.ar', 'live.cl', 'bol.com.br', 'uol.com.br'])
    assert.ok((DOMINIOS_COMUNS as readonly string[]).includes(d), d);
});

test('a sugestão aparece embaixo do campo, num lugar que o leitor de tela anuncia, e só troca com o toque', () => {
  const carrinho = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  assert.match(carrinho, /onBlur=\{aoSairDoEmail\}/);
  assert.match(carrinho, /setSugestaoEmail\(sugestaoDeEmail\(email\)\);/);
  // ao digitar de novo, a sugestão sai
  assert.match(carrinho, /onChange=\{\(e\) => \{\s+setEmail\(e\.target\.value\);\s+setSugestaoEmail\(null\);\s+\}\}/);
  assert.match(carrinho, /<div aria-live="polite">\s+\{sugestaoEmail && !erros\.email && \(/);
  assert.match(carrinho, /onClick=\{\(\) => usarSugestaoDoEmail\(sugestaoEmail\)\}/);
  // nenhum outro lugar troca o e-mail pela sugestão
  assert.equal(carrinho.match(/setEmail\(sugerido\)/g)?.length, 1);
  for (const idioma of IDIOMAS) assert.match(dicionario(idioma).checkout.emailSugestao, /\{email\}\?$/, idioma);
  assert.equal(dicionario('es-ar').checkout.emailSugestao, '¿Quisiste decir {email}?');
});

/* ------------------------------------------------------------------ */
/* P12: a hospedagem que vem do transfer                               */

const transfer = (saida: string, destino: string, enderecos: { saida?: string; destino?: string } = {}): { escolha: EscolhaItem } => ({
  escolha: {
    tipo: 'transfer',
    veiculo: 'carro',
    ida: {
      saida: { lugar: saida, ...(enderecos.saida ? { endereco: enderecos.saida } : {}) },
      destino: { lugar: destino, ...(enderecos.destino ? { endereco: enderecos.destino } : {}) },
      data: '2026-12-05',
      hora: '15:00',
    },
    passageiros: 2,
    malas: { grandes: 1, medias: 0, mao: 1 },
  } as EscolhaItem,
});
const passeio: { escolha: EscolhaItem } = {
  escolha: { tipo: 'passeio', slug: 'escuna-buzios', data: '2026-12-06', hora: '11:00', adultos: 2, meia: 0, gratis: 0 },
};

test('com transfer para Búzios, Cabo Frio ou Arraial, o checkout já vem com a cidade e o hotel do destino', () => {
  assert.deepEqual(hospedagemDoTransfer([transfer('galeao', 'buzios', { destino: ' Pousada Casas Brancas ' }), passeio]), {
    cidade: 'buzios',
    hotel: 'Pousada Casas Brancas',
  });
  assert.deepEqual(hospedagemDoTransfer([passeio, transfer('santos-dumont', 'arraial-do-cabo', { destino: 'Hotel X' })]), {
    cidade: 'arraial-do-cabo',
    hotel: 'Hotel X',
  });
  // sem nenhum que chegue, o que sai de uma das três (a volta para o aeroporto)
  assert.deepEqual(hospedagemDoTransfer([transfer('cabo-frio', 'galeao', { saida: 'Rua dos Biquínis, 10' })]), {
    cidade: 'cabo-frio',
    hotel: 'Rua dos Biquínis, 10',
  });
  // o que chega vale mais que o que sai
  assert.deepEqual(
    hospedagemDoTransfer([transfer('buzios', 'galeao', { saida: 'A' }), transfer('galeao', 'arraial-do-cabo', { destino: 'B' })]),
    { cidade: 'arraial-do-cabo', hotel: 'B' },
  );
  // só aeroportos, o Rio ou outra cidade: nada (o cliente preenche, como sempre)
  assert.equal(hospedagemDoTransfer([transfer('galeao', 'rio-de-janeiro', { destino: 'Copacabana Palace' })]), null);
  assert.equal(hospedagemDoTransfer([transfer('galeao', 'outra-cidade')]), null);
  assert.equal(hospedagemDoTransfer([passeio]), null);
  // o nome no limite do campo do checkout
  assert.equal(hospedagemDoTransfer([transfer('galeao', 'buzios', { destino: 'x'.repeat(160) })])?.hotel.length, 120);
  // o formulário começa com ela (o cliente pode mudar)
  const carrinho = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  assert.match(carrinho, /const \[daViagem\] = useState\(\(\) => hospedagemDoTransfer\(inicial\)\);/);
  assert.match(carrinho, /useState<CidadeHospedagem \| ''>\(daViagem\?\.cidade \?\? ''\);/);
  assert.match(carrinho, /const \[hotel, setHotel\] = useState\(daViagem\?\.hotel \?\? ''\);/);
});

/* ------------------------------------------------------------------ */
/* Os textos nos quatro idiomas                                        */

test('P1, P2 e P8: a troca para o cartão, o aviso do celular perto do QR e o Pix como segunda opção depois da recusa', () => {
  assert.equal(dicionario('es-ar').pedido.pagarComCartao, '¿No podés pagar con Pix? Pagá con tarjeta');
  assert.equal(dicionario('es').pedido.pagarComCartao, '¿No puedes pagar con Pix? Paga con tarjeta');
  assert.equal(dicionario('pt').pedido.pagarComCartao, 'Não consegue pagar com Pix? Pague com cartão');
  assert.equal(dicionario('en').pedido.pagarComCartao, 'Can’t pay with Pix? Pay by card');
  assert.equal(dicionario('es-ar').checkout.pixNoCelular, 'En el celular, tocá Copiar el código y pegalo en tu app, en Pix Copia y Pega.');
  assert.equal(dicionario('es').checkout.pixNoCelular, 'En el celular, toca Copiar el código y pégalo en tu app, en Pix Copia y Pega.');
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    assert.ok(d.checkout.pixNoCelular.length > 20, idioma);
    // nenhum app de banco citado pelo nome (decisão do dono de 11/11)
    assert.doesNotMatch(d.checkout.pixNoCelular, /Nubank|Mercado Pago|Ita[uú]|Bradesco|Santander|PicPay|Inter\b/i, idioma);
  }
  // P8: em espanhol e inglês, com o desconto e o "si tenés una app que pague Pix"; em português, vazio (o Pix continua
  // sendo a primeira opção)
  assert.equal(dicionario('es-ar').pedido.recusadoPixComApp, 'Si tenés una app que pague Pix, pagá con Pix (−{p}%)');
  assert.equal(dicionario('es').pedido.recusadoPixComApp, 'Si tienes una app que pague Pix, paga con Pix (−{p}%)');
  assert.equal(dicionario('en').pedido.recusadoPixComApp, 'If you have an app that pays with Pix, pay with Pix (−{p}%)');
  assert.equal(dicionario('pt').pedido.recusadoPixComApp, '');
});

test('P9 e P7: a linha do cartão avisa do formulário da Stripe; "um pagamento só" e "o valor total" numa linha só', () => {
  assert.match(
    dicionario('es-ar').checkout.cartaoAvista,
    /Los datos de la tarjeta los ingresás en el paso siguiente, en el formulario seguro de Stripe\.$/,
  );
  assert.match(
    dicionario('es').checkout.cartaoAvista,
    /Los datos de la tarjeta los ingresas en el paso siguiente, en el formulario seguro de Stripe\.$/,
  );
  assert.match(dicionario('pt').checkout.cartaoAvista, /no passo seguinte, no formulário seguro da Stripe\.$/);
  assert.match(dicionario('en').checkout.cartaoAvista, /in the next step, on Stripe’s secure form\.$/);
  assert.equal(dicionario('es').checkout.umPagamentoTotal, 'Un solo pago, siempre por el valor total, y un voucher para cada ítem.');
  assert.equal(dicionario('es-ar').checkout.umPagamentoTotal, dicionario('es').checkout.umPagamentoTotal);
  for (const idioma of IDIOMAS) assert.ok(dicionario(idioma).checkout.umPagamentoTotal.length > 20, idioma);
});

test('P10: no /es e no /en, a nota diz que dá para pagar o cartão na moeda do cliente; no /es-ar (Argentina), em reais', () => {
  const es = dicionario('es').preco.notaCambio;
  assert.match(es, /^En el pago puedes elegir pagar en reales o, con tarjeta, en tu moneda \(con la cotización de Stripe\)\./);
  assert.match(es, /\{data\}/);
  assert.match(dicionario('en').preco.notaCambio, /in your own currency \(at Stripe’s exchange rate\)/);
  // a Argentina não está na lista da moeda local da Stripe
  assert.equal(
    dicionario('es-ar').preco.notaCambio,
    'Pagás en reales. El ≈ US$ es aproximado: cotización del Banco Central de Brasil del {data}.',
  );
});

test('P11: "Reembolso si se cancela por mal tiempo", a frase das taxas inteira e "chicos" em todo o es-ar', () => {
  for (const idioma of ['es', 'es-ar'] as const) {
    const d = dicionario(idioma);
    for (const lista of [d.home.confianca, d.home.confiancaOnline, d.passeio.garantias, d.passeio.garantiasOnline]) {
      assert.ok(lista.includes('Reembolso si se cancela por mal tiempo'), idioma);
      assert.ok(!lista.some((f) => /clima cancela/.test(f)), idioma);
    }
    assert.equal(d.carrinho.taxasNoLocal, 'Las tasas municipales o de embarque, si se cobran, se pagan en el lugar.');
  }
  // nenhum "niño(s)" no dicionário do es-ar, nem nas descrições dos passeios (o neutro continua com "niños")
  const textos: string[] = [];
  const andar = (o: unknown): void => {
    if (typeof o === 'string') textos.push(o);
    else if (Array.isArray(o)) o.forEach(andar);
    else if (o && typeof o === 'object') Object.values(o).forEach(andar);
  };
  andar(dicionario('es-ar'));
  assert.deepEqual(
    textos.filter((t) => /\bniñ[oa]s?\b/i.test(t)),
    [],
  );
  for (const p of PASSEIOS) assert.doesNotMatch(texto(p.descricao, 'es-ar'), /\bniñ[oa]s?\b/i, p.slug);
  assert.equal(dicionario('es-ar').comum.rotulos.criancasMeia, 'chicos (mitad de precio)');
  assert.equal(dicionario('es-ar').faq[2].p, '¿Los chicos pagan?');
  assert.equal(dicionario('es').faq[2].p, '¿Los niños pagan?');
});
