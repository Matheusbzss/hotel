import Image from 'next/image';
import { CartaoInclinavel } from '@/components/Inclinar';
import { altDaFoto } from '@/data/fotos-alt';
import type { Guia } from '@/data/guias';
import { rota } from '@/i18n/config';

/** O cartão de um guia: a foto do topo, o título e a frase curta do que ele responde. */
export function CartaoGuia({ guia: g }: { guia: Guia }) {
  return (
    <CartaoInclinavel href={rota('es', `/guias/${g.slug}`)} rotulo={`${g.h1}. ${g.chamada}`}>
      <div className="cartao-foto">
        <div className="absolute inset-0">
          <Image
            src={g.foto}
            alt={altDaFoto(g.foto, 'es')}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 46vw, 80vw"
            className="object-cover"
            style={g.posicaoFoto ? { objectPosition: g.posicaoFoto } : undefined}
          />
        </div>
      </div>
      <div className="cartao-texto" aria-hidden="true">
        <h3 className="cartao-titulo">{g.h1}</h3>
        <p className="mt-1.5 text-small text-(--color-tinta-suave)">{g.chamada}</p>
      </div>
    </CartaoInclinavel>
  );
}
