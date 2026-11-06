import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EsquemaAvaliacao, MAXIMO_NO_SITE, opinioesDoSite, type Avaliacao } from '../src/lib/avaliacao.ts';

const nova = {
  nome: 'Ana',
  nota: '5',
  texto: 'Texto de exemplo',
  idioma: 'es',
  origem: 'google',
  origemUrl: 'https://exemplo.com/avaliacao',
  data: '2026-10-20',
};

const avaliacao = (id: string, data: string, idioma?: Avaliacao['idioma']): Avaliacao => ({
  id,
  nome: 'Ana',
  nota: 5,
  texto: 'Texto de exemplo',
  idioma,
  origem: 'google',
  origemUrl: 'https://exemplo.com/avaliacao',
  data,
  publicada: true,
});

test('cadastrar exige a origem; o link é opcional, mas se vier precisa ser link', () => {
  assert.equal(EsquemaAvaliacao.safeParse(nova).success, true);
  const { origem: _o, ...semOrigem } = nova;
  const { origemUrl: _u, ...semLink } = nova;
  assert.equal(EsquemaAvaliacao.safeParse(semOrigem).success, false);
  assert.equal(EsquemaAvaliacao.safeParse(semLink).success, true);
  assert.equal(EsquemaAvaliacao.safeParse({ ...nova, origemUrl: '' }).success, true);
  assert.equal(EsquemaAvaliacao.safeParse({ ...nova, origemUrl: 'não é link' }).success, false);
  assert.equal(EsquemaAvaliacao.safeParse({ ...nova, origemUrl: 'javascript:alert(1)' }).success, false);
  assert.equal(EsquemaAvaliacao.safeParse({ ...nova, origem: 'inventada' }).success, false);
});

test('a nota é opcional e, quando vem, vai de 1 a 5', () => {
  assert.equal(EsquemaAvaliacao.parse({ ...nova, nota: '' }).nota, undefined);
  assert.equal(EsquemaAvaliacao.parse(nova).nota, 5);
  assert.equal(EsquemaAvaliacao.safeParse({ ...nova, nota: '6' }).success, false);
  assert.equal(EsquemaAvaliacao.safeParse({ ...nova, nota: '0' }).success, false);
});

test('a seção só aparece com pelo menos 3 publicadas', () => {
  assert.deepEqual(opinioesDoSite([], 'pt'), []);
  assert.deepEqual(opinioesDoSite([avaliacao('a', '2026-10-01'), avaliacao('b', '2026-10-02')], 'pt'), []);
  assert.equal(opinioesDoSite([avaliacao('a', '2026-10-01'), avaliacao('b', '2026-10-02'), avaliacao('c', '2026-10-03')], 'pt').length, 3);
});

test('primeiro as do idioma da página, das mais novas para as mais antigas, e no máximo 6', () => {
  const lista = [
    avaliacao('pt-velha', '2026-01-01', 'pt'),
    avaliacao('es-velha', '2026-02-01', 'es'),
    avaliacao('es-nova', '2026-09-01', 'es'),
    avaliacao('pt-nova', '2026-10-01', 'pt'),
  ];
  assert.deepEqual(
    opinioesDoSite(lista, 'es').map((a) => a.id),
    ['es-nova', 'es-velha', 'pt-nova', 'pt-velha'],
  );
  const muitas = Array.from({ length: 9 }, (_, i) => avaliacao(String(i), `2026-10-0${i + 1}`));
  assert.equal(opinioesDoSite(muitas, 'pt').length, MAXIMO_NO_SITE);
});
