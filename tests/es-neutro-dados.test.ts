import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS, CIDADES, PASSEIOS, obterPasseio } from '../src/data/passeios.ts';
import { LUGARES, TRAJETOS, VEICULOS } from '../src/data/transfer.ts';
import { texto } from '../src/i18n/conteudo.ts';
import { caminhoPublico } from '../src/i18n/enderecos.ts';
import { AVISOS_VOUCHER, IMPORTANTE_VOUCHER } from '../src/lib/voucher-textos.ts';

// O espanhol dos dados (passeios, transfer e avisos do voucher) tem duas versões: o 'es' neutro, com "tú", e o
// 'es-ar' argentino, com "vos" e as palavras locais, que só existe no campo em que a frase muda. Aqui se confere
// que o neutro ficou neutro e que o argentino continua palavra por palavra como o texto que o site tinha antes.

type Traduzido = { pt: unknown; en: unknown; es: string | string[]; 'es-ar'?: string | string[] };

/** O que não pode aparecer no espanhol neutro: o vos, o usted e os argentinismos que o site usava. */
const PROIBIDAS = new Set([
  'vos',
  'sos',
  'usted',
  'ustedes',
  'consulte',
  'valija',
  'valijas',
  'chico',
  'chicos',
  'arribo',
  'arribos',
  'médano',
  'médanos',
  'cuatriciclo',
  'cuatriciclos',
  'acá',
  'campera',
  'plata',
  'colectivo',
  'remís',
  'pileta',
  'boliche',
  'pollera',
  'frutilla',
  'palta',
  'parador',
  'paradores',
]);

/** Palavras terminadas em vogal acentuada que NÃO são verbo no vos (lugares, "más", "después", "prevé"...). */
const NAO_VERBOS = new Set([
  'más',
  'después',
  'país',
  'así',
  'demás',
  'además',
  'está',
  'estás',
  'sí',
  'qué',
  'ahí',
  'allí',
  'aquí',
  'allá',
  'tú',
  'mí',
  'través',
  'inglés',
  'portugués',
  'francés',
  'interés',
  'detrás',
  'atrás',
  'jamás',
  'quizás',
  'café',
  'menú',
  'río',
  'prevé',
  'josé',
  'geribá',
  'peró',
  'itajurú',
  'perú',
  'maracaná',
  'búzios',
  'será',
  'habrá',
  'podrá',
]);

/** As palavras suspeitas de um texto neutro: proibidas, ou com cara de verbo no vos (terminadas em -ás/-és/-ís/-á/-é/-í). */
function suspeitas(s: string): string[] {
  const achadas: string[] = [];
  for (const w of s.match(/\p{L}+/gu) ?? []) {
    const l = w.toLowerCase();
    if (PROIBIDAS.has(l)) achadas.push(w);
    else if (/(ás|és|ís|á|é|í)$/u.test(l) && !NAO_VERBOS.has(l)) achadas.push(`${w}?`);
  }
  return achadas;
}

/** Todos os campos traduzidos (com chave es) dentro de um dado, com a trilha de cada um. */
function campos(valor: unknown, trilha: string, saida: { trilha: string; campo: Traduzido }[] = []) {
  if (valor === null || typeof valor !== 'object') return saida;
  const o = valor as Record<string, unknown>;
  if (typeof o.es === 'string' || Array.isArray(o.es)) {
    saida.push({ trilha, campo: o as Traduzido });
    return saida;
  }
  for (const [k, v] of Object.entries(o)) campos(v, `${trilha}.${k}`, saida);
  return saida;
}

const lista = (v: string | string[]) => (Array.isArray(v) ? v : [v]);

const DADOS = [
  ...campos(PASSEIOS, 'PASSEIOS'),
  ...campos(CATEGORIAS, 'CATEGORIAS'),
  ...campos(CIDADES, 'CIDADES'),
  ...campos(LUGARES, 'LUGARES'),
  ...campos(TRAJETOS, 'TRAJETOS'),
  ...campos(VEICULOS, 'VEICULOS'),
];

test('o espanhol neutro dos passeios e do transfer não tem vos, usted nem argentinismo', () => {
  assert.ok(DADOS.length > 200, `poucos campos achados: ${DADOS.length}`);
  const achados = DADOS.flatMap(({ trilha, campo }) =>
    lista(campo.es).flatMap((t) => {
      const s = suspeitas(t);
      return s.length ? [`${trilha}: ${s.join(', ')} em "${t}"`] : [];
    }),
  );
  assert.deepEqual(achados, []);
});

test('a versão argentina só entra onde a frase muda, com a mesma forma e um traço argentino', () => {
  const comAr = DADOS.filter(({ campo }) => campo['es-ar'] !== undefined);
  assert.ok(comAr.length >= 40, `só ${comAr.length} campos com es-ar`);
  for (const { trilha, campo } of comAr) {
    const ar = campo['es-ar'] as string | string[];
    assert.equal(Array.isArray(ar), Array.isArray(campo.es), `${trilha}: es e es-ar de formas diferentes`);
    assert.equal(lista(ar).length, lista(campo.es).length, `${trilha}: listas de tamanhos diferentes`);
    assert.notDeepEqual(ar, campo.es, `${trilha}: es-ar igual ao es`);
    for (const t of lista(ar)) assert.ok(t.trim(), `${trilha}: es-ar vazio`);
    // um es-ar sem vos nem palavra local não teria por que existir
    assert.ok(
      lista(ar).some((t) => suspeitas(t).length),
      `${trilha}: es-ar sem nada de argentino: ${JSON.stringify(ar)}`,
    );
  }
});

// as frases que mudaram, lado a lado: o neutro de agora e o texto argentino que o site tinha antes
const PARES: {
  slug: string;
  campo: 'nome' | 'resumo' | 'descricao' | 'inclui' | 'naoInclui' | 'levar';
  item?: number;
  es: string;
  ar: string;
}[] = [
  { slug: 'quadriciclo-buzios', campo: 'nome', es: 'Paseo en Cuatrimoto por Búzios', ar: 'Paseo en Cuatriciclo por Búzios' },
  {
    slug: 'quadriciclo-buzios',
    campo: 'resumo',
    es: 'Tú al mando de una cuatrimoto por senderos de tierra y playas más salvajes.',
    ar: 'Vos al mando de un cuatriciclo por senderos de tierra y playas más salvajes.',
  },
  { slug: 'quadriciclo-buzios', campo: 'inclui', item: 0, es: 'Cuatrimoto para hasta 2 personas', ar: 'Cuatriciclo para hasta 2 personas' },
  {
    slug: 'quadriciclo-arraial-do-cabo',
    campo: 'resumo',
    es: 'Senderos de arena y dunas de Arraial manejando tu propia cuatrimoto.',
    ar: 'Senderos de arena y médanos de Arraial manejando tu propio cuatriciclo.',
  },
  {
    slug: 'quadriciclo-cabo-frio',
    campo: 'resumo',
    es: 'Maneja una cuatrimoto por los senderos y dunas de Cabo Frio.',
    ar: 'Manejá un cuatriciclo por los senderos y médanos de Cabo Frio.',
  },
  {
    slug: 'buggy-cabo-frio',
    campo: 'resumo',
    es: 'Las Dunas do Peró y las playas de Cabo Frio a bordo de un buggy.',
    ar: 'Los Médanos do Peró y las playas de Cabo Frio a bordo de un buggy.',
  },
  {
    slug: 'city-tour-cabo-frio',
    campo: 'resumo',
    es: 'Fuerte São Mateus, Praia do Forte, las Dunas do Peró y la famosa Calle de los Bikinis.',
    ar: 'Fuerte São Mateus, Praia do Forte, los Médanos do Peró y la famosa Calle de los Bikinis.',
  },
  {
    slug: 'full-day-cabo-frio',
    campo: 'inclui',
    item: 3,
    es: 'Paradas en el Fuerte São Mateus, la Praia do Forte y las Dunas do Peró',
    ar: 'Paradas en el Fuerte São Mateus, la Praia do Forte y los Médanos do Peró',
  },
  {
    slug: 'lancha-buzios',
    campo: 'resumo',
    es: 'La lancha solo para tu grupo, con marinero, para hasta 6 personas. Elige 2 o 4 horas.',
    ar: 'La lancha solo para tu grupo, con marinero, para hasta 6 personas. Elegí 2 o 4 horas.',
  },
  {
    slug: 'mergulho-arraial-do-cabo',
    campo: 'levar',
    item: 2,
    es: 'Algo liviano para comer (evita comidas pesadas antes)',
    ar: 'Algo liviano para comer (evitá comidas pesadas antes)',
  },
  {
    slug: 'city-tour-rio-de-janeiro',
    campo: 'levar',
    item: 2,
    es: 'Chaqueta liviana (en el Corcovado puede haber viento)',
    ar: 'Campera liviana (en el Corcovado puede haber viento)',
  },
  // "consulte" era usted, proibido nas duas versões: no neutro vira tú e no argentino, vos
  {
    slug: 'helicoptero-buzios',
    campo: 'naoInclui',
    item: 0,
    es: 'Traslado hasta el helipuerto (consulta por transfer)',
    ar: 'Traslado hasta el helipuerto (consultá por transfer)',
  },
  {
    slug: 'escuna-buzios',
    campo: 'naoInclui',
    item: 0,
    es: 'Traslado hasta el punto de embarque (consulta por transfer)',
    ar: 'Traslado hasta el punto de embarque (consultá por transfer)',
  },
];

test('as frases que mudaram: neutro com tú no es, texto argentino de antes no es-ar', () => {
  for (const par of PARES) {
    const p = obterPasseio(par.slug);
    assert.ok(p, par.slug);
    const campo = p[par.campo] as Traduzido;
    const em = (idioma: 'es' | 'es-ar') => {
      const v = texto(campo as { pt: unknown; en: unknown; es: string | string[]; 'es-ar'?: string | string[] }, idioma);
      return par.item === undefined ? v : (v as string[])[par.item];
    };
    assert.equal(em('es'), par.es, `${par.slug}.${par.campo} es`);
    assert.equal(em('es-ar'), par.ar, `${par.slug}.${par.campo} es-ar`);
  }
  // trechos dentro de descrições longas
  const lancha = obterPasseio('lancha-privativa-arraial-do-cabo')!;
  assert.match(texto(lancha.descricao, 'es'), /^Escapa de los barcos llenos y conoce .* el recorrido contigo y tu grupo, /);
  assert.match(texto(lancha.descricao, 'es-ar'), /^Escapá de los barcos llenos y conocé .* el recorrido con ustedes, /);
  const escuna = obterPasseio('escuna-cabo-frio')!;
  assert.match(texto(escuna.descricao, 'es'), /ideales para los niños\..*¿Te alojas en Búzios/s);
  assert.match(texto(escuna.descricao, 'es-ar'), /ideales para los chicos\..*¿Te alojás en Búzios/s);
  const fullDay = obterPasseio('full-day-buzios')!;
  assert.match(texto(fullDay.descricao, 'es'), /eliges entre una nueva fecha/);
  assert.match(texto(fullDay.descricao, 'es-ar'), /elegís entre una nueva fecha/);
  // a categoria e as malas do transfer
  assert.equal(texto(CATEGORIAS['buggy-quadriciclo'].nome, 'es'), 'Buggy y cuatrimoto');
  assert.equal(texto(CATEGORIAS['buggy-quadriciclo'].nome, 'es-ar'), 'Buggy y cuatriciclo');
  assert.equal(texto(VEICULOS.carro.malas, 'es'), 'Hasta 3 maletas medianas, o 2 grandes y 2 de mano');
  assert.equal(texto(VEICULOS.carro.malas, 'es-ar'), 'Hasta 3 valijas medianas, o 2 grandes y 2 de mano');
  assert.equal(texto(VEICULOS.van.malas, 'es'), '1 maleta grande y 1 de mano por persona');
  assert.equal(texto(VEICULOS.van.malas, 'es-ar'), '1 valija grande y 1 de mano por persona');
  // onde nada muda, as duas versões leem o mesmo texto
  const goleta = obterPasseio('escuna-buzios')!;
  assert.equal(texto(goleta.nome, 'es-ar'), texto(goleta.nome, 'es'));
  assert.equal(texto(goleta.nome, 'es'), 'Paseo en Goleta por Búzios');
});

test('o nome do passeio de quadriciclo muda só no texto: o endereço continua cuatriciclo-...', () => {
  for (const slug of ['quadriciclo-buzios', 'quadriciclo-arraial-do-cabo', 'quadriciclo-cabo-frio']) {
    const p = obterPasseio(slug)!;
    assert.match(texto(p.nome, 'es'), /^Paseo en Cuatrimoto por /);
    assert.match(texto(p.nome, 'es-ar'), /^Paseo en Cuatriciclo por /);
    const caminho = caminhoPublico('es', `/passeios/${slug}`);
    assert.equal(caminhoPublico('es-ar', `/passeios/${slug}`), caminho);
    assert.match(caminho, /^\/paseos\/cuatriciclo-/);
  }
});

test('voucher: avisos neutros com "Presenta" e a lista argentina inteira com "Presentá"', () => {
  const avisos = AVISOS_VOUCHER as Traduzido;
  assert.equal(lista(avisos.es).length, 3);
  assert.deepEqual(lista(avisos.es).flatMap(suspeitas), []);
  assert.match(lista(avisos.es)[0], /^Presenta este voucher/);
  assert.ok(avisos['es-ar']);
  assert.equal(lista(avisos['es-ar']).length, 3);
  assert.match(lista(avisos['es-ar'])[0], /^Presentá este voucher/);
  assert.deepEqual(lista(avisos['es-ar']).slice(1), lista(avisos.es).slice(1));
  const importante = IMPORTANTE_VOUCHER as Traduzido;
  assert.equal(importante.es, 'Importante');
  assert.equal(importante['es-ar'], undefined);
});
