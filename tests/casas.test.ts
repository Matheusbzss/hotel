import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASAS, type Casa } from '../src/data/casas.ts';
import { SINAL_PORCENTO, diariaDaNoite, faixasDaEstadia, menorDiaria, noitesEntre, orcamentoCasa } from '../src/lib/diarias.ts';

// casa fictícia, só para conferir as contas (o site não tem casas inventadas)
const TESTE: Casa = {
  slug: 'casa-de-teste',
  cidade: 'buzios',
  nome: { pt: 'Teste', en: 'Test', es: 'Prueba' },
  local: { pt: 'Praia', en: 'Beach', es: 'Playa' },
  endereco: 'Rua de teste, 1',
  pontoAproximado: { lat: -22.75, lng: -41.88 },
  resumo: { pt: '', en: '', es: '' },
  descricao: { pt: '', en: '', es: '' },
  quartos: 5,
  suites: 5,
  banheiros: 6,
  capacidade: 12,
  camas: { pt: [], en: [], es: [] },
  comodidades: { pt: [], en: [], es: [] },
  regras: { pt: [], en: [], es: [] },
  cancelamento: { pt: [], en: [], es: [] },
  checkIn: '15h',
  checkOut: '11h',
  diaria: 1000,
  minimoNoites: 2,
  temporadas: [{ nome: { pt: 'Alta', en: 'High', es: 'Alta' }, de: '2026-12-15', ate: '2027-02-28', diaria: 1500, minimoNoites: 3 }],
  feriados: [
    { nome: { pt: 'Réveillon', en: 'New Year', es: 'Año Nuevo' }, de: '2026-12-29', ate: '2027-01-01', diaria: 3000, minimoNoites: 5 },
  ],
  taxaLimpeza: 400,
  caucao: 2000,
  fotos: [],
};

test('o site não tem casas inventadas', () => {
  assert.equal(CASAS.length, 0);
});

test('as noites vão da chegada até a véspera da saída', () => {
  assert.deepEqual(noitesEntre('2026-11-10', '2026-11-13'), ['2026-11-10', '2026-11-11', '2026-11-12']);
  assert.deepEqual(noitesEntre('2026-11-10', '2026-11-10'), []);
  assert.deepEqual(noitesEntre('2026-12-31', '2027-01-02'), ['2026-12-31', '2027-01-01']);
});

test('a diária: feriado, senão temporada, senão a normal', () => {
  assert.equal(diariaDaNoite(TESTE, '2026-11-10').diaria, 1000);
  assert.equal(diariaDaNoite(TESTE, '2026-12-20').diaria, 1500);
  assert.equal(diariaDaNoite(TESTE, '2026-12-31').diaria, 3000);
  assert.equal(diariaDaNoite(TESTE, '2027-01-02').diaria, 1500);
});

test('o total, o sinal de 50% e o restante', () => {
  const o = orcamentoCasa(TESTE, '2026-11-10', '2026-11-13');
  assert.equal(SINAL_PORCENTO, 50);
  assert.equal(o.diarias, 3000);
  assert.equal(o.total, 3400);
  assert.equal(o.sinal, 1700);
  assert.equal(o.restante, 1700);
  assert.equal(o.ok, true);
});

test('estadia que cruza a temporada e o feriado, com o mínimo de noites mais alto', () => {
  // 27 e 28 na alta (1500), 29 a 31 no réveillon (3000)
  const o = orcamentoCasa(TESTE, '2026-12-27', '2027-01-01');
  assert.equal(o.diarias, 1500 * 2 + 3000 * 3);
  assert.equal(o.minimoNoites, 5);
  assert.equal(o.ok, true);
  const curta = orcamentoCasa(TESTE, '2026-12-30', '2027-01-01');
  assert.equal(curta.ok, false);
  assert.equal(curta.motivo, 'minimo');
});

test('sem noites, não há orçamento', () => {
  const o = orcamentoCasa(TESTE, '2026-11-10', '2026-11-10');
  assert.equal(o.ok, false);
  assert.equal(o.motivo, 'datas');
  assert.equal(o.total, 0);
});

test('as faixas de preço do resumo', () => {
  const o = orcamentoCasa(TESTE, '2026-12-27', '2027-01-02');
  assert.deepEqual(faixasDaEstadia(o), [
    { noites: 2, diaria: 1500 },
    { noites: 4, diaria: 3000 },
  ]);
});

test('a diária a partir de é a menor de todas as épocas', () => {
  assert.equal(menorDiaria(TESTE), 1000);
  assert.equal(menorDiaria({ ...TESTE, temporadas: [{ ...TESTE.temporadas[0], diaria: 800 }] }), 800);
  assert.equal(menorDiaria({ ...TESTE, temporadas: [], feriados: [] }), 1000);
});
