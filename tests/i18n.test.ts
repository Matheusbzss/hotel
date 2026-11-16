import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HREFLANG,
  IDIOMAS,
  IDIOMAS_GUIAS,
  LOCALE_INTL,
  OG_LOCALE,
  PREFIXOS_IDIOMA,
  fmt,
  isIdioma,
  isIdiomaGuia,
} from '../src/i18n/config.ts';
import { idiomaDeConteudo, texto, textoOpcional } from '../src/i18n/conteudo.ts';
import { ajustesAR } from '../src/i18n/es-ar.ts';
import { dicionario, mesclar } from '../src/i18n/index.ts';
import { ANTECEDENCIA_TRANSFER_MINUTOS } from '../src/lib/horarios.ts';
import { CHAVES_RECUSA } from '../src/lib/recusas.ts';

// O espanhol da Argentina ('es-ar') é o espanhol ('es') com só as frases que mudam por cima (src/i18n/es-ar.ts).
// Este teste garante que a mescla não perde nem inventa chave, que as listas continuam do mesmo tamanho e que
// os dados com três idiomas servem o 'es-ar' lendo o 'es'.

/** A forma de um valor: as chaves (em ordem) e o tipo de cada folha; uma lista guarda o tamanho. */
function forma(v: unknown): unknown {
  if (Array.isArray(v)) return { lista: v.length, itens: v.map(forma) };
  if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forma(x)]));
  return typeof v;
}

test('os quatro idiomas, com o formato de número, o hreflang e o OG certos', () => {
  assert.deepEqual([...IDIOMAS], ['pt', 'en', 'es', 'es-ar']);
  assert.ok(isIdioma('es-ar') && !isIdioma('es-AR') && !isIdioma('es-cl'));
  // as duas versões do espanhol escrevem R$ 1.197,00 do mesmo jeito
  assert.equal(LOCALE_INTL['es-ar'], 'es-AR');
  assert.equal(LOCALE_INTL.es, 'es-AR');
  assert.equal(HREFLANG['es-ar'], 'es-AR');
  assert.equal(HREFLANG.es, 'es');
  assert.equal(OG_LOCALE['es-ar'], 'es_AR');
  assert.equal(OG_LOCALE.es, 'es_LA');
  // o prefixo mais comprido vem antes: /es-ar casa antes de /es
  assert.ok(PREFIXOS_IDIOMA.indexOf('es-ar') < PREFIXOS_IDIOMA.indexOf('es|') || PREFIXOS_IDIOMA.endsWith('es'));
  assert.deepEqual([...IDIOMAS_GUIAS], ['es', 'es-ar']);
  assert.ok(isIdiomaGuia('es-ar') && !isIdiomaGuia('pt'));
});

test('o conteúdo em três idiomas serve o es-ar lendo o es, a não ser que traga a versão argentina', () => {
  assert.equal(idiomaDeConteudo('es-ar'), 'es');
  assert.equal(idiomaDeConteudo('es'), 'es');
  assert.equal(idiomaDeConteudo('pt'), 'pt');
  const nome = { pt: 'Escuna', en: 'Schooner', es: 'Goleta' };
  assert.equal(texto(nome, 'es-ar'), 'Goleta');
  assert.equal(texto(nome, 'en'), 'Schooner');
  assert.equal(texto({ ...nome, 'es-ar': 'Goleta (AR)' }, 'es-ar'), 'Goleta (AR)');
  assert.equal(texto({ ...nome, 'es-ar': 'Goleta (AR)' }, 'es'), 'Goleta');
  const lista = { pt: ['a'], en: ['b'], es: ['c'] };
  assert.deepEqual(texto(lista, 'es-ar'), ['c']);
  assert.equal(textoOpcional(undefined, 'es-ar'), undefined);
  assert.equal(textoOpcional({ es: 'Só es' }, 'es-ar'), 'Só es');
  assert.equal(textoOpcional({ es: 'Só es', 'es-ar': 'AR' }, 'es-ar'), 'AR');
  assert.equal(textoOpcional({ es: 'Só es' }, 'pt'), undefined);
});

test('a mescla profunda: objetos se mesclam, listas e textos substituem inteiros, nada muda na base', () => {
  const base = { a: { b: 'b', c: 'c', lista: ['1', '2'] }, d: 'd' };
  const saida = mesclar(base, { a: { c: 'C', lista: ['x'] } });
  assert.deepEqual(saida, { a: { b: 'b', c: 'C', lista: ['x'] }, d: 'd' });
  assert.deepEqual(base, { a: { b: 'b', c: 'c', lista: ['1', '2'] }, d: 'd' });
  assert.deepEqual(mesclar(base, {}), base);
  assert.deepEqual(mesclar(base, undefined), base);
});

test('o dicionário do es-ar tem a mesma forma do es: as mesmas chaves e listas do mesmo tamanho', () => {
  const es = dicionario('es');
  const ar = dicionario('es-ar');
  assert.deepEqual(forma(ar), forma(es));
  // só as chaves de src/i18n/es-ar.ts mudam de texto: o resto é igual ao espanhol
  const folhas = (v: unknown, caminho = ''): [string, unknown][] =>
    typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.entries(v).flatMap(([k, x]) => folhas(x, caminho ? `${caminho}.${k}` : k))
      : [[caminho, v]];
  const ajustadas = new Set(folhas(ajustesAR).map(([caminho]) => caminho.replace(/\.\d+$/, '')));
  const doEs = new Map(folhas(es));
  for (const [caminho, valor] of folhas(ar)) {
    if ([...ajustadas].some((a) => caminho === a || caminho.startsWith(`${a}.`))) continue;
    assert.deepEqual(valor, doEs.get(caminho), caminho);
  }
});

test('todo texto do es-ar é um texto, e não fica vazio onde o es tem texto', () => {
  const folhas = (v: unknown, caminho = ''): [string, unknown][] =>
    typeof v === 'object' && v !== null
      ? Object.entries(v).flatMap(([k, x]) => folhas(x, caminho ? `${caminho}.${k}` : k))
      : [[caminho, v]];
  const doEs = new Map(folhas(dicionario('es')));
  for (const [caminho, valor] of folhas(dicionario('es-ar'))) {
    assert.equal(typeof valor, 'string', caminho);
    // o es deixa uma ou outra chave vazia de propósito (ex.: legal.acoes.termos.msg): só aí o es-ar pode ficar vazio
    if (String(doEs.get(caminho)).trim()) assert.ok((valor as string).trim().length > 0, caminho);
  }
});

test('Etapa 4: os textos do pagamento existem nos quatro idiomas, com os marcadores certos e sem preço fixo', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    // um motivo de recusa para cada chave de src/lib/recusas.ts, e nada a mais
    assert.deepEqual(Object.keys(d.recusa).sort(), [...CHAVES_RECUSA].sort(), idioma);
    for (const chave of CHAVES_RECUSA) assert.ok(d.recusa[chave].trim(), `${idioma} recusa.${chave}`);
    // o valor e a porcentagem vêm do código, já formatados: nunca um número escrito à mão
    assert.ok(d.checkout.pagar.includes('{valor}'), `${idioma} checkout.pagar`);
    assert.ok(d.pedido.reembolsadoParcial.includes('{valor}'), `${idioma} pedido.reembolsadoParcial`);
    // o reembolso que falhou na Stripe (Pacote 4): o valor vem formatado do código, com os centavos
    assert.ok(d.pedido.reembolsoFalhou.includes('{valor}'), `${idioma} pedido.reembolsoFalhou`);
    assert.ok(d.pedido.reembolsoOutroMeio.includes('{valor}'), `${idioma} pedido.reembolsoOutroMeio`);
    assert.ok(d.pedido.recusadoPix.includes('{p}%'), `${idioma} pedido.recusadoPix`);
    const novos = [
      d.checkout.formaPagamento,
      d.checkout.cartao,
      d.checkout.pix,
      d.checkout.pagar,
      d.checkout.irParaPagamento,
      d.checkout.pixExplicacao,
      d.checkout.pixApps,
      d.checkout.cartaoAvista,
      d.pedido.confirmando,
      d.pedido.confirmandoTexto,
      d.pedido.atualizaSozinho,
      d.pedido.pagar,
      d.pedido.pagarDeNovo,
      d.pedido.tempoEsgotado,
      d.pedido.tempoEsgotadoTexto,
      d.pedido.semPrazo,
      d.pedido.recusadoTitulo,
      d.pedido.recusadoPix,
      d.pedido.dicaInternacional,
      d.pedido.tentarOutroCartao,
      d.pedido.semPixPrazo,
      d.pedido.contestadoTitulo,
      d.pedido.contestadoTexto,
      d.pedido.reembolsadoParcial,
      d.pedido.reembolsadoTexto,
      // Pacote 4 (16/11): o reembolso que falhou na Stripe, na tela do cliente
      d.pedido.reembolsoPendenteTitulo,
      d.pedido.reembolsoFalhou,
      d.pedido.reembolsoOutroMeio,
      d.status.contestado,
      d.carrinho.continuarPagamento,
      // Pacote 7 (16/11): o carrinho que virou um pedido já pago leva ao pedido
      d.carrinho.pedidoPago,
      d.carrinho.verPedido,
      // Etapa 5: para que serve o e-mail do checkout e o aviso de quando o formulário da Stripe não carrega
      d.checkout.emailAjuda,
      d.checkout.emailPrivacidade,
      d.checkout.semStripe,
      ...Object.values(d.recusa),
    ];
    for (const t of novos) {
      // "desconto", nunca "promoção"; nenhum preço escrito à mão (R$ 10, US$ 5…)
      assert.doesNotMatch(t, /promo/i, `${idioma}: ${t}`);
      assert.doesNotMatch(t, /(R\$|US\$)\s*\d/, `${idioma}: ${t}`);
    }
  }
  // a linha dos apps de fora fica vazia nos quatro idiomas: em português de propósito (o brasileiro já sabe pagar Pix);
  // em inglês e espanhol por decisão do dono (11/11), até o Pix de R$ 1,00 pago por app de fora confirmar cada app
  for (const idioma of IDIOMAS) assert.equal(dicionario(idioma).checkout.pixApps, '', idioma);
});

test('a contestação vale para cartão e para Pix: o texto do cliente não fala em cartão', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    for (const t of [d.pedido.contestadoTitulo, d.pedido.contestadoTexto, d.status.contestado])
      assert.doesNotMatch(t, /cart[ãa]o|tarjeta|card/i, `${idioma}: ${t}`);
  }
});

test('Pacote 6: a frase da antecedência do transfer nos quatro idiomas, com o {h} das horas e nenhum número à mão', () => {
  const horas = ANTECEDENCIA_TRANSFER_MINUTOS / 60;
  for (const idioma of IDIOMAS) {
    const t = dicionario(idioma).transfer.erroAntecedencia;
    assert.ok(t.trim(), idioma);
    // o número de horas vem da regra (src/lib/horarios.ts), uma vez só
    assert.equal(t.split('{h}').length, 2, `${idioma}: ${t}`);
    assert.doesNotMatch(t, /\d/, `${idioma}: ${t}`);
    assert.match(fmt(t, { h: horas }), new RegExp(`(?<!\\d)${horas} (horas|hours)(?!\\p{L})`, 'u'), `${idioma}: ${t}`);
  }
  // sem verbo em tú nem em vos: o es-ar lê a frase do es (src/i18n/es-ar.ts não muda)
  assert.equal(dicionario('es-ar').transfer.erroAntecedencia, dicionario('es').transfer.erroAntecedencia);
});

test('Pacote 7: a passagem para o pedido pago nos quatro idiomas, com o {codigo} uma vez e igual no es e no es-ar', () => {
  for (const idioma of IDIOMAS) {
    const { pedidoPago, verPedido } = dicionario(idioma).carrinho;
    // o código do pedido vem do código, uma vez só, nunca escrito à mão
    assert.equal(pedidoPago.split('{codigo}').length, 2, `${idioma}: ${pedidoPago}`);
    assert.doesNotMatch(pedidoPago, /ON-|\d/, `${idioma}: ${pedidoPago}`);
    assert.doesNotMatch(fmt(pedidoPago, { codigo: 'ON-7K3P9Q' }), /[{}]/, idioma);
    assert.ok(verPedido.trim(), idioma);
  }
  // sem verbo em tú nem em vos ("Tu pedido … ya está pagado."): o es-ar lê o es, e src/i18n/es-ar.ts não muda
  for (const chave of ['pedidoPago', 'verPedido'] as const)
    assert.equal(dicionario('es-ar').carrinho[chave], dicionario('es').carrinho[chave], chave);
});

test('o reembolso que falhou vale para cartão e para Pix: o texto do cliente não fala em cartão, nem promete prazo', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    for (const t of [d.pedido.reembolsoPendenteTitulo, d.pedido.reembolsoFalhou, d.pedido.reembolsoOutroMeio]) {
      assert.ok(t.trim(), idioma);
      assert.doesNotMatch(t, /cart[ãa]o|tarjeta|card/i, `${idioma}: ${t}`);
      // nenhum prazo (o reembolso por outro meio depende da equipe e do cliente) e nenhum motivo da falha
      assert.doesNotMatch(t, /\d|prazo|plazo|days?\b|d[ií]as?\b|vencid|cancelad|roubad|robad|stolen|expired/i, `${idioma}: ${t}`);
    }
  }
});
