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
// Pacote 34 (P7): a 4ª garantia, a do pagamento seguro, com o escudo (a mesma do quadro do passeio)
const SEGURO = dicionario('es').passeio.pagoSeguroOnline;

test('com passeio e pagamento pelo site: cancelamento grátis, reembolso pelo tempo, voucher na hora e pagamento seguro', () => {
  assert.deepEqual(garantiasDoCheckout(ES, { temPasseio: true, voucherNaHora: true, pagoSeguro: SEGURO }), [
    ['cancelar', 'Cancelación gratis hasta 24 h antes'],
    // Pacote 34 (P11): "el clima cancela" soava traduzido do português
    ['chuva', 'Reembolso si se cancela por mal tiempo'],
    ['voucher', 'Voucher al instante'],
    ['pagamento', 'Pago seguro con Pix o tarjeta'],
  ]);
  // sem a frase do pagamento seguro, as três de antes
  assert.deepEqual(
    garantiasDoCheckout(ES, { temPasseio: true, voucherNaHora: true }).map(([i]) => i),
    ['cancelar', 'chuva', 'voucher'],
  );
});

test('carrinho só de transfer: sem a linha do tempo; o cancelamento grátis vale sempre', () => {
  assert.deepEqual(garantiasDoCheckout(ES, { temPasseio: false, voucherNaHora: true }), [
    ['cancelar', 'Cancelación gratis hasta 24 h antes'],
    ['voucher', 'Voucher al instante'],
  ]);
});

test('com o botão do WhatsApp (sem pagamento pelo site), nem o voucher na hora nem o pagamento seguro são prometidos', () => {
  assert.deepEqual(
    garantiasDoCheckout(ES, { temPasseio: true, voucherNaHora: false, pagoSeguro: SEGURO }).map(([i]) => i),
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
    const seguro = dicionario(idioma).passeio.pagoSeguroOnline;
    const linhas = garantiasDoCheckout(frases, { temPasseio: true, voucherNaHora: true, pagoSeguro: seguro });
    assert.equal(linhas.length, 4, idioma);
    assert.deepEqual(
      linhas.map(([, f]) => f),
      [...frases, seguro],
      idioma,
    );
    assert.ok(
      linhas.every(([, f]) => f.trim().length > 5),
      idioma,
    );
  }
  assert.equal(dicionario('pt').passeio.garantiasOnline[0], 'Cancelamento grátis até 24 h antes');
  assert.equal(dicionario('en').passeio.garantiasOnline[2], 'Instant voucher');
  assert.equal(dicionario('es-ar').passeio.garantiasOnline[1], 'Reembolso si se cancela por mal tiempo');
  assert.equal(dicionario('es-ar').passeio.pagoSeguroOnline, 'Pago seguro con Pix o tarjeta');
});

test('no resumo do checkout, a ordem é: total, botão de pagar, garantias e só depois as sugestões', () => {
  const fonte = readFileSync(path.join('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'), 'utf8');
  const resumo = fonte.slice(fonte.indexOf('{/* RESUMO */}'));
  const posicoes = [
    resumo.indexOf('brl(valorDaForma(totais, destaque))'),
    resumo.indexOf('fmt(C.pagar,'),
    resumo.indexOf('C.finalizarWhatsapp'),
    resumo.indexOf('garantiasDoCheckout(textos.garantias'),
    resumo.indexOf('{umPagamento}'),
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
  // o voucher na hora e o pagamento seguro só com o botão "Pagar" (o mesmo "online && forma" que escolhe o botão)
  assert.match(
    fonte,
    /garantiasDoCheckout\(textos\.garantias, \{\s+temPasseio,\s+voucherNaHora: online && forma !== null,\s+pagoSeguro: textos\.pagoSeguro,\s+comCasa,\s+\}\)/,
  );
  // Pacote 34 (P7): "um pagamento só" e "o valor total" numa linha só; as duas frases separadas saíram dali
  assert.doesNotMatch(resumo, /\{K\.umPagamento\}|\{C\.avisoTotal\}/);
  assert.match(fonte, /\{online && forma \? \(\s+<button type="submit" className="botao w-full"/);
  // a página passa as frases do quadro do passeio
  const pagina = readFileSync(path.join('src', 'app', '[locale]', 'checkout', 'page.tsx'), 'utf8');
  assert.match(pagina, /garantias: d\.passeio\.garantiasOnline,/);
  assert.match(pagina, /pagoSeguro: d\.passeio\.pagoSeguroOnline,/);
});
