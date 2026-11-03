import type { Passeio } from '@/data/passeios';
import type { Dicionario } from '@/i18n';
import type { Idioma } from '@/i18n/config';
import { itemBoletim } from '@/lib/boletim';
import { PrecoDuplo } from '../PrecoDuplo';

/** O preço por pessoa (ou por veículo) no Pix e no cartão, em destaque, e o total do grupo escolhido no site. */
export function PrecoPasseio({
  passeio,
  idioma,
  d,
  className = '',
}: {
  passeio: Passeio;
  idioma: Idioma;
  d: Dicionario;
  className?: string;
}) {
  const item = itemBoletim(passeio, idioma, d);
  return (
    <PrecoDuplo
      tabela={item.tabela}
      idioma={idioma}
      d={d}
      desde={item.temOpcoes}
      paraQuem={item.paraQuem}
      tamanho="pagina"
      className={className}
    />
  );
}
