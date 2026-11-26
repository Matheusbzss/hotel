import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EMAILS_AUTOMATICOS, fraseDosEmails, listaEmFrase, nomesDosEmails } from '../src/lib/email/lista-dos-emails.ts';

// Pacote 33, D4: o cartão "E-mails automáticos" das estatísticas (src/app/admin/estatisticas/page.tsx) dizia que saíam só
// "Pedido recebido, pagamento aprovado com os vouchers, Pix vencido, link do pedido e … lembretes"; na conferência da
// Etapa 6 o dono pensaria que os e-mails de reembolso e de cancelamento estavam desligados. Agora o cartão lê a lista de
// src/lib/email/lista-dos-emails.ts, que é um Record de TipoEmail: um tipo de e-mail novo não passa no tsc sem entrar nela.

const fonte = (...partes: string[]) => readFileSync(path.join('src', ...partes), 'utf8').replace(/\r/g, '');

test('a lista tem todo tipo de e-mail do site, e só eles', () => {
  // os tipos da união TipoEmail, lidos do código (o tsc já garante o mesmo pelo Record)
  const uniao = fonte('lib', 'email', 'mensagens.ts').match(/export type TipoEmail =([^;]*);/);
  assert.ok(uniao, 'a união TipoEmail');
  const tipos = [...uniao[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(Object.keys(EMAILS_AUTOMATICOS).sort(), tipos);
  // e cada tipo que o envio usa de verdade está na lista
  const envios = fonte('lib', 'email', 'pedidos.ts') + fonte('lib', 'carrinho-lembretes.ts');
  for (const m of envios.matchAll(/tipo: '([a-z0-9-]+)',/g)) assert.ok(m[1] in EMAILS_AUTOMATICOS, m[1]);
  // os de equipe são os que vão para o e-mail das respostas (o nome termina em -equipe)
  for (const [tipo, e] of Object.entries(EMAILS_AUTOMATICOS)) assert.equal(e.para === 'equipe', tipo.endsWith('-equipe'), tipo);
});

test('as frases do cartão: ao cliente e à equipe, com os de reembolso, cancelamento e desistência, e os lembretes uma vez', () => {
  const cliente = fraseDosEmails('cliente', 30);
  // desde os passos 2 e 3 do Pacote 33, também os dois do cancelamento sem reembolso pela equipe
  assert.equal(
    cliente,
    'pedido recebido, pagamento aprovado com os vouchers, Pix vencido, link do pedido, confirmação do pedido de desistência, ' +
      'reembolso (confirmado ou a caminho), reembolso concluído, pedido cancelado, pedido cancelado sem reembolso, ' +
      'voucher cancelado sem reembolso e até 30 lembretes de carrinho por dia',
  );
  assert.equal(
    fraseDosEmails('equipe', 30),
    'pedido pago, pedido de desistência, reembolso que falhou e pagamento que chegou num pedido cancelado',
  );
  // os dois lembretes têm o mesmo nome e aparecem uma vez
  assert.equal(nomesDosEmails('cliente').filter((n) => n.includes('lembretes')).length, 1);
  assert.equal(listaEmFrase([]), '');
  assert.equal(listaEmFrase(['a']), 'a');
  assert.equal(listaEmFrase(['a', 'b']), 'a e b');
  // nenhum nome de e-mail promete estorno nem reembolso automático
  for (const e of Object.values(EMAILS_AUTOMATICOS)) assert.doesNotMatch(e.nome, /estorno automático|devolvemos sozinhos/);
});

test('o cartão das estatísticas usa a lista (e não a frase antiga), com o limite de lembretes do dia', () => {
  const pagina = fonte('app', 'admin', 'estatisticas', 'page.tsx');
  assert.match(pagina, /Ao cliente, no idioma da compra: \{fraseDosEmails\('cliente', LEMBRETES_POR_DIA\)\}\./);
  assert.match(pagina, /À equipe, em português, no e-mail das respostas: \{fraseDosEmails\('equipe', LEMBRETES_POR_DIA\)\}\./);
  assert.doesNotMatch(pagina, /Pedido recebido, pagamento aprovado com os vouchers, Pix vencido, link do pedido e até/);
  assert.match(pagina, /<Cartao titulo="E-mails automáticos" nota="O que sai sozinho para o cliente e para a equipe">/);
});
