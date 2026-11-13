import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESLOCAMENTO_MAXIMO_M,
  DESLOCAMENTO_MINIMO_M,
  RAIO_CIRCULO_M,
  casaDentroDoCirculo,
  centroDoCirculo,
  distanciaMetros,
  sortearDeslocamento,
} from '../src/lib/circulo-casa.ts';

// Um ponto qualquer em Búzios, só para a conta (não é o de nenhuma casa).
const PONTO = { lat: -22.7612, lng: -41.8853 };

test('o deslocamento máximo é menor que o raio: a casa fica sempre dentro do círculo', () => {
  assert.equal(RAIO_CIRCULO_M, 500);
  assert.ok(DESLOCAMENTO_MINIMO_M === 150 && DESLOCAMENTO_MAXIMO_M === 350);
  assert.ok(DESLOCAMENTO_MAXIMO_M < RAIO_CIRCULO_M);
});

test('o centro fica exatamente à distância sorteada, na direção sorteada', () => {
  for (const metros of [150, 200, 275.5, 349.99]) {
    for (let direcaoGraus = 0; direcaoGraus < 360; direcaoGraus += 22.5) {
      const centro = centroDoCirculo(PONTO, { metros, direcaoGraus });
      assert.ok(Math.abs(distanciaMetros(PONTO, centro) - metros) < 0.01, `${metros} m a ${direcaoGraus}°`);
      assert.ok(casaDentroDoCirculo(PONTO, centro));
    }
  }
  // 0° é norte (a latitude sobe) e 90° é leste (a longitude sobe)
  const norte = centroDoCirculo(PONTO, { metros: 300, direcaoGraus: 0 });
  assert.ok(norte.lat > PONTO.lat && Math.abs(norte.lng - PONTO.lng) < 1e-9);
  const leste = centroDoCirculo(PONTO, { metros: 300, direcaoGraus: 90 });
  assert.ok(leste.lng > PONTO.lng);
  const sul = centroDoCirculo(PONTO, { metros: 300, direcaoGraus: 180 });
  assert.ok(sul.lat < PONTO.lat);
});

test('mudar o alfinete leva o centro junto, com o mesmo deslocamento', () => {
  const deslocamento = { metros: 240, direcaoGraus: 130 };
  const outroPonto = { lat: PONTO.lat + 0.001, lng: PONTO.lng - 0.002 };
  const a = centroDoCirculo(PONTO, deslocamento);
  const b = centroDoCirculo(outroPonto, deslocamento);
  // o vetor do centro anda o mesmo que o ponto (diferença de menos de 1 cm nessa escala)
  assert.ok(Math.abs(b.lat - a.lat - 0.001) < 1e-7);
  assert.ok(Math.abs(b.lng - a.lng + 0.002) < 1e-7);
});

test('o sorteio fica entre 150 e 350 m e entre 0 e 360 graus', () => {
  assert.deepEqual(
    sortearDeslocamento(() => 0),
    { metros: 150, direcaoGraus: 0 },
  );
  const quaseUm = sortearDeslocamento(() => 0.999999);
  assert.ok(quaseUm.metros < 350 && quaseUm.direcaoGraus < 360);
  for (let i = 0; i < 200; i++) {
    const s = sortearDeslocamento();
    assert.ok(s.metros >= DESLOCAMENTO_MINIMO_M && s.metros <= DESLOCAMENTO_MAXIMO_M);
    assert.ok(s.direcaoGraus >= 0 && s.direcaoGraus < 360);
    assert.ok(casaDentroDoCirculo(PONTO, centroDoCirculo(PONTO, s)));
  }
});
