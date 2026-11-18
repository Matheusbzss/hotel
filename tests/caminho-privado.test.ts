import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caminhoPrivado } from '../src/lib/caminho-privado.ts';

test('as páginas do pedido e do voucher são particulares, em qualquer idioma', () => {
  const particulares = [
    '/pedido/ABC',
    '/reserva/ABC',
    '/es/pedido/ABC',
    '/es-ar/reserva/ABC',
    '/en/reserva/ABC',
    // o caminho como o servidor o vê, depois de o proxy pôr o idioma
    '/pt/pedido/ABC',
    '/pedido',
    '/pedido/ABC/',
    '/pedido/ABC?t=token-do-cliente',
    '/reserva/ABC#voucher',
    '/Pedido/ABC',
  ];
  for (const caminho of particulares) assert.equal(caminhoPrivado(caminho), true, caminho);
});

test('as páginas públicas e as rotas da API não são particulares', () => {
  const publicas = [
    '',
    '/',
    '/es',
    '/es-ar',
    '/passeios/escuna-buzios',
    '/es/paseos/goleta-buzios',
    '/en/tours/schooner-buzios',
    '/checkout',
    '/es/checkout',
    '/transfer/checkout',
    '/api/pedido/ABC',
    '/api/reservas/ABC',
    '/pedidos-antigos',
    '/reservas',
    '/politica-de-privacidade',
    '/en/contact',
  ];
  for (const caminho of publicas) assert.equal(caminhoPrivado(caminho), false, caminho);
});
