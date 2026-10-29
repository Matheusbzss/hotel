import type { Cena, Cidade } from '@/data/passeios';

/**
 * Cenas desenhadas em SVG (cores chapadas da marca) usadas enquanto um passeio
 * não tem fotos em src/data/passeios.ts. Proporção 4:3.
 */

const C = {
  tinta: '#0B3B5C',
  oceano: '#0A5C8A',
  oceanoMedio: '#0E86AE',
  turquesa: '#14B8C6',
  turquesaClara: '#7FE3EA',
  espuma: '#E6FAFB',
  sol: '#FFC83D',
  solClaro: '#FFE29A',
  coral: '#FF7A66',
  coralEscuro: '#E85A45',
  areia: '#F3E3C3',
  areiaEscura: '#E7CF9F',
  branco: '#FFFFFF',
  verde: '#2F9E77',
  verdeEscuro: '#1F7A5C',
};

type Paleta = { ceu: string; sol: string; morro: string; mar: string; mar2: string; mar3: string };

const PALETAS: Record<Cidade, Paleta> = {
  buzios: { ceu: C.coral, sol: C.sol, morro: C.coralEscuro, mar: C.turquesa, mar2: C.oceanoMedio, mar3: C.oceano },
  'arraial-do-cabo': { ceu: C.turquesaClara, sol: C.sol, morro: C.verde, mar: C.turquesa, mar2: '#10A3B4', mar3: C.oceanoMedio },
  'cabo-frio': { ceu: C.solClaro, sol: C.coral, morro: C.areiaEscura, mar: C.turquesa, mar2: C.oceanoMedio, mar3: C.oceano },
  'rio-de-janeiro': { ceu: '#BFE9F7', sol: C.sol, morro: C.verdeEscuro, mar: C.oceanoMedio, mar2: C.oceano, mar3: C.tinta },
};

const onda = (y: number, amp = 10, passo = 100) => {
  let d = `M0 ${y}`;
  for (let x = 0; x < 800; x += passo) d += ` Q${x + passo / 4} ${y - amp} ${x + passo / 2} ${y} T${x + passo} ${y}`;
  return `${d} V600 H0Z`;
};

function Coqueiro({ x, y, s = 1, cor = C.tinta }: { x: number; y: number; s?: number; cor?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={cor}>
      <path d="M-6 0 C-2 -60 6 -120 22 -168 L32 -165 C18 -118 10 -60 8 0Z" />
      <path d="M26 -170 C60 -196 98 -186 120 -150 C92 -170 62 -172 30 -160Z" />
      <path d="M26 -170 C44 -214 84 -228 112 -214 C80 -212 52 -196 32 -164Z" />
      <path d="M26 -170 C-6 -190 -44 -180 -64 -146 C-34 -166 -6 -168 24 -160Z" />
      <path d="M26 -170 C6 -214 -32 -226 -58 -212 C-26 -210 4 -196 24 -164Z" />
      <path d="M26 -170 C28 -204 40 -230 60 -244 C46 -222 38 -198 32 -168Z" />
      <circle cx="22" cy="-160" r="7" />
      <circle cx="34" cy="-158" r="7" />
    </g>
  );
}

function Fundo({ p, terra = false, solX = 560, solY = 190 }: { p: Paleta; terra?: boolean; solX?: number; solY?: number }) {
  return (
    <>
      <rect width="800" height="600" fill={p.ceu} />
      <circle cx={solX} cy={solY} r="78" fill={p.sol} />
      <path d="M0 330 C70 292 150 270 230 292 C300 312 340 286 410 300 L410 336 L0 336Z" fill={p.morro} />
      <path d="M470 318 C540 286 620 268 700 286 C746 296 780 292 800 296 V336 H470Z" fill={p.morro} />
      <rect y="330" width="800" height="270" fill={p.mar} />
      {!terra && (
        <>
          <path d={onda(410, 9)} fill={p.mar2} />
          <path d={onda(500, 11, 160)} fill={p.mar3} />
        </>
      )}
    </>
  );
}

function Escuna() {
  return (
    <g>
      <ellipse cx="405" cy="474" rx="190" ry="14" fill={C.oceano} opacity="0.5" />
      <path d="M346 236 L346 398 L436 398Z" fill={C.branco} />
      <path d="M452 256 L452 398 L530 398Z" fill={C.branco} />
      <path d="M340 244 L258 412 L338 412Z" fill={C.areia} />
      <rect x="340" y="226" width="7" height="196" fill={C.tinta} />
      <rect x="446" y="248" width="7" height="174" fill={C.tinta} />
      <path d="M347 226 L376 235 L347 244Z" fill={C.coral} />
      <path d="M453 248 L478 256 L453 264Z" fill={C.sol} />
      <rect x="320" y="398" width="150" height="24" fill={C.branco} />
      <path d="M240 420 L570 420 L538 472 L278 472Z" fill={C.tinta} />
      <path d="M252 432 L558 432 L553 442 L258 442Z" fill={C.coral} />
    </g>
  );
}

function Catamara() {
  return (
    <g>
      <ellipse cx="420" cy="476" rx="210" ry="14" fill={C.oceano} opacity="0.5" />
      <path d="M290 416 L600 416 L588 436 L302 436Z" fill={C.espuma} />
      <path d="M232 436 L568 436 L550 466 L250 466Z" fill={C.branco} />
      <path d="M244 448 L556 448 L552 455 L248 455Z" fill={C.tinta} />
      <rect x="290" y="396" width="250" height="22" fill={C.branco} />
      {Array.from({ length: 10 }).map((_, i) => (
        <rect key={i} x={300 + i * 23} y="350" width="23" height="18" fill={i % 2 ? C.branco : C.coral} />
      ))}
      <rect x="302" y="368" width="6" height="30" fill={C.tinta} />
      <rect x="522" y="368" width="6" height="30" fill={C.tinta} />
      <rect x="412" y="200" width="7" height="150" fill={C.tinta} />
      <path d="M419 208 L419 346 L500 346Z" fill={C.branco} />
    </g>
  );
}

function Barco() {
  return (
    <g>
      <ellipse cx="400" cy="472" rx="170" ry="12" fill={C.oceano} opacity="0.5" />
      <rect x="350" y="340" width="120" height="70" fill={C.branco} />
      <rect x="362" y="354" width="28" height="22" fill={C.turquesa} />
      <rect x="402" y="354" width="28" height="22" fill={C.turquesa} />
      <rect x="440" y="354" width="20" height="22" fill={C.turquesa} />
      <rect x="340" y="326" width="140" height="16" fill={C.sol} />
      <rect x="404" y="270" width="6" height="56" fill={C.tinta} />
      <path d="M410 272 L440 280 L410 288Z" fill={C.coral} />
      <path d="M250 408 L560 408 Q548 452 520 470 L290 470 Q262 446 250 408Z" fill={C.coral} />
      <path d="M254 408 L558 408 L555 420 L258 420Z" fill={C.branco} />
    </g>
  );
}

function Lancha() {
  return (
    <g>
      <path d="M560 452 L800 420 L800 470 L590 470Z" fill={C.espuma} />
      <path d="M600 450 L800 444 L800 456Z" fill={C.branco} />
      <path d="M210 444 L560 444 Q600 440 612 418 L300 418 Q240 424 210 444Z" fill={C.branco} />
      <path d="M232 438 L566 438 Q590 436 596 428 L292 428Z" fill={C.tinta} />
      <path d="M330 418 L380 384 L470 384 L470 418Z" fill={C.tinta} />
      <path d="M346 414 L384 390 L420 390 L420 414Z" fill={C.turquesaClara} />
      <path d="M214 446 L560 446 Q520 470 470 474 L270 474 Q230 466 214 446Z" fill={C.oceano} opacity="0.45" />
    </g>
  );
}

function JetSki() {
  return (
    <g>
      <path d="M470 430 C540 360 640 350 720 380 C650 380 580 396 520 440Z" fill={C.espuma} />
      <path d="M500 444 C580 410 680 410 780 430 C700 436 600 446 520 456Z" fill={C.branco} />
      <path d="M280 440 L500 440 Q530 436 540 418 L340 412 Q300 420 280 440Z" fill={C.coral} />
      <path d="M300 444 L520 444 L506 458 L318 458Z" fill={C.tinta} />
      <path d="M410 412 L440 380 L452 384 L428 414Z" fill={C.tinta} />
      <circle cx="402" cy="330" r="16" fill={C.tinta} />
      <path d="M392 346 L418 346 L432 404 L400 412 L384 396Z" fill={C.sol} />
      <path d="M400 410 L436 412 L452 432 L420 434Z" fill={C.tinta} />
      <path d="M414 360 L446 382 L440 390 L408 372Z" fill={C.sol} />
    </g>
  );
}

function Duna({ cor = C.areia }: { cor?: string }) {
  return (
    <>
      <path d="M0 430 C140 384 300 392 450 430 C600 466 700 450 800 420 V600 H0Z" fill={cor} />
      <path d="M0 520 C160 492 360 500 520 528 C640 548 720 540 800 520 V600 H0Z" fill={C.areiaEscura} />
    </>
  );
}

function Roda({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={C.tinta} />
      <circle cx={x} cy={y} r={r * 0.42} fill={C.sol} />
    </g>
  );
}

function Buggy() {
  return (
    <g>
      <Duna />
      <Coqueiro x={110} y={440} s={0.9} />
      <ellipse cx="420" cy="508" rx="190" ry="12" fill={C.areiaEscura} />
      <path d="M260 452 L300 400 L520 400 L580 440 L580 470 L250 470Z" fill={C.coral} />
      <path d="M318 400 L350 320 L362 322 L332 400Z" fill={C.tinta} />
      <path d="M350 320 L470 320 L478 326 L356 328Z" fill={C.tinta} />
      <path d="M462 322 L490 400 L478 400 L452 326Z" fill={C.tinta} />
      <rect x="300" y="420" width="250" height="14" fill={C.sol} />
      <Roda x={318} y={478} r={42} />
      <Roda x={520} y={478} r={42} />
    </g>
  );
}

function Quadriciclo() {
  return (
    <g>
      <Duna />
      <Coqueiro x={660} y={430} s={0.95} />
      <ellipse cx="400" cy="512" rx="170" ry="12" fill={C.areiaEscura} />
      <path d="M290 430 L330 392 L470 392 L520 430 L510 452 L300 452Z" fill={C.sol} />
      <path d="M360 392 L440 392 L430 372 L370 372Z" fill={C.tinta} />
      <path d="M468 392 L496 346 L506 350 L480 394Z" fill={C.tinta} />
      <rect x="486" y="340" width="40" height="9" fill={C.tinta} />
      <rect x="296" y="420" width="220" height="12" fill={C.coral} />
      <Roda x={318} y={478} r={46} />
      <Roda x={492} y={478} r={46} />
    </g>
  );
}

function Trolley() {
  return (
    <g>
      <Duna cor={C.areia} />
      <Coqueiro x={90} y={440} s={0.85} />
      <Coqueiro x={720} y={430} s={0.75} />
      {Array.from({ length: 13 }).map((_, i) => (
        <rect key={i} x={220 + i * 30} y="300" width="30" height="22" fill={i % 2 ? C.branco : C.turquesa} />
      ))}
      <rect x="230" y="322" width="8" height="98" fill={C.tinta} />
      <rect x="342" y="322" width="8" height="98" fill={C.tinta} />
      <rect x="454" y="322" width="8" height="98" fill={C.tinta} />
      <rect x="566" y="322" width="8" height="98" fill={C.tinta} />
      <rect x="216" y="380" width="380" height="14" fill={C.sol} />
      <path d="M210 420 L606 420 L606 470 L210 470Z" fill={C.turquesa} />
      <rect x="210" y="436" width="396" height="8" fill={C.branco} />
      <Roda x={270} y={480} r={30} />
      <Roda x={550} y={480} r={30} />
    </g>
  );
}

function Casas() {
  const casas = [
    { x: 150, w: 90, h: 80, cor: C.branco },
    { x: 240, w: 80, h: 104, cor: C.sol },
    { x: 320, w: 96, h: 86, cor: C.coral },
    { x: 416, w: 84, h: 110, cor: C.branco },
    { x: 500, w: 94, h: 92, cor: C.turquesa },
  ];
  return (
    <g>
      <path d="M0 400 C120 360 260 352 420 362 C560 370 680 380 800 372 V440 H0Z" fill={C.verde} />
      {casas.map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={420 - c.h} width={c.w} height={c.h} fill={c.cor} />
          <path d={`M${c.x - 6} ${420 - c.h} L${c.x + c.w / 2} ${420 - c.h - 30} L${c.x + c.w + 6} ${420 - c.h}Z`} fill={C.coralEscuro} />
          <rect x={c.x + c.w / 2 - 12} y={420 - 40} width="24" height="40" fill={C.tinta} />
          <rect x={c.x + 12} y={420 - c.h + 18} width="16" height="18" fill={C.tinta} />
          <rect x={c.x + c.w - 28} y={420 - c.h + 18} width="16" height="18" fill={C.tinta} />
        </g>
      ))}
      <rect x="620" y="250" width="56" height="170" fill={C.branco} />
      <path d="M612 250 L648 206 L684 250Z" fill={C.coralEscuro} />
      <rect x="636" y="272" width="24" height="34" fill={C.tinta} />
      <rect x="638" y="370" width="20" height="50" fill={C.tinta} />
      <rect x="0" y="420" width="800" height="16" fill={C.areia} />
      <Coqueiro x={96} y={430} s={0.8} />
      <Coqueiro x={734} y={430} s={0.7} />
    </g>
  );
}

function Cidade() {
  return (
    <g>
      <Casas />
      <path d={onda(470, 8)} fill={C.oceanoMedio} />
      <g transform="translate(337 232) scale(0.55)">
        <Barco />
      </g>
    </g>
  );
}

function Peixe({ x, y, s = 1, cor }: { x: number; y: number; s?: number; cor: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="34" ry="18" fill={cor} />
      <path d="M28 0 L58 -18 L58 18Z" fill={cor} />
      <circle cx="-18" cy="-4" r="4" fill={C.tinta} />
    </g>
  );
}

function Mergulho() {
  return (
    <g>
      <rect width="800" height="600" fill={C.oceanoMedio} />
      <rect width="800" height="80" fill={C.turquesa} />
      <path d={onda(80, 10).replace('V600 H0Z', 'V0 H0Z')} fill={C.turquesaClara} />
      <path d="M140 80 L240 80 L120 600 L20 600Z" fill={C.turquesa} opacity="0.35" />
      <path d="M420 80 L500 80 L460 600 L330 600Z" fill={C.turquesa} opacity="0.3" />
      <path d="M0 520 C120 480 260 500 380 520 C520 544 660 520 800 500 V600 H0Z" fill={C.areia} />
      <path d="M90 520 C80 470 100 430 120 470 C126 430 150 440 146 520Z" fill={C.coral} />
      <path d="M620 512 C610 456 640 420 660 460 C670 410 700 430 690 512Z" fill={C.coralEscuro} />
      <path d="M690 516 C700 470 730 470 740 516Z" fill={C.sol} />
      <ellipse cx="300" cy="540" rx="70" ry="30" fill={C.tinta} opacity="0.6" />
      <Peixe x={560} y={220} cor={C.sol} />
      <Peixe x={640} y={270} s={0.7} cor={C.coral} />
      <Peixe x={210} y={330} s={0.8} cor={C.branco} />
      <g transform="translate(380 300) rotate(-12)">
        <ellipse cx="0" cy="0" rx="92" ry="26" fill={C.tinta} />
        <circle cx="-108" cy="-6" r="24" fill={C.tinta} />
        <rect x="-126" y="-18" width="26" height="16" fill={C.turquesaClara} />
        <rect x="-40" y="-46" width="90" height="26" rx="13" fill={C.sol} />
        <path d="M86 -10 L150 -40 L160 -24 L96 10Z" fill={C.tinta} />
        <path d="M80 8 L150 34 L142 50 L74 24Z" fill={C.tinta} />
      </g>
      <circle cx="250" cy="250" r="9" fill={C.espuma} />
      <circle cx="238" cy="214" r="6" fill={C.espuma} />
      <circle cx="252" cy="182" r="11" fill={C.espuma} />
      <circle cx="244" cy="140" r="5" fill={C.espuma} />
    </g>
  );
}

function Helicoptero() {
  return (
    <g>
      <g transform="translate(400 210)">
        <rect x="-170" y="-74" width="340" height="9" fill={C.tinta} />
        <rect x="-4" y="-66" width="10" height="22" fill={C.tinta} />
        <path d="M-90 -44 C-40 -54 40 -50 70 -20 C86 0 70 30 30 34 L-80 34 C-120 30 -126 -36 -90 -44Z" fill={C.coral} />
        <path d="M-84 -36 C-60 -42 -30 -42 -20 -36 L-20 0 L-94 0 C-104 -16 -98 -30 -84 -36Z" fill={C.turquesaClara} />
        <path d="M66 -8 L200 -22 L204 -8 L72 8Z" fill={C.coral} />
        <rect x="196" y="-52" width="10" height="44" fill={C.tinta} />
        <rect x="-80" y="48" width="150" height="8" fill={C.tinta} />
        <rect x="-50" y="34" width="8" height="16" fill={C.tinta} />
        <rect x="30" y="34" width="8" height="16" fill={C.tinta} />
      </g>
    </g>
  );
}

function Rio() {
  return (
    <g>
      <path d="M40 336 C90 220 150 150 190 120 C210 130 250 240 300 336Z" fill={C.verdeEscuro} />
      <rect x="186" y="92" width="8" height="30" fill={C.branco} />
      <rect x="172" y="100" width="36" height="7" fill={C.branco} />
      <path d="M470 336 C480 230 520 170 560 168 C600 170 620 240 626 336Z" fill={C.verdeEscuro} />
      <path d="M640 336 C650 290 670 266 700 266 C730 268 744 300 750 336Z" fill={C.verde} />
      <rect x="560" y="168" width="3" height="110" fill={C.tinta} transform="rotate(48 560 168)" />
      {Array.from({ length: 14 }).map((_, i) => (
        <rect
          key={i}
          x={i * 58}
          y={322 - ((i * 37) % 4) * 8}
          width="40"
          height={14 + ((i * 37) % 4) * 8}
          fill={i % 3 ? C.branco : C.areia}
        />
      ))}
      <path d="M0 520 C200 494 420 500 800 470 V600 H0Z" fill={C.areia} />
      <Coqueiro x={700} y={540} s={0.8} />
    </g>
  );
}

const DESENHOS: Record<Cena, () => React.ReactElement> = {
  escuna: Escuna,
  catamara: Catamara,
  barco: Barco,
  lancha: Lancha,
  jetski: JetSki,
  buggy: Buggy,
  quadriciclo: Quadriciclo,
  trolley: Trolley,
  cidade: Cidade,
  mergulho: Mergulho,
  helicoptero: Helicoptero,
  rio: Rio,
};

const EM_TERRA: Cena[] = ['buggy', 'quadriciclo', 'trolley'];

export function Ilustracao({
  cena,
  cidade,
  titulo,
  className,
  prioridade,
}: {
  cena: Cena;
  cidade: Cidade;
  titulo: string;
  className?: string;
  prioridade?: boolean;
}) {
  const p = PALETAS[cidade];
  const Desenho = DESENHOS[cena];
  const semFundo = cena === 'mergulho';
  return (
    <svg
      viewBox="0 0 800 600"
      role="img"
      aria-label={titulo}
      className={className}
      preserveAspectRatio="xMidYMid slice"
      data-prioridade={prioridade ? '' : undefined}
    >
      {!semFundo && (
        <Fundo p={p} terra={EM_TERRA.includes(cena)} solX={cena === 'helicoptero' ? 640 : 560} solY={cena === 'rio' ? 140 : 190} />
      )}
      <Desenho />
    </svg>
  );
}

/** Cena grande do topo da página inicial: a península ao pôr do sol. */
export function IlustracaoHero({ titulo, className }: { titulo: string; className?: string }) {
  return (
    <svg viewBox="0 0 800 1000" role="img" aria-label={titulo} className={className} preserveAspectRatio="xMidYMid slice">
      <rect width="800" height="1000" fill={C.coral} />
      <rect y="0" width="800" height="200" fill="#FF8F7D" />
      <circle cx="470" cy="470" r="150" fill={C.sol} />
      <path d="M0 560 C90 500 170 470 260 492 C340 512 380 470 470 486 C540 498 560 520 600 520 L600 590 L0 590Z" fill={C.coralEscuro} />
      <path d="M560 548 C640 506 720 492 800 500 V590 H560Z" fill="#D94E3A" />
      <rect y="580" width="800" height="420" fill={C.turquesa} />
      <path d={onda(650, 12, 120).replace('V600', 'V1000')} fill={C.oceanoMedio} />
      <path d={onda(760, 14, 180).replace('V600', 'V1000')} fill={C.oceano} />
      <path d={onda(880, 12, 220).replace('V600', 'V1000')} fill={C.tinta} />
      <path d="M0 820 C120 790 260 800 380 850 C450 880 490 940 520 1000 H0Z" fill={C.areia} />
      <g transform="translate(400 380) scale(0.62)">
        <Escuna />
      </g>
      <Coqueiro x={150} y={900} s={2.3} />
      <Coqueiro x={330} y={940} s={1.4} />
    </svg>
  );
}
