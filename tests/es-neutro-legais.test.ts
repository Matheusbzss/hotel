import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comAjustesAR, frasesDoDocumento, type ParAR } from '../src/content/legal/argentino.ts';
import { AJUSTES_AR_CANCELAMENTO, CANCELAMENTO } from '../src/content/legal/cancelamento.ts';
import { AJUSTES_AR_PRIVACIDADE, PRIVACIDADE } from '../src/content/legal/privacidade.ts';
import { AJUSTES_AR_TERMOS, TERMOS } from '../src/content/legal/termos.ts';
import { ATUALIZADO_EM, type DocumentoLegal } from '../src/content/legal/tipos.ts';
import { texto, type Traduzido } from '../src/i18n/conteudo.ts';

// Etapa 3, lote 2: nos textos legais, o /es é o espanhol neutro (com "tú") e o /es-ar é o texto argentino de antes
// (com "vos"), palavra por palavra, só nas frases que diferem (os pares AJUSTES_AR_* de cada arquivo). A prova
// completa contra o git (es-ar igual ao es do commit 7eccc38, pt e en intocados) rodou por script na hora da
// mudança; aqui ficam as regras que valem para sempre.

const DOCS: Record<string, { doc: Traduzido<DocumentoLegal>; pares: readonly ParAR[] }> = {
  termos: { doc: TERMOS, pares: AJUSTES_AR_TERMOS },
  cancelamento: { doc: CANCELAMENTO, pares: AJUSTES_AR_CANCELAMENTO },
  privacidade: { doc: PRIVACIDADE, pares: AJUSTES_AR_PRIVACIDADE },
};

/** A forma de um valor: as chaves (em ordem) e o tipo de cada folha; uma lista guarda o tamanho. */
function forma(v: unknown): unknown {
  if (Array.isArray(v)) return { lista: v.length, itens: v.map(forma) };
  if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forma(x)]));
  return typeof v;
}

const LETRA = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const tokens = (s: string): string[] => (s.match(new RegExp(`[${LETRA}]+`, 'g')) ?? []).map((t) => t.toLowerCase());

/**
 * O que NÃO pode aparecer no espanhol neutro: as formas de "vos" que os textos legais tinham, o imperativo com
 * pronome sem o acento do "tú", os pronomes vos/sos/usted e as palavras argentinas trocadas (valijas, cuatriciclo,
 * seña, resúmenes da tarjeta) mais os argentinismos fortes de vigia.
 */
const PROIBIDAS_NO_NEUTRO = new Set(
  `declarás elegís necesitás comprometés podés cancelás permitís pedís mandás escribís hacés
   seguí usá evitá escribí informanos escribinos envianos avisanos mostralo
   vos sos usted ustedes
   valija valijas cuatriciclo cuatriciclos seña señas resúmenes chico chicos arribos médanos acá
   plata colectivo colectivos remís pileta boliche vereda pollera frutilla palta parador paradores`
    .split(/\s+/)
    .filter(Boolean),
);

/** Palavras comuns terminadas em á/é/í(s) que não são "vos": advérbios, "está" e o futuro da 3ª pessoa (resolverá). */
const INOCENTES = new Set(
  'está estás así aquí ahí allí allá además demás después más través interés país sí mí tú qué será habrá podrá resolverá cobrará devolverá'.split(
    /\s+/,
  ),
);

test('o espanhol neutro (es) dos textos legais não tem vos, usted nem as palavras argentinas trocadas', () => {
  for (const [nome, { doc }] of Object.entries(DOCS)) {
    for (const frase of frasesDoDocumento(doc.es)) {
      for (const t of tokens(frase)) {
        assert.ok(!PROIBIDAS_NO_NEUTRO.has(t), `"${t}" em ${nome}.es: ${frase}`);
        // qualquer outra palavra terminada em vogal acentuada ou ás/és/ís é suspeita de "vos" (declarás, elegís, seguí)
        if (!INOCENTES.has(t)) assert.ok(!/[áéí]s?$/.test(t), `possível forma de vos "${t}" em ${nome}.es: ${frase}`);
      }
      // "vos" depois de preposição vira "contigo"/"ti", nunca "con tú"
      assert.ok(!/\b(con|para|a|de|por|sin|sobre)\s+tú\b/i.test(frase), `preposição + tú em ${nome}.es: ${frase}`);
      // cuatrimoto é feminino; dunas e llegadas também
      assert.ok(
        !/\b(el|un|este|ese|los|unos|estos|esos|propios?)\s+cuatrimotos?\b/i.test(frase),
        `gênero de cuatrimoto em ${nome}.es: ${frase}`,
      );
      assert.ok(!/\b(los|unos|estos|esos)\s+(dunas|llegadas)\b/i.test(frase), `gênero de dunas/llegadas em ${nome}.es: ${frase}`);
    }
  }
});

test('nenhuma das duas versões do espanhol usa "usted"', () => {
  for (const [nome, { doc }] of Object.entries(DOCS)) {
    for (const idioma of ['es', 'es-ar'] as const) {
      for (const frase of frasesDoDocumento(texto(doc, idioma))) {
        assert.ok(!tokens(frase).some((t) => t === 'usted' || t === 'ustedes'), `"usted" em ${nome}.${idioma}: ${frase}`);
      }
    }
  }
});

test('o es-ar tem a mesma forma do es (mesmas seções, listas do mesmo tamanho) e os mesmos títulos', () => {
  for (const [nome, { doc }] of Object.entries(DOCS)) {
    const es = texto(doc, 'es');
    const ar = texto(doc, 'es-ar');
    assert.deepEqual(forma(ar), forma(es), nome);
    assert.equal(ar.titulo, es.titulo, nome);
    assert.deepEqual(
      ar.secoes.map((s) => s.titulo),
      es.secoes.map((s) => s.titulo),
      nome,
    );
    // os quatro idiomas têm a mesma quantidade de seções
    for (const idioma of ['pt', 'en', 'es-ar'] as const)
      assert.equal(texto(doc, idioma).secoes.length, es.secoes.length, `${nome}.${idioma}`);
  }
});

/** Quantos pares argentinos cada documento tem hoje: a trava contra um par sumir em silêncio. */
const PARES_ESPERADOS: Record<string, number> = { termos: 12, cancelamento: 12, privacidade: 13 };

test('só as frases dos pares mudam entre es e es-ar, e cada par é usado uma vez', () => {
  for (const [nome, { doc, pares }] of Object.entries(DOCS)) {
    const es = frasesDoDocumento(texto(doc, 'es'));
    const ar = frasesDoDocumento(texto(doc, 'es-ar'));
    assert.equal(ar.length, es.length, nome);
    const trocas = new Map(pares);
    const diferentes = es.map((frase, i) => [frase, ar[i]] as const).filter(([a, b]) => a !== b);
    assert.equal(diferentes.length, pares.length, `${nome}: frases que mudam x pares`);
    for (const [neutra, argentina] of diferentes) assert.equal(argentina, trocas.get(neutra), `${nome}: ${neutra}`);
    assert.equal(
      pares.length,
      PARES_ESPERADOS[nome],
      `${nome}: ${pares.length} pares, esperava ${PARES_ESPERADOS[nome]} (as frases do documento que tinham vos ou palavra argentina). Juntou ou dividiu frases de propósito? Atualize PARES_ESPERADOS.`,
    );
  }
});

test('o espanhol da Argentina (es-ar) conserva o texto de antes, com vos e as palavras locais', () => {
  const termos = frasesDoDocumento(texto(TERMOS, 'es-ar')).join('\n');
  for (const trecho of [
    'Al hacer una reserva, declarás',
    'Frente a vos, respondemos',
    'Sos responsable',
    'seguí las indicaciones',
    'usá chaleco',
  ]) {
    assert.ok(termos.includes(trecho), trecho);
  }
  for (const trecho of ['un cuatriciclo necesitás', 'informanos antes', 'una seña del 50%', 'Te comprometés', 'escribinos: la mayoría']) {
    assert.ok(termos.includes(trecho), trecho);
  }
  const cancelamento = frasesDoDocumento(texto(CANCELAMENTO, 'es-ar')).join('\n');
  for (const trecho of ['Elegís entre reembolso', 'podés desistir', 'Si cancelás', 'acordaremos con vos', 'escribinos y analizaremos']) {
    assert.ok(cancelamento.includes(trecho), trecho);
  }
  for (const trecho of [
    'Podés pedir cambiar',
    'Envianos el número',
    'en el resumen según sus plazos',
    'uno o dos resúmenes',
    'propias de seña',
  ]) {
    assert.ok(cancelamento.includes(trecho), trecho);
  }
  const privacidade = frasesDoDocumento(texto(PRIVACIDADE, 'es-ar')).join('\n');
  for (const trecho of [
    'si lo permitís',
    'cuando pedís una cotización o mandás',
    'las valijas',
    'si lo escribís',
    'Evitá escribir',
    'Si la escribís',
  ]) {
    assert.ok(privacidade.includes(trecho), trecho);
  }
  for (const trecho of [
    'Podés pedir no recibir',
    'que podés rechazar',
    'si hacés clic',
    'Podés cambiar tu elección',
    'podés pedir en cualquier',
    'escribí a',
  ]) {
    assert.ok(privacidade.includes(trecho), trecho);
  }
  assert.equal((privacidade.match(/las valijas/g) ?? []).length, 2);
});

test('o espanhol neutro (es) diz o mesmo com tú: ti, contigo, eres, cuatrimoto, maletas, anticipo, estado de cuenta', () => {
  const termos = frasesDoDocumento(texto(TERMOS, 'es')).join('\n');
  for (const trecho of [
    'declaras que las leíste',
    'Frente a ti, respondemos',
    'Eres responsable',
    'sigue las indicaciones',
    'usa chaleco',
  ]) {
    assert.ok(termos.includes(trecho), trecho);
  }
  for (const trecho of [
    'una cuatrimoto necesitas',
    'infórmanos antes',
    'un anticipo del 50%',
    'Te comprometes',
    'escríbenos: la mayoría',
  ]) {
    assert.ok(termos.includes(trecho), trecho);
  }
  const cancelamento = frasesDoDocumento(texto(CANCELAMENTO, 'es')).join('\n');
  for (const trecho of ['Eliges entre reembolso', 'puedes desistir', 'Si cancelas', 'acordaremos contigo', 'escríbenos y analizaremos']) {
    assert.ok(cancelamento.includes(trecho), trecho);
  }
  for (const trecho of [
    'Puedes pedir cambiar',
    'Envíanos el número',
    'en el estado de cuenta',
    'uno o dos estados de cuenta',
    'propias de anticipo',
  ]) {
    assert.ok(cancelamento.includes(trecho), trecho);
  }
  const privacidade = frasesDoDocumento(texto(PRIVACIDADE, 'es')).join('\n');
  for (const trecho of [
    'si lo permites',
    'cuando pides una cotización o mandas',
    'las maletas',
    'si lo escribes',
    'Evita escribir',
    'Si la escribes',
  ]) {
    assert.ok(privacidade.includes(trecho), trecho);
  }
  for (const trecho of [
    'Puedes pedir no recibir',
    'que puedes rechazar',
    'si haces clic',
    'Puedes cambiar tu elección',
    'puedes pedir en cualquier',
    'escribe a',
  ]) {
    assert.ok(privacidade.includes(trecho), trecho);
  }
  assert.equal((privacidade.match(/las maletas/g) ?? []).length, 2);
});

test('texto() serve cada idioma: pt e en como estão, es-ar com a versão argentina', () => {
  for (const { doc } of Object.values(DOCS)) {
    assert.equal(texto(doc, 'pt'), doc.pt);
    assert.equal(texto(doc, 'en'), doc.en);
    assert.equal(texto(doc, 'es'), doc.es);
    assert.equal(texto(doc, 'es-ar'), doc['es-ar']);
    assert.notEqual(doc['es-ar'], undefined);
    assert.notDeepEqual(doc['es-ar'], doc.es);
  }
});

test('comAjustesAR() falha alto com par órfão, repetido ou sem efeito, e sem pares devolve o mesmo texto', () => {
  const es = TERMOS.es;
  assert.deepEqual(comAjustesAR(es, []), es);
  assert.throws(
    () => comAjustesAR(es, [['Frase que não existe no documento.', 'Frase que no existe.']]),
    /Frase que não existe no documento\./,
  );
  assert.throws(
    () =>
      comAjustesAR(es, [
        [es.titulo, 'A'],
        [es.titulo, 'B'],
      ]),
    /repetido/,
  );
  assert.throws(() => comAjustesAR(es, [[es.titulo, es.titulo]]), /sem efeito/);
  // a troca só mexe na frase pedida
  const trocado = comAjustesAR(es, [[es.secoes[0].titulo, 'Título trocado']]);
  assert.equal(trocado.secoes[0].titulo, 'Título trocado');
  assert.deepEqual({ ...trocado, secoes: trocado.secoes.slice(1) }, { ...es, secoes: es.secoes.slice(1) });
  assert.deepEqual(frasesDoDocumento(trocado).length, frasesDoDocumento(es).length);
});

test('a data de revisão dos textos legais é uma data válida e não voltou para antes da revisão da Etapa 2', () => {
  // o espanhol neutro não mudou o conteúdo (só a forma de tratamento), por isso a data ficou em 2026-11-07;
  // uma revisão legítima futura pode avançá-la, nunca recuá-la
  assert.match(ATUALIZADO_EM, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(ATUALIZADO_EM >= '2026-11-07', ATUALIZADO_EM);
});
