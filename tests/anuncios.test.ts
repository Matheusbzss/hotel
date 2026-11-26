import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSEIOS, temTaxaNoLocal } from '../src/data/passeios.ts';
import { IDIOMAS } from '../src/i18n/config.ts';
import { texto } from '../src/i18n/conteudo.ts';
import { dicionario } from '../src/i18n/index.ts';

// A revisão do site no ar para os anúncios do Google e da Meta (14/11/2026): o que ela pediu para mudar no site e que
// precisa continuar assim. O rodapé sem ícones de enfeite fica em tests/sem-cnpj.test.ts, e o item 5 da privacidade, em
// tests/textos-online.test.ts.

test('a linha das taxas pagas no local aparece só nos passeios que têm as taxas no "Não inclui"', () => {
  // o helicóptero e o city tour do Rio não têm o item (o do Rio diz que os ingressos ficam de fora)
  assert.deepEqual(
    PASSEIOS.filter((p) => !temTaxaNoLocal(p))
      .map((p) => p.slug)
      .sort(),
    ['city-tour-rio-de-janeiro', 'helicoptero-buzios'],
  );
  // a linha bate com o "Não inclui" da página em todos os idiomas
  for (const p of PASSEIOS) {
    for (const idioma of IDIOMAS) {
      const naoInclui = texto(p.naoInclui, idioma).join('\n');
      assert.equal(
        /taxas municipais|municipal or boarding fees|tasas municipales/i.test(naoInclui),
        temTaxaNoLocal(p),
        `${p.slug}.${idioma}`,
      );
    }
  }
  for (const idioma of IDIOMAS) assert.match(dicionario(idioma).carrinho.taxasNoLocal, /municipa/i, idioma);
});

test('"No dia do passeio" (a mesma lista para todo passeio, na página e no voucher): as taxas, só quando cobradas', () => {
  // o helicóptero e o city tour do Rio não cobram taxa no local: a regra não pode dizer que toda taxa é paga lá
  for (const idioma of IDIOMAS) {
    const taxas = dicionario(idioma).home.diaRegras.filter((r) => /prefeitura|City fees|tasas municipales/.test(r));
    assert.equal(taxas.length, 1, idioma);
    assert.match(taxas[0], /quando cobradas|when charged|cuando se cobran/, idioma);
  }
});

test('as descrições dos passeios não dizem que o nosso passeio é "o melhor" ou "o mais" alguma coisa', () => {
  // as 5 frases que a revisão tirou; as que descrevem lugares ("o mar mais azul", "best viewpoints") podem ficar
  const TIRADAS = [
    'jeito mais fácil',
    'easiest way',
    'forma más fácil',
    'jeito mais completo',
    'most complete way',
    'forma más completa',
    'jeito mais confortável',
    'most comfortable and fastest',
    'forma más cómoda',
    'passeio mais marcante',
    'most memorable way',
    'melhor forma de ver',
    'best way to see',
    'mejor forma de ver',
    // a da revisão de 14/11 que tinha ficado no espanhol do helicóptero (o es-ar usa a mesma)
    'paseo ideal',
  ];
  for (const p of PASSEIOS) {
    for (const idioma of IDIOMAS) {
      const descricao = texto(p.descricao, idioma);
      for (const frase of TIRADAS) assert.ok(!descricao.includes(frase), `${p.slug}.${idioma}: "${frase}"`);
    }
  }
});

test('"É seguro pagar pelo site?": hoje a resposta diz que o pagamento é feito com a equipe pelo WhatsApp', () => {
  for (const idioma of IDIOMAS) {
    const segura = dicionario(idioma).faq[9];
    assert.match(segura.r, /WhatsApp/, idioma);
    assert.doesNotMatch(segura.r, /^(Sim|Yes|Sí)[.,]/, idioma);
    // a resposta do pagamento online (rOnline) continua a de antes, com a Stripe
    assert.match(segura.rOnline ?? '', /Stripe/, idioma);
  }
});

test('o aviso de cookies diz que, com o aceite, o Google e a Meta medem e personalizam os anúncios', () => {
  for (const idioma of IDIOMAS) {
    const aviso = dicionario(idioma).cookies.texto;
    assert.match(aviso, /Google/, idioma);
    assert.match(aviso, /Meta/, idioma);
    // nenhum cookie do site serve para "melhorar o site"
    assert.doesNotMatch(aviso, /melhorar o site|improve the website|mejorar el sitio/, idioma);
  }
});

test('o checkout tem a linha da Política de Privacidade, com o nome da política no lugar do link', () => {
  for (const idioma of IDIOMAS) {
    const C = dicionario(idioma).checkout;
    assert.equal(C.privacidadeAviso.split('{politica}').length, 2, idioma);
    assert.match(C.emailPrivacidade, /Priva/, idioma);
  }
});
