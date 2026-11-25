import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ESPERA_FOTOS_DA_GALERIA, fotoMontada, liberarDepoisDaEspera } from '../src/lib/galeria.ts';

// A galeria do topo do passeio e o trilho de fotos da casa no celular baixam só a 1ª foto no carregamento
// (Pacote 27): as outras disputavam a conexão com ela, que é a foto principal da página.

test('no carregamento, só a 1ª foto entra na página; liberadas, entram todas', () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => fotoMontada(i, false)),
    [true, false, false, false],
  );
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => fotoMontada(i, true)),
    [true, true, true, true],
  );
});

test('a garantia libera as outras fotos depois de uns 4 s, e a limpeza cancela', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(ESPERA_FOTOS_DA_GALERIA, 4000);
  let liberou = 0;
  liberarDepoisDaEspera(() => liberou++);
  t.mock.timers.tick(ESPERA_FOTOS_DA_GALERIA - 1);
  assert.equal(liberou, 0);
  t.mock.timers.tick(1);
  assert.equal(liberou, 1);
  // o efeito desmontado (ou já liberado por um toque) não libera de novo
  const limpar = liberarDepoisDaEspera(() => liberou++);
  limpar();
  t.mock.timers.tick(ESPERA_FOTOS_DA_GALERIA * 2);
  assert.equal(liberou, 1);
});

const GALERIAS = [path.join('src', 'components', 'GaleriaPasseio.tsx'), path.join('src', 'components', 'casas', 'GaleriaCasa.tsx')];

test('as duas galerias seguram as fotos 2 em diante e as liberam no onLoad da 1ª, no toque, no deslize e na espera', () => {
  for (const arquivo of GALERIAS) {
    const fonte = readFileSync(arquivo, 'utf8');
    // a foto do trilho só é montada quando fotoMontada deixa
    assert.match(fonte, /\{fotoMontada\(i, liberadas\) && \(\s+<Image/, arquivo);
    // a 1ª continua pré-carregada, com prioridade alta, e avisa quando termina
    assert.match(fonte, /preload=\{i === 0\}/, arquivo);
    assert.match(fonte, /fetchPriority=\{i === 0 \? 'high' : undefined\}/, arquivo);
    assert.match(fonte, /onLoad=\{i === 0 \? liberar : undefined\}/, arquivo);
    // o primeiro toque ou deslize do trilho libera
    assert.match(fonte, /onScroll=\{\(e\) => \{\s+liberar\(\);/, arquivo);
    assert.match(fonte, /onPointerDown=\{liberar\}/, arquivo);
    assert.match(fonte, /onTouchStart=\{liberar\}/, arquivo);
    // a garantia dos 4 s, que para de contar quando já liberou
    assert.match(fonte, /useEffect\(\(\) => \(liberadas \|\| \w+(\.length)? < 2 \? undefined : liberarDepoisDaEspera\(/, arquivo);
    // o estado começa fechado
    assert.match(fonte, /useState\(false\);\s+const liberar = \(\) => setLiberadas\(true\);/, arquivo);
  }
});

test('a tela cheia do passeio continua mostrando a foto aberta, sem esperar a liberação', () => {
  const fonte = readFileSync(GALERIAS[0], 'utf8');
  assert.match(
    fonte,
    /<Image src=\{fotos\[aberta\]\} alt=\{alts\[aberta\]\} fill sizes="100vw" quality=\{85\} className="object-contain" \/>/,
  );
  assert.equal(fonte.match(/fotoMontada\(/g)?.length, 1);
});
