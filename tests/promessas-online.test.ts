import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESCONTO_PIX_PORCENTO } from '../src/config/precos.ts';
import { IDIOMAS, fmt } from '../src/i18n/config.ts';
import { dicionario } from '../src/i18n/index.ts';
import { comPromessasOnline } from '../src/lib/promessas-online.ts';

// Etapa 8 (revisão): com o pagamento online desligado, o pedido fica registrado e o pagamento é fechado com a equipe
// pelo WhatsApp; o voucher só sai quando a equipe confirma. O site não pode prometer "voucher na hora" nem "pagamento
// seguro" no site (é o que a revisão do Google Ads reprova). As frases voltam sozinhas com PAGAMENTO_ONLINE=publico.

/** O que só o pagamento online no site cumpre, nos 4 idiomas. */
const SO_ONLINE = /na hora|al instante|instant|seguro|secure|stripe/i;

/** Os textos que trocam com o interruptor e os que valem nos dois casos. */
const trocados = (idioma: (typeof IDIOMAS)[number], online: boolean) => {
  const d = comPromessasOnline(dicionario(idioma), online);
  return [...d.home.confianca, ...d.home.garantiasCurtas.flatMap((g) => [g.titulo, g.texto]), ...d.passeio.garantias, d.passeio.pagoSeguro];
};

async function comAmbiente(valor: string | undefined, fazer: () => void) {
  const antes = process.env.PAGAMENTO_ONLINE;
  if (valor === undefined) delete process.env.PAGAMENTO_ONLINE;
  else process.env.PAGAMENTO_ONLINE = valor;
  try {
    fazer();
  } finally {
    if (antes === undefined) delete process.env.PAGAMENTO_ONLINE;
    else process.env.PAGAMENTO_ONLINE = antes;
  }
}

test('com o pagamento desligado, nada de voucher na hora nem de pagamento seguro no site', () => {
  for (const idioma of IDIOMAS) {
    for (const texto of trocados(idioma, false)) assert.ok(!SO_ONLINE.test(texto), `${idioma}: ${texto}`);
    // sem o pagamento online, o quadro do passeio fica sem a linha do pagamento seguro
    assert.equal(dicionario(idioma).passeio.pagoSeguro, '', idioma);
    // o dicionário que as páginas recebem é o mesmo objeto, sem cópia
    assert.equal(comPromessasOnline(dicionario(idioma), false), dicionario(idioma));
  }
});

test('as descrições para o Google e o texto da página de passeios valem nos dois casos', () => {
  for (const idioma of IDIOMAS) {
    const d = dicionario(idioma);
    for (const texto of [d.meta.descricao, d.meta.passeiosDescricao, d.meta.chamadaPasseio, d.passeios.texto])
      assert.ok(!SO_ONLINE.test(texto), `${idioma}: ${texto}`);
  }
});

test('com o pagamento online no ar para o público, voltam o voucher na hora e o pagamento seguro', () => {
  for (const idioma of IDIOMAS) {
    const d = comPromessasOnline(dicionario(idioma), true);
    assert.deepEqual(d.home.confianca, dicionario(idioma).home.confiancaOnline, idioma);
    assert.deepEqual(d.home.garantiasCurtas, dicionario(idioma).home.garantiasCurtasOnline, idioma);
    assert.deepEqual(d.passeio.garantias, dicionario(idioma).passeio.garantiasOnline, idioma);
    assert.equal(d.passeio.pagoSeguro, dicionario(idioma).passeio.pagoSeguroOnline, idioma);
    assert.ok(
      trocados(idioma, true).some((t) => SO_ONLINE.test(t)),
      idioma,
    );
    // o resto do dicionário não muda
    assert.equal(d.faq, dicionario(idioma).faq);
    assert.equal(d.home.diaRegras, dicionario(idioma).home.diaRegras);
  }
  assert.deepEqual(comPromessasOnline(dicionario('pt'), true).home.confianca, [
    'Voucher na hora',
    'Reembolso se o tempo cancelar',
    'Pagamento seguro',
  ]);
  assert.equal(comPromessasOnline(dicionario('es'), true).passeio.garantias[2], 'Voucher al instante');
  assert.equal(comPromessasOnline(dicionario('en'), true).passeio.pagoSeguro, 'Secure payment by Pix or card');
});

test('as duas versões das garantias têm o mesmo tamanho (os ícones vão pela posição) e a mesma regra da chuva', () => {
  for (const idioma of IDIOMAS) {
    const { home, passeio } = dicionario(idioma);
    assert.equal(home.garantiasCurtas.length, 4, idioma);
    assert.equal(home.garantiasCurtasOnline.length, 4, idioma);
    assert.equal(passeio.garantias.length, 3, idioma);
    assert.equal(passeio.garantiasOnline.length, 3, idioma);
    // a chuva e o cancelamento são os mesmos com ou sem o pagamento online
    assert.deepEqual(home.garantiasCurtasOnline.slice(0, 2), home.garantiasCurtas.slice(0, 2), idioma);
    assert.deepEqual(passeio.garantiasOnline.slice(0, 2), passeio.garantias.slice(0, 2), idioma);
    // o desconto do Pix vem de src/config/precos.ts
    assert.ok(fmt(home.garantiasCurtas[3].titulo, { p: DESCONTO_PIX_PORCENTO }).includes(`${DESCONTO_PIX_PORCENTO}%`), idioma);
  }
  // a garantia da chuva diz a condição da política (item 4): vale quando o passeio é cancelado, não quando só chove
  assert.equal(dicionario('pt').home.garantiasCurtas[0].titulo, 'Passeio cancelado por chuva, vento ou mar');
  assert.equal(dicionario('es').home.garantiasCurtas[0].titulo, 'Paseo cancelado por lluvia, viento o mar');
  assert.equal(dicionario('es-ar').home.garantiasCurtas[0].texto, 'Reembolso total o nueva fecha, vos elegís.');
  assert.equal(dicionario('es-ar').home.garantiasCurtasOnline[0].texto, 'Reembolso total o nueva fecha, vos elegís.');
  assert.equal(dicionario('en').home.garantiasCurtas[0].titulo, 'Tour cancelled due to rain, wind or sea');
});

test('o padrão segue a variável PAGAMENTO_ONLINE: só "publico" liga as frases (em "admin" o público ainda paga pelo WhatsApp)', async () => {
  await comAmbiente(undefined, () => assert.equal(comPromessasOnline(dicionario('es')), dicionario('es')));
  await comAmbiente('admin', () => assert.equal(comPromessasOnline(dicionario('es')), dicionario('es')));
  await comAmbiente('publico', () =>
    assert.deepEqual(comPromessasOnline(dicionario('es')).home.confianca, dicionario('es').home.confiancaOnline),
  );
});
