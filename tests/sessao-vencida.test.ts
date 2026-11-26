import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { AVISO_DA_SESSAO_VENCIDA, ENDERECO_DA_SESSAO_VENCIDA, navegacaoDoNavegador, origemDeFora } from '../src/lib/sessao-do-painel.ts';

// Pacote 33, D3: com a sessão do painel vencida (o painel aberto no celular desde a véspera), os botões do painel abriam
// uma página crua com o texto {"ok":false}. Agora o formulário do painel (a navegação do navegador) volta para a entrada
// do painel com "Sua sessão venceu. Entre de novo."; o fetch (JSON) continua com o 401. A proteção não afrouxa: o pedido
// de outro site é recusado antes de tudo, nada é feito sem a sessão, e a volta é um endereço fixo do próprio site. As
// rotas rodam no servidor do Next (o atalho "@/"), então os testes leem o código delas; as regras rodam aqui em node.

/** O código de um arquivo, sem as linhas de comentário (e sem o \r dos arquivos gravados com CRLF). */
const codigo = (arquivo: string) =>
  readFileSync(arquivo, 'utf8')
    .replace(/\r/g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l))
    .join('\n');

const cabecalhos = (h: Record<string, string>) => new Headers(h);

test('a navegação do navegador: o Sec-Fetch-Mode diz; sem ele, o Accept de HTML', () => {
  // o POST de um formulário e o link aberto numa aba
  assert.equal(navegacaoDoNavegador(cabecalhos({ 'sec-fetch-mode': 'navigate', accept: 'text/html' })), true);
  assert.equal(navegacaoDoNavegador(cabecalhos({ 'sec-fetch-mode': 'Navigate' })), true);
  // o fetch do cadastro da casa (e qualquer outro): "cors", "same-origin" ou "no-cors" (a imagem do mapa), mesmo pedindo HTML
  for (const modo of ['cors', 'same-origin', 'no-cors', 'websocket'])
    assert.equal(navegacaoDoNavegador(cabecalhos({ 'sec-fetch-mode': modo, accept: 'text/html,*/*' })), false, modo);
  // navegador antigo, sem os cabeçalhos Sec-Fetch: a página pede HTML, o fetch não
  assert.equal(navegacaoDoNavegador(cabecalhos({ accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' })), true);
  assert.equal(navegacaoDoNavegador(cabecalhos({ accept: '*/*' })), false);
  assert.equal(navegacaoDoNavegador(cabecalhos({ accept: 'application/json' })), false);
  assert.equal(navegacaoDoNavegador(cabecalhos({})), false);
});

test('o pedido de outro site: a origem diferente, e a que não dá para ler, contam como de fora', () => {
  const url = 'https://orlanativa.online/api/admin/reservas/ON-ABC234';
  assert.equal(origemDeFora(null, url), false);
  assert.equal(origemDeFora('https://orlanativa.online', url), false);
  assert.equal(origemDeFora('https://golpe.example', url), true);
  assert.equal(origemDeFora('https://orlanativa.online.golpe.example', url), true);
  assert.equal(origemDeFora('http://localhost:3406', 'http://localhost:3406/api/admin/cotacoes/x'), false);
  // o "null" de alguns navegadores e o lixo: na dúvida, de fora (antes, o new URL estourava e a rota dava 500)
  assert.equal(origemDeFora('null', url), true);
  assert.equal(origemDeFora('nada que seja endereço', url), true);
});

test('a volta é sempre a mesma: a entrada do painel com o aviso, no próprio site', () => {
  assert.equal(ENDERECO_DA_SESSAO_VENCIDA, '/admin?erro=sessao');
  assert.equal(AVISO_DA_SESSAO_VENCIDA, 'Sua sessão venceu. Entre de novo.');
  // relativo ao próprio pedido: o caminho é fixo, e nada do que veio no pedido (busca, filtro, voucher) vai junto
  const volta = new URL(ENDERECO_DA_SESSAO_VENCIDA, 'https://orlanativa.online/api/admin/reservas/ON-ABC234?x=https://golpe.example');
  assert.equal(volta.href, 'https://orlanativa.online/admin?erro=sessao');
});

test('pedidoRecusado: de fora, 403 antes de tudo; sem a sessão, a navegação volta à entrada e o fetch recebe o 401', () => {
  const auth = codigo('src/lib/admin-auth.ts');
  const corpo = auth.slice(
    auth.indexOf('export async function pedidoRecusado('),
    auth.indexOf('\n}', auth.indexOf('export async function pedidoRecusado(')),
  );
  const fora = corpo.indexOf(
    "if (origemDeFora(req.headers.get('origin'), req.url)) return NextResponse.json({ ok: false }, { status: 403 });",
  );
  const sessao = corpo.indexOf('if (sessaoValida(loja.get(COOKIE_ADMIN)?.value)) return null;');
  const navega = corpo.indexOf(
    'if (navegacaoDoNavegador(req.headers)) return NextResponse.redirect(new URL(ENDERECO_DA_SESSAO_VENCIDA, req.url), 303);',
  );
  const json = corpo.indexOf('return NextResponse.json({ ok: false }, { status: 401 });');
  assert.ok(fora !== -1 && fora < sessao && sessao < navega && navega < json, `${fora} ${sessao} ${navega} ${json}`);
  // nenhuma volta para um endereço que veio no pedido: o único redirect é o endereço fixo
  assert.equal(corpo.match(/NextResponse\.redirect\(/g)?.length, 1);
  assert.doesNotMatch(corpo, /searchParams|get\('(destino|volta|next|url)'\)/);
});

/** As rotas da pasta src/app/api/admin, menos a entrada e a saída do painel. */
function rotasDoPainel(pasta = path.join('src', 'app', 'api', 'admin')): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return rotasDoPainel(caminho);
    return nome === 'route.ts' ? [caminho] : [];
  });
}

test('todas as rotas do painel passam por pedidoRecusado (as das avaliações e das cotações também, desde o Pacote 33)', () => {
  const rotas = rotasDoPainel().filter((r) => !/[\\/](login|logout)[\\/]/.test(r));
  assert.ok(rotas.length >= 8, String(rotas.length));
  for (const rota of rotas) {
    const texto = codigo(rota);
    assert.match(
      texto,
      /const (recusado|recusa) = await pedidoRecusado\(req\);\s+if \((recusado|recusa)\) return (recusado|recusa);/,
      rota,
    );
    // ninguém confere a sessão à mão (com o 401 cru) fora de pedidoRecusado
    assert.doesNotMatch(texto, /sessaoValida\(|status: 401/, rota);
  }
});

test('a entrada do painel mostra o aviso da sessão vencida, e o cadastro da casa (fetch) diz para entrar de novo', () => {
  const painel = codigo('src/app/admin/page.tsx');
  assert.match(
    painel,
    /\{erro === 'sessao' && \(\s*<p role="status" className="mt-4 bg-sol px-4 py-3 text-small font-semibold">\s*\{AVISO_DA_SESSAO_VENCIDA\}\s*<\/p>\s*\)\}/,
  );
  // a frase do painel logado nunca mostra o código que veio no endereço: "sessao" não é um erro das ações
  assert.doesNotMatch(codigo('src/lib/pedidos-painel.ts'), /'sessao':/);
  const casa = codigo('src/components/admin/FormularioCasa.tsx');
  assert.match(
    casa,
    /if \(resposta\?\.status === 401\) \{\s+setAviso\(\{\s+ok: false,\s+texto: 'Sua sessão venceu\. Entre de novo no painel/,
  );
  // a tela de resumo (página do painel) sem a sessão também volta à entrada com o aviso
  assert.match(codigo('src/app/admin/resumo/[codigo]/page.tsx'), /redirect\(ENDERECO_DA_SESSAO_VENCIDA\)/);
});
