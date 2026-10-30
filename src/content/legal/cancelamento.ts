import { EMPRESA } from '@/config/empresa';
import type { DocumentoLegal } from './tipos';

const E = EMPRESA;

export const CANCELAMENTO: Record<'pt' | 'en' | 'es', DocumentoLegal> = {
  pt: {
    titulo: 'Política de Cancelamento e Reembolso',
    resumo:
      'Cancelou com 24 horas ou mais de antecedência? Reembolso integral. Passeio cancelado por chuva, mau tempo ou condições do mar? Você escolhe entre reembolso integral ou nova data. Compras pelo site também têm 7 dias de direito de arrependimento.',
    secoes: [
      {
        titulo: '1. A quem se aplica',
        paragrafos: [
          `Esta política vale para todos os passeios comprados no site ${E.dominio}, operado por ${E.marca}, CNPJ ${E.cnpj}, sediada em ${E.cidade} – ${E.uf}.`,
          'Ela segue o Código de Defesa do Consumidor (Lei nº 8.078/1990) e o Decreto nº 7.962/2013, que trata do comércio eletrônico. Nada nesta política reduz os direitos que a lei garante a você.',
        ],
      },
      {
        titulo: '2. Direito de arrependimento (7 dias)',
        paragrafos: [
          'Como a compra é feita pela internet, você pode desistir dela em até 7 (sete) dias corridos contados da data da compra, sem precisar explicar o motivo, conforme o art. 49 do Código de Defesa do Consumidor.',
          'Nesse caso, devolvemos imediatamente todos os valores pagos, com atualização monetária, desde que o passeio ainda não tenha acontecido. O pedido pode ser feito pelos mesmos canais usados na compra (veja o item 8).',
        ],
      },
      {
        titulo: '3. Cancelamento com 24 horas ou mais de antecedência',
        paragrafos: [
          'Se você cancelar com pelo menos 24 (vinte e quatro) horas de antecedência do horário de início do passeio, o reembolso é integral, independentemente do motivo.',
        ],
      },
      {
        titulo: '4. Cancelamento por chuva, mau tempo ou condições do mar',
        paragrafos: [
          'Quando o passeio é cancelado pelo operador ou pela autoridade marítima por causa de chuva, mau tempo, vento, ressaca ou outras condições do mar que comprometam a segurança, você escolhe uma das opções abaixo, sem nenhum custo:',
        ],
        lista: ['reembolso integral do valor pago; ou', 'remarcação para outra data, conforme disponibilidade.'],
        depois: [
          'A decisão de realizar ou cancelar o passeio é tomada pelo operador, sempre priorizando a segurança. Chuva fraca que não impeça o passeio não caracteriza cancelamento. Se o passeio precisar ser interrompido por segurança depois de iniciado, avaliaremos com você a remarcação ou o reembolso proporcional.',
        ],
      },
      {
        titulo: '5. Cancelamento pela agência ou pelo operador',
        paragrafos: [
          'Se o passeio não puder ser realizado por motivo nosso ou do operador (por exemplo, falta de disponibilidade na data escolhida, número mínimo de participantes não atingido ou problema operacional), avisaremos você o quanto antes e você escolhe entre reembolso integral ou remarcação sem custo.',
        ],
      },
      {
        titulo: '6. Cancelamento com menos de 24 horas e não comparecimento',
        paragrafos: [
          'Fora das situações dos itens 2, 4 e 5, cancelamentos feitos com menos de 24 horas de antecedência e o não comparecimento no horário e local combinados não dão direito a reembolso, porque a vaga já foi reservada e paga ao operador.',
          'Em casos de força maior devidamente comprovados (por exemplo, problema de saúde com atestado), fale com a gente: analisaremos a possibilidade de remarcação.',
        ],
      },
      {
        titulo: '7. Remarcação a pedido do cliente',
        paragrafos: [
          'Você pode pedir para trocar a data com pelo menos 24 horas de antecedência, sem custo, sujeito à disponibilidade. Se escolher outro passeio, a diferença de preço será cobrada ou devolvida.',
        ],
      },
      {
        titulo: '8. Como pedir o cancelamento ou a remarcação',
        paragrafos: ['Envie o número do seu voucher (ex.: ON-7K3P9Q) por um destes canais:'],
        lista: ['WhatsApp: pelo botão na página da sua reserva', `E-mail: ${E.email}`],
        depois: [
          'Confirmamos o recebimento do pedido pelo mesmo canal. O horário da sua mensagem é o que vale para contar a antecedência.',
        ],
      },
      {
        titulo: '9. Prazos e forma de reembolso',
        paragrafos: [
          'O reembolso é feito pelo mesmo meio de pagamento usado na compra, e o estorno é solicitado em até 2 (dois) dias úteis após a confirmação do cancelamento.',
        ],
        lista: [
          'Pix: o valor volta para a conta de origem, em geral no mesmo dia do estorno.',
          'Cartão de crédito: o estorno é enviado à administradora do cartão e o crédito aparece na fatura conforme o prazo dela, normalmente em uma ou duas faturas.',
        ],
        depois: ['Não cobramos nenhuma taxa para processar reembolsos previstos nesta política.'],
      },
      {
        titulo: '10. Pacotes de passeio + hospedagem',
        paragrafos: [
          'Pacotes com hospedagem são vendidos sob consulta. As regras de cancelamento da hospedagem dependem do hotel ou pousada e são informadas por escrito no orçamento, antes do pagamento.',
        ],
      },
    ],
  },
  en: {
    titulo: 'Cancellation and Refund Policy',
    resumo:
      'Cancelled 24 hours or more in advance? Full refund. Tour cancelled because of rain, bad weather or sea conditions? You choose between a full refund or a new date. Online purchases also have a 7-day withdrawal right.',
    secoes: [
      {
        titulo: '1. Scope',
        paragrafos: [
          `This policy applies to all tours purchased on ${E.dominio}, operated by ${E.marca}, CNPJ ${E.cnpj}, based in ${E.cidade} – ${E.uf}, Brazil.`,
          'It follows the Brazilian Consumer Protection Code (Law 8,078/1990) and Decree 7,962/2013 on e-commerce. Nothing in this policy limits the rights the law gives you.',
        ],
      },
      {
        titulo: '2. Right of withdrawal (7 days)',
        paragrafos: [
          'Because the purchase is made online, you may withdraw from it within 7 (seven) calendar days of the purchase date, without giving any reason, under article 49 of the Consumer Protection Code.',
          'In that case we immediately refund everything you paid, adjusted for inflation, provided the tour has not yet taken place. You can make the request through the same channels used for the purchase (see item 8).',
        ],
      },
      {
        titulo: '3. Cancellation 24 hours or more in advance',
        paragrafos: [
          'If you cancel at least 24 (twenty-four) hours before the tour’s start time, you get a full refund, whatever the reason.',
        ],
      },
      {
        titulo: '4. Cancellation due to rain, bad weather or sea conditions',
        paragrafos: [
          'When the tour is cancelled by the operator or the maritime authority because of rain, bad weather, wind, swell or other sea conditions that affect safety, you choose one of the options below at no cost:',
        ],
        lista: ['a full refund of the amount paid; or', 'a new date, subject to availability.'],
        depois: [
          'The decision to run or cancel a tour is made by the operator, always putting safety first. Light rain that does not prevent the tour is not a cancellation. If a tour has to be interrupted for safety after it starts, we will agree with you on a new date or a proportional refund.',
        ],
      },
      {
        titulo: '5. Cancellation by the agency or the operator',
        paragrafos: [
          'If the tour cannot take place for reasons on our side or the operator’s (for example, no availability on the chosen date, minimum group size not reached or an operational problem), we will let you know as soon as possible and you choose between a full refund or a free change of date.',
        ],
      },
      {
        titulo: '6. Cancellation less than 24 hours in advance and no-shows',
        paragrafos: [
          'Except in the situations described in items 2, 4 and 5, cancellations made less than 24 hours in advance and failing to show up at the agreed time and place are not refundable, because the place has already been booked and paid to the operator.',
          'In duly proven cases of force majeure (for example, a health problem with a medical certificate), talk to us and we will consider a change of date.',
        ],
      },
      {
        titulo: '7. Changing the date at the customer’s request',
        paragrafos: [
          'You can ask to change the date at least 24 hours in advance, at no cost, subject to availability. If you choose a different tour, the price difference will be charged or refunded.',
        ],
      },
      {
        titulo: '8. How to cancel or change your booking',
        paragrafos: ['Send us your voucher number (e.g. ON-7K3P9Q) through one of these channels:'],
        lista: ['WhatsApp: use the button on your booking page', `Email: ${E.email}`],
        depois: [
          'We confirm receipt of your request through the same channel. The time of your message is what counts for the notice period.',
        ],
      },
      {
        titulo: '9. Refund timing and method',
        paragrafos: [
          'Refunds are made to the same payment method used for the purchase, and the refund is requested within 2 (two) business days after the cancellation is confirmed.',
        ],
        lista: [
          'Pix: the amount returns to the original account, usually on the same day the refund is issued.',
          'Credit card: the refund is sent to the card issuer and the credit shows on your statement according to their timing, usually within one or two statements.',
        ],
        depois: ['We do not charge any fee to process refunds under this policy.'],
      },
      {
        titulo: '10. Tour + stay packages',
        paragrafos: [
          'Packages that include accommodation are sold on request. The cancellation rules for the accommodation depend on the hotel or guesthouse and are stated in writing in the quote, before payment.',
        ],
      },
    ],
  },
  es: {
    titulo: 'Política de Cancelación y Reembolso',
    resumo:
      '¿Cancelaste con 24 horas o más de anticipación? Reembolso total. ¿El paseo se canceló por lluvia, mal tiempo o condiciones del mar? Elegís entre reembolso total o nueva fecha. Las compras en el sitio también tienen 7 días de derecho de arrepentimiento.',
    secoes: [
      {
        titulo: '1. Alcance',
        paragrafos: [
          `Esta política se aplica a todos los paseos comprados en el sitio ${E.dominio}, operado por ${E.marca}, CNPJ ${E.cnpj}, con sede en ${E.cidade} – ${E.uf}, Brasil.`,
          'Sigue el Código de Defensa del Consumidor de Brasil (Ley 8.078/1990) y el Decreto 7.962/2013 sobre comercio electrónico. Nada en esta política reduce los derechos que la ley te garantiza.',
        ],
      },
      {
        titulo: '2. Derecho de arrepentimiento (7 días)',
        paragrafos: [
          'Como la compra se hace por internet, podés desistir de ella dentro de los 7 (siete) días corridos contados desde la fecha de compra, sin necesidad de explicar el motivo, según el art. 49 del Código de Defensa del Consumidor.',
          'En ese caso devolvemos de inmediato todo lo que pagaste, con actualización monetaria, siempre que el paseo todavía no se haya realizado. El pedido se puede hacer por los mismos canales usados en la compra (ver el punto 8).',
        ],
      },
      {
        titulo: '3. Cancelación con 24 horas o más de anticipación',
        paragrafos: [
          'Si cancelás con al menos 24 (veinticuatro) horas de anticipación al horario de inicio del paseo, el reembolso es total, sin importar el motivo.',
        ],
      },
      {
        titulo: '4. Cancelación por lluvia, mal tiempo o condiciones del mar',
        paragrafos: [
          'Cuando el operador o la autoridad marítima cancela el paseo por lluvia, mal tiempo, viento, mar de fondo u otras condiciones del mar que afecten la seguridad, elegís una de estas opciones, sin ningún costo:',
        ],
        lista: ['reembolso total del valor pagado; o', 'cambio a otra fecha, según disponibilidad.'],
        depois: [
          'La decisión de realizar o cancelar el paseo la toma el operador, siempre priorizando la seguridad. Una lluvia leve que no impida el paseo no se considera cancelación. Si el paseo debe interrumpirse por seguridad después de comenzar, acordaremos con vos una nueva fecha o un reembolso proporcional.',
        ],
      },
      {
        titulo: '5. Cancelación por parte de la agencia o del operador',
        paragrafos: [
          'Si el paseo no puede realizarse por un motivo nuestro o del operador (por ejemplo, falta de disponibilidad en la fecha elegida, cupo mínimo no alcanzado o un problema operativo), te avisaremos lo antes posible y elegís entre reembolso total o cambio de fecha sin costo.',
        ],
      },
      {
        titulo: '6. Cancelación con menos de 24 horas e inasistencia',
        paragrafos: [
          'Fuera de las situaciones de los puntos 2, 4 y 5, las cancelaciones con menos de 24 horas de anticipación y la inasistencia en el horario y lugar acordados no dan derecho a reembolso, porque el lugar ya fue reservado y pagado al operador.',
          'En casos de fuerza mayor debidamente comprobados (por ejemplo, un problema de salud con certificado médico), escribinos y analizaremos la posibilidad de cambiar la fecha.',
        ],
      },
      {
        titulo: '7. Cambio de fecha a pedido del cliente',
        paragrafos: [
          'Podés pedir cambiar la fecha con al menos 24 horas de anticipación, sin costo, sujeto a disponibilidad. Si elegís otro paseo, la diferencia de precio se cobrará o se devolverá.',
        ],
      },
      {
        titulo: '8. Cómo pedir la cancelación o el cambio de fecha',
        paragrafos: ['Envianos el número de tu voucher (ej.: ON-7K3P9Q) por uno de estos canales:'],
        lista: ['WhatsApp: con el botón de la página de tu reserva', `E-mail: ${E.email}`],
        depois: ['Confirmamos la recepción del pedido por el mismo canal. La hora de tu mensaje es la que cuenta para la anticipación.'],
      },
      {
        titulo: '9. Plazos y forma de reembolso',
        paragrafos: [
          'El reembolso se hace por el mismo medio de pago usado en la compra, y la devolución se solicita dentro de los 2 (dos) días hábiles siguientes a la confirmación de la cancelación.',
        ],
        lista: [
          'Pix: el valor vuelve a la cuenta de origen, en general el mismo día de la devolución.',
          'Tarjeta de crédito: la devolución se envía a la emisora de la tarjeta y el crédito aparece en el resumen según sus plazos, normalmente en uno o dos resúmenes.',
        ],
        depois: ['No cobramos ninguna tasa por procesar los reembolsos previstos en esta política.'],
      },
      {
        titulo: '10. Paquetes de paseo + alojamiento',
        paragrafos: [
          'Los paquetes con alojamiento se venden a consulta. Las reglas de cancelación del alojamiento dependen del hotel o posada y se informan por escrito en el presupuesto, antes del pago.',
        ],
      },
    ],
  },
};
