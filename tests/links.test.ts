import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { PASSEIOS } from '../src/data/passeios.ts';

// Todo link escrito no código precisa levar a uma página que existe. O site inteiro, com os links de verdade,
// se confere com "npm run links"; este teste pega o link errado antes de publicar, sem precisar do servidor.

const PAGINAS = path.join('src', 'app', '[locale]');

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

/** O caminho leva a uma pasta com page.tsx, aceitando as pastas [slug] e [codigo] no lugar de um pedaço variável. */
function existe(caminho: string, pasta = PAGINAS): boolean {
  const [parte, ...resto] = caminho.split('/').filter(Boolean);
  if (!parte) return existsSync(path.join(pasta, 'page.tsx'));
  const certa = path.join(pasta, parte);
  if (!parte.includes('${') && existsSync(certa)) return existe(resto.join('/'), certa);
  const variavel = readdirSync(pasta).find((n) => /^\[[a-z]+\]$/.test(n));
  return variavel ? existe(resto.join('/'), path.join(pasta, variavel)) : false;
}

/** /reserva e /pedido são o começo do link, completado com o código do pedido; a reserva da casa abre na Fase 4. */
const PERMITIDOS = new Set(['/reserva', '/pedido', '/casas-de-temporada/${c.slug}/reservar']);

const CODIGO = arquivos('src').map((arquivo) => ({ arquivo, texto: readFileSync(arquivo, 'utf8') }));

test('todo caminho passado para rota() é uma página do site', () => {
  const errados: string[] = [];
  for (const { arquivo, texto } of CODIGO) {
    for (const m of texto.matchAll(/\brota\([^,()]+,\s*[`'"](\/[^`'"]*)[`'"]/g)) {
      const caminho = m[1].split(/[?#]/)[0];
      if (!existe(caminho) && !PERMITIDOS.has(caminho)) errados.push(`${arquivo}: ${m[1]}`);
    }
  }
  assert.deepEqual(errados, []);
});

test('nenhum link público é escrito à mão, sem rota()', () => {
  const soltos: string[] = [];
  for (const { arquivo, texto } of CODIGO.filter((c) => !c.arquivo.includes(path.join('app', 'admin')))) {
    for (const m of texto.matchAll(/\bhref=(?:"|\{[`'"])(\/[^"`'{}]*)/g)) {
      if (!/^\/(api|admin)(\/|$)/.test(m[1])) soltos.push(`${arquivo}: ${m[1]}`);
    }
  }
  assert.deepEqual(soltos, []);
});

test('toda página de passeio ativa tem um endereço válido', () => {
  for (const p of PASSEIOS.filter((x) => x.ativo !== false)) assert.ok(existe(`passeios/${p.slug}`), p.slug);
});
