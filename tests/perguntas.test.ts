import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERGUNTAS_PRINCIPAIS, dividirPerguntas } from '../src/data/perguntas.ts';
import { IDIOMAS } from '../src/i18n/config.ts';
import { dicionario } from '../src/i18n/index.ts';

// Etapa 8: a página inicial mostra só 5 perguntas abertas para tocar; as outras ficam no "Ver todas as perguntas",
// na mesma página. A escolha é pela posição na lista de cada dicionário: se alguém mudar a lista, este teste avisa.
test('as 5 perguntas da inicial são as escolhidas, na ordem certa', () => {
  assert.deepEqual(
    PERGUNTAS_PRINCIPAIS.map((i) => dicionario('pt').faq[i].p),
    [
      'Sou estrangeiro. Posso reservar?',
      'Quais são as formas de pagamento?',
      'É seguro pagar pelo site?',
      'Vocês buscam no hotel?',
      'Criança paga?',
    ],
  );
  assert.deepEqual(
    PERGUNTAS_PRINCIPAIS.map((i) => dicionario('es').faq[i].p),
    [
      'Soy extranjero. ¿Puedo reservar?',
      '¿Cuáles son las formas de pago?',
      '¿Es seguro pagar en el sitio?',
      '¿Nos buscan en el hotel?',
      '¿Los niños pagan?',
    ],
  );
});

test('em todos os idiomas: 5 principais, nenhuma pergunta some e nenhuma aparece duas vezes', () => {
  for (const idioma of IDIOMAS) {
    const faq = dicionario(idioma).faq;
    const { principais, outras } = dividirPerguntas(faq);
    assert.equal(principais.length, 5, idioma);
    assert.equal(principais.length + outras.length, faq.length, idioma);
    assert.equal(new Set([...principais, ...outras]).size, faq.length, idioma);
    // as outras seguem a ordem da lista
    assert.deepEqual(
      outras,
      faq.filter((f) => !principais.includes(f)),
      idioma,
    );
  }
});
