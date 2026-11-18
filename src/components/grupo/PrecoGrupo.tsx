'use client';

import { fmt } from '@/i18n/config';
import { textoDolar } from '@/lib/dolar';
import { calcular, totalPixCentavos, type TabelaPreco } from '@/lib/orcamento';
import { textoPessoas, type RotulosPessoas } from '@/lib/pessoas';
import { Cifra } from '../Cifra';
import { Pedaco, Pedacos } from '../ComDolar';
import { pessoasDoGrupo, useGrupo } from './GrupoContexto';

/**
 * "Total para 2 adultos: R$ 154,00", calculado com o grupo escolhido na página (rola ao mudar).
 * Com `modo`, mostra o total no Pix, no cartão ou os dois ("R$ 138,60 no Pix · R$ 154,00 no cartão").
 * Com `dolar` e o modelo em `textos.dolar`, cada total ganha o aproximado em dólar ao lado.
 * Cada valor fica inteiro com o rótulo ("R$ 138,60 no Pix") e os valores andam juntos: quando não cabem depois do
 * "Total para…", descem para a linha de baixo, e o que não couber ao lado do outro desce sem o "·" na frente.
 */
export function PrecoGrupo({
  tabela,
  locale,
  textos,
  modo = 'cartao',
  dolar = null,
  folga = 'pequeno',
  className = '',
}: {
  tabela: TabelaPreco;
  locale: string;
  textos: { totalPara: string; rotulos: RotulosPessoas; noPix?: string; noCartao?: string; dolar?: string };
  modo?: 'cartao' | 'pix' | 'ambos';
  /** Reais por dólar, para o "≈ US$" (null no português e sem cotação). */
  dolar?: number | null;
  /** a largura do "·" entre os valores: a de " · " na letra da linha (pequena ou legenda) */
  folga?: 'pequeno' | 'legenda';
  className?: string;
}) {
  const { grupo } = useGrupo();
  const orc = calcular(tabela, pessoasDoGrupo(grupo, tabela));
  const pessoas = textoPessoas(
    { adultos: grupo.adultos, criancasMeia: grupo.criancas6a10, criancasGratis: grupo.criancas0a5 },
    textos.rotulos,
  );
  const pix = { centavos: totalPixCentavos(orc), rotulo: textos.noPix };
  const cartao = { centavos: orc.totalCentavos, rotulo: modo === 'ambos' ? textos.noCartao : undefined };
  const valores = modo === 'cartao' ? [cartao] : modo === 'pix' ? [pix] : [pix, cartao];
  // "R$ 138,60 no Pix", inteiro
  const valor = (v: { centavos: number; rotulo?: string }) => (
    <>
      <Cifra centavos={v.centavos} locale={locale} className="font-semibold tabular-nums" />
      {v.rotulo && <> {v.rotulo}</>}
    </>
  );
  const pedacos = valores.flatMap((v, i) => {
    const u = textos.dolar ? textoDolar(v.centavos, dolar, textos.dolar, locale) : '';
    return [
      <Pedaco key={`valor-${i}`} ponto={i > 0} className="whitespace-nowrap">
        {valor(v)}
      </Pedaco>,
      ...(u
        ? [
            <Pedaco key={`dolar-${i}`} ponto>
              {u}
            </Pedaco>,
          ]
        : []),
    ];
  });
  return (
    <p className={className}>
      {fmt(textos.totalPara, { pessoas })}:{' '}
      {pedacos.length > 1 ? (
        <Pedacos emLinha folga={folga}>
          {pedacos}
        </Pedacos>
      ) : (
        // um valor só, sem dólar (português): o texto de sempre, só que inteiro
        <span className="whitespace-nowrap">{valor(valores[0])}</span>
      )}
    </p>
  );
}
