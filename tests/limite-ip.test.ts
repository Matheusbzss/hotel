import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chaveDoLimite, contarEmMemoria, ipDaRequisicao, limparLimites, permitir, zerarLimitesEmMemoria } from '../src/lib/limite-ip.ts';

// Sem o endereço do Supabase o banco nem é carregado: tudo aqui roda em memória, com a mesma regra da função SQL.
delete process.env.SUPABASE_URL;

const T0 = new Date('2026-11-09T15:00:00Z');
const depois = (segundos: number) => new Date(T0.getTime() + segundos * 1000);

test('até o limite passa; o acesso seguinte não; a janela recomeça quando vence', async () => {
  zerarLimitesEmMemoria();
  const chave = chaveDoLimite('pedido', '203.0.113.9');
  assert.equal(await permitir(chave, 3, 60, T0), true);
  assert.equal(await permitir(chave, 3, 60, depois(10)), true);
  assert.equal(await permitir(chave, 3, 60, depois(20)), true);
  assert.equal(await permitir(chave, 3, 60, depois(30)), false);
  assert.equal(await permitir(chave, 3, 60, depois(59)), false);
  // 60 s depois do primeiro acesso a janela venceu: começa a contar de novo
  assert.equal(await permitir(chave, 3, 60, depois(60)), true);
  assert.equal(await permitir(chave, 3, 60, depois(61)), true);
});

test('cada chave conta sozinha: outro IP ou outra rota não sofrem', async () => {
  zerarLimitesEmMemoria();
  const a = chaveDoLimite('pedido', '203.0.113.9');
  const b = chaveDoLimite('pedido', '198.51.100.7');
  const c = chaveDoLimite('carrinho', '203.0.113.9');
  assert.equal(await permitir(a, 1, 60, T0), true);
  assert.equal(await permitir(a, 1, 60, T0), false);
  assert.equal(await permitir(b, 1, 60, T0), true);
  assert.equal(await permitir(c, 1, 60, T0), true);
});

test('a contagem em memória segue a regra da função SQL: recomeça do 1 quando a janela venceu', () => {
  zerarLimitesEmMemoria();
  assert.equal(contarEmMemoria('x', 60, T0.getTime()), 1);
  assert.equal(contarEmMemoria('x', 60, T0.getTime() + 1000), 2);
  assert.equal(contarEmMemoria('x', 60, T0.getTime() + 59_999), 3);
  assert.equal(contarEmMemoria('x', 60, T0.getTime() + 60_000), 1);
});

test('a limpeza apaga só as janelas paradas há mais de um dia', async () => {
  zerarLimitesEmMemoria();
  await permitir('velha', 5, 60, T0);
  await permitir('recente', 5, 60, depois(23 * 3600));
  assert.equal(await limparLimites(depois(25 * 3600)), 1);
  // a chave apagada começa do zero; a recente continua contando
  assert.equal(await permitir('velha', 1, 60, depois(25 * 3600)), true);
  assert.equal(await permitir('recente', 1, 60, depois(23 * 3600 + 10)), false);
  assert.equal(await limparLimites(depois(25 * 3600)), 0);
});

test('a chave junta a rota e o IP; sem IP, todos caem na mesma chave', () => {
  assert.equal(chaveDoLimite('pedido', ' 203.0.113.9 '), 'pedido:203.0.113.9');
  assert.equal(chaveDoLimite('pedido', null), 'pedido:sem-ip');
  assert.equal(chaveDoLimite('pedido', ''), 'pedido:sem-ip');
});

test('o IP vem do primeiro x-forwarded-for, ou do x-real-ip', () => {
  assert.equal(ipDaRequisicao(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })), '203.0.113.9');
  assert.equal(ipDaRequisicao(new Headers({ 'x-real-ip': '198.51.100.7' })), '198.51.100.7');
  assert.equal(ipDaRequisicao(new Headers()), null);
});
