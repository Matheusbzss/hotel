// Confere, página por página do sitemap, o CNPJ do site: o da empresa no rodapé de toda página e no texto dos termos
// e da política de privacidade; fora dos metadados e dos dados estruturados; nenhum outro número em lugar nenhum.
// O teste tests/sem-cnpj.test.ts confere o mesmo nos arquivos do projeto, com as mesmas regras de busca.
// Também confere que nenhuma página fala em Pagar.me, nem escondido no código da página.
// Uso: node scripts/conferir-sem-cnpj.mjs [endereço]   (sem endereço, confere o site publicado)

import { readFileSync } from 'node:fs';

const base = (process.argv[2] ?? 'https://agenciavictorhugo.online').replace(/\/$/, '');

const OFICIAL = readFileSync(new URL('../src/config/empresa.ts', import.meta.url), 'utf8').match(/cnpj: '([^']+)'/)[1];
const DIGITOS = OFICIAL.replace(/\D/g, '');
/** As páginas que trazem o CNPJ no próprio texto, além do rodapé, nos três idiomas. */
const LEGAIS = /\/(termos-de-uso|terms-of-use|terminos-de-uso|politica-de-privacidade|privacy-policy|politica-de-privacidad)\/?$/;

/** O número com pontuação: 00.000.000/0000-00 ou 00000000/0000-00. */
const FORMATADO = /(?<![\d.])(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{8}\/\d{4}-\d{2})(?!\d)/g;
/** 14 dígitos juntos, fora de um número decimal (a posição de um pino no mapa tem 14 casas depois da vírgula). */
const JUNTOS = /(?<![\d.,])\d{14}(?!\d|[.,]\d)/g;

/** Os dois dígitos verificadores batem: os 14 dígitos formam um CNPJ. */
function digitosBatem(n) {
  if (/^(\d)\1+$/.test(n)) return false;
  const verificador = (b) => {
    const pesos = b.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = [...b].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = verificador(n.slice(0, 12));
  return n.endsWith(`${d1}${verificador(n.slice(0, 12) + d1)}`);
}

/** Todos os CNPJs do texto, só os dígitos: o da empresa, repetido em toda página, não pode esconder outro. */
const numeros = (texto) => [
  ...[...texto.matchAll(FORMATADO)].map((m) => m[0].replace(/\D/g, '')),
  ...[...texto.matchAll(JUNTOS)].map((m) => m[0]).filter(digitosBatem),
];

const trecho = (html, abre, fecha) => {
  const i = html.indexOf(abre);
  const j = html.indexOf(fecha, i);
  return i < 0 || j < 0 ? '' : html.slice(i, j);
};
/** Título, etiquetas meta e dados estruturados: o que vai para o Google e as prévias. Nem sempre ficam no <head>. */
const metadados = (html) =>
  [...html.matchAll(/<title>[^<]*<\/title>|<meta\b[^>]*>|<script type="application\/ld\+json">[^<]*<\/script>/g)].map((m) => m[0]).join('\n');

// o sitemap traz o endereço oficial; troca pelo endereço conferido (útil no computador)
const noEndereco = (u) => {
  const x = new URL(u);
  return base + x.pathname + x.search;
};
const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
const enderecos = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => noEndereco(m[1])))];
// o checkout não entra no sitemap, mas é onde a compra fecha
enderecos.push(`${base}/checkout`);
// além das páginas, os arquivos que o Google e as prévias de link leem: neles, nenhum CNPJ
const ARQUIVOS = [`${base}/robots.txt`, `${base}/sitemap.xml`, `${base}/manifest.webmanifest`];
enderecos.push(...ARQUIVOS);

const problemas = [];
for (let i = 0; i < enderecos.length; i += 6) {
  await Promise.all(
    enderecos.slice(i, i + 6).map(async (url) => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        const texto = await r.text();
        if (!r.ok) problemas.push(`${url}: HTTP ${r.status}`);
        if (/pagar.?me/i.test(texto)) problemas.push(`${url}: fala em Pagar.me`);
        const outro = numeros(texto).find((n) => n !== DIGITOS);
        if (outro) problemas.push(`${url}: outro CNPJ, ${outro}`);
        if (ARQUIVOS.includes(url)) {
          if (numeros(texto).length) problemas.push(`${url}: CNPJ num arquivo que não deveria ter`);
          return;
        }
        // só o número: o React separa "CNPJ" e o número com um comentário no HTML
        if (!trecho(texto, '<footer', '</footer>').includes(OFICIAL)) problemas.push(`${url}: rodapé sem o CNPJ`);
        if (LEGAIS.test(new URL(url).pathname) && !trecho(texto, '<main', '</main>').includes(OFICIAL)) problemas.push(`${url}: texto sem o CNPJ`);
        if (numeros(metadados(texto)).length) problemas.push(`${url}: CNPJ nos metadados ou nos dados estruturados`);
      } catch (e) {
        problemas.push(`${url}: ${e instanceof Error ? e.message : e}`);
      }
    }),
  );
}

console.log(`${enderecos.length} endereços conferidos em ${base}`);
if (problemas.length) {
  console.log(problemas.join('\n'));
  process.exit(1);
}
console.log(`CNPJ certo: ${OFICIAL} no rodapé, nos termos e na privacidade, nenhum outro, e nada de Pagar.me.`);
