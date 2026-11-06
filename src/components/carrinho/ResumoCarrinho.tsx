'use client';

import { totaisDoCarrinho, type ItemVisivel } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';

export interface TextosResumo {
  total: string;
  noPix: string;
  noCartao: string;
  umPagamento: string;
  finalizar: string;
  continuar: string;
}

/** O total do carrinho (no Pix em destaque e no cartão), um pagamento só, e o botão de finalizar. */
export function ResumoCarrinho({
  itens,
  locale,
  hrefFinalizar,
  textos: T,
  aoContinuar,
}: {
  itens: ItemVisivel[];
  locale: string;
  hrefFinalizar: string;
  textos: TextosResumo;
  /** Fecha a gaveta. */
  aoContinuar?: () => void;
}) {
  const { totalCentavos, totalPixCentavos } = totaisDoCarrinho(itens);
  const brl = (c: number) => formatarCifra(c, locale);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">
          {T.total} <span className="text-(--color-sucesso)">{T.noPix}</span>
        </span>
        <strong className="cifra text-figure">{brl(totalPixCentavos)}</strong>
      </div>
      <p className="flex items-baseline justify-between gap-4 text-small text-(--color-tinta-suave)">
        <span>
          {T.total} {T.noCartao}
        </span>
        <span className="numeros font-semibold text-(--color-tinta)">{brl(totalCentavos)}</span>
      </p>
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
