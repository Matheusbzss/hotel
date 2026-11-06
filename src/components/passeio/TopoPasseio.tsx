import type { Passeio } from '@/data/passeios';
import type { Dicionario } from '@/i18n';
import type { Idioma } from '@/i18n/config';
import { itemBoletim } from '@/lib/boletim';
import { GaleriaPasseio, type TextosGaleria } from '../GaleriaPasseio';
import { MidiaPasseio } from '../MidiaPasseio';
import { Confianca } from './Confianca';
import { PrecoPasseio } from './PrecoPasseio';

/** Classes inteiras da cor de duração (o Tailwind só gera o que encontra escrito por extenso). */
const PONTO: Record<string, string> = {
  d1: 'bg-(--color-d1)',
  d2: 'bg-(--color-d2)',
  d3: 'bg-(--color-d3)',
  d4: 'bg-(--color-d4)',
  d5: 'bg-(--color-d5)',
};

/**
 * O topo da página do passeio: as fotos de borda a borda, por baixo da cápsula do menu, com a duração,
 * a cidade e o nome por cima; logo abaixo, o preço por pessoa, o total do grupo e as garantias.
 */
export function TopoPasseio({ passeio: p, idioma, d, textosGaleria }: { passeio: Passeio; idioma: Idioma; d: Dicionario; textosGaleria: TextosGaleria }) {
  const item = itemBoletim(p, idioma, d);
  return (
    <>
      <section className="topo-passeio" aria-labelledby="passeio-titulo">
        <div className="topo-passeio-fotos">
          {p.fotos.length > 0 ? (
            <GaleriaPasseio fotos={p.fotos} alt={p.nome[idioma]} textos={textosGaleria} />
          ) : (
            <MidiaPasseio passeio={p} idioma={idioma} sizes="100vw" prioridade className="absolute inset-0 size-full" />
          )}
        </div>
        <div className="topo-passeio-texto">
          <div className="moldura">
            <div className="flex flex-wrap gap-1.5">
              <span className="etiqueta vidro vidro-foto">
                <i className={`ponto ${PONTO[item.faixa]}`} />
                {item.horas}
              </span>
              <span className="etiqueta vidro vidro-foto">{item.cidadeNome}</span>
            </div>
            <h1 id="passeio-titulo" className="topo-passeio-titulo mt-3">
              {p.nome[idioma]}
            </h1>
          </div>
        </div>
      </section>
      <div className="moldura mt-6 grid gap-5 md:mt-8 md:grid-cols-12 md:items-center md:gap-8">
        <PrecoPasseio passeio={p} idioma={idioma} d={d} className="md:col-span-5" />
        <Confianca d={d} className="sm:grid-cols-2 md:col-span-7" />
      </div>
    </>
  );
}
