/**
 * O mapa 3D da Região dos Lagos: o relevo real (public/mapa/altura.png) coberto pela foto de satélite em cor real
 * (Copernicus Sentinel-2, public/mapa/satelite-*.webp) e, em volta, a mesma foto em resolução menor. Nada é pintado:
 * a câmera nunca se inclina a ponto de mostrar o horizonte ou a borda das fotos. Ao tocar numa cidade, ela voa até lá.
 * Metros; x leste, y para cima, z sul (norte é -z). Os pinos e os nomes das praias são elementos HTML do palco,
 * posicionados a cada quadro.
 */
import {
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';

export interface Caixa {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface PontoCena {
  id: string;
  x: number;
  y: number;
  cidade?: string;
}

export interface OpcoesMapa {
  canvas: HTMLCanvasElement;
  /** O elemento que o canvas cobre; os pinos ([data-pino]) e as praias ([data-praia]) ficam dentro dele. */
  palco: HTMLElement;
  relevo: Caixa;
  entorno: Caixa;
  texturas: { detalhe: string; detalheMenor: string; entorno: string; alturas: string };
  cidades: PontoCena[];
  praias: PontoCena[];
  celular: boolean;
}

export interface Mapa {
  voar(cidade: string | null): void;
  ativo(sim: boolean): void;
  redimensionar(): void;
  inclinar(gama: number, beta: number): void;
  destruir(): void;
}

interface Pose {
  x: number;
  z: number;
  dist: number;
  inc: number;
  rumo: number;
}

interface Area {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const EXAGERO = 1.5;
const MARGEM = 1500;
const DURACAO = 1100;
const graus = (g: number) => (g * Math.PI) / 180;
const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = falha;
    img.src = url;
  });
}

/** A foto vira textura fora da linha principal quando o navegador deixa (sem travar a rolagem). */
async function carregarTextura(url: string): Promise<Texture> {
  let t: Texture;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    t = new Texture(await createImageBitmap(await r.blob()));
  } catch {
    t = await new TextureLoader().loadAsync(url);
  }
  // sem inverter: a primeira linha da foto (o norte) fica em v = 0, e a geometria segue essa ordem
  t.flipY = false;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Plano deitado no chão com a primeira linha da textura no norte. */
function planoNoChao(largura: number, altura: number, segX = 1, segY = 1) {
  const geo = new PlaneGeometry(largura, altura, segX, segY);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  return geo;
}

export async function criarMapa(o: OpcoesMapa): Promise<Mapa | null> {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas: o.canvas, antialias: !o.celular, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.celular ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);

  const grande = !o.celular && renderer.capabilities.maxTextureSize >= 4096;
  const [imgAltura, detalhe, fundo] = await Promise.all([
    carregarImagem(o.texturas.alturas),
    carregarTextura(grande ? o.texturas.detalhe : o.texturas.detalheMenor),
    carregarTextura(o.texturas.entorno),
  ]);

  // alturas: R e G guardam decímetros (h = (R * 256 + G) / 10 - 50)
  const tela = document.createElement('canvas');
  tela.width = imgAltura.width;
  tela.height = imgAltura.height;
  const ctx = tela.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(imgAltura, 0, 0);
  const px = ctx.getImageData(0, 0, tela.width, tela.height).data;
  const AW = tela.width;
  const AH = tela.height;
  const alturaEm = (u: number, v: number) => {
    // u: 0 oeste → 1 leste; v: 0 norte → 1 sul
    const x = limitar(u * (AW - 1), 0, AW - 1);
    const y = limitar(v * (AH - 1), 0, AH - 1);
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const h = (a: number, b: number) => {
      const k = (Math.min(AH - 1, b) * AW + Math.min(AW - 1, a)) * 4;
      return (px[k] * 256 + px[k + 1]) / 10 - 50;
    };
    return h(i, j) * (1 - fx) * (1 - fy) + h(i + 1, j) * fx * (1 - fy) + h(i, j + 1) * (1 - fx) * fy + h(i + 1, j + 1) * fx * fy;
  };

  const anisotropia = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  detalhe.anisotropy = anisotropia;
  fundo.anisotropy = anisotropia;

  const cena = new Scene();
  const { x0, x1, y0, y1 } = o.relevo;
  const W = x1 - x0;
  const H = y1 - y0;
  const segX = o.celular ? 140 : 220;
  const geo = planoNoChao(W, H, segX, Math.round((segX * H) / W));
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + W / 2) / W;
    const v = 1 - (pos.getY(i) + H / 2) / H;
    pos.setZ(i, Math.max(0, alturaEm(u, v)) * EXAGERO);
  }
  geo.rotateX(-Math.PI / 2);
  geo.computeBoundingSphere();
  const terreno = new Mesh(geo, new MeshBasicMaterial({ map: detalhe }));
  terreno.position.set((x0 + x1) / 2, 0, -(y0 + y1) / 2);
  cena.add(terreno);

  const E = o.entorno;
  const geoEntorno = planoNoChao(E.x1 - E.x0, E.y1 - E.y0);
  geoEntorno.rotateX(-Math.PI / 2);
  const entorno = new Mesh(
    geoEntorno,
    new MeshBasicMaterial({ map: fundo, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 }),
  );
  entorno.position.set((E.x0 + E.x1) / 2, -8, -(E.y0 + E.y1) / 2);
  entorno.renderOrder = -1;
  cena.add(entorno);

  const alturaNoPonto = (x: number, y: number) => Math.max(0, alturaEm((x - x0) / W, (y1 - y) / H)) * EXAGERO;
  const ancora = (p: PontoCena, acima: number) => new Vector3(p.x, alturaNoPonto(p.x, p.y) + acima, -p.y);
  const pinos = o.cidades.map((c) => ({ ...c, ponto: ancora(c, 40) }));
  const praias = o.praias.map((p) => ({ ...p, ponto: ancora(p, 20) }));

  const camera = new PerspectiveCamera(40, 1, 50, 400000);
  const raio = new Vector3();
  const proj = new Vector3();
  const emPe = () => camera.aspect < 0.9;
  // em pé, a costa de Arraial a Búzios fica na vertical da tela; deitado, vista do mar, com as praias de frente
  const rumoBase = () => (emPe() ? graus(30) : graus(-35));

  function posicionar(p: Pose, rumo: number, inc: number) {
    const s = Math.sin(inc) * p.dist;
    camera.position.set(p.x - Math.sin(rumo) * s, Math.cos(inc) * p.dist, p.z + Math.cos(rumo) * s);
    camera.lookAt(p.x, 0, p.z);
    // plano de corte acompanha a distância: sem listras entre o terreno e o entorno
    camera.near = Math.max(20, p.dist * 0.02);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /** Onde o raio que passa por um ponto da tela (-1 a 1) toca o chão; nulo se ele vai para o céu. */
  function chao(nx: number, ny: number): Vector3 | null {
    raio.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
    if (raio.y > -0.05) return null;
    const t = -camera.position.y / raio.y;
    return new Vector3(camera.position.x + raio.x * t, 0, camera.position.z + raio.z * t);
  }

  /** Os quatro cantos da tela caem dentro das fotos? */
  function cobre() {
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = chao(nx, ny);
      if (!p) return false;
      if (p.x < E.x0 + MARGEM || p.x > E.x1 - MARGEM || -p.z < E.y0 + MARGEM || -p.z > E.y1 - MARGEM) return false;
    }
    return true;
  }

  /** Posiciona e, se os cantos saírem das fotos, endireita a câmera até caberem; devolve a inclinação usada. */
  function posicionarSeguro(p: Pose, rumo: number, inc: number) {
    posicionar(p, rumo, inc);
    if (cobre()) return inc;
    let baixo = 0;
    let alto = inc;
    for (let k = 0; k < 9; k++) {
      const meio = (baixo + alto) / 2;
      posicionar(p, rumo, meio);
      if (cobre()) baixo = meio;
      else alto = meio;
    }
    posicionar(p, rumo, baixo);
    return baixo;
  }

  /** Acha alvo e distância para que todos os pontos caibam na área da tela (coordenadas de -1 a 1). */
  function enquadrar(pontos: Vector3[], incDesejada: number, area: Area, distInicial: number): Pose {
    const rumo = rumoBase();
    let x = pontos.reduce((s, p) => s + p.x, 0) / pontos.length;
    let z = pontos.reduce((s, p) => s + p.z, 0) / pontos.length;
    let dist = distInicial;
    let inc = incDesejada;
    for (let it = 0; it < 16; it++) {
      // o enquadramento já conta com a câmera endireitada pelas bordas das fotos
      inc = posicionarSeguro({ x, z, dist, inc: incDesejada, rumo }, rumo, incDesejada);
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of pontos) {
        proj.copy(p).project(camera);
        minX = Math.min(minX, proj.x);
        maxX = Math.max(maxX, proj.x);
        minY = Math.min(minY, proj.y);
        maxY = Math.max(maxY, proj.y);
      }
      const a = chao((minX + maxX) / 2, (minY + maxY) / 2);
      const b = chao((area.x0 + area.x1) / 2, (area.y0 + area.y1) / 2);
      if (a && b) {
        x += a.x - b.x;
        z += a.z - b.z;
      }
      const escala = Math.max((maxX - minX) / (area.x1 - area.x0), (maxY - minY) / (area.y1 - area.y0));
      dist *= limitar(escala, 0.6, 1.6);
    }
    return { x, z, dist, inc, rumo };
  }

  const pontosGerais = pinos.map((p) => p.ponto);
  function poseGeral(): Pose {
    return enquadrar(pontosGerais, graus(36), { x0: -0.78, x1: 0.78, y0: -0.72, y1: 0.58 }, 40000);
  }
  function poseCidade(id: string): Pose {
    const pino = pinos.find((p) => p.id === id)!;
    const pontos = [pino.ponto, ...praias.filter((p) => p.cidade === id).map((p) => p.ponto)];
    // em pé, o cartão da cidade ocupa a parte de baixo; deitado, o lado esquerdo
    const area = emPe() ? { x0: -0.78, x1: 0.78, y0: -0.3, y1: 0.8 } : { x0: -0.16, x1: 0.84, y0: -0.7, y1: 0.66 };
    return enquadrar(pontos, graus(emPe() ? 50 : 54), area, 10000);
  }

  let cidadeAtual: string | null = null;
  let atual: Pose;
  let de: Pose;
  let para: Pose;
  let inicioVoo = 0;
  const reduzir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const arraste = { rumo: 0, inc: 0 };
  let giro = { rumo: 0, inc: 0 };
  let sujo = true;

  function aplicar(p: Pose) {
    posicionarSeguro(p, p.rumo + arraste.rumo + giro.rumo, limitar(p.inc + arraste.inc + giro.inc, 0.05, 1.2));
  }

  function redimensionar() {
    const w = Math.max(1, o.palco.clientWidth);
    const h = Math.max(1, o.palco.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = emPe() ? 50 : 40;
    camera.updateProjectionMatrix();
    para = cidadeAtual ? poseCidade(cidadeAtual) : poseGeral();
    if (!inicioVoo) atual = para;
    sujo = true;
  }
  redimensionar();
  atual = para!;
  de = atual;

  // arrastar gira e inclina de leve; no celular, o gesto vertical continua rolando a página (touch-action: pan-y)
  let ponteiro: { x: number; y: number } | null = null;
  const descer = (e: PointerEvent) => {
    ponteiro = { x: e.clientX, y: e.clientY };
  };
  const mover = (e: PointerEvent) => {
    if (!ponteiro) return;
    arraste.rumo = limitar(arraste.rumo - (e.clientX - ponteiro.x) * 0.003, -0.45, 0.45);
    arraste.inc = limitar(arraste.inc + (e.clientY - ponteiro.y) * 0.0015, -0.15, 0.15);
    ponteiro = { x: e.clientX, y: e.clientY };
    sujo = true;
  };
  const soltar = () => {
    ponteiro = null;
  };
  o.canvas.addEventListener('pointerdown', descer);
  window.addEventListener('pointermove', mover);
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);

  // rótulos: posição na tela e, para as praias, sem encostar uma na outra
  const elPino = new Map(pinos.map((p) => [p.id, o.palco.querySelector<HTMLElement>(`[data-pino="${p.id}"]`)]));
  const elPraia = new Map(praias.map((p) => [p.id, o.palco.querySelector<HTMLElement>(`[data-praia="${CSS.escape(p.id)}"]`)]));
  function noTela(p: Vector3, w: number, h: number) {
    proj.copy(p).project(camera);
    return { x: ((proj.x + 1) / 2) * w, y: ((1 - proj.y) / 2) * h, frente: proj.z < 1 };
  }
  /** Onde o nome da praia fica em cada lado do ponto (a bolinha do nome fica sobre a praia). */
  const LADOS = ['cima', 'baixo', 'direita', 'esquerda'] as const;
  function caixaRotulo(lado: (typeof LADOS)[number], x: number, y: number, lw: number, lh: number): Area {
    if (lado === 'cima') return { x0: x - lw / 2 - 3, x1: x + lw / 2 + 3, y0: y - lh - 10, y1: y + 4 };
    if (lado === 'baixo') return { x0: x - lw / 2 - 3, x1: x + lw / 2 + 3, y0: y - 4, y1: y + lh + 10 };
    if (lado === 'direita') return { x0: x - 4, x1: x + lw + 12, y0: y - lh / 2 - 3, y1: y + lh / 2 + 3 };
    return { x0: x - lw - 12, x1: x + 4, y0: y - lh / 2 - 3, y1: y + lh / 2 + 3 };
  }

  function rotular() {
    const w = o.palco.clientWidth;
    const h = o.palco.clientHeight;
    // o cartão da cidade, a dica e os pinos ocupam o lugar primeiro; os nomes das praias desviam deles
    const ocupados: Area[] = [];
    const base = o.palco.getBoundingClientRect();
    for (const seletor of ['.mapa-cartao', '.mapa-dica']) {
      const r = o.palco.querySelector(seletor)?.getBoundingClientRect();
      if (r) ocupados.push({ x0: r.left - base.left - 4, x1: r.right - base.left + 4, y0: r.top - base.top - 4, y1: r.bottom - base.top + 4 });
    }
    for (const p of pinos) {
      const el = elPino.get(p.id);
      if (!el) continue;
      const t = noTela(p.ponto, w, h);
      el.style.setProperty('--px', `${t.x.toFixed(1)}px`);
      el.style.setProperty('--py', `${t.y.toFixed(1)}px`);
      const visivel = t.frente && t.x > 8 && t.x < w - 8 && t.y > 8 && t.y < h - 8;
      el.dataset.visivel = visivel ? 'sim' : 'nao';
      if (visivel) {
        const pw = el.offsetWidth;
        const ph = el.offsetHeight;
        ocupados.push({ x0: t.x - pw / 2 - 4, x1: t.x + pw / 2 + 4, y0: t.y - ph - 2, y1: t.y + 9 });
      }
    }
    const pousou = !inicioVoo;
    for (const p of praias) {
      const el = elPraia.get(p.id);
      if (!el) continue;
      const t = noTela(p.ponto, w, h);
      el.style.setProperty('--px', `${t.x.toFixed(1)}px`);
      el.style.setProperty('--py', `${t.y.toFixed(1)}px`);
      // tenta em cima, embaixo, à direita e à esquerda do ponto; sem lugar livre, o nome não aparece
      let lado: (typeof LADOS)[number] | null = null;
      if (pousou && p.cidade === cidadeAtual && t.frente) {
        const lw = el.offsetWidth;
        const lh = el.offsetHeight;
        for (const l of LADOS) {
          const c = caixaRotulo(l, t.x, t.y, lw, lh);
          if (c.x0 < 4 || c.x1 > w - 4 || c.y0 < 4 || c.y1 > h - 4) continue;
          if (ocupados.some((d) => d.x0 < c.x1 && c.x0 < d.x1 && d.y0 < c.y1 && c.y0 < d.y1)) continue;
          ocupados.push(c);
          lado = l;
          break;
        }
      }
      el.dataset.visivel = lado ? 'sim' : 'nao';
      if (lado) el.dataset.lado = lado;
    }
  }

  let ultimo = performance.now();
  function quadro() {
    const agora = performance.now();
    const dt = Math.min(64, agora - ultimo);
    ultimo = agora;
    if (inicioVoo) {
      const t = reduzir ? 1 : Math.min(1, (agora - inicioVoo) / DURACAO);
      const k = suave(t);
      atual = {
        x: de.x + (para.x - de.x) * k,
        z: de.z + (para.z - de.z) * k,
        dist: Math.exp(Math.log(de.dist) + (Math.log(para.dist) - Math.log(de.dist)) * k),
        inc: de.inc + (para.inc - de.inc) * k,
        rumo: de.rumo + (para.rumo - de.rumo) * k,
      };
      if (t >= 1) {
        inicioVoo = 0;
        atual = para;
      }
      sujo = true;
    }
    // sem o dedo, o arraste volta devagar para o enquadramento
    if (!ponteiro && (Math.abs(arraste.rumo) > 1e-4 || Math.abs(arraste.inc) > 1e-4)) {
      const f = reduzir ? 0 : Math.pow(0.9, dt / 16);
      arraste.rumo *= f;
      arraste.inc *= f;
      sujo = true;
    }
    if (!sujo) return;
    sujo = false;
    aplicar(atual);
    renderer.render(cena, camera);
    rotular();
  }

  aplicar(atual);
  renderer.compile(cena, camera);
  renderer.render(cena, camera);
  rotular();

  let rodando = false;
  return {
    voar(cidade) {
      cidadeAtual = cidade;
      de = { ...atual };
      para = cidade ? poseCidade(cidade) : poseGeral();
      inicioVoo = performance.now();
      sujo = true;
      // fora da tela (ou antes do primeiro quadro), pousa direto
      if (!rodando) {
        inicioVoo = 0;
        atual = para;
        aplicar(atual);
        renderer.render(cena, camera);
        rotular();
      }
    },
    ativo(sim) {
      if (sim === rodando) return;
      rodando = sim;
      ultimo = performance.now();
      sujo = true;
      renderer.setAnimationLoop(sim ? quadro : null);
    },
    redimensionar,
    inclinar(gama, beta) {
      if (reduzir) return;
      giro = { rumo: limitar(gama / 30, -1, 1) * -0.1, inc: limitar((beta - 45) / 35, -1, 1) * 0.05 };
      sujo = true;
    },
    destruir() {
      renderer.setAnimationLoop(null);
      o.canvas.removeEventListener('pointerdown', descer);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
      cena.traverse((obj) => {
        const m = obj as Mesh;
        m.geometry?.dispose();
        (m.material as { dispose?: () => void } | undefined)?.dispose?.();
      });
      detalhe.dispose();
      fundo.dispose();
      renderer.dispose();
    },
  };
}
