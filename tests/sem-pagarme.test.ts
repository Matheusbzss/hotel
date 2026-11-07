import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// A Pagar.me saiu de tudo o que o cliente lê. O código dela fica parado até as Etapas 4 e 5 da Fase 4.

const PASTAS = [path.join('src', 'i18n'), path.join('src', 'content'), path.join('src', 'data')];
const PAGARME = /pagar\.?me/i;

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    return e.isDirectory() ? arquivos(caminho) : [caminho];
  });
}

test('nenhum texto do site fala em Pagar.me', () => {
  const achados = PASTAS.flatMap(arquivos).flatMap((arquivo) =>
    readFileSync(arquivo, 'utf8')
      .split('\n')
      .flatMap((linha, i) => (PAGARME.test(linha) ? [`${arquivo}:${i + 1}: ${linha.trim().slice(0, 120)}`] : [])),
  );
  assert.deepEqual(achados, []);
});
