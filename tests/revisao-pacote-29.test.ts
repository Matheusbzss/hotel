import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sessoesDoCancelamento } from '../src/app/api/pedido/pedido-stripe.ts';
import { partesDoTotal } from '../src/lib/partes-do-total.ts';
import { formaEmDestaque, formaMarcadaAoPagarDeNovo, formaPadrao } from '../src/lib/preco-destaque.ts';

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
        // e sempre a mesma que a tela de pagar de novo traz marcada, com ou sem o cartão recusado
        for (const cartaoRecusado of [false, true]) {
          assert.equal(
            formaEmDestaque(idioma, { formas, formaAtual, cartaoRecusado }),
            formaMarcadaAoPagarDeNovo(formas, idioma, formaAtual, cartaoRecusado) ?? 'cartao',
            `${idioma} ${formas.join('+')} ${formaAtual} ${cartaoRecusado}`,
          );
        }
      }
    }
    // o cartão recusado: a tela de pagar de novo marca o Pix (se ainda der tempo), e a faixa põe o Pix primeiro
    assert.equal(formaEmDestaque(idioma, { formas: ['pix', 'cartao'], formaAtual: 'cartao', cartaoRecusado: true }), 'pix', idioma);
    assert.equal(formaEmDestaque(idioma, { formas: ['cartao'], formaAtual: 'cartao', cartaoRecusado: true }), 'cartao', idioma);
  }
  // em português, o Pix primeiro também depois do cartão recusado, como sempre
  assert.equal(formaEmDestaque('pt', { formas: ['cartao'], formaAtual: 'cartao', cartaoRecusado: true }), 'pix');
});

test('a forma marcada na tela de pagar de novo: o Pix depois do cartão recusado, se ainda der tempo', () => {
  assert.equal(formaMarcadaAoPagarDeNovo(['pix', 'cartao'], 'es', 'cartao', true), 'pix');
  assert.equal(formaMarcadaAoPagarDeNovo(['pix', 'cartao'], 'pt', 'cartao', true), 'pix');
  assert.equal(formaMarcadaAoPagarDeNovo(['cartao'], 'es', 'cartao', true), 'cartao');
  assert.equal(formaMarcadaAoPagarDeNovo(['pix', 'cartao'], 'es', 'cartao', false), 'cartao');
  assert.equal(formaMarcadaAoPagarDeNovo(['pix', 'cartao'], 'es', undefined), 'cartao');
  assert.equal(formaMarcadaAoPagarDeNovo(['pix', 'cartao'], 'pt', undefined), 'pix');
  assert.equal(formaMarcadaAoPagarDeNovo([], 'es', 'pix', true), null);
  // a tela de pagar usa a mesma função (a regra mora num lugar só)
  assert.match(
    ler('src/components/pagamento/CheckoutEmbutido.tsx'),
    /useState<FormaPagamento \| null>\(\(\) =>\s+formaMarcadaAoPagarDeNovo\(formas, idioma, formaAtual, Boolean\(recusaInicial\)\),\s+\);/,
  );
});

test('as páginas do pedido e da reserva e a linha de baixo do checkout seguem a regra (só leitura do código)', () => {
  const pedido = ler('src/app/[locale]/pedido/[codigo]/page.tsx');
  assert.match(pedido, /const primeiraForma = formaEmDestaque\(locale, pagamento && \{ \.\.\.pagamento, cartaoRecusado: Boolean\(itens\[0\]\?\.recusa\) \}\);/);
  assert.match(pedido, /partesDoTotal\(totalCentavos, totalPixCentavos, formasAbertas, primeiraForma\)/);
  // o "(−10%)" só no Pix que vem DEPOIS do cartão na mesma lista (o Pix sozinho, ou primeiro, fica com o rótulo de sempre:
  // terceira conferência), e só na faixa e na mensagem do WhatsApp
  assert.match(pedido, /const pixDepoisDoCartao = \(lista: readonly ParteDoTotal\[\]\) => lista\[0\]\?\.forma === 'cartao';/);
  assert.match(
    pedido,
    /const rotuloNaLista = \(lista: readonly ParteDoTotal\[\], forma: FormaPagamento\) =>\s+forma === 'pix' && pixDepoisDoCartao\(lista\) \? rotuloPixComDesconto\(d\.preco\.noPixComDesconto\) : rotulo\[forma\];/,
  );
  // as linhas de cada item, que não quebram, com o rótulo curto de sempre (o comprido passava do cartão em 320 px com 150%)
  assert.match(pedido, /const rotulo = \{ pix: d\.preco\.noPix, cartao: d\.preco\.noCartao \};/);
  assert.match(pedido, /const valor = \(p: ParteDoTotal\) => \(p\.forma \? `\$\{brl\(p\.centavos\)\} \$\{rotulo\[p\.forma\]\}` : brl\(p\.centavos\)\);/);
  assert.match(pedido, /<Pedaco key=\{`\$\{chave\}-valor`\} ponto=\{n > 0\} className="whitespace-nowrap">\s*\{valor\(parte\)\}/);
  // a mensagem do WhatsApp na mesma ordem da página
  assert.match(pedido, /const doTexto = partesDoTotal\(pedido\.totalCentavos, noPix, undefined, primeiraForma\);/);
  assert.match(pedido, /doTexto\.map\(\(p\) => \(p\.forma \? `\$\{brl\(p\.centavos\)\} \$\{rotuloNaLista\(doTexto, p\.forma\)\}` : brl\(p\.centavos\)\)\)\.join\(' · '\)/);
  const reserva = ler('src/components/StatusReserva.tsx');
  assert.match(reserva, /const primeiraForma = formaEmDestaque\(idioma, online && pagamento \? \{ \.\.\.pagamento, cartaoRecusado: Boolean\(r\.recusa\) \} : null\);/);
  assert.match(reserva, /const daFaixa = partesDoTotal\(r\.totalCentavos, r\.totalPixCentavos, formasNaFaixa, primeiraForma\);/);
  assert.match(reserva, /const doTexto = partesDoTotal\(r\.totalCentavos, r\.totalPixCentavos, undefined, primeiraForma\);/);
  assert.match(reserva, /const pixDepoisDoCartao = \(lista: readonly ParteDoTotal\[\]\) => lista\[0\]\?\.forma === 'cartao';/);
  assert.match(reserva, /valorTela\(parte\.centavos, parte\.forma && rotuloNaLista\(daFaixa, parte\.forma\), parte\.forma === 'pix' && pixDepoisDoCartao\(daFaixa\)\)/);
  assert.match(ler('src/app/[locale]/reserva/[codigo]/page.tsx'), /noPixComDesconto: d\.preco\.noPixComDesconto,/);
  const checkout = ler('src/components/carrinho/FormularioCarrinho.tsx');
  assert.match(checkout, /const pixEmbaixoComDesconto = outra === 'pix' && cartaoEmDestaque\(locale\);/);
  assert.match(checkout, /\{pixEmbaixoComDesconto \? \(\s+<span className="font-semibold text-\(--color-d2\)">\{rotuloPixComDesconto\(P\.noPixComDesconto\)\}<\/span>/);
});

test('a recusa que chega com a página aberta redesenha a faixa (terceira conferência do Pacote 29)', () => {
  const tela = ler('src/components/pagamento/CheckoutEmbutido.tsx');
  assert.match(
    tela,
    /if \(lido\.recusa && lido\.recusa !== recusa\) \{\s+setRecusa\(lido\.recusa\);\s+if \(formas\.includes\('pix'\)\) setForma\('pix'\);\s+setEtapa\('escolher'\);[\s\S]*?router\.refresh\(\);\s+\}/,
  );
});

test('o cancelamento fecha as duas sessões que o pedido teve, a da trava primeiro, sem repetir', () => {
  assert.deepEqual(sessoesDoCancelamento('cs_a', 'cs_a'), ['cs_a']);
  // o "Pagar de novo" do cliente (cs_b, lida na trava) quase junto com o "Cancelar": a sessão nova dele fecha primeiro
  assert.deepEqual(sessoesDoCancelamento('cs_b', 'cs_a'), ['cs_b', 'cs_a']);
  assert.deepEqual(sessoesDoCancelamento(undefined, 'cs_a'), ['cs_a']);
  assert.deepEqual(sessoesDoCancelamento('cs_b', undefined), ['cs_b']);
  assert.deepEqual(sessoesDoCancelamento(undefined, undefined), []);
});

test('o cancelamento grava o pedido como cancelado antes de fechar a sessão da Stripe (só leitura do código)', () => {
  const fonte = ler('src/app/api/pedido/pedido-stripe.ts');
  const comeco = fonte.indexOf('export async function cancelarPedidoAberto(');
  assert.ok(comeco > 0);
  const corpo = fonte.slice(comeco, fonte.indexOf('\n}\n', comeco));
  const gravar = corpo.indexOf('atualizarReserva(alvo.codigo');
  const fechar = corpo.lastIndexOf('await fecharSessoes(');
  // o cancelamento automático tenta gravar duas vezes antes de desistir (conferência final); o do painel, uma
  assert.match(corpo, /r = await gravar\(\)\.catch\(\(e\) => \{\s+if \(!fecharMesmoSemGravar\) throw e;\s+return gravar\(\);\s+\}\);/);
  assert.ok(gravar > 0 && fechar > gravar, 'a gravação vem antes do fechamento');
  // nenhum fechamento antes da trava, e nenhuma chamada direta à Stripe no corpo (tudo passa por fecharSessoes)
  assert.equal(corpo.slice(0, gravar).includes('fecharSessoes('), false);
  assert.equal(corpo.includes('expirarSessao('), false);
  // fecha só com o pedido cancelado: a sessão da trava primeiro, depois a da leitura do começo, e solta as datas de casa
  assert.match(corpo, /sessaoNaTrava = x\.pagamentoExternoId;/);
  assert.match(
    corpo,
    /if \(r\?\.status !== 'cancelado'\) return r;\s+await fecharSessoes\(codigo, sessoesDoCancelamento\(sessaoNaTrava, alvo\.pagamentoExternoId\), true\);\s+return r;/,
  );
  // a gravação que falha: relida, cancelada segue como deu certo; em aberto, só o cancelamento automático fecha a sessão
  // (sem soltar as datas: o aviso da sessão vencida faz isso), e o erro segue
  assert.match(
    corpo,
    /\} catch \(e\) \{\s+const relido = await obterReservaDoPedido\(codigo\)\.catch\(\(\) => null\);\s+if \(relido\?\.status !== 'cancelado'\) \{\s+if \(fecharMesmoSemGravar && \(!relido \|\| podeAbrirSessao\(relido\.status\)\)\) \{\s+await fecharSessoes\(codigo, sessoesDoCancelamento\(relido\?\.pagamentoExternoId, alvo\.pagamentoExternoId\), false\);\s+\}\s+throw e;\s+\}\s+r = relido;\s+sessaoNaTrava = relido\.pagamentoExternoId;\s+\}/,
  );
  // só o "cliente refez o pedido" pede para fechar mesmo sem gravar; o painel e a sessão que não pôde ser criada, não
  const rota = ler('src/app/api/pedido/route.ts');
  assert.match(rota, /cancelarPedidoAberto\(anterior\.codigo, `Cancelado: o cliente refez o pedido \(\$\{pedido\.codigo\}\)`, \{\s+fecharMesmoSemGravar: true,\s+\}\)/);
  assert.equal(rota.match(/fecharMesmoSemGravar/g)?.length, 2); // o comentário e a chamada
  assert.doesNotMatch(ler('src/app/api/admin/reservas/[codigo]/route.ts'), /fecharMesmoSemGravar/);
});

test('a sessão que já não estava aberta é relida e, paga, aplicada antes do e-mail "Pedido cancelado" (só leitura do código)', () => {
  const fonte = ler('src/app/api/pedido/pedido-stripe.ts');
  const comeco = fonte.indexOf('async function fecharSessoes(');
  assert.ok(comeco > 0);
  const corpo = fonte.slice(comeco, fonte.indexOf('\n}\n', comeco));
  // fechou: nada mais; erro da Stripe: só o registro; já fechada (false): relida e, paga, pela porta do aviso da Stripe
  assert.match(corpo, /const fechou = await expirarSessao\(sessao\)\.catch\(\(e\) => \{[\s\S]*?return 'erro' as const;\s+\}\);/);
  assert.match(
    corpo,
    /if \(fechou === false\) \{\s+try \{\s+const lida = await obterSessao\(sessao\);\s+if \(interpretarSessao\(lida\)\.status === 'pago'\) await aplicarSessao\(codigo, lida, 'consulta'\);/,
  );
  assert.match(corpo, /if \(liberar\) \{\s+await liberarBloqueiosDaSessao\(sessao\)/);
  // a rota do painel agenda o e-mail só depois de cancelarPedidoAberto voltar: o parado já está gravado quando a regra
  // do e-mail (emailDoCancelamentoSai) roda
  const painel = ler('src/app/api/admin/reservas/[codigo]/route.ts');
  const cancela = painel.indexOf("await cancelarPedidoAberto(codigoDoPedido, 'Cancelado no admin')");
  const agenda = painel.indexOf('agendarEmailDoCancelamento(codigoDoPedido)', cancela);
  assert.ok(cancela > 0 && agenda > cancela);
});
