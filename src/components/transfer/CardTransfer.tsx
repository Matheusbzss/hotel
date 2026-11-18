import Image from 'next/image';
import { altDaFoto } from '@/data/fotos-alt';
import type { Cidade } from '@/data/passeios';
import { menorPrecoDaZona, type Zona } from '@/data/transfer';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, rota, type Idioma } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { cotacaoDolar, textoDolar } from '@/lib/dolar';
import { precoPixCentavos } from '@/lib/orcamento';
import { ComDolar, Pedaco, Pedacos } from '../ComDolar';
import { CartaoInclinavel } from '../Inclinar';

/** A cidade do trilho vira a zona de preço do transfer (o Rio inclui os dois aeroportos). */
const ZONA: Record<Cidade, Zona> = {
  buzios: 'buzios',
  'arraial-do-cabo': 'arraial-do-cabo',
  'cabo-frio': 'cabo-frio',
  'rio-de-janeiro': 'rio',
};

/**
 * O transfer como mais uma opção no trilho de cada cidade: a foto real do carro no aeroporto, o preço
 * "a partir de" por veículo (no Pix em destaque e no cartão, com o aproximado em dólar ao lado em espanhol
 * e inglês, como no cartão do passeio) e o atalho para a página do transfer com a cidade já no destino.
 */
export async function CardTransfer({ cidade, idioma, d }: { cidade: Cidade; idioma: Idioma; d: Dicionario }) {
  const T = d.transfer;
  const menor = menorPrecoDaZona(ZONA[cidade]);
  const centavos = menor === null ? null : Math.round(menor * 100);
  const preco = centavos === null ? null : formatarCifra(centavos, LOCALE_INTL[idioma]);
  const pix = centavos === null ? null : formatarCifra(precoPixCentavos(centavos), LOCALE_INTL[idioma]);
  const cotacao = idioma === 'pt' || centavos === null ? null : await cotacaoDolar();
  const usdPix = centavos === null ? '' : textoDolar(precoPixCentavos(centavos), cotacao, d.preco.dolar, LOCALE_INTL[idioma]);
  const usdCartao = centavos === null ? '' : textoDolar(centavos, cotacao, d.preco.dolar, LOCALE_INTL[idioma]);
  const rotulo = [
    T.titulo,
    T.cartaoTexto,
    preco && `${d.comum.aPartirDe} ${pix} ${d.preco.noPix}, ${preco} ${d.preco.noCartao} ${T.porVeiculo}`,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <CartaoInclinavel href={rota(idioma, `/transfer?destino=${cidade}`)} rotulo={rotulo}>
      <div className="cartao-foto">
        <div className="absolute inset-0">
          <Image
            src="/fotos/transfer/carro-creta-aeroporto.jpg"
            alt={altDaFoto('/fotos/transfer/carro-creta-aeroporto.jpg', idioma)}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 46vw, 80vw"
            className="object-cover"
            style={{ objectPosition: '50% 45%' }}
          />
        </div>
        <div className="etiquetas" aria-hidden="true">
          <span className="etiqueta vidro vidro-escuro">{T.etiquetas[0]}</span>
        </div>
      </div>
      <div className="cartao-texto" aria-hidden="true">
        <h3 className="cartao-titulo">{T.titulo}</h3>
        {preco && (
          <>
            {/* cada pedaço fica inteiro e o "·" do dólar só aparece ao lado de outro pedaço, nunca no começo da linha */}
            <p className="mt-2">
              <Pedacos folga="justa" comPonto={Boolean(usdPix)}>
                <Pedaco className="text-small text-(--color-tinta-suave)">{d.comum.aPartirDe}</Pedaco>
                <Pedaco forte className="cifra text-figure">
                  {pix}
                </Pedaco>
                <Pedaco className="text-small font-semibold whitespace-nowrap text-(--color-sucesso)">{d.preco.noPix}</Pedaco>
                {usdPix && (
                  <Pedaco ponto className="text-small text-(--color-tinta-suave)">
                    {usdPix}
                  </Pedaco>
                )}
                <Pedaco className="text-small text-(--color-tinta-suave)">{T.porVeiculo}</Pedaco>
              </Pedacos>
            </p>
            <p className="text-small text-(--color-tinta-suave)">
              <ComDolar dolar={usdCartao}>
                <span className="whitespace-nowrap">
                  <span className="numeros font-semibold text-(--color-tinta)">{preco}</span> {d.preco.noCartao}
                </span>
              </ComDolar>
            </p>
          </>
        )}
        <p className="mt-1 text-caption text-(--color-tinta-suave)">{T.cartaoTexto}</p>
      </div>
    </CartaoInclinavel>
  );
}
