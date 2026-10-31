import Image from 'next/image';
import type { Icone, Passeio } from '@/data/passeios';
import type { Idioma } from '@/i18n/config';
import { nomeCidade } from '@/lib/passeio-view';

/** Palavra grande da capa desenhada, por tipo de passeio (início do slug). */
const PALAVRA: Record<string, Record<Idioma, string>> = {
  escuna: { pt: 'Escuna', en: 'Schooner', es: 'Goleta' },
  catamara: { pt: 'Catamarã', en: 'Catamaran', es: 'Catamarán' },
  buggy: { pt: 'Buggy', en: 'Buggy', es: 'Buggy' },
  quadriciclo: { pt: 'Quadri', en: 'Quad', es: 'Cuatri' },
  'city-tour': { pt: 'City tour', en: 'City tour', es: 'City tour' },
  'full-day': { pt: 'Full day', en: 'Full day', es: 'Full day' },
  trolley: { pt: 'Trolley', en: 'Trolley', es: 'Trolley' },
  lancha: { pt: 'Lancha', en: 'Speedboat', es: 'Lancha' },
  'jet-ski': { pt: 'Jet ski', en: 'Jet ski', es: 'Moto agua' },
  helicoptero: { pt: 'Voo', en: 'Flight', es: 'Vuelo' },
  barco: { pt: 'Barco', en: 'Boat', es: 'Barco' },
  mergulho: { pt: 'Mergulho', en: 'Diving', es: 'Buceo' },
};

const AREIA = '#f3e3c3';
const NOITE = '#0b2530';
const SOL = '#ffc83d';

/** Cores da capa por cidade (as do logo): o mar fundo de Búzios, a água de Arraial, o coral de Cabo Frio, a areia do Rio. */
interface Cores {
  fundo: string;
  sol: string;
  onda1: string;
  onda2: string;
  tinta: string;
  /** o desenho do passeio e os seus detalhes */
  objeto: string;
  detalhe: string;
}
const CORES: Record<Passeio['cidade'], Cores> = {
  buzios: { fundo: '#0b2530', sol: SOL, onda1: '#0e5f68', onda2: '#0a6b74', tinta: '#ffffff', objeto: '#ffffff', detalhe: '#ff6b57' },
  'arraial-do-cabo': { fundo: '#14b8c6', sol: SOL, onda1: '#0e86ae', onda2: '#0a5c8a', tinta: NOITE, objeto: '#ffffff', detalhe: NOITE },
  'cabo-frio': { fundo: '#ff6b57', sol: SOL, onda1: '#14b8c6', onda2: '#0a5c8a', tinta: NOITE, objeto: '#ffffff', detalhe: NOITE },
  'rio-de-janeiro': { fundo: '#e1e8e6', sol: SOL, onda1: '#14b8c6', onda2: NOITE, tinta: NOITE, objeto: NOITE, detalhe: SOL },
};

/** Linha de ondas (ou de dunas) que se repete de ponta a ponta, para a capa caber em qualquer formato. */
function ondas(y: number, alto: number, passo: number) {
  let d = `M-1000 ${y} Q${-1000 + passo / 2} ${y - alto} ${-1000 + passo} ${y}`;
  for (let x = -1000 + 2 * passo; x <= 1400; x += passo) d += ` T${x} ${y}`;
  return `${d} L1400 2500 L-1000 2500 Z`;
}

/** Passeios por terra ficam sobre a areia e a estrada; os outros, sobre o mar. */
const POR_TERRA: Icone[] = ['buggy', 'quadriciclo', 'van', 'trolley'];

/* O desenho é feito de funções que devolvem só elementos do SVG (sem componentes dentro do <svg>),
   para a mesma capa servir na página e na imagem de prévia do link. */
function roda(x: number, y: number, r: number) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={NOITE} />
      <circle cx={x} cy={y} r={r * 0.36} fill={SOL} />
    </g>
  );
}

/** O objeto do passeio em formas chapadas: o barco, a lancha, o buggy, a van… */
function objeto(icone: Icone, c: Cores) {
  const o = c.objeto;
  const d = c.detalhe;
  switch (icone) {
    case 'barco':
      return (
        <g>
          <rect x="197" y="118" width="6" height="150" fill={o} />
          <path d="M206 128 L206 236 L296 236 Z" fill={o} />
          <path d="M194 142 L194 236 L118 236 Z" fill={o} />
          <path d="M203 118 L232 128 L203 138 Z" fill={d} />
          <rect x="140" y="242" width="120" height="26" fill={o} />
          {[152, 180, 208, 236].map((x) => (
            <rect key={x} x={x} y="250" width="14" height="10" fill={d} />
          ))}
          <path d="M66 268 L334 268 L306 300 L94 300 Z" fill={o} />
          <rect x="70" y="274" width="260" height="6" fill={d} />
        </g>
      );
    case 'lancha':
      return (
        <g>
          <path d="M150 272 L186 242 L262 242 L286 272 Z" fill={o} />
          <path d="M192 250 L256 250 L272 268 L178 268 Z" fill={d} />
          <path d="M60 272 L318 272 L350 262 L332 300 L92 300 Z" fill={o} />
          <rect x="70" y="282" width="270" height="5" fill={d} />
        </g>
      );
    case 'jetski':
      return (
        <g>
          <path d="M244 268 L262 238 L270 242 L254 272 Z" fill={o} />
          <rect x="252" y="232" width="34" height="7" fill={o} />
          <path d="M168 268 L236 268 L240 284 L164 284 Z" fill={d} />
          <path d="M110 284 L268 284 L304 270 L292 300 L128 300 Z" fill={o} />
          <circle cx="94" cy="290" r="8" fill={o} />
          <circle cx="76" cy="278" r="5" fill={o} />
          <circle cx="66" cy="294" r="4" fill={o} />
        </g>
      );
    case 'helicoptero':
      return (
        <g>
          <rect x="100" y="150" width="200" height="7" fill={d} />
          <rect x="196" y="157" width="8" height="18" fill={o} />
          <rect x="262" y="198" width="86" height="12" fill={o} />
          <rect x="340" y="180" width="8" height="46" fill={d} />
          <ellipse cx="200" cy="208" rx="72" ry="38" fill={o} />
          <path d="M146 204 Q152 180 188 176 L188 208 Z" fill={d} />
          <rect x="164" y="244" width="8" height="18" fill={o} />
          <rect x="228" y="244" width="8" height="18" fill={o} />
          <rect x="146" y="260" width="112" height="6" fill={o} />
        </g>
      );
    case 'mergulho':
      return (
        <g>
          <circle cx="250" cy="250" r="9" fill={o} />
          <circle cx="262" cy="222" r="6" fill={o} />
          <circle cx="254" cy="198" r="4" fill={o} />
          <ellipse cx="190" cy="330" rx="62" ry="30" fill={o} />
          <path d="M246 330 L292 304 L292 356 Z" fill={o} />
          <circle cx="158" cy="324" r="6" fill={d} />
        </g>
      );
    case 'buggy':
      return (
        <g>
          <path d="M146 266 L168 222 L176 225 L156 268 Z" fill={d} />
          <rect x="168" y="220" width="70" height="8" fill={d} />
          <path d="M232 224 L252 266 L244 268 L226 227 Z" fill={d} />
          <path d="M92 318 L108 276 L170 264 L252 264 L304 282 L320 318 Z" fill={o} />
          {roda(132, 322, 30)}
          {roda(280, 322, 30)}
        </g>
      );
    case 'quadriciclo':
      return (
        <g>
          <path d="M248 278 L266 244 L274 248 L258 282 Z" fill={o} />
          <rect x="256" y="238" width="36" height="7" fill={o} />
          <path d="M176 272 L232 272 L226 258 L182 258 Z" fill={d} />
          <path d="M118 316 L136 282 L196 272 L262 280 L292 316 Z" fill={o} />
          {roda(138, 322, 32)}
          {roda(276, 322, 32)}
        </g>
      );
    case 'van':
      return (
        <g>
          <path d="M78 252 L276 252 Q306 252 316 278 L328 304 L328 326 L78 326 Z" fill={o} />
          {[94, 152, 210].map((x) => (
            <rect key={x} x={x} y="264" width="48" height="26" fill={d} />
          ))}
          <path d="M270 264 L294 264 L308 290 L270 290 Z" fill={d} />
          {roda(126, 328, 22)}
          {roda(282, 328, 22)}
        </g>
      );
    case 'trolley':
      return (
        <g>
          <rect x="66" y="222" width="268" height="16" fill={d} />
          {[78, 140, 202, 264, 322].map((x) => (
            <rect key={x} x={x} y="238" width="6" height="62" fill={o} />
          ))}
          <rect x="66" y="300" width="268" height="26" fill={o} />
          <rect x="66" y="308" width="268" height="5" fill={d} />
          {roda(118, 330, 20)}
          {roda(286, 330, 20)}
        </g>
      );
  }
}

function palavraDaCapa(p: Passeio, idioma: Idioma): string {
  const chave = Object.keys(PALAVRA).find((k) => p.slug.startsWith(k));
  return chave ? PALAVRA[chave][idioma] : p.nome[idioma].split(' ')[0];
}

/**
 * Capa desenhada para passeio ainda sem foto: o objeto do passeio sobre o mar ou a estrada, nas cores da cidade.
 * O desenho fica inteiro em qualquer formato: o céu, o mar e a estrada continuam além das bordas.
 * Na imagem de prévia do link, que escreve o nome ao lado, a capa vai sem letras e cortada para preencher o quadro.
 */
export function CapaPasseio({
  passeio,
  idioma,
  className,
  texto = true,
  ajuste = 'meet',
  largura,
  altura,
  decorativa = false,
}: {
  passeio: Passeio;
  idioma: Idioma;
  className?: string;
  texto?: boolean;
  /** dentro de um link que já diz o nome do passeio: o leitor de tela pula a capa */
  decorativa?: boolean;
  ajuste?: 'meet' | 'slice';
  largura?: number;
  altura?: number;
}) {
  const c = CORES[passeio.cidade];
  const palavra = palavraDaCapa(passeio, idioma).toUpperCase();
  const tamanho = Math.min(112, Math.round(352 / palavra.length));
  const terra = POR_TERRA.includes(passeio.icone);
  return (
    <svg
      viewBox="0 0 400 500"
      preserveAspectRatio={`xMidYMid ${ajuste}`}
      overflow="visible"
      width={largura}
      height={altura}
      className={className}
      {...(decorativa ? { 'aria-hidden': true } : { role: 'img', 'aria-label': passeio.nome[idioma] })}
    >
      <rect x="-2000" y="-2000" width="4400" height="4500" fill={c.fundo} />
      <circle cx="330" cy="96" r="54" fill={c.sol} />
      {terra ? (
        <>
          <path d={ondas(292, 18, 200)} fill={AREIA} />
          <rect x="-2000" y="334" width="4400" height="2200" fill={c.onda2} />
        </>
      ) : (
        <>
          <path d={ondas(300, 14, 100)} fill={c.onda1} />
          <path d={ondas(350, 14, 100)} fill={c.onda2} />
        </>
      )}
      {objeto(passeio.icone, c)}
      {texto && (
        <>
          <text x="24" y="52" fill={c.tinta} style={{ fontSize: 22, fontWeight: 600 }}>
            {nomeCidade(passeio, idioma)}
          </text>
          <text x="20" y="470" fill="#ffffff" style={{ fontSize: tamanho, fontWeight: 600, letterSpacing: '-0.02em' }}>
            {palavra}
          </text>
        </>
      )}
    </svg>
  );
}

/** Foto do passeio, ou a capa desenhada quando ainda não há fotos. */
export function MidiaPasseio({
  passeio,
  idioma,
  sizes,
  prioridade = false,
  indice = 0,
  className = '',
  decorativa = false,
}: {
  passeio: Passeio;
  idioma: Idioma;
  sizes: string;
  prioridade?: boolean;
  indice?: number;
  className?: string;
  /** dentro de um link que já diz o nome do passeio: a foto não repete o nome para o leitor de tela */
  decorativa?: boolean;
}) {
  const foto = passeio.fotos[indice];
  return (
    <div className={`zoom relative overflow-hidden bg-superficie ${className}`}>
      {foto ? (
        <Image
          src={foto}
          alt={decorativa ? '' : passeio.nome[idioma]}
          fill
          sizes={sizes}
          priority={prioridade}
          quality={80}
          className="object-cover"
        />
      ) : (
        <CapaPasseio passeio={passeio} idioma={idioma} decorativa={decorativa} className="absolute inset-0 size-full" />
      )}
    </div>
  );
}
