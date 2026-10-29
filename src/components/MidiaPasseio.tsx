import Image from 'next/image';
import type { Passeio } from '@/data/passeios';
import type { Idioma } from '@/i18n/config';
import { Ilustracao } from './Ilustracao';

/** Primeira foto do passeio, ou a ilustração do tipo de passeio quando ainda não há fotos. */
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
  const alt = passeio.nome[idioma];
  if (foto) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image src={foto} alt={alt} fill sizes={sizes} priority={prioridade} quality={80} className="object-cover" />
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <Ilustracao cena={passeio.ilustracao} cidade={passeio.cidade} titulo={alt} className="absolute inset-0 size-full" />
    </div>
  );
}
