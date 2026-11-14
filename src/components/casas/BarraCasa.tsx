'use client';

import { useBarraOculta } from '../BarraReservaMovel';

const ALVOS = ['#reservar', '#outras-casas', 'footer'];

/**
 * A barra fixa do celular na página da casa (Etapa 7, parte 7), em vidro escuro, em três linhas curtas que cabem de
 * 320 a 430 px nos quatro idiomas: o que é o preço ("Diária a partir de", ou as diárias e as datas escolhidas), o
 * valor no Pix em destaque e o valor no cartão embaixo. Sem datas, o botão leva ao calendário; com as datas escolhidas,
 * à conta. Some enquanto o calendário e o quadro da reserva aparecem, e perto do rodapé. Sem dólar (decisão de 07/11).
 */
export function BarraCasa({
  rotulo,
  pix,
  noPix,
  cartao,
  noCartao,
  botao,
  href,
}: {
  /** "Diária a partir de" ou "3 diárias · 11/12 a 14/12". */
  rotulo: string;
  /** O valor no Pix, já formatado. */
  pix: string;
  noPix: string;
  /** O valor no cartão, já formatado. */
  cartao: string;
  noCartao: string;
  botao: string;
  href: string;
}) {
  const oculta = useBarraOculta(ALVOS);
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 px-2 transition-transform duration-300 lg:hidden ${oculta ? 'translate-y-[calc(100%+1rem)]' : ''}`}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
      aria-hidden={oculta}
    >
      <div className="barra-casa vidro vidro-escuro rounded-vidro">
        <div className="min-w-0">
          <p className="truncate text-caption text-white/90 first-letter:uppercase">{rotulo}</p>
          <p className="truncate leading-tight">
            <strong className="cifra text-lead">{pix}</strong> <span className="text-small font-semibold">{noPix}</span>
          </p>
          <p className="truncate text-caption text-white/90">
            <span className="numeros">{cartao}</span> {noCartao}
          </p>
        </div>
        <a href={href} className="botao barra-casa-botao" tabIndex={oculta ? -1 : undefined}>
          {botao}
        </a>
      </div>
    </div>
  );
}
