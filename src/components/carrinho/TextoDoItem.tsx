import { PONTO_PRESO, partesDoPonto } from '@/lib/ponto';

// a largura de " · " (espaço que não quebra, ponto, espaço que não quebra) na letra de cada texto, um fio para baixo:
// 0,6204em na Barlow Semi Condensed 600 do nome do item e 0,6104em na Barlow 400 das linhas de baixo (medido no Chromium
// e no WebKit), menos 0,003em, porque o navegador arredonda as medidas em 1/64 px e uma folga mais larga que o " · " de
// antes faria um texto que cabia certinho numa linha ganhar outra
const FOLGA = { nome: '[--folga:0.617em]', linha: '[--folga:0.607em]' } as const;

/**
 * O nome do item do carrinho e as linhas de baixo ("Lancha Privada en Búzios · 4 horas", "Carro executivo · 1
 * passageiro"): quando a parte da direita não cabe na linha, ela desce inteira e sem o "·", como o dólar no ComDolar.
 * A última palavra antes do "·" leva à direita uma folga do tamanho de " · ", e o " · " (texto de verdade, com espaços
 * que não quebram: é o que o leitor de tela lê e quem copia leva) volta para cima dessa folga com margem negativa. No
 * meio da linha, ele ocupa a folga; no começo de uma linha, fica fora do recorte. O recorte começa 0,12em antes da
 * borda (cresce com a letra), para não cortar a ponta de letras como o "j" de "jue," e o "ï"; a tinta do " · "
 * escondido fica a mais de 0,24em dela. Se nem sozinha a parte da direita cabe numa linha (letra muito grande em tela
 * muito estreita), ela passa da borda, como uma palavra comprida. A busca do Chrome não acha um trecho que passe pelo
 * "·", porque o " · " fica numa caixa à parte: acha as palavras de cada lado (a do Safari acha tudo). Texto sem o "·"
 * preso (PONTO_PRESO) passa como está.
 */
export function TextoDoItem({ texto, letra }: { texto: string; letra: keyof typeof FOLGA }) {
  const p = partesDoPonto(texto);
  if (!p) return <>{texto}</>;
  return (
    <span className={`block ${FOLGA[letra]} [clip-path:inset(-1em_-100vw_-1em_-0.12em)]`}>
      {p.comeco && `${p.comeco} `}
      <span className="whitespace-nowrap pr-(--folga)">{p.ultima}</span>
      <wbr />
      <span className="whitespace-nowrap">
        <span className="-ml-(--folga) inline-block w-(--folga) text-center">{PONTO_PRESO}</span>
        {p.direita}
      </span>
    </span>
  );
}
