'use client';

import { DESCONTO_PIX_PORCENTO } from '@/config/precos';
import { fmt, type Idioma } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import { textoDolar } from '@/lib/dolar';
import type { FormaPagamento, MotivoSemPix } from '@/lib/formas-pagamento';

/** Os textos da escolha (chaves de checkout.* e preco.*; o servidor monta a partir do dicionário). */
export interface TextosEscolhaPagamento {
  /** "Forma de pagamento" */
  formaPagamento: string;
  cartao: string;
  pix: string;
  /** A linha embaixo do cartão: à vista, Visa e Mastercard, crédito ou débito. */
  cartaoAvista: string;
  /** A linha embaixo do Pix: como se paga pelo app do banco. */
  pixExplicacao: string;
  /** Os apps de fora do Brasil que já pagam Pix (só os confirmados). */
  pixApps: string;
  /** Antes de pagar: o nome que o app do banco mostra no Pix pode ser o da empresa que processa o pagamento. */
  pixRecebedor: string;
  /** "{p}% de desconto no Pix" (preco.descontoPix). */
  descontoPix: string;
  /** Quando o Pix não dá mais tempo (o serviço começa em menos de 2 horas): a frase do prazo. */
  semPixPrazo: string;
  /** Quando o valor do pedido passa do limite de um Pix: a frase do limite. */
  semPixLimite: string;
  /** "≈ US$ {v}" */
  dolar: string;
}

/** A frase de por que o Pix não aparece: a do limite de valor, ou a do prazo (o motivo de sempre, quando não se sabe). */
export const fraseSemPix = (T: Pick<TextosEscolhaPagamento, 'semPixPrazo' | 'semPixLimite'>, motivo?: MotivoSemPix): string =>
  motivo === 'limite' ? T.semPixLimite : T.semPixPrazo;

/** Quanto cada forma cobra, em centavos: o total no cartão e o total no Pix (com o desconto; nas casas, o sinal). */
export interface TotaisDasFormas {
  cartaoCentavos: number;
  pixCentavos: number;
}

export const valorDaForma = (totais: TotaisDasFormas, forma: FormaPagamento): number =>
  forma === 'pix' ? totais.pixCentavos : totais.cartaoCentavos;

/**
 * A forma que já vem marcada: a que o pedido tinha, se ainda estiver disponível; senão, o Pix para quem lê em
 * português (tem o desconto e todo banco brasileiro paga) e o cartão para quem lê nos outros idiomas (o Pix de
 * fora depende do app do banco). Null sem nenhuma forma disponível.
 */
export function formaPadrao(formas: FormaPagamento[], idioma: Idioma, atual?: FormaPagamento): FormaPagamento | null {
  if (atual && formas.includes(atual)) return atual;
  const preferida: FormaPagamento = idioma === 'pt' ? 'pix' : 'cartao';
  return formas.includes(preferida) ? preferida : (formas[0] ?? null);
}

/**
 * Cartão ou Pix, cada um com o valor em R$ (e o ≈ US$ nos idiomas que já o mostram). O Pix some quando o servidor
 * não o liberou (o serviço começa em menos de 2 horas e 10 minutos, ou o valor passa do limite de um Pix), e a frase
 * do motivo explica. Embaixo do Pix, o aviso do nome que aparece no app do banco. Só apresenta: quem decide as formas
 * é o servidor (formasDoPagamento).
 */
export function EscolhaPagamento({
  formas,
  semPix,
  escolhida,
  aoEscolher,
  totais,
  locale,
  dolar = null,
  textos: T,
  className = '',
}: {
  /** As formas que o servidor liberou agora. */
  formas: FormaPagamento[];
  /** Por que o Pix ficou de fora, quando ficou (o servidor decide). */
  semPix?: MotivoSemPix;
  escolhida: FormaPagamento | null;
  aoEscolher: (forma: FormaPagamento) => void;
  totais: TotaisDasFormas;
  locale: string;
  /** Reais por dólar, para o "≈ US$" das páginas em espanhol e inglês (null no português). */
  dolar?: number | null;
  textos: TextosEscolhaPagamento;
  className?: string;
}) {
  const brl = (c: number) => formatarCifra(c, locale);
  const usd = (c: number) => textoDolar(c, dolar, T.dolar, locale);
  // o Pix primeiro, como o total no Pix vem em destaque no site inteiro
  const opcoes = (['pix', 'cartao'] as const).filter((forma) => formas.includes(forma));
  const desconto = fmt(T.descontoPix, { p: DESCONTO_PIX_PORCENTO });

  return (
    <fieldset className={`min-w-0 ${className}`}>
      <legend className="text-lead font-semibold">{T.formaPagamento}</legend>
      {/* rádios de verdade (o grupo é o fieldset): setas do teclado e leitores de tela funcionam sem nada a mais */}
      <div className="mt-5 grid gap-3">
        {opcoes.map((forma) => {
          const ativa = escolhida === forma;
          const centavos = valorDaForma(totais, forma);
          const emDolar = usd(centavos);
          return (
            <label
              key={forma}
              data-ativo={ativa}
              className="group block cursor-pointer rounded-celula border border-(--color-borda-campo) bg-(--color-papel) px-5 py-4 transition-[border-color,box-shadow] duration-200 hover:border-(--color-tinta) has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-turquesa data-[ativo=true]:border-(--color-tinta) data-[ativo=true]:shadow-[inset_0_0_0_1px_var(--color-tinta)]"
            >
              <input
                type="radio"
                name="forma-pagamento"
                value={forma}
                checked={ativa}
                onChange={() => aoEscolher(forma)}
                className="sr-only"
              />
              <span className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-3">
                  {/* a bolinha do rádio, desenhada para acompanhar a cor da tinta (taste-skill-ignore) */}
                  <span
                    aria-hidden="true"
                    className="size-5 shrink-0 rounded-full border-2 border-(--color-borda-campo) transition-[border-width,border-color] duration-200 group-data-[ativo=true]:border-[6px] group-data-[ativo=true]:border-(--color-tinta)"
                  />
                  <span className="text-lead font-semibold leading-tight">{forma === 'pix' ? T.pix : T.cartao}</span>
                </span>
                <span className="cifra text-figure">{brl(centavos)}</span>
              </span>
              {/* o aproximado em dólar flutua à direita, sob o preço, e a descrição corre em volta dele: na tela
                  estreita ela quebra em duas linhas e o dólar não cai sozinho para a linha de baixo. A descrição é um
                  bloco (com um espaço antes) só para o dólar não sair colado nela no texto lido em voz alta ou copiado.
                  A frase do desconto não se parte: quando não cabe ao lado do dólar, desce inteira para a linha de baixo */}
              <span className="mt-1.5 flow-root pl-8 text-small">
                {emDolar && (
                  <>
                    <span className="float-right ml-4 whitespace-nowrap text-(--color-tinta-suave)">{emDolar}</span>{' '}
                  </>
                )}
                {forma === 'pix' ? (
                  <span className="block font-semibold text-(--color-sucesso)">
                    <span className="inline-block">{desconto}</span>
                  </span>
                ) : (
                  <span className="block text-(--color-tinta-suave)">{T.cartaoAvista}</span>
                )}
              </span>
              {forma === 'pix' && (
                <>
                  <span className="mt-2 block pl-8 text-small text-(--color-tinta-suave)">
                    {/* a frase dos apps de fora é vazia em português: sem ela, só a explicação, sem espaço sobrando */}
                    {T.pixApps ? `${T.pixExplicacao} ${T.pixApps}` : T.pixExplicacao}
                  </span>
                  {/* com o Pix marcado, antes de pagar: o app do banco pode mostrar outro nome no recebedor, e isso não é
                      golpe. Só com ele marcado, para a tela do celular não crescer à toa (o aviso volta em cima do QR) */}
                  {ativa && <span className="mt-2 block pl-8 text-small text-(--color-tinta-suave)">{T.pixRecebedor}</span>}
                </>
              )}
            </label>
          );
        })}
      </div>
      {!formas.includes('pix') && <p className="ajuda mt-3">{fraseSemPix(T, semPix)}</p>}
    </fieldset>
  );
}
