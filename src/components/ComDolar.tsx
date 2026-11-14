import type { ReactNode } from 'react';
import { PONTO_PRESO } from '@/lib/ponto';

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
  // O " · " de verdade (com espaços que não quebram) fica dentro da caixa do "·", escondido da tela (sr-only): é o que
  // o leitor de tela lê, com a pausa ("no Pix · ≈ US$ 12,46", e não "no Pix≈ US$ 12,46"), e o que leva quem copia. O
  // "·" que aparece é só desenho (fora do leitor e da cópia), centrado na caixa como sempre: com " · " de texto na
  // caixa, o WebKit arredonda os espaços e o "·" andava até 0,4 px. No começo de uma linha, os dois ficam fora do recorte
  return (
    <span className={className ? `whitespace-nowrap ${className}` : 'whitespace-nowrap'}>
      <span className="inline-block w-(--folga) text-center">
        <span aria-hidden="true" className="select-none">
          ·
        </span>
        <span className="sr-only">{PONTO_PRESO}</span>
      </span>
      {children}
    </span>
  );
}

/**
 * Um texto que fica inteiro, como com whitespace-nowrap ("R$ 69,30 no Pix", "8 passageiros"): desce inteiro para a
 * linha de baixo quando não cabe no fim de uma. Com a letra grande, quando a caixa em volta (a mais próxima com a
 * classe @container) fica com menos de 14rem, ele vira um inline-block do tamanho dele (w-max), limitado à largura da
 * linha (max-w-full): continua descendo inteiro, mas, se nem sozinho couber, quebra por dentro, nos espaços, em vez de
 * passar da borda. A largura mínima que ele pede (min-content) continua a dele inteiro: as linhas que decidem o que
 * desce por ela (o "Mudar" ao lado do preço) ficam iguais. A caixa entre ele e a linha precisa poder encolher (max-w-full
 * ou min-w-0), senão ele não chega a quebrar. Por que só abaixo de 14rem: com a letra normal, a lista mais estreita (a
 * do checkout em 320 px) tem 14,9rem, e o inline-block mudaria o desenho: no WebKit, o texto dentro dele anda até 1 px.
 * Um pedaço que nunca pode quebrar ("no cartão") vai num whitespace-nowrap dentro.
 */
export function Inteiro({ children }: { children: ReactNode }) {
  return (
    <span className="whitespace-nowrap @max-[14rem]:inline-block @max-[14rem]:w-max @max-[14rem]:max-w-full @max-[14rem]:whitespace-normal">
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
  // max-w-full: o primeiro pedaço pode encolher até a largura da linha, para um Inteiro dentro dele quebrar quando nem
  // sozinho cabe (com a letra normal, a partir de 320 px, ele sempre cabe e nada muda)
  return (
    <Pedacos>
      <Pedaco className="max-w-full">{children}</Pedaco>
      <Pedaco ponto className={className}>
        {dolar}
      </Pedaco>
    </Pedacos>
  );
}
