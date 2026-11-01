/**
 * Prints e testes rápidos com Playwright: celular (390 px) e computador (1440 px).
 * Uso: node scripts/prints.mjs [url-base] [pasta-saida] [paginas...]
 * Ex.: node scripts/prints.mjs http://localhost:3000 .impeccable/review /es /es/passeios
 * Também registra erros do console e, na página inicial, toca num passeio e num pino do mapa.
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
    await page.waitForTimeout(2500);
    // espera o 3D entrar (quando o aparelho tem WebGL): até 40 s no renderizador por software dos testes
    await page.waitForFunction(() => document.documentElement.dataset.mar3d === 'on' || !document.getElementById('mar-janela'), null, { timeout: 40000 }).catch(() => {});
    await page.screenshot({ path: `${saida}/${id}-${nome}.png` });
    const tem3d = await page.evaluate(() => document.documentElement.dataset.mar3d === 'on');
    console.log(`${nome} ${caminho}: 3D ${tem3d ? 'ligado' : 'desligado'}`);
    if (await page.locator('#boletim').count()) {
      await page.locator('#boletim').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${saida}/${id}-${nome}-boletim.png` });
      await page.locator('.fila').first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${saida}/${id}-${nome}-escolhido.png` });
      await page.locator('.fila').first().click();
      await page.locator('#mapa-janela').evaluate((el) => window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top, behavior: 'instant' }));
      await page.waitForFunction(() => !document.documentElement.dataset.mar3d || document.documentElement.dataset.voo === '1.00', null, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${saida}/${id}-${nome}-mapa.png` });
      const pino = page.locator('.pino[data-visivel="sim"]').first();
      if (await pino.count()) {
        await pino.dispatchEvent('click');
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${saida}/${id}-${nome}-mapa-cidade.png` });
      }
    }
    await page.screenshot({ path: `${saida}/${id}-${nome}-inteira.png`, fullPage: true, timeout: 120000 });
  }
  await ctx.close();
}
await navegador.close();
console.log(erros.length ? `Erros no console:\n${[...new Set(erros)].join('\n')}` : 'Sem erros no console.');
