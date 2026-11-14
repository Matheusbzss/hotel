'use client';

import Image from 'next/image';
import type { ItemVisivel } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';
import { textoDolar } from '@/lib/dolar';
import { ComDolar, Inteiro } from '../ComDolar';
import { TextoDoItem } from './TextoDoItem';

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
 * ao lado em espanhol e inglês), mudar e tirar. Com `soCartao` (o checkout sem o Pix, pelo prazo ou pelo limite de
 * valor), só o preço no cartão, que é o que o pedido vai cobrar.
 */
export function ListaCarrinho({
  itens,
  locale,
  dolar = null,
  soCartao = false,
  textos: T,
  aoRemover,
}: {
  itens: ItemVisivel[];
  locale: string;
  /** Reais por dólar, para o "≈ US$" (null no português e sem cotação). */
  dolar?: number | null;
  /** O pedido não pode ser pago com Pix: o preço "no Pix" sai, e o do cartão fica em destaque. */
  soCartao?: boolean;
  textos: TextosLista;
  aoRemover: (id: string) => void;
}) {
  const brl = (c: number) => formatarCifra(c, locale);
  const usd = (c: number) => textoDolar(c, dolar, T.dolar, locale);
  return (
    <ul className="divide-y divide-(--color-borda)">
      {itens.map((i) => (
        // o texto fica ao lado da foto; só quando a maior parte dele que não quebra (o preço, "8 pasajeros") nem cabe ao
        // lado dela (letra grande em tela estreita), ele desce para baixo da foto, com a largura toda. Com a letra
        // normal, a partir de 320 px, ele sempre cabe ao lado e nada muda. @container: a largura do item decide quando
        // o preço e a parte da direita do nome podem quebrar por dentro (Inteiro)
        <li key={i.id} className="@container flex flex-wrap gap-3.5 py-4 first:pt-0">
          <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-[8px] bg-(--color-superficie)">
            {i.foto && <Image src={i.foto} alt="" fill sizes="72px" className="object-cover" />}
          </div>
          <div className="max-w-full flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-[family-name:var(--font-semi)] font-semibold leading-snug">
                <TextoDoItem texto={i.titulo} letra="nome" />
              </p>
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
                <TextoDoItem texto={d} letra="linha" />
              </p>
            ))}
            {soCartao ? (
              // sem o Pix neste pedido: só o preço no cartão, no lugar (e com o peso) do preço no Pix; o "Mudar" ao lado,
              // descendo para a linha de baixo, à direita, quando não cabe
              <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="max-w-full flex-1">
                  <ComDolar dolar={usd(i.totalCentavos)} className="text-small text-(--color-tinta-suave)">
                    <Inteiro>
                      <span className="cifra font-semibold">{brl(i.totalCentavos)}</span>{' '}
                      <span className="whitespace-nowrap text-small font-semibold">{T.noCartao}</span>
                    </Inteiro>
                  </ComDolar>
                </p>
                <a href={i.href} className="link ml-auto text-small">
                  {T.mudar}
                </a>
              </div>
            ) : (
              <>
                {/* "R$ 69,30 no Pix" e "≈ US$ 12,46" ficam inteiros: a linha só quebra entre os dois pedaços (o mesmo no
                    cartão). Só quando o "R$ 69,30 no Pix" nem sozinho cabe na linha, ele quebra entre o valor e o "no Pix" */}
                <p className="mt-1.5">
                  <ComDolar dolar={usd(i.totalPixCentavos)} className="text-small text-(--color-tinta-suave)">
                    <Inteiro>
                      <span className="cifra font-semibold">{brl(i.totalPixCentavos)}</span>{' '}
                      <span className="whitespace-nowrap text-small font-semibold text-(--color-sucesso)">{T.noPix}</span>
                    </Inteiro>
                  </ComDolar>
                </p>
                {/* quando o valor no cartão e o "Mudar" não cabem lado a lado, o "Mudar" desce para a linha de baixo, à direita */}
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-small">
                  <p className="max-w-full flex-1 text-(--color-tinta-suave)">
                    <ComDolar dolar={usd(i.totalCentavos)}>
                      <Inteiro>
                        <span className="numeros">{brl(i.totalCentavos)}</span> <span className="whitespace-nowrap">{T.noCartao}</span>
                      </Inteiro>
                    </ComDolar>
                  </p>
                  <a href={i.href} className="link ml-auto">
                    {T.mudar}
                  </a>
                </div>
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
