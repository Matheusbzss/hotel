import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EVENTO_SESSAO_NOVA, avisarSessaoNova, ouvirSessaoNova } from '../src/components/pagamento/PalavraDoStatus.ts';
import { leituraMudou, type LeituraDoPedido, type LeituraQueRedesenha } from '../src/components/pagamento/useStatusDoPedido.ts';

// As páginas do cliente depois do reteste de 16-17/11 (Pacote 13): a faixa que continuava "Expirado" depois de "Pagar de
// novo" (R2), o checkout que ficava só com "Seu carrinho está vazio." depois do 409 "mudou" (R3), os "Próximos passos" do
// transfer que vai para o aeroporto (R4, a regra em tests/transfer.test.ts) e a página aberta do pedido que não mudava
// com o reembolso de um voucher que não é o primeiro, nem com a devolução por outro meio (R5). O aviso da sessão nova e a
// comparação das leituras rodam aqui em node; o resto são componentes do navegador e páginas do Next (o atalho "@/"),
// então os testes leem o código deles. Só leitura: nada é gravado.

/**
 * O código de um arquivo de src/ sem os comentários (os do JSX, os de bloco que começam a linha e as linhas de
 * comentário): só o que roda. As quebras de linha do Windows (o arquivo pode estar com CRLF no disco) viram \n.
 */
const codigo = (...partes: string[]) =>
  readFileSync(path.join('src', ...partes), 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

/* ------------------------------------------------------------------ */
/* R2: a palavra da faixa depois de "Pagar de novo"                    */

test('o aviso da sessão nova chega só a quem escuta aquele pedido, e a escuta desliga', () => {
  const alvo = new EventTarget();
  const ouvidos: string[] = [];
  const desligarA = ouvirSessaoNova('ON-AAAAAA', () => ouvidos.push('A'), alvo);
  const desligarB = ouvirSessaoNova('ON-BBBBBB', () => ouvidos.push('B'), alvo);
  avisarSessaoNova('ON-AAAAAA', alvo);
  assert.deepEqual(ouvidos, ['A']);
  // um evento com o mesmo nome e sem o código (ou de outro tipo) não conta
  alvo.dispatchEvent(new Event(EVENTO_SESSAO_NOVA));
  alvo.dispatchEvent(new CustomEvent(EVENTO_SESSAO_NOVA, { detail: null }));
  assert.deepEqual(ouvidos, ['A']);
  avisarSessaoNova('ON-BBBBBB', alvo);
  assert.deepEqual(ouvidos, ['A', 'B']);
  // desligada (a página saiu, ou trocou de pedido), a escuta não ouve mais nada
  desligarA();
  avisarSessaoNova('ON-AAAAAA', alvo);
  assert.deepEqual(ouvidos, ['A', 'B']);
  desligarB();
  avisarSessaoNova('ON-BBBBBB', alvo);
  assert.deepEqual(ouvidos, ['A', 'B']);
});

test('a palavra da faixa: um componente pequeno do navegador, sem nada da Stripe, que troca para "Aguardando pagamento"', () => {
  const fonte = codigo('components', 'pagamento', 'PalavraDoStatus.ts');
  assert.match(fonte, /^'use client';/);
  // sem JSX (um arquivo .ts): é o que deixa os testes rodarem o aviso e a escuta em node
  assert.doesNotMatch(fonte, /<[A-Za-z][\w.]*[\s>/]/);
  // só o React: a página do pedido o leva sem o pedaço do formulário da Stripe
  const importacoes = [...fonte.matchAll(/^import\s[^;]*?\sfrom\s+'([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(importacoes, ['react']);
  assert.doesNotMatch(fonte, /@stripe\/|CheckoutEmbutido'|import\(/);
  // a palavra de quando a página abriu até o aviso da sessão nova deste pedido; daí em diante, a de "esperando pagamento"
  assert.match(fonte, /useEffect\(\(\) => ouvirSessaoNova\(codigo, \(\) => setSessaoNova\(true\)\), \[codigo\]\);/);
  assert.match(fonte, /return sessaoNova \? textoPendente : texto;/);
  // nada de redesenhar a página por aqui
  assert.doesNotMatch(fonte, /router|location\./);
});

test('as duas faixas usam a palavra: na reserva com o pedido do voucher, no pedido só na tela de pagar e com a chave do status', () => {
  const status = codigo('components', 'StatusReserva.tsx');
  const pedido = codigo('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  // a reserva: a palavra de sempre (com o "Reembolso pendente"), e "Aguardando pagamento" depois da sessão nova do pedido
  // que a tela de pagar desta página paga (codigoPedido={r.pedidoCodigo ?? r.codigo})
  assert.match(
    status,
    /<span className="font-semibold">\s+<PalavraDoStatus\s+codigo=\{r\.pedidoCodigo \?\? r\.codigo\}\s+texto=\{reembolsoPendente \? textos\.reembolsoPendenteTitulo : statusTextos\[r\.status\]\}\s+textoPendente=\{statusTextos\.pendente\}\s+\/>\s+<\/span>/,
  );
  assert.match(status, /codigoPedido=\{r\.pedidoCodigo \?\? r\.codigo\}/);
  assert.match(status, /^import \{ PalavraDoStatus \} from '\.\/pagamento\/PalavraDoStatus';$/m);
  // o pedido: a faixa nasce no servidor; só com a tela de pagar na página entra o componente do navegador, com a mesma
  // chave da tela de pagar (o status) e o código que ela paga (codigoPedido={codigo})
  assert.match(
    pedido,
    /<p className="font-semibold">\s+\{statusOnline \? \(\s+<PalavraDoStatus key=\{status\} codigo=\{codigo\} texto=\{palavraDaFaixa\} textoPendente=\{d\.status\.pendente\} \/>\s+\) : \(\s+palavraDaFaixa\s+\)\}\s+<\/p>/,
  );
  assert.match(pedido, /<PagarPedido\s+key=\{status\}\s+codigoPedido=\{codigo\}/);
  assert.match(
    pedido,
    /const palavraDaFaixa = status === 'reembolsado' && reembolsoPendente \? d\.pedido\.reembolsoPendenteTitulo : d\.status\[status\];/,
  );
  assert.match(pedido, /^import \{ PalavraDoStatus \} from '@\/components\/pagamento\/PalavraDoStatus';$/m);
  assert.equal(pedido.split('<PalavraDoStatus').length, 2);
  // a escuta mora só na palavra: as páginas não escutam o aviso por conta própria
  for (const fonte of [status, pedido]) assert.doesNotMatch(fonte, /addEventListener\(|EVENTO_SESSAO_NOVA|ouvirSessaoNova/);
});

/* ------------------------------------------------------------------ */
/* R3: o checkout que recebe 409 "mudou"                               */

test('o 409 "mudou": com o pedido em aberto, a página do pedido; sem ele, o carrinho vazio diz por quê', () => {
  const carrinho = codigo('components', 'carrinho', 'FormularioCarrinho.tsx');
  const inicio = carrinho.indexOf("if (corpo.erro === 'mudou') {");
  assert.notEqual(inicio, -1);
  const ramo = carrinho.slice(inicio, carrinho.indexOf("} else if (corpo.erro === 'forma') {", inicio));
  // o carrinho que já é um pedido em aberto (pago nesse meio-tempo, ou com o item que perdeu o prazo): a página do pedido
  // diz o estado de verdade, com a página inteira carregando, antes de qualquer recarga do carrinho
  assert.match(
    ramo,
    /^if \(corpo\.erro === 'mudou'\) \{\s+if \(pedidoAberto\) \{\s+window\.location\.assign\(pedidoAberto\.href\);\s+return;\s+\}\s+await recarregar\(\);\s+setErroGeral\(K\.mudou\);\s+$/,
  );
  // o carrinho vazio mostra a frase do "mudou" (o único item perdeu o prazo), como alerta e com o foco do erro
  const vazio = carrinho.slice(carrinho.indexOf('if (!itens.length && !sessao) {'), carrinho.indexOf('const seuPedido = ('));
  assert.match(
    vazio,
    /<p className="text-lead">\{K\.vazio\}<\/p>\s+\{erroGeral === K\.mudou && \(\s+<p ref=\{erroRef\} tabIndex=\{-1\} className="mt-4 bg-erro-claro px-4 py-3 font-semibold text-mar outline-none" role="alert">\s+\{erroGeral\}\s+<\/p>\s+\)\}/,
  );
  // o mesmo bloco do erro do formulário (o fundo, a letra e o foco medidos de 320 a 1440 px)
  assert.match(
    carrinho,
    /<p ref=\{erroRef\} tabIndex=\{-1\} className="bg-erro-claro px-4 py-3 font-semibold text-mar outline-none" role="alert">/,
  );
  assert.match(carrinho, /useEffect\(\(\) => \{\s+if \(erroGeral\) erroRef\.current\?\.focus\(\);\s+\}, \[erroGeral\]\);/);
  // nada que segure a largura no carrinho vazio (letra grande em tela estreita)
  assert.doesNotMatch(vazio, /(?<![\w-])w-\[|min-w-|whitespace-nowrap|style=/);
});

/* ------------------------------------------------------------------ */
/* R4: os "Próximos passos" do transfer pago                           */

test('a página da reserva escolhe o primeiro passo do transfer no servidor, pela saída da ida', () => {
  const reserva = codigo('app', '[locale]', 'reserva', '[codigo]', 'page.tsx');
  const status = codigo('components', 'StatusReserva.tsx');
  assert.match(
    reserva,
    /transferEspera: ehTransfer\(reserva\) \? primeiroPassoDoTransfer\(reserva\.transfer\.ida\.saida\.lugar, d\.transfer\) : d\.transfer\.como\[0\],/,
  );
  assert.match(reserva, /^import \{ primeiroPassoDoTransfer \} from '@\/data\/transfer';$/m);
  // o componente só mostra o texto que chega pronto, como antes
  assert.match(status, /<li>\{t \? textos\.transferEspera : r\.horario\?\.busca \? textos\.proximo1Busca : textos\.proximo1Saida\}<\/li>/);
  assert.doesNotMatch(status, /LUGARES|aeroporto/);
});

/* ------------------------------------------------------------------ */
/* R5: a página aberta que não mudava                                  */

const pago: LeituraQueRedesenha = { status: 'pago' };

test('a leitura que muda a página: o status, o valor devolvido ou as partes de um reembolso que falhou', () => {
  // nada mudou: sem valor devolvido e com zero é o mesmo
  assert.equal(leituraMudou(pago, pago), false);
  assert.equal(leituraMudou({ status: 'pago', reembolsoCentavos: 0 }, pago), false);
  assert.equal(leituraMudou(pago, { status: 'pago', reembolsoCentavos: 0 }), false);
  // o status do voucher (o pedido inteiro reembolsado, o "Foi o voucher…" de um reembolso feito direto na Stripe)
  assert.equal(leituraMudou({ status: 'reembolsado' }, pago), true);
  assert.equal(leituraMudou({ status: 'contestado' }, pago), true);
  // o reembolso de um voucher que não é o primeiro: o primeiro continua pago, mas o valor do pedido inteiro mudou
  assert.equal(leituraMudou({ status: 'pago', reembolsoCentavos: 24200 }, pago), true);
  assert.equal(leituraMudou({ status: 'pago', reembolsoCentavos: 24200 }, { status: 'pago', reembolsoCentavos: 24200 }), false);
  // o reembolso que falhou: aparece; depois, a equipe registra a devolução por outro meio (o status e o valor não mudam,
  // só as partes: o pendente vira devolvido de outro jeito)
  const pendente: LeituraQueRedesenha = {
    status: 'reembolsado',
    reembolsoCentavos: 15400,
    reembolsoPartes: { originalCentavos: 0, pendenteCentavos: 15400, outroMeioCentavos: 0 },
  };
  const porOutroMeio: LeituraQueRedesenha = {
    ...pendente,
    reembolsoPartes: { originalCentavos: 0, pendenteCentavos: 0, outroMeioCentavos: 15400 },
  };
  assert.equal(leituraMudou(pendente, { status: 'reembolsado', reembolsoCentavos: 15400 }), true);
  assert.equal(leituraMudou(porOutroMeio, pendente), true);
  assert.equal(leituraMudou(porOutroMeio, { ...porOutroMeio, reembolsoPartes: { ...porOutroMeio.reembolsoPartes! } }), false);
  // cada uma das três partes conta
  for (const parte of ['originalCentavos', 'pendenteCentavos', 'outroMeioCentavos'] as const) {
    const outra = { ...pendente, reembolsoPartes: { ...pendente.reembolsoPartes!, [parte]: pendente.reembolsoPartes![parte] + 1 } };
    assert.equal(leituraMudou(outra, pendente), true, parte);
  }
});

test('a leitura do pedido traz o valor devolvido e as partes (o que a consulta já devolvia), e o motivo da recusa não redesenha', () => {
  const gancho = codigo('components', 'pagamento', 'useStatusDoPedido.ts');
  assert.match(
    gancho,
    /export type LeituraDoPedido = Pick<ReservaPublica, 'status' \| 'recusa' \| 'reembolsoCentavos' \| 'reembolsoPartes'>;/,
  );
  assert.match(gancho, /export type LeituraQueRedesenha = Pick<LeituraDoPedido, 'status' \| 'reembolsoCentavos' \| 'reembolsoPartes'>;/);
  // a resposta é a de sempre: o paraPublico do voucher consultado, que já tem os dois valores
  const rota = codigo('app', 'api', 'reservas', '[codigo]', 'route.ts');
  assert.match(rota, /reserva: paraPublico\(reserva, idioma\)/);
  const publica = codigo('lib', 'reserva-publica.ts');
  assert.match(publica, /reembolsoCentavos: r\.reembolsoCentavos,\s+\.\.\.\(reembolsoPartes \? \{ reembolsoPartes \} : \{\}\),/);
  // a recusa só conta na tela de pagar (que tem a comparação dela); aqui, uma recusa nova não muda nada
  const comRecusa: LeituraDoPedido = { status: 'pendente', recusa: 'saldo' };
  assert.equal(leituraMudou(comRecusa, { status: 'pendente' }), false);
  const inicio = gancho.indexOf('export function leituraMudou(');
  assert.notEqual(inicio, -1);
  assert.doesNotMatch(gancho.slice(inicio, gancho.indexOf('\n}\n', inicio)), /recusa/);
});
