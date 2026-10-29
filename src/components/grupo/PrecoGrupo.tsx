'use client';

import { LOCALE_INTL, type Idioma } from '@/i18n/config';
import { calcular, formatarCentavos, type TabelaPreco } from '@/lib/orcamento';
import { pessoasDoGrupo, useGrupo } from './GrupoContexto';

/** "Total para o seu grupo: R$ 192,50" — calculado com o grupo escolhido na página. */
export function PrecoGrupo({
  tabela,
  locale,
  rotulo,
  className = '',
}: {
  tabela: TabelaPreco;
  locale: Idioma;
  rotulo: string;
  className?: string;
}) {
  const { grupo } = useGrupo();
  const total = calcular(tabela, pessoasDoGrupo(grupo, tabela)).totalCentavos;
  return (
    <p className={className}>
      {rotulo}: <span className="numeros">{formatarCentavos(total, LOCALE_INTL[locale])}</span>
    </p>
  );
}
