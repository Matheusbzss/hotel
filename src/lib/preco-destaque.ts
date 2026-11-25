// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { DESCONTO_PIX_PORCENTO } from '../config/precos.ts';
import type { FormaPagamento } from './formas-pagamento.ts';

/**
 * Qual preço é o grande (opção D1-A da noite de 25/11). Em espanhol e inglês, o preço do cartão: é o que o checkout
 * abre marcado para quem é de fora (formaPadrao, logo abaixo), o mesmo dos dados do Google (o preço da página bate com o
 * do anúncio), e o Pix fica na linha de baixo, com o desconto de verdade ("con Pix (−10%)"). Em português, como sempre:
 * o Pix em destaque e o cartão embaixo. Aceita o idioma do site ("es-ar") ou o do Intl ("es-AR").
 */
export const cartaoEmDestaque = (idiomaOuLocale: string): boolean => !/^pt(-|$)/i.test(idiomaOuLocale);

/** "con Pix (−10%)": o rótulo do preço no Pix na linha de baixo, com o desconto de src/config/precos.ts. */
export const rotuloPixComDesconto = (modelo: string): string => modelo.replace('{p}', String(DESCONTO_PIX_PORCENTO));

/**
 * A forma que já vem marcada na escolha do pagamento (o checkout e a tela de pagar de novo): a que o pedido tinha, se
 * ainda estiver disponível; senão, o Pix para quem lê em português (tem o desconto e todo banco brasileiro paga) e o
 * cartão para quem lê nos outros idiomas (o Pix de fora depende do app do banco). Null sem nenhuma forma disponível.
 * Mora aqui, fora do componente do navegador, para as páginas do servidor usarem a mesma regra (formaEmDestaque).
 */
export function formaPadrao(formas: readonly FormaPagamento[], idioma: string, atual?: FormaPagamento): FormaPagamento | null {
  if (atual && formas.includes(atual)) return atual;
  const preferida: FormaPagamento = cartaoEmDestaque(idioma) ? 'cartao' : 'pix';
  return formas.includes(preferida) ? preferida : (formas[0] ?? null);
}

/**
 * A forma que a tela de pagar de novo (PagarPedido, src/components/pagamento/CheckoutEmbutido.tsx) traz marcada: depois
 * de uma recusa do cartão, o Pix, se ainda der tempo; senão a de formaPadrao (a do pedido, se ainda vale).
 */
export const formaMarcadaAoPagarDeNovo = (
  formas: readonly FormaPagamento[],
  idioma: string,
  formaAtual?: FormaPagamento,
  cartaoRecusado = false,
): FormaPagamento | null => formaPadrao(formas, idioma, cartaoRecusado && formas.includes('pix') ? 'pix' : formaAtual);

/**
 * A forma cujo total vem primeiro nas páginas do pedido e da reserva enquanto o pagamento está em aberto (na faixa da
 * página do pedido, o número grande). Em português, o Pix, como sempre. Em espanhol e inglês (revisão do Pacote 29): no
 * pagamento online em aberto, a mesma forma que a tela de pagar já traz marcada (formaMarcadaAoPagarDeNovo, também
 * depois de um cartão recusado), e o cartão fora dele (o pedido do WhatsApp). O cliente que vem do checkout com o cartão
 * em destaque vê na página seguinte o mesmo número, e o do botão "Pagar" da mesma página.
 */
export function formaEmDestaque(
  idioma: string,
  online?: { formas: readonly FormaPagamento[]; formaAtual?: FormaPagamento; cartaoRecusado?: boolean } | null,
): FormaPagamento {
  if (!cartaoEmDestaque(idioma)) return 'pix';
  return (online ? formaMarcadaAoPagarDeNovo(online.formas, idioma, online.formaAtual, online.cartaoRecusado) : null) ?? 'cartao';
}
