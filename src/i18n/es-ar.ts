import type { Dicionario } from './pt';

/**
 * Cada chave opcional, em qualquer profundidade. Uma lista (array) entra INTEIRA: ela substitui a do espanhol,
 * não se mescla item a item, para a quantidade de itens ficar sempre igual nas duas versões.
 */
export type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** Só as frases do dicionário que mudam do espanhol neutro ('es', com "tú") para o da Argentina (com "vos"). */
export type AjustesAR = DeepPartial<Dicionario>;

/**
 * O espanhol da Argentina (/es-ar): o texto que o site tinha antes do espanhol neutro, palavra por palavra, só nas
 * frases que diferem de src/i18n/es.ts. O que muda é o "vos" (Reservá, Elegí, podés, tenés, "con vos"), o imperativo
 * com pronome sem acento (escribinos, mostralo, avisanos) e as palavras locais: valijas (maletas), chicos (niños),
 * arribos (llegadas), médanos (dunas), cuatriciclo (cuatrimoto), acá (aquí) e seña (anticipo).
 * Uma lista (array) entra inteira mesmo quando só um item muda. Tudo que não estiver aqui vem igual de
 * src/i18n/es.ts (src/i18n/index.ts mescla os dois na carga). Ao mudar uma frase do es.ts que também está aqui,
 * confira se a versão argentina precisa mudar junto.
 */
export const ajustesAR: AjustesAR = {
  meta: {
    descricao:
      'Paseos en barco, buggy, cuatriciclo y city tour en Búzios, Cabo Frio y Arraial do Cabo. Reservá online, pagá con Pix o tarjeta y cancelá gratis hasta 24 h antes.',
    passeiosDescricao:
      '{n} paseos en barco, buggy, cuatriciclo y buceo en Búzios, Arraial do Cabo, Cabo Frio y Río. Compará los precios, reservá online y cancelá gratis hasta 24 h antes.',
    contatoDescricao:
      'Hablá con Orla Nativa: atención 100% online, en español, portugués e inglés, para paseos, traslados y reservas en Búzios y la Región de los Lagos.',
    chamadaPasseio: 'Reservá online y cancelá gratis hasta 24 h antes.',
  },
  grupo: {
    escolhaData: 'Elegí la fecha',
  },
  preco: {
    notaCambio: 'Pagás en reales. El ≈ US$ es aproximado: cotización del Banco Central de Brasil del {data}.',
  },
  carrinho: {
    semCobranca: 'Todavía no te cobramos nada: revisás todo antes de pagar.',
    escolhaHorario: 'Elegí el horario',
    erroAdicionar: 'No se pudo agregar. Revisá la fecha y el horario e intentá de nuevo.',
    mudou: 'Un ítem del carrito cambió o ya no está disponible. Revisá el pedido y envialo de nuevo.',
  },
  cotacao: {
    erro: 'No se pudo enviar ahora. Intentá de nuevo en unos minutos.',
  },
  pedido: {
    registradoTexto:
      'Tu pedido quedó registrado. Completá el pago con nuestro equipo por WhatsApp; cada ítem recibe su voucher apenas se confirma el pago.',
    confirmadoTexto: 'Tus vouchers están listos, uno para cada ítem. El día del paseo, solo mostralos en el celular.',
    canceladoTexto: 'Este pedido fue cancelado. Si tenés dudas, escribinos.',
    // Etapa 4 (pagamento pela Stripe): só as frases com verbo em vos
    semPrazo: 'Este pedido ya no se puede pagar en el sitio. Escribinos por e-mail.',
    recusadoPix: '¿Tarjeta rechazada? Pagá con Pix y recibí {p}% de descuento',
    dicaInternacional:
      'Si tu tarjeta es de fuera de Brasil, revisá en la app de tu banco que las compras internacionales estén habilitadas.',
    tentarOutroCartao: 'Probá con otra tarjeta.',
    contestadoTexto:
      'Este pago está en disputa con el banco. Mientras el banco lo revisa, el voucher queda suspendido. Si tenés dudas, escribinos.',
    reembolsadoTexto: 'El valor se devolvió por el mismo medio de pago. Si tenés dudas, escribinos.',
  },
  boletim: {
    escolha: 'Tocá un paseo para ver el total y reservar.',
  },
  home: {
    gancho: 'Llegá y disfrutá. Del resto nos ocupamos nosotros.',
    vitrineTexto: 'Elegí la fecha y quiénes van: debajo de cada precio aparece el total de tu grupo.',
    mapaTexto: 'Búzios, Arraial do Cabo y Cabo Frio están a menos de una hora entre sí: podés alojarte en una y pasear por las tres.',
    mapaToque: 'Tocá una ciudad para ver sus paseos.',
    mapaCidades: {
      'cabo-frio': 'Canal do Itajuru, Isla do Japonês, Fuerte São Mateus y los médanos do Peró.',
    },
    precosTexto: '{n} paseos. Decinos la fecha y quiénes van: cada valor se vuelve el total de tu grupo.',
    destinosTitulo: 'Elegí la ciudad',
    destinosTexto: 'Búzios, Arraial do Cabo y Cabo Frio están cerca una de otra: te alojás en una y paseás por las tres.',
    etapas: ['Elegí el paseo y la fecha.', 'Pagá con Pix o tarjeta.', 'Embarcá con el voucher en el celular.'],
    tutorial: [
      {
        titulo: 'Elegí el paseo y la fecha.',
        texto: 'El precio final aparece al instante, con la regla para niños de cada paseo.',
      },
      {
        titulo: 'Elegí el horario.',
        texto: 'Ves los horarios de salida del paseo y elegís el tuyo.',
      },
      {
        titulo: 'Pagá con Pix o tarjeta.',
        texto: 'Siempre el valor total, sin cargos escondidos.',
      },
      {
        titulo: 'Embarcá con el voucher en el celular.',
        texto: 'El voucher ya viene con el horario, tiene número único y PDF.',
      },
    ],
    // só a primeira muda ("vos elegís"); cada lista entra inteira (a de hoje e a do pagamento online)
    garantiasCurtas: [
      { titulo: 'Paseo cancelado por lluvia, viento o mar', texto: 'Reembolso total o nueva fecha, vos elegís.' },
      { titulo: 'Cancelación gratis', texto: 'Hasta 24 horas antes del paseo.' },
      { titulo: 'Voucher con número único', texto: 'En el celular y en PDF.' },
      { titulo: 'Pix con {p}% de descuento', texto: 'Sobre el precio con tarjeta.' },
    ],
    garantiasCurtasOnline: [
      { titulo: 'Paseo cancelado por lluvia, viento o mar', texto: 'Reembolso total o nueva fecha, vos elegís.' },
      { titulo: 'Cancelación gratis', texto: 'Hasta 24 horas antes del paseo.' },
      { titulo: 'Voucher al instante', texto: 'Con número único, en el celular y en PDF.' },
      { titulo: 'Pago seguro', texto: 'Pix con {p}% de descuento o tarjeta, procesados por Stripe.' },
    ],
    garantiasColunas: ['Si', 'Recibís', 'Plazo'],
    garantias: [
      {
        se: 'El paseo se cancela por lluvia, viento o mar',
        recebe: 'Reembolso total o nueva fecha, vos elegís',
        prazo: 'Sin costo',
      },
      {
        se: 'Cancelás con 24 horas o más',
        recebe: 'Reembolso total',
        prazo: 'Hasta 24 h antes',
      },
      {
        se: 'Te arrepentís de la compra',
        recebe: 'Reembolso total, por el Código de Defensa del Consumidor de Brasil',
        prazo: 'Hasta 7 días después de comprar, antes del servicio',
      },
      {
        se: 'Querés cambiar la fecha',
        recebe: 'Nueva fecha sin costo, según disponibilidad',
        prazo: 'Hasta 24 h antes',
      },
      {
        se: 'Nosotros o el operador cancelamos',
        recebe: 'Reembolso total o nueva fecha',
        prazo: 'Sin costo',
      },
      {
        se: 'Cancelás con menos de 24 horas, pasados los 7 días de la compra, o no te presentás',
        recebe: 'Sin reembolso: el lugar ya se pagó al operador',
        prazo: 'No aplica',
      },
    ],
    diaRegras: [
      'Llegá al punto de encuentro 30 minutos antes del horario. Si el paseo te busca en el hotel, esperá en la recepción a la hora de la recogida, que figura en el voucher.',
      'El paseo sale a la hora marcada: si llegás después, perdés el paseo y no hay reembolso.',
      'Llevá un documento con foto (DNI, cédula o pasaporte). En los paseos en barco pueden controlar la lista de pasajeros.',
      'Las tasas municipales, como la de embarque o de turismo, cuando se cobran, se pagan en el lugar.',
      'Embarazo, movilidad reducida o algún problema de salud: avisanos al reservar, porque algunos paseos tienen restricciones.',
      'Menores de 18 años solo con un adulto responsable.',
      'Cuidá tus objetos personales durante el paseo.',
      'En los paseos en barco, el recorrido puede cambiar en el día según el viento y el mar.',
    ],
  },
  faq: [
    {
      p: '¿Cómo recibo mi voucher?',
      r: 'Apenas se confirma el pago, el voucher aparece en la pantalla con el horario y un número único (por ejemplo, ON-7K3P9Q). Podés descargarlo en PDF, y ahí está el WhatsApp del equipo. El día del paseo, solo mostralo en el celular.',
    },
    {
      p: '¿Cuáles son las formas de pago?',
      r: 'Pix y tarjeta de crédito, siempre el valor total de la reserva. Mientras se activa el pago online, registrás la reserva en el sitio y terminás el pago con nosotros por WhatsApp.',
      // a lista entra inteira: as respostas do pagamento online (rOnline) são iguais às do es, sem verbo em vos
      rOnline:
        'Tarjeta de crédito o débito, o Pix con 10% de descuento, siempre por el valor total de la reserva. El pago se hace en el propio sitio, con Stripe. El Pix vale hasta 2 horas antes del primer servicio del pedido; después, solo con tarjeta. La confirmación es automática y el voucher sale al instante.',
    },
    {
      p: '¿Los niños pagan?',
      r: 'En la mayoría de los paseos, los niños de hasta 5 años no pagan. En paseos en barco, city tours y full days, de 6 a 10 años pagan la mitad. Lancha, cuatriciclo, moto de agua, helicóptero y buceo tienen reglas propias. Cada paseo muestra su regla antes de reservar.',
    },
    {
      p: '¿Y si llueve o el mar no lo permite?',
      r: 'Si el paseo se cancela por lluvia, mal tiempo o condiciones del mar, elegís entre reembolso total o una nueva fecha, sin costo.',
    },
    {
      p: '¿Puedo cancelar la reserva?',
      r: 'Sí. Cancelando con al menos 24 horas de anticipación, el reembolso es total. Las compras online también tienen el derecho de arrepentimiento de 7 días del Código de Defensa del Consumidor de Brasil, siempre que el servicio todavía no se haya realizado.',
    },
    {
      p: '¿Nos buscan en el hotel?',
      r: 'Depende del paseo. Los city tours, los full days, el Trolley y la goleta de Cabo Frio con traslado te buscan en el hotel o posada, y la hora de la recogida viene en el voucher. En los demás paseos, el equipo te envía el punto de encuentro por WhatsApp después de reservar.',
    },
    {
      p: '¿A qué hora sale?',
      r: 'Lo elegís en la página de pago, entre los horarios del paseo, y ya viene en el voucher. En los paseos con recogida, es la hora en que la van pasa por tu alojamiento. Para el mismo día, solo se pueden elegir los horarios que empiezan dentro de 2 horas o más.',
    },
    {
      p: '¿Lancha y cuatriciclo son por persona?',
      r: 'No. Lancha, moto de agua y cuatriciclo se cobran por embarcación o vehículo, con la capacidad indicada en cada paseo. El sitio calcula cuántos necesita tu grupo.',
    },
    {
      p: 'Soy extranjero. ¿Puedo reservar?',
      r: '¡Claro! Atendemos en español, portugués e inglés. En el checkout, ingresá tu teléfono con el código del país.',
    },
    {
      p: '¿Es seguro pagar en el sitio?',
      // a resposta de hoje (o pagamento com a equipe pelo WhatsApp) tem verbo em vos; a do pagamento online, não
      r: 'Por ahora el pago no se hace en el sitio: registrás la reserva acá, con conexión cifrada, y pagás con Pix o tarjeta con nuestro equipo por WhatsApp. El sitio no recibe los datos de tu tarjeta.',
      rOnline:
        'Sí. El sitio usa conexión cifrada, y los pagos con tarjeta y con Pix los procesa Stripe: los datos de la tarjeta van directo a Stripe y no quedan con nosotros. Con Pix, el pago se hace en la app de tu banco, y el destinatario del Pix puede aparecer con el nombre de la empresa que procesa el pago (como EBANX o Stripe), y no como Orla Nativa.',
    },
  ],
  passeio: {
    reservarTitulo: 'Reservá el tuyo',
    escolhaData: 'Elegí la fecha',
    escolhaOpcao: 'Elegí la duración',
  },
  transfer: {
    ficha: [
      {
        titulo: 'Vehículos',
        texto: 'Auto ejecutivo para hasta 4 personas o van ejecutiva para hasta 17',
      },
      {
        titulo: 'Espera',
        texto: 'Hasta 1 hora, en arribos o en la dirección de salida',
      },
      {
        titulo: 'Silla para chicos',
        texto: 'Gratis, para los chicos que la necesiten',
      },
      {
        titulo: 'Peaje y estacionamiento',
        texto: 'Incluidos en el precio',
      },
    ],
    como: [
      'En el aeropuerto, el chofer sigue tu vuelo y te espera en arribos con un cartel con tu nombre.',
      'En la dirección de salida, también espera hasta 1 hora. En ese tiempo, nuestro equipo intenta hablar con vos y te pregunta si querés reprogramar.',
      'El auto o la van va directo de la salida al destino, sin paradas extra.',
    ],
    regras: [
      'Los chicos de menos de 10 años y menos de 1,45 m viajan en silla o en asiento elevador (Resolución Contran 819/2021). Tenemos los dos, sin costo: indicá en la reserva cuántos chicos viajan y la edad de cada uno.',
      'Equipaje extra, tabla o equipo: avisá en la reserva.',
      'El peaje y el estacionamiento están incluidos en el precio.',
      'Cancelación gratis hasta 24 horas antes, como en los paseos.',
    ],
    cadeirinhas: 'Sillas para chicos',
    semMalas: 'Sin valijas',
    demaisPassageiros: 'Mandanos el nombre de los demás pasajeros por nuestro WhatsApp, que está en el voucher.',
    confirmadoTexto: 'Tu voucher está listo. Ese día, solo mostraselo al chofer en el celular.',
    criancasCadeirinha: 'Chicos que viajan en silla o asiento elevador',
    idadeCrianca: 'Edad del chico {n}',
    trajetoIncompleto: 'Elegí la salida y el destino y, fuera de los aeropuertos, indicá el hotel, la posada o la dirección.',
    erroData: 'Elegí una fecha a partir de mañana.',
    erroHora: 'Indicá el horario.',
    erroVolta: 'Indicá la fecha y el horario de la vuelta, después de la ida.',
    reservarTitulo: 'Armá tu traslado',
    escolha: 'Elegí',
    horaAjudaAeroporto: 'Saliendo del aeropuerto, poné el horario de llegada del vuelo.',
    passageirosAjuda: 'Adultos y chicos',
    malas: 'Valijas',
    naoCabe: 'No entra el grupo o las valijas',
    escolhaTrajeto: 'Elegí la salida y el destino para ver el precio.',
    sobCotacaoTexto: 'Este trayecto no tiene precio fijo. Dejanos tus datos y te respondemos con el valor.',
    grupoGrande: 'El grupo o las valijas superan lo que entra en la van. Dejanos tus datos y te respondemos con una propuesta.',
  },
  checkout: {
    // o exemplo de telefone: no /es é chileno (DDI padrão +56); aqui fica o argentino e o uruguaio de antes
    telefoneAjuda: 'Con el código del país. Ej.: +54 9 11 1234-5678 o +598 99 123 456',
    selecione: 'Seleccioná',
    pixExplicacao:
      'Pagás en la app de tu banco o billetera, con el código QR o el código copia y pega que aparecen en el paso siguiente. La confirmación es automática y el voucher sale al instante.',
    indisponivelTexto:
      'Estamos terminando de activar el pago online. Tu reserva queda registrada con todos los datos y completás el pago con nuestro equipo por WhatsApp.',
    semStripe:
      'El formulario de pago no se cargó. Probá sin el bloqueador de anuncios en este sitio o con otra red, como los datos del celular. Si sigue sin funcionar, escribinos por e-mail.',
    erros: {
      obrigatorio: 'Completá este campo.',
      email: 'Revisá el e-mail.',
      telefone: 'Ingresá el teléfono con código de país y de área.',
      semHorarioHoje: 'Para hoy ya no quedan horarios. Elegí otra fecha.',
      aceite: 'Tenés que aceptar los términos y la política de cancelación.',
      generico: 'No pudimos completarlo ahora. Probá de nuevo en unos minutos.',
      revise: 'Revisá los campos marcados.',
    },
  },
  reserva: {
    confirmadoTexto: 'Tu voucher está listo. El día del paseo, solo mostralo en el celular.',
    proximo1Busca: 'El día del paseo, esperá en la recepción del alojamiento a la hora de la recogida.',
    proximo1Saida: 'El equipo te envía el punto de encuentro por WhatsApp. Llegá 30 minutos antes del horario de salida.',
    proximo2: 'Guardá el número del voucher: es tu confirmación.',
    proximo3: '¿Necesitás cambiar la fecha? Escribinos con al menos 24 h de anticipación.',
    recusadoTexto: 'El banco emisor de la tarjeta no aprobó el pago. Podés intentar de nuevo con otra tarjeta o con Pix.',
    expiradoTexto: 'El plazo para pagar este Pix terminó. Hacé una nueva reserva o escribinos.',
    canceladoTexto: 'Esta reserva fue cancelada. Si tenés dudas, escribinos.',
    whatsappTexto:
      'Tu reserva quedó registrada. Completá el pago con nuestro equipo por WhatsApp; el voucher se libera apenas se confirma el pago.',
    naoEncontradaTexto: 'Revisá el enlace que recibiste o escribinos por e-mail.',
  },
  casas: {
    texto: 'Casas de alta gama con vista al mar, para grupos grandes. La reserva se hace acá en el sitio, con una seña del 50%.',
    emBreveTexto: 'Estamos preparando las primeras casas. ¿Querés saber cuándo abre la reserva? Dejanos tus datos y te avisamos.',
    pedir: 'Avisame',
    sinalTexto: 'Seña del {p}% del total al reservar.',
    reservarTitulo: 'Reservá la casa',
    escolhaDatas: 'Elegí la llegada y la salida en el calendario.',
    escolhaSaida: 'Ahora elegí la salida.',
    sinal: 'Seña al reservar ({p}%)',
    reservar: 'Reservar con seña del {p}%',
    // Etapa 7, a página da casa: só as frases com verbo em vos e a seña
    datasTitulo: 'Elegí las fechas',
    pacoteOpcoes: '{pacote}: elegí una opción',
    avisoOcupada: 'Alguna noche de esas fechas ya está ocupada. Elegí otras fechas.',
    avisoDatas: 'Elegí otras fechas.',
    sinalHoje: 'Seña hoy ({p}%)',
    colunaPix: 'Seña con Pix',
    colunaCartao: 'Seña con tarjeta',
    avisemeTexto: 'Dejanos tu nombre y tu e-mail y te avisamos cuando abra la reserva de esta casa.',
  },
  contato: {
    titulo: 'Contactanos',
    texto: 'Atención 100% online, en español, portugués e inglés. Escribinos acá y te respondemos.',
  },
  rodape: {
    escreva: 'Escribinos',
  },
  recusa: {
    dados: 'Algún dato de la tarjeta no coincide. Revisá el número, el vencimiento y el código de seguridad, e intentá de nuevo.',
    autenticacao:
      'El banco pidió una confirmación adicional (como un código en su app o por SMS) y no se completó. Intentá de nuevo y confirmá cuando el banco lo pida.',
    vencido: 'La tarjeta está vencida. Revisá la fecha de vencimiento o usá otra tarjeta.',
    processamento: 'Hubo un problema temporal en la comunicación con el banco de la tarjeta. Intentá de nuevo en unos instantes.',
  },
  erro404: {
    atalhos: 'O elegí por dónde empezar',
  },
};
