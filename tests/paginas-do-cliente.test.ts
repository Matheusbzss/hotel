import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EVENTO_SESSAO_NOVA, avisarSessaoNova, ouvirSessaoNova } from '../src/components/pagamento/PalavraDoStatus.ts';
import { leituraMudou, type LeituraDoPedido, type LeituraQueRedesenha } from '../src/components/pagamento/useStatusDoPedido.ts';
import { dicionario } from '../src/i18n/index.ts';
import { depoisDaEspera } from '../src/lib/espera-do-pagamento.ts';

// As páginas do cliente depois do reteste de 16-17/11 (Pacote 13): a faixa que continuava "Expirado" depois de "Pagar de
// novo" (R2), o checkout que ficava só com "Seu carrinho está vazio." depois do 409 "mudou" (R3), os "Próximos passos" do
// transfer que vai para o aeroporto (R4, a regra em tests/transfer.test.ts) e a página aberta do pedido que não mudava
// com o reembolso de um voucher que não é o primeiro, nem com a devolução por outro meio (R5). Depois do reteste de 17/11
// (Pacote 14): o Pix já gerado durante o freio de emergência (L5d; a regra da faixa em tests/formas-pagamento.test.ts) e o
// botão preso em "Processando…" na página que o Safari devolve pelo botão de voltar. O aviso da sessão nova, a comparação
// das leituras e a decisão da espera rodam aqui em node; o resto são componentes do navegador e páginas do Next (o atalho
// "@/"), então os testes leem o código deles. Só leitura: nada é gravado.

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

/* ------------------------------------------------------------------ */
/* L5d: o Pix já gerado durante o freio de emergência (reteste de 17/11) */

// Com PAGAMENTO_ONLINE=desligado e o QR de R$ 138,60 ainda valendo (ON-9DV45C e ON-W7T39D), a faixa dizia "Aguardando
// pagamento R$ 154,00" (o valor do cartão) e, aos 16 s, a página dizia "Este pedido não pode mais ser pago pelo site."; o
// QR foi pago uns 3 minutos depois e a página virou "Reserva confirmada!" sozinha.

test('depois da espera: com forma, o botão de pagar; sem forma, o pedido de Pix continua esperando e o de cartão vê o aviso', () => {
  // com alguma forma valendo, o botão "Ainda não pagou? Pagar agora", como sempre (também no Pix depois do prazo dele)
  assert.equal(depoisDaEspera('pendente', ['cartao', 'pix'], 'pix'), 'pagar');
  assert.equal(depoisDaEspera('pendente', ['cartao', 'pix'], 'cartao'), 'pagar');
  assert.equal(depoisDaEspera('pendente', ['cartao'], 'pix'), 'pagar');
  assert.equal(depoisDaEspera('pendente', ['cartao'], 'cartao'), 'pagar');
  assert.equal(depoisDaEspera('pendente', ['cartao'], undefined), 'pagar');
  // o freio de emergência (nenhuma forma vale) com o Pix já gerado: continua esperando, com a frase do Pix gerado
  assert.equal(depoisDaEspera('pendente', [], 'pix'), 'esperar-o-pix');
  // no cartão, ou sem a forma do pedido: depois da espera, o aviso de sempre ("não pode mais ser pago pelo site")
  assert.equal(depoisDaEspera('pendente', [], 'cartao'), 'sem-formas');
  assert.equal(depoisDaEspera('pendente', [], undefined), 'sem-formas');
  // vencido: a sessão acabou e o QR morreu com ela
  assert.equal(depoisDaEspera('expirado', [], 'pix'), 'sem-formas');
});

test('a tela de pagar usa a decisão: o relógio dos 15 s só troca para o aviso sem forma, e a frase do Pix vem embaixo de "Se você já pagou…"', () => {
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  const inicio = checkout.indexOf('export function PagarPedido(');
  assert.notEqual(inicio, -1);
  const pagarPedido = checkout.slice(inicio);
  assert.match(checkout, /^import \{ depoisDaEspera \} from '@\/lib\/espera-do-pagamento';$/m);
  assert.match(pagarPedido, /const depois = depoisDaEspera\(status, formas, formaAtual\);/);
  // o relógio: só 'sem-formas' troca a tela para a escolha (o aviso); nos outros dois a espera termina e a tela fica. Até
  // o conserto, sem forma nenhuma a tela trocava sempre (temFormas ? setEsperou(true) : setEtapa('escolher'))
  assert.match(
    pagarPedido,
    /const id = window\.setTimeout\(\(\) => \(depois === 'sem-formas' \? setEtapa\('escolher'\) : setEsperou\(true\)\), ESPERA_PARA_PAGAR_MS\);/,
  );
  assert.match(pagarPedido, /\}, \[etapa, depois\]\);/);
  assert.doesNotMatch(pagarPedido, /\btemFormas\b/);
  assert.equal(pagarPedido.match(/setEtapa\('escolher'\)/g)?.length, 3, 'o relógio, a recusa lida na consulta e o botão "Pagar agora"');
  // a tela "Confirmando o pagamento…": o título, "Se você já pagou…", a frase do Pix gerado (só no 'esperar-o-pix', depois
  // da espera), a caixa "esta página mostra os vouchers" e o botão de pagar (só no 'pagar', depois da espera)
  const confirmando = pagarPedido.slice(pagarPedido.indexOf("if (etapa === 'confirmando') {"));
  assert.match(
    confirmando,
    /^if \(etapa === 'confirmando'\) \{\s+return \(\s+<div>\s+<h1 className="display text-head">\{T\.confirmando\}<\/h1>\s+<p className="mt-4 max-w-\[44ch\] text-lead">\{T\.confirmandoTexto\}<\/p>\s+\{esperou && depois === 'esperar-o-pix' && <p className="mt-4 max-w-\[44ch\] text-lead">\{T\.pixGerado\}<\/p>\}\s+<p className="mt-6 max-w-\[52ch\] bg-superficie px-5 py-4">\{T\.atualizaSozinho\}<\/p>\s+\{esperou && depois === 'pagar' && \(\s+<div className="mt-6">\s+<button type="button" className="botao botao-vazado w-full sm:w-auto" onClick=\{\(\) => setEtapa\('escolher'\)\}>\s+\{T\.pagarAgora\}/,
  );
  assert.equal(checkout.match(/\{T\.pixGerado\}/g)?.length, 1);
  // a frase tem as classes da "Se você já pagou…" (medida de 320 a 1440 px com a letra até 150%): quebra como ela, sem
  // nada que segure a largura
  const frase = confirmando.slice(confirmando.indexOf("{esperou && depois === 'esperar-o-pix'"), confirmando.indexOf('{T.pixGerado}'));
  assert.doesNotMatch(frase, /whitespace-nowrap|min-w-|(?<![\w-])w-\[|style=/);
  // a consulta do status continua durante a espera: pago, a página redesenha com os vouchers; a sessão acabou, com o
  // tempo esgotado (e então o aviso de que não dá mais para pagar pelo site)
  assert.match(
    pagarPedido,
    /useStatusDoPedido\(codigoConsulta, token, idioma, etapa !== 'checkout' && !criando, \(lido\) => \{\s+if \(lido\.status !== status\) \{\s+router\.refresh\(\);/,
  );
  // as duas páginas passam a forma do pedido à tela de pagar (a da reserva pelo StatusReserva)
  const status = codigo('components', 'StatusReserva.tsx');
  const pedido = codigo('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  const reserva = codigo('app', '[locale]', 'reserva', '[codigo]', 'page.tsx');
  assert.match(status, /<PagarPedido\b[^>]*\sformaAtual=\{pagamento\.formaAtual\}/);
  assert.match(pedido, /<PagarPedido\b[^>]*\sformaAtual=\{pagamento\.formaAtual\}/);
  assert.match(pedido, /\.\.\.\(primeira\.pagamento\.metodo !== 'whatsapp' \? \{ formaAtual: primeira\.pagamento\.metodo \} : \{\}\),/);
  assert.match(reserva, /\.\.\.\(reserva\.pagamento\.metodo !== 'whatsapp' \? \{ formaAtual: reserva\.pagamento\.metodo \} : \{\}\),/);
  // a frase chega pelos textos da tela de pagar, do dicionário
  assert.match(codigo('lib', 'reserva-publica.ts'), /^\s+pixGerado: P\.pixGerado,$/m);
  assert.match(checkout, /^\s+pixGerado: string;$/m);
});

test('a frase do Pix gerado nos quatro idiomas, como o plano a escreveu; o es-ar usa a do espanhol (impessoal)', () => {
  assert.equal(
    dicionario('pt').pedido.pixGerado,
    'Se você já gerou o código Pix, pode pagar pelo app do seu banco. Esta página se atualiza sozinha.',
  );
  assert.equal(
    dicionario('en').pedido.pixGerado,
    'If you already generated the Pix code, you can pay it in your bank app. This page updates on its own.',
  );
  assert.equal(
    dicionario('es').pedido.pixGerado,
    'Si el código Pix ya fue generado, se puede pagar en la app del banco. Esta página se actualiza sola.',
  );
  assert.equal(dicionario('es-ar').pedido.pixGerado, dicionario('es').pedido.pixGerado);
  assert.doesNotMatch(readFileSync(path.join('src', 'i18n', 'es-ar.ts'), 'utf8'), /pixGerado/);
});

test('a faixa das duas páginas passa pela regra única (formasDaFaixa), na faixa e nas linhas dos itens', () => {
  const status = codigo('components', 'StatusReserva.tsx');
  const pedido = codigo('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  // a reserva: só no pagamento online em aberto, como antes; a regra soma a forma do pedido pendente
  assert.match(status, /const formasNaFaixa = formasDaFaixa\(r\.status, online \? pagamento : undefined\);/);
  assert.match(status, /const brlTela = partesDoTotal\(r\.totalCentavos, r\.totalPixCentavos, formasNaFaixa\)\.map\(/);
  assert.equal(status.match(/partesDoTotal\(/g)?.length, 1);
  // o pedido: a faixa e as linhas de cada item, pelas mesmas formas (as de antes eram pagamento?.formas)
  assert.match(pedido, /const formasAbertas = formasDaFaixa\(status, pagamento\);/);
  assert.match(pedido, /emAberto \? partesDoTotal\(totalCentavos, totalPixCentavos, formasAbertas\) : \[\{ centavos: totalCentavos \}\];/);
  assert.equal(pedido.match(/partesDoTotal\(/g)?.length, 1);
  assert.equal(pedido.match(/\bformasAbertas\b/g)?.length, 2);
  for (const fonte of [status, pedido]) {
    assert.doesNotMatch(fonte, /pagamento\?\.formas/);
    assert.match(fonte, /^import \{ formasDaFaixa, partesDoTotal(?:, type ParteDoTotal)? \} from '@\/lib\/partes-do-total';$/m);
  }
});

/* ------------------------------------------------------------------ */
/* O botão preso em "Processando…" ao voltar (a memória de voltar do Safari) */

/** O efeito do ouvinte da página devolvida pelo "voltar" (pageshow): do useEffect que o liga até as dependências dele. */
function efeitoDoPageshow(fonte: string, deps: string): string {
  const liga = fonte.indexOf("window.addEventListener('pageshow', aoMostrar);");
  assert.notEqual(liga, -1, 'o ouvinte do pageshow');
  const inicio = fonte.lastIndexOf('useEffect(() => {', liga);
  const fim = fonte.indexOf(deps, liga);
  assert.notEqual(inicio, -1);
  assert.notEqual(fim, -1, `o fim do efeito: ${deps}`);
  return fonte.slice(inicio, fim + deps.length);
}

test('voltar para o checkout pela memória do navegador: o botão sai de "Processando…" e o carrinho é relido', () => {
  const carrinho = codigo('components', 'carrinho', 'FormularioCarrinho.tsx');
  // os dois saltos com a página inteira que deixam o botão em "Processando…" (setEnviando(true) antes, nenhum
  // setEnviando(false) depois) continuam como estavam: o do WhatsApp (no ar) e o do 409 "mudou" com o pedido em aberto
  const envio = carrinho.slice(carrinho.indexOf('async function enviar() {'));
  assert.match(envio, /setEnviando\(true\);\s+try \{\s+const res = await fetch\('\/api\/pedido'/);
  assert.match(
    envio,
    /const base = corpo\.itens === 1 \? links\.reserva : links\.pedido;\s+window\.location\.assign\(`\$\{base\}\/\$\{corpo\.codigo\}\?t=\$\{encodeURIComponent\(corpo\.token\)\}`\);\s+return;/,
  );
  assert.match(envio, /if \(pedidoAberto\) \{\s+window\.location\.assign\(pedidoAberto\.href\);\s+return;\s+\}/);
  // um ouvinte só, ligado num efeito e desligado quando o formulário sai da tela
  assert.equal(carrinho.match(/addEventListener\('pageshow'/g)?.length, 1);
  assert.equal(carrinho.match(/removeEventListener\('pageshow'/g)?.length, 1);
  const efeito = efeitoDoPageshow(carrinho, '}, [recarregar]);');
  // só a página que o navegador devolveu inteira (persisted); a carga comum não muda nada
  assert.match(
    efeito,
    /^useEffect\(\(\) => \{\s+const aoMostrar = \(e: PageTransitionEvent\) => \{\s+if \(!e\.persisted\) return;\s+setEnviando\(false\);\s+recarregar\(\);\s+\};\s+window\.addEventListener\('pageshow', aoMostrar\);\s+return \(\) => window\.removeEventListener\('pageshow', aoMostrar\);\s+\}, \[recarregar\]\);$/,
  );
  // o carrinho é relido pelo caminho de sempre (o do contexto do carrinho), nunca por uma cópia
  assert.match(carrinho, /const \{ itens: atuais, carregado, remover, recarregar \} = useCarrinho\(\);/);
  assert.doesNotMatch(carrinho, /fetch\(['"`]\/api\/carrinho\?/);
});

test('o mesmo no checkout embutido: a troca para o Pix que levou à página do pedido não deixa o botão preso ao voltar', () => {
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  const inicio = checkout.indexOf('export function CheckoutEmbutido(');
  const fim = checkout.indexOf('export interface TextosPagarPedido');
  assert.ok(inicio !== -1 && fim > inicio);
  const componente = checkout.slice(inicio, fim);
  // o salto: o botão "Cartão recusado? Pague com Pix" liga a troca e, com o pedido mudado por baixo, vai ao pedido com a
  // página inteira carregando, sem desligar a troca (o botão fica em "Processando…", o quadro esmaecido, a consulta parada)
  const pagar = componente.slice(componente.indexOf('async function pagarComPix() {'));
  assert.match(pagar, /^async function pagarComPix\(\) \{\s+setTrocando\(true\);/);
  assert.match(pagar, /\} else if \(resposta\.erro === 'status'\) \{\s+irParaOPedido\(\);\s+return;\s+\}/);
  assert.match(componente, /const irParaOPedido = useCallback\(\(\) => window\.location\.assign\(urlVolta\), \[urlVolta\]\);/);
  assert.match(componente, /useStatusDoPedido\(codigoConsulta, token, idioma, !trocando, /);
  // um ouvinte só, no componente da troca, desligado quando ele sai da tela
  assert.equal(checkout.match(/addEventListener\('pageshow'/g)?.length, 1);
  assert.equal(checkout.match(/removeEventListener\('pageshow'/g)?.length, 1);
  const efeito = efeitoDoPageshow(componente, '}, []);');
  assert.match(
    efeito,
    /^useEffect\(\(\) => \{\s+const aoMostrar = \(e: PageTransitionEvent\) => \{\s+if \(e\.persisted\) setTrocando\(false\);\s+\};\s+window\.addEventListener\('pageshow', aoMostrar\);\s+return \(\) => window\.removeEventListener\('pageshow', aoMostrar\);\s+\}, \[\]\);$/,
  );
  // a tela de pagar (PagarPedido) não tem o mesmo problema: o "criando" do "Pagar" sempre volta (router.refresh, sem
  // página inteira), e nenhum outro componente de src/components/pagamento/ vai para outra página com a página inteira
  const pagarPedido = checkout.slice(checkout.indexOf('export function PagarPedido('));
  assert.doesNotMatch(pagarPedido, /location\./);
  assert.match(pagarPedido, /\} else setErro\(T\.erroGenerico\);\s+setCriando\(false\);\s+\}/);
});
