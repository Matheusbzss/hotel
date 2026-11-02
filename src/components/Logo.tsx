import dna from '../../design-dna.json';

/**
 * Logo A, "Horizonte": o sol se pondo numa célula, com o mar fundo e duas linhas de água.
 * Cores e medidas em design-dna.json > brand.logo. O nome usa a Barlow Semi Condensed da página.
 */
const MARCA = dna.brand.logo;
const C = dna.design_system.color;

export function SimboloLogo({ className = '', titulo }: { className?: string; titulo?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : true}
    >
      <defs>
        <clipPath id="logo-celula">
          <rect width="40" height="40" rx="4" />
        </clipPath>
      </defs>
      <g clipPath="url(#logo-celula)">
        <rect width="40" height="40" fill={C.primary.hex} />
        <rect width="40" height="22" fill={C.accent.hex} />
        <path d="M11 22a9 9 0 0 1 18 0z" fill={C.sky_and_sea.sun_core} />
        <path d="M6 28h28M11 33.5h18" stroke={C.secondary.hex} strokeWidth="2.4" />
      </g>
    </svg>
  );
}

type Fundo = 'claro' | 'escuro' | 'ceu';

const CORES: Record<Fundo, { nome: string; slogan: string }> = {
  claro: { nome: MARCA.on_light.wordmark, slogan: MARCA.on_light.tagline },
  escuro: { nome: MARCA.on_dark.wordmark, slogan: MARCA.on_dark.tagline },
  ceu: { nome: MARCA.on_sky.wordmark, slogan: MARCA.on_sky.tagline },
};

export function Logo({
  fundo = 'claro',
  slogan = dna.brand.tagline,
  className = '',
}: {
  fundo?: Fundo;
  slogan?: string;
  className?: string;
}) {
  const c = CORES[fundo];
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SimboloLogo className="size-10 shrink-0" />
      <span className="flex flex-col leading-none" style={{ fontFamily: 'var(--font-semi)' }}>
        <span className="text-[1.6rem] font-semibold tracking-[-0.005em]" style={{ color: c.nome }}>
          {dna.brand.name}
        </span>
        <span className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em]" style={{ color: c.slogan }}>
          {slogan}
        </span>
      </span>
    </span>
  );
}
