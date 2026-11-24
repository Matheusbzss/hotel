import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formasDoPagamento, pagamentoOnlineAberto } from '../src/lib/formas-pagamento.ts';
import { formasChegaram, releituraDoCheckout, type EstadoDaReleitura } from '../src/lib/releitura-do-checkout.ts';

// O checkout que abriu sem as formas de pagamento e ganhou itens depois (achado CE-1 da varredura de 24/11, Pacote 26):
// a página guardada que abriu com o carrinho vazio voltava com os itens e o quadro antigo do WhatsApp, cujo botão o
// servidor recusa com o pagamento online aberto (400 'pagamento'). Com o pagamento online ligado, o formulário pede a
// página de novo ao servidor, uma vez só; desligado, nada muda. As regras são puras (src/lib/releitura-do-checkout.ts);
// o formulário e a página rodam no Next (React e o atalho "@/"), então estes testes leem o código deles. Só leitura.

/** O código de um arquivo de src/, sem os comentários: só o que roda. As quebras de linha do Windows viram \n. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** Troca as variáveis de ambiente durante `fazer` e devolve as de antes no fim. */
async function comAmbiente(vars: Record<string, string | undefined>, fazer: () => void | Promise<void>) {
  const antes = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const aplicar = (valores: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(valores)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  aplicar(vars);
  try {
    await fazer();
  } finally {
    aplicar(antes);
  }
}

/** O caso do achado: o pagamento online ligado, a página sem formas do servidor, um item na tela, a primeira vez. */
const CASO: EstadoDaReleitura = { pagamentoLigado: true, formasDoServidor: 0, itens: 1, sessaoAberta: false, jaReleu: false };

test('o checkout com itens e sem formas pede a página de novo ao servidor só com o pagamento online ligado, uma vez só', () => {
  assert.equal(releituraDoCheckout(CASO), true);
  assert.equal(releituraDoCheckout({ ...CASO, itens: 3 }), true);
  // o pagamento online desligado (ou o modo 'admin' para quem não está no painel): nada muda, o WhatsApp de sempre
  assert.equal(releituraDoCheckout({ ...CASO, pagamentoLigado: false }), false);
  // a página que já tem as formas não pede nada
  assert.equal(releituraDoCheckout({ ...CASO, formasDoServidor: 1 }), false);
  assert.equal(releituraDoCheckout({ ...CASO, formasDoServidor: 2 }), false);
  // o carrinho vazio ("Seu carrinho está vazio."): nada a pedir
  assert.equal(releituraDoCheckout({ ...CASO, itens: 0 }), false);
  // o checkout embutido da Stripe aberto: o pedido já existe, e relendo a página ele fecharia
  assert.equal(releituraDoCheckout({ ...CASO, sessaoAberta: true }), false);
  // a trava contra o laço: a página relida que ainda vem sem formas fica como hoje e não pede de novo
  assert.equal(releituraDoCheckout({ ...CASO, jaReleu: true }), false);
});

test('as formas da página relida só entram quando a página de antes não tinha nenhuma', () => {
  assert.equal(formasChegaram(0, 1), true);
  assert.equal(formasChegaram(0, 2), true);
  // a página relida ainda sem formas: nada muda
  assert.equal(formasChegaram(0, 0), false);
  // a página que já tinha as formas fica com as dela (a lista que encolheu no envio, a forma que o cliente marcou)
  assert.equal(formasChegaram(2, 2), false);
  assert.equal(formasChegaram(2, 1), false);
  assert.equal(formasChegaram(1, 0), false);
});

test('o servidor decide se o pagamento online vale para o visitante: o interruptor, o painel e as chaves da Stripe', async () => {
  const chaves = { STRIPE_SECRET_KEY: 'rk_test_chave_de_exemplo', NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_exemplo' };
  await comAmbiente({ PAGAMENTO_ONLINE: undefined, ...chaves }, async () => {
    assert.equal(await pagamentoOnlineAberto({ admin: false }), false);
    assert.equal(await pagamentoOnlineAberto({ admin: true }), false);
  });
  await comAmbiente({ PAGAMENTO_ONLINE: 'desligado', ...chaves }, async () => {
    assert.equal(await pagamentoOnlineAberto({ admin: true }), false);
  });
  await comAmbiente({ PAGAMENTO_ONLINE: 'admin', ...chaves }, async () => {
    // o público, no modo 'admin', continua no caminho do WhatsApp: nada muda para ele
    assert.equal(await pagamentoOnlineAberto({ admin: false }), false);
    assert.equal(await pagamentoOnlineAberto({ admin: true }), true);
  });
  await comAmbiente({ PAGAMENTO_ONLINE: 'publico', ...chaves }, async () => {
    assert.equal(await pagamentoOnlineAberto({ admin: false }), true);
    assert.equal(await pagamentoOnlineAberto({ admin: true }), true);
  });
  // ligado, mas sem as chaves da Stripe: o servidor não oferece forma nenhuma, e o formulário não pede nada
  await comAmbiente(
    { PAGAMENTO_ONLINE: 'publico', STRIPE_SECRET_KEY: undefined, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: undefined },
    async () => {
      assert.equal(await pagamentoOnlineAberto({ admin: false }), false);
    },
  );
  // é a mesma regra do começo de formasDoPagamento: desligado para o visitante, nenhuma forma
  const fonte = codigo('lib', 'formas-pagamento.ts');
  const inicio = fonte.indexOf('export async function formasDoPagamento(');
  assert.notEqual(inicio, -1);
  assert.match(
    fonte.slice(inicio, fonte.indexOf('\n}\n', inicio)),
    /if \(!\(await pagamentoOnlineAberto\(opcoes\)\)\) return \{ formas: \[\] \};/,
  );
  await comAmbiente({ PAGAMENTO_ONLINE: 'admin', ...chaves }, async () => {
    const itens = [
      { tipo: 'passeio' as const, data: '2099-01-10', horario: { hora: '09:00' }, totalCentavos: 15400, totalPixCentavos: 13860 },
    ];
    assert.deepEqual(await formasDoPagamento(itens, new Date('2098-12-01T12:00:00Z'), { admin: false, cotacao: null }), { formas: [] });
  });
});

test('a página do checkout manda ao formulário se o pagamento online vale, decidido no servidor', () => {
  const publica = codigo('lib', 'reserva-publica.ts');
  const inicio = publica.indexOf('export async function pagamentoDoCheckout(');
  assert.notEqual(inicio, -1);
  const funcao = publica.slice(inicio, publica.indexOf('\nexport ', inicio + 1));
  // com qualquer carrinho, também o vazio (a página que abriu vazia é justamente a que precisa saber), e uma falha desliga
  assert.match(funcao, /const pagamentoLigado = await pagamentoOnlineAberto\(\{ admin \}\)\.catch\(\(\) => false\);/);
  assert.ok(funcao.indexOf('const pagamentoLigado') > funcao.indexOf(': { formas: [], semPix: undefined };'));
  assert.match(funcao, /\n {4}pagamentoLigado,\n/);
  const pagina = codigo('app', '[locale]', 'checkout', 'page.tsx');
  assert.match(pagina, /const \{ pagamentoOnline, pagamentoLigado, pedidoAberto, pedidoPago \} = await pagamentoDoCheckout\(/);
  assert.match(pagina, /pagamentoLigado=\{pagamentoLigado\}/);
});

test('o formulário relê a página uma vez só, pelas formas que vieram do servidor, e desliga o WhatsApp enquanto isso', () => {
  const f = codigo('components', 'carrinho', 'FormularioCarrinho.tsx');
  // sem o servidor dizer, desligado: o caminho do WhatsApp de sempre
  assert.match(f, /\n {2}pagamentoLigado = false,\n/);
  assert.match(f, /import \{ useRouter \} from 'next\/navigation';/);
  assert.match(f, /import \{ formasChegaram, releituraDoCheckout \} from '@\/lib\/releitura-do-checkout';/);
  // as formas que contam são as que vieram do servidor (as props), não a lista que encolheu no envio (o 403 'forma')
  assert.match(f, /const formasDoServidor = pagamentoOnline\?\.formas\.length \?\? 0;/);
  assert.match(
    f,
    /const reler = releituraDoCheckout\(\{\s+pagamentoLigado,\s+formasDoServidor,\s+itens: itens\.length,\s+sessaoAberta: sessao !== null,\s+jaReleu,\s+\}\);/,
  );
  // uma vez por volta: a trava fecha antes do pedido ao servidor, e o pedido é o router.refresh dentro da transição; sem
  // rede, nada é pedido (o refresh cairia na página de "sem conexão" do navegador e o que foi digitado se perderia)
  assert.match(
    f,
    /useEffect\(\(\) => \{\s+if \(!reler\) return;\s+setJaReleu\(true\);\s+if \(navigator\.onLine === false\) return;\s+comecarReleitura\(\(\) => router\.refresh\(\)\);\s+\}, \[reler, router\]\);/,
  );
  assert.equal(f.match(/router\.refresh\(\)/g)?.length, 1);
  assert.equal(f.match(/setJaReleu\(true\)/g)?.length, 1);
  assert.match(f, /const \[relendo, comecarReleitura\] = useTransition\(\);/);
  assert.match(f, /const esperandoFormas = reler \|\| relendo;/);
  // a página devolvida pela memória de voltar do navegador solta a trava (uma releitura por volta)
  assert.match(f, /if \(!e\.persisted\) return;\s+setEnviando\(false\);\s+setJaReleu\(false\);\s+recarregar\(\);/);
  // as formas da página relida entram só quando a de antes não tinha nenhuma
  assert.match(f, /if \(formasChegaram\(formasDaPagina\?\.length \?\? 0, formasDoServidor\)\) \{/);
  assert.match(f, /setFormas\(novas\);\s+setSemPix\(pagamentoOnline\?\.semPix\);\s+setForma\(formaPadrao\(novas, idioma\)\);/);
  // enquanto isso, o botão do WhatsApp fica desligado (com o mesmo texto) e o envio não sai
  assert.match(f, /async function enviar\(\) \{\s+if \(esperandoFormas\) return;/);
  assert.match(
    f,
    /className="botao botao-whats w-full"\s+disabled=\{enviando \|\| esperandoFormas\}\s+aria-busy=\{enviando \|\| esperandoFormas\}\s+>\s+<IconeWhatsApp className="size-5" \/>\s+\{enviando \? C\.processando : C\.finalizarWhatsapp\}/,
  );
  // nenhum texto novo: o quadro de hoje continua igual, com as chaves de sempre
  assert.match(f, /<p className="font-bold">\{C\.indisponivelTitulo\}<\/p>\s+<p className="mt-2">\{C\.indisponivelTexto\}<\/p>/);
  // o botão de pagar não muda
  assert.match(f, /<button type="submit" className="botao w-full" disabled=\{enviando\} aria-busy=\{enviando\}>/);
});
