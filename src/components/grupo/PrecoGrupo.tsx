'use client';

import { fmt } from '@/i18n/config';
import { textoDolar } from '@/lib/dolar';
import { calcular, totalPixCentavos, type TabelaPreco } from '@/lib/orcamento';
import { textoPessoas, type RotulosPessoas } from '@/lib/pessoas';
import { Cifra } from '../Cifra';
import { pessoasDoGrupo, useGrupo } from './GrupoContexto';

/**
 * "Total para 2 adultos: R$ 154,00", calculado com o grupo escolhido na página (rola ao mudar).
 * Com `modo`, mostra o total no Pix, no cartão ou os dois ("R$ 138,60 no Pix · R$ 154,00 no cartão").
 * Com `dolar` e o modelo em `textos.dolar`, cada total ganha o aproximado em dólar ao lado.
 */
export function PrecoGrupo({
  tabela,
  locale,
  textos,
  modo = 'cartao',
  dolar = null,
  className = '',
}: {
  tabela: TabelaPreco;
  locale: string;
  textos: { totalPara: string; rotulos: RotulosPessoas; noPix?: string; noCartao?: string; dolar?: string };
  modo?: 'cartao' | 'pix' | 'ambos';
  /** Reais por dólar, para o "≈ US$" (null no português e sem cotação). */
  dolar?: number | null;
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
  const aprox = (centavos: number) => {
    const u = textos.dolar ? textoDolar(centavos, dolar, textos.dolar, locale) : '';
    return u ? <span className="whitespace-nowrap"> · {u}</span> : null;
  };
  return (
    <p className={className}>
      {fmt(textos.totalPara, { pessoas })}:{' '}
      {modo === 'cartao' ? (
        <>
          {cartao}
          {aprox(orc.totalCentavos)}
        </>
      ) : modo === 'pix' ? (
        <>
          {pix} {textos.noPix}
          {aprox(totalPixCentavos(orc))}
        </>
      ) : (
        <>
          {pix} {textos.noPix}
          {aprox(totalPixCentavos(orc))} · {cartao} {textos.noCartao}
          {aprox(orc.totalCentavos)}
        </>
      )}
    </p>
  );
}
