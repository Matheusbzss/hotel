import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { EMPRESA } from '../src/config/empresa.ts';
import { dicionario } from '../src/i18n/index.ts';
import { ajustesAR } from '../src/i18n/es-ar.ts';
import { textosCotacao } from '../src/lib/cotacao.ts';
import { linkWhatsApp, whatsappDoRobo } from '../src/lib/whatsapp.ts';

// O botão do WhatsApp embaixo da mensagem de quem a proteção contra robôs confundiu com robô (Pacote 21, decisão do dono
// de 23/11/2026): o link (o número dos dados da empresa e só a saudação), as saudações nos idiomas, os quatro lugares que
// o mostram só junto da mensagem do robô e a conta da largura com a letra grande. Só leitura: nada é gravado.

/** O código de um arquivo sem os comentários (os do JSX, os de bloco e as linhas de comentário): só o que roda. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join(...partes), 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

const conta = (texto: string, trecho: string) => texto.split(trecho).length - 1;

const SAUDACOES = {
  pt: 'Olá! Não consegui concluir pelo site. Pode me ajudar?',
  en: "Hi! I couldn't finish on the website. Can you help me?",
  es: '¡Hola! No pude terminar en el sitio. ¿Me ayudan?',
  'es-ar': '¡Hola! No pude terminar en el sitio. ¿Me ayudan?',
} as const;

const ROTULOS = {
  pt: 'Chamar no WhatsApp',
  en: 'Message us on WhatsApp',
  es: 'Escribir por WhatsApp',
  'es-ar': 'Escribir por WhatsApp',
} as const;

/* ------------------------------------------------------------------ */
/* Os textos e o link                                                  */

test('as saudações finais em pt, en e es; o es-ar usa a do es (nenhuma entrada argentina)', () => {
  for (const idioma of ['pt', 'en', 'es', 'es-ar'] as const) {
    assert.equal(dicionario(idioma).comum.roboSaudacao, SAUDACOES[idioma], idioma);
    // nada de número, de "robô" ou de motivo na mensagem que o cliente manda
    assert.doesNotMatch(dicionario(idioma).comum.roboSaudacao, /\d|rob[oô]|bot|fraud/i, idioma);
  }
  assert.equal(dicionario('es-ar').comum.roboSaudacao, dicionario('es').comum.roboSaudacao);
  assert.equal((ajustesAR as { comum?: Record<string, unknown> }).comum?.roboSaudacao, undefined);
  assert.doesNotMatch(readFileSync(path.join('src', 'i18n', 'es-ar.ts'), 'utf8'), /roboSaudacao/);
});

test('o link do botão: o número dos dados da empresa, só a saudação codificada e o rótulo "Chamar no WhatsApp" de cada idioma', () => {
  for (const idioma of ['pt', 'en', 'es', 'es-ar'] as const) {
    const d = dicionario(idioma);
    const botao = whatsappDoRobo(d);
    // só o link e o rótulo: nada do cliente, do pedido ou do carrinho cabe aqui
    assert.deepEqual(Object.keys(botao).sort(), ['href', 'rotulo'], idioma);
    // o rótulo que o site já usa no voucher pago, sem texto novo
    assert.equal(botao.rotulo, d.reserva.chamarWhatsapp, idioma);
    assert.equal(botao.rotulo, ROTULOS[idioma], idioma);
    // o link: o do ajudante de sempre, com o número da configuração e a saudação codificada
    assert.equal(botao.href, linkWhatsApp(SAUDACOES[idioma]), idioma);
    assert.equal(botao.href, `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(SAUDACOES[idioma])}`, idioma);
    const url = new URL(botao.href);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.host, 'wa.me');
    assert.equal(url.pathname, `/${EMPRESA.whatsapp}`);
    assert.equal(url.hash, '');
    assert.deepEqual([...url.searchParams.keys()], ['text'], idioma);
    assert.equal(url.searchParams.get('text'), SAUDACOES[idioma], idioma);
    // codificada: sem espaço, "?" ou "!" soltos depois do ?text=
    assert.doesNotMatch(botao.href.slice(botao.href.indexOf('?text=') + 6), /[ ?¡¿]/, idioma);
  }
  assert.equal(EMPRESA.whatsapp, '5521990502377');
  // o formulário de orçamento e mensagem recebe o mesmo botão pelos textos dele
  for (const idioma of ['pt', 'en', 'es', 'es-ar'] as const)
    assert.deepEqual(textosCotacao(dicionario(idioma)).erroRoboWhatsapp, whatsappDoRobo(dicionario(idioma)), idioma);
});

test('o link chega pronto do servidor: nenhum componente do navegador importa o ajudante nem os dados da empresa', () => {
  const arquivos: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = path.join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.tsx?$/.test(nome)) arquivos.push(caminho);
    }
  };
  andar('src');
  for (const arquivo of arquivos) {
    const fonte = readFileSync(arquivo, 'utf8').replace(/\r\n?/g, '\n');
    if (!/^'use client';/.test(fonte)) continue;
    assert.doesNotMatch(fonte, /^import \{[^}]*\} from '@\/lib\/whatsapp';$/m, arquivo);
    assert.doesNotMatch(fonte, /from '@\/config\/empresa'/, arquivo);
  }
  // quem monta: as três páginas e os textos do pagamento e do orçamento, no servidor
  assert.match(codigo('src', 'app', '[locale]', 'checkout', 'page.tsx'), /robo: d\.comum\.robo,\s+roboWhatsapp: whatsappDoRobo\(d\),/);
  assert.match(codigo('src', 'lib', 'reserva-publica.ts'), /robo: d\.comum\.robo,\s+roboWhatsapp: whatsappDoRobo\(d\),/);
  assert.match(codigo('src', 'lib', 'cotacao.ts'), /erroRobo: d\.comum\.robo,\s+erroRoboWhatsapp: whatsappDoRobo\(d\),/);
  assert.match(
    codigo('src', 'app', '[locale]', 'consultar-pedido', 'page.tsx'),
    /textoRobo=\{dicionario\(locale\)\.comum\.robo\}\s+whatsappRobo=\{whatsappDoRobo\(dicionario\(locale\)\)\}/,
  );
  assert.match(
    codigo('src', 'components', 'carrinho', 'FormularioCarrinho.tsx'),
    /robo: textos\.robo,\s+roboWhatsapp: textos\.roboWhatsapp,/,
  );
});

/* ------------------------------------------------------------------ */
/* O botão e os quatro lugares                                         */

test('o botão: as classes dos outros botões do WhatsApp, o ícone que não encolhe, nova aba e só o link pronto', () => {
  const botao = codigo('src', 'components', 'BotaoWhatsAppDoRobo.tsx');
  assert.match(
    botao,
    /<a\s+href=\{whatsapp\.href\}\s+target="_blank"\s+rel="noopener noreferrer"\s+className="botao botao-whats w-full min-w-0 sm:w-auto"\s+data-evento="Contact"\s*>\s*<IconeWhatsApp className="size-5" \/>\s*\{whatsapp\.rotulo\}\s*<\/a>/,
  );
  // nenhum número escrito no componente: o link vem de fora
  assert.doesNotMatch(botao, /wa\.me|\d{8,}|EMPRESA/);
  assert.match(botao, /^import type \{ WhatsAppDoRobo \} from '@\/lib\/whatsapp';$/m);
  // o ícone continua com o shrink-0 no próprio componente
  assert.match(
    codigo('src', 'components', 'IconeWhatsApp.tsx'),
    /<svg viewBox="0 0 32 32" className=\{className \? `shrink-0 \$\{className\}` : 'shrink-0'\}/,
  );
});

test('os quatro lugares mostram o botão só junto da mensagem do robô (o 403 "robo"), e em nenhum outro lugar', () => {
  // o botão só existe nestes quatro arquivos (e no dele)
  const usos: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = path.join(dir, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (/\.tsx?$/.test(nome) && /<BotaoWhatsAppDoRobo\b/.test(readFileSync(caminho, 'utf8')))
        usos.push(caminho.split(path.sep).join('/'));
    }
  };
  andar('src');
  assert.deepEqual(usos.sort(), [
    'src/components/FormularioConsulta.tsx',
    'src/components/FormularioCotacao.tsx',
    'src/components/carrinho/FormularioCarrinho.tsx',
    'src/components/pagamento/CheckoutEmbutido.tsx',
  ]);

  // fechar o pedido: embaixo do erro do envio, só quando o erro é a mensagem do robô, que só o 403 'robo' põe ali
  const carrinho = codigo('src', 'components', 'carrinho', 'FormularioCarrinho.tsx');
  assert.equal(conta(carrinho, '<BotaoWhatsAppDoRobo'), 1);
  assert.match(
    carrinho,
    /\{erroGeral \|\| C\.erros\.revise\}\s*<\/p>\s*\)\}\s*\{erroGeral === textos\.robo && <BotaoWhatsAppDoRobo whatsapp=\{textos\.roboWhatsapp\} \/>\}/,
  );
  assert.equal(conta(carrinho, 'setErroGeral(textos.robo)'), 1);
  assert.match(carrinho, /\} else if \(respostaDeRobo\(res\.status, corpo\)\) \{\s+setErroGeral\(textos\.robo\);/);

  // pagar de novo, o "Pague com Pix" do cartão recusado e, desde o Pacote 34 (P1), o "Pague com cartão" embaixo do QR do
  // Pix: os três só com o erro do robô, que só o 'robo' do POST /pagar põe
  const checkout = codigo('src', 'components', 'pagamento', 'CheckoutEmbutido.tsx');
  assert.equal(conta(checkout, '<BotaoWhatsAppDoRobo'), 3);
  assert.equal(conta(checkout, 'setErro(T.robo)'), 3);
  assert.equal(checkout.match(/\} else if \(resposta\.erro === 'robo'\) \{\s+setErro\(T\.robo\);/g)?.length, 3);
  // o da troca do Pix para o cartão: embaixo do erro dela, que nasce embaixo do botão, com o QR na tela
  assert.match(
    checkout,
    /\{erro\}\s*<\/p>\s*\)\}\s*\{formaAtual === 'pix' && erro === T\.robo && <BotaoWhatsAppDoRobo whatsapp=\{T\.roboWhatsapp\} \/>\}/,
  );
  // o do cartão recusado: logo embaixo do aviso (fora do respiro dele), com o aviso na tela
  assert.match(
    checkout,
    /\{erro\}\s*<\/p>\s*\)\}\s*<\/div>\s*\)\}\s*\{recusa && formaAtual === 'cartao' && erro === T\.robo && <BotaoWhatsAppDoRobo whatsapp=\{T\.roboWhatsapp\} \/>\}/,
  );
  // o do "Pagar agora" / "Pagar de novo": embaixo do erro, que nasce embaixo do botão
  assert.match(
    checkout,
    /\{erro\}\s*<\/p>\s*\)\}\s*\{erro === T\.robo && \(\s*<div className="mt-3">\s*<BotaoWhatsAppDoRobo whatsapp=\{T\.roboWhatsapp\} \/>\s*<\/div>\s*\)\}/,
  );

  // orçamento e mensagem
  const cotacao = codigo('src', 'components', 'FormularioCotacao.tsx');
  assert.equal(conta(cotacao, '<BotaoWhatsAppDoRobo'), 1);
  assert.match(
    cotacao,
    /\{erroGeral\}\s*<\/p>\s*\)\}\s*\{erroGeral === T\.erroRobo && <BotaoWhatsAppDoRobo whatsapp=\{T\.erroRoboWhatsapp\} \/>\}/,
  );
  // a mensagem só por dois caminhos: o 403 'robo' e a proteção que não respondeu no prazo (Pacote 24, src/lib/envio-protegido.ts)
  assert.equal(cotacao.match(/T\.erroRobo\b/g)?.length, 3);
  assert.equal(conta(cotacao, '? T.erroRobo :'), 2);
  assert.equal(conta(cotacao, 'respostaDeRobo(res.status, await res.json().catch(() => null)) ? T.erroRobo : T.erro'), 1);
  assert.equal(conta(cotacao, 'semRespostaDaProtecao(e) ? T.erroRobo : T.erro'), 1);

  // consultar meu pedido
  const consulta = codigo('src', 'components', 'FormularioConsulta.tsx');
  assert.equal(conta(consulta, '<BotaoWhatsAppDoRobo'), 1);
  assert.match(
    consulta,
    /\{erroGeral\}\s*<\/p>\s*\)\}\s*\{erroGeral === textoRobo && <BotaoWhatsAppDoRobo whatsapp=\{whatsappRobo\} \/>\}/,
  );
  assert.match(consulta, /respostaDeRobo\(res\.status, dados\)\s+\? textoRobo\s+:/);
  // e a proteção que não respondeu no prazo (Pacote 24, src/lib/envio-protegido.ts)
  assert.equal(conta(consulta, 'semRespostaDaProtecao(e) ? textoRobo : T.erroGeral'), 1);
  assert.equal(conta(consulta, 'textoRobo'), 5);
});

/* ------------------------------------------------------------------ */
/* A largura com a letra grande                                        */

/** A margem da página (--margem: clamp(1rem, 0.6rem + 1.8vw, 2rem)), em px, com o html em `raiz` px. */
const margemDaPagina = (largura: number, raiz: number) => Math.min(2 * raiz, Math.max(raiz, 0.6 * raiz + (1.8 * largura) / 100));

test('a conta da largura: em 320, 360 e 390 px com a letra em 100, 125 e 150%, a palavra mais longa fica dentro do botão', () => {
  // a medida do .botao (src/app/globals.css): respiro de 1.4rem dos lados, vão de 0.6rem e letra de 1.125rem
  const css = readFileSync(path.join('src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');
  const regra = css.slice(css.indexOf('\n  .botao {'), css.indexOf('}', css.indexOf('\n  .botao {')));
  for (const linha of ['gap: 0.6rem;', 'padding: 0.75rem 1.4rem;', 'font-size: 1.125rem;', 'text-align: center;'])
    assert.ok(regra.includes(linha), linha);
  // a palavra mais longa do rótulo é "WhatsApp" nos três idiomas: o texto quebra entre as palavras, nunca dentro dela
  for (const rotulo of Object.values(ROTULOS)) {
    // nenhuma palavra tem mais letras que ela (em es, "Escribir" empata em letras e é mais estreita: sem o W)
    assert.ok(rotulo.includes('WhatsApp'), rotulo);
    for (const p of rotulo.split(' ')) assert.ok(p.length <= 'WhatsApp'.length, rotulo);
  }
  // a largura de "WhatsApp" em vezes a letra do botão (Barlow Semi Condensed), a mesma medida do botão do voucher pago
  // (tests/telas-pagamento.test.ts)
  const palavra = 4.065;
  // a coluna mais estreita dos quatro formulários: o de mensagem da página de contato (p-7 no celular)
  assert.match(codigo('src', 'app', '[locale]', 'contato', 'page.tsx'), /className="tom-papel chegar w-full p-7 md:w-\[26rem\] md:p-8"/);
  for (const largura of [320, 360, 390])
    for (const raiz of [16, 20, 24]) {
      const coluna = largura - 2 * margemDaPagina(largura, raiz) - 2 * 1.75 * raiz;
      // o ícone inteiro (size-5, que não encolhe), o vão e a palavra cabem no botão, que tem a largura da coluna
      const ocupa = 1.25 * raiz + 0.6 * raiz + palavra * 1.125 * raiz;
      assert.ok(ocupa <= coluna, `${largura}/${raiz}`);
      // e o conjunto avança no respiro do botão menos do que o respiro (o .botao centraliza): o texto não sai do verde
      const espaco = coluna - 2 * 1.4 * raiz;
      assert.ok((ocupa - espaco) / 2 < 1.4 * raiz, `${largura}/${raiz}`);
    }
  // o pior caso, 320 px com 150%: a coluna de 188 px e o conjunto de 154,2 px
  assert.equal(320 - 2 * margemDaPagina(320, 24) - 2 * 1.75 * 24, 188);
  // no computador (1440 px), a caixa de 26rem com p-8: sobra espaço em qualquer tamanho de letra
  for (const raiz of [16, 20, 24]) assert.ok(1.25 * raiz + 0.6 * raiz + palavra * 1.125 * raiz <= (26 - 2 * 2) * raiz - 2 * 1.4 * raiz);
  // os dois formulários em grade: o min-w-0 não deixa a palavra alargar a coluna (o mínimo do item da grade é o conteúdo)
  assert.match(codigo('src', 'components', 'FormularioCotacao.tsx'), /className="relative mt-4 grid gap-4"/);
  assert.match(codigo('src', 'components', 'FormularioConsulta.tsx'), /className="relative mt-6 grid gap-5"/);
  assert.match(codigo('src', 'components', 'BotaoWhatsAppDoRobo.tsx'), /className="botao botao-whats w-full min-w-0 sm:w-auto"/);
});
