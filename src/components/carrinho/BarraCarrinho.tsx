'use client';

import { usePathname } from 'next/navigation';
import { totaisDoCarrinho } from '@/lib/carrinho';
import { formatarCifra } from '@/lib/cifra';
import { useBarraOculta } from '../BarraReservaMovel';
import { useCarrinho } from './CarrinhoContexto';
import { textoQuantidade, type TextosCarrinho } from './GavetaCarrinho';
import { IconeSacola } from './IconeSacola';

// páginas que já têm a própria barra de reserva embaixo, e as do checkout, da reserva e do pedido
const SEM_BARRA = /\/(passeios\/[^/]+|transfer|casas-de-temporada\/[^/]+|checkout|reserva|pedido)(\/|$)/;
const ALVOS = ['footer'];

/** No celular, com itens no carrinho: a barra de vidro embaixo, com o total no Pix e o "Finalizar". */
export function BarraCarrinho({ locale, hrefFinalizar, textos: T }: { locale: string; hrefFinalizar: string; textos: TextosCarrinho }) {
  const { itens, abrir } = useCarrinho();
  const caminho = usePathname();
  const oculta = useBarraOculta(ALVOS);
  if (!itens.length || SEM_BARRA.test(caminho)) return null;
  const { totalPixCentavos } = totaisDoCarrinho(itens);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 px-2 transition-transform duration-300 lg:hidden ${oculta ? 'translate-y-[calc(100%+1rem)]' : ''}`}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      aria-hidden={oculta}
    >
      <div className="vidro vidro-escuro flex items-center justify-between gap-3 rounded-vidro py-2 pl-2 pr-2">
        <button
          type="button"
          onClick={abrir}
          className="flex min-w-0 items-center gap-3 rounded-[12px] py-1 pl-2 pr-3 text-left"
          aria-haspopup="dialog"
        >
          <span className="relative shrink-0">
            <IconeSacola className="size-6" />
            <span className="numeros absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-(--color-acao) px-1 text-[0.625rem] font-bold leading-none text-(--color-tinta)">
              {itens.length}
            </span>
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-caption text-white/80">{textoQuantidade(T, itens.length)}</span>
            <strong className="cifra text-lead">{formatarCifra(totalPixCentavos, locale)}</strong>{' '}
            <span className="text-small">{T.noPix}</span>
          </span>
        </button>
        <a href={hrefFinalizar} className="botao shrink-0">
          {T.finalizar}
        </a>
      </div>
    </div>
  );
}
