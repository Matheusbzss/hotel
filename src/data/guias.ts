import type { Cidade } from './passeios';

/**
 * AS PÁGINAS DE GUIA EM ESPANHOL (só existem em /es/guias)
 *
 * Como editar:
 * - TEXTO: só informação verdadeira, conferida em fonte confiável ou nos dados do próprio site. Preço nunca vai
 *   no texto: os cartões de passeio e de transfer leem o preço de src/data, e assim ele nunca fica velho.
 * - LINK no meio do texto: [palavras](/passeios/escuna-buzios), sempre com o caminho em português (a página
 *   traduz para o endereço em espanhol). tests/guias.test.ts confere se todo link leva a uma página que existe.
 * - FOTO: só de public/fotos, com o texto alternativo em src/data/fotos-alt.ts.
 * - Espanhol com voseo, como o resto do site ("reservá", "elegí").
 */
export interface DetalheGuia {
  nome: string;
  texto: string;
}

export interface SecaoGuia {
  /** A âncora do índice: letras simples e hífen. */
  id: string;
  titulo: string;
  paragrafos: string[];
  foto?: string;
  /** Como a foto se encaixa no recorte, quando o centro não é o melhor ponto. */
  posicaoFoto?: string;
  /** Lista de nome e explicação: playas, dias do roteiro. */
  detalhes?: DetalheGuia[];
  /** Os cartões da seção, pelo slug de src/data/passeios.ts. */
  passeios?: string[];
  /** Mostra o cartão do transfer para essa cidade. */
  transfer?: Cidade;
  /** A primeira coluna é o título da linha. `compacta`: números curtos, que cabem em linhas no celular. */
  tabela?: { legenda: string; colunas: string[]; linhas: string[][]; compacta?: boolean };
}

export interface Guia {
  slug: string;
  /** Título no Google, sem a marca (a marca entra sozinha): até 46 caracteres. */
  titulo: string;
  /** Descrição no Google: até 160 caracteres. */
  descricao: string;
  /** A frase curta do cartão, na lista de guias. */
  chamada: string;
  h1: string;
  foto: string;
  posicaoFoto?: string;
  /** A resposta curta, logo abaixo do título. */
  resumo: string;
  /** Até quatro fatos para bater o olho. */
  ficha: { rotulo: string; valor: string }[];
  secoes: SecaoGuia[];
  perguntas: { p: string; r: string }[];
  fechamento: { titulo: string; texto: string; botao: string; caminho: string; foto: string; posicaoFoto?: string };
  /** Os três guias do "Seguí leyendo", pelo slug. */
  relacionados: string[];
  /** AAAA-MM-DD */
  publicado: string;
  atualizado: string;
}

export const GUIAS: Guia[] = [
  {
    slug: 'que-hacer-en-buzios',
    titulo: 'Qué hacer en Búzios: mejores playas y paseos',
    descricao:
      'Guía de Búzios para planear tu viaje: las mejores playas, paseos en barco y buggy, la Rua das Pedras, cuántos días quedarte y cómo llegar desde Río.',
    chamada: 'Playas, paseos y un plan para tres días',
    h1: 'Qué hacer en Búzios',
    foto: '/fotos/buzios/escuna-no-mar.jpg',
    posicaoFoto: '66% 50%',
    resumo:
      'Búzios es una península de unos 8 km con 23 playas, a unos 170 km de Río de Janeiro. Lo que más vale la pena: ver las playas desde el mar, recorrer los miradores y terminar el día en la Rua das Pedras.',
    ficha: [
      { rotulo: 'Playas', valor: '23' },
      { rotulo: 'Desde Río', valor: 'Unos 170 km' },
      { rotulo: 'En auto', valor: '2h30 a 3h30' },
      { rotulo: 'Para verla bien', valor: '3 a 5 días' },
    ],
    secoes: [
      {
        id: 'playas',
        titulo: 'Las playas que valen la pena',
        paragrafos: [
          'Búzios tiene playas de mar abierto, con olas, y playas de agua calma, ideales para nadar. Estas son las más visitadas y qué esperar de cada una. La guía de las [mejores playas de Búzios](/guias/mejores-playas-de-buzios) las compara todas.',
        ],
        foto: '/fotos/buzios/pedras-a-beira-mar.jpg',
        posicaoFoto: '50% 62%',
        detalhes: [
          { nome: 'João Fernandes', texto: 'Agua calma, con bares y restaurantes sobre la arena. Es una de las más concurridas.' },
          { nome: 'Ferradura', texto: 'Bahía con forma de herradura y mar tranquilo, buena para ir con chicos.' },
          { nome: 'Geribá', texto: 'La más larga, con unos 2 km de arena. Tiene olas para surf y muchos hoteles cerca.' },
          { nome: 'Azeda y Azedinha', texto: 'Dos playas chicas al lado de Ossos. Se llega por un sendero corto o en taxi acuático.' },
          { nome: 'Tartaruga', texto: 'Mar calmo y buen lugar para ver el atardecer.' },
          { nome: 'Ossos', texto: 'Barcos de pesca y agua transparente, junto al centro. De acá sale el sendero a Azeda.' },
        ],
      },
      {
        id: 'barco',
        titulo: 'Un paseo en barco por la península',
        paragrafos: [
          'El mejor primer día en Búzios es arriba de un barco. Desde el mar se entiende la península y se ven bahías, islas y playas que mucha gente solo conoce así.',
          'La [goleta](/passeios/escuna-buzios) sale del centro y hace paradas para nadar y hacer snorkel. El [catamarán](/passeios/catamara-buzios) se mueve menos: es la mejor opción para familias y para quien teme marearse. La [lancha privada](/passeios/lancha-buzios) va solo con tu grupo, y acordás con el marinero qué playas conocer y cuánto tiempo quedarte. Las paradas cambian según el viento y el mar del día.',
        ],
        passeios: ['escuna-buzios', 'catamara-buzios', 'lancha-buzios', 'jet-ski-buzios'],
      },
      {
        id: 'por-tierra',
        titulo: 'Playas y miradores por tierra',
        paragrafos: [
          'En [buggy](/passeios/buggy-buzios) llegás en un mismo paseo a playas de los dos lados de la península, con paradas en los miradores de Brava y Forno. Te lleva un conductor, así que solo disfrutás la vista.',
          'El [trolley](/passeios/trolley-buzios) es un vehículo abierto, liviano y económico, para todas las edades. Si preferís manejar, el [cuatriciclo](/passeios/quadriciclo-buzios) sale en caravana con un guía por caminos de tierra hasta playas menos concurridas. Quien maneja necesita licencia de conducir.',
        ],
        foto: '/fotos/buzios/buggy-ferradura.jpg',
        posicaoFoto: '12% 50%',
        passeios: ['buggy-buzios', 'trolley-buzios', 'quadriciclo-buzios', 'city-tour-buzios'],
      },
      {
        id: 'centro',
        titulo: 'Rua das Pedras, Orla Bardot y el atardecer',
        paragrafos: [
          'La Rua das Pedras es el centro de Búzios: una calle de piedra con restaurantes, negocios y bares. Se sigue caminando por la Orla Bardot, junto al mar, donde está la estatua de Brigitte Bardot, la actriz que visitó el pueblo en 1964.',
          'Para el atardecer, los lugares más elegidos son la Orla Bardot y Porto da Barra. De noche conviene ir caminando o en taxi: estacionar cerca es difícil en temporada alta.',
        ],
        foto: '/fotos/buzios/orla-bardot-flores.jpg',
        posicaoFoto: '50% 70%',
      },
      {
        id: 'excursiones',
        titulo: 'Un día en Arraial do Cabo, Cabo Frio o Río',
        paragrafos: [
          'Búzios queda cerca de dos ciudades que vale la pena conocer, y las dos entran en un día. En [Arraial do Cabo](/passeios/full-day-arraial-do-cabo), conocida como el Caribe brasileño, el día incluye miradores y un paseo en barco por playas de agua turquesa. En [Cabo Frio](/passeios/full-day-cabo-frio) navegás hasta la Isla do Japonês y conocés el Fuerte São Mateus y la Praia do Forte.',
          'Si no pasaste por Río de Janeiro, también hay [un día en sus postales](/passeios/city-tour-rio-de-janeiro). En los tres casos te buscan en el hotel.',
        ],
        passeios: ['full-day-arraial-do-cabo', 'full-day-cabo-frio', 'city-tour-rio-de-janeiro'],
      },
      {
        id: 'dias',
        titulo: 'Cuántos días quedarte',
        paragrafos: [
          'Con tres días completos ves lo principal sin apuro. Con cinco sumás Arraial do Cabo o Cabo Frio y te quedan días libres de playa. Este es un plan simple para tres días:',
        ],
        detalhes: [
          { nome: 'Día 1', texto: 'Paseo en barco a la mañana y Orla Bardot al atardecer.' },
          { nome: 'Día 2', texto: 'Buggy por playas y miradores, y tarde libre en João Fernandes o Ferradura.' },
          { nome: 'Día 3', texto: 'Full day en Arraial do Cabo, con búsqueda en el hotel.' },
          { nome: 'Si tenés más días', texto: 'Cabo Frio, una lancha privada o días libres de playa.' },
        ],
      },
      {
        id: 'como-llegar',
        titulo: 'Cómo llegar desde Río de Janeiro',
        paragrafos: [
          'Búzios no tiene vuelos comerciales regulares. Lo habitual es volar a Río de Janeiro y seguir por tierra unos 170 km: son entre 2h30 y 3h30 en auto, según el tránsito. El aeropuerto comercial más cercano es el de Cabo Frio, a unos 30 km.',
          'También hay buses desde la Rodoviária Novo Rio. Con el [traslado privado](/transfer?destino=buzios), el chofer te espera en el desembarque y te deja en tu alojamiento, con solo tu grupo en el vehículo. La guía de [cómo ir de Río a Búzios](/guias/como-ir-de-rio-a-buzios) compara todas las opciones.',
        ],
        transfer: 'buzios',
      },
    ],
    perguntas: [
      {
        p: '¿Cuántos días se necesitan para conocer Búzios?',
        r: 'Tres días completos alcanzan para un paseo en barco, los miradores y las playas principales. Con cinco podés sumar Arraial do Cabo o Cabo Frio.',
      },
      {
        p: '¿Qué hacer en Búzios si llueve?',
        r: 'Los paseos en barco dependen del clima y del mar. Si tu paseo se cancela por lluvia, mal tiempo o condiciones del mar, elegís entre reembolso total o una nueva fecha, sin costo. Para esos días quedan los negocios y restaurantes de la Rua das Pedras.',
      },
      {
        p: '¿Qué hacer en Búzios con chicos?',
        r: 'Ferradura y João Fernandes tienen mar calmo. El catamarán se mueve menos y tiene mucho espacio, y el trolley es para todas las edades. En la mayoría de los paseos, los niños de hasta 5 años no pagan: la regla de cada uno está en su página.',
      },
      {
        p: '¿Búzios tiene aeropuerto?',
        r: 'Tiene un aeródromo para aviones ejecutivos y helicópteros, sin vuelos comerciales regulares. Los aeropuertos que se usan son Galeão y Santos Dumont, en Río de Janeiro, y el de Cabo Frio.',
      },
      {
        p: '¿Conviene reservar los paseos antes de viajar?',
        r: 'Sí: elegís la fecha y el grupo desde casa y ya sabés el precio final. Si cambiás de planes, cancelando con al menos 24 horas de anticipación el reembolso es total.',
      },
    ],
    fechamento: {
      titulo: 'Dejá los paseos resueltos antes de viajar',
      texto: 'Elegí la fecha y el grupo, mirá el precio final y reservá desde casa. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver los paseos en Búzios',
      caminho: '/passeios?cidade=buzios',
      foto: '/fotos/buzios/por-do-sol-barcos-na-baia.jpg',
      posicaoFoto: '50% 60%',
    },
    relacionados: ['mejores-playas-de-buzios', 'como-ir-de-rio-a-buzios', 'mejor-epoca-para-ir-a-buzios'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'como-ir-de-rio-a-buzios',
    titulo: 'Cómo ir de Río a Búzios: traslado, bus y auto',
    descricao:
      'Todas las formas de ir de Río de Janeiro a Búzios: traslado privado, bus y auto. Cuánto se tarda, qué aeropuerto conviene y cuál elegir según tu grupo.',
    chamada: 'Traslado, bus o auto: tiempos y cuál conviene',
    h1: 'Cómo ir de Río de Janeiro a Búzios',
    foto: '/fotos/transfer/carro-virtus-com-clientes.jpg',
    posicaoFoto: '50% 60%',
    resumo:
      'Búzios está a unos 170 km de Río de Janeiro y no tiene vuelos comerciales regulares: el último tramo siempre es por tierra. Son unas 3 horas en un día normal, en auto o en bus. Con valijas, chicos o en grupo, lo más simple es un traslado privado desde el aeropuerto.',
    ficha: [
      { rotulo: 'Distancia', valor: 'Unos 170 km' },
      { rotulo: 'En auto', valor: '2h30 a 3h30' },
      { rotulo: 'En bus', valor: 'Unas 3 horas' },
      { rotulo: 'Vuelos regulares', valor: 'No hay' },
    ],
    secoes: [
      {
        id: 'opciones',
        titulo: 'Las opciones, de un vistazo',
        paragrafos: ['La mejor forma depende de cuántos son, cuántas valijas llevan y a qué hora aterriza tu vuelo.'],
        foto: '/fotos/transfer/carros-creta-com-motoristas.jpg',
        posicaoFoto: '50% 40%',
        detalhes: [
          { nome: 'Traslado privado', texto: 'De puerta a puerta y sin paradas, solo con tu grupo. Es lo más cómodo con chicos o valijas grandes.' },
          { nome: 'Bus', texto: 'Lo más económico si viajás solo o en pareja. Te deja en el centro de Búzios y desde ahí seguís hasta tu alojamiento.' },
          { nome: 'Traslado compartido', texto: 'Una van con otros pasajeros: suele costar menos que el privado, pero dependés de sus horarios y paradas.' },
          { nome: 'Auto alquilado', texto: 'Da libertad para moverte por la región. Hay que sumar peajes, combustible y estacionamiento.' },
          { nome: 'Auto por aplicación', texto: 'Se puede pedir, pero el precio varía según el horario y la demanda.' },
        ],
      },
      {
        id: 'traslado',
        titulo: 'Traslado privado, paso a paso',
        paragrafos: [
          'Reservás online con la fecha, el horario y el número de tu vuelo. En el aeropuerto, el chofer sigue tu llegada y te espera en arribos con un cartel con tu nombre. Después va directo a tu hotel o posada, sin paradas extra.',
          'El precio es por vehículo, no por persona: hay [auto ejecutivo](/transfer?destino=buzios) para hasta 4 personas y van para hasta 17. El peaje y el estacionamiento están incluidos, la silla para chicos no tiene costo y podés cancelar gratis hasta 24 horas antes.',
        ],
        transfer: 'buzios',
      },
      {
        id: 'bus',
        titulo: 'En bus desde la Rodoviária Novo Rio',
        paragrafos: [
          'Los buses a Búzios salen de la Rodoviária Novo Rio, la terminal de Río de Janeiro, y tardan unas 3 horas. Llegan al centro de Búzios: si tu alojamiento no queda cerca, desde ahí seguís en taxi o en auto por aplicación.',
          'Desde el aeropuerto de Galeão también hay buses directos, pero son pocos por día y tardan alrededor de 3h30. Mirá los horarios en el sitio de la empresa antes de comprar el vuelo, y en temporada alta sacá el pasaje con tiempo.',
        ],
      },
      {
        id: 'auto',
        titulo: 'En auto: la ruta y los peajes',
        paragrafos: [
          'El camino habitual cruza el puente Río-Niterói y sigue por la Via Lagos, dos tramos con peaje. En un día normal son unas 3 horas. En feriados, fines de semana largos y temporada alta puede tardar bastante más.',
          'Si solo vas a moverte por la península, también podés dejar el auto de lado: varios paseos te buscan en el hotel, y en temporada alta estacionar en el centro de Búzios es difícil.',
        ],
      },
      {
        id: 'aeropuertos',
        titulo: 'Desde qué aeropuerto salir',
        paragrafos: [
          'Río de Janeiro tiene dos aeropuertos y hay un tercero más cerca de Búzios. Si venís del exterior, la guía de [cómo llegar desde Argentina y Chile](/guias/como-llegar-a-buzios-desde-argentina-y-chile) cuenta qué vuelos hay.',
        ],
        detalhes: [
          { nome: 'Galeão (GIG)', texto: 'El aeropuerto internacional de Río de Janeiro, a unos 180 km de Búzios.' },
          { nome: 'Santos Dumont (SDU)', texto: 'Queda en el centro de Río y recibe sobre todo vuelos dentro de Brasil. Está a unos 177 km de Búzios.' },
          { nome: 'Cabo Frio (CFB)', texto: 'El más cercano: unos 30 km, cerca de media hora en auto. Tiene pocos vuelos, y varios son solo de temporada.' },
        ],
      },
      {
        id: 'en-buzios',
        titulo: 'Ya en Búzios: qué reservar',
        paragrafos: [
          'Con el viaje resuelto, lo que sigue son los paseos. Para el primer día conviene uno en barco, que muestra la península desde el mar. La guía de [qué hacer en Búzios](/guias/que-hacer-en-buzios) tiene un plan para tres días.',
        ],
        passeios: ['escuna-buzios', 'catamara-buzios', 'buggy-buzios', 'full-day-arraial-do-cabo'],
      },
    ],
    perguntas: [
      {
        p: '¿Cuánto se tarda de Río a Búzios?',
        r: 'Entre 2h30 y 3h30 en auto y unas 3 horas en bus. En feriados y en temporada alta el viaje puede ser más largo.',
      },
      {
        p: '¿Se puede ir de Río a Búzios y volver en el día?',
        r: 'Se puede, pero son unas 6 horas de ruta en total y queda poco tiempo en la península. Para conocerla bien conviene quedarse al menos tres días.',
      },
      {
        p: '¿El chofer me espera si mi vuelo se atrasa?',
        r: 'Con el número de vuelo, el chofer sigue tu llegada y te espera en arribos con un cartel con tu nombre. La espera es de hasta 1 hora.',
      },
      {
        p: '¿Hay Uber de Río a Búzios?',
        r: 'Se puede pedir un auto por aplicación, pero el precio varía según el horario y la demanda. Con un traslado privado sabés el precio final antes de viajar.',
      },
      {
        p: '¿Cómo viajan los chicos en el traslado?',
        r: 'Los menores de 10 años con menos de 1,45 m viajan en silla o en asiento elevador. Tenemos los dos, sin costo: indicá en la reserva cuántos chicos viajan y la edad de cada uno.',
      },
    ],
    fechamento: {
      titulo: 'Reservá el traslado antes de aterrizar',
      texto: 'Elegí la fecha y el vehículo, y mirá el precio final. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver el precio del traslado',
      caminho: '/transfer?destino=buzios',
      foto: '/fotos/buzios/catamara-do-alto.jpg',
      posicaoFoto: '50% 30%',
    },
    relacionados: ['que-hacer-en-buzios', 'como-llegar-a-buzios-desde-argentina-y-chile', 'mejores-playas-de-buzios'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'paseo-en-barco-arraial-do-cabo',
    titulo: 'Paseo en barco en Arraial do Cabo: qué ver',
    descricao:
      'Cómo es el paseo en barco por Arraial do Cabo: recorrido, duración, playa do Farol, Gruta Azul, qué llevar y cómo elegir entre barco, full day o lancha.',
    chamada: 'El recorrido, qué llevar y cómo elegir',
    h1: 'Paseo en barco por Arraial do Cabo',
    foto: '/fotos/arraial/barco-toboga.jpg',
    posicaoFoto: '50% 55%',
    resumo:
      'El paseo sale de la Praia dos Anjos, dura unas 4 horas y pasa por las Prainhas do Pontal do Atalaia, la playa do Farol y la Gruta Azul. Es la forma más fácil de ver el agua turquesa que le dio a Arraial el apodo de Caribe brasileño.',
    ficha: [
      { rotulo: 'Duración', valor: 'Unas 4 horas' },
      { rotulo: 'Salida', valor: 'Praia dos Anjos' },
      { rotulo: 'Playa do Farol', valor: 'Solo por mar' },
      { rotulo: 'Chicos sin cargo', valor: 'Hasta 5 años' },
    ],
    secoes: [
      {
        id: 'recorrido',
        titulo: 'Qué se ve en el recorrido',
        paragrafos: [
          'El barco sale de la Praia dos Anjos y sigue la costa. El orden y las paradas cambian según el viento, el mar y las reglas de visita del día. Estos son los puntos más conocidos:',
        ],
        foto: '/fotos/arraial/costao-fenda.jpg',
        posicaoFoto: '50% 45%',
        detalhes: [
          { nome: 'Prainhas do Pontal do Atalaia', texto: 'Arena blanca y agua turquesa al pie del morro. Por tierra hay que bajar más de 250 escalones; en barco se llega sin esfuerzo.' },
          { nome: 'Playa do Farol', texto: 'En la Isla de Cabo Frio. Solo se llega por mar, la Marina controla las visitas y el tiempo en la arena suele ser de 40 minutos a 1 hora.' },
          { nome: 'Gruta Azul', texto: 'Una gruta en la roca, que se mira desde el barco.' },
          { nome: 'Fenda de Nossa Senhora', texto: 'Una grieta alta entre dos paredes de roca, que también se mira desde el barco.' },
        ],
      },
      {
        id: 'elegir',
        titulo: 'Barco, full day o lancha: cuál te conviene',
        paragrafos: [
          'El [paseo en barco](/passeios/barco-arraial-do-cabo) es la opción clásica si ya estás en Arraial. Algunos barcos tienen tobogán y música a bordo; el modelo depende de la disponibilidad del día.',
          'Si te alojás en Búzios o Cabo Frio, el [full day](/passeios/full-day-arraial-do-cabo) suma la búsqueda en el hotel y los miradores, en un día de unas 10 horas. Para ir solo con tu grupo está la [lancha privada](/passeios/lancha-privativa-arraial-do-cabo): hasta 10 personas, unas 6 horas y un recorrido que armás con el marinero.',
        ],
        passeios: ['barco-arraial-do-cabo', 'full-day-arraial-do-cabo', 'lancha-privativa-arraial-do-cabo'],
      },
      {
        id: 'consejos',
        titulo: 'Qué llevar y qué tener en cuenta',
        paragrafos: ['El paseo incluye la tripulación, los chalecos salvavidas y las paradas para nadar. Lo demás conviene llevarlo resuelto:'],
        foto: '/fotos/arraial/banho-com-peixes.jpg',
        posicaoFoto: '50% 62%',
        detalhes: [
          { nome: 'Qué llevar', texto: 'Traje de baño, toalla, protector solar, lentes de sol, sombrero, agua y un documento con foto.' },
          { nome: 'Efectivo o tarjeta', texto: 'Comidas, bebidas y fotos profesionales no están incluidas. Las tasas municipales o de embarque, cuando se cobran, se pagan en el lugar.' },
          { nome: 'Agua fría', texto: 'El mar de Arraial es más frío que el de otras playas de la región, incluso en verano.' },
          { nome: 'Horarios', texto: 'Hay salidas a la mañana y a la tarde: elegís el horario al reservar.' },
        ],
      },
      {
        id: 'como-llegar',
        titulo: 'Cómo llegar a la Praia dos Anjos',
        paragrafos: [
          'Arraial do Cabo está a unos 164 km de Río de Janeiro y a unos 40 km de Búzios. El traslado hasta el embarque no está incluido en el paseo. La guía de [cómo llegar a Arraial do Cabo](/guias/como-llegar-a-arraial-do-cabo) compara todas las opciones.',
          'Con el [traslado privado](/transfer?destino=arraial-do-cabo), el chofer te espera en el aeropuerto y te deja en tu alojamiento, solo con tu grupo.',
        ],
        transfer: 'arraial-do-cabo',
      },
    ],
    perguntas: [
      {
        p: '¿Cuánto dura el paseo en barco en Arraial do Cabo?',
        r: 'Unas 4 horas, saliendo de la Praia dos Anjos y volviendo al mismo lugar.',
      },
      {
        p: '¿Se baja en la playa do Farol?',
        r: 'Sí, cuando las reglas de visita del día lo permiten. La Marina controla la isla y el tiempo en la arena es limitado, para preservarla.',
      },
      {
        p: '¿El paseo incluye comida?',
        r: 'No. Incluye el barco, la tripulación, los chalecos y las paradas para nadar. Comidas y bebidas se pagan aparte.',
      },
      {
        p: '¿Pueden ir chicos?',
        r: 'Sí. En el paseo en barco, los chicos de hasta 5 años no pagan y hasta los 10 pagan la mitad.',
      },
      {
        p: '¿Qué pasa si hay mal tiempo?',
        r: 'Si el paseo se cancela por lluvia, mal tiempo o condiciones del mar, elegís entre reembolso total o una nueva fecha, sin costo.',
      },
    ],
    fechamento: {
      titulo: 'Elegí tu día en el agua turquesa',
      texto: 'Mirá las fechas y el precio final, y reservá desde casa. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver el paseo en barco',
      caminho: '/passeios/barco-arraial-do-cabo',
      foto: '/fotos/arraial/barco-gruta.jpg',
      posicaoFoto: '50% 72%',
    },
    relacionados: ['que-hacer-en-arraial-do-cabo', 'excursion-arraial-do-cabo-desde-buzios', 'buceo-en-arraial-do-cabo'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'excursion-arraial-do-cabo-desde-buzios',
    titulo: 'Excursión a Arraial do Cabo desde Búzios',
    descricao:
      'Cómo es la excursión a Arraial do Cabo desde Búzios: búsqueda en el hotel, miradores y paseo en barco en un día. Horarios, qué incluye y qué llevar.',
    chamada: 'Un día con búsqueda en el hotel y paseo en barco',
    h1: 'Excursión a Arraial do Cabo desde Búzios',
    foto: '/fotos/arraial/barcos-agua-turquesa.jpg',
    posicaoFoto: '50% 42%',
    resumo:
      'Arraial do Cabo queda a unos 40 km de Búzios y se puede conocer en un día. El full day te busca en el hotel, para en los miradores, hace el paseo en barco por las playas de agua turquesa y te deja de vuelta al final de la tarde.',
    ficha: [
      { rotulo: 'Duración', valor: 'Unas 10 horas' },
      { rotulo: 'Búsqueda', valor: '7 de la mañana' },
      { rotulo: 'Distancia', valor: 'Unos 40 km' },
      { rotulo: 'En la ruta', valor: '1h a 1h20' },
    ],
    secoes: [
      {
        id: 'como-es',
        titulo: 'Cómo es el día',
        paragrafos: ['La van pasa por tu hotel o posada a la mañana y te deja de vuelta al final de la tarde. Este es el recorrido:'],
        foto: '/fotos/arraial/pontal-do-atalaia-vista.jpg',
        posicaoFoto: '50% 70%',
        detalhes: [
          { nome: 'A la mañana', texto: 'Búsqueda en el hotel y ruta hasta Arraial do Cabo.' },
          { nome: 'Mirador', texto: 'Parada en el Pontal do Atalaia, con vista a las Prainhas.' },
          { nome: 'Barco', texto: 'Paseo por las playas de agua turquesa, con paradas para nadar.' },
          { nome: 'Almuerzo', texto: 'Tiempo libre para comer. La comida no está incluida.' },
          { nome: 'A la tarde', texto: 'Praia Grande y regreso al hotel.' },
        ],
      },
      {
        id: 'incluye',
        titulo: 'Qué incluye y qué no',
        paragrafos: [
          'El precio incluye el traslado de ida y vuelta desde tu hotel en Búzios o Cabo Frio, el paseo en barco, el guía o conductor local y las paradas en los miradores. Los chicos de hasta 5 años no pagan y hasta los 10 pagan la mitad.',
          'Comidas y bebidas van aparte, igual que las tasas municipales o de embarque cuando se cobran en el lugar. Llevá traje de baño, toalla, protector solar, lentes de sol, sombrero, agua, un documento con foto y efectivo o tarjeta para los gastos del día.',
        ],
      },
      {
        id: 'alternativas',
        titulo: 'Otras formas de conocer Arraial',
        paragrafos: [
          'Si preferís quedarte en tierra firme, el [city tour](/passeios/city-tour-arraial-do-cabo) recorre los miradores y las playas en unas 7 horas, con traslado desde tu hotel. Para ir solo con tu grupo, la [lancha privada](/passeios/lancha-privativa-arraial-do-cabo) sale de la Praia dos Anjos y lleva hasta 10 personas.',
          'La guía del [paseo en barco](/guias/paseo-en-barco-arraial-do-cabo) cuenta qué se ve en el recorrido, y la de [qué hacer en Arraial do Cabo](/guias/que-hacer-en-arraial-do-cabo) sirve si decidís quedarte más días.',
        ],
        passeios: ['full-day-arraial-do-cabo', 'city-tour-arraial-do-cabo', 'lancha-privativa-arraial-do-cabo'],
      },
      {
        id: 'por-tu-cuenta',
        titulo: 'Si preferís ir por tu cuenta',
        paragrafos: [
          'Entre Búzios y Arraial do Cabo hay unos 40 km: se tarda de 1 hora a 1h20 en auto. Si manejás y vas a hacer el paseo en barco, calculá llegar a la Praia dos Anjos antes del horario de salida.',
          'El [traslado privado](/transfer?destino=arraial-do-cabo) también hace este camino, solo con tu grupo. No tiene precio fijo: elegí la salida y el destino y pedí la cotización.',
        ],
        transfer: 'arraial-do-cabo',
      },
    ],
    perguntas: [
      {
        p: '¿Cuánto se tarda de Búzios a Arraial do Cabo?',
        r: 'De 1 hora a 1h20 en auto, según el tránsito. Son unos 40 km.',
      },
      {
        p: '¿A qué hora pasan a buscarme?',
        r: 'La van pasa por tu hotel o posada a las 7 de la mañana y te deja de vuelta al final de la tarde.',
      },
      {
        p: '¿Vale la pena ir a Arraial desde Búzios en un día?',
        r: 'Sí. Es la forma más simple de ver el agua turquesa sin cambiar de hotel. Si te gusta el buceo o querés más playa, conviene quedarse al menos una noche.',
      },
      {
        p: '¿La excursión también sale de Cabo Frio?',
        r: 'Sí. El traslado de ida y vuelta incluye hoteles y posadas en Búzios o Cabo Frio.',
      },
      {
        p: '¿Qué pasa si el mar no permite navegar?',
        r: 'Si el paseo se cancela por lluvia, mal tiempo o condiciones del mar, elegís entre reembolso total o una nueva fecha, sin costo.',
      },
    ],
    fechamento: {
      titulo: 'Un día en el Caribe brasileño, sin manejar',
      texto: 'La van te busca en el hotel y vos solo elegís la fecha. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver el full day',
      caminho: '/passeios/full-day-arraial-do-cabo',
      foto: '/fotos/arraial/banho-com-peixes.jpg',
      posicaoFoto: '50% 38%',
    },
    relacionados: ['paseo-en-barco-arraial-do-cabo', 'que-hacer-en-arraial-do-cabo', 'buzios-o-arraial-do-cabo'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'mejores-playas-de-buzios',
    titulo: 'Mejores playas de Búzios: cuál elegir',
    descricao:
      'Las mejores playas de Búzios según lo que busques: agua calma para nadar, olas para surf y playas escondidas. Cómo llegar a cada una y cuál elegir.',
    chamada: 'Agua calma, olas o rincones escondidos',
    h1: 'Las mejores playas de Búzios',
    foto: '/fotos/buzios/pedras-a-beira-mar.jpg',
    posicaoFoto: '50% 62%',
    resumo:
      'Búzios tiene 23 playas en una península de unos 8 km. En un mismo día podés elegir entre agua calma para nadar, olas para surf y playas chicas que se disfrutan mejor desde el mar.',
    ficha: [
      { rotulo: 'Para nadar', valor: 'João Fernandes' },
      { rotulo: 'Con chicos', valor: 'Ferradura' },
      { rotulo: 'Con olas', valor: 'Geribá' },
      { rotulo: 'Atardecer', valor: 'Tartaruga' },
    ],
    secoes: [
      {
        id: 'agua-calma',
        titulo: 'Playas de agua calma para nadar',
        paragrafos: ['Son las mejores para nadar, hacer snorkel y pasar el día con chicos.'],
        foto: '/fotos/buzios/lancha-joao-fernandes.jpg',
        posicaoFoto: '50% 55%',
        detalhes: [
          { nome: 'João Fernandes', texto: 'Agua calma y mucha estructura: bares, restaurantes y alquiler de stand up paddle.' },
          { nome: 'Ferradura', texto: 'Bahía de mar tranquilo y poco profundo, elegida por las familias. Se llena en temporada alta.' },
          { nome: 'Ferradurinha', texto: 'Una bahía chica y calma, buena para ir con chicos. Se llega caminando desde el lado izquierdo de Geribá.' },
          { nome: 'Azeda', texto: 'Mar calmo para hacer snorkel, kayak y stand up paddle. Se llega a pie, por una escalera de madera, o en taxi acuático.' },
          { nome: 'Tartaruga', texto: 'Agua tranquila, restaurantes y un buen lugar para ver el atardecer.' },
          { nome: 'Forno', texto: 'Mar calmo y profundo, con arena rosada. Es una de las mejores para hacer snorkel.' },
        ],
      },
      {
        id: 'olas',
        titulo: 'Playas con olas y viento',
        paragrafos: ['El mar es más movido: son para surf, kitesurf y largas caminatas. Si vas con chicos, conviene elegir otras.'],
        detalhes: [
          { nome: 'Geribá', texto: 'La más larga, con unos 2 km de arena. Tiene olas para surf, y el lado izquierdo es más calmo.' },
          { nome: 'Manguinhos', texto: 'Mucho viento, por eso es la playa del kitesurf. Queda junto a Porto da Barra, con lindos atardeceres.' },
          { nome: 'Brava', texto: 'Mar agitado y paradores sobre la arena. De acá sale el sendero a Olho de Boi.' },
          { nome: 'Tucuns', texto: 'Larga y con viento. Es un lugar elegido para volar en parapente.' },
          { nome: 'José Gonçalves', texto: 'Olas grandes y un paisaje más salvaje. No es para ir con chicos.' },
        ],
      },
      {
        id: 'escondidas',
        titulo: 'Playas chicas y escondidas',
        paragrafos: ['Son las que más fotos dan. Como son chicas, en temporada alta conviene ir temprano.'],
        foto: '/fotos/buzios/escada-para-a-praia.jpg',
        posicaoFoto: '50% 60%',
        detalhes: [
          { nome: 'Azedinha', texto: 'Muy chica. Se llega por un camino de piedras desde Azeda.' },
          { nome: 'João Fernandinho', texto: 'Al lado de João Fernandes, con escalera de acceso y buen snorkel.' },
          { nome: 'Ossos', texto: 'Barcos de pesca y taxis acuáticos, junto al centro. Es linda para mirar, pero no la mejor para nadar.' },
          { nome: 'Foca', texto: 'Diminuta, con piscinas naturales cuando baja la marea.' },
          { nome: 'Olho de Boi', texto: 'Playa naturista y la de acceso más difícil, por un sendero desde Brava.' },
        ],
      },
      {
        id: 'ver-varias',
        titulo: 'Cómo conocer varias playas en un día',
        paragrafos: [
          'Las playas están repartidas por toda la península, y en temporada alta estacionar es difícil. Por eso lo más práctico es ir de una a otra en un paseo.',
          'Desde el mar, la [goleta](/passeios/escuna-buzios) pasa por Azeda y Azedinha y para a nadar en lugares como João Fernandes, Tartaruga o Forno, según el mar del día. Por tierra, el [buggy](/passeios/buggy-buzios) une Geribá, Ferradura, João Fernandes y Azeda con los miradores de Brava y Forno. Con la [lancha privada](/passeios/lancha-buzios) elegís las playas con el marinero.',
        ],
        passeios: ['escuna-buzios', 'buggy-buzios', 'lancha-buzios', 'trolley-buzios'],
      },
      {
        id: 'como-llegar',
        titulo: 'Cómo llegar a Búzios',
        paragrafos: [
          'Búzios está a unos 170 km de Río de Janeiro, y el aeropuerto comercial más cercano es el de Cabo Frio, a unos 30 km. La guía de [cómo ir de Río a Búzios](/guias/como-ir-de-rio-a-buzios) compara el traslado, el bus y el auto.',
          'Con el [traslado privado](/transfer?destino=buzios), el chofer te espera en el aeropuerto y te deja en tu alojamiento, solo con tu grupo.',
        ],
        transfer: 'buzios',
      },
    ],
    perguntas: [
      {
        p: '¿Cuál es la mejor playa de Búzios?',
        r: 'Depende de lo que busques. Para nadar con calma, João Fernandes o Ferradura; para surf, Geribá; para kitesurf, Manguinhos; para snorkel, Forno o João Fernandinho.',
      },
      {
        p: '¿Cuál es la mejor playa de Búzios para ir con chicos?',
        r: 'Ferradura y Ferradurinha, por el mar calmo. Evitá Brava y José Gonçalves, que tienen mar agitado y olas grandes.',
      },
      {
        p: '¿Se pueden recorrer las playas caminando?',
        r: 'Las que están cerca del centro, sí: Ossos, Azeda y Azedinha quedan a pie. Para las demás hace falta un vehículo, un taxi acuático o un paseo.',
      },
      {
        p: '¿Dónde ver el atardecer en Búzios?',
        r: 'Tartaruga, Manguinhos y Porto da Barra son buenos lugares, igual que la Orla Bardot, en el centro.',
      },
      {
        p: '¿Cuántas playas tiene Búzios?',
        r: 'Tiene 23 playas, en una península de unos 8 km.',
      },
    ],
    fechamento: {
      titulo: 'Conocé varias playas en un solo paseo',
      texto: 'Elegí entre barco o buggy, mirá el precio final y reservá desde casa. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver los paseos en Búzios',
      caminho: '/passeios?cidade=buzios',
      foto: '/fotos/buzios/jet-ski-mar-azul.jpg',
      posicaoFoto: '50% 60%',
    },
    relacionados: ['que-hacer-en-buzios', 'mejor-epoca-para-ir-a-buzios', 'buzios-o-arraial-do-cabo'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'como-llegar-a-arraial-do-cabo',
    titulo: 'Cómo llegar a Arraial do Cabo desde Río',
    descricao:
      'Cómo llegar a Arraial do Cabo desde Río de Janeiro en traslado, bus o auto: cuánto se tarda, dónde deja el bus y qué aeropuerto queda más cerca.',
    chamada: 'Desde Río, Búzios o Cabo Frio: tiempos y opciones',
    h1: 'Cómo llegar a Arraial do Cabo',
    foto: '/fotos/arraial/portal-de-entrada.jpg',
    posicaoFoto: '50% 52%',
    resumo:
      'Arraial do Cabo está a unos 164 km de Río de Janeiro y no tiene aeropuerto. Son unas 2h30 en auto en un día normal y más de 3 horas en bus. El aeropuerto más cercano es el de Cabo Frio, a unos 10 km.',
    ficha: [
      { rotulo: 'Desde Río', valor: 'Unos 164 km' },
      { rotulo: 'En auto', valor: '2h20 a 2h40' },
      { rotulo: 'En bus', valor: '3h a 3h30' },
      { rotulo: 'Aeropuerto', valor: 'Cabo Frio' },
    ],
    secoes: [
      {
        id: 'opciones',
        titulo: 'Las opciones, de un vistazo',
        paragrafos: ['Estas son las formas de llegar y cuándo conviene cada una.'],
        foto: '/fotos/transfer/van-porta-lateral-bancos.jpg',
        posicaoFoto: '50% 50%',
        detalhes: [
          { nome: 'Traslado privado', texto: 'De puerta a puerta, solo con tu grupo, desde el aeropuerto o desde cualquier dirección de Río.' },
          { nome: 'Bus', texto: 'Sale de la Rodoviária Novo Rio. Es lo más económico si viajás solo o en pareja.' },
          { nome: 'Auto', texto: 'Sirve si querés recorrer la región por tu cuenta. Hay que sumar peajes y combustible.' },
          { nome: 'Avión hasta Cabo Frio', texto: 'Hay pocos vuelos y varios son solo de temporada, pero te deja a unos 10 km de Arraial.' },
        ],
      },
      {
        id: 'traslado',
        titulo: 'Traslado privado desde Río o Cabo Frio',
        paragrafos: [
          'El chofer te espera en arribos de Galeão, Santos Dumont o Cabo Frio, o en la dirección que indiques en Río, y te deja en tu hotel o posada sin paradas extra. Viajás solo con tu grupo, en [auto para hasta 4 personas o van para hasta 17](/transfer?destino=arraial-do-cabo).',
          'El precio es por vehículo y ya incluye el peaje y el estacionamiento. Si viajan chicos, la silla no tiene costo: indicá en la reserva la edad de cada uno.',
        ],
        transfer: 'arraial-do-cabo',
      },
      {
        id: 'bus',
        titulo: 'En bus desde la Rodoviária Novo Rio',
        paragrafos: [
          'La empresa 1001 une la Rodoviária Novo Rio con Arraial do Cabo. El viaje tarda de 3 horas a 3h30, y más si hay tránsito. El bus llega a la terminal Fernando Barros Pessoa y desde ahí seguís hasta tu alojamiento.',
          'En temporada alta y en feriados conviene sacar el pasaje con tiempo.',
        ],
      },
      {
        id: 'auto',
        titulo: 'En auto desde Río',
        paragrafos: [
          'Se cruza el puente Río-Niterói y se sigue por la Via Lagos, dos tramos con peaje. En un día normal son unas 2h30. En feriados y temporada alta puede tardar bastante más.',
        ],
      },
      {
        id: 'desde-buzios',
        titulo: 'Desde Búzios o Cabo Frio',
        paragrafos: [
          'Arraial está a unos 40 km de Búzios, de 1 hora a 1h20 en auto. Si te alojás en Búzios o Cabo Frio, no hace falta organizar el viaje: el [full day](/passeios/full-day-arraial-do-cabo) te busca en el hotel y suma los miradores y el paseo en barco.',
          'La guía de la [excursión desde Búzios](/guias/excursion-arraial-do-cabo-desde-buzios) cuenta cómo es el día.',
        ],
        passeios: ['full-day-arraial-do-cabo', 'barco-arraial-do-cabo', 'lancha-privativa-arraial-do-cabo', 'mergulho-arraial-do-cabo'],
      },
    ],
    perguntas: [
      {
        p: '¿Arraial do Cabo tiene aeropuerto?',
        r: 'No. El más cercano es el de Cabo Frio, a unos 10 km. Los de Río de Janeiro, Galeão y Santos Dumont, quedan a más de 2 horas por ruta.',
      },
      {
        p: '¿Cuánto tarda el bus de Río a Arraial do Cabo?',
        r: 'De 3 horas a 3h30, y más si hay tránsito. Sale de la Rodoviária Novo Rio.',
      },
      {
        p: '¿Qué queda más cerca de Río, Arraial do Cabo o Búzios?',
        r: 'Están casi a la misma distancia: unos 164 km Arraial do Cabo y unos 170 km Búzios.',
      },
      {
        p: '¿Se puede ir a Arraial do Cabo y volver a Río en el día?',
        r: 'Se puede, pero son unas 5 horas de ruta en total. Para hacer el paseo en barco sin apuro, conviene dormir al menos una noche en la región.',
      },
      {
        p: '¿Cuánto se tarda de Búzios a Arraial do Cabo?',
        r: 'De 1 hora a 1h20 en auto. Son unos 40 km.',
      },
    ],
    fechamento: {
      titulo: 'Llegá sin pensar en la ruta',
      texto: 'Elegí la fecha y el vehículo, y mirá el precio final. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver el precio del traslado',
      caminho: '/transfer?destino=arraial-do-cabo',
      foto: '/fotos/arraial/barcos-agua-turquesa.jpg',
      posicaoFoto: '50% 42%',
    },
    relacionados: ['que-hacer-en-arraial-do-cabo', 'paseo-en-barco-arraial-do-cabo', 'buzios-o-arraial-do-cabo'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'que-hacer-en-arraial-do-cabo',
    titulo: 'Qué hacer en Arraial do Cabo: playas y paseos',
    descricao:
      'Guía de Arraial do Cabo: las mejores playas, el paseo en barco, buceo, miradores y cuántos días quedarte en el llamado Caribe brasileño.',
    chamada: 'Playas, barco, buceo y un plan para dos días',
    h1: 'Qué hacer en Arraial do Cabo',
    foto: '/fotos/arraial/mirante-praia-do-forno.jpg',
    posicaoFoto: '50% 42%',
    resumo:
      'A Arraial do Cabo le dicen el Caribe brasileño por su agua turquesa. Lo imprescindible es el paseo en barco, pero también vale la pena subir a los miradores, caminar hasta la Praia do Forno y, si te animás, bucear.',
    ficha: [
      { rotulo: 'Desde Río', valor: 'Unos 164 km' },
      { rotulo: 'En auto', valor: '2h20 a 2h40' },
      { rotulo: 'Paseo en barco', valor: 'Unas 4 horas' },
      { rotulo: 'Para verla bien', valor: '2 a 3 días' },
    ],
    secoes: [
      {
        id: 'por-que',
        titulo: 'Por qué el agua es tan turquesa',
        paragrafos: [
          'Frente a Arraial ocurre la surgencia: una corriente de agua fría y llena de nutrientes sube desde el fondo del mar. Por eso el mar es más frío que en el resto de la región y tiene tanta vida marina.',
          'Con la arena blanca y el agua clara, el color justifica el apodo de Caribe brasileño. La mejor forma de verlo es desde un barco.',
        ],
        foto: '/fotos/arraial/lancha-agua-turquesa-do-alto.jpg',
        posicaoFoto: '50% 40%',
      },
      {
        id: 'playas',
        titulo: 'Las playas de Arraial',
        paragrafos: ['Son menos que en Búzios y varias tienen un acceso difícil, pero el color del agua compensa. Estas son las más conocidas:'],
        foto: '/fotos/arraial/pontal-do-atalaia-vista.jpg',
        posicaoFoto: '50% 70%',
        detalhes: [
          { nome: 'Prainhas do Pontal do Atalaia', texto: 'Arena blanca y agua turquesa. Se baja por una escalera de más de 250 escalones o se llega en barco.' },
          { nome: 'Praia do Forno', texto: 'Se llega por un sendero de unos 20 minutos desde el lado izquierdo del puerto, o en taxi acuático.' },
          { nome: 'Playa do Farol', texto: 'En la Isla de Cabo Frio. Solo se llega en barco, y la Marina controla el tiempo de visita.' },
          { nome: 'Praia Grande', texto: 'Larga y de agua fría, con el atardecer sobre el mar.' },
          { nome: 'Praia dos Anjos', texto: 'La playa central, de donde salen los barcos. No es la mejor para bañarse.' },
        ],
      },
      {
        id: 'barco',
        titulo: 'El paseo que no hay que perderse',
        paragrafos: [
          'Las playas más famosas se ven mejor desde el agua. El [paseo en barco](/passeios/barco-arraial-do-cabo) sale de la Praia dos Anjos y dura unas 4 horas, con paradas para nadar. Si querés ir solo con tu grupo, está la [lancha privada](/passeios/lancha-privativa-arraial-do-cabo), para hasta 10 personas.',
          'La guía del [paseo en barco](/guias/paseo-en-barco-arraial-do-cabo) cuenta el recorrido y qué llevar.',
        ],
        passeios: ['barco-arraial-do-cabo', 'lancha-privativa-arraial-do-cabo', 'full-day-arraial-do-cabo'],
      },
      {
        id: 'bucear',
        titulo: 'Bucear en la capital del buceo',
        paragrafos: [
          'Sin experiencia podés hacer un [bautismo](/passeios/mergulho-arraial-do-cabo), con un instructor a tu lado todo el tiempo. Si ya tenés certificación, hay [dos inmersiones guiadas](/passeios/mergulho-credenciado-arraial-do-cabo) en los puntos más conocidos.',
          'Todo el detalle está en la guía de [buceo en Arraial do Cabo](/guias/buceo-en-arraial-do-cabo).',
        ],
        foto: '/fotos/arraial/mergulho-tartaruga-de-perto.jpg',
        posicaoFoto: '50% 55%',
        passeios: ['mergulho-arraial-do-cabo', 'mergulho-credenciado-arraial-do-cabo'],
      },
      {
        id: 'por-tierra',
        titulo: 'Miradores, médanos y lagunas por tierra',
        paragrafos: [
          'El [city tour](/passeios/city-tour-arraial-do-cabo) recorre el Pontal do Atalaia, la Praia Grande y la Praia dos Anjos, con traslado desde tu hotel en la Región de los Lagos. En [buggy](/passeios/buggy-arraial-do-cabo) conocés el lado más salvaje de la ciudad, entre médanos, lagunas y la Praia Grande.',
          'Si preferís manejar, el [cuatriciclo](/passeios/quadriciclo-arraial-do-cabo) sale en caravana con un guía por senderos de arena. Quien maneja necesita licencia de conducir.',
        ],
        passeios: ['city-tour-arraial-do-cabo', 'buggy-arraial-do-cabo', 'quadriciclo-arraial-do-cabo'],
      },
      {
        id: 'dias',
        titulo: 'Cuántos días quedarte',
        paragrafos: ['Con dos días completos ves lo principal. Con tres sumás buceo o buggy sin apuro. Este es un plan simple:'],
        detalhes: [
          { nome: 'Día 1', texto: 'Paseo en barco y, al final de la tarde, el atardecer en la Praia Grande.' },
          { nome: 'Día 2', texto: 'Sendero a la Praia do Forno y mirador del Pontal do Atalaia.' },
          { nome: 'Si tenés más días', texto: 'Bautismo de buceo, buggy por los médanos o un día en Cabo Frio.' },
        ],
      },
      {
        id: 'como-llegar',
        titulo: 'Cómo llegar a Arraial do Cabo',
        paragrafos: [
          'Arraial está a unos 164 km de Río de Janeiro y no tiene aeropuerto: el más cercano es el de Cabo Frio, a unos 10 km. La guía de [cómo llegar a Arraial do Cabo](/guias/como-llegar-a-arraial-do-cabo) compara el traslado, el bus y el auto.',
          'Con el [traslado privado](/transfer?destino=arraial-do-cabo), el chofer te espera en el aeropuerto y te deja en tu alojamiento, solo con tu grupo.',
        ],
        transfer: 'arraial-do-cabo',
      },
    ],
    perguntas: [
      {
        p: '¿Por qué le dicen el Caribe brasileño a Arraial do Cabo?',
        r: 'Por el color turquesa del agua y la arena blanca de sus playas, sobre todo las que se ven en el paseo en barco.',
      },
      {
        p: '¿El agua de Arraial do Cabo es fría?',
        r: 'Sí. La surgencia trae agua fría desde el fondo del mar, así que suele estar más fría que en otras playas de la región, incluso en verano.',
      },
      {
        p: '¿Cuántos días se necesitan para conocer Arraial do Cabo?',
        r: 'Con dos días completos alcanza para el paseo en barco, los miradores y una playa por tierra. Con tres podés sumar buceo o buggy.',
      },
      {
        p: '¿Qué hacer en Arraial do Cabo con chicos?',
        r: 'El paseo en barco es la mejor opción: los chicos de hasta 5 años no pagan y hasta los 10 pagan la mitad. A las Prainhas conviene llegar por mar, porque por tierra hay una escalera de más de 250 escalones.',
      },
      {
        p: '¿Se puede conocer Arraial do Cabo en un día desde Búzios?',
        r: 'Sí. El full day te busca en el hotel en Búzios o Cabo Frio, para en los miradores y hace el paseo en barco, en unas 10 horas.',
      },
    ],
    fechamento: {
      titulo: 'Dejá el barco reservado antes de viajar',
      texto: 'Elegí la fecha y el grupo, mirá el precio final y reservá desde casa. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver los paseos en Arraial do Cabo',
      caminho: '/passeios?cidade=arraial-do-cabo',
      foto: '/fotos/arraial/barco-toboga.jpg',
      posicaoFoto: '50% 55%',
    },
    relacionados: ['paseo-en-barco-arraial-do-cabo', 'buceo-en-arraial-do-cabo', 'como-llegar-a-arraial-do-cabo'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'buzios-o-arraial-do-cabo',
    titulo: 'Búzios o Arraial do Cabo: cuál elegir',
    descricao:
      'Búzios o Arraial do Cabo: diferencias de agua, playas, noche, acceso y alojamiento para elegir bien, y cómo conocer las dos en un mismo viaje.',
    chamada: 'Las diferencias, tema por tema',
    h1: 'Búzios o Arraial do Cabo: cuál elegir',
    foto: '/fotos/arraial/lancha-agua-turquesa-do-alto.jpg',
    posicaoFoto: '50% 52%',
    resumo:
      'Si buscás el mar más turquesa y un lugar tranquilo, elegí Arraial do Cabo. Si querés más playas, restaurantes y vida nocturna, elegí Búzios. Están a unos 40 km, así que podés alojarte en una y conocer la otra en un día.',
    ficha: [
      { rotulo: 'Entre las dos', valor: 'Unos 40 km' },
      { rotulo: 'En auto', valor: '1h a 1h20' },
      { rotulo: 'Búzios desde Río', valor: 'Unos 170 km' },
      { rotulo: 'Arraial desde Río', valor: 'Unos 164 km' },
    ],
    secoes: [
      {
        id: 'diferencias',
        titulo: 'Las diferencias, tema por tema',
        paragrafos: ['Las dos quedan en la Región de los Lagos, a unas 3 horas de Río de Janeiro, pero son viajes distintos.'],
        tabela: {
          legenda: 'Búzios y Arraial do Cabo, tema por tema',
          colunas: ['Tema', 'Búzios', 'Arraial do Cabo'],
          linhas: [
            ['Agua', 'Más verde, y cambia de una playa a otra', 'Más azul y turquesa, y más fría'],
            ['Playas', '23 playas, casi todas de acceso fácil', 'Menos playas, muchas chicas y de acceso más difícil'],
            ['De noche', 'Restaurantes, bares y un centro para recorrer a pie', 'Tranquila, con poca vida nocturna'],
            ['Alojamiento', 'Más opciones para elegir', 'Una estructura más simple'],
            ['Paseos', 'Goleta, buggy, moto de agua y helicóptero', 'Barco a la playa do Farol, buceo y buggy por los médanos'],
          ],
        },
      },
      {
        id: 'elegi-buzios',
        titulo: 'Elegí Búzios si…',
        paragrafos: [
          'Querés variedad: más de veinte playas, muchas de agua calma y fácil acceso, además de restaurantes, negocios y un centro para salir a la noche. También es la opción más simple para ir con chicos o si querés moverte poco.',
          'Para empezar, mirá [qué hacer en Búzios](/guias/que-hacer-en-buzios).',
        ],
        foto: '/fotos/buzios/orla-bardot-flores.jpg',
        posicaoFoto: '50% 62%',
        passeios: ['escuna-buzios', 'buggy-buzios', 'lancha-buzios', 'helicoptero-buzios'],
      },
      {
        id: 'elegi-arraial',
        titulo: 'Elegí Arraial do Cabo si…',
        paragrafos: [
          'Lo que más te importa es el mar: agua turquesa, paseos en barco y buceo. Es un destino más tranquilo y con menos estructura, ideal si no te molesta caminar un sendero o bajar una escalera para llegar a la playa.',
          'Mirá [qué hacer en Arraial do Cabo](/guias/que-hacer-en-arraial-do-cabo) para armar tus días.',
        ],
        foto: '/fotos/arraial/barco-arco-de-pedra.jpg',
        posicaoFoto: '50% 30%',
        passeios: ['barco-arraial-do-cabo', 'mergulho-arraial-do-cabo', 'lancha-privativa-arraial-do-cabo', 'buggy-arraial-do-cabo'],
      },
      {
        id: 'las-dos',
        titulo: 'Cómo conocer las dos en un mismo viaje',
        paragrafos: [
          'Están a unos 40 km, de 1 hora a 1h20 en auto, así que no hace falta elegir. Si te alojás en Búzios, el [full day en Arraial](/passeios/full-day-arraial-do-cabo) te busca en el hotel y suma miradores y paseo en barco.',
          'Si te alojás en Arraial o Cabo Frio, el [full day en Búzios](/passeios/full-day-buzios) junta goleta, miradores y tiempo libre en la Rua das Pedras.',
        ],
        passeios: ['full-day-arraial-do-cabo', 'full-day-buzios'],
      },
      {
        id: 'como-llegar',
        titulo: 'Cómo llegar a cada una',
        paragrafos: [
          'A las dos se llega por tierra desde Río de Janeiro, o volando a Cabo Frio. Las guías comparan el traslado, el bus y el auto [hasta Búzios](/guias/como-ir-de-rio-a-buzios) y [hasta Arraial do Cabo](/guias/como-llegar-a-arraial-do-cabo).',
          'Con el [traslado privado](/transfer?destino=buzios), el chofer te espera en el aeropuerto y te deja en tu alojamiento, solo con tu grupo.',
        ],
        transfer: 'buzios',
      },
    ],
    perguntas: [
      {
        p: '¿Qué es mejor, Búzios o Arraial do Cabo?',
        r: 'Depende del viaje. Búzios tiene más playas, restaurantes y vida nocturna. Arraial do Cabo tiene el mar más turquesa y es la capital del buceo, con una estructura más simple.',
      },
      {
        p: '¿Cuál tiene el agua más linda?',
        r: 'Arraial do Cabo: el agua es más azul y turquesa, aunque también más fría. En Búzios es más verde y cambia de una playa a otra.',
      },
      {
        p: '¿Cuál conviene para ir con chicos?',
        r: 'Búzios suele ser más fácil, con más playas de mar calmo y acceso simple, como Ferradura. En Arraial, varias playas tienen escaleras o senderos y las más lindas se visitan en barco.',
      },
      {
        p: '¿Dónde conviene alojarse para conocer las dos?',
        r: 'En Búzios hay más opciones de alojamiento y restaurantes, y el full day a Arraial do Cabo te busca en el hotel. También podés hacerlo al revés: alojarte en Arraial y conocer Búzios en un día.',
      },
      {
        p: '¿Qué distancia hay entre Búzios y Arraial do Cabo?',
        r: 'Unos 40 km, de 1 hora a 1h20 en auto.',
      },
    ],
    fechamento: {
      titulo: 'Conocé las dos en un mismo viaje',
      texto: 'Elegí tu base y sumá un full day a la otra, con búsqueda en el hotel. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver todos los paseos',
      caminho: '/passeios',
      foto: '/fotos/buzios/por-do-sol-barcos-na-baia.jpg',
      posicaoFoto: '50% 60%',
    },
    relacionados: ['que-hacer-en-buzios', 'que-hacer-en-arraial-do-cabo', 'excursion-arraial-do-cabo-desde-buzios'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'que-hacer-en-cabo-frio',
    titulo: 'Qué hacer en Cabo Frio: playas y paseos',
    descricao:
      'Guía de Cabo Frio: Praia do Forte, Isla do Japonês, Fuerte São Mateus, los médanos del Peró, la Calle de los Bikinis y cómo conocerla en un día.',
    chamada: 'Playas, la Isla do Japonês y la Calle de los Bikinis',
    h1: 'Qué hacer en Cabo Frio',
    foto: '/fotos/cabo-frio/praia-do-forte-agua-azul.jpg',
    posicaoFoto: '50% 30%',
    resumo:
      'Cabo Frio queda entre Búzios y Arraial do Cabo, a unos 150 km de Río de Janeiro. Tiene playas de arena blanca, una isla de agua baja y calma, un fuerte del siglo XVII y una calle famosa por la moda de playa.',
    ficha: [
      { rotulo: 'Desde Río', valor: 'Unos 150 km' },
      { rotulo: 'Desde Búzios', valor: '25 a 30 km' },
      { rotulo: 'Aeropuerto', valor: 'Sí, propio' },
      { rotulo: 'Para verla bien', valor: '1 a 2 días' },
    ],
    secoes: [
      {
        id: 'playas',
        titulo: 'Las playas de Cabo Frio',
        paragrafos: ['Agua clara y arena blanca, con opciones tanto para familias como para caminar por la costa. Estas son las más conocidas:'],
        foto: '/fotos/cabo-frio/praia-do-forte-forte-sao-mateus.jpg',
        posicaoFoto: '50% 55%',
        detalhes: [
          { nome: 'Praia do Forte', texto: 'La más conocida de la ciudad, de arena blanca, con el Fuerte São Mateus en un extremo.' },
          { nome: 'Isla do Japonês', texto: 'Agua baja y calma, muy buena para ir con chicos. Los paseos en barco paran ahí.' },
          { nome: 'Peró', texto: 'Una playa extensa, junto a los médanos de arena blanca.' },
          { nome: 'Conchas', texto: 'Al lado del Peró, con un sendero de menos de 20 minutos hasta un mirador.' },
        ],
      },
      {
        id: 'barco',
        titulo: 'En barco hasta la Isla do Japonês',
        paragrafos: [
          'Los paseos salen del Canal do Itajuru, pasan por el Fuerte São Mateus y la Praia do Forte y paran en la Isla do Japonês. El [catamarán](/passeios/catamara-cabo-frio) dura 2h30 y es un paseo tranquilo, ideal para familias.',
          'La [goleta con traslado](/passeios/escuna-cabo-frio) te busca en tu hotel en Cabo Frio. Para ir solo con tu grupo está la [lancha privada](/passeios/lancha-privativa-cabo-frio), para hasta 10 personas.',
        ],
        foto: '/fotos/cabo-frio/ilha-do-japones-do-alto.jpg',
        posicaoFoto: '50% 40%',
        passeios: ['catamara-cabo-frio', 'escuna-cabo-frio', 'lancha-privativa-cabo-frio'],
      },
      {
        id: 'historia',
        titulo: 'El Fuerte São Mateus y el Canal do Itajuru',
        paragrafos: [
          'El Fuerte São Mateus se construyó entre 1616 y 1620 y queda en un extremo de la Praia do Forte. Desde arriba hay una vista amplia del mar.',
          'Cabo Frio es una de las ciudades más antiguas de Brasil. A orillas del Canal do Itajuru, de donde salen los barcos, se puede caminar y ver el atardecer.',
        ],
        foto: '/fotos/cabo-frio/guarita-forte-sao-mateus.jpg',
        posicaoFoto: '50% 60%',
      },
      {
        id: 'compras',
        titulo: 'La Calle de los Bikinis',
        paragrafos: [
          'La Rua dos Biquínis, en el barrio Gamboa, reúne más de 150 negocios de moda de playa. El [city tour](/passeios/city-tour-cabo-frio) y el [full day](/passeios/full-day-cabo-frio) tienen tiempo libre para las compras.',
        ],
      },
      {
        id: 'medanos',
        titulo: 'Médanos y playas en buggy o cuatriciclo',
        paragrafos: [
          'Los Médanos do Peró son uno de los paisajes más abiertos de Cabo Frio. El [buggy](/passeios/buggy-cabo-frio) pasa por los médanos y por las playas do Peró y das Conchas, y el [cuatriciclo](/passeios/quadriciclo-cabo-frio) sale en caravana con un guía. Quien maneja necesita licencia de conducir.',
        ],
        passeios: ['buggy-cabo-frio', 'quadriciclo-cabo-frio'],
      },
      {
        id: 'un-dia',
        titulo: 'Cabo Frio en un día',
        paragrafos: [
          'Si te alojás en Búzios o Arraial do Cabo, el [full day](/passeios/full-day-cabo-frio) junta todo en unas 9 horas: barco a la Isla do Japonês, Fuerte São Mateus, Praia do Forte, Médanos do Peró y la Calle de los Bikinis, con búsqueda en el hotel.',
          'Si preferís quedarte en tierra, el [city tour](/passeios/city-tour-cabo-frio) recorre esos puntos en unas 7 horas.',
        ],
        passeios: ['full-day-cabo-frio', 'city-tour-cabo-frio'],
      },
      {
        id: 'como-llegar',
        titulo: 'Cómo llegar a Cabo Frio',
        paragrafos: [
          'Cabo Frio está a unos 150 km de Río de Janeiro y tiene aeropuerto, con pocos vuelos y varios solo de temporada. Por tierra, se cruza el puente Río-Niterói y se sigue por la Via Lagos, igual que para ir a Búzios o Arraial.',
          'Con el [traslado privado](/transfer?destino=cabo-frio), el chofer te espera en el aeropuerto y te deja en tu alojamiento, solo con tu grupo.',
        ],
        transfer: 'cabo-frio',
      },
    ],
    perguntas: [
      {
        p: '¿Qué hacer en Cabo Frio en un día?',
        r: 'Un paseo en barco hasta la Isla do Japonês, el Fuerte São Mateus, la Praia do Forte y la Calle de los Bikinis. El full day junta todo eso, con búsqueda en el hotel si te alojás en Búzios o Arraial do Cabo.',
      },
      {
        p: '¿Cómo se llega a la Isla do Japonês?',
        r: 'Los paseos en catamarán y en goleta salen del Canal do Itajuru y paran en la isla, con tiempo para nadar.',
      },
      {
        p: '¿Cabo Frio tiene aeropuerto?',
        r: 'Sí. Es el aeropuerto comercial más cercano a Búzios y a Arraial do Cabo, con pocos vuelos y varios solo de temporada.',
      },
      {
        p: '¿Qué es la Calle de los Bikinis?',
        r: 'Es la Rua dos Biquínis, en el barrio Gamboa: una calle con más de 150 negocios de moda de playa.',
      },
      {
        p: '¿A qué distancia está Cabo Frio de Búzios y de Río?',
        r: 'Está a unos 150 km de Río de Janeiro y a entre 25 y 30 km de Búzios.',
      },
    ],
    fechamento: {
      titulo: 'Dejá tu día en Cabo Frio resuelto',
      texto: 'Elegí la fecha y el grupo, mirá el precio final y reservá desde casa. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver los paseos en Cabo Frio',
      caminho: '/passeios?cidade=cabo-frio',
      foto: '/fotos/cabo-frio/orla-entardecer.jpg',
      posicaoFoto: '50% 62%',
    },
    relacionados: ['que-hacer-en-buzios', 'que-hacer-en-arraial-do-cabo', 'como-llegar-a-buzios-desde-argentina-y-chile'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'buceo-en-arraial-do-cabo',
    titulo: 'Buceo en Arraial do Cabo: bautismo y salidas',
    descricao:
      'Buceo en Arraial do Cabo: cómo es el bautismo sin experiencia, las salidas para certificados, la temperatura del agua y la mejor época para bucear.',
    chamada: 'Bautismo sin experiencia y salidas para certificados',
    h1: 'Buceo en Arraial do Cabo',
    foto: '/fotos/arraial/mergulho.jpg',
    posicaoFoto: '50% 50%',
    resumo:
      'A Arraial do Cabo la llaman la capital del buceo. Podés probar con un bautismo, sin experiencia y con un instructor a tu lado, o hacer dos inmersiones guiadas si ya tenés certificación.',
    ficha: [
      { rotulo: 'Bautismo', valor: 'Sin experiencia' },
      { rotulo: 'Edad mínima', valor: '10 años' },
      { rotulo: 'Duración', valor: 'Unas 4 horas' },
      { rotulo: 'Agua', valor: '14 a 24 °C' },
    ],
    secoes: [
      {
        id: 'por-que',
        titulo: 'Por qué se bucea tan bien en Arraial',
        paragrafos: [
          'Frente a la costa ocurre la surgencia: agua fría y llena de nutrientes sube desde el fondo y alimenta una vida marina muy rica.',
          'Bajo el agua se ven cardúmenes, tortugas, morenas y formaciones rocosas y, con suerte, caballitos de mar. Lo que aparece cambia cada día.',
        ],
        foto: '/fotos/arraial/mergulho-tartaruga-de-perto.jpg',
        posicaoFoto: '50% 55%',
      },
      {
        id: 'bautismo',
        titulo: 'Bautismo: tu primera inmersión',
        paragrafos: [
          'El [bautismo de buceo](/passeios/mergulho-arraial-do-cabo) es para quien nunca buceó. No hace falta experiencia y la edad mínima es de 10 años. Son unas 4 horas en total:',
        ],
        foto: '/fotos/arraial/mergulho-com-instrutor.jpg',
        posicaoFoto: '40% 50%',
        detalhes: [
          { nome: 'Clase', texto: 'Antes de entrar al agua aprendés cómo respirar y las señales para comunicarte.' },
          { nome: 'Equipo', texto: 'El equipo completo está incluido y se ajusta antes de salir.' },
          { nome: 'Salida en barco', texto: 'El barco te lleva hasta el punto de buceo.' },
          { nome: 'Buceo', texto: 'El instructor va a tu lado todo el tiempo.' },
        ],
      },
      {
        id: 'certificados',
        titulo: 'Salidas para buzos certificados',
        paragrafos: [
          'Si tenés certificación Open Water o equivalente, la [salida para certificados](/passeios/mergulho-credenciado-arraial-do-cabo) incluye dos inmersiones guiadas en los puntos más conocidos de Arraial, con un intervalo de superficie entre una y otra.',
          'El equipo completo está incluido: traje, chaleco, regulador, tanques y lastre. Llevá tu credencial de buceo, porque se controla antes de salir.',
        ],
        passeios: ['mergulho-arraial-do-cabo', 'mergulho-credenciado-arraial-do-cabo'],
      },
      {
        id: 'agua',
        titulo: 'Temperatura del agua y mejor época',
        paragrafos: [
          'El agua de Arraial es fría: varía de unos 14 a 24 °C según el día, así que se bucea con traje de neoprene todo el año. En los días buenos, la visibilidad llega a unos 20 metros.',
          'Muchos buzos recomiendan los meses de abril a octubre, pero las fuentes no coinciden y el mar cambia de un día para otro.',
        ],
        foto: '/fotos/arraial/mergulho-dupla-no-fundo.jpg',
        posicaoFoto: '50% 60%',
      },
      {
        id: 'antes',
        titulo: 'Antes y después de bucear',
        paragrafos: ['Tres cosas para tener en cuenta al organizar el día:'],
        detalhes: [
          { nome: 'Qué llevar', texto: 'Traje de baño, toalla, protector solar, algo liviano para comer y un documento con foto. Si sos certificado, tu credencial.' },
          { nome: 'Comida', texto: 'Evitá las comidas pesadas antes de entrar al agua.' },
          { nome: 'Vuelo de regreso', texto: 'Esperá al menos 24 horas para viajar en avión: dejá el buceo para el principio del viaje, no para el último día.' },
        ],
      },
      {
        id: 'como-llegar',
        titulo: 'Cómo llegar a la salida',
        paragrafos: [
          'Las salidas son en Arraial do Cabo y el traslado hasta el embarque no está incluido. La guía de [cómo llegar a Arraial do Cabo](/guias/como-llegar-a-arraial-do-cabo) compara todas las opciones.',
          'Con el [traslado privado](/transfer?destino=arraial-do-cabo), el chofer te espera en el aeropuerto y te deja en tu alojamiento, solo con tu grupo.',
        ],
        transfer: 'arraial-do-cabo',
      },
    ],
    perguntas: [
      {
        p: '¿Se puede bucear en Arraial do Cabo sin experiencia?',
        r: 'Sí. El bautismo es para quien nunca buceó: recibís una clase sobre respiración y señales, y un instructor va a tu lado todo el tiempo.',
      },
      {
        p: '¿Desde qué edad se puede bucear?',
        r: 'Desde los 10 años, tanto en el bautismo como en las salidas para certificados.',
      },
      {
        p: '¿Qué certificación hace falta para las salidas?',
        r: 'Open Water o equivalente. Llevá tu credencial de buceo.',
      },
      {
        p: '¿Cuánto tengo que esperar para volar después de bucear?',
        r: 'Al menos 24 horas. Por eso conviene bucear al principio del viaje.',
      },
      {
        p: '¿Se ven tortugas en Arraial do Cabo?',
        r: 'Son parte de la vida marina de la zona, junto con cardúmenes y morenas. Como en todo buceo, lo que se ve cambia cada día.',
      },
    ],
    fechamento: {
      titulo: 'Reservá tu primera inmersión',
      texto: 'Elegí la fecha, mirá el precio final y reservá desde casa. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver el bautismo de buceo',
      caminho: '/passeios/mergulho-arraial-do-cabo',
      foto: '/fotos/arraial/mergulho-nadando.jpg',
      posicaoFoto: '50% 50%',
    },
    relacionados: ['que-hacer-en-arraial-do-cabo', 'paseo-en-barco-arraial-do-cabo', 'como-llegar-a-arraial-do-cabo'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'como-llegar-a-buzios-desde-argentina-y-chile',
    titulo: 'Cómo llegar a Búzios desde Argentina y Chile',
    descricao:
      'Cómo llegar a Búzios desde Buenos Aires, Córdoba y Santiago: vuelos a Río o Cabo Frio, cuánto se tarda, qué documento llevar y cómo seguir por tierra.',
    chamada: 'Vuelos a Río o Cabo Frio, documentos y último tramo',
    h1: 'Cómo llegar a Búzios desde Argentina y Chile',
    foto: '/fotos/buzios/helicoptero-vista-da-peninsula.jpg',
    posicaoFoto: '50% 58%',
    resumo:
      'Búzios no tiene vuelos comerciales regulares, así que hay dos caminos: volar a Río de Janeiro y seguir unos 170 km por tierra, o volar a Cabo Frio, a unos 30 km, en los vuelos de temporada que salen de Argentina.',
    ficha: [
      { rotulo: 'Buenos Aires a Río', valor: 'Unas 3 horas' },
      { rotulo: 'Santiago a Río', valor: 'Unas 4h10' },
      { rotulo: 'Río a Búzios', valor: '2h30 a 3h30' },
      { rotulo: 'Cabo Frio a Búzios', valor: 'Unos 30 min' },
    ],
    secoes: [
      {
        id: 'desde-argentina',
        titulo: 'Desde Argentina',
        paragrafos: [
          'Hay vuelos directos de Buenos Aires a Río de Janeiro, de unas 3 horas. Desde otras ciudades, según la fecha, puede haber vuelo directo o con conexión.',
          'En temporada también se puede volar directo a Cabo Frio. Aerolíneas Argentinas opera la ruta desde Buenos Aires, y para el verano de 2027 anunció vuelos desde Córdoba, dos veces por semana a partir del 26 de diciembre. Las fechas cambian cada temporada: confirmalas con la aerolínea antes de organizar el resto del viaje.',
        ],
      },
      {
        id: 'desde-chile',
        titulo: 'Desde Chile',
        paragrafos: [
          'Desde Santiago hay vuelos directos a Río de Janeiro, de unas 4 horas y 10 minutos, con aerolíneas como LATAM y Sky. Desde Río se sigue por tierra hasta Búzios.',
        ],
      },
      {
        id: 'rio-o-cabo-frio',
        titulo: 'Río o Cabo Frio: a dónde volar',
        paragrafos: ['Los dos caminos funcionan. Esto es lo que cambia:'],
        foto: '/fotos/rio/cristo-e-pao-de-acucar-do-ceu.jpg',
        posicaoFoto: '50% 30%',
        detalhes: [
          { nome: 'Río de Janeiro', texto: 'Más vuelos y horarios, y la posibilidad de sumar unos días en la ciudad. Después quedan unas 3 horas de ruta.' },
          { nome: 'Cabo Frio', texto: 'El aeropuerto más cercano, a unos 30 km de Búzios. Tiene pocos vuelos, y los que salen de Argentina son de temporada.' },
        ],
      },
      {
        id: 'ultimo-tramo',
        titulo: 'El último tramo hasta tu alojamiento',
        paragrafos: [
          'Desde cualquiera de los aeropuertos, el [traslado privado](/transfer?destino=buzios) te espera en arribos con un cartel con tu nombre y te deja en tu hotel o posada. Con el número de vuelo, el chofer sigue tu llegada.',
          'Si preferís otra opción, la guía de [cómo ir de Río a Búzios](/guias/como-ir-de-rio-a-buzios) compara el traslado, el bus y el auto.',
        ],
        transfer: 'buzios',
      },
      {
        id: 'documentos',
        titulo: 'Qué documento llevar',
        paragrafos: [
          'Para entrar a Brasil como turistas, los argentinos pueden viajar con el DNI vigente y los chilenos con la cédula de identidad vigente, o con el pasaporte vigente. Tiene que ser el documento físico y estar en buen estado.',
          'Si viajan menores, pueden pedirse papeles adicionales. Los requisitos pueden cambiar: confirmalos en los canales oficiales de tu país y con la aerolínea antes de viajar.',
        ],
      },
      {
        id: 'en-buzios',
        titulo: 'Ya en Búzios: qué reservar',
        paragrafos: [
          'Con el viaje armado, podés dejar resueltos los paseos desde casa. La guía de [qué hacer en Búzios](/guias/que-hacer-en-buzios) tiene un plan para tres días, y la de la [mejor época](/guias/mejor-epoca-para-ir-a-buzios) te ayuda a elegir las fechas.',
        ],
        passeios: ['escuna-buzios', 'buggy-buzios', 'full-day-arraial-do-cabo', 'city-tour-rio-de-janeiro'],
      },
    ],
    perguntas: [
      {
        p: '¿Hay vuelos directos de Buenos Aires a Búzios?',
        r: 'No, porque Búzios no tiene vuelos comerciales regulares. Lo más cerca que podés llegar en avión es Cabo Frio, a unos 30 km, con vuelos de temporada desde Argentina.',
      },
      {
        p: '¿Cuál es el aeropuerto más cercano a Búzios?',
        r: 'El de Cabo Frio (CFB), a unos 30 km. Si vas por Río de Janeiro, Galeão y Santos Dumont quedan a unas 3 horas por ruta.',
      },
      {
        p: '¿Cuánto se tarda de Buenos Aires a Búzios?',
        r: 'El vuelo a Río tarda unas 3 horas, y después quedan unas 3 horas por ruta. A eso sumale los tiempos de aeropuerto y migraciones.',
      },
      {
        p: '¿Necesito pasaporte para ir a Búzios?',
        r: 'No es obligatorio para turistas argentinos y chilenos: alcanza con el DNI o la cédula de identidad vigentes, en buen estado. Confirmá los requisitos en los canales oficiales antes de viajar.',
      },
      {
        p: '¿Conviene llegar por Río o por Cabo Frio?',
        r: 'Por Cabo Frio el último tramo es mucho más corto, pero hay pocos vuelos. Por Río hay más horarios y podés sumar unos días en la ciudad.',
      },
    ],
    fechamento: {
      titulo: 'Dejá el último tramo resuelto',
      texto: 'Elegí el aeropuerto, la fecha y el vehículo, y mirá el precio final. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver el precio del traslado',
      caminho: '/transfer?destino=buzios',
      foto: '/fotos/buzios/escuna-no-mar.jpg',
      posicaoFoto: '66% 50%',
    },
    relacionados: ['como-ir-de-rio-a-buzios', 'que-hacer-en-buzios', 'mejor-epoca-para-ir-a-buzios'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
  {
    slug: 'mejor-epoca-para-ir-a-buzios',
    titulo: 'Mejor época para ir a Búzios: clima por mes',
    descricao:
      'Cuál es la mejor época para ir a Búzios: el clima mes a mes, cuándo llueve más, cuándo hay menos gente y qué esperar en temporada alta.',
    chamada: 'El clima mes a mes y cuándo hay menos gente',
    h1: 'La mejor época para ir a Búzios',
    foto: '/fotos/buzios/escuna-ancorada.jpg',
    posicaoFoto: '50% 66%',
    resumo:
      'Búzios se puede visitar todo el año: las temperaturas promedio van de 19 a 28 °C. Para calor y playa, de diciembre a marzo. Para menos lluvia y menos gente, de abril a agosto, con abril y mayo entre los meses más recomendados.',
    ficha: [
      { rotulo: 'Temperatura', valor: '19 a 28 °C' },
      { rotulo: 'Más calor', valor: 'Dic a mar' },
      { rotulo: 'Más lluvia', valor: 'Nov y dic' },
      { rotulo: 'Menos lluvia', valor: 'Jun a ago' },
    ],
    secoes: [
      {
        id: 'estaciones',
        titulo: 'Cómo es cada estación',
        paragrafos: ['Cada época tiene lo suyo. Esto es lo que podés esperar:'],
        detalhes: [
          { nome: 'Verano: diciembre a marzo', texto: 'Los días más calurosos, con promedios de hasta 28 °C. También llueve más. Es la temporada alta, con más gente y movimiento.' },
          { nome: 'Otoño: abril y mayo', texto: 'Sigue haciendo calor, llueve menos y baja la cantidad de gente. Son de los meses más recomendados.' },
          { nome: 'Invierno: junio a agosto', texto: 'La época más seca, con promedios de 19 a 24 °C. Hace fresco para bañarse, pero es buena para miradores y paseos por tierra.' },
          { nome: 'Primavera: septiembre a noviembre', texto: 'Vuelve el calor poco a poco, y las lluvias aumentan hasta noviembre.' },
        ],
      },
      {
        id: 'mes-a-mes',
        titulo: 'Temperatura y lluvia, mes a mes',
        paragrafos: [
          'Estos son los promedios históricos de Climatempo para Búzios. Los números cambian un poco según la fuente, pero el patrón se repite: más calor y lluvia en verano, más fresco y seco en invierno.',
        ],
        foto: '/fotos/buzios/passagem-para-a-praia.jpg',
        posicaoFoto: '50% 62%',
        tabela: {
          legenda: 'Temperatura y lluvia promedio en Búzios, mes a mes',
          colunas: ['Mes', 'Temperatura', 'Lluvia'],
          compacta: true,
          linhas: [
            ['Enero', '24 a 27 °C', '130 mm'],
            ['Febrero', '24 a 28 °C', '82 mm'],
            ['Marzo', '24 a 27 °C', '127 mm'],
            ['Abril', '23 a 26 °C', '71 mm'],
            ['Mayo', '21 a 24 °C', '62 mm'],
            ['Junio', '20 a 24 °C', '37 mm'],
            ['Julio', '19 a 23 °C', '38 mm'],
            ['Agosto', '19 a 24 °C', '35 mm'],
            ['Septiembre', '20 a 24 °C', '59 mm'],
            ['Octubre', '21 a 25 °C', '81 mm'],
            ['Noviembre', '22 a 25 °C', '142 mm'],
            ['Diciembre', '23 a 27 °C', '147 mm'],
          ],
        },
      },
      {
        id: 'temporada',
        titulo: 'Temporada alta y baja',
        paragrafos: [
          'La temporada alta coincide con las vacaciones escolares, Año Nuevo y Carnaval: hay más movimiento, las playas se llenan y conviene reservar alojamiento y paseos con anticipación.',
          'Fuera de esas fechas hay menos gente. Agosto es uno de los meses con menos ocupación.',
        ],
      },
      {
        id: 'si-llueve',
        titulo: 'Qué hacer según el clima',
        paragrafos: [
          'Con sol, lo mejor es arrancar por el mar: la [goleta](/passeios/escuna-buzios) o el [catamarán](/passeios/catamara-buzios). En los días más frescos, el [buggy](/passeios/buggy-buzios) y el [city tour](/passeios/city-tour-buzios) muestran las playas y los miradores por tierra.',
          'Si tu paseo se cancela por lluvia, mal tiempo o condiciones del mar, elegís entre reembolso total o una nueva fecha, sin costo. Y si cambiás de planes, podés cancelar gratis hasta 24 horas antes.',
        ],
        passeios: ['escuna-buzios', 'catamara-buzios', 'buggy-buzios', 'city-tour-buzios'],
      },
      {
        id: 'como-llegar',
        titulo: 'Cómo llegar a Búzios',
        paragrafos: [
          'Lo habitual es volar a Río de Janeiro y seguir unos 170 km por tierra. En temporada también hay vuelos a Cabo Frio: la guía de [cómo llegar desde Argentina y Chile](/guias/como-llegar-a-buzios-desde-argentina-y-chile) cuenta qué vuelos hay.',
          'Con el [traslado privado](/transfer?destino=buzios), el chofer te espera en el aeropuerto y te deja en tu alojamiento, solo con tu grupo.',
        ],
        transfer: 'buzios',
      },
    ],
    perguntas: [
      {
        p: '¿Cuál es el mejor mes para ir a Búzios?',
        r: 'Para playa y calor, enero, febrero y marzo. Para buen clima con menos gente, abril y mayo.',
      },
      {
        p: '¿Cuándo llueve más en Búzios?',
        r: 'De noviembre a marzo, con noviembre y diciembre como los meses más lluviosos. De junio a agosto llueve mucho menos.',
      },
      {
        p: '¿Hace frío en Búzios en invierno?',
        r: 'Hace fresco, no frío: los promedios van de 19 a 24 °C. Es la época más seca del año.',
      },
      {
        p: '¿Cuándo hay menos gente en Búzios?',
        r: 'Fuera de las vacaciones escolares, Año Nuevo y Carnaval. Agosto es uno de los meses con menos ocupación.',
      },
      {
        p: '¿Qué pasa con el paseo si llueve?',
        r: 'Si se cancela por lluvia, mal tiempo o condiciones del mar, elegís entre reembolso total o una nueva fecha, sin costo.',
      },
    ],
    fechamento: {
      titulo: 'Elegí tu fecha y reservá desde casa',
      texto: 'Mirá el precio final de cada paseo. Podés cancelar gratis hasta 24 horas antes.',
      botao: 'Ver los paseos en Búzios',
      caminho: '/passeios?cidade=buzios',
      foto: '/fotos/buzios/lancha-joao-fernandes.jpg',
      posicaoFoto: '50% 45%',
    },
    relacionados: ['que-hacer-en-buzios', 'mejores-playas-de-buzios', 'como-llegar-a-buzios-desde-argentina-y-chile'],
    publicado: '2026-11-06',
    atualizado: '2026-11-06',
  },
];

/** Os grupos da página /es/guias, pelo slug. */
export const GRUPOS_GUIAS: { id: string; titulo: string; guias: string[] }[] = [
  {
    id: 'que-hacer',
    titulo: 'Qué hacer en cada destino',
    guias: ['que-hacer-en-buzios', 'mejores-playas-de-buzios', 'que-hacer-en-arraial-do-cabo', 'que-hacer-en-cabo-frio'],
  },
  {
    id: 'arraial',
    titulo: 'Paseos en Arraial do Cabo',
    guias: ['paseo-en-barco-arraial-do-cabo', 'excursion-arraial-do-cabo-desde-buzios', 'buceo-en-arraial-do-cabo'],
  },
  {
    id: 'como-llegar',
    titulo: 'Cómo llegar',
    guias: ['como-ir-de-rio-a-buzios', 'como-llegar-a-arraial-do-cabo', 'como-llegar-a-buzios-desde-argentina-y-chile'],
  },
  {
    id: 'decidir',
    titulo: 'Para decidir tu viaje',
    guias: ['buzios-o-arraial-do-cabo', 'mejor-epoca-para-ir-a-buzios'],
  },
];

export const obterGuia = (slug: string) => GUIAS.find((g) => g.slug === slug);
