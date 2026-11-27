import type { IdiomaConteudo } from '../../i18n/conteudo.ts';
import type { ParAR } from './argentino.ts';
import type { MudancasDoDocumento } from './mudancas.ts';

/**
 * AS CASAS DE TEMPORADA NOS TEXTOS LEGAIS (Etapa 7, pacote 3 da reserva das casas, 26/11/2026): o que os Termos de Uso, a
 * Política de Cancelamento e Reembolso e a Política de Privacidade ganham quando a reserva das casas está aberta para o
 * público (RESERVA_CASAS=publico, sempre com o pagamento online no ar). Fica escrito como diferença sobre a versão do
 * pagamento online (src/content/legal/online.ts, textosLegais): o que não está aqui continua igual, palavra por palavra, e
 * nenhuma outra regra muda.
 * - Termos (item 8, "Casas de temporada"): o restante pago na chegada, a entrada e a saída e as 3 regras de cancelamento
 *   das casas (CANCELAMENTO_DAS_CASAS, src/data/regras-casas.ts, que a página da casa e o checkout já mostram). Revisão do
 *   pacote 2: o item 2 (O que vendemos) ganha as estadias nas casas, e o prazo do Pix (item 5) ganha o da casa, que nunca se
 *   paga no dia da entrada (Pix até as 22h e cartão até as 23h30 da véspera: limiteParaPagar, src/lib/formas-pagamento.ts).
 * - Cancelamento (item 11, "Casas de temporada"): as 3 regras, uma por parágrafo, e como a antecedência é contada; o prazo
 *   do Pix do item 10 ganha o da casa.
 * - Privacidade: a reserva da casa (a casa, as datas e os hóspedes); os dados dos hóspedes que a equipe pede pelo WhatsApp
 *   depois do pagamento (nome completo, documento e placa do carro), para quê, com quem são compartilhados (o proprietário
 *   do imóvel e a portaria, quando houver) e por quanto tempo ficam (30 dias depois da saída: PERGUNTA AO DONO, o prazo que o
 *   banco já usa para o cadastro dos hóspedes, apagar_hospedes_vencidos); e as crianças, que também entram no cadastro.
 * O espanhol é neutro e sem verbo em "tú" (sem "seña": "lo pagado en el sitio"), para valer igual no es-ar: nenhum par novo.
 * Os textos são rascunho para o dono aprovar antes de publicar.
 */

/**
 * A data de "Atualizado em" dos três textos com as casas: um lugar só, para trocar no dia de publicar (o dia em que
 * RESERVA_CASAS=publico entrar na Vercel). Nunca antes das datas da versão do pagamento online (ATUALIZADO_EM_ONLINE).
 * NO DIA DE LIGAR (o passo está no roteiro do pacote 3, no README e em docs/pagamentos-stripe.md): conferir a data em Búzios
 * com `TZ=America/Sao_Paulo date +%F` e trocar aqui, no mesmo deploy que liga RESERVA_CASAS=publico (os Termos, item 11,
 * dizem que vale a versão publicada na data da compra). O teste dos textos com as casas confere esta data: troque lá também.
 */
export const ATUALIZADO_EM_CASAS = '2026-11-26';

/* ------------------------------------------------------------------ */
/* Termos de uso: o item 8 (Casas de temporada)                        */

export const MUDANCAS_TERMOS_CASAS: Record<IdiomaConteudo, MudancasDoDocumento> = {
  pt: {
    trocas: [
      // revisão do pacote 2: o item 2 (O que vendemos) passa a dizer que a agência também vende as estadias nas casas
      [
        'Somos uma agência de turismo que vende, pela internet, passeios e transfers em Búzios, Cabo Frio, Arraial do Cabo e região, executados por operadores locais parceiros (donos das embarcações, veículos e equipes).',
        'Somos uma agência de turismo que vende, pela internet, passeios e transfers em Búzios, Cabo Frio, Arraial do Cabo e região, executados por operadores locais parceiros (donos das embarcações, veículos e equipes), e estadias em casas de temporada de proprietários parceiros.',
      ],
      // revisão do pacote 2: o prazo de pagar a casa (decisão do dono de 26/11: nunca no dia da entrada; limiteParaPagar,
      // src/lib/formas-pagamento.ts, com HORA_LIMITE_PARA_PAGAR_A_CASA: Pix até 2 horas antes e cartão até 30 minutos antes
      // da meia-noite que começa o dia da entrada)
      [
        'Prazo: o Pix vale até 2 horas antes do início do primeiro serviço do pedido (passeio, transfer ou entrada na casa). Depois disso, só cartão: um pedido já feito pode ser pago com cartão até 30 minutos antes do primeiro serviço.',
        'Prazo: o Pix vale até 2 horas antes do início do primeiro serviço do pedido (passeio ou transfer). Depois disso, só cartão: um pedido já feito pode ser pago com cartão até 30 minutos antes do primeiro serviço. Na casa de temporada, o pagamento vai só até a véspera da entrada: Pix até as 22h e cartão até as 23h30, no horário de Brasília. Num pedido com mais de um item, vale o prazo que termina primeiro.',
      ],
    ],
    depois: [
      [
        'As casas de temporada são reservadas no site, com sinal de 50% do valor. As regras de cada casa (diárias, mínimo de noites e cancelamento) aparecem na página da casa antes da reserva, e a localização exata é enviada pela nossa equipe pelo WhatsApp, depois do pagamento confirmado.',
        [
          'Na casa, o restante da estadia é pago na chegada, em Pix, dinheiro ou cartão. A entrada é a partir das 15h e a saída, até as 12h.',
          'O cancelamento das casas segue regras próprias, descritas também na Política de Cancelamento e Reembolso (item 11): até 30 dias antes da entrada, o sinal pago no site é devolvido inteiro; nos 7 dias depois da compra, desde que antes da entrada, a devolução é total (art. 49 do CDC); a menos de 30 dias da entrada, fora desses 7 dias, o sinal pago no site não é devolvido e o restante da estadia não é cobrado.',
        ],
      ],
    ],
  },
  en: {
    trocas: [
      [
        'We are a travel agency that sells, online, tours and transfers in Búzios, Cabo Frio, Arraial do Cabo and the surrounding area, run by local partner operators (the owners of the boats, vehicles and crews).',
        'We are a travel agency that sells, online, tours and transfers in Búzios, Cabo Frio, Arraial do Cabo and the surrounding area, run by local partner operators (the owners of the boats, vehicles and crews), and stays in holiday homes of partner property owners.',
      ],
      [
        'Deadline: Pix is available up to 2 hours before the first service in your order starts (tour, transfer or check-in at the home). After that, by card only: an order already placed can be paid by card up to 30 minutes before the first service.',
        'Deadline: Pix is available up to 2 hours before the first service in your order starts (tour or transfer). After that, by card only: an order already placed can be paid by card up to 30 minutes before the first service. For holiday homes, payment is only possible until the day before check-in: Pix until 10 p.m. and card until 11:30 p.m., Brasília time. In an order with more than one item, the deadline that ends first applies.',
      ],
    ],
    depois: [
      [
        'Holiday homes are booked on the site with a 50% deposit. Each home’s rules (nightly rates, minimum stay and cancellation) are shown on its page before booking, and our team sends the exact location on WhatsApp once the payment is confirmed.',
        [
          'For holiday homes, the rest of the stay is paid on arrival, by Pix, cash or card. Check-in is from 3 p.m. and check-out is by noon.',
          'Holiday home cancellations follow their own rules, also set out in the Cancellation and Refund Policy (item 11): up to 30 days before check-in, the deposit paid on the site is refunded in full; within 7 days of purchase, as long as it is before check-in, the refund is full (article 49 of the Consumer Protection Code); less than 30 days before check-in, outside those 7 days, the deposit paid on the site is not refunded and the rest of the stay is not charged.',
        ],
      ],
    ],
  },
  es: {
    trocas: [
      [
        'Somos una agencia de turismo que vende por internet paseos y traslados en Búzios, Cabo Frio, Arraial do Cabo y la región, realizados por operadores locales asociados (dueños de las embarcaciones, vehículos y equipos).',
        'Somos una agencia de turismo que vende por internet paseos y traslados en Búzios, Cabo Frio, Arraial do Cabo y la región, realizados por operadores locales asociados (dueños de las embarcaciones, vehículos y equipos), y estadías en casas de temporada de propietarios asociados.',
      ],
      [
        'Plazo: el Pix vale hasta 2 horas antes del inicio del primer servicio del pedido (paseo, traslado o entrada a la casa). Después, solo con tarjeta: un pedido ya hecho se puede pagar con tarjeta hasta 30 minutos antes del primer servicio.',
        'Plazo: el Pix vale hasta 2 horas antes del inicio del primer servicio del pedido (paseo o traslado). Después, solo con tarjeta: un pedido ya hecho se puede pagar con tarjeta hasta 30 minutos antes del primer servicio. En la casa de temporada, el pago es posible solo hasta la víspera de la entrada: Pix hasta las 22 h y tarjeta hasta las 23:30 h, en el horario de Brasilia. En un pedido con más de un ítem, vale el plazo que termina primero.',
      ],
    ],
    depois: [
      [
        'Las casas de temporada se reservan en el sitio, con un anticipo del 50% del valor. Las reglas de cada casa (tarifas por noche, mínimo de noches y cancelación) aparecen en la página de la casa antes de reservar, y nuestro equipo envía la ubicación exacta por WhatsApp después de confirmado el pago.',
        [
          'En la casa, el resto de la estadía se paga al llegar, con Pix, efectivo o tarjeta. La entrada es desde las 15 h y la salida, hasta las 12 h.',
          'La cancelación de las casas sigue reglas propias, descritas también en la Política de Cancelación y Reembolso (punto 11): hasta 30 días antes de la entrada, lo pagado en el sitio se devuelve completo; en los 7 días posteriores a la compra, siempre que sea antes de la entrada, la devolución es total (art. 49 del Código de Defensa del Consumidor); a menos de 30 días de la entrada, fuera de esos 7 días, lo pagado en el sitio no se devuelve y el resto de la estadía no se cobra.',
        ],
      ],
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Política de cancelamento: o item 11 (Casas de temporada)            */

export const MUDANCAS_CANCELAMENTO_CASAS: Record<IdiomaConteudo, MudancasDoDocumento> = {
  pt: {
    // revisão do pacote 2: o prazo do Pix no item 10 (Pedidos pagos por Pix), com o da casa (até as 22h da véspera da entrada)
    trocas: [
      // o resumo do topo também avisa das casas (achado dos prints de 26/11: só falava das 24 horas dos passeios)
      [
        'Cancelou com 24 horas ou mais de antecedência? Reembolso integral. Passeio cancelado por chuva, mau tempo ou condições do mar? Você escolhe entre reembolso integral ou nova data. Compras pelo site também têm 7 dias de direito de arrependimento, desde que o serviço ainda não tenha acontecido.',
        'Cancelou com 24 horas ou mais de antecedência? Reembolso integral. Passeio cancelado por chuva, mau tempo ou condições do mar? Você escolhe entre reembolso integral ou nova data. Compras pelo site também têm 7 dias de direito de arrependimento, desde que o serviço ainda não tenha acontecido. Casas de temporada têm regras próprias: até 30 dias antes da entrada, o sinal pago no site é devolvido inteiro (item 11).',
      ],
      [
        'Prazo: o Pix só vale até 2 horas antes do início do primeiro serviço do pedido.',
        'Prazo: o Pix só vale até 2 horas antes do início do primeiro serviço do pedido; na casa de temporada, só até as 22h da véspera da entrada, no horário de Brasília.',
      ],
    ],
    depois: [
      [
        'As casas de temporada têm regras próprias de sinal e cancelamento, mostradas na página de cada casa antes da reserva.',
        [
          'Valem estas regras, que também aparecem na página de cada casa e no checkout, antes do pagamento:',
          'Até 30 dias antes da entrada: o sinal pago no site é devolvido inteiro.',
          'Nos 7 dias depois da compra, desde que antes da entrada: devolução total, pelo direito de arrependimento (item 2).',
          'A menos de 30 dias da entrada, fora desses 7 dias: o sinal pago no site não é devolvido, e o restante da estadia não é cobrado.',
          'A antecedência é contada em dias de calendário até a data da entrada, pelo horário de Brasília, e vale o horário da sua mensagem (item 8). O reembolso, quando houver, segue o item 9.',
        ],
      ],
    ],
  },
  en: {
    trocas: [
      // o resumo do topo também avisa das casas (achado dos prints de 26/11: só falava das 24 horas dos passeios)
      [
        'Cancelled 24 hours or more in advance? Full refund. Tour cancelled because of rain, bad weather or sea conditions? You choose between a full refund or a new date. Online purchases also have a 7-day withdrawal right, provided the service has not yet taken place.',
        'Cancelled 24 hours or more in advance? Full refund. Tour cancelled because of rain, bad weather or sea conditions? You choose between a full refund or a new date. Online purchases also have a 7-day withdrawal right, provided the service has not yet taken place. Holiday homes have their own rules: up to 30 days before check-in, the deposit paid on the site is refunded in full (item 11).',
      ],
      [
        'Deadline: Pix is only available up to 2 hours before the first service in your order starts.',
        'Deadline: Pix is only available up to 2 hours before the first service in your order starts; for holiday homes, only until 10 p.m. on the day before check-in, Brasília time.',
      ],
    ],
    depois: [
      [
        'Holiday homes have their own deposit and cancellation rules, shown on each home’s page before booking.',
        [
          'These rules apply, and they are also shown on each home’s page and at checkout, before payment:',
          'Up to 30 days before check-in: the deposit paid on the site is refunded in full.',
          'Within 7 days of purchase, as long as it is before check-in: a full refund, under the right of withdrawal (item 2).',
          'Less than 30 days before check-in, outside those 7 days: the deposit paid on the site is not refunded, and the rest of the stay is not charged.',
          'The notice period is counted in calendar days up to the check-in date, in Brasília time, and the time of your message is what counts (item 8). Any refund follows item 9.',
        ],
      ],
    ],
  },
  es: {
    trocas: [
      // o resumo do topo também avisa das casas (achado dos prints de 26/11: só falava das 24 horas dos passeios)
      [
        '¿Cancelaste con 24 horas o más de anticipación? Reembolso total. ¿El paseo se canceló por lluvia, mal tiempo o condiciones del mar? Eliges entre reembolso total o nueva fecha. Las compras en el sitio también tienen 7 días de derecho de arrepentimiento, siempre que el servicio todavía no se haya realizado.',
        '¿Cancelaste con 24 horas o más de anticipación? Reembolso total. ¿El paseo se canceló por lluvia, mal tiempo o condiciones del mar? Eliges entre reembolso total o nueva fecha. Las compras en el sitio también tienen 7 días de derecho de arrepentimiento, siempre que el servicio todavía no se haya realizado. Las casas de temporada tienen reglas propias: hasta 30 días antes de la entrada, lo pagado en el sitio se devuelve completo (punto 11).',
      ],
      [
        'Plazo: el Pix solo vale hasta 2 horas antes del inicio del primer servicio del pedido.',
        'Plazo: el Pix solo vale hasta 2 horas antes del inicio del primer servicio del pedido; en la casa de temporada, solo hasta las 22 h de la víspera de la entrada, en el horario de Brasilia.',
      ],
    ],
    depois: [
      [
        'Las casas de temporada tienen reglas propias de anticipo y cancelación, que se muestran en la página de cada casa antes de reservar.',
        [
          'Valen estas reglas, que también aparecen en la página de cada casa y en el checkout, antes del pago:',
          'Hasta 30 días antes de la entrada: lo pagado en el sitio se devuelve completo.',
          'En los 7 días posteriores a la compra, siempre que sea antes de la entrada: devolución total, por el derecho de arrepentimiento (punto 2).',
          'A menos de 30 días de la entrada, fuera de esos 7 días: lo pagado en el sitio no se devuelve, y el resto de la estadía no se cobra.',
          'La anticipación se cuenta en días corridos hasta la fecha de la entrada, según el horario de Brasilia, y vale la hora del mensaje (punto 8). El reembolso, cuando corresponda, sigue el punto 9.',
        ],
      ],
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Política de privacidade: a reserva da casa e os hóspedes            */

export const MUDANCAS_PRIVACIDADE_CASAS: Record<IdiomaConteudo, MudancasDoDocumento> = {
  pt: {
    trocas: [
      [
        'Dados de crianças e adolescentes são informados pelo adulto responsável pela reserva, apenas na medida necessária para o passeio ou o transfer (por exemplo, a quantidade de crianças e, no transfer, a idade das que vão de cadeirinha), em seu melhor interesse (art. 14 da LGPD).',
        'Dados de crianças e adolescentes são informados pelo adulto responsável pela reserva, apenas na medida necessária para o passeio, o transfer ou a estadia na casa de temporada (por exemplo, a quantidade de crianças, no transfer a idade das que vão de cadeirinha e, na casa, o nome e o documento de cada hóspede), em seu melhor interesse (art. 14 da LGPD).',
      ],
    ],
    depois: [
      [
        'Reserva: passeio ou transfer, data, horário, quantidade de adultos e crianças, cidade e nome do hotel ou pousada e as observações que você escrever. No transfer, também o trajeto, os voos, as malas e a idade das crianças que vão de cadeirinha.',
        [
          'Reserva de casa de temporada: a casa, as datas de entrada e de saída e a quantidade de hóspedes.',
          'Hóspedes da casa de temporada: depois do pagamento, a nossa equipe pede pelo WhatsApp o nome completo e o documento de cada hóspede e, de quem vier de carro, a placa.',
        ],
      ],
      [
        'Fazer e gerenciar a sua reserva, emitir o voucher com o horário, enviar o ponto de encontro e repassar ao operador os dados necessários para o serviço — execução de contrato (art. 7º, V, da LGPD).',
        [
          'Na casa de temporada, receber os hóspedes, entregar a chave e passar os dados deles ao proprietário do imóvel e à portaria, quando houver, para a segurança de todos — execução de contrato e legítimo interesse (art. 7º, V e IX).',
        ],
      ],
      [
        'Operadores dos passeios e do transfer (embarcações, veículos, motoristas, guias): nome, quantidade de pessoas, hospedagem e contato e, no transfer, também o trajeto, os voos, as malas e a idade das crianças que vão de cadeirinha, para realizar o serviço.',
        [
          'Proprietário da casa de temporada e portaria do condomínio, quando houver: o nome completo e o documento dos hóspedes, a placa do carro e as datas da estadia, para a entrada na casa e a segurança.',
        ],
      ],
      [
        'O e-mail digitado no checkout de um carrinho que não virou pedido é apagado 90 dias depois da última mudança no carrinho. De quem saiu da lista dos lembretes, guardamos só o e-mail, para não mandar outro lembrete.',
        [
          'O nome, o documento e a placa dos hóspedes de uma casa de temporada são apagados 30 dias depois da saída, ou logo que a estadia é cancelada ou devolvida.',
        ],
      ],
    ],
  },
  en: {
    trocas: [
      [
        'Data about children and teenagers is provided by the adult responsible for the booking, only as far as needed for the tour or transfer (for example, the number of children and, for transfers, the age of those travelling in a child seat), in their best interest (LGPD art. 14).',
        'Data about children and teenagers is provided by the adult responsible for the booking, only as far as needed for the tour, the transfer or the holiday home stay (for example, the number of children, for transfers the age of those travelling in a child seat and, for homes, each guest’s name and ID), in their best interest (LGPD art. 14).',
      ],
    ],
    depois: [
      [
        'Booking: tour or transfer, date, time, number of adults and children, town and name of your hotel or guesthouse, and any notes you write. For transfers, also the route, flights, luggage and the age of children travelling in a child seat.',
        [
          'Holiday home booking: the home, the check-in and check-out dates and the number of guests.',
          'Holiday home guests: after payment, our team asks on WhatsApp for each guest’s full name and ID and, for anyone arriving by car, the license plate.',
        ],
      ],
      [
        'To make and manage your booking, issue the voucher with the time, send the meeting point and pass the necessary details to the operator — performance of a contract (LGPD art. 7, V).',
        [
          'For holiday homes, to welcome the guests, hand over the key and pass their details to the property owner and to the gatehouse, where there is one, for everyone’s security — performance of a contract and legitimate interest (art. 7, V and IX).',
        ],
      ],
      [
        'Tour and transfer operators (boats, vehicles, drivers, guides): name, number of people, accommodation and contact and, for transfers, also the route, flights, luggage and the age of children travelling in a child seat, to run the service.',
        [
          'The holiday home’s owner and the condominium gatehouse, where there is one: the guests’ full names and IDs, the car’s license plate and the dates of the stay, for entry to the home and security.',
        ],
      ],
      [
        'The email typed at checkout for a cart that did not become an order is deleted 90 days after the cart was last changed. For people who left the reminder list, we keep only the email address, so that no other reminder is sent.',
        [
          'The names, IDs and license plates of holiday home guests are deleted 30 days after check-out, or as soon as the stay is cancelled or refunded.',
        ],
      ],
    ],
  },
  es: {
    trocas: [
      [
        'Los datos de niños y adolescentes los informa el adulto responsable de la reserva, solo en la medida necesaria para el paseo o el traslado (por ejemplo, la cantidad de niños y, en el traslado, la edad de los que van en silla), en su mejor interés (art. 14 de la LGPD).',
        'Los datos de niños y adolescentes los informa el adulto responsable de la reserva, solo en la medida necesaria para el paseo, el traslado o la estadía en la casa de temporada (por ejemplo, la cantidad de niños, en el traslado la edad de los que van en silla y, en la casa, el nombre y el documento de cada huésped), en su mejor interés (art. 14 de la LGPD).',
      ],
    ],
    depois: [
      [
        'Reserva: paseo o traslado, fecha, horario, cantidad de adultos y niños, ciudad y nombre del hotel o posada, y las observaciones que escribas. En el traslado, también el trayecto, los vuelos, las maletas y la edad de los niños que van en silla.',
        [
          'Reserva de casa de temporada: la casa, las fechas de entrada y de salida y la cantidad de huéspedes.',
          'Huéspedes de la casa de temporada: después del pago, nuestro equipo pide por WhatsApp el nombre completo y el documento de cada huésped y, de quien llegue en auto, la patente.',
        ],
      ],
      [
        'Hacer y gestionar tu reserva, emitir el voucher con el horario, enviar el punto de encuentro y pasar al operador los datos necesarios para el servicio — ejecución de contrato (art. 7, V, de la LGPD).',
        [
          'En la casa de temporada, recibir a los huéspedes, entregar la llave y pasar sus datos al propietario del inmueble y a la portería, cuando la haya, para la seguridad de todos — ejecución de contrato e interés legítimo (art. 7, V y IX).',
        ],
      ],
      [
        'Operadores de los paseos y traslados (embarcaciones, vehículos, conductores, guías): nombre, cantidad de personas, alojamiento y contacto y, en el traslado, también el trayecto, los vuelos, las maletas y la edad de los niños que van en silla, para realizar el servicio.',
        [
          'Propietario de la casa de temporada y portería del condominio, cuando la haya: el nombre completo y el documento de los huéspedes, la patente del auto y las fechas de la estadía, para la entrada a la casa y la seguridad.',
        ],
      ],
      [
        'El e-mail escrito en el checkout de un carrito que no se convirtió en pedido se borra 90 días después del último cambio en el carrito. De quien salió de la lista de recordatorios, guardamos solo el e-mail, para no enviar otro recordatorio.',
        [
          'El nombre, el documento y la patente de los huéspedes de una casa de temporada se eliminan 30 días después de la salida, o en cuanto la estadía se cancela o se reembolsa.',
        ],
      ],
    ],
  },
};

/**
 * As frases novas com "tú" (o par argentino, com "vos"): nenhuma. Ficam as listas, para quem escrever uma frase nova com
 * verbo em "tú" saber onde pôr o par (comAjustesAR falha alto se faltar o par de uma frase que mudou).
 */
export const NOVOS_PARES_TERMOS_CASAS: readonly ParAR[] = [];
export const NOVOS_PARES_CANCELAMENTO_CASAS: readonly ParAR[] = [
  // o resumo do topo com a frase das casas: o mesmo par do resumo de hoje (Eliges → Elegís), com a frase nova no fim
  [
    '¿Cancelaste con 24 horas o más de anticipación? Reembolso total. ¿El paseo se canceló por lluvia, mal tiempo o condiciones del mar? Eliges entre reembolso total o nueva fecha. Las compras en el sitio también tienen 7 días de derecho de arrepentimiento, siempre que el servicio todavía no se haya realizado. Las casas de temporada tienen reglas propias: hasta 30 días antes de la entrada, lo pagado en el sitio se devuelve completo (punto 11).',
    '¿Cancelaste con 24 horas o más de anticipación? Reembolso total. ¿El paseo se canceló por lluvia, mal tiempo o condiciones del mar? Elegís entre reembolso total o nueva fecha. Las compras en el sitio también tienen 7 días de derecho de arrepentimiento, siempre que el servicio todavía no se haya realizado. Las casas de temporada tienen reglas propias: hasta 30 días antes de la entrada, lo pagado en el sitio se devuelve completo (punto 11).',
  ],
];
export const NOVOS_PARES_PRIVACIDADE_CASAS: readonly ParAR[] = [];
