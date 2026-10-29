import type { Idioma } from '@/i18n/config';

/** Bandeiras desenhadas em SVG (emoji de bandeira não aparece no Windows). */
export function Bandeira({ idioma, className }: { idioma: Idioma; className?: string }) {
  if (idioma === 'pt') {
    return (
      <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
        <rect width="30" height="20" fill="#009C3B" />
        <path d="M15 2.5 L27 10 L15 17.5 L3 10Z" fill="#FFDF00" />
        <circle cx="15" cy="10" r="4.6" fill="#002776" />
        <path d="M10.6 9.2 C13 8.4 16.6 8.6 19.4 10.4 L19.3 11.2 C16.6 9.5 13.2 9.3 10.5 10.1Z" fill="#fff" />
      </svg>
    );
  }
  if (idioma === 'en') {
    return (
      <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
        <rect width="30" height="20" fill="#fff" />
        {[0, 2, 4, 6, 8, 10, 12].map((i) => (
          <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill="#B22234" />
        ))}
        <rect width="13" height={(20 / 13) * 7} fill="#3C3B6E" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 30 20" className={className} aria-hidden="true">
      <rect width="30" height="20" fill="#AA151B" />
      <rect y="5" width="30" height="10" fill="#F1BF00" />
    </svg>
  );
}
