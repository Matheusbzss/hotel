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
  buzios: { fundo: '#134960', sol: '#ffd54a', onda1: '#0d3a4d', onda2: '#082f3f', tinta: '#ffe07a' },
  'arraial-do-cabo': { fundo: '#26b3c1', sol: '#ffd54a', onda1: '#1b97a4', onda2: '#0f6570', tinta: '#082f3f' },
  'cabo-frio': { fundo: '#ffd54a', sol: '#ffffff', onda1: '#26b3c1', onda2: '#134960', tinta: '#082f3f' },
  'rio-de-janeiro': { fundo: '#f4ead6', sol: '#ffd54a', onda1: '#26b3c1', onda2: '#134960', tinta: '#082f3f' },
};

function palavraDaCapa(p: Passeio, idioma: Idioma): string {
  const chave = Object.keys(PALAVRA).find((k) => p.slug.startsWith(k));
  return chave ? PALAVRA[chave][idioma] : p.nome[idioma].split(' ')[0];
}

/** Capa desenhada para passeio ainda sem foto: sol, mar e o nome do passeio em letra larga. */
export function CapaPasseio({ passeio, idioma, className = '' }: { passeio: Passeio; idioma: Idioma; className?: string }) {
  const c = CORES[passeio.cidade];
  const palavra = palavraDaCapa(passeio, idioma).toUpperCase();
  // a palavra ocupa a largura: letra larga ≈ 0,95 em por caractere
  const tamanho = Math.min(118, Math.round(372 / (palavra.length * 0.93)));
  return (
    <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={passeio.nome[idioma]}>
      <rect width="400" height="500" fill={c.fundo} />
      <circle cx="300" cy="150" r="92" fill={c.sol} />
      <path d="M0 300 Q50 286 100 300 T200 300 T300 300 T400 300 V500 H0Z" fill={c.onda1} />
      <path d="M0 350 Q50 336 100 350 T200 350 T300 350 T400 350 V500 H0Z" fill={c.onda2} />
      <text x="24" y="52" fill={c.tinta} style={{ fontSize: 22, fontWeight: 600 }}>
        {nomeCidade(passeio, idioma)}
      </text>
      <text x="20" y="470" fill="#ffe07a" style={{ fontSize: tamanho, fontWeight: 800, fontStretch: '150%', letterSpacing: '-0.01em' }}>
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
    <div className={`zoom relative overflow-hidden bg-mar-2 ${className}`}>
      {foto ? (
        <Image src={foto} alt={passeio.nome[idioma]} fill sizes={sizes} priority={prioridade} quality={80} className="object-cover" />
      ) : (
        <CapaPasseio passeio={passeio} idioma={idioma} className="absolute inset-0 size-full" />
      )}
    </div>
  );
}
