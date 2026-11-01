import { caminhoTerra } from '@/lib/mapa';

/** O litoral da Região dos Lagos em mapa plano (sem 3D ou com "reduzir movimento"). Dados do OpenStreetMap. */
export function MapaPlano({ rotulo }: { rotulo: string }) {
  const { d, largura, altura } = caminhoTerra();
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="size-full" role="img" aria-label={rotulo}>
      <rect width={largura} height={altura} fill="var(--color-mar-longe)" />
      <path d={d} fill="var(--color-terra)" stroke="var(--color-fundo)" strokeOpacity="0.6" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
