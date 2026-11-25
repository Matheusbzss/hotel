// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { DESCONTO_PIX_PORCENTO } from '../config/precos.ts';

/**
 * Qual preço é o grande (opção D1-A da noite de 25/11). Em espanhol e inglês, o preço do cartão: é o que o checkout
 * abre marcado para quem é de fora (src/lib/formas-pagamento.ts, formaPadrao), o mesmo dos dados do Google (o preço da
 * página bate com o do anúncio), e o Pix fica na linha de baixo, com o desconto de verdade ("con Pix (−10%)"). Em
 * português, como sempre: o Pix em destaque e o cartão embaixo. Aceita o idioma do site ("es-ar") ou o do Intl ("es-AR").
 */
export const cartaoEmDestaque = (idiomaOuLocale: string): boolean => !/^pt(-|$)/i.test(idiomaOuLocale);

/** "con Pix (−10%)": o rótulo do preço no Pix na linha de baixo, com o desconto de src/config/precos.ts. */
export const rotuloPixComDesconto = (modelo: string): string => modelo.replace('{p}', String(DESCONTO_PIX_PORCENTO));
