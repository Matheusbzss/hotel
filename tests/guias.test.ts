import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ALT_FOTOS } from '../src/data/fotos-alt.ts';
import { GRUPOS_GUIAS, GUIAS, fraseDoGuia, guiaNoIdioma, textoGuia, type GuiaResolvido } from '../src/data/guias.ts';
import { PASSEIOS } from '../src/data/passeios.ts';
import { IDIOMAS_GUIAS } from '../src/i18n/config.ts';

// Cada guia leva aos passeios e ao transfer, só com foto real e sem texto que envelheça. Com a marca, o título
// do Google fica em até 60 caracteres ("Título | Orla Nativa"). Tudo é conferido nas duas versões do espanhol.

const MARCA = ' | Orla Nativa';
const ativos = new Set(PASSEIOS.filter((p) => p.ativo !== false).map((p) => p.slug));
const slugs = new Set(GUIAS.map((g) => g.slug));
/** Cada guia em cada versão do espanhol, com os textos já escolhidos. */
const VERSOES = IDIOMAS_GUIAS.map((idioma) => ({ idioma, guias: GUIAS.map((g) => guiaNoIdioma(g, idioma)) }));
const TODOS: GuiaResolvido[] = VERSOES.flatMap((v) => v.guias);
const textos = (g: GuiaResolvido) => [
  g.resumo,
  ...g.secoes.flatMap((s) => [...s.paragrafos, ...(s.detalhes ?? []).map((d) => d.texto), ...(s.tabela?.linhas.flat() ?? [])]),
  ...g.perguntas.map((f) => f.r),
  g.fechamento.texto,
];
const fotos = (g: GuiaResolvido) => [g.foto, g.fechamento.foto, ...g.secoes.flatMap((s) => (s.foto ? [s.foto] : []))];

test('título e descrição cabem no Google e não se repetem, nas duas versões do espanhol', () => {
  for (const { guias } of VERSOES) {
    for (const g of guias) {
      assert.ok((g.titulo + MARCA).length <= 60, g.titulo);
      assert.ok(g.descricao.length >= 110 && g.descricao.length <= 160, `${g.slug}: ${g.descricao.length}`);
    }
    assert.equal(new Set(guias.map((g) => g.titulo)).size, guias.length);
    assert.equal(new Set(guias.map((g) => g.descricao)).size, guias.length);
  }
  assert.equal(new Set(GUIAS.map((g) => g.slug)).size, GUIAS.length);
});

test('a versão argentina só entra onde a frase muda; sem ela, as duas versões são iguais', () => {
  const comVersoes = { es: 'Elige tu fecha', 'es-ar': 'Elegí tu fecha' };
  assert.equal(fraseDoGuia(comVersoes, 'es'), 'Elige tu fecha');
  assert.equal(fraseDoGuia(comVersoes, 'es-ar'), 'Elegí tu fecha');
  assert.equal(fraseDoGuia({ es: 'Igual' }, 'es-ar'), 'Igual');
  assert.equal(fraseDoGuia('Igual', 'es-ar'), 'Igual');
  for (const g of GUIAS) {
    const es = guiaNoIdioma(g, 'es');
    const ar = guiaNoIdioma(g, 'es-ar');
    assert.equal(textoGuia(g, 'h1', 'es'), es.h1);
    assert.equal(textoGuia(g, 'h1', 'es-ar'), ar.h1);
    assert.equal(es.slug, g.slug);
    assert.equal(ar.secoes.length, es.secoes.length, g.slug);
    assert.equal(ar.perguntas.length, es.perguntas.length, g.slug);
    assert.deepEqual(ar.relacionados, es.relacionados, g.slug);
  }
  // o guia resolvido só tem texto simples: nenhum { es, 'es-ar' } sobra para a página
  const soTexto = (v: unknown): boolean =>
    Array.isArray(v) ? v.every(soTexto) : typeof v === 'object' && v !== null ? !('es' in v) && Object.values(v).every(soTexto) : true;
  for (const g of TODOS) assert.ok(soTexto(g), g.slug);
});

test('endereços e âncoras só com letras simples, números e hífen', () => {
  for (const g of GUIAS) {
    assert.match(g.slug, /^[a-z0-9-]+$/);
    const ancoras = g.secoes.map((s) => s.id);
    assert.equal(new Set(ancoras).size, ancoras.length, g.slug);
    for (const a of ancoras) assert.match(a, /^[a-z0-9-]+$/, a);
  }
});

test('todo guia leva a passeios que existem e ao transfer', () => {
  for (const g of TODOS) {
    const cartoes = g.secoes.flatMap((s) => s.passeios ?? []);
    assert.ok(cartoes.length > 0, g.slug);
    for (const slug of cartoes) assert.ok(ativos.has(slug), `${g.slug}: ${slug}`);
    assert.ok(
      g.secoes.some((s) => s.transfer),
      `${g.slug}: sem o cartão do transfer`,
    );
  }
});

test('os links do texto levam a páginas que existem', () => {
  for (const g of TODOS) {
    for (const t of textos(g)) {
      for (const [, caminho] of t.matchAll(/\]\(([^)]+)\)/g)) {
        const pagina = caminho.split(/[?#]/)[0];
        const passeio = pagina.match(/^\/passeios\/(.+)$/)?.[1];
        const guia = pagina.match(/^\/guias\/(.+)$/)?.[1];
        if (passeio) assert.ok(ativos.has(passeio), `${g.slug}: ${caminho}`);
        else if (guia) assert.ok(slugs.has(guia) && guia !== g.slug, `${g.slug}: ${caminho}`);
        else assert.ok(existsSync(path.join('src', 'app', '[locale]', pagina, 'page.tsx')), `${g.slug}: ${caminho}`);
      }
    }
  }
});

test('só fotos reais do site, com texto alternativo', () => {
  for (const g of TODOS) {
    for (const f of fotos(g)) {
      assert.ok(existsSync(path.join('public', f)), f);
      assert.ok(ALT_FOTOS[f], f);
    }
  }
});

test('preço não vai no texto: quem mostra é o cartão, que nunca fica velho', () => {
  for (const g of TODOS) {
    for (const t of textos(g)) assert.doesNotMatch(t, /R\$|US\$/, `${g.slug}: ${t.slice(0, 50)}`);
  }
});

test('nenhuma urgência falsa nem contagem inventada', () => {
  for (const g of TODOS) {
    for (const t of textos(g))
      assert.doesNotMatch(t, /últimos lugares|últimas plazas|miles de|\d+ clientes/i, `${g.slug}: ${t.slice(0, 50)}`);
  }
});

test('a resposta e o resumo vão para o Google como texto puro: sem link', () => {
  for (const g of TODOS) {
    for (const t of [g.resumo, g.descricao, ...g.perguntas.map((f) => f.r)]) assert.doesNotMatch(t, /\]\(/, `${g.slug}: ${t.slice(0, 50)}`);
  }
});

test('todo guia está em um grupo da lista e leva a três outros guias', () => {
  const nosGrupos = GRUPOS_GUIAS.flatMap((grupo) => grupo.guias);
  assert.deepEqual([...nosGrupos].sort(), [...slugs].sort());
  for (const g of GUIAS) {
    assert.equal(g.relacionados.length, 3, g.slug);
    assert.equal(new Set(g.relacionados).size, 3, g.slug);
    for (const r of g.relacionados) assert.ok(slugs.has(r) && r !== g.slug, `${g.slug}: ${r}`);
  }
});

test('a frase do cartão é curta e a tabela tem todas as colunas', () => {
  for (const g of TODOS) {
    assert.ok(g.chamada.length <= 55, g.chamada);
    for (const s of g.secoes) {
      for (const linha of s.tabela?.linhas ?? []) assert.equal(linha.length, s.tabela?.colunas.length, `${g.slug}: ${linha[0]}`);
    }
  }
});

test('o guia tem perguntas com resposta e a ficha cabe em duas linhas', () => {
  for (const g of TODOS) {
    assert.ok(g.perguntas.length >= 3, g.slug);
    assert.ok(g.ficha.length <= 4, g.slug);
  }
});
