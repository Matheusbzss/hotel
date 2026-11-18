import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IDIOMAS, LOCALE_INTL, type Idioma } from '../src/i18n/config.ts';
import { dicionario } from '../src/i18n/index.ts';
import { formatarCifra } from '../src/lib/cifra.ts';
import { frasesDoReembolso, type TextosDoReembolso } from '../src/lib/frases-do-reembolso.ts';

// O que o cliente lê quando um reembolso falha na Stripe (Pacote 4, decisão 3 do dono: dizer a verdade com o valor).
// Sem falha, nenhuma letra muda; com ela, "Reembolso pendente" e o valor, e depois que a equipe devolve de outro jeito, a
// frase que diz isso. Só a regra das frases e a leitura do código das duas páginas, sem tela nem banco.

/** Os textos de um idioma, como as páginas montam (textosDoReembolso, src/lib/reserva-publica.ts). */
const textos = (idioma: Idioma): TextosDoReembolso => {
  const d = dicionario(idioma);
  return {
    reembolsadoTexto: d.pedido.reembolsadoTexto,
    reembolsadoParcial: d.pedido.reembolsadoParcial,
    reembolsoFalhou: d.pedido.reembolsoFalhou,
    reembolsoOutroMeio: d.pedido.reembolsoOutroMeio,
  };
};
const cifraDe = (idioma: Idioma) => (centavos: number) => formatarCifra(centavos, LOCALE_INTL[idioma]);
const PT = textos('pt');
const cifra = cifraDe('pt');
const partes = (originalCentavos: number, pendenteCentavos = 0, outroMeioCentavos = 0) => ({
  originalCentavos,
  pendenteCentavos,
  outroMeioCentavos,
});

test('sem reembolso que falhou, o texto de hoje: inteiro, parcial e nada', () => {
  // o pedido (ou o voucher) devolvido por inteiro: a frase de sempre, mesmo com o valor
  assert.deepEqual(frasesDoReembolso(partes(15400), true, PT, cifra), [
    'O valor foi devolvido pela mesma forma de pagamento. Se tiver dúvidas, fale com a gente.',
  ]);
  assert.deepEqual(frasesDoReembolso(partes(0), true, PT, cifra), [PT.reembolsadoTexto]);
  // uma parte: a frase do parcial com o valor, com centavos
  assert.deepEqual(frasesDoReembolso(partes(24200), false, PT, cifra), [
    `Reembolso parcial de ${cifra(24200)}, devolvido pela mesma forma de pagamento.`,
  ]);
  // nada voltou (o pedido pago sem reembolso): nenhuma frase
  assert.deepEqual(frasesDoReembolso(partes(0), false, PT, cifra), []);
});

test('o reembolso pendente, o devolvido de outro jeito e o misto, na ordem certa', () => {
  // o pedido inteiro que falhou: só a frase do pendente, com o valor
  assert.deepEqual(frasesDoReembolso(partes(0, 15400), true, PT, cifra), [
    `Não conseguimos devolver ${cifra(15400)} pela mesma forma de pagamento. A nossa equipe vai entrar em contato com você.`,
  ]);
  // depois que a equipe devolveu de outro jeito
  assert.deepEqual(frasesDoReembolso(partes(0, 0, 15400), true, PT, cifra), [
    `Como não deu para devolver pela mesma forma de pagamento, a nossa equipe devolveu ${cifra(15400)} de outro jeito.`,
  ]);
  // misto (R$ 396,00 registrados; o voucher de R$ 242,00 falhou): primeiro o que voltou, depois o que falta; `inteiro`
  // não muda nada quando há falha
  for (const inteiro of [true, false]) {
    assert.deepEqual(frasesDoReembolso(partes(15400, 24200), inteiro, PT, cifra), [
      `Reembolso parcial de ${cifra(15400)}, devolvido pela mesma forma de pagamento.`,
      `Não conseguimos devolver ${cifra(24200)} pela mesma forma de pagamento. A nossa equipe vai entrar em contato com você.`,
    ]);
  }
  // as três partes: pela mesma forma, pendente, por outro meio
  const tres = frasesDoReembolso(partes(10000, 24200, 5400), false, PT, cifra);
  assert.equal(tres.length, 3);
  assert.ok(tres[0].startsWith('Reembolso parcial de') && tres[0].includes(cifra(10000)));
  assert.ok(tres[1].startsWith('Não conseguimos devolver') && tres[1].includes(cifra(24200)));
  assert.ok(tres[2].startsWith('Como não deu') && tres[2].includes(cifra(5400)));
  // o pendente e o devolvido por outro meio sem nada pela mesma forma: sem a frase do parcial
  assert.deepEqual(
    frasesDoReembolso(partes(0, 24200, 15400), true, PT, cifra).map((f) => f.slice(0, 12)),
    ['Não consegui', 'Como não deu'],
  );
});

test('nos quatro idiomas: o valor com centavos, nenhum marcador sobrando, nenhum motivo nem prazo', () => {
  for (const idioma of IDIOMAS) {
    const t = textos(idioma);
    const c = cifraDe(idioma);
    const casos = [
      frasesDoReembolso(partes(0, 15400), true, t, c),
      frasesDoReembolso(partes(0, 0, 15400), true, t, c),
      frasesDoReembolso(partes(15400, 24200, 123456), false, t, c),
      frasesDoReembolso(partes(39600), false, t, c),
      frasesDoReembolso(partes(39600), true, t, c),
    ];
    for (const frases of casos) {
      assert.ok(frases.length > 0, idioma);
      for (const frase of frases) {
        assert.doesNotMatch(frase, /\{\w+\}/, `${idioma}: ${frase}`);
        // o motivo da falha e o prazo nunca vão para o cliente
        assert.doesNotMatch(frase, /_card|expired|stolen|roubad|perdid|robad|\d+ d(ia|ía|ay)s?/i, `${idioma}: ${frase}`);
      }
    }
    // cada valor sai com os centavos (R$ 154,00; R$154.00 no inglês) e no formato do idioma
    const [falhou] = frasesDoReembolso(partes(0, 15400), true, t, c);
    assert.ok(falhou.includes(c(15400)) && /\d[.,]\d{2}$/.test(c(15400)), `${idioma}: ${falhou}`);
    const [, , outroMeio] = frasesDoReembolso(partes(15400, 24200, 123456), false, t, c);
    assert.ok(outroMeio.includes(c(123456)) && /1[.,]234[.,]56/.test(c(123456)), `${idioma}: ${outroMeio}`);
  }
});

test('as duas páginas do cliente: "Reembolso pendente" e as frases dentro das caixas de hoje, uma por parágrafo', () => {
  /** O código de um arquivo de src/, sem o \r dos arquivos gravados com CRLF. */
  const codigo = (...partesDoCaminho: string[]) => readFileSync(path.join('src', ...partesDoCaminho), 'utf8').replace(/\r/g, '');
  const status = codigo('components', 'StatusReserva.tsx');
  const pedido = codigo('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  const reserva = codigo('app', '[locale]', 'reserva', '[codigo]', 'page.tsx');

  // as frases saem da regra pura, com as partes que o servidor decidiu (nunca o id do reembolso nem o motivo)
  assert.match(status, /frasesDoReembolso\(partes, inteiro, textosDoReembolso,/);
  assert.match(
    status,
    /const partes = r\.reembolsoPartes \?\? \{ originalCentavos: reembolso, pendenteCentavos: 0, outroMeioCentavos: 0 \};/,
  );
  assert.match(pedido, /partesDaPagina\(\{ voucherDePedido: false, codigo \}, reembolso, primeira\.historico\)/);
  // o título e a faixa do voucher: "Reembolso pendente" só no voucher reembolsado cujo dinheiro ainda não voltou
  assert.match(status, /const reembolsoPendente = r\.status === 'reembolsado' && partes\.pendenteCentavos > 0;/);
  assert.match(status, /\{reembolsoPendente \? textos\.reembolsoPendenteTitulo : statusTextos\[r\.status\]\}/);
  assert.match(status, /titulo: reembolsoPendente \? textos\.reembolsoPendenteTitulo : statusTextos\.reembolsado,/);
  assert.match(pedido, /titulo: reembolsoPendente \? d\.pedido\.reembolsoPendenteTitulo : d\.status\.reembolsado,/);
  assert.match(pedido, /status === 'reembolsado' && reembolsoPendente \? d\.pedido\.reembolsoPendenteTitulo : d\.status\[status\]/);
  assert.match(
    pedido,
    /r\.status === 'reembolsado' && \(r\.reembolsoPartes\?\.pendenteCentavos \?\? 0\) > 0 \? d\.pedido\.reembolsoPendenteTitulo/,
  );
  // a página da reserva passa as chaves novas
  assert.match(reserva, /\.\.\.textosDoReembolso\(d\),\s+reembolsoPendenteTitulo: d\.pedido\.reembolsoPendenteTitulo,/);

  // uma frase por parágrafo, nas caixas de hoje (a mesma largura em ch, o mesmo fundo), sem nada que impeça a quebra
  // de linha: em 320 px com a letra em 150% o texto desce, como os parágrafos de hoje
  assert.match(
    status,
    /<div className="mt-4 max-w-\[46ch\] space-y-2 bg-superficie px-5 py-4">\s+\{frasesDoPago\.map\(\(frase, n\) => \(\s+<p key=\{n\}>\{frase\}<\/p>/,
  );
  assert.match(status, /\{\[m\.texto\]\.flat\(\)\.map\(\(frase, n\) => \(\s+<p key=\{n\} className="mt-4 max-w-\[44ch\] text-lead">/);
  assert.match(
    pedido,
    /<div className="mt-4 max-w-\[44ch\] space-y-2 bg-superficie px-5 py-4">\s+\{frasesDoPago\.map\(\(frase, n\) => \(\s+<p key=\{n\}>\{frase\}<\/p>/,
  );
  assert.match(pedido, /\{\[texto\]\.flat\(\)\.map\(\(frase, n\) => \(\s+<p key=\{n\} className="mt-4 max-w-\[44ch\] text-lead">/);
  // a linha de baixo do pedido: o que voltou e, com a falha, o que ainda não voltou, cada uma no seu parágrafo
  assert.match(pedido, /\{d\.pedido\.reembolsoPendenteTitulo\} · \{brl\(partesDoReembolso\.pendenteCentavos\)\}/);
  for (const [nome, arquivo] of [
    ['StatusReserva.tsx', status],
    ['pedido/[codigo]/page.tsx', pedido],
  ] as const) {
    for (const linha of arquivo.split('\n').filter((l) => /frasesDoPago|reembolsoPendente|\[m\.texto\]|\[texto\]/.test(l)))
      assert.doesNotMatch(linha, /whitespace-nowrap|min-w-|w-\[\d/, `${nome}: ${linha.trim()}`);
  }
});
