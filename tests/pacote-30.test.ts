import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dicionario } from '../src/i18n/index.ts';

// Pacote 30 (decisões do dono de 25/11): no fim da compra, a caixa obrigatória "Li e aceito" dá lugar a uma frase logo
// acima do botão, com os links dos termos e da política; e no topo da inicial o cancelamento grátis vem primeiro.

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const IDIOMAS = ['pt', 'es', 'es-ar', 'en'] as const;

test('a frase do aceite nos 4 idiomas: com os dois links, uma vez cada, e sem a caixa antiga no dicionário', () => {
  const esperado = {
    pt: ['Ao pagar, você aceita os {termos} e a {politica}.', 'Ao continuar, você aceita os {termos} e a {politica}.'],
    es: ['Al pagar, aceptas los {termos} y la {politica}.', 'Al continuar, aceptas los {termos} y la {politica}.'],
    'es-ar': ['Al pagar, aceptás los {termos} y la {politica}.', 'Al continuar, aceptás los {termos} y la {politica}.'],
    en: ['By paying, you accept the {termos} and the {politica}.', 'By continuing, you accept the {termos} and the {politica}.'],
  } as const;
  for (const idioma of IDIOMAS) {
    const C = dicionario(idioma).checkout as Record<string, unknown>;
    assert.equal(C.aceiteAoPagar, esperado[idioma][0], idioma);
    assert.equal(C.aceiteAoContinuar, esperado[idioma][1], idioma);
    for (const frase of esperado[idioma]) {
      assert.equal(frase.match(/\{termos\}/g)?.length, 1, `${idioma}: ${frase}`);
      assert.equal(frase.match(/\{politica\}/g)?.length, 1, `${idioma}: ${frase}`);
    }
    // os nomes dos links continuam os de sempre
    assert.ok(String(C.aceiteTermos).length > 0 && String(C.aceitePolitica).length > 0, idioma);
    // a caixa antiga e o erro dela saíram
    assert.equal('aceitePre' in C, false, idioma);
    assert.equal('aceiteMeio' in C, false, idioma);
    assert.equal('aceite' in (C.erros as Record<string, unknown>), false, idioma);
  }
});

test('o fim da compra: sem a caixa, com a frase logo acima do botão, que aponta para ela (só leitura do código)', () => {
  const f = ler('src/components/carrinho/FormularioCarrinho.tsx');
  assert.doesNotMatch(f, /id="aceite"/);
  assert.doesNotMatch(f, /setAceite|C\.aceitePre|C\.aceiteMeio|erros\.aceite/);
  // a frase vem antes dos botões, no mesmo bloco, com a versão do botão "Pagar" ou a do WhatsApp
  assert.match(
    f,
    /<div className="space-y-3">[\s\S]*?<p id="aceite-frase" className="text-small text-\(--tinta-suave\)">\s+\{fraseDoAceite\(online && forma \? C\.aceiteAoPagar : C\.aceiteAoContinuar\)\}\s+<\/p>\s+\{online && forma \? \(/,
  );
  // os dois botões apontam para a frase
  assert.equal(f.match(/aria-describedby="aceite-frase"/g)?.length, 2);
  // os links dos termos e da política, em outra aba
  assert.match(f, /pedaco === '\{termos\}' \? \(\s+<Link key=\{n\} href=\{links\.termos\} target="_blank" className="link font-semibold">\s+\{C\.aceiteTermos\}/);
  assert.match(f, /pedaco === '\{politica\}' \? \(\s+<Link key=\{n\} href=\{links\.politica\} target="_blank" className="link font-semibold">\s+\{C\.aceitePolitica\}/);
  // o envio continua levando o aceite, e o servidor continua exigindo
  assert.match(f, /aceite: true,/);
  assert.match(ler('src/app/api/pedido/route.ts'), /aceite: z\.literal\(true\),/);
  // a Política de Privacidade continua no fim dos dados do cliente
  assert.match(f, /<Link href=\{links\.privacidade\} target="_blank" className="link font-semibold">\s+\{C\.emailPrivacidade\}/);
});

test('os termos de uso já dizem que a reserva é o aceite (nada a mudar no texto legal)', () => {
  assert.match(ler('src/content/legal/termos.ts'), /Ao fazer uma reserva, você declara que leu e concorda com elas\./);
});
