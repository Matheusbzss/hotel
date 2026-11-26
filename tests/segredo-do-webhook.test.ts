import assert from 'node:assert/strict';
import { test } from 'node:test';
import { segredoDoWebhook } from '../src/lib/stripe.ts';

// Em 24/11/2026, no dia de ligar, o segredo colado na Vercel foi junto com um espaço: a Stripe recusou toda assinatura
// ("The provided signing secret contains whitespace") e o pedido só virou pago pela consulta da página.
test('o segredo do webhook perde o espaço e a quebra de linha das pontas (colados junto na Vercel)', () => {
  assert.equal(segredoDoWebhook('whsec_abc123'), 'whsec_abc123');
  assert.equal(segredoDoWebhook(' whsec_abc123'), 'whsec_abc123');
  assert.equal(segredoDoWebhook('whsec_abc123\n'), 'whsec_abc123');
  assert.equal(segredoDoWebhook('\twhsec_abc123 \r\n'), 'whsec_abc123');
});

test('segredo vazio ou só de espaços conta como não configurado', () => {
  assert.equal(segredoDoWebhook(''), undefined);
  assert.equal(segredoDoWebhook('   \n'), undefined);
});
