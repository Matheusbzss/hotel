import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PASSEIOS } from '../src/data/passeios.ts';
import { IDIOMAS, rota, semIdioma } from '../src/i18n/config.ts';

// As páginas em espanhol e inglês têm endereço próprio. Um endereço errado aqui é um link quebrado ou uma página
// fora do Google, então o caminho de ida e o de volta são conferidos em todas as páginas do site.

const SECOES = [
  '/',
  '/passeios',
  '/transfer',
  '/contato',
  '/casas-de-temporada',
  '/politica-de-cancelamento',
  '/politica-de-privacidade',
  '/termos-de-uso',
];
const PAGINAS = [...SECOES, ...PASSEIOS.map((p) => `/passeios/${p.slug}`)];

test('o português segue sem prefixo e sem tradução', () => {
  assert.equal(rota('pt', '/passeios/escuna-buzios'), '/passeios/escuna-buzios');
  assert.equal(rota('pt', '/'), '/');
  assert.equal(rota('pt', 'contato'), '/contato');
});

test('espanhol e inglês usam as palavras de cada idioma', () => {
  assert.equal(rota('es', '/'), '/es');
  assert.equal(rota('en', '/'), '/en');
  assert.equal(rota('es', '/passeios'), '/es/paseos');
  assert.equal(rota('en', '/passeios'), '/en/tours');
  assert.equal(rota('es', '/passeios/escuna-buzios'), '/es/paseos/goleta-buzios');
  assert.equal(rota('en', '/passeios/escuna-buzios'), '/en/tours/schooner-buzios');
  assert.equal(rota('es', '/passeios/mergulho-arraial-do-cabo'), '/es/paseos/buceo-arraial-do-cabo');
  assert.equal(rota('es', '/transfer'), '/es/traslado');
  assert.equal(rota('en', '/transfer'), '/en/transfer');
  assert.equal(rota('en', '/casas-de-temporada/casa-azul'), '/en/holiday-homes/casa-azul');
  assert.equal(rota('es', '/termos-de-uso'), '/es/terminos-de-uso');
});

test('o espanhol da Argentina usa os mesmos endereços do espanhol, só com o prefixo /es-ar', () => {
  assert.equal(rota('es-ar', '/'), '/es-ar');
  assert.equal(rota('es-ar', '/passeios'), '/es-ar/paseos');
  assert.equal(rota('es-ar', '/passeios/escuna-buzios'), '/es-ar/paseos/goleta-buzios');
  assert.equal(rota('es-ar', '/passeios/quadriciclo-buzios'), '/es-ar/paseos/cuatriciclo-buzios');
  assert.equal(rota('es-ar', '/transfer?destino=buzios'), '/es-ar/traslado?destino=buzios');
  assert.equal(rota('es-ar', '/guias/que-hacer-en-buzios'), '/es-ar/guias/que-hacer-en-buzios');
  for (const pagina of PAGINAS) assert.equal(rota('es-ar', pagina), `/es-ar${rota('es', pagina).slice(3)}`, pagina);
  // o /es-ar casa antes do /es: nunca vira "es" + "/-ar/paseos"
  assert.equal(semIdioma('/es-ar/paseos/goleta-buzios'), '/passeios/escuna-buzios');
  assert.equal(semIdioma('/es-ar'), '/');
  assert.equal(semIdioma('/es-ar/'), '/');
  assert.equal(semIdioma('/es/paseos'), '/passeios');
  assert.equal(semIdioma('/es-argentina/paseos'), '/es-argentina/paseos');
});

test('o que vem depois do endereço continua igual', () => {
  assert.equal(rota('es', '/transfer?destino=buzios'), '/es/traslado?destino=buzios');
  assert.equal(rota('en', '/passeios?tipo=barco&cidade=buzios'), '/en/tours?tipo=barco&cidade=buzios');
  assert.equal(rota('es', '/#passeios'), '/es#passeios');
  assert.equal(rota('es', '/passeios/escuna-buzios#reservar'), '/es/paseos/goleta-buzios#reservar');
});

test('páginas privadas não mudam de nome', () => {
  assert.equal(rota('es', '/checkout'), '/es/checkout');
  assert.equal(rota('en', '/pedido/ON-ABC123'), '/en/pedido/ON-ABC123');
  assert.equal(rota('es', '/reserva/ON-ABC123'), '/es/reserva/ON-ABC123');
  assert.equal(rota('es', '/transfer/checkout'), '/es/traslado/checkout');
});

test('de qualquer idioma se volta para a página em português', () => {
  for (const pagina of PAGINAS) {
    for (const idioma of IDIOMAS) assert.equal(semIdioma(rota(idioma, pagina)), pagina, `${idioma} ${pagina}`);
  }
});

test('o endereço antigo cai na mesma página do novo', () => {
  for (const pagina of PAGINAS.filter((p) => p !== '/')) {
    assert.equal(semIdioma(`/es${pagina}`), pagina, `/es${pagina}`);
    assert.equal(semIdioma(`/es-ar${pagina}`), pagina, `/es-ar${pagina}`);
    assert.equal(semIdioma(`/en${pagina}`), pagina, `/en${pagina}`);
  }
  assert.equal(semIdioma('/pt/passeios'), '/passeios');
});

test('nenhum idioma tem dois passeios no mesmo endereço', () => {
  for (const idioma of IDIOMAS) {
    const enderecos = PAGINAS.map((p) => rota(idioma, p));
    assert.equal(new Set(enderecos).size, enderecos.length, idioma);
  }
});

test('todo endereço usa só letras simples, números e hífen', () => {
  for (const idioma of IDIOMAS) {
    for (const pagina of PAGINAS) assert.match(rota(idioma, pagina), /^\/[a-z0-9/-]*$/, `${idioma} ${pagina}`);
  }
});

test('cada seção tem a sua pasta em src/app/[locale]', () => {
  for (const secao of SECOES.filter((s) => s !== '/')) {
    assert.ok(existsSync(path.join('src', 'app', '[locale]', secao.slice(1), 'page.tsx')), secao);
  }
});
