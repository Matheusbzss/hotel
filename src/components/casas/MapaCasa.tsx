import { fmt } from '@/i18n/config';
import { RAIO_CIRCULO_M } from '@/lib/circulo-casa';
import { DIAMETRO_CIRCULO_M, LARGURA_RECORTE_M } from '@/lib/satelite-casa';

/**
 * Onde fica a casa (Etapa 7, partes 8 e F): a foto de satélite da região (recortada em /mapa/casas/<slug>.webp em volta
 * do centro PÚBLICO do círculo, deslocado do ponto da casa) com o círculo de 500 m de raio no meio, e o texto do
 * bairro. Sem o ponto marcado no painel (`comMapa` false), só o texto: a localização exata vai pela equipe, depois da
 * reserva. A imagem só carrega quando chega perto da tela.
 */
export function MapaCasa({
  slug,
  comMapa,
  local,
  bairro,
  textos: T,
}: {
  slug: string;
  comMapa: boolean;
  /** "Ferradurinha, Búzios". */
  local: string;
  /** O texto curto sobre o bairro (3 ou 4 frases), ou vazio. */
  bairro: string;
  textos: { mapaTitulo: string; mapaTexto: string; mapaFonte: string; mapaCirculo: string };
}) {
  const diametro = `${(DIAMETRO_CIRCULO_M / LARGURA_RECORTE_M) * 100}%`;
  return (
    <section aria-labelledby="mapa-casa">
      <h2 id="mapa-casa" className="titulo-casa">
        {T.mapaTitulo}
      </h2>
      {comMapa && (
        <figure className="mt-5">
          <div className="relative aspect-[4/3] overflow-hidden rounded-(--radius-cartao) bg-(--color-superficie)">
            {/* eslint-disable-next-line @next/next/no-img-element -- a imagem já sai pronta e leve da rota do mapa */}
            <img
              src={`/mapa/casas/${slug}.webp`}
              alt={`${T.mapaTitulo}: ${local}`}
              width={800}
              height={600}
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
            <span className="circulo-casa" style={{ width: diametro }} aria-hidden="true" />
          </div>
          <figcaption className="mt-2 text-caption text-(--color-tinta-suave)">{T.mapaFonte}</figcaption>
        </figure>
      )}
      <p className="mt-4 max-w-[62ch] font-semibold">
        {fmt(T.mapaTexto, { local })}
        {comMapa && ` ${fmt(T.mapaCirculo, { m: RAIO_CIRCULO_M })}`}
      </p>
      {bairro && <p className="mt-3 max-w-[62ch]">{bairro}</p>}
    </section>
  );
}
