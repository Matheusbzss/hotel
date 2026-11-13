import type { Texto } from './passeios';

/**
 * AS LISTAS FIXAS DAS CASAS (Fase 4, Etapa 7): as comodidades, os tipos de cama e as regras próprias que o painel
 * marca em cada casa. Cada casa guarda só os códigos (colunas comodidades_marcadas, quartos_detalhe e
 * regras_proprias, lidas em src/lib/casa-detalhes.ts); o texto nos idiomas e o ícone ficam aqui, iguais para todas.
 *
 * Os textos são neutros (sem "tú" nem "vos"): servem às duas versões do espanhol. Uma palavra que mude na Argentina
 * entra com a chave 'es-ar' (src/i18n/conteudo.ts) e conta em tests/es-ar.test.ts.
 *
 * Comodidade nova: acrescente aqui, com um ícone da lista IconeCasa (o desenho de cada ícone é da página da casa).
 * Nunca marque numa casa o que o dono não confirmou ou o que não aparece claramente nas fotos (marca "veio da foto").
 */

/** Os ícones que a página da casa desenha (um traço simples cada, no estilo do site). */
export const ICONES_CASA = [
  'vista-mar',
  'praia',
  'piscina',
  'spa',
  'churrasqueira',
  'cozinha',
  'bar',
  'lounge',
  'deck',
  'fogo',
  'espreguicadeira',
  'mesa',
  'varanda',
  'jardim',
  'rede',
  'parquinho',
  'adega',
  'ar-condicionado',
  'roupa-de-cama',
  'tv',
  'chuveiro',
  'pia',
  'som',
  'wifi',
  'trabalho',
  'sofa',
  'ventilador',
  'lavanderia',
  'carro',
  'seguranca',
  'casa',
  'escada',
  'cama',
] as const;
export type IconeCasa = (typeof ICONES_CASA)[number];

/** Os grupos da lista completa ("ver tudo"), na ordem em que aparecem. */
export const GRUPOS_COMODIDADE = [
  'vista-e-praia',
  'area-externa',
  'cozinha',
  'quartos',
  'banheiros',
  'sala',
  'servicos',
  'seguranca',
] as const;
export type GrupoComodidade = (typeof GRUPOS_COMODIDADE)[number];

export const NOMES_GRUPO_COMODIDADE: Record<GrupoComodidade, Texto> = {
  'vista-e-praia': { pt: 'Vista e praia', es: 'Vista y playa', en: 'View and beach' },
  'area-externa': { pt: 'Área externa', es: 'Área exterior', en: 'Outdoors' },
  cozinha: { pt: 'Cozinha e refeições', es: 'Cocina y comedor', en: 'Kitchen and dining' },
  quartos: { pt: 'Quartos', es: 'Habitaciones', en: 'Bedrooms' },
  banheiros: { pt: 'Banheiros', es: 'Baños', en: 'Bathrooms' },
  sala: { pt: 'Sala, lazer e trabalho', es: 'Sala, ocio y trabajo', en: 'Living room, entertainment and work' },
  servicos: { pt: 'Serviços e estacionamento', es: 'Servicios y estacionamiento', en: 'Services and parking' },
  seguranca: { pt: 'Segurança', es: 'Seguridad', en: 'Safety and security' },
};

export interface Comodidade {
  grupo: GrupoComodidade;
  icone: IconeCasa;
  nome: Texto;
}

/** A lista fixa das comodidades. A ordem da lista de cada casa é a da casa (as 10 primeiras aparecem antes do "ver tudo"). */
export const COMODIDADES = {
  'vista-mar': { grupo: 'vista-e-praia', icone: 'vista-mar', nome: { pt: 'Vista para o mar', es: 'Vista al mar', en: 'Sea view' } },
  'acesso-praia-escada': {
    grupo: 'vista-e-praia',
    icone: 'escada',
    nome: {
      pt: 'Acesso à praia por escada do condomínio',
      es: 'Acceso a la playa por una escalera del condominio',
      en: 'Beach access via a stairway in the community',
    },
  },
  piscina: {
    grupo: 'area-externa',
    icone: 'piscina',
    nome: { pt: 'Piscina privativa sem aquecimento', es: 'Piscina privada sin climatizar', en: 'Private pool, unheated' },
  },
  'piscina-borda-infinita': {
    grupo: 'area-externa',
    icone: 'piscina',
    nome: { pt: 'Piscina com borda infinita', es: 'Piscina de borde infinito', en: 'Infinity-edge pool' },
  },
  'piscina-prainha': {
    grupo: 'area-externa',
    icone: 'piscina',
    nome: {
      pt: 'Piscina com parte rasa (prainha)',
      es: 'Piscina con zona de poca profundidad',
      en: 'Pool with a shallow beach-style area',
    },
  },
  spa: { grupo: 'area-externa', icone: 'spa', nome: { pt: 'Spa', es: 'Spa', en: 'Spa' } },
  churrasqueira: { grupo: 'area-externa', icone: 'churrasqueira', nome: { pt: 'Churrasqueira', es: 'Parrilla', en: 'Barbecue grill' } },
  'cozinha-externa': {
    grupo: 'area-externa',
    icone: 'cozinha',
    nome: { pt: 'Cozinha externa', es: 'Cocina exterior', en: 'Outdoor kitchen' },
  },
  'bar-externo': {
    grupo: 'area-externa',
    icone: 'bar',
    nome: { pt: 'Bar externo com bancos', es: 'Barra exterior con taburetes', en: 'Outdoor bar with stools' },
  },
  'lounge-envidracado': {
    grupo: 'area-externa',
    icone: 'lounge',
    nome: { pt: 'Lounge envidraçado com vista', es: 'Lounge con paredes de vidrio y vista', en: 'Glass-walled lounge with a view' },
  },
  deck: {
    grupo: 'area-externa',
    icone: 'deck',
    nome: { pt: 'Deck de madeira com puffs', es: 'Deck de madera con puffs', en: 'Wooden deck with bean bags' },
  },
  braseiro: { grupo: 'area-externa', icone: 'fogo', nome: { pt: 'Braseiro', es: 'Brasero', en: 'Fire pit' } },
  espreguicadeiras: {
    grupo: 'area-externa',
    icone: 'espreguicadeira',
    nome: { pt: 'Espreguiçadeiras', es: 'Tumbonas', en: 'Sun loungers' },
  },
  'area-estar-externa': {
    grupo: 'area-externa',
    icone: 'lounge',
    nome: {
      pt: 'Área de estar ao ar livre com vista',
      es: 'Área de estar al aire libre con vista',
      en: 'Outdoor seating area with a view',
    },
  },
  'mesas-externas': {
    grupo: 'area-externa',
    icone: 'mesa',
    nome: { pt: 'Mesas para comer ao ar livre', es: 'Mesas para comer al aire libre', en: 'Outdoor dining tables' },
  },
  varandas: {
    grupo: 'area-externa',
    icone: 'varanda',
    nome: { pt: 'Varandas com vista', es: 'Balcones con vista', en: 'Balconies with a view' },
  },
  jardim: { grupo: 'area-externa', icone: 'jardim', nome: { pt: 'Jardim', es: 'Jardín', en: 'Garden' } },
  'jardim-interno': { grupo: 'area-externa', icone: 'jardim', nome: { pt: 'Jardim interno', es: 'Jardín interior', en: 'Indoor garden' } },
  rede: { grupo: 'area-externa', icone: 'rede', nome: { pt: 'Rede no jardim', es: 'Hamaca en el jardín', en: 'Hammock in the garden' } },
  parquinho: {
    grupo: 'area-externa',
    icone: 'parquinho',
    nome: { pt: 'Parquinho infantil', es: 'Juegos infantiles', en: "Children's playground" },
  },
  'cozinha-completa': {
    grupo: 'cozinha',
    icone: 'cozinha',
    nome: { pt: 'Cozinha completa, com utensílios', es: 'Cocina equipada, con utensilios', en: 'Fully equipped kitchen with utensils' },
  },
  'ilha-cozinha': {
    grupo: 'cozinha',
    icone: 'cozinha',
    nome: { pt: 'Ilha com bancos na cozinha', es: 'Isla con taburetes en la cocina', en: 'Kitchen island with stools' },
  },
  adega: { grupo: 'cozinha', icone: 'adega', nome: { pt: 'Adega climatizada', es: 'Cava de vinos climatizada', en: 'Wine fridge' } },
  'mesa-jantar': {
    grupo: 'cozinha',
    icone: 'mesa',
    nome: { pt: 'Mesa de jantar grande', es: 'Mesa de comedor grande', en: 'Large dining table' },
  },
  'ar-condicionado': {
    grupo: 'quartos',
    icone: 'ar-condicionado',
    nome: {
      pt: 'Ar-condicionado em todos os quartos',
      es: 'Aire acondicionado en todas las habitaciones',
      en: 'Air conditioning in every bedroom',
    },
  },
  'roupa-de-cama': {
    grupo: 'quartos',
    icone: 'roupa-de-cama',
    nome: { pt: 'Roupa de cama e toalhas incluídas', es: 'Ropa de cama y toallas incluidas', en: 'Bed linen and towels included' },
  },
  'tv-quartos': { grupo: 'quartos', icone: 'tv', nome: { pt: 'TV nos quartos', es: 'TV en las habitaciones', en: 'TV in the bedrooms' } },
  'chuveiro-teto': { grupo: 'banheiros', icone: 'chuveiro', nome: { pt: 'Chuveiro de teto', es: 'Ducha de techo', en: 'Rain shower' } },
  'pia-dupla': { grupo: 'banheiros', icone: 'pia', nome: { pt: 'Bancada com duas pias', es: 'Doble lavamanos', en: 'Double vanity' } },
  bide: { grupo: 'banheiros', icone: 'pia', nome: { pt: 'Bidê', es: 'Bidet', en: 'Bidet' } },
  'sala-de-estar': { grupo: 'sala', icone: 'sofa', nome: { pt: 'Sala de estar', es: 'Sala de estar', en: 'Living room' } },
  'tv-4k': { grupo: 'sala', icone: 'tv', nome: { pt: 'TVs 4K', es: 'Televisores 4K', en: '4K TVs' } },
  'tv-sala': { grupo: 'sala', icone: 'tv', nome: { pt: 'TV na sala', es: 'TV en la sala', en: 'TV in the living room' } },
  'som-sonos': { grupo: 'sala', icone: 'som', nome: { pt: 'Som Sonos', es: 'Sistema de sonido Sonos', en: 'Sonos sound system' } },
  wifi: { grupo: 'sala', icone: 'wifi', nome: { pt: 'Wi-Fi', es: 'Wifi', en: 'Wi-Fi' } },
  'espaco-trabalho': {
    grupo: 'sala',
    icone: 'trabalho',
    nome: {
      pt: 'Cantinho de trabalho com mesa e cadeira',
      es: 'Rincón de trabajo con escritorio y silla',
      en: 'Work nook with a desk and chair',
    },
  },
  'ventilador-teto': {
    grupo: 'sala',
    icone: 'ventilador',
    nome: { pt: 'Ventilador de teto na sala', es: 'Ventilador de techo en la sala', en: 'Ceiling fan in the living room' },
  },
  lavanderia: {
    grupo: 'servicos',
    icone: 'lavanderia',
    nome: { pt: 'Lavanderia com máquina de lavar', es: 'Lavandería con lavadora', en: 'Laundry room with a washing machine' },
  },
  estacionamento: {
    grupo: 'servicos',
    icone: 'carro',
    nome: { pt: 'Estacionamento grátis', es: 'Estacionamiento gratis', en: 'Free parking' },
  },
  'condominio-vigilancia': {
    grupo: 'seguranca',
    icone: 'seguranca',
    nome: {
      pt: 'Condomínio fechado com vigilância 24 horas',
      es: 'Condominio cerrado con vigilancia las 24 horas',
      en: 'Gated community with 24-hour security',
    },
  },
} as const satisfies Record<string, Comodidade>;

export type IdComodidade = keyof typeof COMODIDADES;
export const IDS_COMODIDADE = Object.keys(COMODIDADES) as IdComodidade[];

/* ------------------------------------------------------------------ */
/* Camas                                                               */

export const TIPOS_CAMA = ['king', 'queen', 'casal', 'solteiro', 'beliche'] as const;
export type TipoCama = (typeof TIPOS_CAMA)[number];

export interface InfoCama {
  /** O nome no singular e no plural ("1 cama king", "2 camas king"). */
  um: Texto;
  varios: Texto;
  /** Quantas camas a peça conta na ficha: o beliche são duas (a de cima e a de baixo), como o dono conta. */
  camas: number;
  /** Quantas pessoas dormem nela. O limite de hóspedes da casa é a soma dos lugares nas camas (regra do dono, 07/11). */
  lugares: number;
}

export const CAMAS: Record<TipoCama, InfoCama> = {
  king: {
    um: { pt: 'cama king', es: 'cama king', en: 'king bed' },
    varios: { pt: 'camas king', es: 'camas king', en: 'king beds' },
    camas: 1,
    lugares: 2,
  },
  queen: {
    um: { pt: 'cama queen', es: 'cama queen', en: 'queen bed' },
    varios: { pt: 'camas queen', es: 'camas queen', en: 'queen beds' },
    camas: 1,
    lugares: 2,
  },
  casal: {
    um: { pt: 'cama de casal', es: 'cama doble', en: 'double bed' },
    varios: { pt: 'camas de casal', es: 'camas dobles', en: 'double beds' },
    camas: 1,
    lugares: 2,
  },
  solteiro: {
    um: { pt: 'cama de solteiro', es: 'cama individual', en: 'single bed' },
    varios: { pt: 'camas de solteiro', es: 'camas individuales', en: 'single beds' },
    camas: 1,
    lugares: 1,
  },
  beliche: {
    um: { pt: 'beliche', es: 'litera', en: 'bunk bed' },
    varios: { pt: 'beliches', es: 'literas', en: 'bunk beds' },
    camas: 2,
    lugares: 2,
  },
};

/* ------------------------------------------------------------------ */
/* Regras próprias de cada casa                                         */

export const REGRAS_EVENTO = {
  proibido: { pt: 'Eventos e festas não são permitidos', es: 'No se permiten eventos ni fiestas', en: 'No events or parties' },
  'so-feriados': {
    pt: 'Eventos e festas só em feriados, no fim de ano e no Réveillon',
    es: 'Eventos y fiestas solo en feriados, en las fiestas de fin de año y en Año Nuevo',
    en: "Events and parties only on public holidays, over the year-end holidays and on New Year's Eve",
  },
  'com-autorizacao': {
    pt: 'Eventos de qualquer tipo só com autorização prévia',
    es: 'Eventos de cualquier tipo solo con autorización previa',
    en: 'Events of any kind only with prior approval',
  },
} as const satisfies Record<string, Texto>;
export type RegraEvento = keyof typeof REGRAS_EVENTO;

export const REGRAS_FUMAR = {
  proibido: { pt: 'Proibido fumar', es: 'Prohibido fumar', en: 'No smoking' },
  'area-externa': { pt: 'Fumar só na área externa', es: 'Solo se puede fumar en el área exterior', en: 'Smoking allowed outdoors only' },
} as const satisfies Record<string, Texto>;
export type RegraFumar = keyof typeof REGRAS_FUMAR;
