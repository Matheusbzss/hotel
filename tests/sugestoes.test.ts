import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PASSEIOS } from '../src/data/passeios.ts';
import { SUGESTOES_PASSEIO, SUGESTOES_TRANSFER, sugestoesDoCarrinho } from '../src/data/sugestoes.ts';
import type { EscolhaPasseio, EscolhaTransfer } from '../src/lib/carrinho.ts';

const passeio = (slug: string): EscolhaPasseio => ({
  tipo: 'passeio',
  slug,
  data: '2026-12-01',
  hora: '09:00',
  adultos: 2,
  meia: 0,
  gratis: 0,
});
const transfer = (de: EscolhaTransfer['ida']['saida']['lugar'], para: EscolhaTransfer['ida']['saida']['lugar']): EscolhaTransfer => ({
  tipo: 'transfer',
  veiculo: 'carro',
  ida: { saida: { lugar: de }, destino: { lugar: para }, data: '2026-12-01', hora: '14:00' },
  passageiros: 2,
  malas: { grandes: 0, medias: 0, mao: 0 },
});

test('a tabela cobre todos os passeios do catálogo, com 3 sugestões que existem e sem sugerir o próprio passeio', () => {
  const slugs = PASSEIOS.map((p) => p.slug);
  assert.deepEqual(Object.keys(SUGESTOES_PASSEIO).sort(), [...slugs].sort());
  for (const [slug, sugestoes] of Object.entries(SUGESTOES_PASSEIO)) {
    assert.equal(new Set(sugestoes).size, 3, slug);
    assert.ok(!sugestoes.includes(slug), slug);
    for (const s of sugestoes) assert.ok(slugs.includes(s), `${slug} → ${s}`);
  }
  for (const sugestoes of Object.values(SUGESTOES_TRANSFER)) for (const s of sugestoes) assert.ok(slugs.includes(s), s);
});

test('os exemplos do FASE-3.md: escuna → buggy e quadriciclo; transfer até Búzios → Búzios; full day de Arraial → mergulho', () => {
  assert.deepEqual(sugestoesDoCarrinho([passeio('escuna-buzios')]).slice(0, 2), ['buggy-buzios', 'quadriciclo-buzios']);
  assert.ok(sugestoesDoCarrinho([transfer('galeao', 'buzios')]).every((s) => s.endsWith('-buzios')));
  assert.ok(sugestoesDoCarrinho([passeio('full-day-arraial-do-cabo')]).includes('mergulho-arraial-do-cabo'));
});

test('o transfer vale pela cidade da Região dos Lagos, na ida ou na volta para o aeroporto', () => {
  assert.deepEqual(sugestoesDoCarrinho([transfer('arraial-do-cabo', 'galeao')]), SUGESTOES_TRANSFER['arraial-do-cabo']);
  assert.deepEqual(sugestoesDoCarrinho([transfer('aeroporto-cabo-frio', 'cabo-frio')]), SUGESTOES_TRANSFER['cabo-frio']);
});

test('o último item vem primeiro, e nada do que já está no carrinho aparece', () => {
  const lista = sugestoesDoCarrinho([passeio('barco-arraial-do-cabo'), passeio('escuna-buzios')]);
  assert.deepEqual(lista.slice(0, 3), SUGESTOES_PASSEIO['escuna-buzios']);
  assert.equal(lista[3], 'mergulho-arraial-do-cabo');

  const semBuggy = sugestoesDoCarrinho([passeio('buggy-buzios'), passeio('escuna-buzios')]);
  assert.ok(!semBuggy.includes('buggy-buzios') && !semBuggy.includes('escuna-buzios'));
  assert.equal(new Set(semBuggy).size, semBuggy.length);
});

test('carrinho vazio: nenhuma sugestão', () => {
  assert.deepEqual(sugestoesDoCarrinho([]), []);
});
