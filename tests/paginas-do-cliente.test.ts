import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { EVENTO_SESSAO_NOVA, avisarSessaoNova, ouvirSessaoNova } from '../src/components/pagamento/PalavraDoStatus.ts';
import { leituraMudou, type LeituraDoPedido, type LeituraQueRedesenha } from '../src/components/pagamento/useStatusDoPedido.ts';
import { dicionario } from '../src/i18n/index.ts';
import {
  depoisDaEspera,
  erroDaFormaRecusada,
  erroDepoisDaReleitura,
  erroRepeteANotaDoPix,
  ESPERA_DA_RELEITURA_MS,
  etapaComAsFormasDeAgora,
  formasDaResposta,
  noLugarDaOfertaDoPix,
  pixGeradoNaEscolha,
} from '../src/lib/espera-do-pagamento.ts';
import { textoDoContestado } from '../src/lib/texto-do-contestado.ts';

// As páginas do cliente depois do reteste de 16-17/11 (Pacote 13): a faixa que continuava "Expirado" depois de "Pagar de
// novo" (R2), o checkout que ficava só com "Seu carrinho está vazio." depois do 409 "mudou" (R3), os "Próximos passos" do
// transfer que vai para o aeroporto (R4, a regra em tests/transfer.test.ts) e a página aberta do pedido que não mudava
// com o reembolso de um voucher que não é o primeiro, nem com a devolução por outro meio (R5). Depois do reteste de 17/11
// (Pacote 14): o Pix já gerado durante o freio de emergência (L5d; a regra da faixa em tests/formas-pagamento.test.ts) e o
// botão preso em "Processando…" na página que o Safari devolve pelo botão de voltar. Do Pacote 16 (17/11): o freio
// publicado com o cliente na escolha da forma, que tocava em "Pagar" e lia que o pedido não podia mais ser pago pelo site,
// com o QR do Pix valendo. O aviso da sessão nova, a comparação das leituras e as decisões da espera rodam aqui em node; o
// resto são componentes do navegador e páginas do Next (o atalho "@/"), então os testes leem o código deles. Só leitura:
// nada é gravado.

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

/** Os nomes que um arquivo importa de '@/lib/espera-do-pagamento', numa linha ou em várias (como o prettier deixar). */
function importadoDaEspera(fonte: string): string[] {
  const lista = fonte.match(/^import \{([^}]*)\} from '@\/lib\/espera-do-pagamento';$/m);
  assert.ok(lista, 'a importação de @/lib/espera-do-pagamento');
  return lista[1]
    .split(',')
    .map((nome) => nome.trim())
    .filter(Boolean);
}

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
    /export type LeituraDoPedido = Pick<ReservaPublica, 'status' \| 'recusa' \| 'reembolsoCentavos' \| 'reembolsoPartes' \| 'pagamentoRetido'>;/,
  );
  // + o pagamento parado do pedido cancelado (Pacote 22): a decisão da equipe muda a frase da página aberta
  assert.match(
    gancho,
    /export type LeituraQueRedesenha = Pick<LeituraDoPedido, 'status' \| 'reembolsoCentavos' \| 'reembolsoPartes' \| 'pagamentoRetido'>;/,
  );
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
  // as regras vêm de src/lib/espera-do-pagamento.ts (desde o Pacote 17, a importação traz também as da escolha da forma)
  for (const nome of ['depoisDaEspera', 'etapaComAsFormasDeAgora', 'type EtapaDePagar'])
    assert.ok(importadoDaEspera(checkout).includes(nome), nome);
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
    /^if \(etapa === 'confirmando'\) \{\s+return \(\s+<div>\s+<h1 ref=\{tituloRef\} tabIndex=\{-1\} className="display scroll-mt-24 text-head outline-none">\s+\{T\.confirmando\}\s+<\/h1>\s+<p className="mt-4 max-w-\[44ch\] text-lead">\{T\.confirmandoTexto\}<\/p>\s+\{esperou && depois === 'esperar-o-pix' && <p className="mt-4 max-w-\[44ch\] text-lead">\{T\.pixGerado\}<\/p>\}\s+<p className="mt-6 max-w-\[52ch\] bg-superficie px-5 py-4">\{T\.atualizaSozinho\}<\/p>\s+\{esperou && depois === 'pagar' && \(\s+<div className="mt-6">\s+<button type="button" className="botao botao-vazado w-full sm:w-auto" onClick=\{\(\) => setEtapa\('escolher'\)\}>\s+\{T\.pagarAgora\}/,
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

/* ------------------------------------------------------------------ */
/* O freio publicado com a escolha da forma aberta (Pacote 16, 17/11)   */

// A nota 3 do revisor do Pacote 14: o cliente em "Ainda não pagou? Pagar agora" (as formas valendo), o freio de
// emergência publicado nesse meio-tempo, e o toque em "Pagar": a rota responde 403 'forma', a tela relê a página
// (router.refresh) e, com o status igual, ficava na escolha, sem formas: "Este pedido não pode mais ser pago pelo site",
// mesmo com o QR do Pix gerado antes ainda valendo.

test('a escolha sem formas segue a decisão do relógio: o Pix pendente volta à espera; o cartão e sem a forma, o aviso de sempre', () => {
  // o freio depois de "Pagar agora", no pedido de Pix pendente: a escolha volta a "Confirmando o pagamento…"
  assert.equal(etapaComAsFormasDeAgora('escolher', depoisDaEspera('pendente', [], 'pix')), 'confirmando');
  // no cartão, ou sem a forma do pedido: a escolha fica, com o aviso de que não dá mais para pagar pelo site, como antes
  assert.equal(etapaComAsFormasDeAgora('escolher', depoisDaEspera('pendente', [], 'cartao')), 'escolher');
  assert.equal(etapaComAsFormasDeAgora('escolher', depoisDaEspera('pendente', [], undefined)), 'escolher');
  // o 403 'forma' do Pix depois do prazo dele (o cartão ainda vale): a escolha fica, com o cartão e a frase do Pix
  assert.equal(etapaComAsFormasDeAgora('escolher', depoisDaEspera('pendente', ['cartao'], 'pix')), 'escolher');
  assert.equal(etapaComAsFormasDeAgora('escolher', depoisDaEspera('pendente', ['cartao', 'pix'], 'pix')), 'escolher');
  // vencido: a sessão acabou e o QR morreu com ela (a página do vencido é desenhada de novo, com key={status})
  assert.equal(etapaComAsFormasDeAgora('escolher', depoisDaEspera('expirado', [], 'pix')), 'escolher');
  // as outras etapas nunca mudam por aqui: a espera tem o relógio dela, e o formulário da Stripe aberto fica
  for (const depois of ['pagar', 'esperar-o-pix', 'sem-formas'] as const) {
    assert.equal(etapaComAsFormasDeAgora('confirmando', depois), 'confirmando', depois);
    assert.equal(etapaComAsFormasDeAgora('checkout', depois), 'checkout', depois);
  }
  // e é a mesma decisão do relógio dos 15 s: a escolha só volta à espera onde o relógio também esperaria
  for (const status of ['pendente', 'expirado'] as const)
    for (const formas of [[], ['cartao'], ['pix'], ['cartao', 'pix']] as const)
      for (const formaAtual of ['pix', 'cartao', undefined] as const) {
        const depois = depoisDaEspera(status, formas, formaAtual);
        assert.equal(
          etapaComAsFormasDeAgora('escolher', depois) === 'confirmando',
          depois === 'esperar-o-pix',
          `${status} ${formas} ${formaAtual}`,
        );
      }
});

test('a tela de pagar troca a escolha pela espera na própria renderização, com a frase do Pix gerado e sem o erro do "Pagar"', () => {
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  const inicio = checkout.indexOf('export function PagarPedido(');
  assert.notEqual(inicio, -1);
  const pagarPedido = checkout.slice(inicio);
  // as etapas são as da regra (o tipo dela), e a decisão vem de lá
  assert.match(
    pagarPedido,
    /const \[etapa, setEtapa\] = useState<EtapaDePagar>\(status === 'expirado' \|\| recusaInicial \? 'escolher' : 'confirmando'\);/,
  );
  assert.doesNotMatch(checkout, /^type Etapa = /m);
  // a troca: a etapa com as formas de agora; quando muda, o erro do "Pagar" sai, a espera já passou (a frase do Pix gerado
  // aparece na hora) e a etapa vira a da regra. Na renderização, depois da decisão, e não num efeito (o aviso sem formas
  // apareceria por um instante)
  const troca = pagarPedido.search(
    /const etapaDeAgora = etapaComAsFormasDeAgora\(etapa, depois\);\s+if \(etapaDeAgora !== etapa\) \{\s+setErro\(''\);\s+setEsperou\(true\);\s+setEtapa\(etapaDeAgora\);\s+\}/,
  );
  assert.notEqual(troca, -1);
  assert.ok(pagarPedido.indexOf('const depois = depoisDaEspera(status, formas, formaAtual);') < troca);
  const primeiraTela = pagarPedido.indexOf("if (etapa === 'checkout' && formaValida) {");
  assert.notEqual(primeiraTela, -1);
  assert.ok(troca < primeiraTela, 'antes de qualquer tela');
  assert.equal(pagarPedido.match(/etapaComAsFormasDeAgora\(/g)?.length, 1);
  const efeitos = [...pagarPedido.matchAll(/useEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/g)].map((m) => m[0]);
  assert.ok(efeitos.length >= 2);
  for (const efeito of efeitos) assert.doesNotMatch(efeito, /etapaComAsFormasDeAgora|etapaDeAgora/);
  // o "Pagar" que esbarra na forma: o erro (desde o Pacote 17, pela regra com as formas do 403: erroDaFormaRecusada, nos
  // testes logo abaixo) e a página relida, como antes (é a página relida que traz as formas de agora)
  assert.match(
    pagarPedido,
    /\} else if \(resposta\.erro === 'forma'\) \{\s+const qual = erroDaFormaRecusada\(escolhida, resposta\.formas, status, formaAtual\);\s+const frase = qual === 'nenhum' \? '' : qual === 'sem-pix' \? fraseSemPix\(T, resposta\.semPix\) : T\.semPrazo;\s+(?:\/\/[^\n]*\n\s+)*erroAdiado\.current = frase;\s+(?:\/\/[^\n]*\n\s+)*pagarRecusado\.current = true;\s+esperarAReleitura\(\);\s+router\.refresh\(\);\s+\}/,
  );
  // a espera que a troca mostra é a de sempre: a frase do Pix gerado com esperou e 'esperar-o-pix', sem o botão de pagar
  assert.match(
    pagarPedido,
    /\{esperou && depois === 'esperar-o-pix' && <p className="mt-4 max-w-\[44ch\] text-lead">\{T\.pixGerado\}<\/p>\}/,
  );
  assert.match(pagarPedido, /\{esperou && depois === 'pagar' && \(/);
  // e a escolha sem formas continua com o aviso de sempre (o cartão e o pedido sem a forma chegam lá)
  assert.match(pagarPedido, /\{formas\.length > 0 && formaValida \? \([\s\S]*?\) : \(\s+semFormas\s+\)\}/);
  assert.equal(pagarPedido.match(/\{T\.semPrazo\}/g)?.length, 1);
});

/* ------------------------------------------------------------------ */
/* O segundo de frase falsa do freio no meio do "Pagar" (reteste de 17-18/11, F7; Pacote 17) */

// O cliente na escolha da forma quando o freio entra, e o toque em "Pagar" com o Pix: a rota responde 403
// { erro: 'forma', formas: [] }. Por 0,4 a 1,3 s aparecia em vermelho "O Pix só vale até 2 horas antes do primeiro serviço
// do pedido. Agora, só dá para pagar com cartão.", falso (ON-9LK8Z4 e ON-KEG69N: o passeio era em dezembro, e o cartão
// também estava desligado), até a página relida chegar: sem motivo, fraseSemPix cai na frase do prazo, e pedirNovaSessao
// jogava fora as formas do 403.

test('as formas do 403: só as conhecidas; sem a lista, não se sabe quais valem', () => {
  assert.deepEqual(formasDaResposta([]), []);
  assert.deepEqual(formasDaResposta(['cartao']), ['cartao']);
  assert.deepEqual(formasDaResposta(['cartao', 'pix']), ['cartao', 'pix']);
  assert.deepEqual(formasDaResposta(['boleto', 'pix', 3, null]), ['pix']);
  // o 403 do prazo do Pix que passou no meio da criação da sessão não traz a lista
  assert.equal(formasDaResposta(undefined), undefined);
  assert.equal(formasDaResposta(null), undefined);
  assert.equal(formasDaResposta('cartao'), undefined);
  assert.equal(formasDaResposta({ 0: 'pix', length: 1 }), undefined);
});

test('o erro do "Pagar" que esbarra na forma: com as formas vazias, nunca a frase do prazo do Pix', () => {
  // o F7: o freio com o pedido de Pix pendente (o QR gerado), qualquer que seja a forma tocada: nenhum erro, e a página
  // relida volta à espera com a frase do Pix gerado (até o conserto, a frase do prazo do Pix no toque do Pix)
  assert.equal(erroDaFormaRecusada('pix', [], 'pendente', 'pix'), 'nenhum');
  assert.equal(erroDaFormaRecusada('cartao', [], 'pendente', 'pix'), 'nenhum');
  // nenhuma forma, nos outros pedidos: "Este pedido não pode mais ser pago pelo site" (até o conserto, a frase do prazo do
  // Pix no toque do Pix)
  assert.equal(erroDaFormaRecusada('pix', [], 'pendente', 'cartao'), 'sem-prazo');
  assert.equal(erroDaFormaRecusada('pix', [], 'pendente', undefined), 'sem-prazo');
  assert.equal(erroDaFormaRecusada('pix', [], 'expirado', 'pix'), 'sem-prazo');
  assert.equal(erroDaFormaRecusada('cartao', [], 'pendente', 'cartao'), 'sem-prazo');
  assert.equal(erroDaFormaRecusada('cartao', [], 'expirado', 'cartao'), 'sem-prazo');
  // o Pix que saiu com o cartão ainda valendo: a frase do motivo, como sempre (o prazo do Pix ou o limite de valor)
  assert.equal(erroDaFormaRecusada('pix', ['cartao'], 'pendente', 'pix'), 'sem-pix');
  assert.equal(erroDaFormaRecusada('pix', ['cartao'], 'expirado', 'cartao'), 'sem-pix');
  // o 403 sem a lista (o prazo do Pix que passou no meio da criação da sessão): a frase do motivo, que é o prazo
  assert.equal(erroDaFormaRecusada('pix', undefined, 'pendente', 'pix'), 'sem-pix');
  // o cartão que deixou de valer: "Este pedido não pode mais ser pago pelo site", como sempre
  assert.equal(erroDaFormaRecusada('cartao', ['pix'], 'pendente', 'cartao'), 'sem-prazo');
  assert.equal(erroDaFormaRecusada('cartao', undefined, 'pendente', 'cartao'), 'sem-prazo');
  // em todas as combinações: com as formas vazias, nunca a frase do Pix, e nenhum erro só onde a página relida volta à
  // espera (a mesma decisão do relógio); com alguma forma valendo, sempre um erro, e a escolha fica
  for (const status of ['pendente', 'expirado'] as const)
    for (const escolhida of ['pix', 'cartao'] as const)
      for (const formaAtual of ['pix', 'cartao', undefined] as const) {
        const caso = `${status} ${escolhida} ${formaAtual}`;
        const erro = erroDaFormaRecusada(escolhida, [], status, formaAtual);
        assert.notEqual(erro, 'sem-pix', caso);
        assert.equal(
          erro === 'nenhum',
          etapaComAsFormasDeAgora('escolher', depoisDaEspera(status, [], formaAtual)) === 'confirmando',
          caso,
        );
        for (const formas of [['cartao'], ['pix'], ['cartao', 'pix']] as const)
          assert.notEqual(erroDaFormaRecusada(escolhida, formas, status, formaAtual), 'nenhum', `${caso} ${formas}`);
      }
});

test('a tela de pagar guarda as formas do 403 e decide o erro pela regra, e a página é relida como antes', () => {
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  for (const nome of ['erroDaFormaRecusada', 'formasDaResposta']) assert.ok(importadoDaEspera(checkout).includes(nome), nome);
  // pedirNovaSessao: as formas do 403 ficam na resposta (até o conserto, só o motivo do Pix)
  assert.match(
    checkout,
    /type RespostaPagar = \{ clientSecret: string \} \| \{ erro: string; semPix\?: MotivoSemPix; formas\?: FormaPagamento\[\] \};/,
  );
  const inicioPedir = checkout.indexOf('export async function pedirNovaSessao(');
  assert.notEqual(inicioPedir, -1);
  const pedir = checkout.slice(inicioPedir, checkout.indexOf('const FECHA_O_CHECKOUT', inicioPedir));
  assert.match(pedir, /const formas = formasDaResposta\(corpo\.formas\);/);
  assert.match(
    pedir,
    /return \{ erro: corpo\.erro \?\? 'generico', \.\.\.\(semPix \? \{ semPix \} : \{\}\), \.\.\.\(formas \? \{ formas \} : \{\}\) \};/,
  );
  // abrirCheckout: o erro pela regra, com as formas do 403, o status e a forma do pedido; sem erro nenhum, nada escrito; a
  // página relida em todos os casos. A frase do prazo do Pix só pelo 'sem-pix'
  const pagarPedido = checkout.slice(checkout.indexOf('export function PagarPedido('));
  const inicioAbrir = pagarPedido.indexOf('async function abrirCheckout(');
  assert.notEqual(inicioAbrir, -1);
  const abrir = pagarPedido.slice(inicioAbrir, pagarPedido.indexOf('const brl = ', inicioAbrir));
  assert.match(
    abrir,
    /const qual = erroDaFormaRecusada\(escolhida, resposta\.formas, status, formaAtual\);\s+const frase = qual === 'nenhum' \? '' : qual === 'sem-pix' \? fraseSemPix\(T, resposta\.semPix\) : T\.semPrazo;\s+(?:\/\/[^\n]*\n\s+)*erroAdiado\.current = frase;\s+(?:\/\/[^\n]*\n\s+)*pagarRecusado\.current = true;\s+esperarAReleitura\(\);\s+router\.refresh\(\);/,
  );
  assert.equal(abrir.match(/fraseSemPix\(/g)?.length, 1);
  assert.doesNotMatch(abrir, /escolhida === 'pix' \? fraseSemPix/);
  // a rota de pagar manda as formas no 403 'forma' (vazias com o freio), como a tela espera
  const rota = codigo('app', 'api', 'pedido', '[codigo]', 'pagar', 'route.ts');
  assert.match(
    rota,
    /if \(!formas\.includes\(r\.data\.forma\)\) return erro\('forma', 403, \{ formas, \.\.\.\(semPix \? \{ semPix \} : \{\}\) \}\);/,
  );
});

/* ------------------------------------------------------------------ */
/* O freio, o cartão recusado e o "Pague com Pix" (reteste de 22/11, B5; Pacote 19) */

// O formulário do cartão aberto, o freio de emergência publicado nesse meio-tempo, o cartão recusado e o toque em "Cartão
// recusado? Pague com Pix…": a rota responde 403 { erro: 'forma', formas: [] } e o aviso passava a dizer, e ficava dizendo,
// "O Pix só vale até 2 horas antes do primeiro serviço do pedido. Agora, só dá para pagar com cartão. Tente com outro
// cartão." (ON-D2GGKW e ON-SHEN4P): falso, o passeio era em dezembro e o Pix tinha saído porque o pagamento foi desligado.
// As formas do 403 já chegavam à tela desde o Pacote 17 (formasDaResposta); faltava o aviso do cartão recusado usá-las.

test('no lugar da oferta do Pix: com as formas vazias, só o convite para outro cartão; com o cartão valendo ou sem a lista, a frase do motivo', () => {
  // o B5: o 403 do freio traz a lista vazia
  assert.equal(noLugarDaOfertaDoPix([]), 'so-outro-cartao');
  // o prazo do Pix passou (ou o valor passa do limite) e o cartão continua: a frase do motivo e o convite, como sempre
  assert.equal(noLugarDaOfertaDoPix(['cartao']), 'motivo-do-pix');
  // o 403 sem a lista (o prazo do Pix que passou no meio da criação da sessão): o de hoje
  assert.equal(noLugarDaOfertaDoPix(undefined), 'motivo-do-pix');
  // qualquer lista com alguma forma é "o de hoje": só a lista vazia tira a frase do Pix
  for (const formas of [['pix'], ['cartao', 'pix'], ['pix', 'cartao']] as const)
    assert.equal(noLugarDaOfertaDoPix(formas), 'motivo-do-pix');
  // pelas formas como o 403 as entrega à tela (formasDaResposta)
  assert.equal(noLugarDaOfertaDoPix(formasDaResposta([])), 'so-outro-cartao');
  assert.equal(noLugarDaOfertaDoPix(formasDaResposta(['cartao'])), 'motivo-do-pix');
  assert.equal(noLugarDaOfertaDoPix(formasDaResposta(undefined)), 'motivo-do-pix');
  assert.equal(noLugarDaOfertaDoPix(formasDaResposta(null)), 'motivo-do-pix');
  // é a mesma regra do "Pagar" da escolha: com as formas vazias, nunca a frase do Pix (erroDaFormaRecusada)
  for (const status of ['pendente', 'expirado'] as const)
    for (const formaAtual of ['pix', 'cartao', undefined] as const) {
      assert.notEqual(erroDaFormaRecusada('pix', [], status, formaAtual), 'sem-pix');
      assert.equal(noLugarDaOfertaDoPix([]), 'so-outro-cartao');
    }
  // o que o cliente lê em cada caso, nos quatro idiomas, com as frases de sempre do dicionário (nenhum texto novo)
  const aviso = (idioma: 'pt' | 'en' | 'es' | 'es-ar', formas: Parameters<typeof noLugarDaOfertaDoPix>[0], motivo?: 'prazo' | 'limite') => {
    const P = dicionario(idioma).pedido;
    const frase = motivo === 'limite' ? P.semPixLimite : P.semPixPrazo;
    return noLugarDaOfertaDoPix(formas) === 'so-outro-cartao' ? P.tentarOutroCartao : `${frase} ${P.tentarOutroCartao}`;
  };
  assert.equal(aviso('pt', []), 'Tente com outro cartão.');
  assert.equal(aviso('en', []), 'Try another card.');
  assert.equal(aviso('es', []), 'Prueba con otra tarjeta.');
  assert.equal(aviso('es-ar', []), 'Probá con otra tarjeta.');
  assert.equal(
    aviso('pt', ['cartao'], 'prazo'),
    'O Pix só vale até 2 horas antes do primeiro serviço do pedido. Agora, só dá para pagar com cartão. Tente com outro cartão.',
  );
  assert.equal(aviso('pt', undefined), aviso('pt', ['cartao'], 'prazo'));
  assert.equal(
    aviso('pt', ['cartao'], 'limite'),
    'O Pix tem um valor máximo por pagamento, e este pedido passa dele. Para este pedido, só dá para pagar com cartão. Tente com outro cartão.',
  );
  for (const idioma of ['pt', 'en', 'es', 'es-ar'] as const) {
    const P = dicionario(idioma).pedido;
    // com o freio, nem a frase do prazo nem a do limite
    assert.ok(!aviso(idioma, []).includes(P.semPixPrazo) && !aviso(idioma, []).includes(P.semPixLimite), idioma);
    assert.ok(aviso(idioma, ['cartao'], 'prazo').startsWith(P.semPixPrazo), idioma);
    assert.ok(aviso(idioma, ['cartao'], 'limite').startsWith(P.semPixLimite), idioma);
  }
});

test('o aviso do cartão recusado guarda a decisão do 403 e, sem forma nenhuma, mostra só o convite para outro cartão', () => {
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  assert.ok(importadoDaEspera(checkout).includes('noLugarDaOfertaDoPix'));
  const inicio = checkout.indexOf('export function CheckoutEmbutido(');
  const fim = checkout.indexOf('export interface TextosPagarPedido');
  assert.ok(inicio !== -1 && fim > inicio);
  const componente = checkout.slice(inicio, fim);
  // de saída, o de hoje: sem o Pix desde a abertura (o prazo ou o limite), a frase do motivo com o convite
  assert.match(componente, /const \[noLugarDoPix, setNoLugarDoPix\] = useState<NoLugarDaOfertaDoPix>\('motivo-do-pix'\);/);
  // o toque em "Pague com Pix" que esbarra no 403 'forma': a oferta sai, o motivo do servidor fica guardado e a regra
  // decide com as formas que o 403 trouxe. A sessão do cartão aberta não é tocada (nem o segredo, nem a forma, nem a página)
  const pagar = componente.slice(
    componente.indexOf('async function pagarComPix() {'),
    componente.indexOf('return (\n', componente.indexOf('async function pagarComPix() {')),
  );
  const ramo = pagar.match(/\} else if \(resposta\.erro === 'forma'\) \{([\s\S]*?)\} else if \(resposta\.erro === 'robo'\) \{/);
  assert.ok(ramo, "o ramo do 403 'forma'");
  assert.match(
    ramo[1],
    /^\s+setSemPix\(true\);\s+setMotivoDoServidor\(resposta\.semPix\);\s+setNoLugarDoPix\(noLugarDaOfertaDoPix\(resposta\.formas\)\);\s+$/,
  );
  assert.equal(checkout.match(/noLugarDaOfertaDoPix\(/g)?.length, 1);
  assert.equal(componente.match(/setNoLugarDoPix\(/g)?.length, 1);
  // o aviso: o botão do Pix enquanto ele vale; senão, só o convite quando nenhuma forma vale; senão, a frase de sempre
  assert.match(
    componente,
    /\{pixDisponivel && !semPix \? \(\s+<button [^>]*onClick=\{pagarComPix\}[^>]*>\s+\{trocando \? T\.processando : T\.recusadoPix\}\s+<\/button>\s+\) : noLugarDoPix === 'so-outro-cartao' \? \(\s+<p className="mt-2 text-small">\{T\.tentarOutroCartao\}<\/p>\s+\) : \(\s+<p className="mt-2 text-small">\s+\{fraseSemPix\(T, motivoDoServidor \?\? semPixDoServidor\)\} \{T\.tentarOutroCartao\}\s+<\/p>\s+\)\}/,
  );
  // a frase do Pix continua saindo de um lugar só no aviso, e o convite, dos dois ramos
  assert.equal(componente.match(/fraseSemPix\(/g)?.length, 1);
  assert.equal(componente.match(/\{T\.tentarOutroCartao\}/g)?.length, 2);
  // nenhum texto novo: o convite é o pedido.tentarOutroCartao de sempre, que a tela já recebia
  assert.match(codigo('lib', 'reserva-publica.ts'), /^\s+tentarOutroCartao: P\.tentarOutroCartao,$/m);
});

/* ------------------------------------------------------------------ */
/* A tela que ficava embaixo da frase no motor do iPhone (reteste de 22/11; Pacote 19) */

// Sem nenhuma forma valendo no instante do toque em "Pagar" (o freio, ou o último prazo passando com o cliente parado na
// escolha), a escolha some e o bloco "Este pedido não pode mais ser pago pelo site…" aparece lá em cima. No WebKit a página
// continuava rolada onde o botão estava: em 390×664 e 320×568 o cliente via só o resumo do pedido (o Chromium sobe
// sozinho). O mesmo pode acontecer com o pedido de Pix pendente, que volta para "Confirmando o pagamento…".

test('depois do "Pagar" recusado, a tela e o foco vão até o título do que entrou no lugar da escolha: só depois do toque e sem animação', () => {
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  const pagarPedido = checkout.slice(checkout.indexOf('export function PagarPedido('));
  // a medida de "fora da vista" é a do aviso do cartão recusado: o começo atrás do menu do topo (a folga é a margem de
  // rolagem do próprio elemento, lida do CSS na hora) ou o fim abaixo da tela
  assert.match(
    checkout,
    /function foraDaVista\(elemento: HTMLElement\): boolean \{\s+const folga = parseFloat\(getComputedStyle\(elemento\)\.scrollMarginTop\) \|\| 0;\s+const \{ top, bottom \} = elemento\.getBoundingClientRect\(\);\s+return top < folga \|\| bottom > window\.innerHeight;\s+\}/,
  );
  assert.match(checkout, /const folga = parseFloat\(getComputedStyle\(aviso\)\.scrollMarginTop\) \|\| 0;/);
  assert.match(checkout, /if \(top < folga \|\| bottom > window\.innerHeight\) aviso\.scrollIntoView\(\{ block: 'start' \}\);/);
  // o título e a marca do "Pagar" recusado
  assert.match(pagarPedido, /const tituloRef = useRef<HTMLHeadingElement>\(null\);/);
  assert.match(pagarPedido, /const pagarRecusado = useRef\(false\);/);
  // a marca só nasce no "Pagar" que esbarra na forma, logo antes de a página ser relida: nunca quando a página nasce, nem
  // no relógio da espera, nem nos outros erros (o do status redesenha a página inteira no estado novo, com outra chave)
  assert.equal(pagarPedido.match(/pagarRecusado\.current = true;/g)?.length, 1);
  const inicioAbrir = pagarPedido.indexOf('async function abrirCheckout(');
  const abrir = pagarPedido.slice(inicioAbrir, pagarPedido.indexOf('const brl = ', inicioAbrir));
  const ramo = abrir.match(/\} else if \(resposta\.erro === 'forma'\) \{([\s\S]*?)\} else if \(resposta\.erro === 'robo'\) \{/);
  assert.ok(ramo, "o ramo do 403 'forma'");
  assert.match(ramo[1], /pagarRecusado\.current = true;\s+esperarAReleitura\(\);\s+router\.refresh\(\);\s+$/);
  // o efeito: sem a marca, nada (a página que nasce, a espera que troca sozinha); com ela, uma vez só; só quando a escolha
  // saiu da tela (a espera, ou a escolha sem forma nenhuma, onde entra o aviso sem formas); rola só com o título fora da
  // vista, sem animação (o html do site rola suave: aqui é 'instant'), e o foco não rola de novo
  const efeito = pagarPedido.match(/useEffect\(\(\) => \{\s+if \(!pagarRecusado\.current\) return;[\s\S]*?\n {2}\}, \[([^\]]*)\]\);/);
  assert.ok(efeito, 'o efeito do "Pagar" recusado');
  assert.match(
    efeito[0],
    /^useEffect\(\(\) => \{\s+if \(!pagarRecusado\.current\) return;\s+pagarRecusado\.current = false;\s+window\.clearTimeout\(esperaDaReleitura\.current\);\s+const adiado = erroAdiado\.current;\s+erroAdiado\.current = '';\s+const semAEscolha = etapa === 'confirmando' \|\| \(etapa === 'escolher' && formas\.length === 0\);\s+if \(!semAEscolha\) \{\s+const frase = erroDepoisDaReleitura\(adiado, formas, notaDoPix\);\s+if \(frase\) setErro\(frase\);\s+return;\s+\}\s+const titulo = tituloRef\.current;\s+if \(!titulo\) return;\s+if \(foraDaVista\(titulo\)\) titulo\.scrollIntoView\(\{ block: 'start', behavior: 'instant' \}\);\s+titulo\.focus\(\{ preventScroll: true \}\);\s+\}, \[etapa, formas\]\);$/,
  );
  assert.equal(efeito[1], 'etapa, formas');
  assert.equal(pagarPedido.match(/scrollIntoView\(/g)?.length, 1);
  assert.equal(pagarPedido.match(/tituloRef\.current/g)?.length, 1);
  assert.doesNotMatch(pagarPedido, /behavior: 'smooth'|behavior: 'auto'/);
  // a escolha sem forma nenhuma é exatamente onde a tela mostra o aviso sem formas
  assert.match(pagarPedido, /\{formas\.length > 0 && formaValida \? \([\s\S]*?\) : \(\s+semFormas\s+\)\}/);
  // os títulos: o da espera e o da escolha recebem a tela e o foco (a margem de rolagem é a folga do menu do topo, a mesma
  // do aviso do cartão recusado; o foco não desenha contorno num título); o do formulário aberto fica como era
  const titulos = [...pagarPedido.matchAll(/<h1\b([^>]*)>\s*\{([^}]*)\}\s*<\/h1>/g)].map((m) => ({ abertura: m[1], texto: m[2] }));
  assert.deepEqual(
    titulos.map((t) => t.texto),
    ['T.pagamento', 'T.confirmando', 'titulo'],
  );
  assert.equal(titulos[0].abertura, ' className="display text-head"');
  for (const t of titulos.slice(1)) {
    assert.match(t.abertura, /^ ref=\{tituloRef\} tabIndex=\{-1\} className="([^"]*)"$/, t.texto);
    const classes = (t.abertura.match(/className="([^"]*)"/)?.[1] ?? '').split(/\s+/);
    assert.deepEqual([...classes].sort(), ['display', 'outline-none', 'scroll-mt-24', 'text-head'], t.texto);
  }
  assert.match(checkout, /<div ref=\{avisoRef\} role="alert" className="scroll-mt-24 [^"]*">/);
});

/* ------------------------------------------------------------------ */
/* O QR do Pix que ainda vale depois do prazo de 2 horas (reteste de 17-18/11, C2; Pacote 17) */

// ON-CGGYY5, o transfer da 0h: o QR gerado às 21:57:04 valia até 22:17. Às 22:00:16, depois do prazo do Pix, a tela "Pagar
// agora" mostrava só o cartão e "O Pix só vale até 2 horas antes do primeiro serviço do pedido. Agora, só dá para pagar com
// cartão.", sem dizer que o QR já gerado continuava valendo (e pagar no cartão ali troca a sessão e mata o QR).

test('a frase do Pix gerado na escolha: só no pedido de Pix pendente, com o Pix fora das formas e outra valendo', () => {
  // o C2: passou o prazo do Pix e só o cartão vale
  assert.equal(pixGeradoNaEscolha('pendente', ['cartao'], 'pix'), true);
  // o Pix ainda vale: a escolha mostra o Pix, sem a frase do prazo
  assert.equal(pixGeradoNaEscolha('pendente', ['cartao', 'pix'], 'pix'), false);
  // nenhuma forma: a escolha nem mostra as formas (com o freio, a volta à espera, que já tem a mesma frase)
  assert.equal(pixGeradoNaEscolha('pendente', [], 'pix'), false);
  // o pedido de cartão, ou sem a forma: não há QR
  assert.equal(pixGeradoNaEscolha('pendente', ['cartao'], 'cartao'), false);
  assert.equal(pixGeradoNaEscolha('pendente', ['cartao'], undefined), false);
  // vencido: o QR morreu com a sessão
  assert.equal(pixGeradoNaEscolha('expirado', ['cartao'], 'pix'), false);
  // em todas as combinações: só junto da frase do prazo (o Pix fora das formas, com alguma valendo), no Pix pendente
  for (const status of ['pendente', 'expirado'] as const)
    for (const formas of [[], ['cartao'], ['pix'], ['cartao', 'pix']] as const)
      for (const formaAtual of ['pix', 'cartao', undefined] as const) {
        const lista: readonly string[] = formas;
        const comAFraseDoPrazo = lista.length > 0 && !lista.includes('pix');
        assert.equal(
          pixGeradoNaEscolha(status, formas, formaAtual),
          comAFraseDoPrazo && status === 'pendente' && formaAtual === 'pix',
          `${status} ${formas} ${formaAtual}`,
        );
      }
});

test('a tela de pagar passa a frase do Pix gerado à escolha, que a mostra embaixo da frase do prazo, no mesmo quadro', () => {
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  assert.ok(importadoDaEspera(checkout).includes('pixGeradoNaEscolha'));
  const pagarPedido = checkout.slice(checkout.indexOf('export function PagarPedido('));
  // a frase só pela regra, com o status, as formas de agora e a forma do pedido; o texto é o de sempre (pedido.pixGerado)
  assert.match(
    pagarPedido,
    /<EscolhaPagamento\b[^>]*\spixGerado=\{pixGeradoNaEscolha\(status, formas, formaAtual\) \? T\.pixGerado : undefined\}/,
  );
  assert.equal(checkout.match(/pixGeradoNaEscolha\(/g)?.length, 1);
  // o checkout do carrinho não passa a frase
  const carrinho = codigo('components', 'carrinho', 'FormularioCarrinho.tsx');
  assert.match(carrinho, /<EscolhaPagamento\b/);
  assert.doesNotMatch(carrinho, /pixGerado/);
  // a escolha: embaixo da frase de por que o Pix ficou de fora, no mesmo quadro, e só a frase recebida
  const escolha = codigo('components', 'pagamento', 'EscolhaPagamento.tsx');
  assert.match(escolha, /^\s+pixGerado\?: string;$/m);
  const quadro = escolha.match(
    /\{!formas\.includes\('pix'\) && \(\s*<p className="([^"]*)">\s*\{fraseSemPix\(T, semPix\)\}\s*\{pixGerado && \(\s*<>\s*\{' '\}\s*<span className="([^"]*)">\{pixGerado\}<\/span>\s*<\/>\s*\)\}\s*<\/p>\s*\)\}/,
  );
  assert.ok(quadro, 'o quadro do motivo, com a frase do Pix gerado embaixo');
  // o quadro é o mesmo elemento de antes, com as mesmas classes (sem a frase nova, nada muda nele: o checkout do carrinho e
  // os roteiros da bancada que o acham por `fieldset p.bg-superficie`); a frase nova é um bloco na linha de baixo, com o vão
  // de 0,5rem, e nada segura a largura: as duas frases quebram entre as palavras
  assert.deepEqual(quadro[1].split(/\s+/), ['mt-3', 'bg-superficie', 'px-4', 'py-3', 'text-small']);
  assert.deepEqual(quadro[2].split(/\s+/), ['mt-2', 'block']);
  assert.doesNotMatch(quadro[0], /whitespace-nowrap|min-w-|(?<![\w-])w-\[|style=/);
  assert.equal(escolha.match(/fraseSemPix\(/g)?.length, 1);
  assert.equal(escolha.match(/\{pixGerado\}/g)?.length, 1);
});

test('a frase do Pix gerado cabe no quadro do motivo: nenhuma palavra mais longa que as de lá, e folga em 320 px com a letra em 150%', () => {
  const maisLonga = (frase: string) => Math.max(...frase.split(/\s+/).map((palavra) => palavra.length));
  const IDIOMAS = ['pt', 'en', 'es', 'es-ar'] as const;
  for (const idioma of IDIOMAS) {
    const p = dicionario(idioma).pedido;
    // as frases do motivo já foram medidas nesse quadro, de 320 a 1440 px com a letra até 150% (Pacote 9)
    assert.ok(maisLonga(p.pixGerado) <= Math.max(maisLonga(p.semPixPrazo), maisLonga(p.semPixLimite)), idioma);
  }
  // a conta, nas telas estreitas: a margem da página (clamp(1rem, 0.6rem + 1.8vw, 2rem), src/app/tokens.css) e o respiro do
  // quadro (px-4, 1rem) dos dois lados; a letra miúda é 0,9375rem. A palavra mais longa da frase nova, com folga (0,8em por
  // letra; a Barlow, a letra do site, fica bem abaixo disso), cabe com a letra em 100, 125 e 150% (raiz de 16, 20 e 24 px)
  const margem = (largura: number, raiz: number) => Math.min(2 * raiz, Math.max(raiz, 0.6 * raiz + (1.8 * largura) / 100));
  const espaco = (largura: number, raiz: number) => largura - 2 * margem(largura, raiz) - 2 * raiz;
  assert.equal(espaco(320, 24), 224);
  const maior = Math.max(...IDIOMAS.map((idioma) => maisLonga(dicionario(idioma).pedido.pixGerado)));
  assert.equal(maior, 9);
  for (const largura of [320, 360, 390])
    for (const raiz of [16, 20, 24]) assert.ok(maior * 0.8 * 0.9375 * raiz < espaco(largura, raiz), `${largura} px, raiz ${raiz} px`);
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
  assert.match(envio, /setEnviando\(true\);\s+try \{\s+const res = await envioProtegido\('\/api\/pedido'/);
  assert.match(
    envio,
    /const base = corpo\.itens === 1 \? links\.reserva : links\.pedido;\s+window\.location\.assign\(`\$\{base\}\/\$\{corpo\.codigo\}\?t=\$\{encodeURIComponent\(corpo\.token\)\}`\);\s+return;/,
  );
  assert.match(envio, /if \(pedidoAberto\) \{\s+window\.location\.assign\(pedidoAberto\.href\);\s+return;\s+\}/);
  // um ouvinte só, ligado num efeito e desligado quando o formulário sai da tela
  assert.equal(carrinho.match(/addEventListener\('pageshow'/g)?.length, 1);
  assert.equal(carrinho.match(/removeEventListener\('pageshow'/g)?.length, 1);
  const efeito = efeitoDoPageshow(carrinho, '}, [recarregar]);');
  // só a página que o navegador devolveu inteira (persisted); a carga comum não muda nada. Desde o Pacote 26, a trava da
  // releitura das formas também solta ali (tests/releitura-do-checkout.test.ts)
  assert.match(
    efeito,
    /^useEffect\(\(\) => \{\s+const aoMostrar = \(e: PageTransitionEvent\) => \{\s+if \(!e\.persisted\) return;\s+setEnviando\(false\);\s+setJaReleu\(false\);\s+recarregar\(\);\s+\};\s+window\.addEventListener\('pageshow', aoMostrar\);\s+return \(\) => window\.removeEventListener\('pageshow', aoMostrar\);\s+\}, \[recarregar\]\);$/,
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

/* ------------------------------------------------------------------ */
/* O pagamento contestado no pedido com mais de um voucher (reteste de 22/11, pergunta 16; Pacote 19) */

// A página do pedido de um pagamento contestado dizia "…o voucher fica suspenso…" mesmo com vários vouchers. Na página do
// pedido com mais de um voucher, o plural; a página da reserva (um voucher) e o pedido de um item ficam com a frase de sempre.

test('o texto do pagamento contestado: com um voucher, a frase de sempre; com mais de um, "os vouchers ficam suspensos", nos quatro idiomas', () => {
  const UM = {
    pt: 'Este pagamento foi contestado no banco. Enquanto o banco analisa, o voucher fica suspenso. Se tiver dúvidas, fale com a gente.',
    en: 'This payment has been disputed with the bank. While the bank reviews it, the voucher is on hold. If you have any questions, talk to us.',
    es: 'Este pago está en disputa con el banco. Mientras el banco lo revisa, el voucher queda suspendido. Si tienes dudas, escríbenos.',
    'es-ar':
      'Este pago está en disputa con el banco. Mientras el banco lo revisa, el voucher queda suspendido. Si tenés dudas, escribinos.',
  } as const;
  const VARIOS = {
    pt: 'Este pagamento foi contestado no banco. Enquanto o banco analisa, os vouchers ficam suspensos. Se tiver dúvidas, fale com a gente.',
    en: 'This payment has been disputed with the bank. While the bank reviews it, the vouchers are on hold. If you have any questions, talk to us.',
    es: 'Este pago está en disputa con el banco. Mientras el banco lo revisa, los vouchers quedan suspendidos. Si tienes dudas, escríbenos.',
    'es-ar':
      'Este pago está en disputa con el banco. Mientras el banco lo revisa, los vouchers quedan suspendidos. Si tenés dudas, escribinos.',
  } as const;
  for (const idioma of ['pt', 'en', 'es', 'es-ar'] as const) {
    const P = dicionario(idioma).pedido;
    // um voucher: a frase de hoje, sem mudar uma letra
    assert.equal(textoDoContestado(P, 1), UM[idioma], idioma);
    assert.equal(P.contestadoTexto, UM[idioma], idioma);
    // dois ou mais: o plural
    assert.equal(textoDoContestado(P, 2), VARIOS[idioma], idioma);
    assert.equal(textoDoContestado(P, 3), VARIOS[idioma], idioma);
    assert.equal(P.contestadoTextoVarios, VARIOS[idioma], idioma);
    // nenhum (não acontece: a página sem voucher nem abre) fica com a de um
    assert.equal(textoDoContestado(P, 0), UM[idioma], idioma);
    // as duas frases só diferem no pedaço do voucher: o começo e o fim são os mesmos
    const [antes, depois] = [UM[idioma].split('.')[0], UM[idioma].split('. ').at(-1)];
    assert.ok(VARIOS[idioma].startsWith(`${antes}.`) && VARIOS[idioma].endsWith(String(depois)), idioma);
    // o texto continua neutro: não fala em cartão (a contestação vale para o cartão e para o Pix)
    assert.doesNotMatch(VARIOS[idioma], /cart[ãa]o|tarjeta|card/i, idioma);
  }
  // só o es-ar tem versão própria ("tenés", "escribinos"), como a frase de um voucher
  assert.notEqual(dicionario('es-ar').pedido.contestadoTextoVarios, dicionario('es').pedido.contestadoTextoVarios);
  assert.match(readFileSync(path.join('src', 'i18n', 'es-ar.ts'), 'utf8'), /^\s+contestadoTextoVarios:$/m);
});

test('a página do pedido escolhe a frase pelo número de vouchers; a da reserva, que é de um voucher, fica com a de sempre', () => {
  const pedido = codigo('app', '[locale]', 'pedido', '[codigo]', 'page.tsx');
  const reserva = codigo('app', '[locale]', 'reserva', '[codigo]', 'page.tsx');
  const status = codigo('components', 'StatusReserva.tsx');
  // a página do pedido: o título de sempre e a frase pela regra, com os vouchers que ela leu
  assert.match(pedido, /contestado: \{ titulo: d\.pedido\.contestadoTitulo, texto: textoDoContestado\(d\.pedido, reservas\.length\) \},/);
  assert.match(pedido, /^import \{ textoDoContestado \} from '@\/lib\/texto-do-contestado';$/m);
  assert.doesNotMatch(pedido, /d\.pedido\.contestadoTexto\b/);
  // o pedido de um item nem chega lá: abre na página da reserva
  assert.match(pedido, /if \(!primeira\.pedido\) redirect\(/);
  // a página da reserva (um voucher) e o componente dela: a frase de um voucher, como sempre
  assert.match(reserva, /contestadoTexto: d\.pedido\.contestadoTexto,/);
  assert.match(status, /contestado: \{ titulo: textos\.contestadoTitulo, texto: textos\.contestadoTexto \},/);
  for (const fonte of [reserva, status]) assert.doesNotMatch(fonte, /contestadoTextoVarios|textoDoContestado/);
  // a regra é pura: não importa nada (o servidor e os testes a usam)
  assert.doesNotMatch(readFileSync(path.join('src', 'lib', 'texto-do-contestado.ts'), 'utf8'), /^import /m);
});

/* ------------------------------------------------------------------ */
/* Uma rolagem só depois do "Pagar" recusado, também no Android (reteste de 23/11, F3; Pacote 20) */

// No Chromium, com o atraso de uma rede de verdade (100 a 250 ms), o título e "Este pedido não pode mais ser pago pelo
// site…" ficavam acima da tela e o cliente via só o resumo do pedido: a frase vermelha do "Pagar" recebia o foco e o
// Chromium começava uma rolagem suave até ela (uns 330 ms); a página relida chegava no meio, a tela ia ao título e a
// rolagem antiga continuava e ganhava. Com 0 ms e com 300 ms ou mais dava certo; no WebKit, sempre.

test('a frase vermelha do "Pagar" recusado não repete o quadro cinza da escolha (reteste de 23/11, R4; Pacote 23)', () => {
  const T = dicionario('pt').pedido;
  const prazo = T.semPixPrazo;
  // o R4: a página relida com o Pix fora pelo prazo e o cartão valendo; a frase guardada é a mesma do quadro cinza
  assert.equal(prazo, 'O Pix só vale até 2 horas antes do primeiro serviço do pedido. Agora, só dá para pagar com cartão.');
  assert.equal(erroRepeteANotaDoPix(prazo, ['cartao'], prazo), true);
  assert.equal(erroDepoisDaReleitura(prazo, ['cartao'], prazo), '');
  // o motivo de agora é outro (o limite de valor de um Pix): o quadro diz outra coisa, e a frase vermelha aparece
  assert.equal(erroDepoisDaReleitura(prazo, ['cartao'], T.semPixLimite), prazo);
  // a página relida ainda com o Pix (o relógio do servidor ainda deixava): sem quadro cinza, a frase vermelha aparece
  assert.equal(erroRepeteANotaDoPix(prazo, ['cartao', 'pix'], prazo), false);
  assert.equal(erroDepoisDaReleitura(prazo, ['cartao', 'pix'], prazo), prazo);
  // sem forma nenhuma a escolha nem está na tela (o aviso sem formas): não há quadro cinza para repetir
  assert.equal(erroRepeteANotaDoPix(prazo, [], prazo), false);
  // as outras frases nunca são o quadro cinza: "não pode mais ser pago pelo site", a do robô, a geral
  for (const outra of [T.semPrazo, dicionario('pt').comum.robo, dicionario('pt').checkout.erros.generico]) {
    assert.equal(erroRepeteANotaDoPix(outra, ['cartao'], prazo), false, outra);
    assert.equal(erroDepoisDaReleitura(outra, ['cartao'], prazo), outra, outra);
  }
  // nada guardado, nada a mostrar
  assert.equal(erroRepeteANotaDoPix('', ['cartao'], ''), false);
  assert.equal(erroDepoisDaReleitura('', ['cartao'], prazo), '');
  // a espera curta pela página relida: cerca de 4 segundos (antes, sem ela, o toque parecia não fazer nada)
  assert.equal(ESPERA_DA_RELEITURA_MS, 4_000);
});

test('a frase do "Pagar" recusado espera a página relida e, sem ela, aparece embaixo do botão depois da espera curta (Pacote 23)', () => {
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  for (const nome of ['erroDepoisDaReleitura', 'erroRepeteANotaDoPix', 'ESPERA_DA_RELEITURA_MS']) {
    assert.ok(importadoDaEspera(checkout).includes(nome), nome);
  }
  const pagarPedido = checkout.slice(checkout.indexOf('export function PagarPedido('));
  // o quadro cinza da escolha é a frase do motivo com o motivo da página de agora (a mesma conta do EscolhaPagamento)
  assert.match(pagarPedido, /const notaDoPix = fraseSemPix\(T, semPix\);/);
  assert.match(
    codigo('components', 'pagamento', 'EscolhaPagamento.tsx'),
    /\{!formas\.includes\('pix'\) && \(\s+<p[^>]*>\s+\{fraseSemPix\(T, semPix\)\}/,
  );
  // a frase vermelha embaixo do botão não aparece quando só repetiria o quadro cinza (o R4: duas vezes na tela)
  assert.match(pagarPedido, /\{erro && !erroRepeteANotaDoPix\(erro, formas, notaDoPix\) && \(\s+<p ref=\{erroRef\}/);
  // a espera curta: um relógio só, desligado quando a página relida chega (no efeito de pagarRecusado) e quando a tela sai
  const espera = pagarPedido.match(/function esperarAReleitura\(\) \{([\s\S]*?)\n {2}\}/);
  assert.ok(espera, 'esperarAReleitura');
  assert.match(
    espera[1],
    /^\s+window\.clearTimeout\(esperaDaReleitura\.current\);\s+esperaDaReleitura\.current = window\.setTimeout\(\(\) => \{\s+if \(!pagarRecusado\.current\) return;\s+const adiado = erroAdiado\.current;\s+erroAdiado\.current = '';\s+if \(adiado\) setErro\(adiado\);\s+\}, ESPERA_DA_RELEITURA_MS\);\s*$/,
  );
  // a marca do toque fica: a página relida que chegar depois ainda leva a tela ao título, sem a frase de novo
  assert.doesNotMatch(espera[1], /pagarRecusado\.current = false/);
  assert.match(pagarPedido, /useEffect\(\(\) => \(\) => window\.clearTimeout\(esperaDaReleitura\.current\), \[\]\);/);
  assert.equal(pagarPedido.match(/esperarAReleitura\(\);/g)?.length, 1);
  assert.equal(pagarPedido.match(/window\.setTimeout\(\(\) => \{/g)?.length, 1);
});

test('a frase vermelha nunca nasce antes da página relida: a única rolagem é a do título', () => {
  const checkout = codigo('components', 'pagamento', 'CheckoutEmbutido.tsx');
  const pagarPedido = checkout.slice(checkout.indexOf('export function PagarPedido('));
  assert.match(pagarPedido, /const erroAdiado = useRef\(''\);/);
  const inicioAbrir = pagarPedido.indexOf('async function abrirCheckout(');
  const abrir = pagarPedido.slice(inicioAbrir, pagarPedido.indexOf('const brl = ', inicioAbrir));
  const ramo = abrir.match(/\} else if \(resposta\.erro === 'forma'\) \{([\s\S]*?)\} else if \(resposta\.erro === 'robo'\) \{/);
  assert.ok(ramo, "o ramo do 403 'forma'");
  // a frase pela regra de sempre, sempre guardada (nenhum setErro, nenhum foco, nenhuma rolagem até ela antes da página
  // relida). Até o Pacote 20: setErro sempre, antes da página relida; do Pacote 20 ao 23, só sem forma nenhuma no 403
  assert.match(
    ramo[1],
    /^\s+const qual = erroDaFormaRecusada\(escolhida, resposta\.formas, status, formaAtual\);\s+const frase = qual === 'nenhum' \? '' : qual === 'sem-pix' \? fraseSemPix\(T, resposta\.semPix\) : T\.semPrazo;\s+erroAdiado\.current = frase;\s+pagarRecusado\.current = true;\s+esperarAReleitura\(\);\s+router\.refresh\(\);\s+$/,
  );
  assert.doesNotMatch(ramo[1], /setErro\(/);
  // o efeito, depois de a página relida estar na tela: sem a escolha, uma rolagem só, sem animação, até o título, e o foco
  // sem rolar de novo; a frase guardada nunca aparece aí (o aviso sem formas diz o mesmo; a espera do Pix não tem erro).
  // Com a escolha ainda na tela, a frase aparece então, com o foco dela, como antes, menos quando repete o quadro cinza
  const efeito = pagarPedido.match(/useEffect\(\(\) => \{\s+if \(!pagarRecusado\.current\) return;[\s\S]*?\n {2}\}, \[etapa, formas\]\);/);
  assert.ok(efeito);
  const semEscolha = efeito[0].slice(efeito[0].indexOf('const titulo = tituloRef.current;'));
  assert.doesNotMatch(semEscolha, /setErro|erroAdiado/);
  assert.equal(efeito[0].match(/scrollIntoView\(/g)?.length, 1);
  assert.match(
    efeito[0],
    /if \(!semAEscolha\) \{\s+const frase = erroDepoisDaReleitura\(adiado, formas, notaDoPix\);\s+if \(frase\) setErro\(frase\);\s+return;\s+\}/,
  );
  // a frase só sai da marca dentro do efeito ou da espera curta, e a marca nasce só no ramo do 403
  assert.equal(pagarPedido.match(/erroAdiado\.current = frase;/g)?.length, 1);
  assert.equal(pagarPedido.match(/erroAdiado\.current = '';/g)?.length, 2);
  // o foco da frase vermelha (o que rolava a tela) continua só no efeito do erro, e a regra do foco do Pacote 19 fica
  assert.match(pagarPedido, /useEffect\(\(\) => \{\s+if \(erro\) erroRef\.current\?\.focus\(\);\s+\}, \[erro\]\);/);
  assert.match(semEscolha, /titulo\.focus\(\{ preventScroll: true \}\);/);
});
