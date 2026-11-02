/**
 * Prints e testes rápidos com Playwright: celular (390 px) e computador (1440 px).
 * Uso: node scripts/prints.mjs [url-base] [pasta-saida] [paginas...]
 * Ex.: node scripts/prints.mjs http://localhost:3000 .impeccable/review /es /es/passeios
 * Também registra erros do console e, na página inicial, clica de verdade nos pinos do mapa
 * (se algo cobrir o pino, o clique falha e aparece no relatório).
 */
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from 'playwright';

const [base = 'http://localhost:3000', saida = '.impeccable/review', ...paginas] = process.argv.slice(2);
const lista = paginas.length ? paginas : ['/es'];
await mkdir(saida, { recursive: true });

const telas = [
  ['celular', { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }],
  ['computador', { viewport: { width: 1440, height: 900 } }],
];

const navegador = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const erros = [];
const avisos = [];
for (const [nome, opcoes] of telas) {
  const ctx = await navegador.newContext({ ...opcoes, locale: 'es-AR' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  page.on('console', (m) => m.type() === 'error' && erros.push(`[${nome}] ${m.text()}`));
  page.on('pageerror', (e) => erros.push(`[${nome}] ${e.message}`));
  for (const caminho of lista) {
    const id = caminho.replace(/^\//, '').replace(/\//g, '-') || 'inicio';
    await page.goto(base + caminho, { waitUntil: 'networkidle', timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${saida}/${id}-${nome}.png` });

    if (await page.locator('#passeios').count()) {
      await page.locator('#passeios').scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${saida}/${id}-${nome}-vitrine.png` });
    }

    const palco = page.locator('.mapa-palco');
    if (await palco.count()) {
      // print da tela, com o mapa logo abaixo do menu (o print de um elemento muda a altura da tela no celular)
      const mostrarMapa = () =>
        palco.evaluate((el) => window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 76, behavior: 'instant' }));
      await mostrarMapa();
      // o 3D carrega perto da tela; no renderizador por software dos testes pode levar um tempo
      await page.waitForFunction(() => document.querySelector('.mapa-palco')?.getAttribute('data-3d') !== 'plano', null, { timeout: 90000 }).catch(() => {});
      const modo = await palco.getAttribute('data-3d');
      console.log(`${nome} ${caminho}: mapa ${modo}`);
      await page.waitForTimeout(2500);
      await mostrarMapa();
      await page.screenshot({ path: `${saida}/${id}-${nome}-mapa.png` });
      for (const cidade of ['buzios', 'arraial-do-cabo']) {
        const pino = page.locator(`.pino[data-pino="${cidade}"]`);
        try {
          await pino.click({ timeout: 15000 });
          await page.waitForTimeout(5000);
          await mostrarMapa();
          await page.screenshot({ path: `${saida}/${id}-${nome}-mapa-${cidade}.png` });
          await page.locator('.mapa-cartao .mapa-fechar').click({ timeout: 15000 });
          await page.waitForTimeout(2500);
        } catch (e) {
          avisos.push(`[${nome}] pino ${cidade} não clicável: ${e.message.split('\n')[0]}`);
        }
      }
    }
    await page.screenshot({ path: `${saida}/${id}-${nome}-inteira.png`, fullPage: true, timeout: 120000 });
  }
  await ctx.close();
}
await navegador.close();
if (avisos.length) console.log(`Avisos:\n${avisos.join('\n')}`);
console.log(erros.length ? `Erros no console:\n${[...new Set(erros)].join('\n')}` : 'Sem erros no console.');
