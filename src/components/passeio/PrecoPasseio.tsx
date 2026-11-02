import type { Passeio } from '@/data/passeios';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, type Idioma } from '@/i18n/config';
import { itemBoletim } from '@/lib/boletim';
import { formatarCifra } from '@/lib/cifra';
import { PrecoGrupo } from '../grupo/PrecoGrupo';

/** O preço por pessoa (ou por veículo) em destaque e, embaixo, o total do grupo escolhido no site. */
export function PrecoPasseio({ passeio, idioma, d, className = '' }: { passeio: Passeio; idioma: Idioma; d: Dicionario; className?: string }) {
  const item = itemBoletim(passeio, idioma, d);
  const locale = LOCALE_INTL[idioma];
  return (
    <div className={className}>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        {item.temOpcoes && <span className="text-small text-(--color-tinta-suave)">{d.boletim.desde}</span>}
        <strong className="cifra text-figure-lg">{formatarCifra(item.tabela.precoCentavos, locale)}</strong>
        <span className="text-small text-(--color-tinta-suave)">{item.paraQuem}</span>
      </p>
      <PrecoGrupo
        tabela={item.tabela}
        locale={locale}
        textos={{ totalPara: d.grupo.totalPara, rotulos: d.comum.rotulos }}
        className="mt-1 text-small text-(--color-tinta-suave)"
      />
    </div>
  );
}
