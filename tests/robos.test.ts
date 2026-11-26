import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LINHA_DOS_ROBOS, privacidadeComRobos, textosLegais } from '../src/content/legal/online.ts';
import { dicionario } from '../src/i18n/index.ts';
import {
  ENVIOS_PROTEGIDOS,
  LIMITE_DA_VERIFICACAO_MS,
  RESPOSTA_DO_ROBO,
  nivelDaVerificacao,
  nivelDoBotId,
  protecaoDoNavegador,
  respostaDeRobo,
  robosDeMentira,
  verificacaoNoAr,
  verificarRobo,
  type DependenciasDoRobo,
  type OpcoesDaVerificacao,
} from '../src/lib/robos.ts';

// A proteção contra robôs nos quatro envios (Pacote 20, a Opção B que o dono escolheu em 23/11/2026): o interruptor, a
// regra do servidor com a verificação de mentira (nada de rede aqui), as quatro rotas lidas no código, a lista do
// navegador, a mensagem nos quatro idiomas e a linha da política de privacidade. Só leitura: nada é gravado.

/** O código de um arquivo sem os comentários (os do JSX, os de bloco e as linhas de comentário): só o que roda. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join(...partes), 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

/* ------------------------------------------------------------------ */
/* O interruptor                                                       */

test('o interruptor: só "basica" e "profunda" ligam; o que faltar ou vier diferente é desligada', () => {
  assert.equal(nivelDaVerificacao('basica'), 'basica');
  assert.equal(nivelDaVerificacao('profunda'), 'profunda');
  for (const valor of [undefined, '', 'desligada', 'ligada', 'Basica', 'PROFUNDA', ' basica', 'basic', 'deepAnalysis', '1', 'true'])
    assert.equal(nivelDaVerificacao(valor), 'desligada', String(valor));
  assert.equal(nivelDoBotId('desligada'), null);
  assert.equal(nivelDoBotId('basica'), 'basic');
  assert.equal(nivelDoBotId('profunda'), 'deepAnalysis');
});

test('a verificação de verdade só no site no ar (a produção da Vercel) e com o interruptor ligado', () => {
  for (const ambiente of [undefined, '', 'preview', 'development', 'Production'])
    for (const nivel of ['desligada', 'basica', 'profunda'] as const)
      assert.equal(verificacaoNoAr(nivel, ambiente), false, `${nivel} ${ambiente}`);
  assert.equal(verificacaoNoAr('desligada', 'production'), false);
  assert.equal(verificacaoNoAr('basica', 'production'), true);
  assert.equal(verificacaoNoAr('profunda', 'production'), true);
});

/* ------------------------------------------------------------------ */
/* A regra do servidor (a verificação de mentira: nada vai à Vercel)   */

/** As dependências com a verificação e o registro anotados. */
function montar(parcial: Partial<DependenciasDoRobo> & { responde?: () => Promise<{ isBot: boolean }> }) {
  const chamadas: OpcoesDaVerificacao[] = [];
  const linhas: string[] = [];
  const deps: DependenciasDoRobo = {
    nivel: 'desligada',
    ambienteDaVercel: 'production',
    ambienteDoServidor: 'production',
    deMentira: undefined,
    verificar: async (opcoes) => {
      chamadas.push(opcoes);
      return parcial.responde ? parcial.responde() : { isBot: false };
    },
    registrar: (linha) => linhas.push(linha),
    ...parcial,
  };
  return { deps, chamadas, linhas };
}

test('desligada: a verificação nunca é chamada, no ar ou fora dele, e nada vai para o registro', async () => {
  for (const ambiente of ['production', 'preview', undefined]) {
    const { deps, chamadas, linhas } = montar({ nivel: 'desligada', ambienteDaVercel: ambiente, ambienteDoServidor: ambiente });
    assert.equal(await verificarRobo('POST /api/pedido', deps), 'passa');
    assert.equal(chamadas.length, 0);
    assert.deepEqual(linhas, []);
  }
});

test('ligada fora do site no ar (a bancada, next start, as prévias): a verificação de verdade nunca roda', async () => {
  for (const nivel of ['basica', 'profunda'] as const)
    for (const [daVercel, doServidor] of [
      [undefined, undefined],
      ['preview', 'preview'],
      ['development', undefined],
    ]) {
      const { deps, chamadas } = montar({
        nivel,
        ambienteDaVercel: daVercel,
        ambienteDoServidor: doServidor,
        responde: async () => ({ isBot: true }),
      });
      assert.equal(await verificarRobo('POST /api/cotacoes', deps), 'passa', `${nivel} ${daVercel}`);
      assert.equal(chamadas.length, 0, `${nivel} ${daVercel}`);
    }
});

test('ligada no ar: a verificação é chamada uma vez, com o nível do interruptor (o mesmo do navegador)', async () => {
  for (const [nivel, checkLevel] of [
    ['basica', 'basic'],
    ['profunda', 'deepAnalysis'],
  ] as const) {
    const { deps, chamadas, linhas } = montar({ nivel });
    assert.equal(await verificarRobo('POST /api/pedido', deps), 'passa');
    assert.deepEqual(chamadas, [{ advancedOptions: { checkLevel } }]);
    assert.deepEqual(linhas, []);
    // e o navegador pede o mesmo nível em cada envio (o BotID falha se os dois lados não baterem)
    for (const envio of protecaoDoNavegador(nivel, 'production') ?? []) assert.equal(envio.advancedOptions.checkLevel, checkLevel);
  }
});

test("robô: 'robo' e uma linha no registro, só com a rota (nada do que o cliente digitou)", async () => {
  const { deps, chamadas, linhas } = montar({ nivel: 'profunda', responde: async () => ({ isBot: true }) });
  assert.equal(await verificarRobo('POST /api/consultar-pedido', deps), 'robo');
  assert.equal(chamadas.length, 1);
  assert.deepEqual(linhas, ['[robos] POST /api/consultar-pedido: barrado como robô (403)']);
  // a resposta que as rotas dão ao robô: o código curto que os formulários conhecem
  assert.deepEqual(RESPOSTA_DO_ROBO, { status: 403, corpo: { ok: false, erro: 'robo' } });
});

test('a verificação falhou (erro da Vercel) ou demorou: o envio PASSA e fica uma linha no registro', async () => {
  const erro = montar({
    nivel: 'basica',
    responde: async () => Promise.reject(new Error("The 'x-vercel-oidc-token' header is missing\nlinha")),
  });
  assert.equal(await verificarRobo('POST /api/pedido', erro.deps), 'passa');
  assert.equal(erro.linhas.length, 1);
  assert.match(erro.linhas[0], /^\[robos\] POST \/api\/pedido: a verificação falhou e o envio passou \(Error: /);
  assert.ok(!/[\r\n]/.test(erro.linhas[0]), 'uma linha só');
  // a demora: passa do limite, o envio segue (o relógio é o do limite, curto aqui)
  const lenta = montar({
    nivel: 'profunda',
    limiteMs: 20,
    responde: () => new Promise((ok) => setTimeout(() => ok({ isBot: true }), 500)),
  });
  const antes = Date.now();
  assert.equal(await verificarRobo('POST /api/pedido/[codigo]/pagar', lenta.deps), 'passa');
  assert.ok(Date.now() - antes < 400, 'não esperou a verificação lenta');
  assert.equal(lenta.linhas.length, 1);
  assert.match(lenta.linhas[0], /demorou demais/);
  assert.equal(LIMITE_DA_VERIFICACAO_MS, 3_000);
});

test('a bancada vê a mensagem do robô com ROBOS_DE_MENTIRA=robo, só fora da produção da Vercel', async () => {
  // fora da produção: a opção da própria biblioteca que imita um robô ruim (sem rede), com ou sem o interruptor
  for (const nivel of ['desligada', 'basica', 'profunda'] as const) {
    const { deps, chamadas } = montar({
      nivel,
      ambienteDaVercel: undefined,
      ambienteDoServidor: undefined,
      deMentira: 'robo',
      responde: async () => ({ isBot: true }),
    });
    assert.equal(await verificarRobo('POST /api/cotacoes', deps), 'robo', nivel);
    assert.deepEqual(chamadas, [{ developmentOptions: { bypass: 'BAD-BOT', isDevelopment: true } }]);
  }
  // no site no ar a variável não é lida, por nenhuma das duas travas
  assert.equal(robosDeMentira({ ambienteDaVercel: 'production', ambienteDoServidor: undefined, deMentira: 'robo' }), false);
  assert.equal(robosDeMentira({ ambienteDaVercel: undefined, ambienteDoServidor: 'production', deMentira: 'robo' }), false);
  const noAr = montar({ nivel: 'desligada', deMentira: 'robo' });
  assert.equal(await verificarRobo('POST /api/pedido', noAr.deps), 'passa');
  assert.equal(noAr.chamadas.length, 0);
  // outro valor não liga
  assert.equal(robosDeMentira({ ambienteDaVercel: undefined, ambienteDoServidor: undefined, deMentira: 'sim' }), false);
});

test('o servidor lê as mesmas duas variáveis do build que o navegador, e a de mentira só ali', () => {
  const servidor = codigo('src', 'lib', 'robos-servidor.ts');
  assert.match(servidor, /import \{ checkBotId \} from 'botid\/server';/);
  assert.match(servidor, /nivel: nivelDaVerificacao\(process\.env\.NEXT_PUBLIC_VERIFICACAO_ROBOS\),/);
  assert.match(servidor, /ambienteDaVercel: process\.env\.NEXT_PUBLIC_VERCEL_ENV,/);
  assert.match(servidor, /ambienteDoServidor: process\.env\.VERCEL_ENV,/);
  assert.match(servidor, /deMentira: process\.env\.ROBOS_DE_MENTIRA,/);
  assert.match(servidor, /verificar: \(opcoes\) => checkBotId\(opcoes\),/);
  assert.match(servidor, /status: RESPOSTA_DO_ROBO\.status, headers: \{ 'Cache-Control': 'no-store' \}/);
  // ninguém mais lê a variável de mentira nem chama o BotID direto
  for (const arquivo of [
    'src/app/api/pedido/route.ts',
    'src/app/api/pedido/[codigo]/pagar/route.ts',
    'src/app/api/cotacoes/route.ts',
    'src/app/api/consultar-pedido/route.ts',
  ]) {
    const fonte = codigo(arquivo);
    assert.doesNotMatch(fonte, /ROBOS_DE_MENTIRA|checkBotId|botid/, arquivo);
  }
});

/* ------------------------------------------------------------------ */
/* As quatro rotas: o que existia antes, depois a verificação, depois o trabalho */

const ROTAS: { arquivo: string; rota: string; antes: string[]; depois: string[] }[] = [
  {
    arquivo: 'src/app/api/pedido/route.ts',
    rota: 'POST /api/pedido',
    // o campo-isca é o "site" vazio do esquema (safeParse), as conferências e o limite por endereço
    antes: [
      'Esquema.safeParse(',
      'emailValido(',
      'telefoneValido(',
      'permitir(',
      "erro('mudou', 409)",
      "erro('forma', 403",
      "erro('hospedagem')",
    ],
    depois: ['criarPedido(', 'gravarCarrinho(', 'agendarEmailDoPedido(', 'cancelarPedidoAberto(', 'loja.delete(', 'abrirSessaoDoPedido('],
  },
  {
    arquivo: 'src/app/api/pedido/[codigo]/pagar/route.ts',
    rota: 'POST /api/pedido/[codigo]/pagar',
    antes: ['Esquema.safeParse(', 'permitir(', 'tokenConfere(', "erro('status', 409", "erro('forma', 403"],
    depois: ['abrirSessaoDoPedido('],
  },
  {
    arquivo: 'src/app/api/cotacoes/route.ts',
    rota: 'POST /api/cotacoes',
    antes: ['EsquemaCotacao.safeParse(', 'faltaNaCotacao(', 'emailValido(', 'permitir('],
    depois: ['criarCotacao('],
  },
  {
    arquivo: 'src/app/api/consultar-pedido/route.ts',
    rota: 'POST /api/consultar-pedido',
    antes: ['respostaDaConsulta(', 'corpo.site', 'permitir('],
    depois: ['after(', 'consultarPedido(', 'enviarEmailDoPedido(', 'obterReservaDoPedido('],
  },
];

test('nas quatro rotas, a verificação vem depois do campo-isca, das conferências e do limite, e antes de qualquer gravação', () => {
  for (const { arquivo, rota, antes, depois } of ROTAS) {
    const fonte = codigo(arquivo);
    assert.match(fonte, /^import \{ barrarRobo \} from '@\/lib\/robos-servidor';$/m, arquivo);
    assert.equal(fonte.match(/barrarRobo\(/g)?.length, 1, `${arquivo}: uma chamada só`);
    const chamada = fonte.indexOf(`const robo = await barrarRobo('${rota}');`);
    assert.notEqual(chamada, -1, `${arquivo}: a chamada com a rota`);
    // o robô sai na hora, com a resposta pronta
    assert.match(fonte.slice(chamada), /^const robo = await barrarRobo\('[^']+'\);\s+if \(robo\) return robo;/, arquivo);
    for (const marca of antes) {
      const i = fonte.indexOf(marca);
      assert.notEqual(i, -1, `${arquivo}: ${marca}`);
      assert.ok(i < chamada, `${arquivo}: ${marca} vem antes da verificação`);
    }
    for (const marca of depois) {
      const i = fonte.indexOf(marca, fonte.indexOf('export async function POST('));
      assert.notEqual(i, -1, `${arquivo}: ${marca}`);
      assert.ok(i > chamada, `${arquivo}: ${marca} vem depois da verificação`);
    }
    // a rota é a do arquivo e o envio protegido no navegador existe para ela
    assert.ok(arquivo.endsWith(`${rota.replace('POST ', '').replace(/^\//, '')}/route.ts`), arquivo);
  }
});

/* ------------------------------------------------------------------ */
/* O navegador                                                         */

/** A mesma conta do BotID no navegador (botid/client/core): o "*" vira ".*", o resto é literal. */
const casa = (padrao: string, caminho: string) =>
  new RegExp(
    `^${padrao
      .replace(/[.?+^$[\]\\(){}|-]/g, '\\$&')
      .split('*')
      .join('.*')}$`,
  ).test(caminho);

test('a lista do navegador tem exatamente os quatro envios, todos POST, e cada um é uma das quatro rotas', () => {
  assert.deepEqual(
    ENVIOS_PROTEGIDOS.map((e) => `${e.method} ${e.path}`),
    ['POST /api/pedido', 'POST /api/pedido/*/pagar', 'POST /api/cotacoes', 'POST /api/consultar-pedido'],
  );
  assert.deepEqual(
    ENVIOS_PROTEGIDOS.map((e) => `${e.method} ${e.path.replace('*', '[codigo]')}`),
    ROTAS.map((r) => r.rota),
  );
  for (const envio of ENVIOS_PROTEGIDOS) {
    const arquivo = path.join('src', 'app', ...envio.path.replace('*', '[codigo]').split('/').filter(Boolean), 'route.ts');
    assert.ok(existsSync(arquivo), arquivo);
    assert.match(codigo(arquivo), /^export async function POST\(/m, arquivo);
  }
  // o padrão do pagar casa com o código do pedido e com nada mais
  const [pedido, pagar, cotacoes, consulta] = ENVIOS_PROTEGIDOS.map((e) => e.path);
  assert.ok(casa(pagar, '/api/pedido/ON-7K3P9Q/pagar'));
  assert.ok(!casa(pagar, '/api/pedido/ON-7K3P9Q/desistir'));
  assert.ok(casa(pedido, '/api/pedido'));
  assert.ok(!casa(pedido, '/api/pedido/ON-7K3P9Q/pagar'));
  assert.ok(!casa(pedido, '/api/pedidos'));
  assert.ok(casa(cotacoes, '/api/cotacoes') && casa(consulta, '/api/consultar-pedido'));
  // nenhum outro envio do site é tocado (o carrinho, o login do painel, a desistência, os avisos de segurança)
  for (const outro of ['/api/carrinho', '/api/admin/login', '/api/pedido/ON-7K3P9Q/desistir', '/api/csp', '/api/reservas/ON-7K3P9Q'])
    assert.ok(!ENVIOS_PROTEGIDOS.some((e) => casa(e.path, outro)), outro);
});

test('desligada ou fora do site no ar, o navegador não carrega nada; ligada no ar, os quatro com o nível', () => {
  assert.equal(protecaoDoNavegador('desligada', 'production'), null);
  assert.equal(protecaoDoNavegador('basica', undefined), null);
  assert.equal(protecaoDoNavegador('profunda', 'preview'), null);
  assert.deepEqual(protecaoDoNavegador('basica', 'production'), [
    { path: '/api/pedido', method: 'POST', advancedOptions: { checkLevel: 'basic' } },
    { path: '/api/pedido/*/pagar', method: 'POST', advancedOptions: { checkLevel: 'basic' } },
    { path: '/api/cotacoes', method: 'POST', advancedOptions: { checkLevel: 'basic' } },
    { path: '/api/consultar-pedido', method: 'POST', advancedOptions: { checkLevel: 'basic' } },
  ]);
  assert.equal(protecaoDoNavegador('profunda', 'production')?.length, 4);
  // o arquivo do navegador (o instrumentation-client do Next, na pasta src) só chama o BotID com a lista, e só com ela
  const cliente = codigo('src', 'instrumentation-client.ts');
  assert.match(cliente, /^import \{ initBotId \} from 'botid\/client\/core';$/m);
  assert.match(
    cliente,
    /const protecao = protecaoDoNavegador\(nivelDaVerificacao\(process\.env\.NEXT_PUBLIC_VERIFICACAO_ROBOS\), process\.env\.NEXT_PUBLIC_VERCEL_ENV\);\s+if \(protecao\) \{\s+try \{\s+initBotId\(\{ protect: protecao \}\);/,
  );
  assert.equal(cliente.match(/initBotId\(/g)?.length, 1);
  assert.ok(!existsSync('instrumentation-client.ts') && !existsSync('instrumentation-client.js'), 'um arquivo só, em src');
  // o BotID não aparece em nenhum outro arquivo do navegador
  for (const arquivo of [
    'src/components/FormularioCotacao.tsx',
    'src/components/FormularioConsulta.tsx',
    'src/components/carrinho/FormularioCarrinho.tsx',
    'src/components/pagamento/CheckoutEmbutido.tsx',
  ])
    assert.doesNotMatch(codigo(arquivo), /botid/, arquivo);
});

/* ------------------------------------------------------------------ */
/* A mensagem de quem foi confundido com robô                          */

test('a mensagem nos quatro idiomas, com os textos finais', () => {
  assert.equal(
    dicionario('pt').comum.robo,
    'Não deu para concluir pelo site agora. Fale com a gente pelo WhatsApp, que a gente termina por lá.',
  );
  assert.equal(
    dicionario('en').comum.robo,
    "We couldn't finish this on the site right now. Talk to us on WhatsApp and we'll finish it there.",
  );
  assert.equal(dicionario('es').comum.robo, 'No pudimos terminar por el sitio ahora. Escríbenos por WhatsApp y lo terminamos por ahí.');
  assert.equal(dicionario('es-ar').comum.robo, 'No pudimos terminar por el sitio ahora. Escribinos por WhatsApp y lo terminamos por ahí.');
  // nenhuma diz por que (nada de "robô" ou "fraude" na tela), nem traz número
  for (const idioma of ['pt', 'en', 'es', 'es-ar'] as const) assert.doesNotMatch(dicionario(idioma).comum.robo, /rob[oô]|bot|fraud|\d/i);
});

test('só a resposta do robô (403 com erro "robo") mostra a mensagem', () => {
  assert.equal(respostaDeRobo(403, { ok: false, erro: 'robo' }), true);
  assert.equal(respostaDeRobo(403, { ok: false, erro: 'forma', formas: [] }), false);
  assert.equal(respostaDeRobo(429, { ok: false, erro: 'robo' }), false);
  assert.equal(respostaDeRobo(403, null), false);
  assert.equal(respostaDeRobo(403, 'robo'), false);
});

test('os quatro formulários mostram a mensagem onde já mostram os erros do envio', () => {
  // orçamento e mensagens (as quatro telas que usam o formulário recebem o texto por textosCotacao)
  assert.match(codigo('src', 'lib', 'cotacao.ts'), /erroRobo: d\.comum\.robo,/);
  assert.match(
    codigo('src', 'components', 'FormularioCotacao.tsx'),
    /setErroGeral\(respostaDeRobo\(res\.status, await res\.json\(\)\.catch\(\(\) => null\)\) \? T\.erroRobo : T\.erro\);/,
  );
  // consultar meu pedido: a mesma resposta para dados certos e errados; a do robô é a única nova
  const consulta = codigo('src', 'components', 'FormularioConsulta.tsx');
  assert.match(consulta, /respostaDeRobo\(res\.status, dados\)\s+\? textoRobo\s+: res\.status === 429/);
  assert.match(codigo('src', 'app', '[locale]', 'consultar-pedido', 'page.tsx'), /textoRobo=\{dicionario\(locale\)\.comum\.robo\}/);
  // fechar o pedido: no lugar do erro de sempre, embaixo do botão
  const carrinho = codigo('src', 'components', 'carrinho', 'FormularioCarrinho.tsx');
  assert.match(
    carrinho,
    /\} else if \(respostaDeRobo\(res\.status, corpo\)\) \{\s+setErroGeral\(textos\.robo\);\s+\} else setErroGeral\(C\.erros\.generico\);/,
  );
  assert.match(codigo('src', 'app', '[locale]', 'checkout', 'page.tsx'), /robo: d\.comum\.robo,/);
  // pagar de novo (a escolha da forma e o "Pague com Pix" do cartão recusado) e, desde o Pacote 34 (P1), o "Pague com
  // cartão" embaixo do QR do Pix: os três toques do POST /pagar
  const checkout = codigo('src', 'components', 'pagamento', 'CheckoutEmbutido.tsx');
  assert.equal(
    checkout.match(/\} else if \(resposta\.erro === 'robo'\) \{\s+setErro\(T\.robo\);\s+\} else setErro\(T\.erroGenerico\);/g)?.length,
    3,
  );
  assert.match(codigo('src', 'lib', 'reserva-publica.ts'), /robo: d\.comum\.robo,/);
  assert.match(carrinho, /robo: textos\.robo,/);
});

/* ------------------------------------------------------------------ */
/* A política de privacidade                                           */

test('a linha da Vercel e da Kasada na privacidade: só com o interruptor ligado, logo depois da Vercel e da Supabase', () => {
  assert.equal(
    LINHA_DOS_ROBOS.pt,
    'Vercel (com a Kasada, parceira dela): verificação automática contra robôs nos formulários e no pagamento. Ela analisa sinais técnicos do aparelho e do navegador para detectar robôs e melhorar essa proteção.',
  );
  for (const [online, emails] of [
    [false, false],
    [false, true],
    [true, false],
  ] as const) {
    const legais = textosLegais(online, emails);
    // desligada: o mesmo texto, sem mudar nada
    assert.equal(privacidadeComRobos(legais.privacidade, false), legais.privacidade);
    const com = privacidadeComRobos(legais.privacidade, true);
    for (const idioma of ['pt', 'en', 'es', 'es-ar'] as const) {
      const antes = legais.privacidade[idioma];
      const depois = com[idioma];
      assert.ok(antes && depois, idioma);
      const linha = LINHA_DOS_ROBOS[idioma === 'es-ar' ? 'es' : idioma];
      const lista = depois.secoes[3].lista ?? [];
      const i = lista.indexOf(linha);
      assert.ok(i > 0, `${online} ${emails} ${idioma}: a linha na lista do item 4`);
      assert.match(lista[i - 1], /^Vercel (e|and|y) Supabase/, `${idioma}: logo depois da Vercel e da Supabase`);
      // só ela muda: a lista ganha uma linha, o resto do documento fica igual
      assert.deepEqual(
        lista.filter((l) => l !== linha),
        antes.secoes[3].lista,
      );
      assert.deepEqual(
        { ...depois, secoes: depois.secoes.filter((_, n) => n !== 3) },
        { ...antes, secoes: antes.secoes.filter((_, n) => n !== 3) },
      );
      assert.doesNotMatch(linha, /\d/);
    }
    // a data da política não muda por ela (muda no dia de ligar o interruptor)
    assert.deepEqual(textosLegais(online, emails).atualizadoEm, legais.atualizadoEm);
  }
  // a página da privacidade aplica a linha pelo interruptor, e só ela
  const pagina = codigo('src', 'app', '[locale]', 'politica-de-privacidade', 'page.tsx');
  assert.match(pagina, /const robos = nivelDaVerificacao\(process\.env\.NEXT_PUBLIC_VERIFICACAO_ROBOS\) !== 'desligada';/);
  assert.match(pagina, /doc=\{texto\(privacidadeComRobos\(legais\.privacidade, robos\), locale\)\}/);
  assert.match(pagina, /atualizadoEm=\{legais\.atualizadoEm\.privacidade\}/);
});

/* ------------------------------------------------------------------ */
/* A dependência                                                       */

test('o botid entra com a versão exata, e nenhuma outra dependência muda', () => {
  const pacote = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
  assert.equal(pacote.dependencies.botid, '1.5.13');
});

/* ------------------------------------------------------------------ */
/* O caminho do BotID fora das rotas de idioma                          */

const PREFIXO_DO_BOTID = '149e9513-01fa-4fb0-aad4-566afd725d1b';

test('o caminho que o withBotId reescreve para a Vercel fica fora do proxy de idioma', () => {
  // o prefixo é o mesmo que o botid instalado reescreve: se uma versão nova trocar o prefixo, este teste falha
  const envoltorio = readFileSync(path.join('node_modules', 'botid', 'dist', 'next', 'config', 'index.mjs'), 'utf8');
  assert.ok(envoltorio.includes(`/${PREFIXO_DO_BOTID}/`), 'o botid não reescreve mais este prefixo');

  const proxy = codigo('src', 'proxy.ts');
  const matcher = proxy.match(/matcher:\s*\[\s*'([^']+)'\s*\]/)?.[1];
  assert.ok(matcher, 'o matcher do proxy não foi encontrado');
  assert.ok(matcher.includes(`|${PREFIXO_DO_BOTID}|`), 'o matcher do proxy não exclui o prefixo do BotID');

  // o matcher, lido como expressão, deixa de fora as chamadas sem extensão do BotID e continua pegando as páginas
  const expressao = new RegExp(`^${matcher.replace(/\\\\/g, '\\')}$`);
  assert.equal(expressao.test(`/${PREFIXO_DO_BOTID}/2d206a39-8ed7-437e-a3be-862e0f06eea3/fp`), false);
  assert.equal(expressao.test(`/${PREFIXO_DO_BOTID}/2d206a39-8ed7-437e-a3be-862e0f06eea3/tl`), false);
  assert.equal(expressao.test('/passeios'), true);
  assert.equal(expressao.test('/en/tours'), true);
});
