/**
 * Baixa do OpenStreetMap as lagoas grandes (água dentro da terra, como a Lagoa de Araruama) e os nomes
 * das praias da região, para o mapa da página inicial:
 *   src/data/lagoas.json  anéis de água em metros a partir do centro do mapa (a mesma conta do litoral)
 *   src/data/praias.json  praias com nome, posição em metros e a cidade mais próxima
 * Uso: node scripts/gerar-lagoas-praias.mjs. Dados © colaboradores do OpenStreetMap, licença ODbL.
 */
import { readFile, writeFile } from 'node:fs/promises';

const CAIXA = { sul: -23.07, oeste: -42.17, norte: -22.65, leste: -41.83 };
const litoral = JSON.parse(await readFile(new URL('../src/data/litoral.json', import.meta.url), 'utf8'));
const { centro } = litoral;
const KX = 111320 * Math.cos((centro.lat * Math.PI) / 180);
const KY = 110574;
const metros = (lat, lon) => [Math.round((lon - centro.lon) * KX), Math.round((lat - centro.lat) * KY)];

// a Overpass às vezes responde 502/504 quando está cheia: tenta de novo e alterna entre dois servidores
async function overpass(consulta) {
  const servidores = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const r = await fetch(servidores[tentativa % 2] + '?data=' + encodeURIComponent(consulta), {
      headers: { 'User-Agent': 'OrlaNativa-site-build/1.0', Accept: 'application/json' },
    });
    if (r.ok) return r.json();
    await new Promise((ok) => setTimeout(ok, 3000 * (tentativa + 1)));
  }
  throw new Error('Overpass não respondeu');
}
const bbox = `${CAIXA.sul},${CAIXA.oeste},${CAIXA.norte},${CAIXA.leste}`;

// lagoas: caminhos e relações de água; as relações têm várias vias externas que juntamos pelas pontas
const agua = await overpass(`[out:json][timeout:120];(way["natural"="water"](${bbox});relation["natural"="water"](${bbox}););out geom;`);
const chave = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
function juntar(linhas) {
  const abertas = linhas.map((l) => [...l]);
  const aneis = [];
  while (abertas.length) {
    let anel = abertas.shift();
    let mudou = true;
    while (mudou && chave(anel[0]) !== chave(anel[anel.length - 1])) {
      mudou = false;
      for (let i = 0; i < abertas.length; i++) {
        const l = abertas[i];
        const fim = chave(anel[anel.length - 1]);
        if (chave(l[0]) === fim) anel = anel.concat(l.slice(1));
        else if (chave(l[l.length - 1]) === fim) anel = anel.concat([...l].reverse().slice(1));
        else continue;
        abertas.splice(i, 1);
        mudou = true;
        break;
      }
    }
    aneis.push(anel);
  }
  return aneis;
}
const area = (anel) => Math.abs(anel.reduce((s, p, i) => s + (p[0] * anel[(i + 1) % anel.length][1] - anel[(i + 1) % anel.length][0] * p[1]), 0) / 2);
function simplificar(pontos, tol) {
  if (pontos.length < 4) return pontos;
  const manter = new Uint8Array(pontos.length);
  manter[0] = manter[pontos.length - 1] = 1;
  const pilha = [[0, pontos.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    const [ax, ay] = pontos[a];
    const [bx, by] = pontos[b];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((by - ay) * pontos[i][0] - (bx - ax) * pontos[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      manter[idx] = 1;
      pilha.push([a, idx], [idx, b]);
    }
  }
  return pontos.filter((_, i) => manter[i]);
}
/** Anel fechado: divide no ponto mais longe do início e simplifica as duas metades (sem isso vira uma linha). */
function simplificarAnel(anel, tol) {
  const [x0, y0] = anel[0];
  let m = 1;
  let maior = -1;
  anel.forEach(([x, y], i) => {
    const d = Math.hypot(x - x0, y - y0);
    if (d > maior) {
      maior = d;
      m = i;
    }
  });
  return simplificar(anel.slice(0, m + 1), tol).concat(simplificar(anel.slice(m), tol).slice(1, -1));
}

const aneis = [];
for (const e of agua.elements) {
  if (e.type === 'way' && e.geometry) aneis.push(e.geometry);
  if (e.type === 'relation' && e.members) {
    const externas = e.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => m.geometry);
    aneis.push(...juntar(externas));
  }
}
const lagoas = aneis
  .filter((a) => a.length > 3 && chave(a[0]) === chave(a[a.length - 1]))
  .map((a) => a.map((p) => metros(p.lat, p.lon)))
  .filter((a) => area(a) > 400000) // só as lagoas grandes (mais de 0,4 km²)
  .map((a) => simplificarAnel(a, 30));

// praias com nome: o centro de cada uma e a cidade mais perto (Búzios, Cabo Frio ou Arraial do Cabo)
const CIDADES = {
  buzios: metros(-22.7469, -41.8817),
  'cabo-frio': metros(-22.8889, -42.0186),
  'arraial-do-cabo': metros(-22.9746, -42.0216),
};
const praiasOsm = await overpass(`[out:json][timeout:90];nwr["natural"="beach"]["name"](${bbox});out center;`);
const vistas = new Set();
const praias = [];
for (const e of praiasOsm.elements) {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  const nome = e.tags?.name?.trim();
  if (!lat || !nome) continue;
  const [x, y] = metros(lat, lon);
  const [cidade] = Object.entries(CIDADES).sort((a, b) => Math.hypot(a[1][0] - x, a[1][1] - y) - Math.hypot(b[1][0] - x, b[1][1] - y))[0];
  // o mesmo nome pode existir em duas cidades (Praia do Forno em Búzios e em Arraial)
  if (vistas.has(nome + cidade)) continue;
  vistas.add(nome + cidade);
  praias.push({ nome, x, y, cidade });
}

await writeFile(new URL('../src/data/lagoas.json', import.meta.url), JSON.stringify({ fonte: 'OpenStreetMap (natural=water), © colaboradores do OpenStreetMap, ODbL.', lagoas }));
await writeFile(new URL('../src/data/praias.json', import.meta.url), JSON.stringify({ fonte: 'OpenStreetMap (natural=beach), © colaboradores do OpenStreetMap, ODbL.', praias }, null, 1));
console.log(`${lagoas.length} lagoas, ${praias.length} praias com nome`);
