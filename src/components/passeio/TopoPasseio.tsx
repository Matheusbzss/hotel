import { altDaFoto } from '@/data/fotos-alt';
import type { Passeio } from '@/data/passeios';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { itemBoletim } from '@/lib/boletim';
import { PONTO_PRESO } from '@/lib/ponto';
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

/** A estrela da nota, a mesma das opiniões (src/components/home/Opinioes.tsx e OpinioesPasseio.tsx). */
const ESTRELA = 'M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z';

/**
 * O topo da página do passeio: as fotos de borda a borda, por baixo da cápsula do menu, com a duração,
 * a cidade e o nome por cima; logo abaixo, o preço por pessoa, o total do grupo e as garantias.
 * Com nota (Pacote 27), uma etiqueta a mais com a nota real da agência, "★ 5,0 · 5 opiniones", que leva ao cartão
 * de opiniões da página. Ela vem só quando o cartão aparece (notaVisivel, src/lib/avaliacao.ts) e nunca cita um site.
 */
export function TopoPasseio({
  passeio: p,
  idioma,
  d,
  textosGaleria,
  nota,
}: {
  passeio: Passeio;
  idioma: Idioma;
  d: Dicionario;
  textosGaleria: TextosGaleria;
  /** A nota da agência (notaDaAgencia), só quando notaVisivel: sem ela, a etiqueta não aparece. */
  nota?: { media: number; total: number };
}) {
  const item = itemBoletim(p, idioma, d);
  const media = nota?.media.toLocaleString(LOCALE_INTL[idioma], { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <>
      <section className="topo-passeio" aria-labelledby="passeio-titulo">
        <div className="topo-passeio-fotos">
          {p.fotos.length > 0 ? (
            <GaleriaPasseio fotos={p.fotos} alts={p.fotos.map((f) => altDaFoto(f, idioma, texto(p.nome, idioma)))} textos={textosGaleria} />
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
              {nota && media && (
                // o texto do topo deixa o toque passar para as fotos (pointer-events: none); a etiqueta da nota é
                // um link, então ela volta a receber o toque, com a área esticada para cima e para baixo
                <a
                  href="#opinioes-passeio-titulo"
                  className="etiqueta vidro vidro-foto pointer-events-auto relative after:absolute after:-inset-y-2.5 after:inset-x-0 after:content-['']"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-(--color-acao)" aria-hidden="true">
                    <path fill="currentColor" d={ESTRELA} />
                  </svg>
                  <span className="sr-only">{fmt(d.opinioes.nota, { n: media })}</span>
                  <span>
                    <span className="numeros" aria-hidden="true">
                      {media}
                    </span>
                    {PONTO_PRESO}
                    {nota.total === 1 ? d.passeio.opinioesContagemUma : fmt(d.passeio.opinioesContagem, { n: nota.total })}
                  </span>
                </a>
              )}
            </div>
            <h1 id="passeio-titulo" className="topo-passeio-titulo mt-3">
              {texto(p.nome, idioma)}
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
