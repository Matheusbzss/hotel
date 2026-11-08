import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, type Idioma } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { cotacaoDolar, textoDolar } from '@/lib/dolar';
import { precoPixCentavos, type TabelaPreco } from '@/lib/orcamento';
import { PrecoGrupo } from './grupo/PrecoGrupo';

/**
 * O preço do passeio nos dois jeitos de pagar: o do Pix (com desconto) em destaque, o do cartão embaixo
 * e o total do grupo escolhido no site, no Pix. Nas páginas em espanhol e inglês, os dois preços
 * ganham o aproximado em dólar ao lado.
 */
export async function PrecoDuplo({
  tabela,
  idioma,
  d,
  desde,
  paraQuem,
  tamanho,
  className = '',
}: {
  tabela: TabelaPreco;
  idioma: Idioma;
  d: Dicionario;
  /** "desde": o passeio tem opções e este é o preço da mais barata. */
  desde: boolean;
  /** "por pessoa", "por buggy · até 2"… */
  paraQuem: string;
  tamanho: 'cartao' | 'pagina';
  className?: string;
}) {
  const locale = LOCALE_INTL[idioma];
  const P = d.preco;
  const cotacao = idioma === 'pt' ? null : await cotacaoDolar();
  const usd = (centavos: number) => textoDolar(centavos, cotacao, P.dolar, locale);
  const usdPix = usd(precoPixCentavos(tabela.precoCentavos));
  const usdCartao = usd(tabela.precoCentavos);
  const suave = 'text-small text-(--color-tinta-suave)';
  return (
    <div className={className}>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        {desde && <span className={suave}>{d.boletim.desde}</span>}
        <strong className={`cifra ${tamanho === 'pagina' ? 'text-figure-lg' : 'text-figure'}`}>
          {formatarCifra(precoPixCentavos(tabela.precoCentavos), locale)}
        </strong>
        <span className="text-small font-semibold text-(--color-sucesso)">{P.noPix}</span>
        {usdPix && <span className={`whitespace-nowrap ${suave}`}>· {usdPix}</span>}
        <span className={suave}>{paraQuem}</span>
      </p>
      <p className={suave}>
        <span className="numeros font-semibold text-(--color-tinta)">{formatarCifra(tabela.precoCentavos, locale)}</span> {P.noCartao}
        {usdCartao && <span className="whitespace-nowrap"> · {usdCartao}</span>}
      </p>
      <PrecoGrupo
        tabela={tabela}
        locale={locale}
        modo="pix"
        dolar={cotacao}
        textos={{ totalPara: d.grupo.totalPara, rotulos: d.comum.rotulos, noPix: P.noPix, noCartao: P.noCartao, dolar: P.dolar }}
        className={tamanho === 'pagina' ? `mt-1 ${suave}` : 'mt-1 text-caption text-(--color-tinta-suave)'}
      />
    </div>
  );
}
