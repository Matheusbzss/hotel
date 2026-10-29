/** Pequenos desenhos (SVG, cores chapadas) das seções "Por que reservar" e "Como funciona". */

const T = '#0B3B5C';
const B = '#FFFFFF';
const S = '#FFC83D';
const CO = '#FF7A66';
const TU = '#14B8C6';
const AR = '#F3E3C3';
const OC = '#0A5C8A';

export function DesenhoConversa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 320" className={className} aria-hidden="true">
      <rect x="120" y="20" width="160" height="290" rx="26" fill={T} />
      <rect x="132" y="44" width="136" height="242" rx="8" fill={B} />
      <rect x="146" y="64" width="92" height="36" rx="18" fill={AR} />
      <rect x="168" y="112" width="88" height="36" rx="18" fill={TU} />
      <rect x="146" y="160" width="104" height="36" rx="18" fill={AR} />
      <rect x="160" y="208" width="96" height="36" rx="18" fill={TU} />
      <circle cx="320" cy="78" r="44" fill={S} />
      <path d="M300 78 l14 14 l26 -28" stroke={T} strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QrFalso({ x, y, s }: { x: number; y: number; s: number }) {
  // padrão fixo que lembra um QR Code
  const m = [
    '1111111001011',
    '1000001011001',
    '1011101000101',
    '1011101101011',
    '1011101010010',
    '1000001001101',
    '1111111010101',
    '0000000110010',
    '1101011011101',
    '0110100101011',
    '1011011100110',
    '0100110011010',
    '1110101101101',
  ];
  return (
    <g transform={`translate(${x} ${y})`}>
      {m.flatMap((linha, i) =>
        [...linha].map((c, j) => (c === '1' ? <rect key={`${i}-${j}`} x={j * s} y={i * s} width={s} height={s} fill={T} /> : null)),
      )}
    </g>
  );
}

export function DesenhoPagamento({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 320" className={className} aria-hidden="true">
      <rect x="40" y="40" width="180" height="180" fill={B} />
      <QrFalso x={53} y={53} s={12} />
      <g transform="rotate(-8 290 210)">
        <rect x="170" y="150" width="210" height="132" rx="14" fill={OC} />
        <rect x="170" y="176" width="210" height="26" fill={T} />
        <rect x="190" y="226" width="44" height="32" rx="6" fill={S} />
        <rect x="250" y="236" width="110" height="12" rx="6" fill={B} />
      </g>
      <circle cx="330" cy="70" r="40" fill={CO} />
      <rect x="312" y="66" width="36" height="30" rx="5" fill={T} />
      <path d="M318 66 v-10 a12 12 0 0 1 24 0 v10" stroke={T} strokeWidth="7" fill="none" />
    </svg>
  );
}

export function DesenhoVoucher({ className, codigo = 'VH-7K3P9Q' }: { className?: string; codigo?: string }) {
  return (
    <svg viewBox="0 0 400 320" className={className} aria-hidden="true">
      <g transform="rotate(-4 200 160)">
        <path d="M30 70 H370 V140 a20 20 0 0 0 0 40 V250 H30 V180 a20 20 0 0 0 0 -40 Z" fill={B} />
        <rect x="30" y="70" width="340" height="22" fill={CO} />
        {Array.from({ length: 14 }).map((_, i) => (
          <circle key={i} cx={60 + i * 22} cy="160" r="4" fill={AR} />
        ))}
        <text x="56" y="132" fontFamily="var(--font-albert), sans-serif" fontWeight="700" fontSize="34" fill={T}>
          {codigo}
        </text>
        <rect x="56" y="196" width="150" height="14" rx="7" fill={AR} />
        <rect x="56" y="220" width="104" height="14" rx="7" fill={AR} />
        <rect x="282" y="188" width="56" height="50" fill={TU} />
      </g>
    </svg>
  );
}

export function DesenhoChuva({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 320" className={className} aria-hidden="true">
      <circle cx="270" cy="96" r="58" fill={S} />
      <path d="M90 170 a50 50 0 0 1 58 -62 a70 70 0 0 1 128 22 a44 44 0 0 1 8 88 H110 a48 48 0 0 1 -20 -48Z" fill={B} />
      {[120, 170, 220, 270].map((x, i) => (
        <path key={x} d={`M${x} ${240 + (i % 2) * 14} l-12 36`} stroke={T} strokeWidth="10" strokeLinecap="round" />
      ))}
      <path d="M300 250 a26 26 0 1 1 26 26" stroke={T} strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d="M326 262 l0 16 l-16 0" stroke={T} strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DesenhoEscolha({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 320" className={className} aria-hidden="true">
      <rect x="40" y="30" width="320" height="260" fill={B} />
      <rect x="40" y="30" width="320" height="46" fill={TU} />
      {Array.from({ length: 4 }).flatMap((_, l) =>
        Array.from({ length: 7 }).map((_, c) => (
          <rect key={`${l}-${c}`} x={60 + c * 42} y={92 + l * 36} width="30" height="26" rx="6" fill={l === 1 && c === 4 ? CO : AR} />
        )),
      )}
      <rect x="60" y="244" width="130" height="30" rx="15" fill={T} />
      <rect x="206" y="244" width="134" height="30" rx="15" fill={S} />
    </svg>
  );
}
