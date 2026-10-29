import type { Cidade, Icone, Texto } from './passeios';

/**
 * PACOTES PASSEIO + HOSPEDAGEM — sob consulta, sem checkout.
 * O botão de cada pacote abre o WhatsApp com uma mensagem pronta pedindo orçamento.
 */
export interface Pacote {
  slug: string;
  cidadeBase: Cidade;
  /** Foto de capa (em /public/fotos). Sem foto, aparece o ícone. */
  foto?: string;
  icone: Icone;
  /** Slugs dos passeios (de src/data/passeios.ts) que fazem parte do pacote. */
  passeios: string[];
  noites: Texto;
  nome: Texto;
  descricao: Texto;
}

export const PACOTES: Pacote[] = [
  {
    slug: 'buzios-classico',
    cidadeBase: 'buzios',
    foto: '/fotos/buzios/vista-da-escuna.jpg',
    icone: 'barco',
    passeios: ['escuna-buzios', 'city-tour-buzios', 'buggy-buzios'],
    noites: { pt: 'Sugestão: 3 a 4 noites', en: 'Suggested: 3 to 4 nights', es: 'Sugerencia: 3 a 4 noches' },
    nome: { pt: 'Búzios clássico', en: 'Classic Búzios', es: 'Búzios clásico' },
    descricao: {
      pt: 'Pousada em Búzios com os três passeios que mostram a península por inteiro: pelo mar, pelos mirantes e pelas praias de buggy.',
      en: 'A guesthouse in Búzios plus the three tours that show the whole peninsula: by sea, from the viewpoints and along the beaches by buggy.',
      es: 'Posada en Búzios con los tres paseos que muestran la península entera: por mar, desde los miradores y por las playas en buggy.',
    },
  },
  {
    slug: 'regiao-dos-lagos',
    cidadeBase: 'buzios',
    foto: '/fotos/arraial/barco-gruta.jpg',
    icone: 'barco',
    passeios: ['escuna-buzios', 'full-day-arraial-do-cabo', 'catamara-cabo-frio'],
    noites: { pt: 'Sugestão: 5 noites', en: 'Suggested: 5 nights', es: 'Sugerencia: 5 noches' },
    nome: { pt: 'Região dos Lagos em uma viagem', en: 'The Lakes Region in one trip', es: 'La Región de los Lagos en un viaje' },
    descricao: {
      pt: 'Hospedagem em Búzios e um passeio em cada cidade: escuna em Búzios, dia completo em Arraial do Cabo e catamarã em Cabo Frio.',
      en: 'Accommodation in Búzios and one tour in each town: schooner in Búzios, a full day in Arraial do Cabo and a catamaran in Cabo Frio.',
      es: 'Alojamiento en Búzios y un paseo en cada ciudad: goleta en Búzios, día completo en Arraial do Cabo y catamarán en Cabo Frio.',
    },
  },
  {
    slug: 'arraial-azul',
    cidadeBase: 'arraial-do-cabo',
    foto: '/fotos/arraial/mergulho.jpg',
    icone: 'mergulho',
    passeios: ['barco-arraial-do-cabo', 'mergulho-arraial-do-cabo', 'city-tour-arraial-do-cabo'],
    noites: { pt: 'Sugestão: 3 noites', en: 'Suggested: 3 nights', es: 'Sugerencia: 3 noches' },
    nome: { pt: 'Arraial do Cabo azul', en: 'Blue Arraial do Cabo', es: 'Arraial do Cabo azul' },
    descricao: {
      pt: 'Pousada em Arraial do Cabo, passeio de barco pelas praias de água turquesa, mergulho de batismo e os mirantes da cidade.',
      en: 'A guesthouse in Arraial do Cabo, a boat tour to the turquoise beaches, a discover-scuba dive and the town’s viewpoints.',
      es: 'Posada en Arraial do Cabo, paseo en barco por las playas de agua turquesa, bautismo de buceo y los miradores de la ciudad.',
    },
  },
  {
    slug: 'casal-em-buzios',
    cidadeBase: 'buzios',
    foto: '/fotos/buzios/lancha.jpg',
    icone: 'lancha',
    passeios: ['lancha-buzios', 'helicoptero-buzios'],
    noites: { pt: 'Sugestão: 2 a 3 noites', en: 'Suggested: 2 to 3 nights', es: 'Sugerencia: 2 a 3 noches' },
    nome: { pt: 'A dois em Búzios', en: 'Búzios for two', es: 'Búzios en pareja' },
    descricao: {
      pt: 'Para lua de mel ou aniversário de casamento: pousada charmosa, passeio de lancha e voo de helicóptero sobre a península.',
      en: 'For a honeymoon or anniversary: a charming guesthouse, a speedboat trip and a helicopter flight over the peninsula.',
      es: 'Para luna de miel o aniversario: posada con encanto, paseo en lancha y vuelo en helicóptero sobre la península.',
    },
  },
];
