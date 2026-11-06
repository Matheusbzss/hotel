import type { Passeio } from '@/data/passeios';
import { LOCALE_INTL, type Idioma } from '@/i18n/config';
import type { Dicionario } from '@/i18n';
import { itemBoletim } from '@/lib/boletim';
import { formatarCifra } from '@/lib/cifra';
import { precoPixCentavos } from '@/lib/orcamento';
import { CartaoInclinavel } from './Inclinar';
import { MidiaPasseio } from './MidiaPasseio';
import { PrecoDuplo } from './PrecoDuplo';

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
  const pix = formatarCifra(precoPixCentavos(item.tabela.precoCentavos), locale);
  const rotulo = `${item.nome}, ${item.horas}, ${item.temOpcoes ? `${d.boletim.desde} ` : ''}${pix} ${d.preco.noPix}, ${preco} ${d.preco.noCartao} ${item.paraQuem}`;
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
        <PrecoDuplo
          tabela={item.tabela}
          idioma={idioma}
          d={d}
          desde={item.temOpcoes}
          paraQuem={item.paraQuem}
          tamanho="cartao"
          className="mt-2"
        />
      </div>
    </CartaoInclinavel>
  );
}
