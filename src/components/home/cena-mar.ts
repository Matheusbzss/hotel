/**
 * A cena 3D da página inicial: o mar ao entardecer (ondas de Gerstner, céu calculado, reflexo do sol)
 * e, com a rolagem, a câmera subindo até a vista aérea da Região dos Lagos com os pinos das cidades.
 * Uma cena só, num canvas fixo atrás das seções transparentes. Unidades em metros; x leste, y para cima,
 * z sul (o norte do mapa é -z). Cores em sRGB direto, como o resto do site (design-dna.json).
 */
import {
  BackSide,
  Color,
  ExtrudeGeometry,
  Group,
  LineBasicMaterial,
  LineLoop,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  Shape,
  ShaderMaterial,
  SphereGeometry,
  CylinderGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  Matrix4,
  Plane,
} from 'three';
import dna from '../../../design-dna.json';

export interface Litoral {
  terra: [number, number][][];
}

export interface PinoCena {
  id: string;
  /** Metros a leste e ao norte do centro do mapa. */
  x: number;
  y: number;
}

export interface OpcoesCena {
  canvas: HTMLCanvasElement;
  litoral: Litoral;
  pinos: PinoCena[];
  /** Botões HTML que acompanham os pinos na tela (mesmo id), posicionados dentro da seção do mapa. */
  rotulos: () => Map<string, HTMLElement>;
  janelaMapa: HTMLElement | null;
  celular: boolean;
}

export interface Cena {
  definirProgresso(t: number): void;
  destacar(id: string | null): void;
  inclinar(gama: number, beta: number): void;
  ativo(sim: boolean): void;
  redimensionar(): void;
  destruir(): void;
}

// todas as cores vêm de design-dna.json, a fonte única do design system
const CEU = dna.design_system.color.sky_and_sea;
const hex = (h: string) => new Color(h);
const COR = {
  topo: hex(CEU.sky_top),
  meio: hex(CEU.sky_mid),
  horizonte: hex(CEU.sky_glow),
  sol: hex(CEU.sun_core),
  brilho: hex(CEU.sun),
  marPerto: hex(CEU.sea_near),
  marLonge: hex(CEU.sea_far),
  terra: hex(CEU.land),
  terraSombra: hex(CEU.land_shadow),
  pino: hex(dna.design_system.color.accent.hex),
};
// as cores acima são valores sRGB usados direto no shader (o canvas mostra o que o shader escreve)
const srgb = (c: Color) => new Vector3(...c.clone().convertLinearToSRGB().toArray());

/** Sol baixo a oés-sudoeste, como no fim da tarde de verão na região. */
const AZIMUTE = (255 * Math.PI) / 180;
const ELEVACAO = (3.5 * Math.PI) / 180;
const SOL = new Vector3(
  Math.sin(AZIMUTE) * Math.cos(ELEVACAO),
  Math.sin(ELEVACAO),
  -Math.cos(AZIMUTE) * Math.cos(ELEVACAO),
).normalize();

const CEU_GLSL = /* glsl */ `
  uniform vec3 uTopo; uniform vec3 uMeio; uniform vec3 uHorizonte; uniform vec3 uSolCor; uniform vec3 uBrilho; uniform vec3 uSol;
  vec3 ceu(vec3 d) {
    float h = clamp(d.y, -0.05, 1.0);
    vec3 c = mix(uHorizonte, uMeio, smoothstep(0.0, 0.16, h));
    c = mix(c, uTopo, smoothstep(0.12, 0.6, h));
    float s = max(dot(normalize(d), uSol), 0.0);
    c = mix(c, uBrilho, pow(s, 6.0) * 0.55 * (1.0 - smoothstep(0.0, 0.35, h)));
    c += uSolCor * pow(s, 900.0) * 1.4;
    c = mix(c, uSolCor, smoothstep(0.99955, 0.9998, s));
    return c;
  }
`;

const ONDAS_GLSL = /* glsl */ `
  uniform float uTempo; uniform float uOndas; uniform vec3 uToque;
  // direção (x,z), comprimento de onda (m), inclinação
  const vec4 O1 = vec4(0.92, 0.38, 64.0, 0.15);
  const vec4 O2 = vec4(0.55, 0.83, 33.0, 0.13);
  const vec4 O3 = vec4(-0.35, 0.94, 17.0, 0.11);
  const vec4 O4 = vec4(0.86, -0.51, 9.5, 0.09);
  void gerstner(vec4 o, vec2 p, float dist, inout vec3 desloc, inout vec3 nrm) {
    vec2 d = normalize(o.xy);
    float k = 6.28318 / o.z;
    // ondas curtas somem com a distância, onde a malha já não tem pontos para desenhá-las
    float a = o.w / k * clamp(1.0 - (dist - o.z * 3.0) / (o.z * 6.0), 0.0, 1.0);
    float f = k * dot(d, p) - sqrt(9.8 * k) * uTempo;
    float c = cos(f), s = sin(f);
    desloc += vec3(d.x * a * c * 0.8, a * s, d.y * a * c * 0.8);
    nrm += vec3(-d.x * k * a * c, -0.8 * k * a * s, -d.y * k * a * c);
  }
  vec3 ondas(vec2 p, float dist, out vec3 nrmSaida) {
    vec3 desloc = vec3(0.0);
    vec3 n = vec3(0.0);
    gerstner(O1, p, dist, desloc, n);
    gerstner(O2, p, dist, desloc, n);
    gerstner(O3, p, dist, desloc, n);
    gerstner(O4, p, dist, desloc, n);
    float idade = uTempo - uToque.z;
    if (idade > 0.0 && idade < 4.0) {
      float r = distance(p, uToque.xy);
      float amp = 0.45 * exp(-idade * 1.1) * exp(-r * 0.035);
      float fase = r * 0.7 - idade * 5.5;
      desloc.y += amp * sin(fase);
      vec2 dir = r > 0.001 ? (p - uToque.xy) / r : vec2(0.0);
      n.xz -= dir * amp * 0.7 * cos(fase);
    }
    nrmSaida = normalize(vec3(n.x * uOndas, 1.0 + n.y * uOndas, n.z * uOndas));
    return desloc * uOndas;
  }
`;

function materialMar() {
  return new ShaderMaterial({
    uniforms: {
      uTempo: { value: 0 },
      uOndas: { value: 1 },
      uToque: { value: new Vector3(0, 0, -100) },
      uTopo: { value: srgb(COR.topo) },
      uMeio: { value: srgb(COR.meio) },
      uHorizonte: { value: srgb(COR.horizonte) },
      uSolCor: { value: srgb(COR.sol) },
      uBrilho: { value: srgb(COR.brilho) },
      uSol: { value: SOL },
      uPerto: { value: srgb(COR.marPerto) },
      uLonge: { value: srgb(COR.marLonge) },
      uNevoa: { value: 0.00009 },
      uAereo: { value: 0 },
    },
    vertexShader: /* glsl */ `
      ${ONDAS_GLSL}
      varying vec3 vMundo; varying vec3 vNormal;
      void main() {
        vec4 m = modelMatrix * vec4(position, 1.0);
        vec3 n;
        vec3 d = ondas(m.xz, distance(m.xz, cameraPosition.xz), n);
        m.xyz += d;
        vMundo = m.xyz; vNormal = n;
        gl_Position = projectionMatrix * viewMatrix * m;
      }
    `,
    fragmentShader: /* glsl */ `
      ${CEU_GLSL}
      uniform vec3 uPerto; uniform vec3 uLonge; uniform float uNevoa; uniform float uTempo; uniform float uOndas; uniform float uAereo;
      varying vec3 vMundo; varying vec3 vNormal;
      float ruido(vec2 p) { return sin(p.x) * sin(p.y); }
      vec2 marola(vec2 q, float t) {
        return vec2(ruido(q + vec2(t, 0.0)) + 0.5 * ruido(q * 2.3 - vec2(0.0, t * 1.3)), ruido(q.yx * 1.7 + t) + 0.5 * ruido(q * 3.1 + t));
      }
      void main() {
        vec3 v = cameraPosition - vMundo;
        float dist = length(v);
        v /= dist;
        // marolas em três escalas (5 m, 1,8 m e 0,6 m), que somem com a distância
        float t = uTempo * 0.9;
        vec2 det = marola(vMundo.xz * 0.35, t) * 0.55 + marola(vMundo.xz * 1.1, t * 1.6) * 0.3 + marola(vMundo.xz * 3.4, t * 2.4) * 0.15;
        float perto = (1.0 - smoothstep(20.0, 650.0, dist)) * uOndas;
        vec3 n = normalize(vNormal + vec3(det.x, 0.0, det.y) * 0.22 * perto);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        vec3 fundo = mix(uPerto, uLonge, smoothstep(0.0, 4000.0, dist) * (1.0 - uAereo));
        // visto do alto o mar fica escuro, como no mapa: quase sem reflexo do céu
        vec3 cor = mix(fundo, ceu(r), clamp(fres, 0.0, 1.0) * (1.0 - 0.88 * uAereo));
        float s = max(dot(r, uSol), 0.0);
        cor += uSolCor * (pow(s, 1400.0) * 6.0 + pow(s, 120.0) * 0.28) * (1.0 - uAereo);
        float nevoa = 1.0 - exp(-dist * uNevoa);
        vec3 horiz = ceu(normalize(vec3(-v.x, 0.012, -v.z)));
        gl_FragColor = vec4(mix(cor, horiz, clamp(nevoa, 0.0, 1.0)), 1.0);
      }
    `,
  });
}

function materialCeu() {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: {
      uTopo: { value: srgb(COR.topo) },
      uMeio: { value: srgb(COR.meio) },
      uHorizonte: { value: srgb(COR.horizonte) },
      uSolCor: { value: srgb(COR.sol) },
      uBrilho: { value: srgb(COR.brilho) },
      uSol: { value: SOL },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      ${CEU_GLSL}
      varying vec3 vDir;
      void main() { gl_FragColor = vec4(ceu(normalize(vDir)), 1.0); }
    `,
  });
}

function materialTerra() {
  return new ShaderMaterial({
    transparent: true,
    uniforms: {
      uCor: { value: srgb(COR.terra) },
      uSombra: { value: srgb(COR.terraSombra) },
      uSol: { value: SOL },
      uAlpha: { value: 0 },
      uLuz: { value: 0.6 },
      uHorizonte: { value: srgb(COR.horizonte) },
      uMeio: { value: srgb(COR.meio) },
      uNevoa: { value: 0.000012 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal; varying vec3 vMundo;
      void main() {
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 m = modelMatrix * vec4(position, 1.0);
        vMundo = m.xyz;
        gl_Position = projectionMatrix * viewMatrix * m;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCor; uniform vec3 uSombra; uniform vec3 uSol; uniform float uAlpha; uniform float uLuz;
      uniform vec3 uHorizonte; uniform vec3 uMeio; uniform float uNevoa;
      varying vec3 vNormal; varying vec3 vMundo;
      void main() {
        float dif = max(dot(normalize(vNormal), normalize(uSol + vec3(0.0, 0.6, 0.0))), 0.0);
        vec3 cor = mix(uSombra, uCor, clamp(uLuz + dif * 0.5, 0.0, 1.0));
        float dist = length(cameraPosition - vMundo);
        float nevoa = 1.0 - exp(-dist * uNevoa);
        cor = mix(cor, mix(uHorizonte, uMeio, 0.5), clamp(nevoa, 0.0, 0.75));
        gl_FragColor = vec4(cor, uAlpha);
      }
    `,
  });
}

const suave = (t: number) => t * t * (3 - 2 * t);
const entre = (a: number, b: number, t: number) => a + (b - a) * t;

export function criarCena(o: OpcoesCena): Cena | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas: o.canvas, antialias: !o.celular, powerPreference: 'high-performance', alpha: false });
  } catch {
    return null;
  }
  let razao = Math.min(window.devicePixelRatio || 1, o.celular ? 1.5 : 2);
  renderer.setPixelRatio(razao);

  const cena = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.5, 600000);

  const ceu = new Mesh(new SphereGeometry(200000, 32, 16), materialCeu());
  ceu.renderOrder = -1;
  ceu.frustumCulled = false;
  cena.add(ceu);

  const segmentos = o.celular ? 160 : 224;
  const marMat = materialMar();
  const marGeo = new PlaneGeometry(1, 1, segmentos, segmentos).rotateX(-Math.PI / 2);
  // malha mais densa perto da câmera (centro) e mais aberta no horizonte
  const pos = marGeo.attributes.position;
  const k = 4;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * 2;
    const z = pos.getZ(i) * 2;
    const r = Math.hypot(x, z);
    if (r === 0) continue;
    const novo = (Math.exp(k * r) - 1) / (Math.exp(k) - 1);
    pos.setXYZ(i, (x / r) * novo * 0.5, 0, (z / r) * novo * 0.5);
  }
  const mar = new Mesh(marGeo, marMat);
  mar.frustumCulled = false;
  cena.add(mar);

  // terra: o litoral do OpenStreetMap em placa baixa, que aparece conforme a câmera sobe
  const terraMat = materialTerra();
  const terra = new Group();
  const contornoMat = new LineBasicMaterial({ color: dna.design_system.color.neutral.scale[1], transparent: true, opacity: 0 });
  for (const anel of o.litoral.terra) {
    const forma = new Shape(anel.map(([x, y]) => new Vector2(x, y)));
    const geo = new ExtrudeGeometry(forma, { depth: 60, bevelEnabled: false }).rotateX(-Math.PI / 2);
    terra.add(new Mesh(geo, terraMat));
    const pontos = new Float32Array(anel.flatMap(([x, y]) => [x, 62, -y]));
    const linha = new BufferGeometry().setAttribute('position', new Float32BufferAttribute(pontos, 3));
    terra.add(new LineLoop(linha, contornoMat));
  }
  cena.add(terra);

  // pinos: feixe e cabeça dourados nas cidades
  const pinos = new Map<string, { grupo: Group; topo: Vector3 }>();
  const pinoMat = new MeshBasicMaterial({ color: COR.pino, transparent: true, opacity: 0 });
  const feixe = new CylinderGeometry(70, 70, 1800, 12).translate(0, 900, 0);
  const cabeca = new SphereGeometry(320, 20, 12).translate(0, 1950, 0);
  for (const p of o.pinos) {
    const g = new Group();
    g.position.set(p.x, 60, -p.y);
    g.add(new Mesh(feixe, pinoMat), new Mesh(cabeca, pinoMat));
    cena.add(g);
    pinos.set(p.id, { grupo: g, topo: new Vector3(p.x, 60 + 2400, -p.y) });
  }

  // poses da câmera: no mar, do convés de um barco, com o sol à direita (longe do texto); e no alto,
  // com Arraial embaixo e Búzios em cima da tela. Dependem da proporção da tela: recalculadas no redimensionar.
  const posMar = new Vector3(6000, 5, 12000);
  const posMapa = new Vector3();
  const alvoMapa = new Vector3();
  const qMar = new Quaternion();
  const qMapa = new Quaternion();
  const cima = new Vector3(0, 1, 0);
  function calcularPoses() {
    const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
    const desvio = Math.atan(0.42 * Math.tan(hfov / 2));
    const direcao = new Vector3(SOL.x, 0, SOL.z).normalize().applyAxisAngle(cima, desvio);
    const olharMar = posMar.clone().add(direcao.multiplyScalar(100)).add(new Vector3(0, -100 * Math.tan((8 * Math.PI) / 180), 0));
    qMar.setFromRotationMatrix(new Matrix4().lookAt(posMar, olharMar, cima));
    const emPe = camera.aspect < 0.8;
    const rumo = (30 * Math.PI) / 180;
    const inclinacao = (36 * Math.PI) / 180;
    const dist = emPe ? 41000 : 39000;
    // em pé, o alvo sobe para o norte: a legenda do mapa ocupa o topo da tela
    const norte = emPe ? 4400 : -600;
    alvoMapa.set(5400 + Math.sin(rumo) * norte, 0, 80 - Math.cos(rumo) * norte);
    posMapa
      .copy(alvoMapa)
      .add(new Vector3(-Math.sin(rumo) * Math.sin(inclinacao), Math.cos(inclinacao), Math.cos(rumo) * Math.sin(inclinacao)).multiplyScalar(dist));
    qMapa.setFromRotationMatrix(new Matrix4().lookAt(posMapa, alvoMapa, cima));
  }

  let progresso = 0;
  let alvoProgresso = 0;
  let destaque: string | null = null;
  let olhar = { x: 0, y: 0 };
  let olharAlvo = { x: 0, y: 0 };
  const inicio = performance.now();
  const raio = new Raycaster();
  const planoMar = new Plane(new Vector3(0, 1, 0), 0);
  const ponto = new Vector3();
  const qOlhar = new Quaternion();
  const eixoY = new Vector3(0, 1, 0);
  const eixoX = new Vector3(1, 0, 0);
  const qTmp = new Quaternion();
  const proj = new Vector3();

  function redimensionar() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // tela em pé: um pouco mais de ângulo para a faixa do litoral caber
    camera.fov = w / h < 0.8 ? 56 : 46;
    camera.updateProjectionMatrix();
    calcularPoses();
  }
  redimensionar();

  function posicionarCamera() {
    const t = suave(Math.min(1, Math.max(0, progresso)));
    const lnAlt = entre(Math.log(posMar.y), Math.log(posMapa.y), t);
    camera.position.set(entre(posMar.x, posMapa.x, t), Math.exp(lnAlt), entre(posMar.z, posMapa.z, t));
    camera.quaternion.slerpQuaternions(qMar, qMapa, t);
    // toque e giroscópio só mexem a câmera perto do mar
    const livre = 1 - t;
    qOlhar.setFromAxisAngle(eixoY, -olhar.x * 0.11 * livre);
    qTmp.setFromAxisAngle(eixoX, -olhar.y * 0.05 * livre);
    camera.quaternion.multiply(qOlhar).multiply(qTmp);
    return t;
  }

  let quadros = 0;
  let acumulado = 0;
  let ultimo = performance.now();
  function quadro() {
    const agora = performance.now();
    const dt = agora - ultimo;
    ultimo = agora;
    // se o aparelho sofrer, a resolução cai uma vez
    if (razao > 1) {
      quadros++;
      acumulado += dt;
      if (quadros === 90) {
        if (acumulado / quadros > 30) {
          razao = 1;
          renderer.setPixelRatio(1);
          redimensionar();
        }
        quadros = 0;
        acumulado = 0;
      }
    }
    progresso += (alvoProgresso - progresso) * Math.min(1, dt / 120);
    olhar.x += (olharAlvo.x - olhar.x) * Math.min(1, dt / 220);
    olhar.y += (olharAlvo.y - olhar.y) * Math.min(1, dt / 220);
    const t = posicionarCamera();
    const tempo = (agora - inicio) / 1000;
    const alt = camera.position.y;
    // plano de corte perto acompanha a altura: sem isso, a terra e o mar brigam no alto (listras)
    const perto = Math.min(800, Math.max(0.3, alt * 0.02));
    if (Math.abs(perto - camera.near) > camera.near * 0.1) {
      camera.near = perto;
      camera.updateProjectionMatrix();
    }
    const aereo = Math.min(1, Math.max(0, (alt - 800) / 7200));
    marMat.uniforms.uTempo.value = tempo;
    marMat.uniforms.uOndas.value = 1 - Math.min(1, Math.max(0, (alt - 40) / 900));
    marMat.uniforms.uAereo.value = aereo;
    marMat.uniforms.uNevoa.value = 0.00009 * (1 - 0.96 * aereo);
    terraMat.uniforms.uNevoa.value = 0.000012 * (1 - 0.7 * aereo);
    const lado = Math.min(420000, Math.max(2600, alt * 24));
    mar.scale.set(lado, 1, lado);
    mar.position.set(camera.position.x, 0, camera.position.z);
    ceu.position.copy(camera.position);
    const vis = Math.min(1, Math.max(0, (alt - 250) / 2500));
    terraMat.uniforms.uAlpha.value = vis;
    terraMat.uniforms.uLuz.value = 0.45 + 0.4 * t;
    contornoMat.opacity = 0.55 * Math.min(1, Math.max(0, (t - 0.55) / 0.35));
    pinoMat.opacity = Math.min(1, Math.max(0, (t - 0.6) / 0.3));
    for (const [id, p] of pinos) {
      const alvo = id === destaque ? 1.45 : 1;
      p.grupo.scale.setScalar(p.grupo.scale.x + (alvo - p.grupo.scale.x) * Math.min(1, dt / 160));
    }
    renderer.render(cena, camera);
    // os botões das cidades acompanham os pinos
    const rotulos = o.rotulos();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const caixa = o.janelaMapa?.getBoundingClientRect();
    const topo = caixa?.top ?? 0;
    const fundo = caixa?.bottom ?? h;
    for (const [id, p] of pinos) {
      const el = rotulos.get(id);
      if (!el) continue;
      proj.copy(p.topo).project(camera);
      const y = ((1 - proj.y) / 2) * h;
      const dentro = proj.z < 1 && t > 0.75 && y > topo + 8 && y < fundo - 8;
      el.style.setProperty('--px', `${((proj.x + 1) / 2) * w}px`);
      el.style.setProperty('--py', `${y - topo}px`);
      el.dataset.visivel = dentro ? 'sim' : 'nao';
    }
  }

  function tocar(e: PointerEvent) {
    if (progresso > 0.3) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    raio.setFromCamera(new Vector2((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1), camera);
    if (raio.ray.intersectPlane(planoMar, ponto)) {
      marMat.uniforms.uToque.value.set(ponto.x, ponto.z, (performance.now() - inicio) / 1000);
    }
  }
  function mover(e: PointerEvent) {
    olharAlvo = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
  }
  const alvoToque = document.querySelector<HTMLElement>('[data-mar-toque]');
  alvoToque?.addEventListener('pointerdown', tocar);
  alvoToque?.addEventListener('pointermove', mover);

  // compila os shaders e envia a terra e os pinos à placa de vídeo já no carregamento, por baixo da imagem parada:
  // assim a subida até o mapa não engasga na primeira vez que o litoral aparece
  renderer.compile(cena, camera);
  renderer.render(cena, camera);

  let rodando = false;
  return {
    definirProgresso(t) {
      alvoProgresso = t;
    },
    destacar(id) {
      destaque = id;
    },
    inclinar(gama, beta) {
      olharAlvo = { x: Math.max(-1, Math.min(1, gama / 25)), y: Math.max(-1, Math.min(1, (beta - 50) / 30)) };
    },
    ativo(sim) {
      if (sim === rodando) return;
      rodando = sim;
      ultimo = performance.now();
      renderer.setAnimationLoop(sim ? quadro : null);
    },
    redimensionar,
    destruir() {
      renderer.setAnimationLoop(null);
      alvoToque?.removeEventListener('pointerdown', tocar);
      alvoToque?.removeEventListener('pointermove', mover);
      cena.traverse((obj) => {
        const m = obj as Mesh;
        m.geometry?.dispose();
        const mat = m.material as { dispose?: () => void } | undefined;
        mat?.dispose?.();
      });
      renderer.dispose();
    },
  };
}
