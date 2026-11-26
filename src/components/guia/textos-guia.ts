import type { IdiomaGuia } from '../../i18n/config';

/**
 * Os textos fixos das páginas de guia nas duas versões do espanhol: o 'es' é o neutro (com "tú", "Sigue leyendo") e
 * o 'es-ar' guarda o argentino (com "vos", "Seguí leyendo"). Só muda a frase que tem verbo.
 * Fica num arquivo só de dados, com imports relativos e sem React, para os testes (tests/es-ar.test.ts) lerem
 * estes textos como leem os demais textos do site, em vez de procurá-los dentro do componente.
 */
export const TEXTOS_GUIA: Record<IdiomaGuia, { atualizado: string; indice: string; perguntas: string; seguir: string; todas: string }> = {
  es: {
    atualizado: 'Actualizado en',
    indice: 'En esta guía',
    perguntas: 'Preguntas frecuentes',
    seguir: 'Sigue leyendo',
    todas: 'Todas las guías',
  },
  'es-ar': {
    atualizado: 'Actualizado en',
    indice: 'En esta guía',
    perguntas: 'Preguntas frecuentes',
    seguir: 'Seguí leyendo',
    todas: 'Todas las guías',
  },
};
