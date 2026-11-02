import type { Passeio } from '@/data/passeios';
import { LOCALE_INTL, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { itemBoletim } from '@/lib/boletim';
import { formatarCifra } from '@/lib/cifra';
import { PrecoGrupo } from './grupo/PrecoGrupo';
import { CartaoInclinavel } from './Inclinar';
import { MidiaPasseio } from './MidiaPasseio';

/** Classes inteiras da cor de duração (o Tailwind só gera o que encontra escrito por extenso). */
const PONTO: Record<string, string> = {
  d1: 'bg-(--color-d1)',
  d2: 'bg-(--color-d2)',
  d3: 'bg-(--color-d3)',
  d4: 'bg-(--color-d4)',
  d5: 'bg-(--color-d5)',
};

/**
 * Cartão de passeio: a foto real com duração e cidade em etiquetas de vidro, o nome,
 * o preço por pessoa (ou por veículo) em destaque e o total do grupo escolhido, menor.
 */
export function CardPasseio({
  passeio: p,
  idioma,
  d,
  sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 46vw, 80vw',
  prioridade = false,
  mostrarCidade = true,
}: {
  passeio: Passeio;
  idioma: Idioma;
  d: Dicionario;
  sizes?: string;
  prioridade?: boolean;
  /** Na vitrine da página inicial os cartões já vêm agrupados por cidade: a etiqueta da cidade sobra. */
  mostrarCidade?: boolean;
}) {
  const item = itemBoletim(p, idioma, d);
  const locale = LOCALE_INTL[idioma];
  const preco = formatarCifra(item.tabela.precoCentavos, locale);
  const rotulo = `${item.nome}, ${item.horas}, ${item.temOpcoes ? `${d.boletim.desde} ` : ''}${preco} ${item.paraQuem}`;
  return (
    <CartaoInclinavel href={item.href} rotulo={rotulo}>
      <div className="cartao-foto">
        <div className="absolute inset-0">
          <MidiaPasseio passeio={p} idioma={idioma} decorativa sizes={sizes} prioridade={prioridade} className="size-full" />
        </div>
        <div className="etiquetas" aria-hidden="true">
          <span className="etiqueta vidro vidro-escuro">
            <i className={`ponto ${PONTO[item.faixa]}`} />
            {item.horas}
          </span>
          {mostrarCidade && <span className="etiqueta vidro vidro-escuro">{item.cidadeNome}</span>}
        </div>
      </div>
      <div className="cartao-texto" aria-hidden="true">
        <h3 className="cartao-titulo">{item.nome}</h3>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
          {item.temOpcoes && <span className="text-small text-(--color-tinta-suave)">{d.boletim.desde}</span>}
          <strong className="cifra text-figure">{preco}</strong>
          <span className="text-small text-(--color-tinta-suave)">{item.paraQuem}</span>
        </p>
        <PrecoGrupo
          tabela={item.tabela}
          locale={locale}
          textos={{ totalPara: d.grupo.totalPara, rotulos: d.comum.rotulos }}
          className="mt-1 text-caption text-(--color-tinta-suave)"
        />
      </div>
    </CartaoInclinavel>
  );
}
