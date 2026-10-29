/**
 * ARQUIVO DE DADOS DOS PASSEIOS
 *
 * Como editar:
 * - PREÇO: cada passeio guarda o preço do PARCEIRO em `precoParceiro` (em reais).
 *   O preço de venda é calculado automaticamente: precoParceiro + MARGEM_PERCENTUAL.
 *   Para mudar a margem de todos os passeios, troque só MARGEM_PERCENTUAL abaixo.
 * - UNIDADE: 'pessoa' (por pessoa), 'veiculo' (por veículo) ou 'embarcacao' (por embarcação).
 *   Para 'veiculo' e 'embarcacao', informe `capacidadePorUnidade` (quantas pessoas cabem).
 * - FOTOS: coloque as imagens em /public/fotos/passeios/<slug>/ e liste os caminhos em `fotos`,
 *   por exemplo: ['/fotos/passeios/escuna-buzios/1.jpg', '/fotos/passeios/escuna-buzios/2.jpg'].
 *   A primeira foto é a capa. Sem fotos, o site mostra uma ilustração do tipo de passeio.
 * - TEXTOS: cada campo de texto tem as versões pt (português), en (inglês) e es (espanhol).
 * - Para tirar um passeio do ar sem apagar, use `ativo: false`.
 *
 * ATENÇÃO — REVISAR: o site do parceiro não pôde ser acessado na criação deste arquivo.
 * Nomes e preços vieram da lista enviada pelo cliente. Durações, unidades marcadas com
 * "CONFIRA", roteiros e itens inclusos foram escritos com base no formato padrão desses
 * passeios na Região dos Lagos e precisam ser conferidos com o parceiro.
 */

export type Idioma = 'pt' | 'en' | 'es';
export type Texto = Record<Idioma, string>;
export type Lista = Record<Idioma, string[]>;

export type Cidade = 'buzios' | 'arraial-do-cabo' | 'cabo-frio' | 'rio-de-janeiro';
export type Categoria = 'barco' | 'buggy-quadriciclo' | 'city-tour' | 'aventura';
export type UnidadePreco = 'pessoa' | 'veiculo' | 'embarcacao';
export type Cena =
  | 'escuna'
  | 'catamara'
  | 'barco'
  | 'lancha'
  | 'jetski'
  | 'buggy'
  | 'quadriciclo'
  | 'trolley'
  | 'cidade'
  | 'mergulho'
  | 'helicoptero'
  | 'rio';

export interface Passeio {
  slug: string;
  ativo?: boolean;
  cidade: Cidade;
  categoria: Categoria;
  /** Preço do parceiro em reais, SEM a margem. */
  precoParceiro: number;
  /** Preço do parceiro para criança. Se não informado, criança paga o mesmo que adulto. */
  precoCriancaParceiro?: number;
  unidade: UnidadePreco;
  /** Pessoas por veículo/embarcação (obrigatório quando a unidade não é 'pessoa'). */
  capacidadePorUnidade?: number;
  duracao: Texto;
  destaque?: boolean;
  fotos: string[];
  /** Ilustração usada enquanto o passeio não tem fotos. */
  ilustracao: Cena;
  nome: Texto;
  resumo: Texto;
  descricao: Texto;
  inclui: Lista;
  naoInclui: Lista;
  roteiro: Lista;
  levar: Lista;
}

/** Margem aplicada sobre o preço do parceiro (10 = +10%). */
export const MARGEM_PERCENTUAL = 10;

export const CIDADES: Record<Cidade, { nome: Texto; ordem: number }> = {
  buzios: { nome: { pt: 'Búzios', en: 'Búzios', es: 'Búzios' }, ordem: 1 },
  'arraial-do-cabo': { nome: { pt: 'Arraial do Cabo', en: 'Arraial do Cabo', es: 'Arraial do Cabo' }, ordem: 2 },
  'cabo-frio': { nome: { pt: 'Cabo Frio', en: 'Cabo Frio', es: 'Cabo Frio' }, ordem: 3 },
  'rio-de-janeiro': { nome: { pt: 'Rio de Janeiro', en: 'Rio de Janeiro', es: 'Río de Janeiro' }, ordem: 4 },
};

export const CATEGORIAS: Record<Categoria, { nome: Texto; ordem: number }> = {
  barco: { nome: { pt: 'Barco', en: 'Boat', es: 'Barco' }, ordem: 1 },
  'buggy-quadriciclo': { nome: { pt: 'Buggy e quadriciclo', en: 'Buggy & quad', es: 'Buggy y cuatriciclo' }, ordem: 2 },
  'city-tour': { nome: { pt: 'City tour', en: 'City tour', es: 'City tour' }, ordem: 3 },
  aventura: { nome: { pt: 'Aventura', en: 'Adventure', es: 'Aventura' }, ordem: 4 },
};

/* ------------------------------------------------------------------ */
/* Listas reutilizadas                                                 */
/* ------------------------------------------------------------------ */

const LEVAR_PRAIA: Lista = {
  pt: [
    'Roupa de banho e toalha',
    'Protetor solar, óculos de sol e chapéu',
    'Água',
    'Documento com foto',
    'Dinheiro ou cartão para consumo extra',
  ],
  en: ['Swimwear and a towel', 'Sunscreen, sunglasses and a hat', 'Water', 'Photo ID', 'Cash or card for extras'],
  es: [
    'Traje de baño y toalla',
    'Protector solar, lentes de sol y sombrero',
    'Agua',
    'Documento con foto',
    'Efectivo o tarjeta para consumos extra',
  ],
};

const LEVAR_TERRA: Lista = {
  pt: [
    'Roupa leve e tênis ou sandália firme',
    'Protetor solar, óculos de sol e boné',
    'Roupa de banho por baixo da roupa',
    'Água',
    'Documento com foto',
  ],
  en: [
    'Light clothes and closed shoes or sturdy sandals',
    'Sunscreen, sunglasses and a cap',
    'Swimwear under your clothes',
    'Water',
    'Photo ID',
  ],
  es: [
    'Ropa liviana y zapatillas o sandalias firmes',
    'Protector solar, lentes de sol y gorra',
    'Traje de baño debajo de la ropa',
    'Agua',
    'Documento con foto',
  ],
};

const LEVAR_OFFROAD: Lista = {
  pt: [
    'Tênis fechado (obrigatório para pilotar)',
    'Roupa que possa sujar de areia',
    'Óculos de sol e protetor solar',
    'Água',
    'Documento com foto (CNH para quem for pilotar)',
  ],
  en: [
    'Closed shoes (required to drive)',
    'Clothes you don’t mind getting sandy',
    'Sunglasses and sunscreen',
    'Water',
    'Photo ID (driving licence for the driver)',
  ],
  es: [
    'Calzado cerrado (obligatorio para conducir)',
    'Ropa que se pueda ensuciar con arena',
    'Lentes de sol y protector solar',
    'Agua',
    'Documento con foto (licencia de conducir para quien maneje)',
  ],
};

const NAO_INCLUI_BASE: Lista = {
  pt: [
    'Alimentação e bebidas',
    'Taxas municipais ou de embarque, quando cobradas no local',
    'Fotos e vídeos profissionais oferecidos no passeio',
  ],
  en: ['Food and drinks', 'Municipal or boarding fees, when charged on site', 'Professional photos and videos offered during the tour'],
  es: [
    'Comidas y bebidas',
    'Tasas municipales o de embarque, cuando se cobran en el lugar',
    'Fotos y videos profesionales ofrecidos durante el paseo',
  ],
};

const NAO_INCLUI_TRANSPORTE: Lista = {
  pt: ['Transporte até o ponto de embarque (consulte traslado)', ...NAO_INCLUI_BASE.pt],
  en: ['Transport to the boarding point (ask us about transfers)', ...NAO_INCLUI_BASE.en],
  es: ['Traslado hasta el punto de embarque (consulte por transfer)', ...NAO_INCLUI_BASE.es],
};

/* ------------------------------------------------------------------ */
/* Passeios                                                            */
/* ------------------------------------------------------------------ */

export const PASSEIOS: Passeio[] = [
  /* ============================== BÚZIOS ============================== */
  {
    slug: 'escuna-buzios',
    cidade: 'buzios',
    categoria: 'barco',
    precoParceiro: 70,
    unidade: 'pessoa',
    duracao: { pt: '2h30', en: '2h30', es: '2h30' },
    destaque: true,
    fotos: [],
    ilustracao: 'escuna',
    nome: { pt: 'Passeio de Escuna em Búzios', en: 'Schooner Tour in Búzios', es: 'Paseo en Goleta por Búzios' },
    resumo: {
      pt: 'O clássico de Búzios: praias e ilhas vistas do mar, com paradas para banho em águas claras.',
      en: 'The Búzios classic: beaches and islands seen from the sea, with swim stops in clear water.',
      es: 'El clásico de Búzios: playas e islas vistas desde el mar, con paradas para nadar en aguas claras.',
    },
    descricao: {
      pt: 'A escuna sai do centro de Búzios e contorna a península com calma, passando por enseadas, ilhas e praias que muita gente só conhece do mar. É o jeito mais fácil de ter uma visão geral do destino logo no primeiro dia.\n\nAo longo do trajeto a tripulação faz paradas para banho e mergulho livre em praias de água transparente. As paradas variam conforme o vento e o mar do dia, sempre priorizando os pontos mais calmos.',
      en: 'The schooner leaves from downtown Búzios and calmly rounds the peninsula, passing coves, islands and beaches that many people only ever see from the water. It is the easiest way to get to know the destination on your first day.\n\nAlong the way the crew stops for swimming and snorkelling at beaches with crystal-clear water. Stops change with the day’s wind and sea, always choosing the calmest spots.',
      es: 'La goleta sale del centro de Búzios y recorre la península con calma, pasando por bahías, islas y playas que mucha gente solo conoce desde el mar. Es la forma más fácil de conocer el destino el primer día.\n\nDurante el recorrido la tripulación hace paradas para nadar y hacer snorkel en playas de agua transparente. Las paradas cambian según el viento y el mar del día, siempre eligiendo los lugares más tranquilos.',
    },
    inclui: {
      pt: ['Passeio de escuna com tripulação', 'Paradas para banho e mergulho livre', 'Coletes salva-vidas'],
      en: ['Schooner tour with crew', 'Swimming and snorkelling stops', 'Life jackets'],
      es: ['Paseo en goleta con tripulación', 'Paradas para nadar y hacer snorkel', 'Chalecos salvavidas'],
    },
    naoInclui: NAO_INCLUI_TRANSPORTE,
    roteiro: {
      pt: [
        'Embarque no centro de Búzios',
        'Vista da Orla Bardot e da Praia dos Ossos',
        'Passagem pelas praias Azeda e Azedinha',
        'Ilhas da costa de Búzios',
        'Paradas para banho (ex.: João Fernandes, Tartaruga ou Forno, conforme o mar)',
        'Retorno ao píer',
      ],
      en: [
        'Boarding in downtown Búzios',
        'View of Orla Bardot and Ossos beach',
        'Sailing past Azeda and Azedinha beaches',
        'The islands off Búzios',
        'Swim stops (e.g. João Fernandes, Tartaruga or Forno, depending on the sea)',
        'Return to the pier',
      ],
      es: [
        'Embarque en el centro de Búzios',
        'Vista de la Orla Bardot y la playa dos Ossos',
        'Paso por las playas Azeda y Azedinha',
        'Islas de la costa de Búzios',
        'Paradas para nadar (ej.: João Fernandes, Tartaruga o Forno, según el mar)',
        'Regreso al muelle',
      ],
    },
    levar: LEVAR_PRAIA,
  },
  {
    slug: 'catamara-buzios',
    cidade: 'buzios',
    categoria: 'barco',
    precoParceiro: 110,
    unidade: 'pessoa',
    duracao: { pt: '2h30', en: '2h30', es: '2h30' },
    fotos: [],
    ilustracao: 'catamara',
    nome: { pt: 'Passeio de Catamarã em Búzios', en: 'Catamaran Tour in Búzios', es: 'Paseo en Catamarán por Búzios' },
    resumo: {
      pt: 'Mais espaço e estabilidade para conhecer as praias de Búzios pelo mar.',
      en: 'More space and stability to explore the Búzios beaches by sea.',
      es: 'Más espacio y estabilidad para conocer las playas de Búzios por mar.',
    },
    descricao: {
      pt: 'O catamarã tem dois cascos, por isso balança menos e oferece bastante área de convés para tomar sol, fotografar e curtir a vista. É uma ótima escolha para famílias, grupos e para quem tem receio de enjoar.\n\nO roteiro percorre o litoral da península com paradas para banho em praias protegidas, sempre conforme as condições do mar.',
      en: 'A catamaran has two hulls, so it rocks less and offers plenty of deck space for sunbathing, taking photos and enjoying the view. A great choice for families, groups and anyone worried about seasickness.\n\nThe route follows the coast of the peninsula with swim stops at sheltered beaches, always depending on sea conditions.',
      es: 'El catamarán tiene dos cascos, por eso se mueve menos y ofrece mucho espacio en cubierta para tomar sol, sacar fotos y disfrutar la vista. Ideal para familias, grupos y para quien teme marearse.\n\nEl recorrido sigue la costa de la península con paradas para nadar en playas protegidas, siempre según las condiciones del mar.',
    },
    inclui: {
      pt: ['Passeio de catamarã com tripulação', 'Paradas para banho', 'Coletes salva-vidas'],
      en: ['Catamaran tour with crew', 'Swim stops', 'Life jackets'],
      es: ['Paseo en catamarán con tripulación', 'Paradas para nadar', 'Chalecos salvavidas'],
    },
    naoInclui: NAO_INCLUI_TRANSPORTE,
    roteiro: {
      pt: [
        'Embarque no centro de Búzios',
        'Orla Bardot e Praia dos Ossos vistas do mar',
        'Costa das praias Azeda, Azedinha e João Fernandes',
        'Paradas para banho em praias calmas',
        'Retorno ao píer',
      ],
      en: [
        'Boarding in downtown Búzios',
        'Orla Bardot and Ossos beach seen from the sea',
        'Along Azeda, Azedinha and João Fernandes beaches',
        'Swim stops at calm beaches',
        'Return to the pier',
      ],
      es: [
        'Embarque en el centro de Búzios',
        'Orla Bardot y playa dos Ossos vistas desde el mar',
        'Costa de las playas Azeda, Azedinha y João Fernandes',
        'Paradas para nadar en playas tranquilas',
        'Regreso al muelle',
      ],
    },
    levar: LEVAR_PRAIA,
  },
  {
    slug: 'buggy-buzios',
    cidade: 'buzios',
    categoria: 'buggy-quadriciclo',
    precoParceiro: 100,
    unidade: 'pessoa', // CONFIRA: por pessoa ou por buggy?
    duracao: { pt: '3 horas', en: '3 hours', es: '3 horas' },
    destaque: true,
    fotos: [],
    ilustracao: 'buggy',
    nome: { pt: 'Passeio de Buggy em Búzios', en: 'Buggy Tour in Búzios', es: 'Paseo en Buggy por Búzios' },
    resumo: {
      pt: 'Vento no rosto e paradas nas praias e mirantes mais bonitos da península.',
      en: 'Wind in your face and stops at the most beautiful beaches and viewpoints of the peninsula.',
      es: 'Viento en la cara y paradas en las playas y miradores más lindos de la península.',
    },
    descricao: {
      pt: 'De buggy dá para chegar a praias dos dois lados da península no mesmo passeio: as de mar aberto, com ondas, e as de água calma, boas para banho. O condutor conhece os caminhos e para nos pontos certos para foto.\n\nÉ um passeio descontraído, com tempo para descer, molhar os pés e aproveitar a vista dos mirantes.',
      en: 'By buggy you can reach beaches on both sides of the peninsula in a single tour: the open-sea ones with waves and the calm ones that are perfect for a swim. The driver knows the way and stops at the best photo spots.\n\nIt is a relaxed tour with time to get out, dip your feet and enjoy the viewpoints.',
      es: 'En buggy se llega a playas de los dos lados de la península en un mismo paseo: las de mar abierto, con olas, y las de agua calma, ideales para nadar. El conductor conoce los caminos y para en los mejores lugares para fotos.\n\nEs un paseo relajado, con tiempo para bajar, mojarse los pies y disfrutar de los miradores.',
    },
    inclui: {
      pt: ['Buggy com condutor', 'Paradas em praias e mirantes'],
      en: ['Buggy with driver', 'Stops at beaches and viewpoints'],
      es: ['Buggy con conductor', 'Paradas en playas y miradores'],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Saída do ponto de encontro combinado',
        'Praias de Geribá e Ferradura',
        'Mirantes da Praia Brava e do Forno',
        'Praias de João Fernandes e Azeda',
        'Paradas para foto e banho',
        'Retorno',
      ],
      en: [
        'Departure from the agreed meeting point',
        'Geribá and Ferradura beaches',
        'Brava and Forno viewpoints',
        'João Fernandes and Azeda beaches',
        'Photo and swim stops',
        'Return',
      ],
      es: [
        'Salida desde el punto de encuentro acordado',
        'Playas de Geribá y Ferradura',
        'Miradores de Brava y Forno',
        'Playas de João Fernandes y Azeda',
        'Paradas para fotos y baño',
        'Regreso',
      ],
    },
    levar: LEVAR_TERRA,
  },
  {
    slug: 'quadriciclo-buzios',
    cidade: 'buzios',
    categoria: 'buggy-quadriciclo',
    precoParceiro: 280,
    unidade: 'veiculo',
    capacidadePorUnidade: 2,
    duracao: { pt: '2 horas', en: '2 hours', es: '2 horas' },
    fotos: [],
    ilustracao: 'quadriciclo',
    nome: { pt: 'Passeio de Quadriciclo em Búzios', en: 'Quad Bike Tour in Búzios', es: 'Paseo en Cuatriciclo por Búzios' },
    resumo: {
      pt: 'Você no comando de um quadriciclo por trilhas de terra e praias mais selvagens.',
      en: 'You in charge of a quad bike on dirt trails and wilder beaches.',
      es: 'Vos al mando de un cuatriciclo por senderos de tierra y playas más salvajes.',
    },
    descricao: {
      pt: 'O quadriciclo leva até duas pessoas e sai em comboio com um guia à frente, por estradas de terra e trilhas que dão acesso a praias menos movimentadas de Búzios.\n\nAntes de sair, o guia explica a pilotagem e as regras de segurança. É preciso ter habilitação para pilotar; o carona não precisa.',
      en: 'Each quad bike carries up to two people and rides in a convoy behind a guide, on dirt roads and trails that lead to quieter beaches in Búzios.\n\nBefore leaving, the guide explains how to ride and the safety rules. The driver needs a driving licence; the passenger does not.',
      es: 'Cada cuatriciclo lleva hasta dos personas y sale en caravana detrás de un guía, por caminos de tierra y senderos que llevan a playas menos concurridas de Búzios.\n\nAntes de salir, el guía explica cómo manejar y las reglas de seguridad. Quien maneja necesita licencia de conducir; el acompañante no.',
    },
    inclui: {
      pt: ['Quadriciclo para até 2 pessoas', 'Guia acompanhando o grupo', 'Capacete', 'Orientação de pilotagem e segurança'],
      en: ['Quad bike for up to 2 people', 'Guide riding with the group', 'Helmet', 'Riding and safety briefing'],
      es: ['Cuatriciclo para hasta 2 personas', 'Guía que acompaña al grupo', 'Casco', 'Instrucciones de manejo y seguridad'],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Orientação e saída da base',
        'Trilhas de terra pela península',
        'Praias mais preservadas, como José Gonçalves e Tucuns (conforme a rota do dia)',
        'Paradas para foto',
        'Retorno à base',
      ],
      en: [
        'Briefing and departure from the base',
        'Dirt trails across the peninsula',
        'Wilder beaches such as José Gonçalves and Tucuns (depending on the day’s route)',
        'Photo stops',
        'Return to the base',
      ],
      es: [
        'Instrucciones y salida desde la base',
        'Senderos de tierra por la península',
        'Playas más preservadas, como José Gonçalves y Tucuns (según la ruta del día)',
        'Paradas para fotos',
        'Regreso a la base',
      ],
    },
    levar: LEVAR_OFFROAD,
  },
  {
    slug: 'city-tour-buzios',
    cidade: 'buzios',
    categoria: 'city-tour',
    precoParceiro: 190,
    unidade: 'pessoa',
    duracao: { pt: '4 horas', en: '4 hours', es: '4 horas' },
    destaque: true,
    fotos: [],
    ilustracao: 'cidade',
    nome: { pt: 'City Tour em Búzios', en: 'Búzios City Tour', es: 'City Tour en Búzios' },
    resumo: {
      pt: 'Os cartões-postais de Búzios por terra, com mirantes, praias e o centrinho.',
      en: 'The postcard views of Búzios by land: viewpoints, beaches and the charming centre.',
      es: 'Las postales de Búzios por tierra: miradores, playas y el centro.',
    },
    descricao: {
      pt: 'Um roteiro por terra para entender Búzios: o centro com a Rua das Pedras, a Orla Bardot, a Praia dos Ossos e os mirantes de onde se veem as praias dos dois lados da península.\n\nVocê viaja com conforto, com paradas para fotos e tempo para conhecer cada lugar sem pressa.',
      en: 'A land route to understand Búzios: the centre with Rua das Pedras, Orla Bardot, Ossos beach and the viewpoints overlooking beaches on both sides of the peninsula.\n\nYou travel comfortably, with photo stops and time to enjoy each place without rushing.',
      es: 'Un recorrido por tierra para entender Búzios: el centro con la Rua das Pedras, la Orla Bardot, la playa dos Ossos y los miradores con vista a las playas de los dos lados de la península.\n\nViajás cómodo, con paradas para fotos y tiempo para disfrutar cada lugar sin apuro.',
    },
    inclui: {
      pt: ['Transporte com busca e retorno ao hotel/pousada em Búzios', 'Guia ou condutor local', 'Paradas para fotos'],
      en: ['Transport with hotel pick-up and drop-off in Búzios', 'Local guide or driver', 'Photo stops'],
      es: ['Traslado con búsqueda y regreso al hotel/posada en Búzios', 'Guía o conductor local', 'Paradas para fotos'],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Busca no hotel ou pousada',
        'Orla Bardot e Praia dos Ossos',
        'Mirante de João Fernandes',
        'Praias de Geribá e Ferradura',
        'Mirantes da Praia Brava e do Forno',
        'Centro e Rua das Pedras',
        'Retorno ao hotel',
      ],
      en: [
        'Pick-up at your hotel',
        'Orla Bardot and Ossos beach',
        'João Fernandes viewpoint',
        'Geribá and Ferradura beaches',
        'Brava and Forno viewpoints',
        'Town centre and Rua das Pedras',
        'Return to your hotel',
      ],
      es: [
        'Búsqueda en el hotel o posada',
        'Orla Bardot y playa dos Ossos',
        'Mirador de João Fernandes',
        'Playas de Geribá y Ferradura',
        'Miradores de Brava y Forno',
        'Centro y Rua das Pedras',
        'Regreso al hotel',
      ],
    },
    levar: LEVAR_TERRA,
  },
  {
    slug: 'full-day-buzios',
    cidade: 'buzios',
    categoria: 'city-tour',
    precoParceiro: 240,
    unidade: 'pessoa',
    duracao: { pt: 'Dia inteiro (cerca de 8 horas)', en: 'Full day (about 8 hours)', es: 'Día completo (unas 8 horas)' },
    fotos: [],
    ilustracao: 'escuna',
    nome: { pt: 'Full Day Búzios', en: 'Búzios Full Day', es: 'Full Day Búzios' },
    resumo: {
      pt: 'Um dia inteiro em Búzios: pontos turísticos por terra, mar e tempo livre no centrinho.',
      en: 'A whole day in Búzios: sights by land and sea, plus free time in the town centre.',
      es: 'Un día completo en Búzios: lugares turísticos por tierra y mar, y tiempo libre en el centro.',
    },
    descricao: {
      pt: 'Para quem está hospedado em Cabo Frio ou Arraial do Cabo e quer conhecer Búzios em um dia só. O passeio reúne os principais mirantes e praias da península e tempo livre para almoçar e caminhar pela Rua das Pedras e pela Orla Bardot.\n\nO transporte sai do seu hotel e volta no fim da tarde, então você não precisa se preocupar com estacionamento nem com horários.',
      en: 'For travellers staying in Cabo Frio or Arraial do Cabo who want to see Búzios in a single day. The tour combines the main viewpoints and beaches of the peninsula with free time for lunch and a stroll along Rua das Pedras and Orla Bardot.\n\nTransport leaves from your hotel and brings you back in the late afternoon, so there is no need to worry about parking or schedules.',
      es: 'Para quienes se alojan en Cabo Frio o Arraial do Cabo y quieren conocer Búzios en un solo día. El paseo reúne los principales miradores y playas de la península, con tiempo libre para almorzar y caminar por la Rua das Pedras y la Orla Bardot.\n\nEl traslado sale de tu hotel y vuelve al final de la tarde, así que no tenés que preocuparte por estacionamiento ni horarios.',
    },
    inclui: {
      pt: [
        'Transporte de ida e volta a partir do hotel/pousada na Região dos Lagos',
        'Guia ou condutor local',
        'Paradas em praias e mirantes',
        'Tempo livre no centro de Búzios',
      ],
      en: [
        'Round-trip transport from your hotel in the Lakes Region',
        'Local guide or driver',
        'Stops at beaches and viewpoints',
        'Free time in downtown Búzios',
      ],
      es: [
        'Traslado de ida y vuelta desde el hotel/posada en la Región de los Lagos',
        'Guía o conductor local',
        'Paradas en playas y miradores',
        'Tiempo libre en el centro de Búzios',
      ],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Busca no hotel ou pousada',
        'Mirantes e praias da península',
        'Orla Bardot e Praia dos Ossos',
        'Parada para banho de mar',
        'Tempo livre para almoço na Rua das Pedras',
        'Retorno ao hotel no fim da tarde',
      ],
      en: [
        'Pick-up at your hotel',
        'Viewpoints and beaches of the peninsula',
        'Orla Bardot and Ossos beach',
        'Swim stop',
        'Free time for lunch on Rua das Pedras',
        'Return to your hotel in the late afternoon',
      ],
      es: [
        'Búsqueda en el hotel o posada',
        'Miradores y playas de la península',
        'Orla Bardot y playa dos Ossos',
        'Parada para bañarse en el mar',
        'Tiempo libre para almorzar en la Rua das Pedras',
        'Regreso al hotel al final de la tarde',
      ],
    },
    levar: LEVAR_PRAIA,
  },
  {
    slug: 'trolley-buzios',
    cidade: 'buzios',
    categoria: 'city-tour',
    precoParceiro: 100,
    unidade: 'pessoa',
    duracao: { pt: '2h30', en: '2h30', es: '2h30' },
    fotos: [],
    ilustracao: 'trolley',
    nome: { pt: 'Passeio de Trolley em Búzios', en: 'Trolley Tour in Búzios', es: 'Paseo en Trolley por Búzios' },
    resumo: {
      pt: 'Um veículo aberto e divertido que passa por várias praias e mirantes de Búzios.',
      en: 'A fun open-air vehicle that visits several beaches and viewpoints in Búzios.',
      es: 'Un vehículo abierto y divertido que recorre varias playas y miradores de Búzios.',
    },
    descricao: {
      pt: 'O trolley é um veículo aberto que circula por Búzios com paradas rápidas nos pontos mais fotogênicos. Sem janelas fechadas, você aproveita a brisa e a vista o tempo todo.\n\nÉ uma opção leve e econômica para ter um panorama da península, boa para todas as idades.',
      en: 'The trolley is an open-air vehicle that drives around Búzios with short stops at the most photogenic spots. With no closed windows, you enjoy the breeze and the view the whole time.\n\nIt is a light, budget-friendly way to get an overview of the peninsula, great for all ages.',
      es: 'El trolley es un vehículo abierto que recorre Búzios con paradas cortas en los puntos más fotogénicos. Sin ventanas cerradas, disfrutás la brisa y la vista todo el tiempo.\n\nEs una opción liviana y económica para tener un panorama de la península, ideal para todas las edades.',
    },
    inclui: {
      pt: ['Passeio em trolley aberto', 'Condutor local', 'Paradas em praias e mirantes'],
      en: ['Open-air trolley ride', 'Local driver', 'Stops at beaches and viewpoints'],
      es: ['Paseo en trolley abierto', 'Conductor local', 'Paradas en playas y miradores'],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Saída do ponto de encontro',
        'Praias de Geribá e Ferradura',
        'Mirante da Praia Brava',
        'Praia de João Fernandes',
        'Orla Bardot',
        'Retorno',
      ],
      en: [
        'Departure from the meeting point',
        'Geribá and Ferradura beaches',
        'Brava beach viewpoint',
        'João Fernandes beach',
        'Orla Bardot',
        'Return',
      ],
      es: [
        'Salida desde el punto de encuentro',
        'Playas de Geribá y Ferradura',
        'Mirador de la playa Brava',
        'Playa de João Fernandes',
        'Orla Bardot',
        'Regreso',
      ],
    },
    levar: LEVAR_TERRA,
  },
  {
    slug: 'lancha-buzios',
    cidade: 'buzios',
    categoria: 'barco',
    precoParceiro: 400,
    unidade: 'pessoa', // CONFIRA: por pessoa, por hora ou por embarcação?
    duracao: { pt: '2 horas', en: '2 hours', es: '2 horas' },
    fotos: [],
    ilustracao: 'lancha',
    nome: { pt: 'Aluguel de Lancha em Búzios', en: 'Speedboat Rental in Búzios', es: 'Alquiler de Lancha en Búzios' },
    resumo: {
      pt: 'Mais velocidade e liberdade para curtir as praias de Búzios pelo mar.',
      en: 'More speed and freedom to enjoy the Búzios beaches by sea.',
      es: 'Más velocidad y libertad para disfrutar las playas de Búzios por mar.',
    },
    descricao: {
      pt: 'A lancha é mais rápida que a escuna e permite um passeio mais exclusivo, com roteiro combinado com o marinheiro conforme o mar do dia. Ótima para casais, famílias e grupos de amigos.\n\nAs paradas para banho podem ser mais longas, nos pontos de água mais calma e transparente.',
      en: 'A speedboat is faster than a schooner and offers a more exclusive trip, with the route agreed with the skipper according to the day’s sea. Great for couples, families and groups of friends.\n\nSwim stops can be longer, at spots with the calmest and clearest water.',
      es: 'La lancha es más rápida que la goleta y permite un paseo más exclusivo, con el recorrido acordado con el marinero según el mar del día. Ideal para parejas, familias y grupos de amigos.\n\nLas paradas para nadar pueden ser más largas, en los puntos de agua más calma y transparente.',
    },
    inclui: {
      pt: ['Lancha com marinheiro habilitado', 'Paradas para banho', 'Coletes salva-vidas', 'Combustível do roteiro combinado'],
      en: ['Speedboat with licensed skipper', 'Swim stops', 'Life jackets', 'Fuel for the agreed route'],
      es: ['Lancha con marinero habilitado', 'Paradas para nadar', 'Chalecos salvavidas', 'Combustible del recorrido acordado'],
    },
    naoInclui: NAO_INCLUI_TRANSPORTE,
    roteiro: {
      pt: [
        'Embarque no centro de Búzios',
        'Costa norte da península',
        'Ilhas próximas',
        'Paradas para banho em praias calmas',
        'Retorno ao píer',
      ],
      en: [
        'Boarding in downtown Búzios',
        'Northern coast of the peninsula',
        'Nearby islands',
        'Swim stops at calm beaches',
        'Return to the pier',
      ],
      es: [
        'Embarque en el centro de Búzios',
        'Costa norte de la península',
        'Islas cercanas',
        'Paradas para nadar en playas tranquilas',
        'Regreso al muelle',
      ],
    },
    levar: LEVAR_PRAIA,
  },
  {
    slug: 'jet-ski-buzios',
    cidade: 'buzios',
    categoria: 'aventura',
    precoParceiro: 700,
    unidade: 'embarcacao', // CONFIRA: por jet ski e por quanto tempo
    capacidadePorUnidade: 2,
    duracao: { pt: '1 hora', en: '1 hour', es: '1 hora' },
    fotos: [],
    ilustracao: 'jetski',
    nome: { pt: 'Passeio de Jet Ski em Búzios', en: 'Jet Ski Tour in Búzios', es: 'Paseo en Moto de Agua por Búzios' },
    resumo: {
      pt: 'Adrenalina no mar de Búzios, com instrutor acompanhando o passeio.',
      en: 'Adrenaline on the Búzios sea, with an instructor alongside.',
      es: 'Adrenalina en el mar de Búzios, con instructor acompañando el paseo.',
    },
    descricao: {
      pt: 'Um passeio de jet ski acompanhado por instrutor, contornando praias e costões de Búzios. Antes de sair você recebe orientação sobre pilotagem e segurança.\n\nCada jet ski leva até duas pessoas. A rota e o tempo no mar dependem das condições do dia e das regras da Marinha.',
      en: 'A jet ski ride with an instructor, cruising past beaches and rocky shores of Búzios. Before starting you get a riding and safety briefing.\n\nEach jet ski carries up to two people. The route and time at sea depend on the day’s conditions and Navy rules.',
      es: 'Un paseo en moto de agua acompañado por un instructor, recorriendo playas y costas rocosas de Búzios. Antes de salir recibís instrucciones de manejo y seguridad.\n\nCada moto de agua lleva hasta dos personas. La ruta y el tiempo en el mar dependen de las condiciones del día y de las reglas de la Marina.',
    },
    inclui: {
      pt: ['Jet ski para até 2 pessoas', 'Instrutor acompanhando', 'Colete salva-vidas', 'Orientação de segurança'],
      en: ['Jet ski for up to 2 people', 'Instructor alongside', 'Life jacket', 'Safety briefing'],
      es: ['Moto de agua para hasta 2 personas', 'Instructor acompañando', 'Chaleco salvavidas', 'Instrucciones de seguridad'],
    },
    naoInclui: NAO_INCLUI_TRANSPORTE,
    roteiro: {
      pt: ['Orientação na base', 'Saída acompanhada pelo instrutor', 'Costões e praias da península', 'Retorno à base'],
      en: ['Briefing at the base', 'Ride out with the instructor', 'Rocky shores and beaches of the peninsula', 'Return to the base'],
      es: [
        'Instrucciones en la base',
        'Salida acompañada por el instructor',
        'Costas rocosas y playas de la península',
        'Regreso a la base',
      ],
    },
    levar: LEVAR_PRAIA,
  },
  {
    slug: 'helicoptero-buzios',
    cidade: 'buzios',
    categoria: 'aventura',
    precoParceiro: 450,
    unidade: 'pessoa',
    duracao: { pt: 'Cerca de 10 minutos de voo', en: 'About 10 minutes of flight', es: 'Unos 10 minutos de vuelo' },
    fotos: [],
    ilustracao: 'helicoptero',
    nome: { pt: 'Voo de Helicóptero em Búzios', en: 'Helicopter Flight over Búzios', es: 'Vuelo en Helicóptero sobre Búzios' },
    resumo: {
      pt: 'A península inteira vista do alto, com suas dezenas de praias e ilhas.',
      en: 'The whole peninsula from above, with its dozens of beaches and islands.',
      es: 'Toda la península vista desde arriba, con sus decenas de playas e islas.',
    },
    descricao: {
      pt: 'Do alto, Búzios mostra o desenho que dá fama à península: enseadas recortadas, praias de cores diferentes e ilhas espalhadas pelo mar. É o passeio mais marcante para comemorar uma data especial.\n\nO voo é panorâmico e operado por empresa homologada. O embarque depende de condições meteorológicas favoráveis.',
      en: 'From above, Búzios reveals the shape that made it famous: jagged coves, beaches of different colours and islands scattered across the sea. The most memorable way to celebrate a special date.\n\nThe flight is panoramic and operated by a certified company. Boarding depends on favourable weather.',
      es: 'Desde arriba, Búzios muestra el dibujo que la hizo famosa: bahías recortadas, playas de distintos colores e islas repartidas por el mar. El paseo ideal para celebrar una fecha especial.\n\nEl vuelo es panorámico y operado por una empresa habilitada. El embarque depende de condiciones meteorológicas favorables.',
    },
    inclui: {
      pt: ['Voo panorâmico de helicóptero', 'Piloto habilitado', 'Orientação de segurança antes do voo'],
      en: ['Panoramic helicopter flight', 'Licensed pilot', 'Safety briefing before the flight'],
      es: ['Vuelo panorámico en helicóptero', 'Piloto habilitado', 'Instrucciones de seguridad antes del vuelo'],
    },
    naoInclui: {
      pt: ['Transporte até o heliponto (consulte traslado)', 'Fotos e vídeos profissionais'],
      en: ['Transport to the helipad (ask us about transfers)', 'Professional photos and videos'],
      es: ['Traslado hasta el helipuerto (consulte por transfer)', 'Fotos y videos profesionales'],
    },
    roteiro: {
      pt: ['Apresentação no heliponto', 'Orientação de segurança', 'Voo sobre as praias e ilhas de Búzios', 'Pouso no heliponto'],
      en: ['Check-in at the helipad', 'Safety briefing', 'Flight over the beaches and islands of Búzios', 'Landing at the helipad'],
      es: [
        'Presentación en el helipuerto',
        'Instrucciones de seguridad',
        'Vuelo sobre las playas e islas de Búzios',
        'Aterrizaje en el helipuerto',
      ],
    },
    levar: {
      pt: ['Documento com foto', 'Óculos de sol', 'Celular ou câmera presos ao corpo'],
      en: ['Photo ID', 'Sunglasses', 'Phone or camera secured to you'],
      es: ['Documento con foto', 'Lentes de sol', 'Celular o cámara bien sujetos'],
    },
  },

  /* ========================== ARRAIAL DO CABO ========================== */
  {
    slug: 'barco-arraial-do-cabo',
    cidade: 'arraial-do-cabo',
    categoria: 'barco',
    precoParceiro: 90,
    unidade: 'pessoa',
    duracao: { pt: '3h30', en: '3h30', es: '3h30' },
    destaque: true,
    fotos: [],
    ilustracao: 'barco',
    nome: { pt: 'Passeio de Barco em Arraial do Cabo', en: 'Boat Tour in Arraial do Cabo', es: 'Paseo en Barco por Arraial do Cabo' },
    resumo: {
      pt: 'O mar mais azul do Rio: Prainhas do Pontal do Atalaia, Praia do Farol e Gruta Azul.',
      en: 'The bluest sea in Rio state: Prainhas do Pontal do Atalaia, Farol beach and the Blue Grotto.',
      es: 'El mar más azul de Río: Prainhas do Pontal do Atalaia, playa do Farol y la Gruta Azul.',
    },
    descricao: {
      pt: 'Arraial do Cabo é conhecido como o Caribe brasileiro, e o passeio de barco é a melhor forma de ver por quê. Saindo da Praia dos Anjos, o barco segue para os pontos mais famosos, de água azul-turquesa e areia branquinha.\n\nHá paradas para banho em praias que só se alcançam pelo mar, como a Praia do Farol, onde o tempo de permanência é controlado para preservar a ilha.',
      en: 'Arraial do Cabo is known as the Brazilian Caribbean, and the boat tour is the best way to see why. Leaving from Praia dos Anjos, the boat heads to the most famous spots, with turquoise water and white sand.\n\nThere are swim stops at beaches reachable only by sea, such as Farol beach, where time on land is limited to protect the island.',
      es: 'Arraial do Cabo es conocido como el Caribe brasileño, y el paseo en barco es la mejor forma de ver por qué. Saliendo de la Praia dos Anjos, el barco va a los puntos más famosos, de agua turquesa y arena blanca.\n\nHay paradas para nadar en playas a las que solo se llega por mar, como la playa do Farol, donde el tiempo de permanencia es controlado para preservar la isla.',
    },
    inclui: {
      pt: ['Passeio de barco com tripulação', 'Paradas para banho', 'Coletes salva-vidas'],
      en: ['Boat tour with crew', 'Swim stops', 'Life jackets'],
      es: ['Paseo en barco con tripulación', 'Paradas para nadar', 'Chalecos salvavidas'],
    },
    naoInclui: NAO_INCLUI_TRANSPORTE,
    roteiro: {
      pt: [
        'Embarque na Praia dos Anjos',
        'Prainhas do Pontal do Atalaia',
        'Praia do Farol (Ilha do Cabo Frio)',
        'Gruta Azul e Fenda de Nossa Senhora vistas do barco',
        'Parada para banho',
        'Retorno à Praia dos Anjos',
      ],
      en: [
        'Boarding at Praia dos Anjos',
        'Prainhas do Pontal do Atalaia',
        'Farol beach (Cabo Frio Island)',
        'Blue Grotto and Fenda de Nossa Senhora seen from the boat',
        'Swim stop',
        'Return to Praia dos Anjos',
      ],
      es: [
        'Embarque en la Praia dos Anjos',
        'Prainhas do Pontal do Atalaia',
        'Playa do Farol (Isla de Cabo Frio)',
        'Gruta Azul y Fenda de Nossa Senhora vistas desde el barco',
        'Parada para nadar',
        'Regreso a la Praia dos Anjos',
      ],
    },
    levar: LEVAR_PRAIA,
  },
  {
    slug: 'full-day-arraial-do-cabo',
    cidade: 'arraial-do-cabo',
    categoria: 'city-tour',
    precoParceiro: 265,
    unidade: 'pessoa',
    duracao: { pt: 'Dia inteiro (cerca de 9 horas)', en: 'Full day (about 9 hours)', es: 'Día completo (unas 9 horas)' },
    destaque: true,
    fotos: [],
    ilustracao: 'barco',
    nome: { pt: 'Full Day Arraial do Cabo', en: 'Arraial do Cabo Full Day', es: 'Full Day Arraial do Cabo' },
    resumo: {
      pt: 'Saindo do seu hotel: mirantes, praias e passeio de barco pelo Caribe brasileiro.',
      en: 'From your hotel: viewpoints, beaches and a boat trip in the Brazilian Caribbean.',
      es: 'Desde tu hotel: miradores, playas y paseo en barco por el Caribe brasileño.',
    },
    descricao: {
      pt: 'O dia completo em Arraial do Cabo para quem está em Búzios ou Cabo Frio. Você sai do hotel, conhece os mirantes mais bonitos da cidade e faz o passeio de barco pelas praias de água azul-turquesa.\n\nSobra tempo para almoçar e aproveitar a praia antes do retorno, no fim da tarde.',
      en: 'The complete Arraial do Cabo day for travellers staying in Búzios or Cabo Frio. You leave from your hotel, visit the town’s best viewpoints and take the boat tour to the turquoise-water beaches.\n\nThere is time left for lunch and the beach before heading back in the late afternoon.',
      es: 'El día completo en Arraial do Cabo para quienes están en Búzios o Cabo Frio. Salís del hotel, conocés los miradores más lindos de la ciudad y hacés el paseo en barco por las playas de agua turquesa.\n\nQueda tiempo para almorzar y disfrutar la playa antes de volver, al final de la tarde.',
    },
    inclui: {
      pt: [
        'Transporte de ida e volta a partir do hotel/pousada em Búzios ou Cabo Frio',
        'Passeio de barco em Arraial do Cabo',
        'Guia ou condutor local',
        'Paradas em mirantes',
      ],
      en: [
        'Round-trip transport from your hotel in Búzios or Cabo Frio',
        'Boat tour in Arraial do Cabo',
        'Local guide or driver',
        'Viewpoint stops',
      ],
      es: [
        'Traslado de ida y vuelta desde el hotel/posada en Búzios o Cabo Frio',
        'Paseo en barco por Arraial do Cabo',
        'Guía o conductor local',
        'Paradas en miradores',
      ],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Busca no hotel ou pousada',
        'Mirante do Pontal do Atalaia',
        'Passeio de barco pelas praias de Arraial',
        'Tempo livre para almoço',
        'Praia Grande',
        'Retorno ao hotel no fim da tarde',
      ],
      en: [
        'Pick-up at your hotel',
        'Pontal do Atalaia viewpoint',
        'Boat tour along the Arraial beaches',
        'Free time for lunch',
        'Praia Grande',
        'Return to your hotel in the late afternoon',
      ],
      es: [
        'Búsqueda en el hotel o posada',
        'Mirador del Pontal do Atalaia',
        'Paseo en barco por las playas de Arraial',
        'Tiempo libre para almorzar',
        'Praia Grande',
        'Regreso al hotel al final de la tarde',
      ],
    },
    levar: LEVAR_PRAIA,
  },
  {
    slug: 'city-tour-arraial-do-cabo',
    cidade: 'arraial-do-cabo',
    categoria: 'city-tour',
    precoParceiro: 240,
    unidade: 'pessoa',
    duracao: { pt: 'Cerca de 7 horas', en: 'About 7 hours', es: 'Unas 7 horas' },
    fotos: [],
    ilustracao: 'cidade',
    nome: { pt: 'City Tour em Arraial do Cabo', en: 'Arraial do Cabo City Tour', es: 'City Tour en Arraial do Cabo' },
    resumo: {
      pt: 'Os mirantes e praias de Arraial por terra, com transporte desde o seu hotel.',
      en: 'Arraial’s viewpoints and beaches by land, with transport from your hotel.',
      es: 'Los miradores y playas de Arraial por tierra, con traslado desde tu hotel.',
    },
    descricao: {
      pt: 'Um passeio por terra pelos lugares mais fotografados de Arraial do Cabo: o Pontal do Atalaia, de onde se veem as Prainhas, a Praia Grande com seu mar gelado e cristalino e a Praia dos Anjos, com os barcos coloridos.\n\nIdeal para quem prefere ficar em terra firme ou quer complementar o passeio de barco.',
      en: 'A land tour of the most photographed places in Arraial do Cabo: Pontal do Atalaia overlooking the Prainhas, Praia Grande with its cold, crystal-clear sea, and Praia dos Anjos with its colourful boats.\n\nIdeal if you prefer to stay on land or want to complement the boat tour.',
      es: 'Un paseo por tierra por los lugares más fotografiados de Arraial do Cabo: el Pontal do Atalaia con vista a las Prainhas, la Praia Grande con su mar frío y cristalino y la Praia dos Anjos con sus barcos de colores.\n\nIdeal para quien prefiere quedarse en tierra firme o quiere complementar el paseo en barco.',
    },
    inclui: {
      pt: [
        'Transporte de ida e volta a partir do hotel/pousada na Região dos Lagos',
        'Guia ou condutor local',
        'Paradas em mirantes e praias',
      ],
      en: ['Round-trip transport from your hotel in the Lakes Region', 'Local guide or driver', 'Stops at viewpoints and beaches'],
      es: [
        'Traslado de ida y vuelta desde el hotel/posada en la Región de los Lagos',
        'Guía o conductor local',
        'Paradas en miradores y playas',
      ],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Busca no hotel ou pousada',
        'Mirante do Pontal do Atalaia e Prainhas',
        'Praia Grande',
        'Praia dos Anjos',
        'Tempo livre para almoço',
        'Retorno ao hotel',
      ],
      en: [
        'Pick-up at your hotel',
        'Pontal do Atalaia viewpoint and the Prainhas',
        'Praia Grande',
        'Praia dos Anjos',
        'Free time for lunch',
        'Return to your hotel',
      ],
      es: [
        'Búsqueda en el hotel o posada',
        'Mirador del Pontal do Atalaia y Prainhas',
        'Praia Grande',
        'Praia dos Anjos',
        'Tiempo libre para almorzar',
        'Regreso al hotel',
      ],
    },
    levar: LEVAR_TERRA,
  },
  {
    slug: 'mergulho-arraial-do-cabo',
    cidade: 'arraial-do-cabo',
    categoria: 'aventura',
    precoParceiro: 250,
    unidade: 'pessoa',
    duracao: { pt: 'Cerca de 4 horas', en: 'About 4 hours', es: 'Unas 4 horas' },
    fotos: [],
    ilustracao: 'mergulho',
    nome: { pt: 'Mergulho em Arraial do Cabo', en: 'Scuba Diving in Arraial do Cabo', es: 'Buceo en Arraial do Cabo' },
    resumo: {
      pt: 'Mergulho de batismo na capital do mergulho, com instrutor e equipamento completo.',
      en: 'Discover scuba in Brazil’s diving capital, with an instructor and full gear.',
      es: 'Bautismo de buceo en la capital del buceo, con instructor y equipo completo.',
    },
    descricao: {
      pt: 'As águas frias e claras de Arraial do Cabo concentram uma vida marinha impressionante, com peixes coloridos, tartarugas e formações rochosas. O mergulho de batismo é feito com instrutor ao seu lado o tempo todo, sem precisar de experiência.\n\nAntes de entrar na água você recebe uma aula sobre respiração e sinais. Depois de mergulhar, aguarde pelo menos 24 horas para viajar de avião.',
      en: 'The cold, clear waters of Arraial do Cabo hold impressive marine life: colourful fish, turtles and rock formations. The discover-scuba dive is done with an instructor by your side the whole time, no experience needed.\n\nBefore getting in the water you get a lesson on breathing and hand signals. After diving, wait at least 24 hours before flying.',
      es: 'Las aguas frías y claras de Arraial do Cabo tienen una vida marina impresionante: peces de colores, tortugas y formaciones rocosas. El bautismo se hace con un instructor a tu lado todo el tiempo, sin necesidad de experiencia.\n\nAntes de entrar al agua recibís una clase sobre respiración y señales. Después de bucear, esperá al menos 24 horas para viajar en avión.',
    },
    inclui: {
      pt: [
        'Mergulho de batismo com instrutor credenciado',
        'Equipamento completo de mergulho',
        'Passeio de barco até o ponto de mergulho',
        'Aula teórica antes do mergulho',
      ],
      en: [
        'Discover-scuba dive with a certified instructor',
        'Full diving gear',
        'Boat trip to the dive site',
        'Briefing lesson before the dive',
      ],
      es: [
        'Bautismo de buceo con instructor certificado',
        'Equipo completo de buceo',
        'Paseo en barco hasta el punto de buceo',
        'Clase teórica antes de bucear',
      ],
    },
    naoInclui: NAO_INCLUI_TRANSPORTE,
    roteiro: {
      pt: [
        'Apresentação na operadora de mergulho',
        'Aula e ajuste do equipamento',
        'Saída de barco',
        'Mergulho acompanhado pelo instrutor',
        'Retorno ao cais',
      ],
      en: ['Check-in at the dive centre', 'Lesson and gear fitting', 'Boat departure', 'Dive with your instructor', 'Return to the pier'],
      es: [
        'Presentación en la operadora de buceo',
        'Clase y ajuste del equipo',
        'Salida en barco',
        'Buceo acompañado por el instructor',
        'Regreso al muelle',
      ],
    },
    levar: {
      pt: ['Roupa de banho e toalha', 'Protetor solar', 'Lanche leve (evite refeições pesadas antes)', 'Documento com foto'],
      en: ['Swimwear and a towel', 'Sunscreen', 'Light snack (avoid heavy meals beforehand)', 'Photo ID'],
      es: ['Traje de baño y toalla', 'Protector solar', 'Algo liviano para comer (evitá comidas pesadas antes)', 'Documento con foto'],
    },
  },
  {
    slug: 'buggy-arraial-do-cabo',
    cidade: 'arraial-do-cabo',
    categoria: 'buggy-quadriciclo',
    precoParceiro: 150,
    unidade: 'pessoa', // CONFIRA: por pessoa ou por buggy?
    duracao: { pt: '3 horas', en: '3 hours', es: '3 horas' },
    fotos: [],
    ilustracao: 'buggy',
    nome: { pt: 'Passeio de Buggy em Arraial do Cabo', en: 'Buggy Tour in Arraial do Cabo', es: 'Paseo en Buggy por Arraial do Cabo' },
    resumo: {
      pt: 'Dunas, lagoas e praias de Arraial em um passeio de buggy cheio de paisagens.',
      en: 'Dunes, lagoons and Arraial beaches on a scenic buggy ride.',
      es: 'Médanos, lagunas y playas de Arraial en un paseo en buggy lleno de paisajes.',
    },
    descricao: {
      pt: 'O buggy percorre a parte mais selvagem de Arraial do Cabo, entre dunas de areia branca, lagoas e a extensa Praia Grande. O condutor faz paradas para foto e para você aproveitar cada cenário.\n\nUm passeio diferente do barco, que mostra outro lado da cidade.',
      en: 'The buggy explores the wildest part of Arraial do Cabo, between white sand dunes, lagoons and the long Praia Grande. The driver stops for photos so you can enjoy each view.\n\nA different side of the town from the one you see by boat.',
      es: 'El buggy recorre la parte más salvaje de Arraial do Cabo, entre médanos de arena blanca, lagunas y la extensa Praia Grande. El conductor para para fotos y para que disfrutes cada paisaje.\n\nUn paseo distinto al del barco, que muestra otro lado de la ciudad.',
    },
    inclui: {
      pt: ['Buggy com condutor', 'Paradas em dunas, lagoas e praias'],
      en: ['Buggy with driver', 'Stops at dunes, lagoons and beaches'],
      es: ['Buggy con conductor', 'Paradas en médanos, lagunas y playas'],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Saída do ponto de encontro combinado',
        'Praia Grande',
        'Dunas de areia branca',
        'Lagoas da restinga',
        'Paradas para foto',
        'Retorno',
      ],
      en: ['Departure from the agreed meeting point', 'Praia Grande', 'White sand dunes', 'Coastal lagoons', 'Photo stops', 'Return'],
      es: [
        'Salida desde el punto de encuentro acordado',
        'Praia Grande',
        'Médanos de arena blanca',
        'Lagunas costeras',
        'Paradas para fotos',
        'Regreso',
      ],
    },
    levar: LEVAR_TERRA,
  },
  {
    slug: 'quadriciclo-arraial-do-cabo',
    cidade: 'arraial-do-cabo',
    categoria: 'buggy-quadriciclo',
    precoParceiro: 250,
    unidade: 'veiculo', // CONFIRA: quantas pessoas por quadriciclo
    capacidadePorUnidade: 2,
    duracao: { pt: '2 horas', en: '2 hours', es: '2 horas' },
    fotos: [],
    ilustracao: 'quadriciclo',
    nome: {
      pt: 'Passeio de Quadriciclo em Arraial do Cabo',
      en: 'Quad Bike Tour in Arraial do Cabo',
      es: 'Paseo en Cuatriciclo por Arraial do Cabo',
    },
    resumo: {
      pt: 'Trilhas de areia e dunas de Arraial pilotando o seu próprio quadriciclo.',
      en: 'Sand trails and dunes in Arraial on your own quad bike.',
      es: 'Senderos de arena y médanos de Arraial manejando tu propio cuatriciclo.',
    },
    descricao: {
      pt: 'Em comboio com um guia, você pilota por trilhas de areia e dunas com vista para o mar. Cada quadriciclo leva até duas pessoas.\n\nHá orientação de pilotagem antes da saída. Quem pilota precisa de habilitação.',
      en: 'In a convoy behind a guide, you ride sand trails and dunes with sea views. Each quad carries up to two people.\n\nThere is a riding briefing before departure. The driver needs a driving licence.',
      es: 'En caravana con un guía, manejás por senderos de arena y médanos con vista al mar. Cada cuatriciclo lleva hasta dos personas.\n\nHay instrucciones de manejo antes de salir. Quien maneja necesita licencia de conducir.',
    },
    inclui: {
      pt: ['Quadriciclo para até 2 pessoas', 'Guia acompanhando o grupo', 'Capacete', 'Orientação de pilotagem e segurança'],
      en: ['Quad bike for up to 2 people', 'Guide riding with the group', 'Helmet', 'Riding and safety briefing'],
      es: ['Cuatriciclo para hasta 2 personas', 'Guía que acompaña al grupo', 'Casco', 'Instrucciones de manejo y seguridad'],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Orientação e saída da base',
        'Trilhas de areia na restinga',
        'Dunas com vista para o mar',
        'Paradas para foto',
        'Retorno à base',
      ],
      en: [
        'Briefing and departure from the base',
        'Sand trails through the coastal scrub',
        'Dunes with sea views',
        'Photo stops',
        'Return to the base',
      ],
      es: [
        'Instrucciones y salida desde la base',
        'Senderos de arena en la restinga',
        'Médanos con vista al mar',
        'Paradas para fotos',
        'Regreso a la base',
      ],
    },
    levar: LEVAR_OFFROAD,
  },

  /* ============================= CABO FRIO ============================= */
  {
    slug: 'catamara-cabo-frio',
    cidade: 'cabo-frio',
    categoria: 'barco',
    precoParceiro: 100,
    unidade: 'pessoa',
    duracao: { pt: '2h30', en: '2h30', es: '2h30' },
    destaque: true,
    fotos: [],
    ilustracao: 'catamara',
    nome: { pt: 'Passeio de Catamarã em Cabo Frio', en: 'Catamaran Tour in Cabo Frio', es: 'Paseo en Catamarán por Cabo Frio' },
    resumo: {
      pt: 'Do Canal do Itajuru ao mar aberto, com vista do Forte São Mateus e parada na Ilha do Japonês.',
      en: 'From the Itajuru Canal to the open sea, past São Mateus Fort, with a stop at Japonês Island.',
      es: 'Del Canal do Itajuru al mar abierto, con vista al Fuerte São Mateus y parada en la Isla do Japonês.',
    },
    descricao: {
      pt: 'O catamarã sai do Canal do Itajuru, no coração de Cabo Frio, e segue até o mar passando pelo Forte São Mateus e pela Praia do Forte. No caminho há paradas para banho em águas calmas e transparentes.\n\nÉ um passeio tranquilo, ótimo para famílias e para conhecer a cidade a partir da água.',
      en: 'The catamaran leaves from the Itajuru Canal, in the heart of Cabo Frio, and heads out to sea past São Mateus Fort and Praia do Forte. Along the way there are swim stops in calm, clear water.\n\nA relaxed tour, great for families and for seeing the city from the water.',
      es: 'El catamarán sale del Canal do Itajuru, en el corazón de Cabo Frio, y va hacia el mar pasando por el Fuerte São Mateus y la Praia do Forte. En el camino hay paradas para nadar en aguas calmas y transparentes.\n\nUn paseo tranquilo, ideal para familias y para conocer la ciudad desde el agua.',
    },
    inclui: {
      pt: ['Passeio de catamarã com tripulação', 'Paradas para banho', 'Coletes salva-vidas'],
      en: ['Catamaran tour with crew', 'Swim stops', 'Life jackets'],
      es: ['Paseo en catamarán con tripulación', 'Paradas para nadar', 'Chalecos salvavidas'],
    },
    naoInclui: NAO_INCLUI_TRANSPORTE,
    roteiro: {
      pt: ['Embarque no Canal do Itajuru', 'Forte São Mateus e Praia do Forte', 'Ilha do Japonês', 'Parada para banho', 'Retorno ao canal'],
      en: ['Boarding at the Itajuru Canal', 'São Mateus Fort and Praia do Forte', 'Japonês Island', 'Swim stop', 'Return to the canal'],
      es: [
        'Embarque en el Canal do Itajuru',
        'Fuerte São Mateus y Praia do Forte',
        'Isla do Japonês',
        'Parada para nadar',
        'Regreso al canal',
      ],
    },
    levar: LEVAR_PRAIA,
  },
  {
    slug: 'city-tour-cabo-frio',
    cidade: 'cabo-frio',
    categoria: 'city-tour',
    precoParceiro: 230,
    unidade: 'pessoa',
    duracao: { pt: 'Cerca de 7 horas', en: 'About 7 hours', es: 'Unas 7 horas' },
    fotos: [],
    ilustracao: 'cidade',
    nome: { pt: 'City Tour em Cabo Frio', en: 'Cabo Frio City Tour', es: 'City Tour en Cabo Frio' },
    resumo: {
      pt: 'Forte São Mateus, Praia do Forte, Dunas do Peró e a famosa Rua dos Biquínis.',
      en: 'São Mateus Fort, Praia do Forte, the Peró Dunes and the famous Bikini Street.',
      es: 'Fuerte São Mateus, Praia do Forte, los Médanos do Peró y la famosa Calle de los Bikinis.',
    },
    descricao: {
      pt: 'Cabo Frio é uma das cidades mais antigas do Brasil e mistura história com praias de areia branca. O city tour passa pelo Forte São Mateus, pela Praia do Forte, pelas Dunas do Peró e pela Rua dos Biquínis, famosa pela moda praia.\n\nO transporte sai do seu hotel e há tempo livre para compras e almoço.',
      en: 'Cabo Frio is one of the oldest towns in Brazil, mixing history with white-sand beaches. The city tour visits São Mateus Fort, Praia do Forte, the Peró Dunes and Bikini Street, famous for its beachwear shops.\n\nTransport leaves from your hotel and there is free time for shopping and lunch.',
      es: 'Cabo Frio es una de las ciudades más antiguas de Brasil y mezcla historia con playas de arena blanca. El city tour pasa por el Fuerte São Mateus, la Praia do Forte, los Médanos do Peró y la Calle de los Bikinis, famosa por la moda de playa.\n\nEl traslado sale de tu hotel y hay tiempo libre para compras y almuerzo.',
    },
    inclui: {
      pt: [
        'Transporte de ida e volta a partir do hotel/pousada na Região dos Lagos',
        'Guia ou condutor local',
        'Paradas em pontos turísticos',
      ],
      en: ['Round-trip transport from your hotel in the Lakes Region', 'Local guide or driver', 'Stops at the main sights'],
      es: [
        'Traslado de ida y vuelta desde el hotel/posada en la Región de los Lagos',
        'Guía o conductor local',
        'Paradas en lugares turísticos',
      ],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: [
        'Busca no hotel ou pousada',
        'Forte São Mateus e Praia do Forte',
        'Canal do Itajuru',
        'Dunas e Praia do Peró',
        'Rua dos Biquínis',
        'Tempo livre para almoço',
        'Retorno ao hotel',
      ],
      en: [
        'Pick-up at your hotel',
        'São Mateus Fort and Praia do Forte',
        'Itajuru Canal',
        'Peró Dunes and beach',
        'Bikini Street',
        'Free time for lunch',
        'Return to your hotel',
      ],
      es: [
        'Búsqueda en el hotel o posada',
        'Fuerte São Mateus y Praia do Forte',
        'Canal do Itajuru',
        'Médanos y playa do Peró',
        'Calle de los Bikinis',
        'Tiempo libre para almorzar',
        'Regreso al hotel',
      ],
    },
    levar: LEVAR_TERRA,
  },
  {
    slug: 'buggy-cabo-frio',
    cidade: 'cabo-frio',
    categoria: 'buggy-quadriciclo',
    precoParceiro: 150,
    unidade: 'pessoa', // CONFIRA: por pessoa ou por buggy?
    duracao: { pt: '3 horas', en: '3 hours', es: '3 horas' },
    fotos: [],
    ilustracao: 'buggy',
    nome: { pt: 'Passeio de Buggy em Cabo Frio', en: 'Buggy Tour in Cabo Frio', es: 'Paseo en Buggy por Cabo Frio' },
    resumo: {
      pt: 'As Dunas do Peró e as praias de Cabo Frio a bordo de um buggy.',
      en: 'The Peró Dunes and Cabo Frio beaches aboard a buggy.',
      es: 'Los Médanos do Peró y las playas de Cabo Frio a bordo de un buggy.',
    },
    descricao: {
      pt: 'Um passeio de buggy pelas paisagens mais abertas de Cabo Frio: as dunas de areia branca do Peró, praias extensas e mirantes sobre o mar.\n\nO condutor faz paradas para fotos e para você caminhar pelas dunas.',
      en: 'A buggy ride through Cabo Frio’s most open landscapes: the white sand dunes of Peró, long beaches and viewpoints over the sea.\n\nThe driver stops for photos and for you to walk on the dunes.',
      es: 'Un paseo en buggy por los paisajes más abiertos de Cabo Frio: los médanos de arena blanca del Peró, playas extensas y miradores sobre el mar.\n\nEl conductor para para fotos y para que camines por los médanos.',
    },
    inclui: {
      pt: ['Buggy com condutor', 'Paradas em dunas, praias e mirantes'],
      en: ['Buggy with driver', 'Stops at dunes, beaches and viewpoints'],
      es: ['Buggy con conductor', 'Paradas en médanos, playas y miradores'],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: ['Saída do ponto de encontro combinado', 'Dunas do Peró', 'Praia do Peró', 'Praia das Conchas', 'Paradas para foto', 'Retorno'],
      en: ['Departure from the agreed meeting point', 'Peró Dunes', 'Peró beach', 'Conchas beach', 'Photo stops', 'Return'],
      es: [
        'Salida desde el punto de encuentro acordado',
        'Médanos do Peró',
        'Playa do Peró',
        'Playa das Conchas',
        'Paradas para fotos',
        'Regreso',
      ],
    },
    levar: LEVAR_TERRA,
  },
  {
    slug: 'quadriciclo-cabo-frio',
    cidade: 'cabo-frio',
    categoria: 'buggy-quadriciclo',
    precoParceiro: 270,
    unidade: 'veiculo',
    capacidadePorUnidade: 2,
    duracao: { pt: '2 horas', en: '2 hours', es: '2 horas' },
    fotos: [],
    ilustracao: 'quadriciclo',
    nome: { pt: 'Passeio de Quadriciclo em Cabo Frio', en: 'Quad Bike Tour in Cabo Frio', es: 'Paseo en Cuatriciclo por Cabo Frio' },
    resumo: {
      pt: 'Pilote um quadriciclo pelas trilhas e dunas de Cabo Frio.',
      en: 'Ride a quad bike along the trails and dunes of Cabo Frio.',
      es: 'Manejá un cuatriciclo por los senderos y médanos de Cabo Frio.',
    },
    descricao: {
      pt: 'Em comboio com um guia, o passeio percorre trilhas de areia e dunas com vista para o mar. Cada quadriciclo leva até duas pessoas.\n\nAntes da saída há orientação de pilotagem e segurança. Quem pilota precisa de habilitação.',
      en: 'In a convoy behind a guide, the tour follows sand trails and dunes with sea views. Each quad carries up to two people.\n\nThere is a riding and safety briefing before departure. The driver needs a driving licence.',
      es: 'En caravana con un guía, el paseo recorre senderos de arena y médanos con vista al mar. Cada cuatriciclo lleva hasta dos personas.\n\nAntes de salir hay instrucciones de manejo y seguridad. Quien maneja necesita licencia de conducir.',
    },
    inclui: {
      pt: ['Quadriciclo para até 2 pessoas', 'Guia acompanhando o grupo', 'Capacete', 'Orientação de pilotagem e segurança'],
      en: ['Quad bike for up to 2 people', 'Guide riding with the group', 'Helmet', 'Riding and safety briefing'],
      es: ['Cuatriciclo para hasta 2 personas', 'Guía que acompaña al grupo', 'Casco', 'Instrucciones de manejo y seguridad'],
    },
    naoInclui: NAO_INCLUI_BASE,
    roteiro: {
      pt: ['Orientação e saída da base', 'Trilhas de areia', 'Dunas com vista para o mar', 'Paradas para foto', 'Retorno à base'],
      en: ['Briefing and departure from the base', 'Sand trails', 'Dunes with sea views', 'Photo stops', 'Return to the base'],
      es: [
        'Instrucciones y salida desde la base',
        'Senderos de arena',
        'Médanos con vista al mar',
        'Paradas para fotos',
        'Regreso a la base',
      ],
    },
    levar: LEVAR_OFFROAD,
  },

  /* ========================== SAINDO DA REGIÃO ========================== */
  {
    slug: 'city-tour-rio-de-janeiro',
    cidade: 'rio-de-janeiro',
    categoria: 'city-tour',
    precoParceiro: 380,
    unidade: 'pessoa',
    duracao: { pt: 'Dia inteiro (cerca de 14 horas)', en: 'Full day (about 14 hours)', es: 'Día completo (unas 14 horas)' },
    fotos: [],
    ilustracao: 'rio',
    nome: { pt: 'City Tour no Rio de Janeiro', en: 'Rio de Janeiro City Tour', es: 'City Tour en Río de Janeiro' },
    resumo: {
      pt: 'Saindo da Região dos Lagos para um dia nos cartões-postais do Rio.',
      en: 'A day trip from the Lakes Region to Rio’s most famous sights.',
      es: 'Un día saliendo de la Región de los Lagos para conocer las postales de Río.',
    },
    descricao: {
      pt: 'Um dia inteiro no Rio de Janeiro sem dirigir: o transporte sai cedo da Região dos Lagos e percorre os pontos mais famosos da cidade, como Cristo Redentor, Pão de Açúcar, Escadaria Selarón, Arcos da Lapa, Maracanã e as praias de Copacabana e Ipanema.\n\nIngressos de atrações pagas, como o trem do Corcovado e o bondinho, não estão incluídos e podem ser comprados no local.',
      en: 'A full day in Rio de Janeiro without driving: transport leaves early from the Lakes Region and visits the city’s most famous sights, such as Christ the Redeemer, Sugarloaf Mountain, the Selarón Steps, the Lapa Arches, Maracanã and the beaches of Copacabana and Ipanema.\n\nTickets for paid attractions, such as the Corcovado train and the cable car, are not included and can be bought on site.',
      es: 'Un día completo en Río de Janeiro sin manejar: el traslado sale temprano de la Región de los Lagos y recorre los lugares más famosos de la ciudad, como el Cristo Redentor, el Pan de Azúcar, la Escalera Selarón, los Arcos de Lapa, el Maracaná y las playas de Copacabana e Ipanema.\n\nLas entradas a atracciones pagas, como el tren del Corcovado y el teleférico, no están incluidas y se pueden comprar en el lugar.',
    },
    inclui: {
      pt: [
        'Transporte de ida e volta a partir do hotel/pousada na Região dos Lagos',
        'Guia durante o passeio',
        'Paradas nos principais pontos turísticos',
      ],
      en: ['Round-trip transport from your hotel in the Lakes Region', 'Guide throughout the tour', 'Stops at the main sights'],
      es: [
        'Traslado de ida y vuelta desde el hotel/posada en la Región de los Lagos',
        'Guía durante el paseo',
        'Paradas en los principales lugares turísticos',
      ],
    },
    naoInclui: {
      pt: ['Ingressos de atrações (trem do Corcovado, bondinho do Pão de Açúcar e outros)', 'Alimentação e bebidas'],
      en: ['Attraction tickets (Corcovado train, Sugarloaf cable car and others)', 'Food and drinks'],
      es: ['Entradas a atracciones (tren del Corcovado, teleférico del Pan de Azúcar y otras)', 'Comidas y bebidas'],
    },
    roteiro: {
      pt: [
        'Busca no hotel de madrugada/início da manhã',
        'Cristo Redentor',
        'Pão de Açúcar',
        'Escadaria Selarón e Arcos da Lapa',
        'Catedral Metropolitana e Maracanã',
        'Praias de Copacabana e Ipanema',
        'Retorno à Região dos Lagos à noite',
      ],
      en: [
        'Early-morning pick-up at your hotel',
        'Christ the Redeemer',
        'Sugarloaf Mountain',
        'Selarón Steps and Lapa Arches',
        'Metropolitan Cathedral and Maracanã',
        'Copacabana and Ipanema beaches',
        'Return to the Lakes Region in the evening',
      ],
      es: [
        'Búsqueda en el hotel de madrugada',
        'Cristo Redentor',
        'Pan de Azúcar',
        'Escalera Selarón y Arcos de Lapa',
        'Catedral Metropolitana y Maracaná',
        'Playas de Copacabana e Ipanema',
        'Regreso a la Región de los Lagos por la noche',
      ],
    },
    levar: {
      pt: [
        'Roupa e calçado confortáveis',
        'Protetor solar e boné',
        'Casaco leve (no alto do Corcovado venta)',
        'Documento com foto',
        'Dinheiro ou cartão para ingressos e refeições',
      ],
      en: [
        'Comfortable clothes and shoes',
        'Sunscreen and a cap',
        'A light jacket (it can be windy up on Corcovado)',
        'Photo ID',
        'Cash or card for tickets and meals',
      ],
      es: [
        'Ropa y calzado cómodos',
        'Protector solar y gorra',
        'Campera liviana (en el Corcovado puede haber viento)',
        'Documento con foto',
        'Efectivo o tarjeta para entradas y comidas',
      ],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function passeiosAtivos(): Passeio[] {
  return PASSEIOS.filter((p) => p.ativo !== false).sort((a, b) => CIDADES[a.cidade].ordem - CIDADES[b.cidade].ordem);
}

export function obterPasseio(slug: string): Passeio | undefined {
  return PASSEIOS.find((p) => p.slug === slug && p.ativo !== false);
}
