import Image from 'next/image';
import type { Passeio } from '@/data/passeios';
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

/** Cores da capa por cidade: o mar de Búzios, a água de Arraial, o sol de Cabo Frio, a areia do Rio.
 * A palavra fica sempre sobre a faixa escura do mar, em amarelo. */
const CORES: Record<Passeio['cidade'], { fundo: string; sol: string; onda1: string; onda2: string; tinta: string }> = {
  buzios: { fundo: '#0b2530', sol: '#ffc83d', onda1: '#0e5f68', onda2: '#0a6b74', tinta: '#ffffff' },
  'arraial-do-cabo': { fundo: '#14b8c6', sol: '#ffc83d', onda1: '#0e86ae', onda2: '#0a5c8a', tinta: '#0b2530' },
  'cabo-frio': { fundo: '#ff6b57', sol: '#ffc83d', onda1: '#14b8c6', onda2: '#0a5c8a', tinta: '#0b2530' },
  'rio-de-janeiro': { fundo: '#e1e8e6', sol: '#ffc83d', onda1: '#14b8c6', onda2: '#0b2530', tinta: '#0b2530' },
};

function palavraDaCapa(p: Passeio, idioma: Idioma): string {
  const chave = Object.keys(PALAVRA).find((k) => p.slug.startsWith(k));
  return chave ? PALAVRA[chave][idioma] : p.nome[idioma].split(' ')[0];
}

/** Capa desenhada para passeio ainda sem foto: sol, mar e o nome do passeio em letra larga. */
export function CapaPasseio({ passeio, idioma, className = '' }: { passeio: Passeio; idioma: Idioma; className?: string }) {
  const c = CORES[passeio.cidade];
  const palavra = palavraDaCapa(passeio, idioma).toUpperCase();
  // a palavra ocupa a largura sem encostar na borda: letra larga ≈ 1 em por caractere
  const tamanho = Math.min(112, Math.round(352 / palavra.length));
  return (
    <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMax slice" className={className} role="img" aria-label={passeio.nome[idioma]}>
      <rect width="400" height="500" fill={c.fundo} />
      <circle cx="300" cy="150" r="92" fill={c.sol} />
      <path d="M0 300 Q50 286 100 300 T200 300 T300 300 T400 300 V500 H0Z" fill={c.onda1} />
      <path d="M0 350 Q50 336 100 350 T200 350 T300 350 T400 350 V500 H0Z" fill={c.onda2} />
      <text x="24" y="52" fill={c.tinta} style={{ fontSize: 22, fontWeight: 600 }}>
        {nomeCidade(passeio, idioma)}
      </text>
      <text x="20" y="470" fill="#ffffff" style={{ fontSize: tamanho, fontWeight: 600, letterSpacing: '-0.02em' }}>
        {palavra}
      </text>
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
}: {
  passeio: Passeio;
  idioma: Idioma;
  sizes: string;
  prioridade?: boolean;
  indice?: number;
  className?: string;
}) {
  const foto = passeio.fotos[indice];
  return (
    <div className={`zoom relative overflow-hidden bg-superficie ${className}`}>
      {foto ? (
        <Image src={foto} alt={passeio.nome[idioma]} fill sizes={sizes} priority={prioridade} quality={80} className="object-cover" />
      ) : (
        <CapaPasseio passeio={passeio} idioma={idioma} className="absolute inset-0 size-full" />
      )}
    </div>
  );
}
