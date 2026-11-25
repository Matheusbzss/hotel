import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessoesDoCancelamento } from '../src/app/api/pedido/pedido-stripe.ts';
import { partesDoTotal } from '../src/lib/partes-do-total.ts';
import { formaEmDestaque, formaPadrao } from '../src/lib/preco-destaque.ts';

// Segunda revisão do Pacote 29 (25/11): o preço do cartão em destaque também nas páginas do pedido e da reserva e na linha
// de baixo do checkout, e o cancelamento que grava antes de fechar a sessão da Stripe.

const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('a ordem dos dois totais: o da forma pedida primeiro, e sem ela o Pix primeiro, como sempre', () => {
  const pix = { centavos: 13860, forma: 'pix' };
  const cartao = { centavos: 15400, forma: 'cartao' };
  assert.deepEqual(partesDoTotal(15400, 13860), [pix, cartao]);
  assert.deepEqual(partesDoTotal(15400, 13860, undefined, 'pix'), [pix, cartao]);
  assert.deepEqual(partesDoTotal(15400, 13860, undefined, 'cartao'), [cartao, pix]);
  assert.deepEqual(partesDoTotal(15400, 13860, ['cartao', 'pix'], 'cartao'), [cartao, pix]);
  // as formas que não valem continuam de fora, em qualquer ordem
  assert.deepEqual(partesDoTotal(15400, 13860, ['pix'], 'cartao'), [pix]);
  assert.deepEqual(partesDoTotal(15400, 13860, ['cartao'], 'cartao'), [cartao]);
  // sem valor no Pix, ou sem forma nenhuma: o total sozinho
  assert.deepEqual(partesDoTotal(15400, undefined, undefined, 'cartao'), [{ centavos: 15400 }]);
  assert.deepEqual(partesDoTotal(15400, 13860, [], 'cartao'), [{ centavos: 15400 }]);
});

test('a forma que já vem marcada continua a mesma de antes, agora fora do componente do navegador', () => {
  // a que o pedido tinha, se ainda vale
  assert.equal(formaPadrao(['pix', 'cartao'], 'es', 'pix'), 'pix');
  assert.equal(formaPadrao(['pix', 'cartao'], 'pt', 'cartao'), 'cartao');
  // senão, o Pix em português e o cartão nos outros idiomas
  for (const idioma of ['es', 'es-ar', 'en']) assert.equal(formaPadrao(['pix', 'cartao'], idioma), 'cartao', idioma);
  assert.equal(formaPadrao(['pix', 'cartao'], 'pt'), 'pix');
  // a preferida fora das formas: a que sobrou; nenhuma: null
  assert.equal(formaPadrao(['pix'], 'en'), 'pix');
  assert.equal(formaPadrao(['cartao'], 'pt'), 'cartao');
  assert.equal(formaPadrao(['cartao'], 'es', 'pix'), 'cartao');
  assert.equal(formaPadrao([], 'pt'), null);
  // o componente da escolha do pagamento só repassa a regra (o checkout e a tela de pagar importam dele)
  assert.match(ler('src/components/pagamento/EscolhaPagamento.tsx'), /^export \{ formaPadrao \} from '@\/lib\/preco-destaque';$/m);
  assert.doesNotMatch(ler('src/components/pagamento/EscolhaPagamento.tsx'), /export function formaPadrao/);
});

test('o total que vem primeiro nas páginas do pedido e da reserva: o Pix em português, o da tela de pagar em espanhol e inglês', () => {
  // português: o Pix, como sempre, com ou sem pagamento online
  assert.equal(formaEmDestaque('pt'), 'pix');
  assert.equal(formaEmDestaque('pt', { formas: ['pix', 'cartao'], formaAtual: 'cartao' }), 'pix');
  for (const idioma of ['es', 'es-ar', 'en']) {
    // o pedido do WhatsApp (sem pagamento online): o cartão, como no checkout
    assert.equal(formaEmDestaque(idioma), 'cartao', idioma);
    assert.equal(formaEmDestaque(idioma, null), 'cartao', idioma);
    // no pagamento online, a mesma forma que a tela de pagar traz marcada
    assert.equal(formaEmDestaque(idioma, { formas: ['pix', 'cartao'] }), 'cartao', idioma);
    assert.equal(formaEmDestaque(idioma, { formas: ['pix', 'cartao'], formaAtual: 'pix' }), 'pix', idioma);
    assert.equal(formaEmDestaque(idioma, { formas: ['cartao'], formaAtual: 'pix' }), 'cartao', idioma);
    assert.equal(formaEmDestaque(idioma, { formas: ['pix'] }), 'pix', idioma);
    // sem forma nenhuma valendo: o cartão
    assert.equal(formaEmDestaque(idioma, { formas: [], formaAtual: 'pix' }), 'cartao', idioma);
    for (const formas of [['pix', 'cartao'], ['pix'], ['cartao'], []] as const) {
      for (const formaAtual of [undefined, 'pix', 'cartao'] as const) {
        assert.equal(formaEmDestaque(idioma, { formas, formaAtual }), formaPadrao(formas, idioma, formaAtual) ?? 'cartao', idioma);
      }
    }
  }
});

test('as páginas do pedido e da reserva e a linha de baixo do checkout seguem a regra (só leitura do código)', () => {
  const pedido = ler('src/app/[locale]/pedido/[codigo]/page.tsx');
  assert.match(pedido, /const primeiraForma = formaEmDestaque\(locale, pagamento\);/);
  assert.match(pedido, /pix: pixDepois \? rotuloPixComDesconto\(d\.preco\.noPixComDesconto\) : d\.preco\.noPix,/);
  assert.match(pedido, /partesDoTotal\(totalCentavos, totalPixCentavos, formasAbertas, primeiraForma\)/);
  // a mensagem do WhatsApp na mesma ordem da página
  assert.match(pedido, /const total = emAberto \? partesDoTotal\(pedido\.totalCentavos, noPix, undefined, primeiraForma\)\.map\(valor\)\.join\(' · '\) : brl\(fechado\);/);
  const reserva = ler('src/components/StatusReserva.tsx');
  assert.match(reserva, /const primeiraForma = formaEmDestaque\(idioma, online \? pagamento : null\);/);
  assert.match(reserva, /partesDoTotal\(r\.totalCentavos, r\.totalPixCentavos, formasNaFaixa, primeiraForma\)/);
  assert.match(reserva, /partesDoTotal\(r\.totalCentavos, r\.totalPixCentavos, undefined, primeiraForma\)/);
  assert.match(ler('src/app/[locale]/reserva/[codigo]/page.tsx'), /noPixComDesconto: d\.preco\.noPixComDesconto,/);
  const checkout = ler('src/components/carrinho/FormularioCarrinho.tsx');
  assert.match(checkout, /const pixEmbaixoComDesconto = outra === 'pix' && cartaoEmDestaque\(locale\);/);
  assert.match(checkout, /\{pixEmbaixoComDesconto \? \(\s+<span className="font-semibold text-\(--color-d2\)">\{rotuloPixComDesconto\(P\.noPixComDesconto\)\}<\/span>/);
});

test('o cancelamento fecha as duas sessões que o pedido teve, sem repetir', () => {
  assert.deepEqual(sessoesDoCancelamento('cs_a', 'cs_a'), ['cs_a']);
  // o "Pagar de novo" do cliente quase junto com o "Cancelar": a sessão nova dele também fecha
  assert.deepEqual(sessoesDoCancelamento('cs_a', 'cs_b'), ['cs_a', 'cs_b']);
  assert.deepEqual(sessoesDoCancelamento(undefined, 'cs_b'), ['cs_b']);
  assert.deepEqual(sessoesDoCancelamento('cs_a', undefined), ['cs_a']);
  assert.deepEqual(sessoesDoCancelamento(undefined, undefined), []);
});

test('o cancelamento grava o pedido como cancelado antes de fechar a sessão da Stripe (só leitura do código)', () => {
  const fonte = ler('src/app/api/pedido/pedido-stripe.ts');
  const comeco = fonte.indexOf('export async function cancelarPedidoAberto(');
  assert.ok(comeco > 0);
  const corpo = fonte.slice(comeco, fonte.indexOf('\n}\n', comeco));
  const gravar = corpo.indexOf('await atualizarReserva(alvo.codigo');
  const fechar = corpo.indexOf('await expirarSessao(');
  assert.ok(gravar > 0 && fechar > gravar, 'a gravação vem antes do fechamento');
  // fecha só com o pedido cancelado, e as sessões da leitura do começo e da trava
  assert.match(corpo, /sessaoNaTrava = r\.pagamentoExternoId;/);
  assert.match(corpo, /if \(r\?\.status !== 'cancelado'\) return r;\s+for \(const sessao of sessoesDoCancelamento\(alvo\.pagamentoExternoId, sessaoNaTrava\)\) \{/);
  // nenhum fechamento antes da trava
  assert.equal(corpo.slice(0, gravar).includes('expirarSessao('), false);
});
