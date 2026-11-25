import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IDIOMAS } from '../src/i18n/config.ts';
import { dicionario } from '../src/i18n/index.ts';
import { garantiasDoCheckout } from '../src/lib/garantias-checkout.ts';

// O checkout (Pacote 27): as garantias que o site já mostra no passeio aparecem embaixo do botão de pagar, e as
// sugestões ("Combina con tu viaje") vão para depois dele, sem ficar entre o cliente e o pagamento.

const ES = dicionario('es').passeio.garantiasOnline;

test('com passeio e pagamento pelo site: cancelamento grátis, reembolso pelo tempo e voucher na hora', () => {
  assert.deepEqual(garantiasDoCheckout(ES, { temPasseio: true, voucherNaHora: true }), [
    ['cancelar', 'Cancelación gratis hasta 24 h antes'],
    ['chuva', 'Reembolso si el clima cancela'],
    ['voucher', 'Voucher al instante'],
  ]);
});

test('carrinho só de transfer: sem a linha do tempo; o cancelamento grátis vale sempre', () => {
  assert.deepEqual(garantiasDoCheckout(ES, { temPasseio: false, voucherNaHora: true }), [
    ['cancelar', 'Cancelación gratis hasta 24 h antes'],
    ['voucher', 'Voucher al instante'],
  ]);
});

test('com o botão do WhatsApp (sem pagamento pelo site), o voucher na hora não é prometido', () => {
  assert.deepEqual(
    garantiasDoCheckout(ES, { temPasseio: true, voucherNaHora: false }).map(([i]) => i),
    ['cancelar', 'chuva'],
  );
  assert.deepEqual(
    garantiasDoCheckout(ES, { temPasseio: false, voucherNaHora: false }).map(([i]) => i),
    ['cancelar'],
  );
});

test('as frases vêm do dicionário nos 4 idiomas, sem nenhuma nova', () => {
  for (const idioma of IDIOMAS) {
    const frases = dicionario(idioma).passeio.garantiasOnline;
    const linhas = garantiasDoCheckout(frases, { temPasseio: true, voucherNaHora: true });
    assert.equal(linhas.length, 3, idioma);
    assert.deepEqual(
      linhas.map(([, f]) => f),
      [...frases],
      idioma,
    );
    assert.ok(
      linhas.every(([, f]) => f.trim().length > 5),
      idioma,
    );
  }
  assert.equal(dicionario('pt').passeio.garantiasOnline[0], 'Cancelamento grátis até 24 h antes');
  assert.equal(dicionario('en').passeio.garantiasOnline[2], 'Instant voucher');
  assert.equal(dicionario('es-ar').passeio.garantiasOnline[1], 'Reembolso si el clima cancela');
});

test('no resumo do checkout, a ordem é: total, botão de pagar, garantias e só depois as sugestões', () => {
  const fonte = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  const resumo = fonte.slice(fonte.indexOf('{/* RESUMO */}'));
  const posicoes = [
    resumo.indexOf('brl(valorDaForma(totais, destaque))'),
    resumo.indexOf('fmt(C.pagar,'),
    resumo.indexOf('C.finalizarWhatsapp'),
    resumo.indexOf('garantiasDoCheckout(textos.garantias'),
    resumo.indexOf('{K.umPagamento}'),
    resumo.indexOf('<SugestoesCarrinho'),
    resumo.indexOf('</aside>'),
  ];
  assert.ok(
    posicoes.every((p) => p > 0),
    String(posicoes),
  );
  assert.deepEqual(
    [...posicoes].sort((a, b) => a - b),
    posicoes,
  );
  assert.equal(fonte.match(/<SugestoesCarrinho/g)?.length, 1);
  // o voucher na hora só com o botão "Pagar" (o mesmo "online && forma" que escolhe o botão)
  assert.match(fonte, /garantiasDoCheckout\(textos\.garantias, \{ temPasseio, voucherNaHora: online && forma !== null \}\)/);
  assert.match(fonte, /\{online && forma \? \(\s+<button type="submit" className="botao w-full"/);
  // a página passa as frases do quadro do passeio
  const pagina = readFileSync(path.join('src', 'app', '[locale]', 'checkout', 'page.tsx'), 'utf8');
  assert.match(pagina, /garantias: d\.passeio\.garantiasOnline,/);
});
