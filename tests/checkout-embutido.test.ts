import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// O formulário da Stripe que não carrega (lacuna 16 do teste de 15/11; Pacote 8, 16/11). Com a rede que deixa o script
// da Stripe pendurado, ou com o script que carrega e o formulário que não monta, o cliente ficava diante de uma caixa
// branca. O conserto: 15 s sem o quadro da Stripe na caixa, o aviso entra ACIMA da caixa, que continua montada (a peça
// da Stripe para React, desmontada, deixa um formulário fantasma, e o Stripe.js recusa o seguinte: "You cannot have
// multiple Embedded Checkout objects"; medido pelo crítico com as peças de verdade). O componente só roda no navegador
// (React, a peça da Stripe e o atalho "@/"), então estes testes leem o código dele. Só leitura: nada é gravado.

/**
 * O código sem os comentários (os do JSX, os de bloco que começam a linha e as linhas de comentário): só o que roda. As
 * quebras de linha do Windows (o arquivo pode estar com CRLF no disco) viram \n.
 */
const semComentarios = (fonte: string) =>
  fonte
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

const codigo = semComentarios(readFileSync(path.join('src', 'components', 'pagamento', 'CheckoutEmbutido.tsx'), 'utf8'));

/** O componente CheckoutEmbutido (sem PagarPedido nem o gancho da consulta). */
const componente = (() => {
  const inicio = codigo.indexOf('export function CheckoutEmbutido(');
  const fim = codigo.indexOf('export interface TextosPagarPedido');
  assert.notEqual(inicio, -1);
  assert.ok(fim > inicio);
  return codigo.slice(inicio, fim);
})();

/** O efeito do prazo: do useEffect que cria o MutationObserver até as dependências dele. */
function efeitoDoPrazo(): string {
  const olho = componente.indexOf('new MutationObserver(');
  assert.notEqual(olho, -1, 'o vigia da caixa (MutationObserver)');
  const inicio = componente.lastIndexOf('useEffect(() => {', olho);
  const deps = '}, [stripe, segredo, semStripe]);';
  const fim = componente.indexOf(deps, olho);
  assert.notEqual(inicio, -1);
  assert.notEqual(fim, -1, 'o prazo recomeça com o Stripe.js, a sessão e o aviso do script barrado');
  return componente.slice(inicio, fim + deps.length);
}

/** Na tela: o aviso "o formulário não carregou" e a caixa do formulário, nessa ordem. */
function blocos(): { aviso: string; caixa: string } {
  const tela = componente.slice(componente.lastIndexOf('return (\n'));
  const aviso = tela.indexOf('{semFormulario && (');
  const caixa = tela.indexOf('{!semStripe && (');
  assert.notEqual(aviso, -1, 'o aviso do formulário que não carrega');
  assert.notEqual(caixa, -1, 'a caixa do formulário, só com o script barrado fora');
  assert.ok(aviso < caixa, 'o aviso vem acima da caixa');
  return { aviso: tela.slice(aviso, caixa), caixa: tela.slice(caixa) };
}

/** A caixa, da condição dela até a peça da Stripe (o que fica entre as duas decide se a peça continua montada). */
function caixaAteAPeca(): string {
  const { caixa } = blocos();
  const peca = caixa.indexOf('<EmbeddedCheckoutProvider');
  assert.notEqual(peca, -1, 'a peça da Stripe dentro da caixa');
  return caixa.slice(0, peca);
}

test('o formulário que não carrega: 15 s sem quadro da Stripe na caixa ligam o aviso do prazo (demorou), nunca o semStripe', () => {
  assert.match(codigo, /^const ESPERA_PELO_FORMULARIO_MS = 15_000;$/m);
  const efeito = efeitoDoPrazo();
  // com o script barrado não há caixa nem prazo; o prazo procura o quadro da Stripe (um iframe) dentro da caixa
  assert.match(efeito, /^useEffect\(\(\) => \{\s*if \(semStripe\) return;\s*const caixa = caixaRef\.current;\s*if \(!caixa\) return;/);
  assert.match(efeito, /const temQuadro = \(\) => caixa\.querySelector\('iframe'\) !== null;/);
  // passado o prazo, o aviso só entra se ainda não há quadro nenhum
  assert.match(
    efeito,
    /const id = window\.setTimeout\(\(\) => \{\s*if \(!temQuadro\(\)\) setDemorou\(true\);\s*\}, ESPERA_PELO_FORMULARIO_MS\);/,
  );
  assert.equal(codigo.match(/ESPERA_PELO_FORMULARIO_MS/g)?.length, 2);
  assert.equal(codigo.match(/setDemorou\(true\)/g)?.length, 1);
  // o prazo nunca liga o semStripe: ele tiraria a caixa e desmontaria a peça da Stripe (o desenho reprovado)
  assert.doesNotMatch(efeito, /setSemStripe/);
  // um prazo novo a cada sessão nova (o Pix depois do cartão recusado) e a cada "Tentar de novo"
  assert.match(efeito, /\}, \[stripe, segredo, semStripe\]\);$/);
});

test('o formulário que chega depois do prazo tira o aviso sozinho: um MutationObserver na caixa', () => {
  const efeito = efeitoDoPrazo();
  assert.match(
    efeito,
    /const olho = new MutationObserver\(\(\) => \{\s*if \(!temQuadro\(\)\) return;\s*window\.clearTimeout\(id\);\s*setDemorou\(false\);\s*\}\);/,
  );
  assert.match(efeito, /olho\.observe\(caixa, \{ childList: true, subtree: true \}\);/);
  // ao sair (sessão nova, script barrado, página fechada): nem relógio nem vigia ficam para trás
  assert.match(
    efeito,
    /return \(\) => \{\s*window\.clearTimeout\(id\);\s*olho\.disconnect\(\);\s*\};\s*\}, \[stripe, segredo, semStripe\]\);$/,
  );
  assert.equal(codigo.match(/new MutationObserver\(/g)?.length, 1);
  // a caixa vigiada é a do formulário: uma só, a que envolve a peça da Stripe
  assert.match(componente, /const caixaRef = useRef<HTMLDivElement>\(null\);/);
  assert.equal(codigo.match(/ref=\{caixaRef\}/g)?.length, 1);
  assert.match(caixaAteAPeca(), /^\{!semStripe && \(\s*<div\b[^>]*\sref=\{caixaRef\}/);
});

test('a caixa com a peça da Stripe depende só de semStripe, nunca do prazo: o aviso do prazo entra acima dela', () => {
  const { aviso } = blocos();
  const caixa = caixaAteAPeca();
  // entre a condição da caixa e a peça da Stripe, nenhuma outra condição e nada do prazo
  assert.doesNotMatch(caixa.slice('{!semStripe && ('.length), /&&|\?|\|\||demorou|semFormulario/);
  // e dentro da peça (a chave dela e o formulário que ela envolve): nada do prazo, nenhuma condição. Uma chave ou um
  // formulário que dependesse do aviso remontaria a peça da Stripe como o desenho reprovado
  const { caixa: caixaToda } = blocos();
  const fimDaPeca = caixaToda.indexOf('</EmbeddedCheckoutProvider>');
  assert.notEqual(fimDaPeca, -1, 'o fim da peça da Stripe dentro da caixa');
  const pecaInteira = caixaToda.slice('{!semStripe && ('.length, fimDaPeca);
  assert.doesNotMatch(pecaInteira, /&&|\?|\|\||demorou|semFormulario/);
  assert.match(pecaInteira, /<EmbeddedCheckoutProvider key=\{segredo\} /);
  // o aviso e a caixa são irmãos: a peça da Stripe não fica dentro do aviso
  assert.doesNotMatch(aviso, /EmbeddedCheckout/);
  // a troca de antes (o aviso OU a caixa) não volta: com ela, qualquer aviso desmontaria a peça da Stripe
  assert.doesNotMatch(componente, /\{semStripe \? \(|\{semFormulario \? \(/);
  assert.doesNotMatch(componente, /\) : \(\s*<div\b[^>]*\sref=\{caixaRef\}/);
  // demorou só nasce e entra no aviso: nunca numa caixa, numa chave ou numa classe
  const usos = [...componente.matchAll(/\bdemorou\b/g)].map((m) => {
    const inicio = componente.lastIndexOf('\n', m.index) + 1;
    return componente.slice(inicio, componente.indexOf('\n', m.index)).trim();
  });
  assert.deepEqual(usos, ['const [demorou, setDemorou] = useState(false);', 'const semFormulario = semStripe || demorou;']);
  // a caixa nunca se esconde (nunca display: none): a peça da Stripe precisa dela na tela para o formulário que chega atrasado
  assert.doesNotMatch(caixa, /className="[^"]*(?<![\w-])hidden(?![\w-])[^"]*"|display/);
});

test('o primeiro efeito fica como era: o aviso no lugar da caixa só quando o Stripe.js resolve sem a Stripe', () => {
  assert.match(
    componente,
    /useEffect\(\(\) => \{\s*let vivo = true;\s*stripe\.then\(\(s\) => \{\s*if \(vivo && !s\) setSemStripe\(true\);\s*\}\);\s*return \(\) => \{\s*vivo = false;\s*\};\s*\}, \[stripe\]\);/,
  );
  // o desenho reprovado trocava por setSemStripe(!s) e ligava o semStripe no prazo
  assert.doesNotMatch(codigo, /setSemStripe\(!s\)/);
  assert.equal(codigo.match(/setSemStripe\(true\)/g)?.length, 1);
});

test('o "Tentar de novo" do aviso do prazo vai à página do pedido com a página inteira carregando; o do script barrado carrega ali mesmo', () => {
  const { aviso } = blocos();
  assert.equal(aviso.match(/<button\b/g)?.length, 1);
  assert.match(aviso, /<button type="button" className="botao w-full sm:w-auto" onClick=\{semStripe \? carregarDeNovo : irParaOPedido\}>/);
  // a página do pedido como documento novo (sem o formulário que ficou para trás), de onde dá para pagar
  assert.match(componente, /const irParaOPedido = useCallback\(\(\) => window\.location\.assign\(urlVolta\), \[urlVolta\]\);/);
  // carregarDeNovo só no aviso do script barrado (a definição e o botão), e começa o prazo do zero
  assert.equal(componente.match(/\bcarregarDeNovo\b/g)?.length, 2);
  assert.match(
    componente,
    /function carregarDeNovo\(\) \{\s*setSemStripe\(false\);\s*setDemorou\(false\);\s*setStripe\(stripeDoNavegador\(\)\);\s*\}/,
  );
});

test('o aviso recebe o foco ao nascer, também pelo prazo, e a frase do recebedor do Pix sai junto', () => {
  assert.match(componente, /const semFormulario = semStripe \|\| demorou;/);
  assert.match(componente, /useEffect\(\(\) => \{\s*if \(semFormulario\) semStripeRef\.current\?\.focus\(\);\s*\}, \[semFormulario\]\);/);
  const { aviso } = blocos();
  assert.match(
    aviso,
    /^\{semFormulario && \(\s*<div className="rounded-cartao bg-erro-claro px-5 py-4 text-mar">\s*<p ref=\{semStripeRef\} tabIndex=\{-1\} role="alert"/,
  );
  assert.match(componente, /\{formaAtual === 'pix' && !semFormulario && <p [^>]*>\{T\.pixRecebedor\}<\/p>\}/);
  // nenhum texto novo: o aviso é o checkout.semStripe de sempre, com o "Tentar de novo" de sempre
  assert.match(aviso, /\{T\.semStripe\}/);
  assert.match(aviso, /\{T\.tentarDeNovo\}/);
});

test('o aviso é o mesmo bloco medido em 15/11 (sem rolar de lado de 320 a 1440 px, com a letra até 150%)', () => {
  const { aviso } = blocos();
  assert.match(aviso, /<p ref=\{semStripeRef\} tabIndex=\{-1\} role="alert" className="max-w-\[52ch\] font-semibold outline-none">/);
  // os botões um embaixo do outro, com a largura toda, no celular; lado a lado do sm para cima
  assert.match(aviso, /<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">/);
  assert.match(aviso, /<a href=\{contato\.href\} className="botao botao-vazado w-full sm:w-auto" data-evento="Contact">/);
  // nada que segure a largura (largura fixa ou mínima, texto sem quebra); o max-w-[52ch] só limita
  assert.doesNotMatch(aviso, /(?<![\w-])w-\[|min-w-|whitespace-nowrap|style=/);
});
