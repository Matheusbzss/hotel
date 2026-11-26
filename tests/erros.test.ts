import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensagemDoErro } from '../src/lib/erros.ts';

test('mensagemDoErro: só o texto e o código, nunca os detalhes do banco', () => {
  const doBanco = {
    message: 'new row for relation "pedidos" violates check constraint "pedidos_status_check"',
    code: '23514',
    details: 'Failing row contains (Maria Silva, maria@exemplo.com, +5511999999999)',
    hint: null,
  };
  const m = mensagemDoErro(doBanco);
  assert.equal(m, 'new row for relation "pedidos" violates check constraint "pedidos_status_check" (23514)');
  assert.ok(!m.includes('maria@exemplo.com'));
  assert.equal(mensagemDoErro(new Error('falhou')), 'falhou');
  assert.equal(mensagemDoErro({}), 'erro sem mensagem');
  assert.equal(mensagemDoErro('texto'), 'texto');
});
