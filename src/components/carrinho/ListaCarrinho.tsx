'use client';

import Image from 'next/image';
import { fmt } from '@/i18n/config';
import { cobradoHoje, type ItemVisivel } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';
import { textoDolar } from '@/lib/dolar';
import { cartaoEmDestaque, rotuloPixComDesconto } from '@/lib/preco-destaque';
import { ComDolar, Inteiro } from '../ComDolar';
import { TextoDoItem } from './TextoDoItem';

export interface TextosLista {
  mudar: string;
  remover: string;
  noPix: string;
  noCartao: string;
  /** "con Pix (−{p}%)": o Pix na linha de baixo, quando o cartão é o preço grande (espanhol e inglês) */
  noPixComDesconto: string;
  /** "≈ US$ {v}" */
  dolar: string;
  /** Na casa: "Total da estadia: {pix} no Pix ou {cartao} no cartão" (o preço da linha é o sinal, o que se paga hoje). */
  casaTotalDaEstadia: string;
  /** O mesmo, só no cartão ("Total da estadia: {cartao} no cartão"): o checkout sem o Pix. */
  casaTotalDaEstadiaCartao: string;
  /** A casa que alguém reservou enquanto estava no carrinho: o aviso, no lugar do preço, com o "Mudar" ao lado. */
  casaIndisponivel: string;
  /** A casa cuja reserva fechou para este visitante: o aviso, no lugar do preço; ela sai pelo X. */
  casaFechada: string;
  /** Pacote 2: a casa de um carrinho antigo que mudou (capacidade, pacote, mínimo, fim de semana), com o "Mudar". */
  casaMudou: string;
  /** Pacote 2: a casa que saiu do ar, com o "Mudar" para a lista das casas. */
  casaForaDoAr: string;
}

/**
 * Os itens do carrinho: foto, nome, data e quem vai, o preço no Pix e no cartão (com o aproximado em dólar
 * ao lado em espanhol e inglês), mudar e tirar. Em português o Pix vem em cima; em espanhol e inglês, o cartão em cima e
 * o Pix embaixo, com o desconto (src/lib/preco-destaque.ts). Com `soCartao` (o checkout sem o Pix, pelo prazo ou pelo limite de
 * valor), só o preço no cartão, que é o que o pedido vai cobrar. Na casa, o preço é o sinal (o que se paga hoje), com a
 * linha do total da estadia embaixo (sem o Pix, só a do cartão); a casa indisponível mostra o aviso no lugar do preço: a
 * ocupada, a que mudou e a que saiu do ar (pacote 2), com o "Mudar"; a fechada (a reserva das casas fechou), só com o X.
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
  const cartaoPrimeiro = cartaoEmDestaque(locale);
  return (
    <ul className="divide-y divide-(--color-borda)">
      {itens.map((i) => {
        // o que o item cobra hoje: o total no passeio e no transfer; na casa, o sinal
        const cartaoHoje = cobradoHoje(i, 'cartao');
        const pixHoje = cobradoHoje(i, 'pix');
        return (
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
              {i.indisponivel ? (
                // a casa que alguém reservou enquanto estava no carrinho: fora da conta, com o "Mudar" para outras datas. A casa
                // cuja reserva fechou (o interruptor ou o pagamento online): fora da conta, sem o "Mudar" (a página dela não
                // reserva agora); o X de cima tira a casa, e o resto do carrinho segue
                <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-small">
                  <p className="max-w-full flex-1 font-semibold text-(--color-tinta)" role="status">
                    {i.indisponivel === 'fechada'
                      ? T.casaFechada
                      : i.indisponivel === 'mudou'
                        ? T.casaMudou
                        : i.indisponivel === 'fora-do-ar'
                          ? T.casaForaDoAr
                          : T.casaIndisponivel}
                  </p>
                  {i.indisponivel !== 'fechada' && (
                    <a href={i.href} className="link ml-auto">
                      {T.mudar}
                    </a>
                  )}
                </div>
              ) : soCartao ? (
                // sem o Pix neste pedido: só o preço no cartão, no lugar (e com o peso) do preço no Pix; o "Mudar" ao lado,
                // descendo para a linha de baixo, à direita, quando não cabe
                <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="max-w-full flex-1">
                    <ComDolar dolar={usd(cartaoHoje)} className="text-small text-(--color-tinta-suave)">
                      <Inteiro>
                        <span className="cifra font-semibold">{brl(cartaoHoje)}</span>{' '}
                        <span className="whitespace-nowrap text-small font-semibold">{T.noCartao}</span>
                      </Inteiro>
                    </ComDolar>
                  </p>
                  <a href={i.href} className="link ml-auto text-small">
                    {T.mudar}
                  </a>
                </div>
              ) : cartaoPrimeiro ? (
                <>
                  {/* espanhol e inglês: o cartão em cima, com o peso de sempre, e o Pix embaixo com o desconto */}
                  <p className="mt-1.5">
                    <ComDolar dolar={usd(cartaoHoje)} className="text-small text-(--color-tinta-suave)">
                      <Inteiro>
                        <span className="cifra font-semibold">{brl(cartaoHoje)}</span>{' '}
                        <span className="whitespace-nowrap text-small font-semibold">{T.noCartao}</span>
                      </Inteiro>
                    </ComDolar>
                  </p>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-small">
                    <p className="max-w-full flex-1 text-(--color-tinta-suave)">
                      <ComDolar dolar={usd(pixHoje)}>
                        <Inteiro>
                          <span className="numeros">{brl(pixHoje)}</span>{' '}
                          <span className="whitespace-nowrap font-semibold text-(--color-sucesso)">
                            {rotuloPixComDesconto(T.noPixComDesconto)}
                          </span>
                        </Inteiro>
                      </ComDolar>
                    </p>
                    <a href={i.href} className="link ml-auto">
                      {T.mudar}
                    </a>
                  </div>
                </>
              ) : (
                <>
                  {/* "R$ 69,30 no Pix" e "≈ US$ 12,46" ficam inteiros: a linha só quebra entre os dois pedaços (o mesmo no
                    cartão). Só quando o "R$ 69,30 no Pix" nem sozinho cabe na linha, ele quebra entre o valor e o "no Pix" */}
                  <p className="mt-1.5">
                    <ComDolar dolar={usd(pixHoje)} className="text-small text-(--color-tinta-suave)">
                      <Inteiro>
                        <span className="cifra font-semibold">{brl(pixHoje)}</span>{' '}
                        <span className="whitespace-nowrap text-small font-semibold text-(--color-sucesso)">{T.noPix}</span>
                      </Inteiro>
                    </ComDolar>
                  </p>
                  {/* quando o valor no cartão e o "Mudar" não cabem lado a lado, o "Mudar" desce para a linha de baixo, à direita */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-small">
                    <p className="max-w-full flex-1 text-(--color-tinta-suave)">
                      <ComDolar dolar={usd(cartaoHoje)}>
                        <Inteiro>
                          <span className="numeros">{brl(cartaoHoje)}</span> <span className="whitespace-nowrap">{T.noCartao}</span>
                        </Inteiro>
                      </ComDolar>
                    </p>
                    <a href={i.href} className="link ml-auto">
                      {T.mudar}
                    </a>
                  </div>
                </>
              )}
              {/* na casa, embaixo do sinal: o total da estadia nas duas formas; no checkout sem o Pix (o limite de um Pix ou o
                  prazo), só o do cartão, como o resto da tela: um preço no Pix que não dá para pagar confundia */}
              {i.casa && !i.indisponivel && (
                <p className="mt-1 text-small text-(--color-tinta-suave)">
                  <TextoDoItem
                    texto={
                      soCartao
                        ? fmt(T.casaTotalDaEstadiaCartao, { cartao: brl(i.totalCentavos) })
                        : fmt(T.casaTotalDaEstadia, { pix: brl(i.totalPixCentavos), cartao: brl(i.totalCentavos) })
                    }
                    letra="linha"
                  />
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
