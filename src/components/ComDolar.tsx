import type { ReactNode } from 'react';

/**
 * Um rótulo ou valor em real com o aproximado em dólar ao lado: "Total no Pix · ≈ US$ 24,93". Cada pedaço fica inteiro
 * e, quando os dois não cabem na mesma linha, o dólar desce para a linha de baixo sem o "·" na frente: o "·" mora numa
 * folga à esquerda do dólar, da largura de " · " no texto pequeno (o tamanho do dólar; 0.611 vezes o tamanho, medido
 * no Barlow), e no começo de uma linha essa folga cai fora do recorte, como na faixa da reserva (StatusReserva). O
 * recorte só corta à esquerda, onde não há mais nada. Sem dólar (português), fica só o primeiro pedaço, como sempre foi.
 */
export function ComDolar({
  children,
  dolar,
  className = '',
}: {
  children: ReactNode;
  /** "≈ US$ 24,93"; vazio no português */
  dolar?: string | null;
  /** cor, tamanho e peso do dólar (o "·" vai junto) */
  className?: string;
}) {
  if (!dolar) return <>{children}</>;
  return (
    <span className="block [--folga:calc(0.611*var(--text-small))] [clip-path:inset(-1em_-100vw_-1em_0)]">
      {/* pela linha de base: o dólar (letra menor) fica na mesma linha das letras do rótulo, como no texto corrido */}
      <span className="-ml-(--folga) flex flex-wrap items-baseline">
        <span className="pl-(--folga)">{children}</span>
        <span className={`whitespace-nowrap ${className}`}>
          <span aria-hidden="true" className="inline-block w-(--folga) text-center">
            ·
          </span>
          {dolar}
        </span>
      </span>
    </span>
  );
}
