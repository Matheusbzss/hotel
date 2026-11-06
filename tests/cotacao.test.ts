import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EsquemaCotacao, faltaNaCotacao } from '../src/lib/cotacao.ts';

const base = { idioma: 'es', nome: 'Teste Silva', email: 'teste@exemplo.com' };
const trajeto = {
  ida: {
    saida: { lugar: 'outra-cidade', cidade: 'Niterói' },
    destino: { lugar: 'buzios', endereco: 'Pousada' },
    data: '2026-12-01',
    hora: '10:00',
  },
  passageiros: 3,
  malas: { grandes: 1, medias: 0, mao: 2 },
};

const ler = (c: unknown) => EsquemaCotacao.parse(c);

test('contato: precisa da mensagem; o telefone é opcional', () => {
  assert.equal(faltaNaCotacao(ler({ ...base, tipo: 'outro', mensagem: 'Oi, tudo bem?' })), null);
  assert.equal(faltaNaCotacao(ler({ ...base, tipo: 'outro' })), 'mensagem');
});

test('transfer: precisa do trajeto e do telefone, para a equipe responder com o valor', () => {
  assert.equal(faltaNaCotacao(ler({ ...base, tipo: 'transfer', trajeto, ddi: '54', telefone: '1123456789' })), null);
  assert.equal(faltaNaCotacao(ler({ ...base, tipo: 'transfer', trajeto })), 'telefone');
  assert.equal(faltaNaCotacao(ler({ ...base, tipo: 'transfer', ddi: '54', telefone: '1123456789' })), 'trajeto');
});

test('casa: nome e e-mail bastam', () => {
  assert.equal(faltaNaCotacao(ler({ ...base, tipo: 'casa' })), null);
});

test('recusa robô (campo-isca preenchido), tipo que não existe e nome vazio', () => {
  assert.equal(EsquemaCotacao.safeParse({ ...base, tipo: 'outro', mensagem: 'oi', site: 'http://spam' }).success, false);
  assert.equal(EsquemaCotacao.safeParse({ ...base, tipo: 'pacote' }).success, false);
  assert.equal(EsquemaCotacao.safeParse({ ...base, tipo: 'casa', nome: '  ' }).success, false);
});
