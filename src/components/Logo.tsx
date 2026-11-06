/**
 * A logo da Orla Nativa: o sol atrás da serra e ORLA NATIVA, refeita em SVG a partir dos banners
 * (scripts/gerar-logo.mjs). No cabeçalho vai a versão lado a lado; no rodapé, o emblema redondo.
 */

type Fundo = 'claro' | 'escuro';

/** A versão lado a lado: azul para fundo claro, creme para foto ou fundo escuro. */
export function Logo({ fundo = 'claro', className = '' }: { fundo?: Fundo; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG pronto, nítido em qualquer tela
    <img
      src={fundo === 'escuro' ? '/logo/orla-nativa-horizontal-fundo-escuro.svg' : '/logo/orla-nativa-horizontal.svg'}
      alt=""
      width={711}
      height={172}
      className={`block h-[2.125rem] w-auto sm:h-[2.375rem] md:h-11 ${className}`}
    />
  );
}

/** O emblema redondo, com o nome no desenho. */
export function Emblema({ titulo, className = '' }: { titulo: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- SVG pronto, nítido em qualquer tela
  return <img src="/logo/orla-nativa-emblema.svg" alt={titulo} width={96} height={96} loading="lazy" className={className} />;
}
