'use client';

import { fmt } from '@/i18n/config';
import { calcular, totalPixCentavos, type TabelaPreco } from '@/lib/orcamento';
import { textoPessoas, type RotulosPessoas } from '@/lib/pessoas';
import { Cifra } from '../Cifra';
import { pessoasDoGrupo, useGrupo } from './GrupoContexto';

/**
 * "Total para 2 adultos: R$ 154", calculado com o grupo escolhido na página (rola ao mudar).
 * Com `modo`, mostra o total no Pix, no cartão ou os dois ("R$ 138,60 no Pix · R$ 154 no cartão").
 */
export function PrecoGrupo({
  tabela,
  locale,
  textos,
  modo = 'cartao',
  className = '',
}: {
  tabela: TabelaPreco;
  locale: string;
  textos: { totalPara: string; rotulos: RotulosPessoas; noPix?: string; noCartao?: string };
  modo?: 'cartao' | 'pix' | 'ambos';
  className?: string;
}) {
  const { grupo } = useGrupo();
  const orc = calcular(tabela, pessoasDoGrupo(grupo, tabela));
  const pessoas = textoPessoas(
    { adultos: grupo.adultos, criancasMeia: grupo.criancas6a10, criancasGratis: grupo.criancas0a5 },
    textos.rotulos,
  );
  const cartao = <Cifra centavos={orc.totalCentavos} locale={locale} className="font-semibold tabular-nums" />;
  const pix = <Cifra centavos={totalPixCentavos(orc)} locale={locale} className="font-semibold tabular-nums" />;
  return (
    <p className={className}>
      {fmt(textos.totalPara, { pessoas })}:{' '}
      {modo === 'cartao' ? (
        cartao
      ) : modo === 'pix' ? (
        <>
          {pix} {textos.noPix}
        </>
      ) : (
        <>
          {pix} {textos.noPix} · {cartao} {textos.noCartao}
        </>
      )}
    </p>
  );
}
