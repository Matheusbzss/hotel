import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dicionario } from '../src/i18n/index.ts';
import { ajustesAR } from '../src/i18n/es-ar.ts';

// Etapa 3, lote 2: o /es é o espanhol neutro (com "tú") e o /es-ar é o texto argentino de antes (com "vos"),
// palavra por palavra, só nas frases que diferem. A prova completa (mesclar(es, ajustesAR) igual ao es.ts de
// antes em 678/678 folhas) rodou por script na hora da mudança; aqui ficam as regras que valem para sempre.

const es = dicionario('es');
const ar = dicionario('es-ar');

/** Todas as folhas de texto de um dicionário, com o caminho (home.diaRegras[0], faq[3].r…). */
function folhas(v: unknown, caminho = ''): [string, string][] {
  if (Array.isArray(v)) return v.flatMap((x, i) => folhas(x, `${caminho}[${i}]`));
  if (typeof v === 'object' && v !== null) return Object.entries(v).flatMap(([k, x]) => folhas(x, caminho ? `${caminho}.${k}` : k));
  return typeof v === 'string' ? [[caminho, v]] : [];
}

const LETRA = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const tokens = (s: string): string[] => (s.match(new RegExp(`[${LETRA}]+`, 'g')) ?? []).map((t) => t.toLowerCase());

/**
 * O que NÃO pode aparecer no espanhol neutro: as formas de "vos" que o site tinha, o imperativo com pronome sem o
 * acento do "tú", os pronomes vos/usted e as palavras argentinas trocadas (valija, chico no sentido de criança,
 * arribos, médanos, cuatriciclo, acá, seña) mais alguns argentinismos fortes de vigia.
 */
const PROIBIDAS_NO_NEUTRO = new Set(
  `abrí alojás armá arrepentís avisá cancelá cancelás compará completá completás cuidá disfrutá elegí elegís embarcá escaneá
   esperá guardá hablá hacé indicá ingresá intentá llegá llegás llevá necesitás pagá pagás paseás pegá perdés podés
   poné presentás probá querés recibí recibís registrás reservá revisá revisás seleccioná tenés terminás tocá
   avisame avisanos contactanos decinos dejanos envialo escribinos mandanos mostralo mostralos mostraselo
   vos sos usted ustedes
   valija valijas chico chicos arribos médanos cuatriciclo cuatriciclos acá seña señas
   plata colectivo colectivos remís pileta boliche vereda pollera frutilla palta parador paradores`
    .split(/\s+/)
    .filter(Boolean),
);

/** Palavras comuns terminadas em á/é/í(s) que não são "vos" (para a varredura por terminação). */
const INOCENTES = new Set(
  'está estás así aquí también café país además quizás inglés portugués interés demás través detrás después más ahí allá qué sí mí tú ya día será habrá podrá leí llegué'.split(
    /\s+/,
  ),
);

test('o espanhol neutro (es) não tem vos, usted nem as palavras argentinas trocadas', () => {
  for (const [caminho, texto] of folhas(es)) {
    for (const t of tokens(texto)) {
      assert.ok(!PROIBIDAS_NO_NEUTRO.has(t), `"${t}" em es.${caminho}: ${texto}`);
      // qualquer outra palavra terminada em vogal acentuada ou ás/és/ís é suspeita de "vos" (Reservá, podés, elegís)
      if (!INOCENTES.has(t)) assert.ok(!/[áéí]s?$/.test(t), `possível forma de vos "${t}" em es.${caminho}: ${texto}`);
    }
    // "vos" depois de preposição vira "contigo"/"ti", nunca "con tú"
    assert.ok(!/\b(con|para|a|de|por|sin|sobre)\s+tú\b/i.test(texto), `preposição + tú em es.${caminho}: ${texto}`);
    // cuatrimoto é feminino; dunas e llegadas também
    assert.ok(!/\b(el|un|este|ese|los|unos|estos|esos|propios?)\s+cuatrimotos?\b/i.test(texto), `gênero de cuatrimoto em es.${caminho}`);
    assert.ok(!/\b(los|unos|estos|esos)\s+(dunas|llegadas)\b/i.test(texto), `gênero de dunas/llegadas em es.${caminho}`);
  }
});

test('nenhuma das duas versões usa "usted"', () => {
  for (const [dic, nome] of [
    [es, 'es'],
    [ar, 'es-ar'],
  ] as const) {
    for (const [caminho, texto] of folhas(dic)) {
      assert.ok(!tokens(texto).some((t) => t === 'usted' || t === 'ustedes'), `"usted" em ${nome}.${caminho}: ${texto}`);
    }
  }
});

test('o espanhol da Argentina (es-ar) conserva o texto de antes, com vos e as palavras locais', () => {
  assert.equal(ar.home.gancho, 'Llegá y disfrutá. Del resto nos ocupamos nosotros.');
  assert.equal(ar.meta.chamadaPasseio, 'Reservá online y cancelá gratis hasta 24 h antes.');
  // as duas frases do lote 1 também ficam em vos
  assert.equal(ar.preco.notaCambio, 'Pagás en reales. El ≈ US$ es aproximado: cotización del Banco Central de Brasil del {data}.');
  assert.equal(ar.carrinho.semCobranca, 'Todavía no te cobramos nada: revisás todo antes de pagar.');
  assert.equal(ar.home.garantias[0].recebe, 'Reembolso total o nueva fecha, vos elegís');
  assert.ok(ar.transfer.como[1].includes('intenta hablar con vos y te pregunta si querés reprogramar'));
  assert.deepEqual(ar.home.garantiasColunas, ['Si', 'Recibís', 'Plazo']);
  assert.equal(ar.home.mapaCidades['cabo-frio'], 'Canal do Itajuru, Isla do Japonês, Fuerte São Mateus y los médanos do Peró.');
  assert.equal(ar.transfer.malas, 'Valijas');
  assert.equal(ar.transfer.semMalas, 'Sin valijas');
  assert.equal(ar.transfer.ficha[1].texto, 'Hasta 1 hora, en arribos o en la dirección de salida');
  assert.equal(ar.transfer.cadeirinhas, 'Sillas para chicos');
  assert.equal(ar.transfer.idadeCrianca, 'Edad del chico {n}');
  assert.equal(ar.faq[7].p, '¿Lancha y cuatriciclo son por persona?');
  assert.ok(ar.meta.descricao.includes('buggy, cuatriciclo y city tour'));
  assert.ok(ar.casas.texto.endsWith('La reserva se hace acá en el sitio, con una seña del 50%.'));
  assert.equal(ar.casas.sinal, 'Seña al reservar ({p}%)');
  assert.equal(ar.casas.pedir, 'Avisame');
  assert.equal(ar.contato.titulo, 'Contactanos');
  assert.equal(ar.contato.texto, 'Atención 100% online, en español, portugués e inglés. Escribinos acá y te respondemos.');
  assert.equal(ar.rodape.escreva, 'Escribinos');
  assert.equal(ar.reserva.proximo3, '¿Necesitás cambiar la fecha? Escribinos con al menos 24 h de anticipación.');
  assert.equal(ar.checkout.erros.aceite, 'Tenés que aceptar los términos y la política de cancelación.');
  assert.equal(ar.erro404.atalhos, 'O elegí por dónde empezar');
});

test('o espanhol neutro traz o "tú" nas mesmas frases, com os acentos do imperativo com pronome', () => {
  assert.equal(es.home.gancho, 'Llega y disfruta. Del resto nos ocupamos nosotros.');
  assert.equal(es.meta.chamadaPasseio, 'Reserva online y cancela gratis hasta 24 h antes.');
  assert.equal(es.preco.notaCambio, 'Pagas en reales. El ≈ US$ es aproximado: cotización del Banco Central de Brasil del {data}.');
  assert.equal(es.carrinho.semCobranca, 'Todavía no te cobramos nada: revisas todo antes de pagar.');
  assert.equal(es.home.garantias[0].recebe, 'Reembolso total o nueva fecha, tú eliges');
  assert.ok(es.transfer.como[1].includes('intenta hablar contigo y te pregunta si quieres reprogramar'));
  assert.deepEqual(es.home.garantiasColunas, ['Si', 'Recibes', 'Plazo']);
  // gênero: médanos (masc.) -> dunas (fem.), cuatriciclo -> cuatrimoto, arribos -> llegadas
  assert.equal(es.home.mapaCidades['cabo-frio'], 'Canal do Itajuru, Isla do Japonês, Fuerte São Mateus y las dunas do Peró.');
  assert.equal(es.faq[7].p, '¿Lancha y cuatrimoto son por persona?');
  assert.equal(es.transfer.ficha[1].texto, 'Hasta 1 hora, en llegadas o en la dirección de salida');
  assert.equal(es.transfer.malas, 'Maletas');
  assert.equal(es.transfer.cadeirinhas, 'Sillas para niños');
  assert.equal(es.transfer.idadeCrianca, 'Edad del niño {n}');
  assert.ok(es.casas.texto.endsWith('La reserva se hace aquí en el sitio, con un anticipo del 50%.'));
  assert.equal(es.casas.sinal, 'Anticipo al reservar ({p}%)');
  // imperativo do tú com pronome: ganha acento
  assert.equal(es.casas.pedir, 'Avísame');
  assert.equal(es.contato.titulo, 'Contáctanos');
  assert.equal(es.rodape.escreva, 'Escríbenos');
  assert.equal(es.transfer.demaisPassageiros, 'Mándanos el nombre de los demás pasajeros por nuestro WhatsApp, que está en el voucher.');
  assert.equal(es.reserva.confirmadoTexto, 'Tu voucher está listo. El día del paseo, solo muéstralo en el celular.');
  assert.equal(es.transfer.confirmadoTexto, 'Tu voucher está listo. Ese día, solo muéstraselo al chofer en el celular.');
  assert.equal(es.home.precosTexto, '{n} paseos. Dinos la fecha y quiénes van: cada valor se vuelve el total de tu grupo.');
  assert.ok(es.home.diaRegras[4].includes('avísanos al reservar'));
  assert.ok(es.carrinho.mudou.endsWith('Revisa el pedido y envíalo de nuevo.'));
  assert.equal(es.transfer.sobCotacaoTexto, 'Este trayecto no tiene precio fijo. Déjanos tus datos y te respondemos con el valor.');
  // verbos irregulares do tú
  assert.equal(es.reserva.expiradoTexto, 'El plazo para pagar este Pix terminó. Haz una nueva reserva o escríbenos.');
  assert.equal(es.transfer.horaAjudaAeroporto, 'Saliendo del aeropuerto, pon el horario de llegada del vuelo.');
  assert.equal(es.home.diaRegras[1], 'El paseo sale a la hora marcada: si llegas después, pierdes el paseo y no hay reembolso.');
  assert.equal(es.home.garantias[2].se, 'Te arrepientes de la compra');
  assert.equal(es.checkout.erros.aceite, 'Tienes que aceptar los términos y la política de cancelación.');
  assert.equal(es.erro404.atalhos, 'O elige por dónde empezar');
});

/** Diferenças decididas pelo dono que não são vos nem palavra argentina. */
const DIFERENCAS_DECIDIDAS: Record<string, string> = {
  'checkout.telefoneAjuda': 'exemplo de telefone: chileno no es (DDI padrão +56), argentino e uruguaio no es-ar (decisão de 09/11/2026)',
};

test('toda frase que difere entre es e es-ar se explica por vos ou palavra argentina, e nada mais muda', () => {
  const doEs = new Map(folhas(es));
  let diferentes = 0;
  for (const [caminho, textoAr] of folhas(ar)) {
    const textoEs = doEs.get(caminho);
    assert.ok(textoEs !== undefined, `es-ar tem ${caminho} e o es não`);
    if (textoEs === textoAr) continue;
    diferentes++;
    assert.ok(
      tokens(textoAr).some((t) => PROIBIDAS_NO_NEUTRO.has(t)) || caminho in DIFERENCAS_DECIDIDAS,
      `${caminho} difere sem motivo (nem vos nem palavra argentina no es-ar): "${textoAr}" x "${textoEs}"`,
    );
    // os marcadores {assim} são os mesmos nas duas versões
    assert.deepEqual(textoAr.match(/\{\w+\}/g) ?? [], textoEs.match(/\{\w+\}/g) ?? [], `marcadores em ${caminho}`);
  }
  assert.equal(
    diferentes,
    132,
    `${diferentes} frases diferem entre es e es-ar; esperava 132 (as 111 que ficaram do lote 2, o exemplo de telefone, as 11 da Etapa 4, a garantia da chuva da Etapa 8, na versão de hoje e na do pagamento online, o aviso do formulário da Stripe que não carrega, da Etapa 5, e as 6 da página da casa, da Etapa 7). Mudou uma frase de propósito? Atualize este número (tests/es-ar.test.ts tem a contagem por fonte).`,
  );
});

test('Etapa 4: as frases do pagamento pela Stripe com verbo vão em vos no es-ar e em tú no es; as impessoais são iguais', () => {
  // [chave, frase argentina, frase neutra]
  const PARES: [string, string, string][] = [
    ['checkout.pixExplicacao', ar.checkout.pixExplicacao, es.checkout.pixExplicacao],
    ['pedido.recusadoPix', ar.pedido.recusadoPix, es.pedido.recusadoPix],
    ['pedido.dicaInternacional', ar.pedido.dicaInternacional, es.pedido.dicaInternacional],
    ['pedido.tentarOutroCartao', ar.pedido.tentarOutroCartao, es.pedido.tentarOutroCartao],
    ['recusa.dados', ar.recusa.dados, es.recusa.dados],
    ['recusa.vencido', ar.recusa.vencido, es.recusa.vencido],
    // Etapa 5: o formulário da Stripe que não carrega
    ['checkout.semStripe', ar.checkout.semStripe, es.checkout.semStripe],
  ];
  const TRECHOS: Record<string, [string, string]> = {
    'checkout.pixExplicacao': ['Pagás en la app de tu banco', 'Pagas en la app de tu banco'],
    'pedido.recusadoPix': ['Pagá con Pix y recibí {p}% de descuento', 'Paga con Pix y recibe {p}% de descuento'],
    'pedido.dicaInternacional': ['revisá en la app de tu banco', 'revisa en la app de tu banco'],
    'pedido.tentarOutroCartao': ['Probá con otra tarjeta.', 'Prueba con otra tarjeta.'],
    'recusa.dados': ['Revisá el número', 'Revisa el número'],
    'recusa.vencido': ['usá otra tarjeta', 'usa otra tarjeta'],
    'checkout.semStripe': ['Probá sin el bloqueador', 'Prueba sin el bloqueador'],
  };
  for (const [caminho, textoAr, textoEs] of PARES) {
    const [trechoAr, trechoEs] = TRECHOS[caminho];
    assert.ok(textoAr.includes(trechoAr), `${caminho} no es-ar: ${textoAr}`);
    assert.ok(textoEs.includes(trechoEs), `${caminho} no es: ${textoEs}`);
  }
  for (const caminho of ['pedido.contestadoTexto', 'pedido.reembolsadoTexto'] as const) {
    const [grupo, chave] = caminho.split('.') as ['pedido', 'contestadoTexto' | 'reembolsadoTexto'];
    assert.ok(ar[grupo][chave].endsWith('Si tenés dudas, escribinos.'), `${caminho} no es-ar`);
    assert.ok(es[grupo][chave].endsWith('Si tienes dudas, escríbenos.'), `${caminho} no es`);
  }
  // as frases sem verbo para o cliente (impessoais) não ganham versão argentina
  for (const t of [
    (d: typeof es) => d.checkout.pixApps,
    (d: typeof es) => d.checkout.cartaoAvista,
    (d: typeof es) => d.pedido.semPixPrazo,
    (d: typeof es) => d.pedido.confirmandoTexto,
    (d: typeof es) => d.recusa.generica,
    (d: typeof es) => d.status.contestado,
    // Etapa 5: para que serve o e-mail do checkout ("si la compra no se completa")
    (d: typeof es) => d.checkout.emailAjuda,
    (d: typeof es) => d.checkout.emailPrivacidade,
  ]) {
    assert.equal(t(ar), t(es));
  }
});

test('cada entrada de src/i18n/es-ar.ts muda de fato alguma coisa (nenhuma repete o es)', () => {
  const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const andar = (aj: unknown, base: unknown, caminho: string): void => {
    if (ehObjeto(aj)) {
      assert.ok(ehObjeto(base), `${caminho} é objeto no es-ar mas não no es`);
      for (const [k, v] of Object.entries(aj)) andar(v, base[k], caminho ? `${caminho}.${k}` : k);
      return;
    }
    // texto ou lista inteira: tem de ser diferente do es
    assert.notDeepEqual(aj, base, `${caminho} em es-ar.ts é igual ao es (entrada redundante)`);
    if (Array.isArray(aj)) assert.ok(Array.isArray(base) && base.length === aj.length, `${caminho}: lista de tamanho diferente`);
  };
  andar(ajustesAR, es, '');
});
