/**
 * As 5 perguntas que a página inicial mostra abertas para tocar (Etapa 8), pela posição de cada uma em `faq` nos
 * dicionários (a ordem é a mesma nos quatro idiomas), na ordem em que aparecem: quem é de fora, as formas de
 * pagamento, como recebe o voucher, a busca no hotel e criança. Chuva e cancelamento já estão nas garantias, logo
 * acima. "É seguro pagar pelo site?" fica no "Ver todas": hoje o pagamento é fechado pelo WhatsApp, e com o
 * pagamento online no ar o "pagamento seguro" já aparece nas garantias. As outras ficam no "Ver todas as perguntas",
 * na mesma página. O teste tests/perguntas.test.ts confere que cada número ainda aponta para a pergunta certa:
 * pergunta nova na lista ou fora de ordem quebra o teste.
 */
export const PERGUNTAS_PRINCIPAIS: readonly number[] = [8, 1, 0, 5, 2];

/** As perguntas em duas partes: as 5 principais (na ordem acima) e as outras (na ordem da lista). */
export function dividirPerguntas<T>(faq: readonly T[]): { principais: T[]; outras: T[] } {
  return {
    principais: PERGUNTAS_PRINCIPAIS.flatMap((i) => (i < faq.length ? [faq[i]] : [])),
    outras: faq.filter((_, i) => !PERGUNTAS_PRINCIPAIS.includes(i)),
  };
}
