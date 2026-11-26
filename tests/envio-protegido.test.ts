import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PRAZO_DO_ENVIO_PROTEGIDO_MS,
  ProtecaoSemResposta,
  criarEnvioProtegido,
  semRespostaDaProtecao,
  type Relogio,
} from '../src/lib/envio-protegido.ts';
import { ENVIOS_PROTEGIDOS } from '../src/lib/robos.ts';

// O prazo dos quatro envios protegidos contra robôs (Pacote 24; o achado R1 da revisão de 23/11): com a proteção ligada, o
// BotID espera o desafio dele antes do fetch de verdade, sem prazo. Aqui: o ajudante com um fetch e um relógio de mentira,
// o BotID imitado na frente do fetch de verdade do node (com um servidor local que conta os POSTs), o que o pacote do BotID
// faz de fato (lido em node_modules) e os quatro formulários. Nada vai à rede de fora.

/** O código de um arquivo sem os comentários (os do JSX, os de bloco e as linhas de comentário): só o que roda. */
const codigo = (...partes: string[]) =>
  readFileSync(path.join(...partes), 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** Um relógio de mentira: guarda os relógios vivos e dispara quando mandam. */
function relogioDeMentira() {
  const vivos = new Map<number, { fn: () => void; ms: number }>();
  let proximo = 1;
  let agendados = 0;
  const relogio: Relogio = {
    agendar: (fn, ms) => {
      agendados += 1;
      vivos.set(proximo, { fn, ms });
      return proximo++;
    },
    cancelar: (id) => {
      vivos.delete(id as number);
    },
  };
  return {
    relogio,
    vivos: () => vivos.size,
    agendados: () => agendados,
    prazos: () => [...vivos.values()].map((v) => v.ms),
    disparar: () => {
      const todos = [...vivos.entries()];
      vivos.clear();
      for (const [, v] of todos) v.fn();
    },
  };
}

/** Uma promessa que a gente resolve ou recusa de fora. */
function adiada<T>() {
  let resolver!: (v: T) => void;
  let recusar!: (e: unknown) => void;
  const promessa = new Promise<T>((r, s) => {
    resolver = r;
    recusar = s;
  });
  return { promessa, resolver, recusar };
}

/** Espera as tarefas pendentes do node (as promessas encadeadas). */
const folga = () => new Promise((r) => setImmediate(r));

const INIT = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}' } as const;

/* ------------------------------------------------------------------ */
/* Desligada: exatamente o fetch                                       */

test('desligada: a mesma promessa e o mesmo init do fetch, sem controle e sem relógio', async () => {
  const r = relogioDeMentira();
  const resposta = new Response('{}');
  const devolvida = Promise.resolve(resposta);
  const recebidos: { url: string; init: RequestInit }[] = [];
  const envio = criarEnvioProtegido({
    ligada: false,
    relogio: r.relogio,
    buscar: (url, init) => {
      recebidos.push({ url, init });
      return devolvida;
    },
  });
  const init = { ...INIT };
  const p = envio('/api/pedido', init);
  assert.equal(p, devolvida, 'a promessa do fetch, sem embrulho');
  assert.equal(recebidos.length, 1);
  assert.equal(recebidos[0].url, '/api/pedido');
  assert.equal(recebidos[0].init, init, 'o mesmo objeto, sem sinal acrescentado');
  assert.equal('signal' in recebidos[0].init, false);
  assert.equal(await p, resposta);
  assert.equal(r.agendados(), 0, 'nenhum relógio');

  // a recusa também passa como veio
  const falha = new TypeError('Failed to fetch');
  const recusa = Promise.reject(falha);
  recusa.catch(() => {});
  const p2 = criarEnvioProtegido({ ligada: false, relogio: r.relogio, buscar: () => recusa })('/api/cotacoes', init);
  assert.equal(p2, recusa);
  await assert.rejects(p2, (e) => e === falha);
  assert.equal(r.agendados(), 0);
});

/** O ajudante de verdade, lido de novo com as variáveis do build (cada leitura é um módulo novo). */
async function envioDoBuild(nivel: string | undefined, ambiente: string | undefined) {
  const antes = { n: process.env.NEXT_PUBLIC_VERIFICACAO_ROBOS, a: process.env.NEXT_PUBLIC_VERCEL_ENV };
  const pôr = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
  pôr('NEXT_PUBLIC_VERIFICACAO_ROBOS', nivel);
  pôr('NEXT_PUBLIC_VERCEL_ENV', ambiente);
  try {
    const url = pathToFileURL(path.resolve('src/lib/envio-protegido.ts')).href + `?build=${nivel}-${ambiente}-${Math.random()}`;
    return ((await import(url)) as typeof import('../src/lib/envio-protegido.ts')).envioProtegido;
  } finally {
    pôr('NEXT_PUBLIC_VERIFICACAO_ROBOS', antes.n);
    pôr('NEXT_PUBLIC_VERCEL_ENV', antes.a);
  }
}

test('o envio do build decide como src/instrumentation-client.ts: só ligado no ar ganha o prazo; o resto é o fetch, sem relógio', async (t) => {
  const original = globalThis.fetch;
  const recebidos: RequestInit[] = [];
  const devolvida = Promise.resolve(new Response('{}'));
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    recebidos.push(init);
    return devolvida;
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const casos: [string | undefined, string | undefined, boolean][] = [
    [undefined, undefined, false],
    [undefined, 'production', false],
    ['desligada', 'production', false],
    ['ligada', 'production', false],
    ['basica', undefined, false],
    ['basica', 'preview', false],
    ['profunda', 'development', false],
    ['basica', 'production', true],
    ['profunda', 'production', true],
  ];
  for (const [nivel, ambiente, ligada] of casos) {
    const envio = await envioDoBuild(nivel, ambiente);
    // conta os relógios pedidos ao setTimeout de verdade (e cancela os que nascerem, para não sobrar nenhum)
    const setTimeoutOriginal = globalThis.setTimeout;
    const nascidos: ReturnType<typeof setTimeout>[] = [];
    globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
      const id = setTimeoutOriginal(...args);
      nascidos.push(id);
      return id;
    }) as typeof setTimeout;
    try {
      const init = { ...INIT };
      recebidos.length = 0;
      const p = envio('/api/pedido', init);
      if (!ligada) {
        assert.equal(p, devolvida, `${nivel} ${ambiente}: a promessa do fetch`);
        assert.equal(recebidos[0], init, `${nivel} ${ambiente}: o mesmo init`);
        assert.equal(nascidos.length, 0, `${nivel} ${ambiente}: nenhum relógio`);
      } else {
        assert.notEqual(recebidos[0], init, `${nivel} ${ambiente}: o init ganha o sinal`);
        assert.ok(recebidos[0].signal instanceof AbortSignal);
        assert.equal(nascidos.length, 1, `${nivel} ${ambiente}: um relógio`);
      }
      await p;
    } finally {
      globalThis.setTimeout = setTimeoutOriginal;
      for (const id of nascidos) clearTimeout(id);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Ligada: o prazo                                                     */

test('o prazo é de 20 segundos', () => {
  assert.equal(PRAZO_DO_ENVIO_PROTEGIDO_MS, 20_000);
  const r = relogioDeMentira();
  const envio = criarEnvioProtegido({ ligada: true, relogio: r.relogio, buscar: () => new Promise(() => {}) });
  envio('/api/pedido', INIT).catch(() => {});
  assert.deepEqual(r.prazos(), [20_000]);
});

test('ligada, o desafio nunca responde: no prazo recusa com ProtecaoSemResposta e o sinal do envio é abortado', async () => {
  const r = relogioDeMentira();
  let recebido: RequestInit | undefined;
  const envio = criarEnvioProtegido({
    ligada: true,
    relogio: r.relogio,
    buscar: (_url, init) => {
      recebido = init;
      return new Promise(() => {});
    },
  });
  let resultado: unknown = 'pendente';
  envio('/api/pedido', INIT).then(
    () => (resultado = 'resolveu'),
    (e) => (resultado = e),
  );
  await folga();
  assert.equal(resultado, 'pendente', 'antes do prazo, nada');
  assert.equal(recebido?.signal?.aborted, false);
  // o init de quem chamou chega inteiro, com o sinal a mais
  assert.equal(recebido?.method, 'POST');
  assert.equal(recebido?.body, INIT.body);
  assert.deepEqual(recebido?.headers, INIT.headers);
  r.disparar();
  await folga();
  assert.ok(resultado instanceof ProtecaoSemResposta, 'a recusa reconhecível');
  assert.ok(semRespostaDaProtecao(resultado));
  assert.equal(recebido?.signal?.aborted, true, 'o sinal abortado: um desafio atrasado não manda o POST');
  assert.equal(r.vivos(), 0);
});

test('uma resposta que chega depois do prazo não alcança quem chamou', async () => {
  const r = relogioDeMentira();
  const atrasada = adiada<Response>();
  const envio = criarEnvioProtegido({ ligada: true, relogio: r.relogio, buscar: () => atrasada.promessa });
  const vistos: unknown[] = [];
  envio('/api/cotacoes', INIT).then(
    (v) => vistos.push(['resolveu', v]),
    (e) => vistos.push(['recusou', e]),
  );
  r.disparar();
  await folga();
  atrasada.resolver(new Response('{"ok":true}'));
  await folga();
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0][0], 'recusou');
  assert.ok(semRespostaDaProtecao(vistos[0][1]));
});

test('ligada, resposta rápida: passa intacta e nenhum relógio fica vivo (nem o sinal é abortado depois)', async () => {
  const r = relogioDeMentira();
  const resposta = new Response('{"ok":true}', { status: 200 });
  let recebido: RequestInit | undefined;
  const envio = criarEnvioProtegido({
    ligada: true,
    relogio: r.relogio,
    buscar: async (_url, init) => {
      recebido = init;
      return resposta;
    },
  });
  assert.equal(await envio('/api/consultar-pedido', INIT), resposta);
  assert.equal(r.vivos(), 0, 'o relógio foi cancelado');
  assert.equal(recebido?.signal?.aborted, false, 'a leitura do corpo segue livre');
  assert.deepEqual(await resposta.json(), { ok: true });
});

test('ligada, recusa rápida do fetch (rede): passa intacta, sem virar a mensagem do robô, e nenhum relógio fica vivo', async () => {
  const r = relogioDeMentira();
  const falha = new TypeError('Failed to fetch');
  const envio = criarEnvioProtegido({ ligada: true, relogio: r.relogio, buscar: async () => Promise.reject(falha) });
  await assert.rejects(envio('/api/pedido', INIT), (e) => e === falha && !semRespostaDaProtecao(e));
  assert.equal(r.vivos(), 0);
  // o aborto do próprio fetch (DOMException) também passa como veio
  const aborto = new DOMException('The operation was aborted.', 'AbortError');
  const envio2 = criarEnvioProtegido({ ligada: true, relogio: r.relogio, buscar: async () => Promise.reject(aborto) });
  await assert.rejects(envio2('/api/pedido', INIT), (e) => e === aborto && !semRespostaDaProtecao(e));
  assert.equal(r.vivos(), 0);
});

test('o primeiro toque, com o script do desafio bloqueado (o BotID recusa com o evento "error" do <script>): vira ProtecaoSemResposta', async () => {
  const r = relogioDeMentira();
  const envio = criarEnvioProtegido({ ligada: true, relogio: r.relogio, buscar: async () => Promise.reject(new Event('error')) });
  await assert.rejects(envio('/api/pedido', INIT), (e) => semRespostaDaProtecao(e));
  assert.equal(r.vivos(), 0);
});

test('com o relógio de verdade (setTimeout de mentira do node): a resposta rápida cancela o relógio; o desafio preso recusa aos 20 s', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  let sinal: AbortSignal | undefined;
  const rapido = criarEnvioProtegido({
    ligada: true,
    buscar: async (_u, init) => {
      sinal = init.signal ?? undefined;
      return new Response('{}');
    },
  });
  await rapido('/api/pedido', INIT);
  mock.timers.tick(PRAZO_DO_ENVIO_PROTEGIDO_MS * 2);
  assert.equal(sinal?.aborted, false, 'o relógio foi cancelado: nada aborta depois');

  let resultado: unknown = 'pendente';
  const preso = criarEnvioProtegido({ ligada: true, buscar: () => new Promise(() => {}) });
  preso('/api/pedido', INIT).catch((e) => (resultado = e));
  mock.timers.tick(PRAZO_DO_ENVIO_PROTEGIDO_MS - 1);
  await folga();
  assert.equal(resultado, 'pendente');
  mock.timers.tick(1);
  await folga();
  assert.ok(semRespostaDaProtecao(resultado));
});

test('o BotID imitado na frente do fetch de verdade: com o desafio atrasado além do prazo, nenhum POST chega ao servidor', async (t) => {
  let posts = 0;
  const servidor = createServer((req, res) => {
    if (req.method === 'POST') posts += 1;
    req.resume();
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true}');
  });
  await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
  t.after(() => {
    servidor.closeAllConnections();
    servidor.close();
  });
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;

  /** Como o fetch trocado do BotID 1.5.13: espera o desafio e chama o fetch de verdade com {...init, headers}. */
  const fetchDoBotId = (desafio: Promise<unknown>) => async (url: string, init: RequestInit) => {
    const u = await desafio;
    const headers = new Headers(init.headers);
    headers.set('x-is-human', JSON.stringify(u));
    return fetch(url, { ...init, headers });
  };

  // o desafio responde a tempo: um POST, a resposta de verdade
  const r1 = relogioDeMentira();
  const envio1 = criarEnvioProtegido({ ligada: true, relogio: r1.relogio, buscar: fetchDoBotId(Promise.resolve({ b: 0 })) });
  const res = await envio1(`${base}/api/pedido`, INIT);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(posts, 1);
  assert.equal(r1.vivos(), 0);

  // o desafio chega depois do prazo: o fetch de verdade recebe o sinal já abortado e não manda nada
  const r2 = relogioDeMentira();
  const desafio = adiada<unknown>();
  const envio2 = criarEnvioProtegido({ ligada: true, relogio: r2.relogio, buscar: fetchDoBotId(desafio.promessa) });
  const p = envio2(`${base}/api/pedido`, INIT);
  r2.disparar();
  await assert.rejects(p, (e) => semRespostaDaProtecao(e));
  desafio.resolver({ b: 0 });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(posts, 1, 'o POST atrasado nunca saiu');
});

/* ------------------------------------------------------------------ */
/* O que o pacote do BotID faz de fato (o ajudante depende disso)      */

test('o BotID 1.5.13: espera o desafio antes do fetch de verdade, repassa o init (com o sinal) e recusa com o evento do <script>', () => {
  const versao = (arquivo: string) =>
    JSON.parse(readFileSync(arquivo, 'utf8')) as { version?: string; dependencies?: Record<string, string> };
  // a versão fixa: trocar o BotID pede reler o código dele e este teste
  assert.equal(versao('package.json').dependencies?.botid, '1.5.13');
  assert.equal(versao(path.join('node_modules', 'botid', 'package.json')).version, '1.5.13');
  const pacote = readFileSync(path.join('node_modules', 'botid', 'dist', 'client', 'core', 'index.mjs'), 'utf8');
  // o fetch trocado: o desafio esperado sem prazo, depois o fetch de verdade com o init espalhado e os cabeçalhos novos
  assert.match(pacote, /let u=await r\.getChallenge\(\),p=new Headers\(c\?\.headers/);
  assert.match(pacote, /let f=\{\.\.\.c,headers:p\};return e\.loaded\|\|u\.b!==0\?s\(o,f\)/);
  assert.match(pacote, /\(await e\.load\(\),window\.fetch\(o,f\)\):s\(o,f\)/);
  // o desafio: carregar o script e esperar a resposta dele, sem prazo
  assert.match(pacote, /getChallenge=async\(\)=>\(await this\.#a\(\),await this\.#e\.then/);
  // o script que não carrega: a promessa recusa com o evento "error" do <script> (um Event, nunca o erro de um fetch)
  assert.match(pacote, /o\.onerror=c=>\{console\.error\("Error loading script",c\),s\(c\)\}/);
  // o segundo toque: o <script> que falhou continua na página, a carga "resolve" na hora e a espera do desafio fica presa
  assert.match(pacote, /if\(document\.querySelector\(`script\[src="\$\{r\}"\]`\)\)\{t\(\);return\}/);
});

/* ------------------------------------------------------------------ */
/* Os quatro formulários                                               */

const FORMULARIOS = {
  pedido: {
    arquivo: ['src', 'components', 'carrinho', 'FormularioCarrinho.tsx'],
    envio: "envioProtegido('/api/pedido', {",
    semFetch: /fetch\(\s*'\/api\/pedido'/,
    robo: 'setErroGeral(semRespostaDaProtecao(e) ? textos.robo : C.erros.generico);',
    caminhoDoRobo: 'setErroGeral(textos.robo);',
  },
  pagar: {
    arquivo: ['src', 'components', 'pagamento', 'CheckoutEmbutido.tsx'],
    envio: 'envioProtegido(`/api/pedido/${encodeURIComponent(codigoPedido)}/pagar`, {',
    semFetch: /fetch\(\s*`\/api\/pedido\/\$\{encodeURIComponent\(codigoPedido\)\}\/pagar`/,
    robo: "return { erro: semRespostaDaProtecao(e) ? 'robo' : 'rede' };",
    caminhoDoRobo: "resposta.erro === 'robo'",
  },
  cotacoes: {
    arquivo: ['src', 'components', 'FormularioCotacao.tsx'],
    envio: "envioProtegido('/api/cotacoes', {",
    semFetch: /fetch\(\s*'\/api\/cotacoes'/,
    robo: 'setErroGeral(semRespostaDaProtecao(e) ? T.erroRobo : T.erro);',
    caminhoDoRobo: '? T.erroRobo : T.erro',
  },
  consulta: {
    arquivo: ['src', 'components', 'FormularioConsulta.tsx'],
    envio: "envioProtegido('/api/consultar-pedido', {",
    semFetch: /fetch\(\s*'\/api\/consultar-pedido'/,
    robo: 'setErroGeral(semRespostaDaProtecao(e) ? textoRobo : T.erroGeral);',
    caminhoDoRobo: '? textoRobo',
  },
} as const;

test('os quatro formulários enviam pelo ajudante e mostram, no prazo, o mesmo que o 403 "robo" (a mensagem e o botão do WhatsApp)', () => {
  for (const [nome, f] of Object.entries(FORMULARIOS)) {
    const c = codigo(...f.arquivo);
    assert.match(c, /import \{ envioProtegido, semRespostaDaProtecao \} from '@\/lib\/envio-protegido';/, nome);
    assert.ok(c.includes(f.envio), `${nome}: o envio pelo ajudante`);
    assert.doesNotMatch(c, f.semFetch, `${nome}: nenhum fetch direto`);
    assert.ok(c.includes(f.robo), `${nome}: ProtecaoSemResposta vira a mensagem do robô`);
    assert.ok(c.includes(f.caminhoDoRobo), `${nome}: o caminho do 403 'robo' continua`);
    assert.equal(c.split('envioProtegido(').length - 1, 1, `${nome}: um envio só`);
  }
  // o botão de enviar volta a funcionar: depois do catch, o "enviando" desliga (o pagar devolve o erro e a tela desliga)
  for (const nome of ['pedido', 'cotacoes', 'consulta'] as const) {
    const c = codigo(...FORMULARIOS[nome].arquivo);
    const depois = c.slice(c.indexOf(FORMULARIOS[nome].robo));
    assert.match(depois, /^[^]*?\}\n\s*setEnviando\(false\);/, `${nome}: setEnviando(false) depois do catch`);
  }
  const pagar = codigo(...FORMULARIOS.pagar.arquivo);
  assert.match(
    pagar,
    /resposta\.erro === 'robo'\) \{\n\s*setErro\(T\.robo\);\n\s*\} else setErro\(T\.erroGenerico\);\n\s*setTrocando\(false\);/,
  );
  assert.match(
    pagar,
    /resposta\.erro === 'robo'\) \{\n\s*setErro\(T\.robo\);\n\s*\} else setErro\(T\.erroGenerico\);\n\s*setCriando\(false\);/,
  );
});

test('só os quatro formulários usam o ajudante, e os quatro são os da lista protegida', () => {
  const usam: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = path.join(dir, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (/\.tsx?$/.test(nome) && /envio-protegido/.test(readFileSync(p, 'utf8'))) usam.push(p.split(path.sep).join('/'));
    }
  };
  andar('src');
  assert.deepEqual(
    usam.filter((p) => p !== 'src/lib/envio-protegido.ts').sort(),
    Object.values(FORMULARIOS)
      .map((f) => f.arquivo.join('/'))
      .sort(),
  );
  assert.deepEqual(
    ENVIOS_PROTEGIDOS.map((e) => e.path),
    ['/api/pedido', '/api/pedido/*/pagar', '/api/cotacoes', '/api/consultar-pedido'],
  );
});
