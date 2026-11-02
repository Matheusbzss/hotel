'use client';

import { fmt } from '@/i18n/config';
import { calcular, type TabelaPreco } from '@/lib/orcamento';
import { textoPessoas, type RotulosPessoas } from '@/lib/pessoas';
import { Cifra } from '../Cifra';
import { pessoasDoGrupo, useGrupo } from './GrupoContexto';

/** "Total para 2 adultos: R$ 154", calculado com o grupo escolhido na página (rola ao mudar). */
export function PrecoGrupo({
  tabela,
  locale,
  textos,
  className = '',
}: {
  tabela: TabelaPreco;
  locale: string;
  textos: { totalPara: string; rotulos: RotulosPessoas };
  className?: string;
}) {
  const { grupo } = useGrupo();
  const total = calcular(tabela, pessoasDoGrupo(grupo, tabela)).totalCentavos;
  const pessoas = textoPessoas({ adultos: grupo.adultos, criancasMeia: grupo.criancas6a10, criancasGratis: grupo.criancas0a5 }, textos.rotulos);
  return (
    <p className={className}>
      {fmt(textos.totalPara, { pessoas })}: <Cifra centavos={total} locale={locale} className="font-semibold tabular-nums" />
    </p>
  );
}
