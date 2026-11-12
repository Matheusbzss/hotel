import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HREFLANG, IDIOMAS, IDIOMAS_GUIAS, LOCALE_INTL, OG_LOCALE, PREFIXOS_IDIOMA, isIdioma, isIdiomaGuia } from '../src/i18n/config.ts';
import { idiomaDeConteudo, texto, textoOpcional } from '../src/i18n/conteudo.ts';
import { ajustesAR } from '../src/i18n/es-ar.ts';
import { dicionario, mesclar } from '../src/i18n/index.ts';

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
