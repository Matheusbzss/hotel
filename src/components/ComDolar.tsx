import type { ReactNode } from 'react';

/**
 * A folga é o espaço na frente de cada pedaço, onde mora o "·". `pequeno` e `legenda`: a largura de " · " no texto
 * pequeno e na legenda (0.611 vezes o tamanho, medido no Barlow). `justa`: 7 px no texto pequeno, para as linhas de
 * preço com vários pedaços (cartões, topo do passeio, topo do quadro de reserva): perto do vão de 6 px que esses
 * pedaços sempre tiveram, com o "·" um pouco mais justo. Com " · " inteiro, essas linhas ficavam uns 4 px mais largas e,
 * em algumas larguras de tela, ganhavam uma linha a mais.
 */
const FOLGA = {
  pequeno: '[--folga:calc(0.611*var(--text-small))]',
  legenda: '[--folga:calc(0.611*var(--text-caption))]',
  justa: '[--folga:calc(0.4667*var(--text-small))]',
} as const;

/**
 * Uma linha de pedaços que só quebra entre eles ("desde", "R$ 69,30", "con Pix", "≈ US$ 12,46", "por persona"): o
 * pedaço que não cabe desce inteiro para a linha de baixo, alinhado à esquerda, e o pedaço com `ponto` ganha o "·" na
 * frente só quando fica ao lado de outro. Cada pedaço tem na frente a folga (é ali que mora o "·") e, no começo de uma
 * linha, a folga cai fora do recorte, como na faixa da reserva (StatusReserva). Por isso o espaço entre dois pedaços é
 * sempre a folga. O recorte só corta à esquerda, onde não há mais nada. Pela linha de base: as letras menores ficam na
 * mesma linha das letras maiores, como no texto corrido.
 */
export function Pedacos({
  children,
  folga = 'pequeno',
  comPonto = true,
  emLinha = false,
}: {
  children: ReactNode;
  folga?: keyof typeof FOLGA;
  /**
   * false quando nenhum pedaço tem "·" (no português, sem dólar): a linha fica como sempre foi, com o vão de antes
   * (6 px) entre os pedaços e sem recorte
   */
  comPonto?: boolean;
  /**
   * no meio de um texto ("Total para 2 adultos: …"), sempre com "·": os pedaços andam juntos, como uma palavra só. Se
   * não cabem no fim da linha, descem juntos para a linha de baixo, e lá se separam se ainda não couberem; o texto antes
   * deles quebra como sempre. A linha de base é a da primeira linha dos pedaços, a mesma do texto
   */
  emLinha?: boolean;
}) {
  // [--folga:0px]: sem "·", os pedaços não têm recuo, nem dentro de outra linha de pedaços
  if (!comPonto) return <span className="flex flex-wrap items-baseline gap-x-1.5 [--folga:0px]">{children}</span>;
  return (
    <span className={`${emLinha ? 'inline-flex max-w-full' : 'block'} ${FOLGA[folga]} [clip-path:inset(-1em_-100vw_-1em_0)]`}>
      <span className="-ml-(--folga) flex flex-wrap items-baseline">{children}</span>
    </span>
  );
}

/**
 * Um pedaço de `Pedacos`. Com `ponto`, o "·" vem na frente e fica inteiro com o pedaço; `className` vale para os dois.
 * Sem "·" na linha (`comPonto` false), a folga não existe e o pedaço fica sem recuo.
 */
export function Pedaco({
  children,
  ponto = false,
  forte = false,
  className = '',
}: {
  children: ReactNode;
  ponto?: boolean;
  /**
   * só sem `ponto`: o destaque da linha (o preço grande) já é o <strong>, sem caixa em volta. Uma caixa em volta teria a
   * altura de linha do texto, e não a do número (a .cifra tem altura 1), e a linha ficaria mais alta
   */
  forte?: boolean;
  className?: string;
}) {
  if (!ponto) {
    const Elemento = forte ? 'strong' : 'span';
    return <Elemento className={className ? `pl-(--folga) ${className}` : 'pl-(--folga)'}>{children}</Elemento>;
  }
  return (
    <span className={className ? `whitespace-nowrap ${className}` : 'whitespace-nowrap'}>
      <span aria-hidden="true" className="inline-block w-(--folga) text-center">
        ·
      </span>
      {children}
    </span>
  );
}

/**
 * Um rótulo ou valor em real com o aproximado em dólar ao lado: "Total no Pix · ≈ US$ 24,93". Cada pedaço fica inteiro
 * e, quando os dois não cabem na mesma linha, o dólar desce para a linha de baixo sem o "·" na frente (ver `Pedacos`).
 * Sem dólar (português), fica só o primeiro pedaço, como sempre foi.
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
    <Pedacos>
      <Pedaco>{children}</Pedaco>
      <Pedaco ponto className={className}>
        {dolar}
      </Pedaco>
    </Pedacos>
  );
}
