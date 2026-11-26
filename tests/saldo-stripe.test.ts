import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { LIMITE_DO_SALDO_MS, lerSaldoDaStripe, modoDaChave, saldoEmReais, type SaldoDaStripe } from '../src/lib/saldo-stripe.ts';

// Pacote 33, item 1 (decisões do dono de 25/11, P1 e P2): o saldo da Stripe na tela de resumo do "Reembolsar na Stripe…",
// lido na hora com uma chave SÓ DELE (STRIPE_SALDO_KEY, restrita a "Balance: Read"). O saldo só avisa, nunca trava: sem a
// chave, com erro ou com demora, "saldo indisponível". A chave nunca vai para o navegador, para o HTML nem para o registro
// do servidor. Nada aqui chama a Stripe: a busca é de mentira (a opção `buscar`). As chaves são inventadas.

const CHAVE_TESTE = 'rk_test_chaveinventadaparaostestes0001';
// curta de propósito: um texto do tamanho de uma chave de produção de verdade é barrado pela proteção de segredos do
// GitHub, mesmo inventado; para estes testes, basta o começo "rk_live_"
const CHAVE_PRODUCAO = 'rk_live_inventada';

const saldo = (parcial: Partial<SaldoDaStripe> = {}): SaldoDaStripe => ({
  available: [{ amount: 12345, currency: 'brl' }],
  pending: [{ amount: 67800, currency: 'brl' }],
  livemode: false,
  ...parcial,
});

/** Guarda o que o código escreve no registro do servidor enquanto `fazer` roda. */
async function comORegistro<T>(fazer: () => Promise<T>): Promise<{ valor: T; linhas: string[] }> {
  const linhas: string[] = [];
  const antes = { error: console.error, log: console.log, warn: console.warn };
  console.error = (...a: unknown[]) => void linhas.push(a.map(String).join(' '));
  console.log = (...a: unknown[]) => void linhas.push(a.map(String).join(' '));
  console.warn = (...a: unknown[]) => void linhas.push(a.map(String).join(' '));
  try {
    return { valor: await fazer(), linhas };
  } finally {
    Object.assign(console, antes);
  }
}

test('o saldo em reais: só as linhas em BRL somam; sem linha em reais, zero; o devedor fica negativo', () => {
  assert.equal(saldoEmReais([{ amount: 1000, currency: 'brl' }]), 1000);
  assert.equal(
    saldoEmReais([
      { amount: 1000, currency: 'brl' },
      { amount: 500, currency: 'usd' },
      { amount: 250, currency: 'BRL' },
    ]),
    1250,
  );
  assert.equal(saldoEmReais([{ amount: 500, currency: 'usd' }]), 0);
  assert.equal(saldoEmReais([]), 0);
  assert.equal(saldoEmReais([{ amount: -3000, currency: 'brl' }]), -3000);
  assert.equal(saldoEmReais([{ amount: Number.NaN, currency: 'brl' }]), 0);
});

test('o modo da chave pelo prefixo, sem mostrar o valor', () => {
  assert.equal(modoDaChave(CHAVE_TESTE), 'teste');
  assert.equal(modoDaChave(CHAVE_PRODUCAO), 'producao');
  assert.equal(modoDaChave('sk_live_abc'), 'producao');
  assert.equal(modoDaChave('sk_test_abc'), 'teste');
  for (const errada of ['', 'pk_live_abc', 'whsec_abc', 'rk_live_', 'rk_live_com espaço', 'chave qualquer'])
    assert.equal(modoDaChave(errada), null, errada);
});

test('sem a chave, ou com uma chave errada ou de outro modo: "saldo indisponível", e a Stripe nem é chamada', async () => {
  let chamadas = 0;
  const buscar = async () => {
    chamadas++;
    return saldo();
  };
  assert.deepEqual(await lerSaldoDaStripe({ chave: '', modo: 'teste', buscar }), { estado: 'indisponivel', motivo: 'sem-chave' });
  assert.deepEqual(await lerSaldoDaStripe({ chave: '   ', modo: 'teste', buscar }), { estado: 'indisponivel', motivo: 'sem-chave' });
  assert.deepEqual(await lerSaldoDaStripe({ chave: 'pk_test_abc', modo: 'teste', buscar }), {
    estado: 'indisponivel',
    motivo: 'chave-errada',
  });
  // a chave do saldo de teste com a dos pagamentos de produção (e o contrário) mostraria o saldo errado
  assert.deepEqual(await lerSaldoDaStripe({ chave: CHAVE_TESTE, modo: 'producao', buscar }), {
    estado: 'indisponivel',
    motivo: 'modo-diferente',
  });
  assert.deepEqual(await lerSaldoDaStripe({ chave: CHAVE_PRODUCAO, modo: 'teste', buscar }), {
    estado: 'indisponivel',
    motivo: 'modo-diferente',
  });
  assert.equal(chamadas, 0);
  // sem a variável no ambiente, também (o teste roda sem STRIPE_SALDO_KEY)
  const antes = process.env.STRIPE_SALDO_KEY;
  delete process.env.STRIPE_SALDO_KEY;
  try {
    assert.deepEqual(await lerSaldoDaStripe({ modo: 'teste', buscar }), { estado: 'indisponivel', motivo: 'sem-chave' });
  } finally {
    if (antes !== undefined) process.env.STRIPE_SALDO_KEY = antes;
  }
  assert.equal(chamadas, 0);
});

test('o saldo lido: o disponível e o a liberar em reais, a hora da leitura, e a chave que chega à busca é a do saldo', async () => {
  const recebidas: string[] = [];
  const lido = await lerSaldoDaStripe({
    chave: `  ${CHAVE_TESTE}  `,
    modo: 'teste',
    buscar: async (chave) => {
      recebidas.push(chave);
      return saldo({
        available: [
          { amount: 5000, currency: 'brl' },
          { amount: 99, currency: 'usd' },
        ],
        pending: [{ amount: 150000, currency: 'brl' }],
      });
    },
    agora: () => new Date('2026-11-26T15:04:05.000Z'),
  });
  assert.deepEqual(lido, {
    estado: 'lido',
    disponivelCentavos: 5000,
    aLiberarCentavos: 150000,
    lidoEm: '2026-11-26T15:04:05.000Z',
    chaveCompleta: false,
  });
  // sem os espaços colados na Vercel (como o segredo do webhook de 24/11)
  assert.deepEqual(recebidas, [CHAVE_TESTE]);
  // a de produção com a dos pagamentos de produção
  const producao = await lerSaldoDaStripe({ chave: CHAVE_PRODUCAO, modo: 'producao', buscar: async () => saldo({ livemode: true }) });
  assert.equal(producao.estado, 'lido');
  // a Stripe respondeu com o saldo do outro modo: não mostra
  assert.deepEqual(await lerSaldoDaStripe({ chave: CHAVE_TESTE, modo: 'teste', buscar: async () => saldo({ livemode: true }) }), {
    estado: 'indisponivel',
    motivo: 'modo-diferente',
  });
  // a chave secreta completa funciona, mas a tela avisa para trocar pela restrita
  const completa = await lerSaldoDaStripe({ chave: 'sk_test_chavecompletainventada', modo: 'teste', buscar: async () => saldo() });
  assert.equal(completa.estado === 'lido' && completa.chaveCompleta, true);
  // sem a chave dos pagamentos (modo desligado), o saldo ainda é lido
  assert.equal((await lerSaldoDaStripe({ chave: CHAVE_TESTE, modo: 'desligado', buscar: async () => saldo() })).estado, 'lido');
});

test('com erro ou demora: "saldo indisponível", nunca uma exceção, e o registro do servidor não leva a chave nem a mensagem', async () => {
  // a Stripe recusa a chave: a mensagem dela traz o fim da chave, e ela nunca vai para o registro
  const erro = await comORegistro(() =>
    lerSaldoDaStripe({
      chave: CHAVE_TESTE,
      modo: 'teste',
      buscar: async () => {
        throw new Error(`Invalid API Key provided: ${CHAVE_TESTE.slice(0, 8)}****${CHAVE_TESTE.slice(-4)}`);
      },
    }),
  );
  assert.deepEqual(erro.valor, { estado: 'indisponivel', motivo: 'erro' });
  assert.equal(erro.linhas.length, 1);
  for (const l of erro.linhas) {
    assert.doesNotMatch(l, /rk_|sk_|\*\*\*\*|Invalid API Key|0001/);
    assert.match(l, /^\[saldo\] a leitura do saldo da Stripe falhou \(Error\)/);
  }
  // a Stripe não responde: o limite curto vence, a tela segue
  const inicio = Date.now();
  const demora = await comORegistro(() =>
    lerSaldoDaStripe({ chave: CHAVE_TESTE, modo: 'teste', limiteMs: 40, buscar: () => new Promise<SaldoDaStripe>(() => {}) }),
  );
  assert.deepEqual(demora.valor, { estado: 'indisponivel', motivo: 'demora' });
  assert.ok(Date.now() - inicio < 1000, 'o limite segurou a espera');
  for (const l of demora.linhas) assert.doesNotMatch(l, /rk_|sk_/);
  // a resposta que chega depois do limite (ou o erro dela) não estoura nada
  const tardia = await lerSaldoDaStripe({
    chave: CHAVE_TESTE,
    modo: 'teste',
    limiteMs: 10,
    buscar: () => new Promise<SaldoDaStripe>((_, recusar) => setTimeout(() => recusar(new Error('tarde')), 30)),
  });
  assert.deepEqual(tardia, { estado: 'indisponivel', motivo: 'demora' });
  await new Promise((r) => setTimeout(r, 50));
  // o limite de verdade é curto: a tela espera por ele
  assert.ok(LIMITE_DO_SALDO_MS <= 5000 && LIMITE_DO_SALDO_MS >= 1000, String(LIMITE_DO_SALDO_MS));
});

/** Todos os arquivos de src/, com o caminho. */
function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    return statSync(caminho).isDirectory() ? arquivos(caminho) : [caminho];
  });
}

test('a chave do saldo só existe no servidor: um arquivo só a lê, nenhum a manda ao navegador, à página ou ao registro', () => {
  const todos = arquivos('src').filter((a) => /\.(ts|tsx|js|mjs)$/.test(a));
  const comAChave = todos.filter((a) => readFileSync(a, 'utf8').includes('process.env.STRIPE_SALDO_KEY'));
  assert.deepEqual(
    comAChave.map((a) => a.replace(/\\/g, '/')),
    ['src/lib/saldo-stripe.ts'],
  );
  // nenhuma variável pública (NEXT_PUBLIC_…) com o saldo, e nenhum componente do navegador importa o módulo do saldo
  for (const a of todos) {
    const texto = readFileSync(a, 'utf8');
    assert.doesNotMatch(texto, /NEXT_PUBLIC_[A-Z_]*SALDO/, a);
    if (/^\s*['"]use client['"]/m.test(texto)) assert.doesNotMatch(texto, /saldo-stripe/, a);
  }
  const modulo = readFileSync(path.join('src', 'lib', 'saldo-stripe.ts'), 'utf8');
  // o registro do servidor nunca leva a chave nem a mensagem do erro (só o tipo)
  const registros = [...modulo.matchAll(/console\.\w+\(([^;]*)\);/g)];
  assert.equal(registros.length, 2);
  for (const m of registros) assert.doesNotMatch(m[1], /chave|\.message|String\(e\)|\$\{e\}/, m[0]);
  assert.match(modulo, /if \(e instanceof Stripe\.errors\.StripeError\) return e\.type;/);
  // a leitura é o GET /v1/balance, com um cliente só da chave do saldo, sem novas tentativas e com o limite curto
  assert.match(modulo, /return cliente\.balance\.retrieve\(\);/);
  assert.match(modulo, /maxNetworkRetries: 0,\s+timeout: limiteMs,/);
  // a página do resumo recebe só os valores: ela importa a leitura, nunca a chave
  const tela = readFileSync(path.join('src', 'app', 'admin', 'resumo', '[codigo]', 'page.tsx'), 'utf8');
  assert.match(tela, /saldo: devolucaoPelaStripe\(p\) \? await lerSaldoDaStripe\(\) : null,/);
  assert.doesNotMatch(tela, /STRIPE_SALDO_KEY|process\.env/);
});
