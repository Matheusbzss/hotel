'use client';

import { totaisDoCarrinho, type ItemVisivel } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';
import { textoDolar } from '@/lib/dolar';
import { ComDolar } from '../ComDolar';

export interface TextosResumo {
  total: string;
  noPix: string;
  noCartao: string;
  /** "≈ US$ {v}" */
  dolar: string;
  umPagamento: string;
  finalizar: string;
  continuar: string;
}

/** O total do carrinho (no Pix em destaque e no cartão), um pagamento só, e o botão de finalizar. */
export function ResumoCarrinho({
  itens,
  locale,
  hrefFinalizar,
  dolar = null,
  notaCambio = '',
  textos: T,
  aoContinuar,
}: {
  itens: ItemVisivel[];
  locale: string;
  hrefFinalizar: string;
  /** Reais por dólar, para o "≈ US$" das páginas em espanhol e inglês (null no português). */
  dolar?: number | null;
  /** A nota com a fonte e a data da cotação, perto do total (vazia sem o ≈ US$). */
  notaCambio?: string;
  textos: TextosResumo;
  /** Fecha a gaveta. */
  aoContinuar?: () => void;
}) {
  const { totalCentavos, totalPixCentavos } = totaisDoCarrinho(itens);
  const brl = (c: number) => formatarCifra(c, locale);
  const usd = (c: number) => textoDolar(c, dolar, T.dolar, locale);
  return (
    <div>
      {/* o rótulo ocupa o que sobra ao lado do valor e quebra entre os pedaços, como sempre; só quando nem a maior parte
          dele cabe ao lado (letra grande em tela estreita), o valor desce para a linha de baixo, à direita, em vez de
          passar da borda da gaveta. Com a letra normal, a partir de 320 px, fica igual */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {/* "Total no Pix" e "≈ US$ 12,46" ficam inteiros: o rótulo só quebra entre os dois pedaços */}
        <span className="grow basis-0 font-semibold">
          <ComDolar dolar={usd(totalPixCentavos)} className="text-small font-normal text-(--color-tinta-suave)">
            <span className="whitespace-nowrap">
              {T.total} <span className="text-(--color-sucesso)">{T.noPix}</span>
            </span>
          </ComDolar>
        </span>
        <strong className="cifra ml-auto text-figure">{brl(totalPixCentavos)}</strong>
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small text-(--color-tinta-suave)">
        <span className="grow basis-0">
          <ComDolar dolar={usd(totalCentavos)}>
            <span className="whitespace-nowrap">
              {T.total} {T.noCartao}
            </span>
          </ComDolar>
        </span>
        <span className="numeros ml-auto font-semibold text-(--color-tinta)">{brl(totalCentavos)}</span>
      </p>
      {/* a fonte e a data da cotação, só quando o ≈ US$ aparece (espanhol e inglês) */}
      {dolar && notaCambio && <p className="mt-2 text-caption text-(--color-tinta-suave)">{notaCambio}</p>}
      <p className="mt-3 text-small text-(--color-tinta-suave)">{T.umPagamento}</p>
      <a
        href={hrefFinalizar}
        className="botao mt-4 w-full"
        onClick={(e) => {
          // já no checkout, só fecha a gaveta: recarregar a página apagaria o que o cliente digitou
          if (window.location.pathname !== hrefFinalizar) return;
          e.preventDefault();
          aoContinuar?.();
        }}
      >
        {T.finalizar}
      </a>
      {aoContinuar && (
        <button type="button" onClick={aoContinuar} className="link mx-auto mt-3 block text-small">
          {T.continuar}
        </button>
      )}
    </div>
  );
}
