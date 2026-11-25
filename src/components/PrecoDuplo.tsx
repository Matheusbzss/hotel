import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, type Idioma } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { cotacaoDolar, textoDolar } from '@/lib/dolar';
import { precoPixCentavos, type TabelaPreco } from '@/lib/orcamento';
import { cartaoEmDestaque, rotuloPixComDesconto } from '@/lib/preco-destaque';
import { semQuebraNoPonto } from '@/lib/ponto';
import { ComDolar, Pedaco, Pedacos } from './ComDolar';
import { PrecoGrupo } from './grupo/PrecoGrupo';

/**
 * O preço do passeio nos dois jeitos de pagar e o total do grupo escolhido no site. Em português, o do Pix (com
 * desconto) em destaque, o do cartão embaixo e o total no Pix. Em espanhol e inglês (src/lib/preco-destaque.ts), o do
 * cartão em destaque, o do Pix embaixo com o desconto ("con Pix (−10%)") e o total no cartão; os dois preços ganham
 * o aproximado em dólar ao lado.
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
  // espanhol e inglês: o do cartão em destaque e o do Pix embaixo, com o desconto
  if (cartaoEmDestaque(idioma)) {
    return (
      <div className={className}>
        <p>
          <Pedacos folga="justa" comPonto={Boolean(usdCartao)}>
            {desde && <Pedaco className={suave}>{d.boletim.desde}</Pedaco>}
            <Pedaco forte className={`cifra ${tamanho === 'pagina' ? 'text-figure-lg' : 'text-figure'}`}>
              {formatarCifra(tabela.precoCentavos, locale)}
            </Pedaco>
            <Pedaco className="text-small font-semibold whitespace-nowrap">{P.noCartao}</Pedaco>
            {usdCartao && (
              <Pedaco ponto className={suave}>
                {usdCartao}
              </Pedaco>
            )}
            <Pedaco className={suave}>{semQuebraNoPonto(paraQuem)}</Pedaco>
          </Pedacos>
        </p>
        <p className={suave}>
          <ComDolar dolar={usdPix}>
            <span className="whitespace-nowrap">
              <span className="numeros font-semibold text-(--color-tinta)">
                {formatarCifra(precoPixCentavos(tabela.precoCentavos), locale)}
              </span>{' '}
              <span className="font-semibold text-(--color-sucesso)">{rotuloPixComDesconto(P.noPixComDesconto)}</span>
            </span>
          </ComDolar>
        </p>
        <PrecoGrupo
          tabela={tabela}
          locale={locale}
          modo="cartao"
          dolar={cotacao}
          folga={tamanho === 'pagina' ? 'pequeno' : 'legenda'}
          textos={{ totalPara: d.grupo.totalPara, rotulos: d.comum.rotulos, noCartao: P.noCartao, dolar: P.dolar }}
          className={tamanho === 'pagina' ? `mt-1 ${suave}` : 'mt-1 text-caption text-(--color-tinta-suave)'}
        />
      </div>
    );
  }
  // o total do grupo: a classe da letra e a folga do "·" saem juntas, do mesmo tamanho
  const grupo =
    tamanho === 'pagina'
      ? ({ classe: `mt-1 ${suave}`, folga: 'pequeno' } as const)
      : ({ classe: 'mt-1 text-caption text-(--color-tinta-suave)', folga: 'legenda' } as const);
  return (
    <div className={className}>
      {/* cada pedaço fica inteiro e o "·" do dólar só aparece ao lado de outro pedaço, nunca no começo da linha;
          no português, sem dólar, a linha fica como sempre foi */}
      <p>
        <Pedacos folga="justa" comPonto={Boolean(usdPix)}>
          {desde && <Pedaco className={suave}>{d.boletim.desde}</Pedaco>}
          <Pedaco forte className={`cifra ${tamanho === 'pagina' ? 'text-figure-lg' : 'text-figure'}`}>
            {formatarCifra(precoPixCentavos(tabela.precoCentavos), locale)}
          </Pedaco>
          <Pedaco className="text-small font-semibold whitespace-nowrap text-(--color-sucesso)">{P.noPix}</Pedaco>
          {usdPix && (
            <Pedaco ponto className={suave}>
              {usdPix}
            </Pedaco>
          )}
          <Pedaco className={suave}>{semQuebraNoPonto(paraQuem)}</Pedaco>
        </Pedacos>
      </p>
      <p className={suave}>
        <ComDolar dolar={usdCartao}>
          <span className="whitespace-nowrap">
            <span className="numeros font-semibold text-(--color-tinta)">{formatarCifra(tabela.precoCentavos, locale)}</span> {P.noCartao}
          </span>
        </ComDolar>
      </p>
      <PrecoGrupo
        tabela={tabela}
        locale={locale}
        modo="pix"
        dolar={cotacao}
        folga={grupo.folga}
        textos={{ totalPara: d.grupo.totalPara, rotulos: d.comum.rotulos, noPix: P.noPix, noCartao: P.noCartao, dolar: P.dolar }}
        className={grupo.classe}
      />
    </div>
  );
}
