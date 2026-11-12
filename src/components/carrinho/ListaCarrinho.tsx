'use client';

import Image from 'next/image';
import type { ItemVisivel } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';
import { textoDolar } from '@/lib/dolar';
import { ComDolar } from '../ComDolar';

export interface TextosLista {
  mudar: string;
  remover: string;
  noPix: string;
  noCartao: string;
  /** "≈ US$ {v}" */
  dolar: string;
}

/**
 * Os itens do carrinho: foto, nome, data e quem vai, o preço no Pix e no cartão (com o aproximado em dólar
 * ao lado em espanhol e inglês), mudar e tirar.
 */
export function ListaCarrinho({
  itens,
  locale,
  dolar = null,
  textos: T,
  aoRemover,
}: {
  itens: ItemVisivel[];
  locale: string;
  /** Reais por dólar, para o "≈ US$" (null no português e sem cotação). */
  dolar?: number | null;
  textos: TextosLista;
  aoRemover: (id: string) => void;
}) {
  const brl = (c: number) => formatarCifra(c, locale);
  const usd = (c: number) => textoDolar(c, dolar, T.dolar, locale);
  return (
    <ul className="divide-y divide-(--color-borda)">
      {itens.map((i) => (
        <li key={i.id} className="flex gap-3.5 py-4 first:pt-0">
          <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-[8px] bg-(--color-superficie)">
            {i.foto && <Image src={i.foto} alt="" fill sizes="72px" className="object-cover" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="font-[family-name:var(--font-semi)] font-semibold leading-snug">{i.titulo}</p>
              <button
                type="button"
                onClick={() => aoRemover(i.id)}
                aria-label={`${T.remover}: ${i.titulo}`}
                title={T.remover}
                className="-mr-1.5 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-(--color-tinta-suave) transition-colors duration-200 hover:bg-(--color-superficie) hover:text-(--color-tinta)"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            {i.detalhes.map((d) => (
              <p key={d} className="text-small text-(--color-tinta-suave)">
                {d}
              </p>
            ))}
            {/* "R$ 69,30 no Pix" e "≈ US$ 12,46" ficam inteiros: a linha só quebra entre os dois pedaços (o mesmo no cartão) */}
            <p className="mt-1.5">
              <ComDolar dolar={usd(i.totalPixCentavos)} className="text-small text-(--color-tinta-suave)">
                <span className="whitespace-nowrap">
                  <span className="cifra font-semibold">{brl(i.totalPixCentavos)}</span>{' '}
                  <span className="text-small font-semibold text-(--color-sucesso)">{T.noPix}</span>
                </span>
              </ComDolar>
            </p>
            {/* quando o valor no cartão e o "Mudar" não cabem lado a lado, o "Mudar" desce para a linha de baixo, à direita */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-small">
              <p className="flex-1 text-(--color-tinta-suave)">
                <ComDolar dolar={usd(i.totalCentavos)}>
                  <span className="whitespace-nowrap">
                    <span className="numeros">{brl(i.totalCentavos)}</span> {T.noCartao}
                  </span>
                </ComDolar>
              </p>
              <a href={i.href} className="link ml-auto">
                {T.mudar}
              </a>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
