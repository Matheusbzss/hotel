/**
 * Prints rápidos com Playwright: celular (390 px) e computador (1440 px), do site construído ou do site no ar.
 *
 * Antes, no computador, em segundo plano e um servidor só: npm run build e depois npm run start.
 * Uso: node scripts/prints.mjs [opções] <página> [<página>...]
 *   página: /es/checkout, ou nome=/pt/pedido/ON-ABC123?t=TOKEN (o nome vira o nome do arquivo)
 * Opções:
 *   --base=http://localhost:3000  endereço do site construído (o padrão é o do npm run start); com um
 *                                 endereço de fora (--base=https://orlanativa.online), print do site no ar
 *   --saida=.impeccable/review    pasta dos prints
 *   --inteira                     também a página inteira (só no fim da etapa)
 *   --com-mapa                    mapa 3D e cliques nos pinos (só quando a etapa mexer no mapa)
 *   --cookies=arquivo.json        cookies no formato do Playwright (painel logado, carrinho)
 * Regras: espera o 'load' (nunca 'networkidle'), no máximo 20 s por espera, um print por vez
 * (uma trava impede duas execuções ao mesmo tempo) e o tempo de cada print no relatório.
 * O jeito antigo (node scripts/prints.mjs <url-base> <pasta> <páginas...>) continua valendo.
 */
import { mkdir, readFile, rm } from 'node:fs/promises';
import { openSync, closeSync, writeSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const LIMITE = 20000;
const opcoes = {};
const soltos = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--')) {
    const [chave, ...resto] = a.slice(2).split('=');
    opcoes[chave] = resto.length ? resto.join('=') : true;
  } else soltos.push(a);
}
// no Git Bash, "/es" vira "C:/Program Files/Git/es" antes de chegar aqui
const convertido = soltos.find((a) => /^[A-Za-z]:[/].*[/]Git[/]/.test(a));
if (convertido) {
  console.error(
    `O Git Bash trocou uma página por um caminho do Windows (${convertido}). Rode de novo com MSYS_NO_PATHCONV=1 na frente do comando.`,
  );
  process.exit(1);
}
if (soltos[0]?.startsWith('http')) opcoes.base ??= soltos.shift();
if (soltos[0] && !soltos[0].startsWith('/') && !soltos[0].includes('=/')) opcoes.saida ??= soltos.shift();
const base = String(opcoes.base ?? 'http://localhost:3000').replace(/[/]$/, '');
const saida = String(opcoes.saida ?? '.impeccable/review');
const comMapa = Boolean(opcoes['com-mapa']);
const inteira = Boolean(opcoes.inteira);

const sair = (msg) => {
  console.error(msg);
  process.exit(1);
};
if (!soltos.length) sair('Diga quais páginas fotografar (só as que a etapa mudou). Ex.: node scripts/prints.mjs /es/checkout');

const paginas = soltos.map((a) => {
  const i = a.indexOf('=/');
  const caminho = i > 0 ? a.slice(i + 1) : a;
  const bruto = i > 0 ? a.slice(0, i) : caminho.split('?')[0].replace(/^[/]/, '').split('/').join('-') || 'inicio';
  return { caminho, id: bruto.toLowerCase().replace(/[^a-z0-9-]+/g, '-') };
});

// 1. no computador, só o site construído: o npm run dev não serve os arquivos do build. O site no ar não tem o
// build daqui para comparar: segue sem essa conferência. Endereço quebrado ou sem http:// conta como local (a
// conferência avisa), e também os endereços da rede de casa (192.168…, 10…, 172.16 a 31…)
const local = (() => {
  try {
    const nome = new URL(base).hostname;
    return (
      !nome ||
      ['localhost', '0.0.0.0', '[::1]'].includes(nome) ||
      nome.endsWith('.localhost') ||
      /^((127|10)(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/.test(nome)
    );
  } catch {
    return true;
  }
})();
// no site no ar, o cookie do carrinho (no /checkout) e o ?t= de um pedido gravariam no banco de verdade
if (!local && (opcoes.cookies || paginas.some((p) => /[?&]t=/.test(p.caminho)))) {
  sair('No site no ar, --cookies e páginas com ?t= gravariam no banco de verdade. Use o site construído aqui (npm run start).');
}
if (local) {
  const buildId = (await readFile('.next/BUILD_ID', 'utf8').catch(() => '')).trim();
  if (!buildId) sair('Não achei o site construído (.next/BUILD_ID). Rode antes, em segundo plano: npm run build e depois npm run start.');
  const teste = await fetch(`${base}/_next/static/${buildId}/_buildManifest.js`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!teste) sair(`Nada respondeu em ${base}. Suba o site construído em segundo plano: npm run start`);
  if (teste.status !== 200) {
    sair(
      `O servidor em ${base} não é o site construído de agora (parece o npm run dev ou um build antigo). Rode npm run build e depois npm run start.`,
    );
  }
} else console.log(`Prints do site no ar (${base}): sem conferir o build daqui.`);

// 2. um print por vez: a trava impede outra execução ao mesmo tempo
const trava = path.join('.impeccable', '.prints.lock');
await mkdir('.impeccable', { recursive: true });
const pegarTrava = () => {
  try {
    const fd = openSync(trava, 'wx');
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch {
    return false;
  }
};
if (!pegarTrava()) {
  const dono = Number(readFileSync(trava, 'utf8'));
  let vivo = false;
  try {
    process.kill(dono, 0);
    vivo = true;
  } catch {}
  if (vivo) sair(`Outro print está rodando (processo ${dono}). Espere ele terminar: um print por vez.`);
  rmSync(trava, { force: true });
  if (!pegarTrava()) sair('Não consegui pegar a trava dos prints.');
}
process.on('exit', () => rmSync(trava, { force: true }));

await mkdir(saida, { recursive: true });
const seg = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
const tempos = [];
const avisos = [];
const erros = [];
const cookies = opcoes.cookies ? JSON.parse(await readFile(String(opcoes.cookies), 'utf8')) : [];
const telas = [
  ['celular', { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }],
  ['computador', { viewport: { width: 1440, height: 900 } }],
];
const primeiraLinha = (e) => String(e.message).split(String.fromCharCode(10))[0];

const inicio = performance.now();
const navegador = await chromium.launch({ args: comMapa ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [] });
try {
  for (const [nome, config] of telas) {
    const ctx = await navegador.newContext({ ...config, locale: 'es-AR' });
    if (cookies.length) {
      const ajustados = cookies.map((c) => ({
        ...c,
        secure: base.startsWith('https') ? c.secure : false,
        ...(c.domain || c.url ? {} : { url: base }),
      }));
      await ctx.addCookies(ajustados);
    }
    const page = await ctx.newPage();
    page.setDefaultTimeout(LIMITE);
    page.on('console', (m) => m.type() === 'error' && erros.push(`[${nome}] ${m.text()}`));
    page.on('pageerror', (e) => erros.push(`[${nome}] ${e.message}`));
    const foto = async (sufixo, extra = {}) => {
      const t = performance.now();
      const arquivo = `${saida}/${sufixo}.png`;
      await page.screenshot({ path: arquivo, timeout: LIMITE, ...extra });
      tempos.push({ arquivo, ms: performance.now() - t });
    };
    for (const { caminho, id } of paginas) {
      const t = performance.now();
      try {
        await page.goto(base + caminho, { waitUntil: 'load', timeout: LIMITE });
        await page.evaluate((ms) => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, ms))]), LIMITE);
        await page.waitForTimeout(400);
        await foto(`${id}-${nome}`);
        if (await page.locator('#passeios').count()) {
          await page.locator('#passeios').scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          await foto(`${id}-${nome}-vitrine`);
        }
        const palco = page.locator('.mapa-palco');
        if (comMapa && (await palco.count())) {
          const mostrarMapa = () =>
            palco.evaluate((el) => window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 76, behavior: 'instant' }));
          await mostrarMapa();
          await page
            .waitForFunction(() => document.querySelector('.mapa-palco')?.getAttribute('data-3d') !== 'plano', null, { timeout: LIMITE })
            .catch(() => {});
          console.log(`${nome} ${caminho}: mapa ${await palco.getAttribute('data-3d')}`);
          await page.waitForTimeout(1500);
          await mostrarMapa();
          await foto(`${id}-${nome}-mapa`);
          for (const cidade of ['buzios', 'arraial-do-cabo']) {
            try {
              await page.locator(`.pino[data-pino="${cidade}"]`).click({ timeout: LIMITE });
              await page.waitForTimeout(3000);
              await mostrarMapa();
              await foto(`${id}-${nome}-mapa-${cidade}`);
              await page.locator('.mapa-cartao .mapa-fechar').click({ timeout: LIMITE });
              await page.waitForTimeout(1500);
            } catch (e) {
              avisos.push(`[${nome}] pino ${cidade} não clicável: ${primeiraLinha(e)}`);
            }
          }
        }
        if (inteira) await foto(`${id}-${nome}-inteira`, { fullPage: true });
      } catch (e) {
        avisos.push(`[${nome}] ${caminho.split('?')[0]}: ${primeiraLinha(e)}`);
      }
      console.log(`${nome.padEnd(10)} ${caminho.split('?')[0]}: ${seg(performance.now() - t)} s`);
    }
    await ctx.close();
  }
} finally {
  await navegador.close();
}
for (const { arquivo, ms } of tempos) console.log(`  ${arquivo}: ${seg(ms)} s`);
console.log(`Total: ${tempos.length} prints em ${seg(performance.now() - inicio)} s (contando abrir o navegador).`);
if (avisos.length) console.log('Avisos:');
for (const a of avisos) console.log(`  ${a}`);
const unicos = [...new Set(erros)];
console.log(unicos.length ? 'Erros no console:' : 'Sem erros no console.');
for (const e of unicos) console.log(`  ${e}`);
await rm(trava, { force: true });
