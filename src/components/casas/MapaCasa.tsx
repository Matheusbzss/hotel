import { fmt } from '@/i18n/config';
import { DIAMETRO_CIRCULO_M, LARGURA_RECORTE_M } from '@/lib/satelite-casa';

/**
 * Onde fica a casa: a foto de satélite da região (recortada em /mapa/casas/<slug>.webp) com um círculo
 * na área. O endereço exato só vai no voucher.
 */
export function MapaCasa({
  slug,
  local,
  textos: T,
  className = '',
}: {
  slug: string;
  local: string;
  textos: { mapaTitulo: string; mapaTexto: string; mapaFonte: string };
  className?: string;
}) {
  const diametro = `${(DIAMETRO_CIRCULO_M / LARGURA_RECORTE_M) * 100}%`;
  return (
    <section aria-labelledby="mapa-casa" className={className}>
      <h2 id="mapa-casa" className="text-lead font-semibold">
        {T.mapaTitulo}
      </h2>
      <figure className="mt-4">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[4px] bg-(--color-superficie)">
          {/* eslint-disable-next-line @next/next/no-img-element -- a imagem já sai pronta e leve da rota do mapa */}
          <img
            src={`/mapa/casas/${slug}.webp`}
            alt={`${T.mapaTitulo}: ${local}`}
            width={800}
            height={600}
            loading="lazy"
            className="size-full object-cover"
          />
          <span
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 bg-white/15 shadow-[0_0_0_1px_rgb(0_0_0/0.25)]"
            style={{ width: diametro }}
            aria-hidden="true"
          />
        </div>
        <figcaption className="mt-3">
          <span className="block">{fmt(T.mapaTexto, { local })}</span>
          <span className="mt-1 block text-caption text-(--color-tinta-suave)">{T.mapaFonte}</span>
        </figcaption>
      </figure>
    </section>
  );
}
