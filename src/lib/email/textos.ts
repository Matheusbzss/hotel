import type { Idioma } from '../../i18n/config';

/**
 * Os textos dos e-mails automáticos (Etapa 6), nos quatro idiomas, fora dos dicionários do site (src/i18n) para
 * os e-mails mudarem sem mexer nas telas. Quem monta cada e-mail é src/lib/email/mensagens.ts; os marcadores
 * ({nome}, {codigo}, {site}, {email}) são trocados por fmt (src/i18n/config.ts) e o teste confere que nenhum sobra.
 *
 * O espanhol neutro ('es', com "tú") é a base do argentino ('es-ar', com "vos"): o 'es-ar' copia o 'es' e troca só
 * as frases em que o verbo muda (ES_AR, no fim). tests/es-ar.test.ts confere cada par com a regra de
 * tests/ajuda/regra-neutra.ts e conta quantas frases têm versão argentina.
 *
 * Regras de sempre: frases curtas, sem urgência falsa, sem "promoção"; nada de razão social, número da empresa nem
 * endereço (esses só no rodapé do site, nos termos e na privacidade); o WhatsApp da equipe só no e-mail do
 * pagamento aprovado (mostrarWhatsApp, src/lib/formas-pagamento.ts).
 */
export interface TextosEmail {
  comum: {
    /** "Olá, {nome}." */
    ola: string;
    /** A saudação quando o nome digitado não serve para ela (vazio, com número, link ou sinal). */
    olaSemNome: string;
    codigoPedido: string;
    voucher: string;
    verVoucher: string;
    baixarPdf: string;
    abrirPedido: string;
    /** Embaixo do botão, para quando o botão não abre. */
    linkAlternativo: string;
    duvidas: string;
    /** O motivo do e-mail, no rodapé. {site} é o domínio. */
    rodapeMotivo: string;
    totalPago: string;
    totalNoPix: string;
    totalNoCartao: string;
    /** O nome da forma de pagamento ao lado do total pago. */
    formaPix: string;
    formaCartao: string;
  };
  pedidoRecebido: {
    /** {codigo} é o código do pedido. */
    assunto: string;
    preCabecalho: string;
    titulo: string;
    /** O pedido que termina pelo WhatsApp (o pagamento online desligado). */
    textoWhatsapp: string;
    /** O pedido que espera o pagamento online (cartão ou Pix pela Stripe). */
    textoOnline: string;
    notaOnline: string;
    itens: string;
  };
  pagamentoAprovado: {
    assunto: string;
    preCabecalho: string;
    titulo: string;
    texto: string;
    vouchers: string;
    anexos: string;
    whatsapp: string;
    botaoWhatsapp: string;
  };
  pixVencido: {
    assunto: string;
    preCabecalho: string;
    titulo: string;
    texto: string;
    convite: string;
    botao: string;
  };
  linkDoPedido: {
    assunto: string;
    preCabecalho: string;
    titulo: string;
    texto: string;
    nota: string;
  };
  /** A confirmação do pedido de desistência pelo site (Decreto 7.962/2013, art. 5º, § 4º). */
  desistencia: {
    assunto: string;
    preCabecalho: string;
    titulo: string;
    /** {quando} é a data e a hora do pedido de desistência, no horário de Brasília. */
    recebido: string;
    /** O que acontece agora: a resposta em até 1 dia útil, os 7 dias com reembolso integral, a política. */
    agora: string;
    /** "Se não foi você, responda a este e-mail": a resposta vai para a equipe. */
    naoFoiVoce: string;
    itens: string;
  };
  lembrete: {
    assunto1: string;
    preCabecalho1: string;
    titulo1: string;
    texto1: string;
    assunto2: string;
    preCabecalho2: string;
    titulo2: string;
    texto2: string;
    botao: string;
    nota: string;
    /** Para quem comprou por outro carrinho (outro navegador): o lembrete não pede nada. */
    jaReservou: string;
    noPix: string;
    noCartao: string;
    /** Por que a pessoa recebeu o lembrete. {site} é o domínio. */
    motivo: string;
    /** O link de sair da lista, no rodapé. */
    sair: string;
  };
}

const PT: TextosEmail = {
  comum: {
    ola: 'Olá, {nome}.',
    olaSemNome: 'Olá.',
    codigoPedido: 'Código do pedido',
    voucher: 'Voucher',
    verVoucher: 'Ver o voucher',
    baixarPdf: 'Baixar o PDF',
    abrirPedido: 'Abrir o meu pedido',
    linkAlternativo: 'Se o botão não abrir, cole este endereço no navegador:',
    duvidas: 'Dúvidas? É só responder a este e-mail.',
    rodapeMotivo: 'Você recebeu este e-mail porque fez um pedido em {site}.',
    totalPago: 'Total pago',
    totalNoPix: 'Total no Pix',
    totalNoCartao: 'Total no cartão',
    formaPix: 'Pix',
    formaCartao: 'cartão',
  },
  pedidoRecebido: {
    assunto: 'Recebemos o seu pedido {codigo}',
    preCabecalho: 'O pedido está registrado. Abaixo está o link para acompanhar.',
    titulo: 'Recebemos o seu pedido',
    textoWhatsapp:
      'O pedido está registrado. Para finalizar o pagamento, abra o pedido e fale com a nossa equipe pelo WhatsApp: o botão está na página do pedido.',
    textoOnline: 'O pedido está registrado. Quando o pagamento for confirmado, você recebe outro e-mail com os vouchers.',
    notaOnline: 'Se o pagamento não foi concluído, abra o pedido para pagar.',
    itens: 'O que você escolheu',
  },
  pagamentoAprovado: {
    assunto: 'Pagamento aprovado: pedido {codigo}',
    preCabecalho: 'Seus vouchers estão prontos.',
    titulo: 'Pagamento aprovado',
    texto: 'Recebemos o pagamento do pedido. Cada item do pedido tem o seu próprio voucher: mostre no dia, no celular ou impresso.',
    vouchers: 'Seus vouchers',
    anexos: 'Os vouchers em PDF vão anexados a este e-mail.',
    whatsapp: 'Para combinar os detalhes, fale com a equipe pelo WhatsApp.',
    botaoWhatsapp: 'Falar com a equipe no WhatsApp',
  },
  pixVencido: {
    assunto: 'O Pix do pedido {codigo} venceu',
    preCabecalho: 'Nada foi cobrado. Você pode pagar de novo pelo pedido.',
    titulo: 'O Pix venceu sem pagamento',
    texto: 'O código Pix do pedido venceu antes do pagamento. Nada foi cobrado.',
    convite: 'Se ainda quiser fazer a reserva, abra o pedido e pague de novo.',
    botao: 'Pagar de novo',
  },
  linkDoPedido: {
    assunto: 'O link do seu pedido {codigo}',
    preCabecalho: 'Com este link você vê o pedido e os vouchers.',
    titulo: 'O link do seu pedido',
    texto: 'Você pediu o link do seu pedido no site. Com ele você vê o pedido, os vouchers e o pagamento.',
    nota: 'Se não foi você, não precisa fazer nada: sem este link, ninguém abre o pedido.',
  },
  desistencia: {
    assunto: 'Recebemos o seu pedido de desistência: pedido {codigo}',
    preCabecalho: 'Este e-mail confirma que o seu pedido de desistência chegou.',
    titulo: 'Recebemos o seu pedido de desistência',
    recebido:
      'O seu pedido de desistência da compra chegou em {quando} (horário de Brasília). Guarde este e-mail: ele é a confirmação do recebimento.',
    agora:
      'O que acontece agora: a equipe responde por e-mail em até 1 dia útil. Se a compra foi feita há até 7 dias e o serviço ainda não começou, o reembolso é integral, pela mesma forma de pagamento. Fora disso, vale a política de cancelamento.',
    naoFoiVoce: 'Se não foi você que pediu a desistência, responda a este e-mail.',
    itens: 'O pedido',
  },
  lembrete: {
    assunto1: 'Seu carrinho está guardado',
    preCabecalho1: 'Está tudo guardado, do jeito que você deixou.',
    titulo1: 'Seu carrinho está guardado',
    texto1: 'O que você escolheu continua no carrinho. Para reservar, é só voltar e concluir a compra.',
    assunto2: 'Ficou alguma dúvida?',
    preCabecalho2: 'Seu carrinho continua guardado.',
    titulo2: 'Ficou alguma dúvida?',
    texto2:
      'Se ficou alguma dúvida sobre a reserva, os horários ou o pagamento, é só responder a este e-mail. O carrinho continua guardado.',
    botao: 'Voltar ao carrinho',
    nota: 'Os preços e os horários são conferidos de novo quando você volta ao carrinho.',
    jaReservou: 'Se você já fez a reserva, pode ignorar este e-mail.',
    noPix: 'no Pix',
    noCartao: 'no cartão',
    motivo: 'Você recebeu este lembrete porque digitou este e-mail no checkout de {site}.',
    sair: 'Não quero mais receber lembretes do carrinho',
  },
};

const EN: TextosEmail = {
  comum: {
    ola: 'Hi {nome},',
    olaSemNome: 'Hello,',
    codigoPedido: 'Order code',
    voucher: 'Voucher',
    verVoucher: 'View voucher',
    baixarPdf: 'Download PDF',
    abrirPedido: 'Open my order',
    linkAlternativo: "If the button doesn't open, paste this address into your browser:",
    duvidas: 'Questions? Just reply to this email.',
    rodapeMotivo: 'You received this email because you placed an order on {site}.',
    totalPago: 'Total paid',
    totalNoPix: 'Total with Pix',
    totalNoCartao: 'Total by card',
    formaPix: 'Pix',
    formaCartao: 'card',
  },
  pedidoRecebido: {
    assunto: 'We received your order {codigo}',
    preCabecalho: 'Your order is registered. The link to follow it is below.',
    titulo: 'We received your order',
    textoWhatsapp:
      'Your order is registered. To complete the payment, open your order and talk to our team on WhatsApp: the button is on the order page.',
    textoOnline: 'Your order is registered. Once the payment is confirmed, you will get another email with your vouchers.',
    notaOnline: 'If the payment was not completed, open your order to pay.',
    itens: 'What you chose',
  },
  pagamentoAprovado: {
    assunto: 'Payment approved: order {codigo}',
    preCabecalho: 'Your vouchers are ready.',
    titulo: 'Payment approved',
    texto:
      'We received the payment for your order. Each item in your order has its own voucher: show it on the day, on your phone or printed.',
    vouchers: 'Your vouchers',
    anexos: 'Your vouchers are attached to this email as PDF files.',
    whatsapp: 'To arrange the details, talk to the team on WhatsApp.',
    botaoWhatsapp: 'Talk to the team on WhatsApp',
  },
  pixVencido: {
    assunto: 'The Pix for order {codigo} expired',
    preCabecalho: 'Nothing was charged. You can pay again from your order.',
    titulo: 'The Pix expired without payment',
    texto: 'The Pix code for your order expired before the payment. Nothing was charged.',
    convite: 'If you still want to book, open your order and pay again.',
    botao: 'Pay again',
  },
  linkDoPedido: {
    assunto: 'The link to your order {codigo}',
    preCabecalho: 'With this link you can see your order and your vouchers.',
    titulo: 'The link to your order',
    texto: 'You asked for the link to your order on our website. With it you can see your order, your vouchers and the payment.',
    nota: "If it wasn't you, you don't need to do anything: without this link, nobody can open the order.",
  },
  desistencia: {
    assunto: 'We received your cancellation request: order {codigo}',
    preCabecalho: 'This email confirms that your cancellation request has arrived.',
    titulo: 'We received your cancellation request',
    recebido:
      'Your request to cancel this purchase arrived on {quando} (Brasília time). Please keep this email: it confirms that we received it.',
    agora:
      'What happens next: our team will reply by email within 1 business day. If you bought within the last 7 days and the service has not started, you get a full refund to the same payment method. Otherwise, the cancellation policy applies.',
    naoFoiVoce: 'If you did not ask to cancel this purchase, reply to this email.',
    itens: 'Your order',
  },
  lembrete: {
    assunto1: 'Your cart is saved',
    preCabecalho1: 'Everything is saved, just as you left it.',
    titulo1: 'Your cart is saved',
    texto1: 'What you chose is still in your cart. To book, just come back and complete your purchase.',
    assunto2: 'Any questions?',
    preCabecalho2: 'Your cart is still saved.',
    titulo2: 'Any questions?',
    texto2: 'If you have any questions about the booking, the times or the payment, just reply to this email. Your cart is still saved.',
    botao: 'Back to my cart',
    nota: 'Prices and times are checked again when you come back to your cart.',
    jaReservou: 'If you have already booked, you can ignore this email.',
    noPix: 'with Pix',
    noCartao: 'by card',
    motivo: 'You received this reminder because you entered this email at checkout on {site}.',
    sair: "I don't want cart reminders anymore",
  },
};

/** Espanhol neutro, com "tú" (Chile e os demais países). */
const ES: TextosEmail = {
  comum: {
    ola: 'Hola, {nome}.',
    olaSemNome: 'Hola.',
    codigoPedido: 'Código del pedido',
    voucher: 'Voucher',
    verVoucher: 'Ver el voucher',
    baixarPdf: 'Descargar el PDF',
    abrirPedido: 'Abrir mi pedido',
    linkAlternativo: 'Si el botón no abre, pega esta dirección en el navegador:',
    duvidas: '¿Tienes dudas? Solo tienes que responder este e-mail.',
    rodapeMotivo: 'Recibes este e-mail porque hiciste un pedido en {site}.',
    totalPago: 'Total pagado',
    totalNoPix: 'Total con Pix',
    totalNoCartao: 'Total con tarjeta',
    formaPix: 'Pix',
    formaCartao: 'tarjeta',
  },
  pedidoRecebido: {
    assunto: 'Recibimos tu pedido {codigo}',
    preCabecalho: 'El pedido está registrado. Abajo tienes el enlace para seguirlo.',
    titulo: 'Recibimos tu pedido',
    textoWhatsapp:
      'El pedido está registrado. Para terminar el pago, abre el pedido y habla con nuestro equipo por WhatsApp: el botón está en la página del pedido.',
    textoOnline: 'El pedido está registrado. Cuando se confirme el pago, recibes otro e-mail con los vouchers.',
    notaOnline: 'Si el pago no se completó, abre el pedido para pagar.',
    itens: 'Lo que elegiste',
  },
  pagamentoAprovado: {
    assunto: 'Pago aprobado: pedido {codigo}',
    preCabecalho: 'Tus vouchers están listos.',
    titulo: 'Pago aprobado',
    texto:
      'Recibimos el pago del pedido. Cada ítem del pedido tiene su propio voucher: muéstralo el día del servicio, en el celular o impreso.',
    vouchers: 'Tus vouchers',
    anexos: 'Los vouchers en PDF van adjuntos a este e-mail.',
    whatsapp: 'Para coordinar los detalles, habla con el equipo por WhatsApp.',
    botaoWhatsapp: 'Hablar con el equipo por WhatsApp',
  },
  pixVencido: {
    assunto: 'El Pix del pedido {codigo} venció',
    preCabecalho: 'No se cobró nada. Puedes pagar de nuevo desde el pedido.',
    titulo: 'El Pix venció sin pago',
    texto: 'El código Pix del pedido venció antes del pago. No se cobró nada.',
    convite: 'Si todavía quieres reservar, abre el pedido y paga de nuevo.',
    botao: 'Pagar de nuevo',
  },
  linkDoPedido: {
    assunto: 'El enlace de tu pedido {codigo}',
    preCabecalho: 'Con este enlace ves el pedido y los vouchers.',
    titulo: 'El enlace de tu pedido',
    texto: 'Pediste el enlace de tu pedido en el sitio. Con él ves el pedido, los vouchers y el pago.',
    nota: 'Si no fuiste tú, no hace falta hacer nada: sin este enlace, nadie abre el pedido.',
  },
  desistencia: {
    assunto: 'Recibimos tu pedido de desistimiento: pedido {codigo}',
    preCabecalho: 'Este e-mail confirma que tu pedido de desistimiento llegó.',
    titulo: 'Recibimos tu pedido de desistimiento',
    recebido:
      'Tu pedido de desistimiento de la compra llegó el {quando} (hora de Brasilia). Guarda este e-mail: es la confirmación de que lo recibimos.',
    agora:
      'Qué pasa ahora: el equipo responde por e-mail en un plazo máximo de 1 día hábil. Si la compra se hizo hace 7 días o menos y el servicio todavía no empezó, el reembolso es total, por el mismo medio de pago. Si no, rige la política de cancelación.',
    naoFoiVoce: 'Si no fuiste tú quien pidió el desistimiento, escríbenos respondiendo este e-mail.',
    itens: 'Tu pedido',
  },
  lembrete: {
    assunto1: 'Tu carrito sigue guardado',
    preCabecalho1: 'Está todo guardado, tal como lo dejaste.',
    titulo1: 'Tu carrito sigue guardado',
    texto1: 'Lo que elegiste sigue en el carrito. Para reservar, solo tienes que volver y completar la compra.',
    assunto2: '¿Te quedó alguna duda?',
    preCabecalho2: 'Tu carrito sigue guardado.',
    titulo2: '¿Te quedó alguna duda?',
    texto2:
      'Si te quedó alguna duda sobre la reserva, los horarios o el pago, escríbenos respondiendo este e-mail. El carrito sigue guardado.',
    botao: 'Volver al carrito',
    nota: 'Los precios y los horarios se confirman de nuevo al volver al carrito.',
    jaReservou: 'Si ya hiciste la reserva, puedes ignorar este e-mail.',
    noPix: 'con Pix',
    noCartao: 'con tarjeta',
    motivo: 'Recibes este recordatorio porque escribiste este e-mail en el checkout de {site}.',
    sair: 'No quiero recibir más recordatorios del carrito',
  },
};

/** Espanhol da Argentina, com "vos": o neutro com as frases em que o verbo muda. */
const ES_AR: TextosEmail = {
  comum: {
    ...ES.comum,
    linkAlternativo: 'Si el botón no abre, pegá esta dirección en el navegador:',
    duvidas: '¿Tenés dudas? Solo tenés que responder este e-mail.',
    rodapeMotivo: 'Recibís este e-mail porque hiciste un pedido en {site}.',
  },
  pedidoRecebido: {
    ...ES.pedidoRecebido,
    preCabecalho: 'El pedido está registrado. Abajo tenés el enlace para seguirlo.',
    textoWhatsapp:
      'El pedido está registrado. Para terminar el pago, abrí el pedido y hablá con nuestro equipo por WhatsApp: el botón está en la página del pedido.',
    textoOnline: 'El pedido está registrado. Cuando se confirme el pago, recibís otro e-mail con los vouchers.',
    notaOnline: 'Si el pago no se completó, abrí el pedido para pagar.',
  },
  pagamentoAprovado: {
    ...ES.pagamentoAprovado,
    texto:
      'Recibimos el pago del pedido. Cada ítem del pedido tiene su propio voucher: mostralo el día del servicio, en el celular o impreso.',
    whatsapp: 'Para coordinar los detalles, hablá con el equipo por WhatsApp.',
  },
  pixVencido: {
    ...ES.pixVencido,
    preCabecalho: 'No se cobró nada. Podés pagar de nuevo desde el pedido.',
    convite: 'Si todavía querés reservar, abrí el pedido y pagá de nuevo.',
  },
  linkDoPedido: {
    ...ES.linkDoPedido,
    nota: 'Si no fuiste vos, no hace falta hacer nada: sin este enlace, nadie abre el pedido.',
  },
  desistencia: {
    ...ES.desistencia,
    recebido:
      'Tu pedido de desistimiento de la compra llegó el {quando} (hora de Brasilia). Guardá este e-mail: es la confirmación de que lo recibimos.',
    naoFoiVoce: 'Si no fuiste vos quien pidió el desistimiento, escribinos respondiendo este e-mail.',
  },
  lembrete: {
    ...ES.lembrete,
    jaReservou: 'Si ya hiciste la reserva, podés ignorar este e-mail.',
    texto1: 'Lo que elegiste sigue en el carrito. Para reservar, solo tenés que volver y completar la compra.',
    texto2:
      'Si te quedó alguna duda sobre la reserva, los horarios o el pago, escribinos respondiendo este e-mail. El carrito sigue guardado.',
    motivo: 'Recibís este recordatorio porque escribiste este e-mail en el checkout de {site}.',
  },
};

export const TEXTOS_EMAIL: Record<Idioma, TextosEmail> = { pt: PT, en: EN, es: ES, 'es-ar': ES_AR };

export const textosEmail = (idioma: Idioma): TextosEmail => TEXTOS_EMAIL[idioma];
