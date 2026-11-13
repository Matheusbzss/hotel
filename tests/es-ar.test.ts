import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TEXTOS_GUIA } from '../src/components/guia/textos-guia.ts';
import { ALT_FOTOS, altDaFoto } from '../src/data/fotos-alt.ts';
import { GRUPOS_GUIAS, GUIAS, fraseDoGuia, guiaNoIdioma } from '../src/data/guias.ts';
import { CATEGORIAS, CIDADES, PASSEIOS } from '../src/data/passeios.ts';
import { LUGARES, TRAJETOS, VEICULOS } from '../src/data/transfer.ts';
import { CANCELAMENTO } from '../src/content/legal/cancelamento.ts';
import { PRIVACIDADE } from '../src/content/legal/privacidade.ts';
import { TERMOS } from '../src/content/legal/termos.ts';
import { CANCELAMENTO_ONLINE, PRIVACIDADE_EMAILS, PRIVACIDADE_ONLINE, TERMOS_ONLINE } from '../src/content/legal/online.ts';
import { frasesDoDocumento } from '../src/content/legal/argentino.ts';
import { HREFLANG, LOCALE_INTL, OG_LOCALE, rota } from '../src/i18n/config.ts';
import { texto } from '../src/i18n/conteudo.ts';
import { caminhoInterno, caminhoPublico } from '../src/i18n/enderecos.ts';
import { ajustesAR } from '../src/i18n/es-ar.ts';
import { dicionario } from '../src/i18n/index.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { TEXTOS_CONSULTA } from '../src/lib/consulta-textos.ts';
import { EsquemaCotacao } from '../src/lib/cotacao.ts';
import { TEXTOS_EMAIL } from '../src/lib/email/textos.ts';
import { formatarHora } from '../src/lib/horarios.ts';
import { DDIS, PAIS_PADRAO } from '../src/lib/validacao.ts';
import { AVISOS_VOUCHER, IMPORTANTE_VOUCHER } from '../src/lib/voucher-textos.ts';
import { VERBOS_VOS, neutroDoArgentino, palavras, suspeitasDeVos } from './ajuda/regra-neutra.ts';
import { CAMAS, COMODIDADES, NOMES_GRUPO_COMODIDADE, REGRAS_EVENTO, REGRAS_FUMAR } from '../src/data/comodidades.ts';
import { CANCELAMENTO_DAS_CASAS, CASAS_PARA_CADASTRAR, regrasDeTodasAsCasas } from '../scripts/dados/casas.ts';

// Etapa 3, lote 2, a integração: o /es é o espanhol neutro (com "tú") e o /es-ar é o texto argentino que o site
// tinha antes (com "vos"), palavra por palavra, só nas frases que diferem. Os testes de cada frente
// (tests/es-neutro-*.test.ts) olham cada arquivo de perto; este olha o site inteiro de uma vez: TODO texto em
// espanhol, de todas as fontes, lado a lado nas duas versões, mais o que o es-ar muda fora dos textos (endereços,
// horas, fotos, cotação, moeda e país dos formulários).
//
// A prova de que o es-ar é "o texto de antes" não depende do git: a regra argentino → neutro de
// tests/ajuda/regra-neutra.ts, aplicada a CADA frase argentina, tem de devolver exatamente a frase neutra (pega um
// erro de digitação em qualquer dos lados), e a quantidade de frases com versão argentina por fonte é fixa (pega
// uma versão argentina que suma em silêncio).

/* ------------------------------------------------------------------------------------------------------------ */
/* O corpus: cada texto em espanhol do site, nas duas versões, com a fonte de onde veio                            */
/* ------------------------------------------------------------------------------------------------------------ */

interface Par {
  fonte: string;
  es: string;
  ar: string;
}

const CORPUS: Par[] = [];
const juntar = (fonte: string, es: string[], ar: string[]) => {
  assert.equal(ar.length, es.length, `${fonte}: as duas versões têm quantidades diferentes de textos`);
  es.forEach((e, i) => CORPUS.push({ fonte, es: e, ar: ar[i] }));
};

/** Todas as folhas de texto de um objeto, com o caminho (home.diaRegras[0], faq[3].r…). */
function folhas(v: unknown, caminho = ''): [string, string][] {
  if (Array.isArray(v)) return v.flatMap((x, i) => folhas(x, `${caminho}[${i}]`));
  if (typeof v === 'object' && v !== null) return Object.entries(v).flatMap(([k, x]) => folhas(x, caminho ? `${caminho}.${k}` : k));
  return typeof v === 'string' ? [[caminho, v]] : [];
}

// 1. o dicionário
const ES = dicionario('es');
const AR = dicionario('es-ar');
{
  const doAr = new Map(folhas(AR));
  for (const [caminho, es] of folhas(ES)) CORPUS.push({ fonte: `dicionario ${caminho}`, es, ar: doAr.get(caminho) as string });
}

// 2. os guias (todo campo de texto de um guia já resolvido no idioma) e os títulos dos grupos
const CHAVES_DE_TEXTO_GUIA = new Set([
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
function textosDoGuia(valor: unknown, saida: string[] = []): string[] {
  if (Array.isArray(valor)) valor.forEach((v) => textosDoGuia(v, saida));
  else if (typeof valor === 'object' && valor !== null) {
    for (const [k, v] of Object.entries(valor)) {
      if (CHAVES_DE_TEXTO_GUIA.has(k)) (Array.isArray(v) ? v.flat() : [v]).forEach((t) => saida.push(t as string));
      else if (typeof v === 'object') textosDoGuia(v, saida);
    }
  }
  return saida;
}
for (const g of GUIAS) juntar(`guia ${g.slug}`, textosDoGuia(guiaNoIdioma(g, 'es')), textosDoGuia(guiaNoIdioma(g, 'es-ar')));
juntar(
  'guias grupos',
  GRUPOS_GUIAS.map((g) => fraseDoGuia(g.titulo, 'es')),
  GRUPOS_GUIAS.map((g) => fraseDoGuia(g.titulo, 'es-ar')),
);

// 3. os passeios e o transfer (todo campo com a chave es, por dentro dos dados)
type Campo = { pt: unknown; en: unknown; es: string | string[]; 'es-ar'?: string | string[] };
function campos(valor: unknown, trilha: string, saida: { trilha: string; campo: Campo }[] = []) {
  if (valor === null || typeof valor !== 'object') return saida;
  const o = valor as Record<string, unknown>;
  if (typeof o.es === 'string' || Array.isArray(o.es)) {
    saida.push({ trilha, campo: o as Campo });
    return saida;
  }
  for (const [k, v] of Object.entries(o)) campos(v, `${trilha}.${k}`, saida);
  return saida;
}
const lista = (v: string | string[]) => (Array.isArray(v) ? v : [v]);
const DADOS = [
  ...campos(PASSEIOS, 'passeios'),
  ...campos(CATEGORIAS, 'categorias'),
  ...campos(CIDADES, 'cidades'),
  ...campos(LUGARES, 'transfer lugares'),
  ...campos(TRAJETOS, 'transfer trajetos'),
  ...campos(VEICULOS, 'transfer veiculos'),
];
for (const { trilha, campo } of DADOS) juntar(trilha, lista(texto(campo, 'es')), lista(texto(campo, 'es-ar')));

// 4. os textos legais, os de hoje, os da versão do pagamento online e a privacidade de hoje com os e-mails ligados
// (src/content/legal/online.ts)
for (const [nome, doc] of [
  ['termos', TERMOS],
  ['cancelamento', CANCELAMENTO],
  ['privacidade', PRIVACIDADE],
  ['termos-online', TERMOS_ONLINE],
  ['cancelamento-online', CANCELAMENTO_ONLINE],
  ['privacidade-online', PRIVACIDADE_ONLINE],
  ['privacidade-emails', PRIVACIDADE_EMAILS],
] as const) {
  juntar(`legal ${nome}`, frasesDoDocumento(texto(doc, 'es')), frasesDoDocumento(texto(doc, 'es-ar')));
}

// 5. o voucher em PDF (os textos moram em src/lib/voucher-textos.ts, importável sem o pdf-lib)
juntar('voucher AVISOS', lista(texto(AVISOS_VOUCHER, 'es')), lista(texto(AVISOS_VOUCHER, 'es-ar')));
juntar('voucher IMPORTANTE', [texto(IMPORTANTE_VOUCHER, 'es')], [texto(IMPORTANTE_VOUCHER, 'es-ar')]);

// 6. os textos alternativos das fotos
for (const [foto, alt] of Object.entries(ALT_FOTOS)) CORPUS.push({ fonte: `foto ${foto}`, es: alt.es, ar: altDaFoto(foto, 'es-ar') });

// 7. os textos fixos dos guias: o mapa por versão (src/components/guia/textos-guia.ts) e o que está escrito nas páginas
assert.deepEqual(Object.keys(TEXTOS_GUIA['es-ar']), Object.keys(TEXTOS_GUIA.es));
for (const k of Object.keys(TEXTOS_GUIA.es) as (keyof typeof TEXTOS_GUIA.es)[]) {
  CORPUS.push({ fonte: `TEXTOS_GUIA.${k}`, es: TEXTOS_GUIA.es[k], ar: TEXTOS_GUIA['es-ar'][k] });
}
/** Só o que está entre aspas no fonte (os textos escritos ali); comentários, em português, ficam de fora. */
const literais = (fonte: string): string[] =>
  [...fonte.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .filter((s) => /\p{L}{3,}/u.test(s));
for (const arquivo of [
  path.join('src', 'components', 'guia', 'CartaoGuia.tsx'),
  path.join('src', 'app', '[locale]', 'guias', 'page.tsx'),
  path.join('src', 'app', '[locale]', 'guias', '[slug]', 'page.tsx'),
]) {
  // sem versão argentina própria: o que está escrito ali serve às duas versões, então precisa ser neutro
  for (const t of literais(readFileSync(arquivo, 'utf8'))) CORPUS.push({ fonte: `fonte ${arquivo}`, es: t, ar: t });
}

// 8. a Etapa 6, fora dos dicionários: os e-mails automáticos (src/lib/email/textos.ts) e as páginas "Consultar mi
// pedido" e de sair da lista dos lembretes (src/lib/consulta-textos.ts), com as mesmas chaves nas duas versões
for (const [fonte, es, ar] of [
  ['email', TEXTOS_EMAIL.es, TEXTOS_EMAIL['es-ar']],
  ['consulta', TEXTOS_CONSULTA.es, TEXTOS_CONSULTA['es-ar']],
] as const) {
  const doAr = new Map(folhas(ar));
  assert.deepEqual(
    [...doAr.keys()],
    folhas(es).map(([c]) => c),
    `${fonte}: o es-ar tem de ter as chaves do es`,
  );
  for (const [caminho, t] of folhas(es)) CORPUS.push({ fonte: `${fonte} ${caminho}`, es: t, ar: doAr.get(caminho) as string });
}

// 9. a Etapa 7: as listas fixas das casas (src/data/comodidades.ts) e os textos das duas casas prontas para cadastrar
// (scripts/dados/casas.ts), que vão para o banco. São neutros (sem tú nem vos); a versão argentina só entra onde a
// palavra muda (a rede, "hamaca paraguaya", e a lavanderia, "lavarropas")
for (const { trilha, campo } of [
  ...campos({ COMODIDADES, CAMAS, NOMES_GRUPO_COMODIDADE, REGRAS_EVENTO, REGRAS_FUMAR }, 'casas listas'),
  ...campos({ casas: CASAS_PARA_CADASTRAR, regras: regrasDeTodasAsCasas(12), cancelamento: CANCELAMENTO_DAS_CASAS }, 'casas cadastro'),
]) {
  juntar(trilha, lista(texto(campo, 'es')), lista(texto(campo, 'es-ar')));
}

/* ------------------------------------------------------------------------------------------------------------ */
/* As regras                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------ */

const temPalavra = (s: string, p: string) => new RegExp(`(?<!\\p{L})${p}(?!\\p{L})`, 'iu').test(s);

/** As formas de "vos" que o site tinha (presente e imperativo): as da regra, mais o pronome. */
const FORMAS_DE_VOS = ['vos', ...Object.keys(VERBOS_VOS)];

/**
 * "usted" (singular, formal) é proibido nas duas versões; "consulte" era a única forma que o site tinha. "ustedes" é o
 * plural comum de toda a América (não é formal): sai do neutro, que fala com uma pessoa ("contigo y tu grupo"), mas o
 * es-ar conserva o texto de hoje da lancha de Arraial ("el marinero arma el recorrido con ustedes").
 */
const FORMAS_DE_USTED = ['usted', 'ustedes', 'consulte'];
const USTEDES_DE_HOJE = 'el marinero arma el recorrido con ustedes';

/**
 * As palavras argentinas trocadas no neutro (valija, chico no sentido de criança, arribos, médanos, cuatriciclo, acá...),
 * inclusive as três dos textos alternativos das fotos (brochette, picadas, baúl) e as das casas (heladera, lavarropas,
 * mesada).
 */
const ARGENTINISMOS = `valija valijas chico chicos arribo arribos médano médanos cuatriciclo cuatriciclos acá seña señas campera
  resúmenes parador paradores plata colectivo colectivos remís pileta piletas boliche boliches pollera frutilla palta
  brochette picadas baúl heladera heladeras lavarropas mesada`
  .split(/\s+/)
  .filter(Boolean);

const PROIBIDAS_NO_NEUTRO = new Set([...FORMAS_DE_VOS, ...FORMAS_DE_USTED, ...ARGENTINISMOS]);

/** O que nunca pode sobrar numa frase neutra depois das trocas: gênero errado e "tú" depois de preposição. */
const ERROS_NO_NEUTRO: [RegExp, string][] = [
  [/(?<!\p{L})(el|un|este|ese|aquel|los|unos|estos|esos|aquellos|propios?|mismos?)\s+cuatrimotos?(?!\p{L})/iu, 'cuatrimoto é feminino'],
  [/(?<!\p{L})(el|un|este|ese|los|unos|estos|esos)\s+(dunas?|llegadas?)(?!\p{L})/iu, 'dunas e llegadas são femininos'],
  [
    /(?<!\p{L})(con|para|a|de|por|sin|sobre|hacia|ante|entre|según)\s+tú(?!\p{L})/iu,
    '"vos" depois de preposição vira contigo/ti, nunca "tú"',
  ],
  [/(?<!\p{L})sos(?!\p{L})/iu, '"sos" vira "eres"'],
  [/(?<!\p{L})vos(?!\p{L})/iu, '"vos" vira "tú" ou some'],
];

/**
 * As formas do "tú" que o site nunca teve: a versão argentina é o texto de antes, então nenhuma delas pode aparecer
 * no es-ar. Só as que não se confundem com outra coisa ("pagas" e "sigue" ficam de fora: "entradas pagas",
 * "el chofer sigue tu llegada" existiam antes).
 */
const FORMAS_SO_DO_NEUTRO = `tú contigo eres puedes tienes quieres eliges necesitas revisas cancelas sabes prefieres sigues conoces
  vienes haces sales decides alojas viajas recibes llegas pierdes presentas registras terminas arrepientes declaras comprometes
  permites pides mandas escribes dependes acuerdas cambias navegas animas buscas aprendes manejas disfrutas
  escríbenos contáctanos avísanos avísame mándanos dinos déjanos muéstralo muéstralos muéstraselo llévalo fíjate acuérdate
  súmale confírmalas confírmalos infórmanos envíanos envíalo haz
  cuatrimoto cuatrimotos maleta maletas llegadas aquí anticipo chaqueta brocheta maletero`
  .split(/\s+/)
  .filter(Boolean);
const EXPRESSOES_SO_DO_NEUTRO = /(?<!\p{L})(a ti|por la mañana|por la tarde|estados? de cuenta)(?!\p{L})/iu;

/** O "seña de ok" das fotos de mergulho é o gesto, não o sinal da reserva: não conta como argentinismo. */
const semGestos = (s: string) => s.replace(/seña de ok/gi, '');

/**
 * Quantas frases diferem entre o es e o es-ar em cada fonte, hoje. É a trava contra uma versão argentina sumir em
 * silêncio: apagar uma entrada de src/i18n/es-ar.ts, ou um { es, 'es-ar' } virar texto simples, não muda o neutro e a
 * regra não tem o que comparar. Mudou uma frase de propósito (uma frase nova com vos, ou uma que deixou de precisar de
 * versão argentina)? Atualize o número da fonte aqui e diga o motivo no commit.
 */
const FRASES_COM_VERSAO_ARGENTINA: Record<string, number> = {
  // 112 do lote 2 (eram 121; 9 saíram com as frases do formulário antigo de pagamento, que ninguém mais lia)
  // + 11 da Etapa 4 (pagamento pela Stripe: Pix, recusa do cartão, contestação, reembolso, prazo)
  // + 2 da Etapa 8 (a garantia da chuva na inicial: "vos elegís", na versão de hoje e na do pagamento online)
  dicionario: 125,
  guia: 138,
  passeios: 54,
  transfer: 2,
  'legal termos': 12,
  'legal cancelamento': 12,
  'legal privacidade': 13,
  // as versões do pagamento online: as mesmas frases com vos, menos as trocadas, mais as novas com vos
  'legal termos-online': 12,
  'legal cancelamento-online': 12,
  'legal privacidade-online': 12,
  // a privacidade de hoje com os e-mails ligados: a de hoje, menos a frase do lembrete (trocada, agora sem verbo em vos)
  'legal privacidade-emails': 12,
  voucher: 1,
  // 9 de antes + 9 das casas (Etapa 7): mesada, hamacas, heladera, lavarropas e hamaca paraguaya
  foto: 18,
  TEXTOS_GUIA: 1,
  // Etapa 6: os e-mails automáticos e as páginas "Consultar mi pedido" e de sair da lista (as frases com verbo)
  // + 3 da revisão de 13/11: a confirmação da desistência (guardá, escribinos) e o "podés ignorar" do lembrete
  email: 18,
  consulta: 10,
  // Etapa 7: as comodidades da rede ("hamaca paraguaya") e da lavanderia ("lavarropas")
  casas: 2,
};
/** A fonte de um texto do corpus, no nível das chaves de FRASES_COM_VERSAO_ARGENTINA. */
const grupoDaFonte = (fonte: string): string => {
  if (fonte.startsWith('legal ')) return fonte.split(' ').slice(0, 2).join(' ');
  if (fonte.startsWith('transfer ')) return 'transfer';
  if (/^(categorias|cidades)[. ]/.test(fonte)) return 'passeios';
  if (fonte.startsWith('guias grupos')) return 'guia';
  return fonte.split(/[ .]/)[0];
};

/* ------------------------------------------------------------------------------------------------------------ */
/* (a) o dicionário do es-ar tem exatamente as chaves do es                                                       */
/* ------------------------------------------------------------------------------------------------------------ */

test('(a) toda chave de ajustesAR existe no es.ts com o mesmo tipo, e o es-ar tem exatamente as chaves do es', () => {
  const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  let entradas = 0;
  const andar = (aj: unknown, base: unknown, caminho: string): void => {
    if (ehObjeto(aj)) {
      assert.ok(ehObjeto(base), `${caminho}: é objeto em es-ar.ts e não no es.ts`);
      for (const [k, v] of Object.entries(aj)) {
        assert.ok(k in base, `${caminho ? `${caminho}.` : ''}${k}: chave de es-ar.ts que não existe no es.ts`);
        andar(v, base[k], caminho ? `${caminho}.${k}` : k);
      }
      return;
    }
    entradas++;
    assert.equal(Array.isArray(aj), Array.isArray(base), `${caminho}: lista num lado e texto no outro`);
    assert.equal(typeof aj, typeof base, `${caminho}: tipos diferentes`);
    if (Array.isArray(aj)) assert.equal(aj.length, (base as unknown[]).length, `${caminho}: listas de tamanhos diferentes`);
  };
  andar(ajustesAR, ES, '');
  assert.equal(
    entradas,
    100,
    `${entradas} entradas em src/i18n/es-ar.ts; esperava 100 (89 textos + 11 listas inteiras; 11 dos textos são da Etapa 4 e as duas listas das garantias curtas, a de hoje e a do pagamento online, são da Etapa 8). Mudou uma frase argentina de propósito? Atualize este número.`,
  );
  // o dicionário mesclado: as mesmas chaves, na mesma ordem, com listas do mesmo tamanho
  const chaves = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(chaves) : ehObjeto(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, chaves(x)])) : typeof v;
  assert.deepEqual(chaves(AR), chaves(ES));
  assert.deepEqual(
    folhas(AR).map(([c]) => c),
    folhas(ES).map(([c]) => c),
  );
});

/* ------------------------------------------------------------------------------------------------------------ */
/* (b) e (6) o espanhol neutro, em todas as fontes, sem vos, usted nem palavra argentina                         */
/* ------------------------------------------------------------------------------------------------------------ */

test('(b) nenhum texto em espanhol neutro, em nenhuma fonte, tem vos, usted nem as palavras argentinas trocadas', () => {
  assert.ok(CORPUS.length > 1500, `corpus pequeno demais: ${CORPUS.length} textos`);
  const achados: string[] = [];
  for (const { fonte, es } of CORPUS) {
    const limpo = semGestos(es);
    for (const p of palavras(limpo)) if (PROIBIDAS_NO_NEUTRO.has(p)) achados.push(`${fonte}: "${p}" em "${es.slice(0, 90)}"`);
    // qualquer palavra terminada em -á/-é/-í(s) que não seja inocente: pega uma forma de vos que não está em lista nenhuma
    for (const s of suspeitasDeVos(limpo)) {
      achados.push(
        `${fonte}: "${s}" parece verbo em vos em "${es.slice(0, 90)}" (se for palavra inocente, acrescente em INOCENTES_COM_ACENTO_FINAL de tests/ajuda/regra-neutra.ts)`,
      );
    }
    for (const [re, motivo] of ERROS_NO_NEUTRO) {
      const m = limpo.match(re);
      if (m) achados.push(`${fonte}: "${m[0]}" (${motivo}) em "${es.slice(0, 90)}"`);
    }
  }
  assert.deepEqual(achados, []);
});

test('(6) os greps de qualidade do neutro, um a um, não acham nada no corpus inteiro', () => {
  const todoEs = CORPUS.map((p) => semGestos(p.es)).join('\n');
  for (const trecho of [
    'el cuatrimoto',
    'un cuatrimoto',
    'los cuatrimotos',
    'propio cuatrimoto',
    'los dunas',
    'el dunas',
    'los llegadas',
    'con tú',
    'para tú',
    'a tú',
    'de tú',
    'ustedes',
    'usted',
    'sos',
    'vos',
    'valija',
    'valijas',
    'chicos',
    'arribos',
    'médanos',
    'cuatriciclo',
    'acá',
  ]) {
    assert.ok(!temPalavra(todoEs, trecho), `"${trecho}" ainda aparece no espanhol neutro`);
  }
  for (const f of FORMAS_DE_VOS) assert.ok(!temPalavra(todoEs, f), `forma de vos "${f}" ainda aparece no espanhol neutro`);
});

test('nenhuma das duas versões usa "usted"; o "ustedes" de hoje fica só na lancha de Arraial do es-ar', () => {
  for (const { fonte, es, ar } of CORPUS) {
    for (const [versao, t] of [
      ['es', es],
      ['es-ar', ar],
    ] as const) {
      for (const p of palavras(t)) {
        if (versao === 'es-ar' && p === 'ustedes' && t.includes(USTEDES_DE_HOJE)) continue;
        assert.ok(!FORMAS_DE_USTED.includes(p), `"${p}" em ${versao} ${fonte}: ${t.slice(0, 90)}`);
      }
    }
  }
  const comUstedes = CORPUS.filter((p) => p.ar.includes(USTEDES_DE_HOJE));
  assert.equal(comUstedes.length, 1, 'só a descrição da lancha privativa de Arraial tem "con ustedes" no es-ar');
  assert.match(comUstedes[0].fonte, /^passeios\./);
  assert.ok(comUstedes[0].es.includes('contigo y tu grupo'), 'no neutro, a mesma frase fala com uma pessoa');
});

/* ------------------------------------------------------------------------------------------------------------ */
/* (c) e (6) a versão argentina é o texto de antes                                                                */
/* ------------------------------------------------------------------------------------------------------------ */

test('(c) o es-ar conserva o vos nas 10 frases aprovadas pelo dono, e o es diz o mesmo com tú', () => {
  const faqVoucher = (d: typeof ES) => d.faq.find((f) => f.p === '¿Cómo recibo mi voucher?')?.r ?? '';
  const termos = (idioma: 'es' | 'es-ar') => frasesDoDocumento(texto(TERMOS, idioma)).join('\n');
  // [onde, trecho argentino (como o site era), trecho neutro]
  const APROVADAS: [string, string, string, string, string][] = [
    [
      '1. título do topo da página inicial',
      AR.home.gancho,
      'Llegá y disfrutá. Del resto nos ocupamos nosotros.',
      ES.home.gancho,
      'Llega y disfruta.',
    ],
    ['2. título da caixa de reserva', AR.passeio.reservarTitulo, 'Reservá el tuyo', ES.passeio.reservarTitulo, 'Reserva el tuyo'],
    ['3. campo da data', AR.passeio.escolhaData, 'Elegí la fecha', ES.passeio.escolhaData, 'Elige la fecha'],
    ['4. frase do carrinho', AR.carrinho.semCobranca, 'revisás todo', ES.carrinho.semCobranca, 'revisas todo'],
    ['5. regra da chuva', AR.home.garantias[0].recebe, 'vos elegís', ES.home.garantias[0].recebe, 'tú eliges'],
    ['6. aviso do checkout', AR.checkout.indisponivelTexto, 'completás el pago', ES.checkout.indisponivelTexto, 'completas el pago'],
    ['7. erro dos termos', AR.checkout.erros.aceite, 'Tenés que aceptar', ES.checkout.erros.aceite, 'Tienes que aceptar'],
    ['8. FAQ do voucher', faqVoucher(AR), 'Podés descargarlo', faqVoucher(ES), 'Puedes descargarlo'],
    ['9. aviso do transfer', AR.transfer.naoCabe, 'las valijas', ES.transfer.naoCabe, 'las maletas'],
    ['10. termos, regra do quadriciclo', termos('es-ar'), 'un cuatriciclo necesitás', termos('es'), 'una cuatrimoto necesitas'],
  ];
  for (const [onde, ar, trechoAr, es, trechoEs] of APROVADAS) {
    assert.ok(ar.includes(trechoAr), `${onde}: o es-ar perdeu "${trechoAr}": ${ar.slice(0, 120)}`);
    assert.ok(es.includes(trechoEs), `${onde}: o es não tem "${trechoEs}": ${es.slice(0, 120)}`);
    assert.ok(!es.includes(trechoAr), `${onde}: o trecho argentino vazou para o es`);
    assert.ok(!ar.includes(trechoEs), `${onde}: o trecho neutro vazou para o es-ar`);
  }
  // "Elegí la fecha" aparece também no grupo e nos fechamentos dos guias
  assert.equal(AR.grupo.escolhaData, 'Elegí la fecha');
  assert.equal(ES.grupo.escolhaData, 'Elige la fecha');
  assert.ok(CORPUS.some((p) => p.fonte.startsWith('guia ') && p.ar.startsWith('Elegí la fecha') && p.es.startsWith('Elige la fecha')));
});

test('(6) o es-ar é o texto de antes: a regra argentino → neutro devolve cada frase do es, palavra por palavra', () => {
  // junta todas as divergências antes de falhar, para a lista inteira aparecer de uma vez
  const achados: string[] = [];
  const contagem: Record<string, number> = {};
  for (const { fonte, es, ar } of CORPUS) {
    for (const p of palavras(ar))
      if (FORMAS_SO_DO_NEUTRO.includes(p)) achados.push(`forma do tú "${p}" no es-ar ${fonte}: ${ar.slice(0, 90)}`);
    const m = ar.match(EXPRESSOES_SO_DO_NEUTRO);
    if (m) achados.push(`expressão do neutro "${m[0]}" no es-ar ${fonte}: ${ar.slice(0, 90)}`);
    if (es === ar) continue;
    const grupo = grupoDaFonte(fonte);
    contagem[grupo] = (contagem[grupo] ?? 0) + 1;
    // a regra tem de levar da frase argentina exatamente à neutra: um erro de digitação em qualquer lado aparece aqui
    const calculado = neutroDoArgentino(ar);
    if (calculado !== es) {
      let i = 0;
      while (i < calculado.length && calculado[i] === es[i]) i++;
      achados.push(
        `${fonte}: a regra não leva do es-ar ao es. A partir de "${es.slice(Math.max(0, i - 25), i + 35)}": pela regra viria "${calculado.slice(Math.max(0, i - 25), i + 35)}" (es-ar: "${ar.slice(0, 90)}")`,
      );
    }
  }
  assert.deepEqual(achados, []);
  assert.deepEqual(
    contagem,
    FRASES_COM_VERSAO_ARGENTINA,
    'frases com versão argentina por fonte: se uma sumiu, o /es-ar passou a mostrar o neutro nela; se mudou de propósito, atualize FRASES_COM_VERSAO_ARGENTINA',
  );
});

test('o único ponto em que o es-ar não é o texto de antes: "consulte" (usted) virou "consultá", e no es "consulta"', () => {
  const pares = CORPUS.filter((p) => /consult(á|a) por transfer/.test(p.ar));
  assert.ok(pares.length >= 2, 'os "(consulta por transfer)" dos barcos e do helicóptero');
  for (const p of pares) {
    assert.ok(p.ar.includes('(consultá por transfer)'), p.fonte);
    assert.ok(p.es.includes('(consulta por transfer)'), p.fonte);
  }
  assert.ok(!CORPUS.some((p) => /consulte/i.test(p.es) || /consulte/i.test(p.ar)));
});

/* ------------------------------------------------------------------------------------------------------------ */
/* (d) o que o es-ar muda fora dos textos                                                                         */
/* ------------------------------------------------------------------------------------------------------------ */

/** Os endereços públicos como estavam antes do lote 2 (src/i18n/enderecos.ts): nenhum slug muda, e o es-ar usa os do es. */
const SECOES_PUBLICAS: Record<string, { en: string; es: string }> = {
  passeios: { en: 'tours', es: 'paseos' },
  transfer: { en: 'transfer', es: 'traslado' },
  contato: { en: 'contact', es: 'contacto' },
  'casas-de-temporada': { en: 'holiday-homes', es: 'casas-de-temporada' },
  'politica-de-cancelamento': { en: 'cancellation-policy', es: 'politica-de-cancelacion' },
  'politica-de-privacidade': { en: 'privacy-policy', es: 'politica-de-privacidad' },
  'termos-de-uso': { en: 'terms-of-use', es: 'terminos-de-uso' },
};
const PASSEIOS_PUBLICOS: Record<string, { en: string; es: string }> = {
  'escuna-buzios': { en: 'schooner-buzios', es: 'goleta-buzios' },
  'catamara-buzios': { en: 'catamaran-buzios', es: 'catamaran-buzios' },
  'quadriciclo-buzios': { en: 'quad-bike-buzios', es: 'cuatriciclo-buzios' },
  'lancha-buzios': { en: 'private-speedboat-buzios', es: 'lancha-privada-buzios' },
  'jet-ski-buzios': { en: 'jet-ski-buzios', es: 'moto-de-agua-buzios' },
  'helicoptero-buzios': { en: 'helicopter-buzios', es: 'helicoptero-buzios' },
  'barco-arraial-do-cabo': { en: 'boat-tour-arraial-do-cabo', es: 'barco-arraial-do-cabo' },
  'mergulho-arraial-do-cabo': { en: 'scuba-diving-arraial-do-cabo', es: 'buceo-arraial-do-cabo' },
  'quadriciclo-arraial-do-cabo': { en: 'quad-bike-arraial-do-cabo', es: 'cuatriciclo-arraial-do-cabo' },
  'lancha-privativa-arraial-do-cabo': { en: 'private-speedboat-arraial-do-cabo', es: 'lancha-privada-arraial-do-cabo' },
  'mergulho-credenciado-arraial-do-cabo': { en: 'certified-divers-arraial-do-cabo', es: 'buceo-certificados-arraial-do-cabo' },
  'catamara-cabo-frio': { en: 'catamaran-cabo-frio', es: 'catamaran-cabo-frio' },
  'quadriciclo-cabo-frio': { en: 'quad-bike-cabo-frio', es: 'cuatriciclo-cabo-frio' },
  'escuna-cabo-frio': { en: 'schooner-cabo-frio', es: 'goleta-cabo-frio' },
  'lancha-privativa-cabo-frio': { en: 'private-speedboat-cabo-frio', es: 'lancha-privada-cabo-frio' },
};

test('(d) endereços: nenhum slug mudou, e o es-ar usa os mesmos caminhos do es (ida e volta)', () => {
  for (const [interno, pub] of Object.entries(SECOES_PUBLICAS)) {
    assert.equal(caminhoPublico('en', `/${interno}`), `/${pub.en}`, interno);
    assert.equal(caminhoPublico('es', `/${interno}`), `/${pub.es}`, interno);
    assert.equal(caminhoPublico('es-ar', `/${interno}`), `/${pub.es}`, interno);
    assert.equal(caminhoInterno('es-ar', `/${pub.es}`), `/${interno}`, pub.es);
    assert.equal(rota('es-ar', `/${interno}`), `/es-ar/${pub.es}`, interno);
  }
  for (const p of PASSEIOS) {
    const pub = PASSEIOS_PUBLICOS[p.slug] ?? { en: p.slug, es: p.slug };
    assert.equal(caminhoPublico('en', `/passeios/${p.slug}`), `/tours/${pub.en}`, p.slug);
    assert.equal(caminhoPublico('es', `/passeios/${p.slug}`), `/paseos/${pub.es}`, p.slug);
    assert.equal(caminhoPublico('es-ar', `/passeios/${p.slug}`), `/paseos/${pub.es}`, p.slug);
    assert.equal(caminhoInterno('es-ar', `/paseos/${pub.es}`), `/passeios/${p.slug}`, pub.es);
    assert.equal(caminhoInterno('es', `/paseos/${pub.es}`), `/passeios/${p.slug}`, pub.es);
  }
  // o nome do passeio mudou para "cuatrimoto" só no texto: o endereço continua "cuatriciclo"
  assert.equal(rota('es', '/passeios/quadriciclo-buzios'), '/es/paseos/cuatriciclo-buzios');
  assert.equal(rota('es-ar', '/passeios/quadriciclo-buzios'), '/es-ar/paseos/cuatriciclo-buzios');
  assert.equal(caminhoInterno('es-ar', '/passeios/quadriciclo-buzios'), '/passeios/quadriciclo-buzios');
  assert.equal(caminhoPublico('es-ar', '/'), '/');
  assert.equal(caminhoPublico('es-ar', '/guias/que-hacer-en-buzios'), '/guias/que-hacer-en-buzios');
});

test('(d) horas, moeda, hreflang e OG: as duas versões escrevem igual, mas se marcam diferente para o Google', () => {
  assert.equal(formatarHora('09:00', 'es-ar'), formatarHora('09:00', 'es'));
  assert.match(formatarHora('09:00', 'es-ar'), /^9\sh$/u);
  assert.match(formatarHora('14:30', 'es-ar'), /^14:30\sh$/u);
  // R$ 1.197,00 nas duas versões (o 'es' puro escreveria "1197,00" e o 'es-419' "1,197.00")
  assert.equal(LOCALE_INTL.es, 'es-AR');
  assert.equal(LOCALE_INTL['es-ar'], 'es-AR');
  assert.match(formatarCifra(119700, LOCALE_INTL.es), /^R\$\s1\.197,00$/u);
  assert.equal(formatarCifra(119700, LOCALE_INTL['es-ar']), formatarCifra(119700, LOCALE_INTL.es));
  assert.equal(formatarCifra(29150, LOCALE_INTL['es-ar']).replace(/\s/g, ' '), 'R$ 291,50');
  assert.notEqual(formatarCifra(119700, 'es-419'), formatarCifra(119700, 'es-AR'));
  assert.equal(HREFLANG.es, 'es');
  assert.equal(HREFLANG['es-ar'], 'es-AR');
  assert.equal(OG_LOCALE.es, 'es_LA');
  assert.equal(OG_LOCALE['es-ar'], 'es_AR');
});

/**
 * Fora do quadriciclo, as fotos cujo texto alternativo tem palavra argentina: [no es-ar, no es neutro]. As três de
 * antes e as nove das casas (Etapa 7), onde a bancada, o balanço, a geladeira, a lavanderia e a rede mudam de nome.
 */
const ALTS_COM_PALAVRA_ARGENTINA: Record<string, [RegExp, RegExp]> = {
  '/fotos/cabo-frio/camarao-e-caipirinha.jpg': [/Brochette/, /Brocheta/],
  '/fotos/lancha/lancha-petiscos.jpg': [/picadas/, /aperitivos/],
  '/fotos/transfer/van-traseira-bagageiro.jpg': [/Baúl/, /Maletero/],
  '/fotos/casas/mansao-ferradura-vista-mar/cozinha-pia-e-vista.jpg': [/mesada/, /cubierta/],
  '/fotos/casas/mansao-ferradura-vista-mar/banheiro-chuveiro-de-teto.jpg': [/mesada/, /cubierta/],
  '/fotos/casas/mansao-ferradura-vista-mar/parquinho.jpg': [/hamacas/, /columpios/],
  '/fotos/casas/mansao-ferradura-vista-mar/cozinha-e-sala-de-tv.jpg': [/heladera/, /refrigerador/],
  '/fotos/casas/mansao-ferradura-vista-mar/lavanderia.jpg': [/lavarropas/, /lavadora/],
  '/fotos/casas/mansao-geriba-vista-mar/jardim-escada-e-rede.jpg': [/hamaca paraguaya/, /hamaca y/],
  '/fotos/casas/mansao-geriba-vista-mar/banheiro-pia-dupla.jpg': [/mesada/, /cubierta/],
  '/fotos/casas/mansao-geriba-vista-mar/banheiro-chuveiro-de-teto.jpg': [/mesada/, /cubierta/],
  '/fotos/casas/mansao-geriba-vista-mar/banheiro-toalhas-laranja.jpg': [/mesada/, /cubierta/],
};

test('(d) fotos: o es-ar lê o texto do es, menos no quadriciclo ("cuatriciclo") e nos alts com palavra argentina', () => {
  let comVersao = 0;
  for (const [foto, alt] of Object.entries(ALT_FOTOS)) {
    assert.equal(altDaFoto(foto, 'es'), alt.es, foto);
    if (alt['es-ar'] === undefined) {
      assert.equal(altDaFoto(foto, 'es-ar'), alt.es, foto);
      continue;
    }
    comVersao++;
    assert.equal(altDaFoto(foto, 'es-ar'), alt['es-ar']);
    assert.ok(alt['es-ar'].length <= 110 && alt.es.length <= 110, foto);
    if (foto.startsWith('/fotos/quadriciclo/')) {
      assert.match(alt['es-ar'], /cuatriciclos?/);
      assert.match(alt.es, /cuatrimotos?/);
      assert.doesNotMatch(alt.es, /(?<!\p{L})(el|un|los|unos) cuatrimotos?(?!\p{L})|cuatrimoto rojo|cuatrimoto naranjo/u, alt.es);
      continue;
    }
    const esperado = ALTS_COM_PALAVRA_ARGENTINA[foto];
    assert.ok(esperado, `${foto}: versão argentina inesperada; só o quadriciclo e as fotos com palavra argentina têm 'es-ar'`);
    assert.match(alt['es-ar'], esperado[0]);
    assert.match(alt.es, esperado[1]);
  }
  const fotosDoQuadriciclo = Object.entries(ALT_FOTOS).filter(
    ([f, a]) => f.startsWith('/fotos/quadriciclo/') && /cuatrimotos?/.test(a.es),
  ).length;
  assert.equal(
    comVersao,
    fotosDoQuadriciclo + Object.keys(ALTS_COM_PALAVRA_ARGENTINA).length,
    'fotos com versão argentina: as do quadriciclo (cuatrimoto no es) mais as com palavra argentina',
  );
  assert.equal(altDaFoto('/fotos/nao-existe.jpg', 'es-ar', 'reserva'), 'reserva');
  assert.equal(altDaFoto('/fotos/buzios/escuna-no-mar.jpg', 'es-ar'), altDaFoto('/fotos/buzios/escuna-no-mar.jpg', 'es'));
});

test('(d) cotação e formulários: o es-ar é aceito, com +54/AR; o es neutro sugere +56/CL', () => {
  const base = { tipo: 'casa', nome: 'Teste Silva', email: 'teste@exemplo.com' };
  assert.equal(EsquemaCotacao.parse({ ...base, idioma: 'es-ar' }).idioma, 'es-ar');
  assert.equal(EsquemaCotacao.parse({ ...base, idioma: 'es' }).idioma, 'es');
  assert.equal(EsquemaCotacao.safeParse({ ...base, idioma: 'es-AR' }).success, false);
  assert.deepEqual(PAIS_PADRAO['es-ar'], { ddi: '54', pais: 'AR' });
  assert.deepEqual(PAIS_PADRAO.es, { ddi: '56', pais: 'CL' });
  assert.deepEqual(PAIS_PADRAO.pt, { ddi: '55', pais: 'BR' });
  assert.deepEqual(PAIS_PADRAO.en, { ddi: '1', pais: 'US' });
  // o DDI sugerido está na lista do campo, com a bandeira certa
  for (const idioma of ['es', 'es-ar', 'pt'] as const) {
    const { ddi, pais } = PAIS_PADRAO[idioma];
    assert.ok(
      DDIS.some((d) => d.ddi === ddi && d.pais === pais),
      `${idioma}: +${ddi}/${pais} não está em DDIS`,
    );
  }
  assert.ok(DDIS.some((d) => d.ddi === '1' && d.pais.startsWith('US')));
});
