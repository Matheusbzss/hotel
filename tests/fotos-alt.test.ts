import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { ALT_FOTOS } from '../src/data/fotos-alt.ts';

// Toda foto do site tem texto alternativo nos três idiomas: é o que o Google lê e o que o leitor de tela fala.

function fotos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return fotos(caminho);
    return /\.(jpe?g|png|webp)$/i.test(nome)
      ? [
          caminho
            .split(path.sep)
            .join('/')
            .replace(/^public/, ''),
        ]
      : [];
  });
}

test('toda foto de public/fotos tem texto alternativo', () => {
  const faltando = fotos(path.join('public', 'fotos')).filter((f) => !ALT_FOTOS[f]);
  assert.deepEqual(faltando, []);
});

test('a lista não fala de foto que saiu do site', () => {
  const sobrando = Object.keys(ALT_FOTOS).filter((f) => !existsSync(path.join('public', f)));
  assert.deepEqual(sobrando, []);
});

test('cada texto existe nos três idiomas, traduzido, e cabe no que o leitor de tela fala de uma vez', () => {
  for (const [foto, alt] of Object.entries(ALT_FOTOS)) {
    for (const idioma of ['pt', 'en', 'es'] as const) {
      assert.ok(alt[idioma].trim().length >= 15, `${foto} ${idioma}`);
      assert.ok(alt[idioma].length <= 110, `${foto} ${idioma}: ${alt[idioma].length} caracteres`);
      assert.doesNotMatch(alt[idioma], /^(foto|imagem|image|imagen)\b/i, `${foto} ${idioma}`);
    }
    assert.notEqual(alt.pt, alt.en, foto);
    assert.notEqual(alt.pt, alt.es, foto);
  }
});

test('nenhuma foto repete o texto de outra', () => {
  for (const idioma of ['pt', 'en', 'es'] as const) {
    const textos = Object.values(ALT_FOTOS).map((a) => a[idioma]);
    assert.equal(new Set(textos).size, textos.length, idioma);
  }
});
