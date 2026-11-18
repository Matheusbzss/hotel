import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRUPOS_GUIAS, GUIAS, fraseDoGuia, guiaNoIdioma, type Guia, type GuiaResolvido } from '../src/data/guias.ts';

// O /es dos guias é o espanhol neutro (com "tú") e o /es-ar guarda o texto argentino (com "vos") só nos campos em que
// a frase muda. Este teste garante que o neutro não tem vos, usted nem argentinismo; que o argentino continua o texto
// do lote 1 (frases conferidas contra o HEAD daquele commit); que o argentino vira o neutro pela regra, palavra por
// palavra; e que as duas versões têm a mesma forma (links, números, pontuação, tamanho das listas).

/* ---------- a regra vos -> tú e argentinismo -> neutro, como aplicada em src/data/guias.ts ---------- */

const VERBOS: Record<string, string> = {
  podés: 'puedes',
  tenés: 'tienes',
  querés: 'quieres',
  elegís: 'eliges',
  necesitás: 'necesitas',
  revisás: 'revisas',
  pagás: 'pagas',
  cancelás: 'cancelas',
  sabés: 'sabes',
  preferís: 'prefieres',
  seguís: 'sigues',
  conocés: 'conoces',
  venís: 'vienes',
  hacés: 'haces',
  salís: 'sales',
  decidís: 'decides',
  alojás: 'alojas',
  viajás: 'viajas',
  recibís: 'recibes',
  llegás: 'llegas',
  perdés: 'pierdes',
  presentás: 'presentas',
  registrás: 'registras',
  terminás: 'terminas',
  completás: 'completas',
  arrepentís: 'arrepientes',
  declarás: 'declaras',
  comprometés: 'comprometes',
  permitís: 'permites',
  pedís: 'pides',
  mandás: 'mandas',
  escribís: 'escribes',
  dependés: 'dependes',
  acordás: 'acuerdas',
  sumás: 'sumas',
  cambiás: 'cambias',
  navegás: 'navegas',
  animás: 'animas',
  buscás: 'buscas',
  aprendés: 'aprendes',
  manejás: 'manejas',
  armás: 'armas',
  disfrutás: 'disfrutas',
  reservás: 'reservas',
  sos: 'eres',
  reservá: 'reserva',
  llegá: 'llega',
  disfrutá: 'disfruta',
  elegí: 'elige',
  mirá: 'mira',
  armá: 'arma',
  poné: 'pon',
  probá: 'prueba',
  pensá: 'piensa',
  entrá: 'entra',
  contá: 'cuenta',
  fijate: 'fíjate',
  acordate: 'acuérdate',
  escribinos: 'escríbenos',
  contactanos: 'contáctanos',
  avisanos: 'avísanos',
  avisame: 'avísame',
  mandanos: 'mándanos',
  decinos: 'dinos',
  dejanos: 'déjanos',
  mostralo: 'muéstralo',
  llevalo: 'llévalo',
  dejá: 'deja',
  llevá: 'lleva',
  evitá: 'evita',
  esperá: 'espera',
  sacá: 'saca',
  calculá: 'calcula',
  pedí: 'pide',
  sumá: 'suma',
  conocé: 'conoce',
  confirmá: 'confirma',
  indicá: 'indica',
  seguí: 'sigue',
  sumale: 'súmale',
  confirmalas: 'confírmalas',
  confirmalos: 'confírmalos',
};

/** Frases e palavras, na ordem: "vos" com preposição, gênero (cuatrimoto e dunas são femininos) e palavras soltas. */
const FRASES: [string, string][] = [
  ['con vos', 'contigo'],
  ['a vos', 'a ti'],
  ['para vos', 'para ti'],
  ['de vos', 'de ti'],
  ['por vos', 'por ti'],
  ['vos', 'tú'],
  ['Vos', 'Tú'],
  ['Los Médanos do Peró', 'Las Dunas do Peró'],
  ['los médanos', 'las dunas'],
  ['Médanos', 'Dunas'],
  ['médanos', 'dunas'],
  ['el [cuatriciclo]', 'la [cuatrimoto]'],
  ['el cuatriciclo', 'la cuatrimoto'],
  ['un cuatriciclo', 'una cuatrimoto'],
  ['los cuatriciclos', 'las cuatrimotos'],
  ['cuatriciclos', 'cuatrimotos'],
  ['cuatriciclo', 'cuatrimoto'],
  ['Chicos', 'Niños'],
  ['chicos', 'niños'],
  ['valijas', 'maletas'],
  ['valija', 'maleta'],
  ['arribos', 'llegadas'],
  ['Acá', 'Aquí'],
  ['acá', 'aquí'],
  ['A la mañana', 'Por la mañana'],
  ['a la mañana', 'por la mañana'],
  ['A la tarde', 'Por la tarde'],
  ['a la tarde', 'por la tarde'],
  ['salir a la noche', 'salir por la noche'],
  ['arrancar por el mar', 'empezar por el mar'],
  ['paradores', 'bares'],
];

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const inteira = (w: string) => new RegExp(`(?<!\\p{L})${escapar(w)}(?!\\p{L})`, 'gu');
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** O neutro a partir do argentino, pela mesma regra usada para escrever o arquivo. */
function neutro(texto: string): string {
  let s = texto;
  for (const [de, para] of FRASES) s = s.replace(inteira(de), para);
  for (const [de, para] of Object.entries(VERBOS)) {
    s = s.replace(inteira(de), para).replace(inteira(capitalizar(de)), capitalizar(para));
  }
  return s;
}

const PROIBIDOS = new Set([
  ...Object.keys(VERBOS),
  'vos',
  'usted',
  'ustedes',
  'valija',
  'valijas',
  'chicos',
  'arribos',
  'médanos',
  'cuatriciclo',
  'cuatriciclos',
  'acá',
  'plata',
  'colectivo',
  'colectivos',
  'remís',
  'pileta',
  'piletas',
  'boliche',
  'boliches',
  'vereda',
  'veredas',
  'pollera',
  'frutilla',
  'frutillas',
  'palta',
  'paltas',
  'parador',
  'paradores',
]);
/** Palavras terminadas em -á/-é/-í(s) que não são verbos no vos. */
const NAO_VERBOS = new Set([
  'más',
  'qué',
  'está',
  'estás',
  'sí',
  'así',
  'geribá',
  'después',
  'ahí',
  'demás',
  'josé',
  'además',
  'revés',
  'país',
  'tú',
  'aquí',
  'allí',
  'será',
  'habrá',
  'quizá',
  'inglés',
  'portugués',
  'través',
  'interés',
]);
/** Artigo no gênero errado depois da troca, ou "tú" depois de preposição ("con tú" em vez de "contigo"). */
const ERROS =
  /(?<!\p{L})(el|un|este|ese|propio|los|unos|estos) cuatrimotos?(?!\p{L})|(?<!\p{L})(el|los|un|unos) (dunas?|llegadas?)(?!\p{L})|(?<!\p{L})(con|a|para|de|por|sin|sobre) tú(?!\p{L})/iu;

/** As palavras suspeitas num texto neutro: proibidas, com cara de verbo no vos, ou um erro de gênero. */
function suspeitas(t: string): string[] {
  const achadas = (t.match(/\p{L}+/gu) ?? []).filter((w) => {
    const l = w.toLowerCase();
    return PROIBIDOS.has(l) || (/(ás|és|ís|á|é|í)$/u.test(l) && !NAO_VERBOS.has(l));
  });
  const erro = t.match(ERROS);
  return erro ? [...achadas, erro[0]] : achadas;
}

/* ---------- os textos de um guia, na ordem do arquivo ---------- */

const CHAVES_DE_TEXTO = new Set([
  'titulo',
  'descricao',
  'chamada',
  'h1',
  'resumo',
  'rotulo',
  'valor',
  'paragrafos',
  'nome',
  'texto',
  'legenda',
  'colunas',
  'linhas',
  'p',
  'r',
  'botao',
]);

function textos(valor: unknown, saida: string[] = []): string[] {
  if (Array.isArray(valor)) valor.forEach((v) => textos(v, saida));
  else if (typeof valor === 'object' && valor !== null) {
    for (const [k, v] of Object.entries(valor)) {
      if (CHAVES_DE_TEXTO.has(k)) (Array.isArray(v) ? v.flat() : [v]).forEach((t) => saida.push(t as string));
      else if (typeof v === 'object') textos(v, saida);
    }
  }
  return saida;
}

/** Os { es, 'es-ar' } do arquivo, antes de escolher o idioma. */
function versoes(valor: unknown, saida: { es: string; 'es-ar'?: string }[] = []) {
  if (Array.isArray(valor)) valor.forEach((v) => versoes(v, saida));
  else if (typeof valor === 'object' && valor !== null) {
    if (typeof (valor as { es?: unknown }).es === 'string') saida.push(valor as { es: string; 'es-ar'?: string });
    else Object.values(valor).forEach((v) => versoes(v, saida));
  }
  return saida;
}

const ES: GuiaResolvido[] = GUIAS.map((g) => guiaNoIdioma(g, 'es'));
const AR: GuiaResolvido[] = GUIAS.map((g) => guiaNoIdioma(g, 'es-ar'));
const titulosGrupos = (idioma: 'es' | 'es-ar') => GRUPOS_GUIAS.map((g) => fraseDoGuia(g.titulo, idioma));

test('o espanhol neutro dos guias não tem vos, usted nem argentinismo', () => {
  for (const g of ES) {
    for (const t of textos(g)) assert.deepEqual(suspeitas(t), [], `${g.slug}: ${t}`);
  }
  for (const t of titulosGrupos('es')) assert.deepEqual(suspeitas(t), [], t);
  // o argentino também nunca trata de "usted"
  for (const g of AR) for (const t of textos(g)) assert.doesNotMatch(t, /(?<!\p{L})usted(es)?(?!\p{L})/iu, `${g.slug}: ${t}`);
});

test('a versão argentina continua o texto do lote 1: frases com vos conferidas uma a uma', () => {
  // [slug, frase argentina (igual ao HEAD do lote 1), frase neutra]
  const FRASES_CONFERIDAS: [string, string, string][] = [
    [
      'que-hacer-en-buzios',
      'Elegí la fecha y el grupo, mirá el precio final y reservá desde casa. Podés cancelar gratis hasta 24 horas antes.',
      'Elige la fecha y el grupo, mira el precio final y reserva desde casa. Puedes cancelar gratis hasta 24 horas antes.',
    ],
    [
      'como-ir-de-rio-a-buzios',
      'Reservás online con la fecha, el horario y el número de tu vuelo. En el aeropuerto, el chofer sigue tu llegada y te espera en arribos con un cartel con tu nombre. Después va directo a tu hotel o posada, sin paradas extra.',
      'Reservas online con la fecha, el horario y el número de tu vuelo. En el aeropuerto, el chofer sigue tu llegada y te espera en llegadas con un cartel con tu nombre. Después va directo a tu hotel o posada, sin paradas extra.',
    ],
    [
      'como-ir-de-rio-a-buzios',
      'De puerta a puerta y sin paradas, solo con tu grupo. Es lo más cómodo con chicos o valijas grandes.',
      'De puerta a puerta y sin paradas, solo con tu grupo. Es lo más cómodo con niños o maletas grandes.',
    ],
    [
      'paseo-en-barco-arraial-do-cabo',
      'Hay salidas a la mañana y a la tarde: elegís el horario al reservar.',
      'Hay salidas por la mañana y por la tarde: eliges el horario al reservar.',
    ],
    [
      'excursion-arraial-do-cabo-desde-buzios',
      'La van te busca en el hotel y vos solo elegís la fecha. Podés cancelar gratis hasta 24 horas antes.',
      'La van te busca en el hotel y tú solo eliges la fecha. Puedes cancelar gratis hasta 24 horas antes.',
    ],
    [
      'mejores-playas-de-buzios',
      'Mar agitado y paradores sobre la arena. De acá sale el sendero a Olho de Boi.',
      'Mar agitado y bares sobre la arena. De aquí sale el sendero a Olho de Boi.',
    ],
    ['como-llegar-a-arraial-do-cabo', 'Llegá sin pensar en la ruta', 'Llega sin pensar en la ruta'],
    [
      'que-hacer-en-arraial-do-cabo',
      'Si preferís manejar, el [cuatriciclo](/passeios/quadriciclo-arraial-do-cabo) sale en caravana con un guía por senderos de arena. Quien maneja necesita licencia de conducir.',
      'Si prefieres manejar, la [cuatrimoto](/passeios/quadriciclo-arraial-do-cabo) sale en caravana con un guía por senderos de arena. Quien maneja necesita licencia de conducir.',
    ],
    [
      'buzios-o-arraial-do-cabo',
      'Barco a la playa do Farol, buceo y buggy por los médanos',
      'Barco a la playa do Farol, buceo y buggy por las dunas',
    ],
    [
      'que-hacer-en-cabo-frio',
      'Los Médanos do Peró son uno de los paisajes más abiertos de Cabo Frio. El [buggy](/passeios/buggy-cabo-frio) pasa por los médanos y por las playas do Peró y das Conchas, y el [cuatriciclo](/passeios/quadriciclo-cabo-frio) sale en caravana con un guía. Quien maneja necesita licencia de conducir.',
      'Las Dunas do Peró son uno de los paisajes más abiertos de Cabo Frio. El [buggy](/passeios/buggy-cabo-frio) pasa por las dunas y por las playas do Peró y das Conchas, y la [cuatrimoto](/passeios/quadriciclo-cabo-frio) sale en caravana con un guía. Quien maneja necesita licencia de conducir.',
    ],
    [
      'buceo-en-arraial-do-cabo',
      'Traje de baño, toalla, protector solar, algo liviano para comer y un documento con foto. Si sos certificado, tu credencial.',
      'Traje de baño, toalla, protector solar, algo liviano para comer y un documento con foto. Si eres certificado, tu credencial.',
    ],
    [
      'como-llegar-a-buzios-desde-argentina-y-chile',
      'El vuelo a Río tarda unas 3 horas, y después quedan unas 3 horas por ruta. A eso sumale los tiempos de aeropuerto y migraciones.',
      'El vuelo a Río tarda unas 3 horas, y después quedan unas 3 horas por ruta. A eso súmale los tiempos de aeropuerto y migraciones.',
    ],
    [
      'mejor-epoca-para-ir-a-buzios',
      'Con sol, lo mejor es arrancar por el mar: la [goleta](/passeios/escuna-buzios) o el [catamarán](/passeios/catamara-buzios). En los días más frescos, el [buggy](/passeios/buggy-buzios) y el [city tour](/passeios/city-tour-buzios) muestran las playas y los miradores por tierra.',
      'Con sol, lo mejor es empezar por el mar: la [goleta](/passeios/escuna-buzios) o el [catamarán](/passeios/catamara-buzios). En los días más frescos, el [buggy](/passeios/buggy-buzios) y el [city tour](/passeios/city-tour-buzios) muestran las playas y los miradores por tierra.',
    ],
  ];
  assert.equal(new Set(FRASES_CONFERIDAS.map(([slug]) => slug)).size, GUIAS.length, 'uma frase de cada guia');
  for (const [slug, argentina, neutra] of FRASES_CONFERIDAS) {
    const i = GUIAS.findIndex((g) => g.slug === slug);
    assert.ok(i >= 0, slug);
    assert.ok(textos(AR[i]).includes(argentina), `${slug} (es-ar): ${argentina}`);
    assert.ok(textos(ES[i]).includes(neutra), `${slug} (es): ${neutra}`);
    assert.ok(!textos(ES[i]).includes(argentina), `${slug}: a frase argentina vazou para o neutro`);
    assert.equal(neutro(argentina), neutra);
  }
});

test('o campo es-ar só existe onde a frase muda, e o argentino vira o neutro pela regra, palavra por palavra', () => {
  const objetos = versoes([GUIAS, GRUPOS_GUIAS]);
  assert.ok(objetos.length >= 100, `só ${objetos.length} campos com versão argentina`);
  for (const o of objetos) {
    assert.deepEqual(Object.keys(o).sort(), ['es', 'es-ar'], o.es);
    assert.notEqual(o['es-ar'], o.es, `versão argentina igual à neutra: ${o.es}`);
    // a versão argentina tem algo que a regra troca (um verbo no vos, "a la mañana", "paradores"...) e vira exatamente o neutro
    assert.notEqual(neutro(o['es-ar'] as string), o['es-ar'], `versão argentina sem nada que mude no neutro: ${o['es-ar']}`);
    assert.equal(neutro(o['es-ar'] as string), o.es);
  }
  // nenhum guia inteiro duplicado: a versão argentina fica em campos de texto, e todo guia tem pelo menos um
  for (const g of GUIAS as Guia[]) {
    assert.ok(versoes(g).length > 0, `${g.slug}: sem nenhum campo com versão argentina`);
    assert.equal(typeof g.slug, 'string');
  }
});

test('as duas versões têm a mesma forma: links, números, pontuação e tamanho das listas', () => {
  const forma = (t: string) => ({
    links: [...t.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]),
    marcadores: t.match(/\{\w+\}/g) ?? [],
    numeros: t.match(/\d+(?:[.,]\d+)?/g) ?? [],
    fim: t.slice(-1),
    maiuscula: /^[¿¡]?\p{Lu}/u.test(t),
  });
  for (let i = 0; i < GUIAS.length; i++) {
    const es = textos(ES[i]);
    const ar = textos(AR[i]);
    assert.equal(es.length, ar.length, GUIAS[i].slug);
    for (let j = 0; j < es.length; j++) assert.deepEqual(forma(es[j]), forma(ar[j]), `${GUIAS[i].slug}: ${es[j]}`);
    assert.equal(ES[i].secoes.length, AR[i].secoes.length);
    assert.equal(ES[i].perguntas.length, AR[i].perguntas.length);
    assert.equal(ES[i].ficha.length, AR[i].ficha.length);
    ES[i].secoes.forEach((s, k) => {
      assert.equal(s.paragrafos.length, AR[i].secoes[k].paragrafos.length, `${GUIAS[i].slug}#${s.id}`);
      assert.equal(s.detalhes?.length, AR[i].secoes[k].detalhes?.length, `${GUIAS[i].slug}#${s.id}`);
      assert.deepEqual(
        s.tabela?.linhas.map((l) => l.length),
        AR[i].secoes[k].tabela?.linhas.map((l) => l.length),
      );
    });
  }
  assert.deepEqual(titulosGrupos('es'), titulosGrupos('es-ar'), 'os títulos dos grupos não têm verbo: iguais nas duas versões');
});
