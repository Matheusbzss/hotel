/**
 * Prints reais do site para o tutorial "Como funciona" (4 passos), no tamanho de um celular (390 x 844),
 * em português, espanhol e inglês, gravados em <pasta>/<idioma>/passo-<n>.webp.
 * Uso: node scripts/prints-tutorial.mjs [url-base] [pasta] [passos...]   (com o site rodando: npm run dev)
 * Ex.: node scripts/prints-tutorial.mjs http://localhost:3000 public/tutorial 1 2 3 4
 * O passo 4 usa uma reserva de teste criada só no computador (.data/reservas) e apagada no fim.
 */
import { mkdir, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';
import sharp from 'sharp';

const [base = 'http://localhost:3000', pasta = 'public/tutorial', ...quais] = process.argv.slice(2);
const passos = quais.length ? quais.map(Number) : [1, 2, 3, 4];
const IDIOMAS = { pt: 'pt-BR', es: 'es-AR', en: 'en-US' };
// a data do exemplo: duas semanas à frente, para o campo de data aceitar
const DATA = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
// um dos horários da escuna (9h, 11h e 14h)
const HORA = '11:00';
// o código segue o formato dos reais (sem 0, 1, I e O)
const RESERVA = { codigo: 'ON-7K3P9Q', token: 'tutorial-local' };
const PASTA_RESERVAS = path.join('.data', 'reservas');

/** Textos neutros na reserva de teste: o print mostra onde aparece o nome, sem inventar um cliente. */
const EXEMPLO = {
  pt: { nome: 'Seu nome', hotel: 'Sua hospedagem', passeio: 'Passeio de Escuna em Búzios' },
  es: { nome: 'Tu nombre', hotel: 'Tu alojamiento', passeio: 'Paseo en Goleta por Búzios' },
  en: { nome: 'Your name', hotel: 'Your hotel', passeio: 'Schooner Tour in Búzios' },
};

async function reservaDeTeste(idioma) {
  const agora = new Date().toISOString();
  const e = EXEMPLO[idioma];
  await mkdir(PASTA_RESERVAS, { recursive: true });
  await writeFile(
    path.join(PASTA_RESERVAS, `${RESERVA.codigo}.json`),
    JSON.stringify({
      ...RESERVA,
      criadaEm: agora,
      atualizadaEm: agora,
      idioma,
      status: 'pago',
      passeio: { slug: 'escuna-buzios', nome: e.passeio, cidade: 'buzios', unidade: 'pessoa' },
      data: DATA,
      horario: { hora: HORA, busca: false },
      adultos: 2,
      criancas: 0,
      criancasMeia: 0,
      criancasGratis: 0,
      unidades: 2,
      totalCentavos: 15400,
      custoParceiroCentavos: 0,
      cliente: { nome: e.nome, email: 'exemplo@example.com', telefone: '', documentoTipo: 'passaporte', documento: '' },
      hospedagem: { cidade: 'buzios', hotel: e.hotel },
      pagamento: { metodo: 'pix', pagoEm: agora },
      historico: [{ em: agora, evento: 'reserva de teste do tutorial (só no computador)' }],
    }),
  );
}

/** Rola até o elemento, logo abaixo da cápsula do menu. */
const rolar = (page, seletor) =>
  page
    .locator(seletor)
    .first()
    .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84));

const TELAS = {
  // 1. o passeio, com a data escolhida no quadro de reserva
  1: async (page, idioma) => {
    await page.goto(`${base}/${idioma}/passeios/escuna-buzios`, { waitUntil: 'networkidle' });
    await page.locator('#reservar input[type="date"]').fill(DATA);
    // tira o foco do campo (o print sai sem o contorno de foco)
    await page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
      document.body.removeAttribute('tabindex');
    });
    await rolar(page, '#reservar');
  },
  // 2. a escolha do horário no checkout, com um horário marcado
  2: async (page, idioma) => {
    await page.goto(`${base}/${idioma}/checkout/escuna-buzios?data=${DATA}&adultos=2&meia=0&gratis=0`, { waitUntil: 'networkidle' });
    await page.locator(`label:has(input[name="hora"][value="${HORA}"])`).click();
    await page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
      document.body.removeAttribute('tabindex');
    });
    await rolar(page, 'form fieldset > legend.text-lead');
  },
  // 3. o pagamento no checkout
  3: async (page, idioma) => {
    await page.goto(`${base}/${idioma}/checkout/escuna-buzios?data=${DATA}&adultos=2&meia=0&gratis=0`, { waitUntil: 'networkidle' });
    await page
      .locator('form fieldset > legend.text-lead')
      .nth(3)
      .evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84));
  },
  // 4. o voucher de uma reserva paga
  4: async (page, idioma) => {
    await reservaDeTeste(idioma);
    await page.goto(`${base}/${idioma}/reserva/${RESERVA.codigo}?t=${RESERVA.token}`, { waitUntil: 'networkidle' });
  },
};

const nav = await chromium.launch();
const ctx = await nav.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
try {
  for (const [idioma, locale] of Object.entries(IDIOMAS)) {
    const page = await ctx.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': locale });
    await mkdir(path.join(pasta, idioma), { recursive: true });
    for (const n of passos) {
      if (!TELAS[n]) {
        console.log(`passo ${n}: a tela ainda não existe no site`);
        continue;
      }
      await TELAS[n](page, idioma);
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      const png = await page.screenshot();
      const destino = path.join(pasta, idioma, `passo-${n}.webp`);
      await sharp(png).webp({ quality: 88 }).toFile(destino);
      console.log(`passo ${n} (${idioma}): ${destino}`);
    }
    await page.close();
  }
} finally {
  await nav.close();
  await rm(path.join(PASTA_RESERVAS, `${RESERVA.codigo}.json`), { force: true });
  await rmdir(PASTA_RESERVAS).catch(() => {});
  await rmdir('.data').catch(() => {});
}
