import { EMPRESA } from '@/config/empresa';
import type { DocumentoLegal } from './tipos';

const E = EMPRESA;

export const TERMOS: Record<'pt' | 'en' | 'es', DocumentoLegal> = {
  pt: {
    titulo: 'Termos de Uso',
    resumo: `Estas são as regras para usar o site ${E.dominio} e comprar passeios com a ${E.marca}. Ao fazer uma reserva, você declara que leu e concorda com elas.`,
    secoes: [
      {
        titulo: '1. Quem somos',
        paragrafos: [
          `O site ${E.dominio} é operado por ${E.marca}, inscrita no CNPJ sob o nº ${E.cnpj}, sediada em ${E.cidade} – ${E.uf}.`,
          `Contato: e-mail ${E.email}. Depois da reserva, o atendimento também é feito pelo WhatsApp.`,
        ],
      },
      {
        titulo: '2. O que vendemos',
        paragrafos: [
          'Somos uma agência de turismo que vende, pela internet, passeios em Búzios, Cabo Frio, Arraial do Cabo e região, executados por operadores locais parceiros (donos das embarcações, veículos e equipes).',
          'Cuidamos da venda, do atendimento, da emissão do voucher e dos reembolsos. A execução do passeio é feita pelo operador parceiro. Perante você, respondemos nos termos do Código de Defesa do Consumidor.',
        ],
      },
      {
        titulo: '3. Reserva e confirmação',
        paragrafos: [
          'A reserva é confirmada quando o pagamento é aprovado. Nesse momento emitimos um voucher com número único, que é o seu comprovante.',
        ],
        lista: [
          'Você é responsável por informar dados corretos (nome, contato, documento, data, número de pessoas e hospedagem).',
          'Horário de saída e ponto de encontro são confirmados pelo WhatsApp após a compra e podem variar com a maré, o clima e a temporada.',
          'Se não houver disponibilidade na data escolhida, avisaremos e você escolhe entre nova data ou reembolso integral.',
          'Menores de 18 anos devem estar acompanhados por um responsável.',
        ],
      },
      {
        titulo: '4. Preços e pagamento',
        paragrafos: [
          'Os preços estão em reais (R$) e indicam se são por pessoa, por veículo ou por embarcação. O total aparece antes do pagamento.',
          'O pagamento é sempre do valor total da reserva, por Pix ou cartão de crédito, processado pela Pagar.me. Os dados do cartão são enviados diretamente à processadora e não ficam armazenados conosco.',
          'Taxas cobradas no local por terceiros (como taxas municipais ou de embarque), alimentação e itens opcionais não estão incluídos, salvo quando indicado na página do passeio.',
        ],
      },
      {
        titulo: '5. Cancelamento, remarcação e reembolso',
        paragrafos: [
          'As regras estão na Política de Cancelamento e Reembolso, que faz parte destes termos. Em resumo: reembolso integral com 24 horas ou mais de antecedência; em caso de chuva, mau tempo ou condições do mar, reembolso integral ou nova data, à sua escolha; e direito de arrependimento de 7 dias para compras online (art. 49 do CDC).',
        ],
      },
      {
        titulo: '6. Segurança durante os passeios',
        paragrafos: ['Para a segurança de todos:'],
        lista: [
          'siga as orientações da tripulação, do guia ou do condutor;',
          'use colete salva-vidas, capacete e demais equipamentos quando solicitado;',
          'para pilotar quadriciclo é preciso ter habilitação e não ter consumido bebida alcoólica;',
          'informe antes da reserva qualquer condição de saúde relevante (por exemplo, gestação, problemas cardíacos ou respiratórios, especialmente para mergulho e voo);',
          'o operador pode recusar o embarque de quem estiver colocando em risco a própria segurança ou a dos outros.',
        ],
      },
      {
        titulo: '7. Pacotes de passeio + hospedagem',
        paragrafos: [
          'Os pacotes com hospedagem são vendidos sob consulta, por e-mail. Preço, condições e regras de cancelamento são enviados por escrito no orçamento, antes de qualquer pagamento.',
        ],
      },
      {
        titulo: '8. Uso do site',
        paragrafos: [
          'Você se compromete a usar o site de boa-fé, sem tentar fraudar pagamentos, acessar áreas restritas ou prejudicar o funcionamento do serviço.',
          'Textos, ilustrações, logotipos e demais conteúdos do site pertencem à agência ou são usados com autorização, e não podem ser copiados para fins comerciais sem permissão.',
        ],
      },
      {
        titulo: '9. Privacidade',
        paragrafos: [
          'O tratamento dos seus dados pessoais segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e está descrito na nossa Política de Privacidade.',
        ],
      },
      {
        titulo: '10. Alterações',
        paragrafos: ['Podemos atualizar estes termos. A versão válida para a sua reserva é a publicada no site na data da compra.'],
      },
      {
        titulo: '11. Lei aplicável e foro',
        paragrafos: [
          'Estes termos seguem a legislação brasileira, em especial o Código de Defesa do Consumidor. Fica eleito o foro do domicílio do consumidor para resolver eventuais conflitos. Antes disso, fale com a gente: a maioria das questões se resolve rapidamente pelo WhatsApp ou por e-mail.',
        ],
      },
    ],
  },
  en: {
    titulo: 'Terms of Use',
    resumo: `These are the rules for using ${E.dominio} and buying tours from ${E.marca}. By making a booking, you confirm that you have read and agree to them.`,
    secoes: [
      {
        titulo: '1. Who we are',
        paragrafos: [
          `${E.dominio} is operated by ${E.marca}, registered under CNPJ ${E.cnpj}, based in ${E.cidade} – ${E.uf}, Brazil.`,
          `Contact: email ${E.email}. After booking, we also assist you on WhatsApp.`,
        ],
      },
      {
        titulo: '2. What we sell',
        paragrafos: [
          'We are a travel agency that sells, online, tours in Búzios, Cabo Frio, Arraial do Cabo and the surrounding area, run by local partner operators (the owners of the boats, vehicles and crews).',
          'We handle the sale, customer service, the voucher and refunds. The tour itself is run by the partner operator. Towards you, we are responsible under the Brazilian Consumer Protection Code.',
        ],
      },
      {
        titulo: '3. Booking and confirmation',
        paragrafos: [
          'Your booking is confirmed when the payment is approved. At that moment we issue a voucher with a unique number, which is your proof of purchase.',
        ],
        lista: [
          'You are responsible for providing correct details (name, contact, ID document, date, number of people and accommodation).',
          'Departure time and meeting point are confirmed on WhatsApp after purchase and may change with the tide, the weather and the season.',
          'If there is no availability on the chosen date, we will let you know and you choose between a new date or a full refund.',
          'Under-18s must be accompanied by a responsible adult.',
        ],
      },
      {
        titulo: '4. Prices and payment',
        paragrafos: [
          'Prices are in Brazilian reais (R$) and state whether they are per person, per vehicle or per boat. The total is shown before payment.',
          'Payment is always for the full amount of the booking, by Pix or credit card, processed by Pagar.me. Card details are sent directly to the payment processor and are not stored by us.',
          'Fees charged on site by third parties (such as municipal or boarding fees), food and optional extras are not included unless stated on the tour page.',
        ],
      },
      {
        titulo: '5. Cancellations, date changes and refunds',
        paragrafos: [
          'The rules are set out in the Cancellation and Refund Policy, which is part of these terms. In short: full refund 24 hours or more in advance; in case of rain, bad weather or sea conditions, a full refund or a new date, your choice; and a 7-day withdrawal right for online purchases (article 49 of the Consumer Protection Code).',
        ],
      },
      {
        titulo: '6. Safety during the tours',
        paragrafos: ['For everyone’s safety:'],
        lista: [
          'follow the instructions of the crew, guide or driver;',
          'wear a life jacket, helmet and other equipment when asked;',
          'to ride a quad bike you need a driving licence and must not have drunk alcohol;',
          'tell us before booking about any relevant health condition (for example pregnancy, heart or breathing problems, especially for diving and flights);',
          'the operator may refuse boarding to anyone putting their own or others’ safety at risk.',
        ],
      },
      {
        titulo: '7. Tour + stay packages',
        paragrafos: [
          'Packages with accommodation are sold on request by email. Price, conditions and cancellation rules are sent in writing in the quote, before any payment.',
        ],
      },
      {
        titulo: '8. Use of the website',
        paragrafos: [
          'You agree to use the website in good faith, without attempting payment fraud, accessing restricted areas or disrupting the service.',
          'Texts, illustrations, logos and other content on the website belong to the agency or are used with permission, and may not be copied for commercial purposes without authorisation.',
        ],
      },
      {
        titulo: '9. Privacy',
        paragrafos: [
          'We process your personal data in accordance with the Brazilian General Data Protection Law (Law 13,709/2018), as described in our Privacy Policy.',
        ],
      },
      {
        titulo: '10. Changes',
        paragrafos: [
          'We may update these terms. The version that applies to your booking is the one published on the website on the purchase date.',
        ],
      },
      {
        titulo: '11. Governing law and jurisdiction',
        paragrafos: [
          'These terms are governed by Brazilian law, in particular the Consumer Protection Code. Any dispute will be settled in the courts of the consumer’s place of residence. Before that, talk to us: most issues are solved quickly on WhatsApp or by email.',
        ],
      },
    ],
  },
  es: {
    titulo: 'Términos de Uso',
    resumo: `Estas son las reglas para usar el sitio ${E.dominio} y comprar paseos con ${E.marca}. Al hacer una reserva, declarás que las leíste y que estás de acuerdo.`,
    secoes: [
      {
        titulo: '1. Quiénes somos',
        paragrafos: [
          `El sitio ${E.dominio} es operado por ${E.marca}, inscripta en el CNPJ con el nº ${E.cnpj}, con sede en ${E.cidade} – ${E.uf}, Brasil.`,
          `Contacto: e-mail ${E.email}. Después de la reserva, también te atendemos por WhatsApp.`,
        ],
      },
      {
        titulo: '2. Qué vendemos',
        paragrafos: [
          'Somos una agencia de turismo que vende por internet paseos en Búzios, Cabo Frio, Arraial do Cabo y la región, realizados por operadores locales asociados (dueños de las embarcaciones, vehículos y equipos).',
          'Nos ocupamos de la venta, la atención, la emisión del voucher y los reembolsos. El paseo lo realiza el operador asociado. Frente a vos, respondemos según el Código de Defensa del Consumidor de Brasil.',
        ],
      },
      {
        titulo: '3. Reserva y confirmación',
        paragrafos: [
          'La reserva se confirma cuando se aprueba el pago. En ese momento emitimos un voucher con número único, que es tu comprobante.',
        ],
        lista: [
          'Sos responsable de informar datos correctos (nombre, contacto, documento, fecha, cantidad de personas y alojamiento).',
          'El horario de salida y el punto de encuentro se confirman por WhatsApp después de la compra y pueden variar según la marea, el clima y la temporada.',
          'Si no hay disponibilidad en la fecha elegida, te avisamos y elegís entre una nueva fecha o el reembolso total.',
          'Los menores de 18 años deben estar acompañados por un adulto responsable.',
        ],
      },
      {
        titulo: '4. Precios y pago',
        paragrafos: [
          'Los precios están en reales (R$) e indican si son por persona, por vehículo o por embarcación. El total aparece antes del pago.',
          'El pago es siempre por el valor total de la reserva, con Pix o tarjeta de crédito, procesado por Pagar.me. Los datos de la tarjeta se envían directamente al procesador y no quedan guardados con nosotros.',
          'Las tasas cobradas en el lugar por terceros (como tasas municipales o de embarque), las comidas y los opcionales no están incluidos, salvo que la página del paseo lo indique.',
        ],
      },
      {
        titulo: '5. Cancelación, cambio de fecha y reembolso',
        paragrafos: [
          'Las reglas están en la Política de Cancelación y Reembolso, que forma parte de estos términos. En resumen: reembolso total con 24 horas o más de anticipación; en caso de lluvia, mal tiempo o condiciones del mar, reembolso total o nueva fecha, a tu elección; y derecho de arrepentimiento de 7 días para compras online (art. 49 del Código de Defensa del Consumidor).',
        ],
      },
      {
        titulo: '6. Seguridad durante los paseos',
        paragrafos: ['Para la seguridad de todos:'],
        lista: [
          'seguí las indicaciones de la tripulación, del guía o del conductor;',
          'usá chaleco salvavidas, casco y demás equipos cuando se te pida;',
          'para manejar un cuatriciclo necesitás licencia de conducir y no haber tomado alcohol;',
          'informanos antes de reservar cualquier condición de salud relevante (por ejemplo embarazo, problemas cardíacos o respiratorios, sobre todo para buceo y vuelo);',
          'el operador puede negar el embarque a quien ponga en riesgo su seguridad o la de los demás.',
        ],
      },
      {
        titulo: '7. Paquetes de paseo + alojamiento',
        paragrafos: [
          'Los paquetes con alojamiento se venden a consulta, por e-mail. Precio, condiciones y reglas de cancelación se envían por escrito en el presupuesto, antes de cualquier pago.',
        ],
      },
      {
        titulo: '8. Uso del sitio',
        paragrafos: [
          'Te comprometés a usar el sitio de buena fe, sin intentar fraudes en los pagos, acceder a áreas restringidas ni perjudicar el funcionamiento del servicio.',
          'Los textos, ilustraciones, logotipos y demás contenidos del sitio pertenecen a la agencia o se usan con autorización, y no pueden copiarse con fines comerciales sin permiso.',
        ],
      },
      {
        titulo: '9. Privacidad',
        paragrafos: [
          'El tratamiento de tus datos personales sigue la Ley General de Protección de Datos de Brasil (Ley 13.709/2018) y se describe en nuestra Política de Privacidad.',
        ],
      },
      {
        titulo: '10. Cambios',
        paragrafos: [
          'Podemos actualizar estos términos. La versión válida para tu reserva es la publicada en el sitio en la fecha de compra.',
        ],
      },
      {
        titulo: '11. Ley aplicable y jurisdicción',
        paragrafos: [
          'Estos términos se rigen por la legislación brasileña, en especial el Código de Defensa del Consumidor. Cualquier conflicto se resolverá en los tribunales del domicilio del consumidor. Antes de eso, escribinos: la mayoría de las cuestiones se resuelven rápido por WhatsApp o por e-mail.',
        ],
      },
    ],
  },
};
