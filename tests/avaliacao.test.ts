import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import {
  EsquemaAvaliacao,
  MAXIMO_NO_SITE,
  fotoDoCartao,
  iniciais,
  notaDaAgencia,
  opinioesDoSite,
  ordenarParaPasseio,
  origemDaNota,
  trechoDaAvaliacao,
  trechosDoCartao,
  type Avaliacao,
} from '../src/lib/avaliacao.ts';

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

/** Uma avaliação completa, mudando só o que o caso precisa. */
const avaliacaoCom = (muda: Partial<Avaliacao> & { id: string }): Avaliacao => ({
  nome: 'Ana',
  nota: 5,
  texto: 'Texto de exemplo',
  origem: 'tripadvisor',
  data: '2026-10-20',
  publicada: true,
  ...muda,
});

test('a nota da agência conta só as avaliações da agência e arredonda para baixo', () => {
  const lista = [
    avaliacaoCom({ id: 'sem-campo', nota: 5 }), // sem o campo "sobre": é da agência (o padrão do banco)
    avaliacaoCom({ id: 'agencia', nota: 5, sobre: 'agencia' }),
    avaliacaoCom({ id: 'agencia-4', nota: 4, sobre: 'agencia' }),
    avaliacaoCom({ id: 'cidade', nota: 1, sobre: 'destino', lugar: 'Rua das Pedras' }), // da cidade: fora da nota
    avaliacaoCom({ id: 'sem-nota', nota: undefined, sobre: 'agencia' }), // sem nota: fora da média e da contagem
  ];
  // 14 / 3 = 4,666…: para baixo, nunca para cima
  assert.deepEqual(notaDaAgencia(lista), { media: 4.6, total: 3 });
  // o exemplo da decisão: 4,96 vira 4,9, nunca 5,0
  const vinteCinco = [
    ...Array.from({ length: 24 }, (_, i) => avaliacaoCom({ id: `cinco-${i}`, nota: 5 })),
    avaliacaoCom({ id: 'quatro', nota: 4 }),
  ];
  assert.deepEqual(notaDaAgencia(vinteCinco), { media: 4.9, total: 25 });
  // sem avaliação da agência com nota, não há o que mostrar
  assert.deepEqual(notaDaAgencia([]), { media: 0, total: 0 });
  assert.deepEqual(notaDaAgencia([avaliacaoCom({ id: 'so-cidade', nota: 5, sobre: 'destino' })]), { media: 0, total: 0 });
});

test('a nota da inicial diz de onde vieram as notas só quando vieram todas do mesmo site (Etapa 8)', () => {
  // as 5 publicadas hoje: todas da agência, com nota, do Tripadvisor → "5,0 · 5 opiniões do Tripadvisor"
  const hoje = Array.from({ length: 5 }, (_, i) => avaliacaoCom({ id: `t${i}`, sobre: 'agencia' }));
  assert.equal(origemDaNota(hoje), 'tripadvisor');
  assert.deepEqual(notaDaAgencia(hoje), { media: 5, total: 5 });
  // a da cidade não entra na nota, então não muda a origem
  assert.equal(
    origemDaNota([...hoje, avaliacaoCom({ id: 'cidade', origem: 'google', sobre: 'destino', lugar: 'Rua das Pedras' })]),
    'tripadvisor',
  );
  // nem a da agência sem nota
  assert.equal(origemDaNota([...hoje, avaliacaoCom({ id: 'sem-nota', origem: 'google', nota: undefined })]), 'tripadvisor');
  // com uma do Google que entra na nota, a origem fica de fora: o site não diz "do Tripadvisor"
  assert.equal(origemDaNota([...hoje, avaliacaoCom({ id: 'google', origem: 'google' })]), undefined);
  // sem nota da agência, nada
  assert.equal(origemDaNota([]), undefined);
  assert.equal(origemDaNota([avaliacaoCom({ id: 'so-cidade', sobre: 'destino' })]), undefined);
});

test('o cartão nunca mostra a imagem padrão do Tripadvisor como foto da pessoa: mostra as iniciais (Etapa 8)', () => {
  // as 5 fotos publicadas hoje são as imagens que o Tripadvisor põe em quem não escolheu foto
  for (const arquivo of readdirSync('public/avaliacoes')) {
    assert.equal(fotoDoCartao({ foto: `/avaliacoes/${arquivo}` }), undefined, arquivo);
  }
  assert.ok(existsSync('public/avaliacoes/boris-i.webp'), 'os arquivos ficam onde estão: o dono decide se apaga');
  // as do lote 2 e as da cidade também, para quando forem publicadas
  assert.equal(fotoDoCartao({ foto: '/avaliacoes/robert-j.webp' }), undefined);
  assert.equal(fotoDoCartao({ foto: '/avaliacoes/tiago-couto.webp' }), undefined);
  // uma foto de verdade, que o dono mandar com a autorização da pessoa, aparece
  assert.equal(fotoDoCartao({ foto: '/avaliacoes/maria-silva.webp' }), '/avaliacoes/maria-silva.webp');
  assert.equal(fotoDoCartao({}), undefined);
  assert.equal(iniciais('Anais R'), 'AR');
  assert.equal(iniciais('Boris I'), 'BI');
  assert.equal(iniciais('newspapertaxi'), 'N');
  assert.equal(iniciais('  maria raquel a '), 'MR');
});

test('no cartão do passeio: quem cita o passeio vem primeiro e es-ar conta como es', () => {
  const lista = [
    avaliacaoCom({ id: 'es-geral', idioma: 'es', data: '2026-10-01' }),
    avaliacaoCom({ id: 'pt-cita', idioma: 'pt', produtoSlug: 'escuna-buzios', data: '2026-09-01' }),
    avaliacaoCom({ id: 'en-nota-baixa', idioma: 'en', nota: 2, data: '2026-08-01' }),
    avaliacaoCom({ id: 'cidade', sobre: 'destino', lugar: 'Orla Bardot', idioma: 'es', data: '2026-10-10' }),
    avaliacaoCom({ id: 'es-cita', idioma: 'es', produtoSlug: 'escuna-buzios', data: '2026-07-01' }),
  ];
  // página em es-ar: cita o passeio primeiro (e, entre elas, a do idioma da página); a da cidade fica fora
  assert.deepEqual(
    ordenarParaPasseio(lista, 'escuna-buzios', 'es-ar').map((a) => a.id),
    ['es-cita', 'pt-cita', 'es-geral', 'en-nota-baixa'],
  );
  // página em inglês: entre as que citam vale a mais nova; depois a do idioma, mesmo com nota baixa
  assert.deepEqual(
    ordenarParaPasseio(lista, 'escuna-buzios', 'en').map((a) => a.id),
    ['pt-cita', 'es-cita', 'en-nota-baixa', 'es-geral'],
  );
  // a nota baixa nunca some da lista
  assert.ok(ordenarParaPasseio(lista, 'outro-passeio', 'pt').some((a) => a.id === 'en-nota-baixa'));
});

test('o trecho do cartão é a primeira frase, cortada sem reescrever', () => {
  assert.equal(trechoDaAvaliacao('Passeio incrível. A equipe foi ótima.'), 'Passeio incrível.');
  assert.equal(trechoDaAvaliacao('Recomendo muito!'), 'Recomendo muito!');
  assert.equal(trechoDaAvaliacao('Tudo certo'), 'Tudo certo'); // sem pontuação: o texto inteiro
  const longa = `${'palavra '.repeat(30)}fim.`;
  const trecho = trechoDaAvaliacao(longa);
  assert.ok(trecho.length <= 141 && trecho.endsWith('…'));
  // só corta: o começo é idêntico ao original
  assert.ok(longa.startsWith(trecho.slice(0, -1)));
});

test('no cartão do passeio, frase inteira vem antes de frase cortada (decisão do dono, 08/11/2026)', () => {
  const base = { nome: 'A', origem: 'tripadvisor' as const, publicada: true, nota: 5, idioma: 'es' as const };
  const longa = `${'palabra '.repeat(30)}fin. Otra frase.`;
  const lista: Avaliacao[] = [
    { ...base, id: 'cita-longa', produtoSlug: 'escuna-buzios', texto: longa, data: '2026-10-01' },
    { ...base, id: 'curta-1', texto: 'Excelente paseo. Volveremos.', data: '2026-09-01' },
    { ...base, id: 'curta-2', texto: 'Muy recomendable!', data: '2026-08-01' },
  ];
  // a que cita o passeio seria a primeira, mas a frase dela não cabe inteira: as inteiras passam na frente
  assert.deepEqual(
    trechosDoCartao(lista, 'escuna-buzios', 'es').map((a) => a.id),
    ['curta-1', 'curta-2'],
  );
  // sem duas inteiras, a cortada completa a lista (na ordem de sempre)
  assert.deepEqual(
    trechosDoCartao(lista.slice(0, 2), 'escuna-buzios', 'es').map((a) => a.id),
    ['curta-1', 'cita-longa'],
  );
  // a cortada continua só cortada, nunca reescrita
  assert.ok(trechoDaAvaliacao(longa).endsWith('…'));
});
