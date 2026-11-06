/**
 * Gera src/data/litoral.json: o contorno da Região dos Lagos (Búzios, Cabo Frio, Arraial do Cabo)
 * para o mapa 3D da página inicial, a partir das linhas de costa do OpenStreetMap.
 *
 * Uso: node scripts/gerar-litoral.mjs [arquivo-overpass.json]
 * Sem arquivo, baixa da Overpass API. Dados © colaboradores do OpenStreetMap, licença ODbL.
 *
 * Convenção do OSM: a terra fica à esquerda do sentido da linha de costa. Juntamos as linhas
 * abertas pelas pontas, recortamos na caixa do mapa e fechamos pelo contorno da caixa no sentido
 * anti-horário, o que mantém a terra do lado de dentro.
 */
import { readFile, writeFile } from 'node:fs/promises';

// a caixa vai além do que a câmera mostra: a borda reta do recorte nunca aparece no 3D
const CAIXA = { sul: -23.1, oeste: -42.62, norte: -22.3, leste: -41.8 };
// o centro fica fixo: a cena 3D e o mapa plano medem tudo a partir dele
const CENTRO = { lat: -22.86, lon: -42.005 };
const TOLERANCIA_M = 25;

const consulta = `[out:json][timeout:90];way["natural"="coastline"](${CAIXA.sul - 0.01},${CAIXA.oeste - 0.01},${CAIXA.norte + 0.01},${CAIXA.leste + 0.01});out geom;`;

async function dados() {
  const arquivo = process.argv[2];
  if (arquivo) return JSON.parse(await readFile(arquivo, 'utf8'));
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(consulta)}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'OrlaNativa-site-build/1.0', Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Overpass respondeu ${r.status}`);
  return r.json();
}

// metros a partir do centro do mapa (equirretangular: suficiente para 35 km)
const KX = 111320 * Math.cos((CENTRO.lat * Math.PI) / 180);
const KY = 110574;
const projetar = ({ lat, lon }) => [(lon - CENTRO.lon) * KX, (lat - CENTRO.lat) * KY];
const X0 = (CAIXA.oeste - CENTRO.lon) * KX;
const X1 = (CAIXA.leste - CENTRO.lon) * KX;
const Y0 = (CAIXA.sul - CENTRO.lat) * KY;
const Y1 = (CAIXA.norte - CENTRO.lat) * KY;

const chave = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;

function juntar(linhas) {
  const abertas = linhas.map((l) => [...l]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (let i = 0; i < abertas.length && !mudou; i++) {
      for (let j = 0; j < abertas.length && !mudou; j++) {
        if (i === j) continue;
        const a = abertas[i];
        const b = abertas[j];
        if (chave(a[a.length - 1]) === chave(b[0])) {
          abertas[i] = a.concat(b.slice(1));
          abertas.splice(j, 1);
          mudou = true;
        }
      }
    }
  }
  return abertas;
}

const dentro = ([x, y]) => x >= X0 && x <= X1 && y >= Y0 && y <= Y1;

/** Ponto onde o segmento p→q cruza a borda da caixa. */
function cruzamento(p, q) {
  let t = 1;
  const [x0, y0] = p;
  const dx = q[0] - x0;
  const dy = q[1] - y0;
  for (const [lim, d, o] of [
    [X0, dx, x0],
    [X1, dx, x0],
  ])
    if (d !== 0) {
      const s = (lim - o) / d;
      if (s >= 0 && s <= 1) {
        const y = y0 + s * dy;
        if (y >= Y0 - 1e-6 && y <= Y1 + 1e-6) t = Math.min(t, s);
      }
    }
  for (const lim of [Y0, Y1])
    if (dy !== 0) {
      const s = (lim - y0) / dy;
      if (s >= 0 && s <= 1) {
        const x = x0 + s * dx;
        if (x >= X0 - 1e-6 && x <= X1 + 1e-6) t = Math.min(t, s);
      }
    }
  return [x0 + t * dx, y0 + t * dy];
}

/** Recorta uma linha aberta na caixa: devolve os trechos que ficam dentro. */
function recortar(linha) {
  const trechos = [];
  let atual = null;
  for (let i = 0; i < linha.length; i++) {
    const p = linha[i];
    if (dentro(p)) {
      if (!atual) {
        atual = i > 0 ? [cruzamento(p, linha[i - 1])] : [];
        trechos.push(atual);
      }
      atual.push(p);
    } else if (atual) {
      atual.push(cruzamento(linha[i - 1], p));
      atual = null;
    }
  }
  return trechos.filter((t) => t.length > 1);
}

// posição de um ponto da borda ao longo do perímetro, no sentido anti-horário a partir do canto sudoeste
const W = X1 - X0;
const H = Y1 - Y0;
function perimetro([x, y]) {
  const e = 1e-3;
  if (Math.abs(y - Y0) < e) return x - X0; // sul, de oeste para leste
  if (Math.abs(x - X1) < e) return W + (y - Y0); // leste, de sul para norte
  if (Math.abs(y - Y1) < e) return W + H + (X1 - x); // norte, de leste para oeste
  return 2 * W + H + (Y1 - y); // oeste, de norte para sul
}
const CANTOS = [
  [0, [X0, Y0]],
  [W, [X1, Y0]],
  [W + H, [X1, Y1]],
  [2 * W + H, [X0, Y1]],
];
const TOTAL = 2 * (W + H);

/** Fecha os trechos recortados pelo contorno da caixa, sempre no sentido anti-horário. */
function fecharPelaCaixa(trechos) {
  const restantes = trechos.map((t) => ({ t, ini: perimetro(t[0]), fim: perimetro(t[t.length - 1]) }));
  const aneis = [];
  while (restantes.length) {
    let anel = restantes.shift();
    const pontos = [...anel.t];
    let fim = anel.fim;
    for (;;) {
      // próximo trecho que começa adiante no perímetro (anti-horário)
      let melhor = -1;
      let menor = Infinity;
      restantes.forEach((r, i) => {
        const d = (r.ini - fim + TOTAL) % TOTAL;
        if (d < menor) {
          menor = d;
          melhor = i;
        }
      });
      const voltaAoInicio = (perimetro(pontos[0]) - fim + TOTAL) % TOTAL;
      const alvo = melhor >= 0 && menor < voltaAoInicio ? restantes[melhor] : null;
      const destino = alvo ? alvo.ini : perimetro(pontos[0]);
      // cantos entre fim e destino
      const dist = (destino - fim + TOTAL) % TOTAL;
      for (const [pos, canto] of [...CANTOS, ...CANTOS.map(([p, c]) => [p + TOTAL, c])]) {
        const d = pos - fim;
        if (d > 0 && d < dist) pontos.push(canto);
      }
      if (!alvo) break;
      pontos.push(...alvo.t);
      fim = alvo.fim;
      restantes.splice(restantes.indexOf(alvo), 1);
    }
    aneis.push(pontos);
  }
  return aneis;
}

function simplificar(pontos, tol) {
  if (pontos.length < 3) return pontos;
  const manter = new Uint8Array(pontos.length);
  manter[0] = manter[pontos.length - 1] = 1;
  const pilha = [[0, pontos.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    const [ax, ay] = pontos[a];
    const [bx, by] = pontos[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pontos[i][0] - dx * pontos[i][1] + bx * ay - by * ax) / len;
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

/** Anel fechado (último ponto = primeiro): divide no ponto mais distante do início e simplifica as duas metades. */
function simplificarAnel(anel, tol) {
  const [x0, y0] = anel[0];
  const [xn, yn] = anel[anel.length - 1];
  if (x0 !== xn || y0 !== yn) return simplificar(anel, tol);
  let m = 1;
  let maxD = -1;
  anel.forEach(([x, y], i) => {
    const d = Math.hypot(x - x0, y - y0);
    if (d > maxD) {
      maxD = d;
      m = i;
    }
  });
  const a = simplificar(anel.slice(0, m + 1), tol);
  const b = simplificar(anel.slice(m), tol);
  return a.concat(b.slice(1, -1));
}

const area = (anel) => anel.reduce((s, p, i) => s + (p[0] * anel[(i + 1) % anel.length][1] - anel[(i + 1) % anel.length][0] * p[1]), 0) / 2;
const arredondar = (anel) => anel.map(([x, y]) => [Math.round(x), Math.round(y)]);

const json = await dados();
const vias = json.elements.filter((e) => e.type === 'way' && e.geometry?.length > 1);
const fechadas = [];
const abertas = [];
for (const v of vias) {
  const g = v.geometry;
  (chave(g[0]) === chave(g[g.length - 1]) ? fechadas : abertas).push(g);
}

const continentes = [];
for (const linha of juntar(abertas)) {
  const p = linha.map(projetar);
  if (chave(linha[0]) === chave(linha[linha.length - 1])) continentes.push(p);
  else continentes.push(...fecharPelaCaixa(recortar(p)));
}
const ilhas = fechadas.map((g) => g.map(projetar)).filter((anel) => anel.some(dentro));

const terra = [...continentes, ...ilhas]
  .map((anel) => arredondar(simplificarAnel(anel, TOLERANCIA_M)))
  .filter((anel) => anel.length >= 4 && Math.abs(area(anel)) > 4000);

const saida = {
  fonte: 'Linhas de costa do OpenStreetMap (natural=coastline). © colaboradores do OpenStreetMap, licença ODbL.',
  unidade: 'metros a partir do centro, x para leste, y para norte',
  centro: CENTRO,
  caixa: { x0: Math.round(X0), x1: Math.round(X1), y0: Math.round(Y0), y1: Math.round(Y1) },
  terra,
};
await writeFile(new URL('../src/data/litoral.json', import.meta.url), JSON.stringify(saida));
const pontos = terra.reduce((s, a) => s + a.length, 0);
console.log(`litoral.json: ${terra.length} áreas de terra, ${pontos} pontos`);
