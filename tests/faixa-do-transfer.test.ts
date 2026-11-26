import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pacote 34 (conserto telas-e-idiomas-01, 26/11): no celular, a faixa sobre a foto do transfer (as etiquetas, o nome e o
// vidro do trajeto do link com o preço) ficou mais alta do que a foto de 46% da tela, que tinha a altura presa e cortava o
// que passava dela. A faixa ficava colada embaixo e crescia para cima: em tela baixa (iPhone SE, Android pequeno), com o
// trajeto comprido ou com a letra grande, as etiquetas e até o nome subiam para fora da foto e para trás da cápsula do menu.
// Agora a foto cresce junto com a faixa quando ela não cabe. Só leitura do código: as medidas ficaram nos prints.

const pagina = readFileSync(new URL('../src/app/[locale]/transfer/page.tsx', import.meta.url), 'utf8');

/** As classes do primeiro div que casa com o padrão (o grupo 1 é o className). */
function classes(padrao: RegExp): Set<string> {
  const achado = pagina.match(padrao);
  assert.ok(achado, `não achei ${padrao}`);
  return new Set(achado[1].split(/\s+/));
}

test('telas-e-idiomas-01: no celular, a foto do transfer cresce com a faixa em vez de cortá-la; no computador, nada muda', () => {
  // a moldura da foto do topo: o div logo antes da foto
  const foto = classes(/<div className="([^"]+)">\s+<Image\s+src=\{FOTO_TOPO_TRANSFER\}/);
  // 46% da tela no mínimo, sem altura presa: a faixa fica embaixo (justify-end) e, quando não cabe, a foto cresce
  for (const c of ['relative', 'flex', 'flex-col', 'justify-end', 'min-h-[46svh]', 'overflow-hidden', 'pt-6']) assert.ok(foto.has(c), c);
  assert.deepEqual(
    [...foto].filter((c) => /^h-/.test(c)),
    [],
    'a foto do celular não tem altura presa',
  );
  // no computador, a foto continua cobrindo o topo inteiro, sem a folga do celular
  for (const c of ['md:absolute', 'md:inset-0', 'md:min-h-0', 'md:pt-0']) assert.ok(foto.has(c), c);

  // a faixa do celular (a das etiquetas, a primeira da página): no fluxo da foto, por cima do véu, e não presa embaixo
  const faixa = classes(/<div className="([^"]+)">\s+\{\/\*[^]*?\*\/\}\s+<div className="flex flex-wrap gap-1\.5">\s+\{T\.etiquetas\.map/);
  for (const c of ['moldura', 'relative', 'pb-16', 'md:hidden']) assert.ok(faixa.has(c), c);
  for (const c of ['absolute', 'bottom-0', 'inset-x-0']) assert.ok(!faixa.has(c), `a faixa não cresce para cima (${c})`);
  // a foto e o véu continuam por baixo da faixa, do tamanho da moldura
  assert.match(pagina, /<div className="veu-baixo absolute inset-x-0 bottom-0 h-2\/3 md:hidden" aria-hidden="true" \/>/);
  assert.match(pagina, /src=\{FOTO_TOPO_TRANSFER\}[^>]*?\bfill\b/);
});
