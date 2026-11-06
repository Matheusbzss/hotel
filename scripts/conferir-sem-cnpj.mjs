// Confere, página por página do sitemap, que nenhuma mostra CNPJ (a palavra ou o número), nem no texto
// nem no código da página (dados estruturados e metadados). É a regra do CLAUDE.md; o teste
// tests/sem-cnpj.test.ts confere o mesmo nos arquivos do projeto, com as mesmas regras de busca.
// Uso: node scripts/conferir-sem-cnpj.mjs [endereço]   (sem endereço, confere o site publicado)

const base = (process.argv[2] ?? 'https://agenciavictorhugo.online').replace(/\/$/, '');

/** O número com pontuação: 00.000.000/0000-00 ou 00000000/0000-00. */
const FORMATADO = /(?<![\d.])(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{8}\/\d{4}-\d{2})(?!\d)/;
/** 14 dígitos juntos, fora de um número decimal (a posição de um pino no mapa tem 14 casas depois da vírgula). */
const JUNTOS = /(?<![\d.,])\d{14}(?!\d|[.,]\d)/g;
const PALAVRA = /cnpj/i;

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

const achar = (texto) =>
  texto.match(FORMATADO)?.[0] ?? [...texto.matchAll(JUNTOS)].map((m) => m[0]).find(digitosBatem) ?? texto.match(PALAVRA)?.[0];

// o sitemap traz o endereço oficial; troca pelo endereço conferido (útil no computador)
const noEndereco = (u) => {
  const x = new URL(u);
  return base + x.pathname + x.search;
};
const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
const enderecos = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => noEndereco(m[1])))];
// além das páginas, os arquivos que o Google e as prévias de link leem
enderecos.push(`${base}/robots.txt`, `${base}/sitemap.xml`, `${base}/manifest.webmanifest`);

const problemas = [];
for (let i = 0; i < enderecos.length; i += 6) {
  await Promise.all(
    enderecos.slice(i, i + 6).map(async (url) => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        const texto = await r.text();
        if (!r.ok) problemas.push(`${url}: HTTP ${r.status}`);
        const achado = achar(texto);
        if (achado) problemas.push(`${url}: "${achado}"`);
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
console.log('Nenhum CNPJ encontrado.');
