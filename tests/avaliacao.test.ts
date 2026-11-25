import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { IDIOMAS } from '../src/i18n/config.ts';
import { dicionario } from '../src/i18n/index.ts';
import {
  EsquemaAvaliacao,
  MAXIMO_NO_SITE,
  MINIMO_NO_SITE,
  fotoDoCartao,
  iniciais,
  linkMostravel,
  notaDaAgencia,
  opinioesDoSite,
  ordenarParaPasseio,
  notaVisivel,
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

test('a nota aparece só com o mínimo publicado e com nota da agência (seção, cartão e etiqueta do topo do passeio)', () => {
  const hoje = Array.from({ length: 5 }, (_, i) => avaliacaoCom({ id: `t${i}`, sobre: 'agencia' }));
  assert.equal(notaVisivel(hoje), true);
  assert.deepEqual(notaDaAgencia(hoje), { media: 5, total: 5 });
  // abaixo do mínimo, nada (a seção de opiniões nem existiria)
  assert.equal(notaVisivel(hoje.slice(0, MINIMO_NO_SITE - 1)), false);
  assert.equal(notaVisivel(hoje.slice(0, MINIMO_NO_SITE)), true);
  assert.equal(notaVisivel([]), false);
  // com o mínimo, mas sem nenhuma nota da agência (só da cidade, ou sem nota): nada
  const semNota = Array.from({ length: 4 }, (_, i) => avaliacaoCom({ id: `s${i}`, nota: undefined }));
  assert.equal(notaVisivel(semNota), false);
  const daCidade = Array.from({ length: 4 }, (_, i) => avaliacaoCom({ id: `c${i}`, sobre: 'destino', lugar: 'Rua das Pedras' }));
  assert.equal(notaVisivel(daCidade), false);
  // uma nota da agência entre as da cidade já basta
  assert.equal(notaVisivel([...daCidade, avaliacaoCom({ id: 'agencia' })]), true);
});

test('o link para o original nunca leva ao Tripadvisor, mesmo cadastrado no painel (Pacote 27)', () => {
  assert.equal(linkMostravel({ origem: 'google', origemUrl: 'https://g.page/r/exemplo' }), true);
  assert.equal(linkMostravel({ origem: 'google' }), false);
  // a origem Tripadvisor, ou um endereço do Tripadvisor com outra origem: sem link
  assert.equal(linkMostravel({ origem: 'tripadvisor', origemUrl: 'https://exemplo.com/a' }), false);
  assert.equal(linkMostravel({ origem: 'site', origemUrl: 'https://www.tripadvisor.com.ar/ShowUserReviews-g1' }), false);
  assert.equal(linkMostravel({ origem: 'google', origemUrl: 'https://www.TripAdvisor.com/x' }), false);
  // o cartão da inicial usa essa regra
  const cartao = readFileSync(path.join('src', 'components', 'home', 'Opinioes.tsx'), 'utf8');
  assert.match(cartao, /\{linkMostravel\(a\) && \(/);
});

/** Todos os textos de um dicionário, com o caminho de cada um. */
function textos(v: unknown, caminho = ''): [string, string][] {
  if (typeof v === 'string') return [[caminho, v]];
  if (typeof v === 'object' && v !== null) return Object.entries(v).flatMap(([k, x]) => textos(x, caminho ? `${caminho}.${k}` : k));
  return [];
}

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    return e.isDirectory() ? arquivos(caminho) : [caminho];
  });
}

test('nada que o cliente vê cita o Tripadvisor: nem a nota, nem o link da avaliação, nos 4 idiomas (Pacote 27)', () => {
  // a decisão do dono de 25/11/2026: "5,0 · 5 opiniones", sem "de Tripadvisor"; o painel (src/app/admin) fica como está
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    const culpados = textos(d).filter(([, t]) => /trip\s*advisor/i.test(t));
    assert.deepEqual(culpados, [], idioma);
    assert.equal('naOrigem' in d.opinioes, false, idioma);
  }
  assert.equal(dicionario('es-ar').opinioes.ver.tripadvisor, 'Ver la opinión');
  assert.equal(dicionario('pt').opinioes.ver.tripadvisor, 'Ver a avaliação');
  assert.equal(dicionario('en').opinioes.ver.tripadvisor, 'See the review');
  // no código das páginas do cliente, a palavra só pode estar em comentário (o comentário não vai para o site)
  const COMENTARIO = /^\s*(\/\/|\/?\*|\{\/\*)/;
  const PAGINAS = [
    path.join('src', 'components'),
    path.join('src', 'app', '[locale]'),
    path.join('src', 'data'),
    path.join('src', 'content'),
  ];
  const linhas = PAGINAS.flatMap(arquivos)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((linha, i) => ({ onde: `${f}:${i + 1}`, linha })),
    );
  assert.ok(linhas.length > 1000, String(linhas.length));
  const fora = linhas.filter(({ linha }) => /trip\s*advisor|NOME_DA_ORIGEM|origemDaNota|naOrigem/i.test(linha) && !COMENTARIO.test(linha));
  assert.deepEqual(fora, []);
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

test('a etiqueta da nota no topo do passeio segue a regra do cartão de opiniões e leva até ele (Pacote 27)', () => {
  const topo = readFileSync(path.join('src', 'components', 'passeio', 'TopoPasseio.tsx'), 'utf8');
  const cartao = readFileSync(path.join('src', 'components', 'passeio', 'OpinioesPasseio.tsx'), 'utf8');
  const pagina = readFileSync(path.join('src', 'app', '[locale]', 'passeios', '[slug]', 'page.tsx'), 'utf8');
  // a página só passa a nota quando o cartão aparece: a mesma regra (notaVisivel) dos dois lados
  assert.match(pagina, /const nota = notaVisivel\(avaliacoes\) \? notaDaAgencia\(avaliacoes\) : undefined;/);
  assert.match(pagina, /nota=\{nota\}/);
  assert.match(cartao, /if \(!notaVisivel\(avaliacoes\)\) return null;/);
  // o link vai para o título do cartão, que existe com a mesma regra
  const alvo = topo.match(/href="#([\w-]+)"/)?.[1];
  assert.equal(alvo, 'opinioes-passeio-titulo');
  assert.match(cartao, new RegExp(`id="${alvo}"`));
  // só textos que já existem: a contagem do passeio e a nota para o leitor de tela; nenhum site
  assert.match(topo, /\{nota && media && \(/);
  assert.match(topo, /d\.passeio\.opinioesContagemUma : fmt\(d\.passeio\.opinioesContagem, \{ n: nota\.total \}\)/);
  assert.match(topo, /fmt\(d\.opinioes\.nota, \{ n: media \}\)/);
  assert.doesNotMatch(topo, /origem|google|trip/i);
  // o texto do topo deixa o toque passar para as fotos; o link precisa recebê-lo de volta
  assert.match(topo, /className="etiqueta vidro vidro-foto pointer-events-auto /);
});
