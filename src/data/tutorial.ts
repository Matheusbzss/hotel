import type { Idioma } from '@/i18n/config';

/**
 * O "Como funciona" em 4 passos, com prints reais do site no celular (feitos por scripts/prints-tutorial.mjs).
 * Fica desligado até existirem as telas do horário (Etapa 5) e do pagamento (Etapa 8); até lá a página
 * inicial mostra o "Como funciona" de 3 passos. Para ligar: com o site rodando, ajuste no roteiro as telas
 * dos passos 2 e 3, rode `node scripts/prints-tutorial.mjs` e troque para true.
 */
export const TUTORIAL_ATIVO = false;

/** O print de cada passo: public/tutorial/<idioma>/passo-<n>.webp. */
export function telaTutorial(idioma: Idioma, passo: number) {
  return `/tutorial/${idioma}/passo-${passo}.webp`;
}
