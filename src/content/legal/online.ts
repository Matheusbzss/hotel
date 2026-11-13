import { EMPRESA } from '../../config/empresa.ts';
import { DESCONTO_PIX_PORCENTO } from '../../config/precos.ts';
import type { IdiomaConteudo, Traduzido } from '../../i18n/conteudo.ts';
import { comAjustesAR, type ParAR } from './argentino.ts';
import { AJUSTES_AR_CANCELAMENTO, CANCELAMENTO } from './cancelamento.ts';
import { comMudancas, paresQueFicam, type MudancasDoDocumento } from './mudancas.ts';
import { AJUSTES_AR_PRIVACIDADE, PRIVACIDADE } from './privacidade.ts';
import { AJUSTES_AR_TERMOS, TERMOS } from './termos.ts';
import { ATUALIZADO_EM, type DocumentoLegal } from './tipos.ts';

/**
 * A versão dos textos legais para quando o pagamento online estiver no ar para o público (PAGAMENTO_ONLINE=publico):
 * cartão e Pix pela Stripe, no próprio site. Fica escrita como diferença sobre o texto de hoje (comMudancas): o que
 * não está aqui continua igual, palavra por palavra. Base: material-recebido/TEXTOS-ETAPAS-4-E-5.md, escrito para o
 * Pix manual com comprovante, adaptado ao Pix pela Stripe (sem comprovante; a Stripe confirma sozinha; QR de 30
 * minutos; Pix até 2 horas antes do primeiro serviço; cartão até 30 minutos antes num pedido já feito; reembolso pela
 * Stripe). As páginas legais são estáticas: a versão é escolhida no build (textosLegais), e o dono liga com um deploy.
 *
 * Os nomes da Stripe ficam no texto: o recebedor do Pix no app do banco ainda não foi conferido numa conta brasileira
 * (a documentação da Stripe só fala da EBANX no Pix pela Link, de empresas dos EUA), então o texto diz que o nome
 * "pode aparecer" e dá a EBANX como exemplo. Conferir no Pix de teste e ajustar.
 */

const E = EMPRESA;
const P = DESCONTO_PIX_PORCENTO;

/** A data da versão do pagamento online, que a página mostra em "Atualizado em": troque para o dia de ligar. */
export const ATUALIZADO_EM_ONLINE = '2026-11-13';

/* ------------------------------------------------------------------ */
/* Termos de uso: o pagamento, a seção nova do Pix e o contato        */

const MUDANCAS_TERMOS: Record<IdiomaConteudo, MudancasDoDocumento> = {
  pt: {
    trocas: [
      [
        `Contato: e-mail ${E.email}. Depois da reserva, o atendimento também é feito pelo WhatsApp.`,
        `Contato: e-mail ${E.email}. Depois do pagamento confirmado, o atendimento também é feito pelo WhatsApp.`,
      ],
      [
        'A reserva é confirmada quando o pagamento é aprovado. Nesse momento emitimos um voucher com número único, que é o seu comprovante.',
        'A reserva é confirmada quando o pagamento é aprovado: no cartão, quando a operadora aprova; no Pix, quando o banco confirma o pagamento, o que costuma levar poucos segundos. Nesse momento emitimos um voucher para cada item do pedido, com número único, que é o seu comprovante.',
      ],
      [
        'O pagamento é do valor total da reserva, por Pix ou cartão de crédito (nas casas de temporada, vale o item 7). Enquanto o pagamento online é ativado, você registra a reserva no site e finaliza o pagamento com a nossa equipe pelo WhatsApp. O site não guarda os dados do seu cartão.',
        `Nos passeios e no transfer, o pagamento é sempre do valor total, por cartão (crédito ou débito) ou Pix, aqui mesmo no site (nas casas de temporada, vale o item 8). No Pix, o preço tem ${P}% de desconto sobre o preço no cartão. Cartão e Pix são processados pela Stripe: os dados do cartão vão direto para ela e não ficam guardados conosco.`,
      ],
      [
        'Estes termos seguem a legislação brasileira, em especial o Código de Defesa do Consumidor. Fica eleito o foro do domicílio do consumidor para resolver eventuais conflitos. Antes disso, fale com a gente: a maioria das questões se resolve rapidamente pelo WhatsApp ou por e-mail.',
        'Estes termos seguem a legislação brasileira, em especial o Código de Defesa do Consumidor. Fica eleito o foro do domicílio do consumidor para resolver eventuais conflitos. Antes disso, fale com a gente: a maioria das questões se resolve rapidamente por e-mail ou, depois do pagamento, pelo WhatsApp.',
      ],
    ],
    secoes: [
      [
        '4. Preços e pagamento',
        {
          titulo: '5. Pagamento por Pix',
          paragrafos: ['No pagamento por Pix, valem estas regras:'],
          lista: [
            'Prazo: o Pix vale até 2 horas antes do início do primeiro serviço do pedido (passeio, transfer ou entrada na casa). Depois disso, só cartão: um pedido já feito pode ser pago com cartão até 30 minutos antes do primeiro serviço.',
            'Código: o QR Code e o código copia e cola valem por 30 minutos, ou menos, quando o prazo do Pix termina antes. Se o código vencer sem pagamento, nada é cobrado, e dá para gerar outro na página do pedido enquanto o prazo permitir.',
            'Confirmação: é automática. A Stripe avisa o site assim que o banco confirma o pagamento, sem precisar de comprovante, e o voucher sai nesse momento.',
            'Recebedor: no app do seu banco, o Pix pode aparecer em nome da empresa que processa o pagamento para a Stripe (como a EBANX), e não em nome da Orla Nativa.',
            'Limite: um Pix tem um valor máximo por pagamento, o equivalente a US$ 3.000,00 em reais. Por segurança, num pedido perto desse valor ou acima dele, o site oferece só o cartão.',
            'Reembolso: o que tiver de ser devolvido volta pela Stripe para a conta de onde o Pix saiu. Depois de 90 dias do pagamento, a Stripe não devolve mais por Pix: nesse caso, devolvemos por transferência para uma conta que você indicar.',
          ],
        },
      ],
    ],
  },
  en: {
    trocas: [
      [
        `Contact: email ${E.email}. After booking, we also assist you on WhatsApp.`,
        `Contact: email ${E.email}. Once your payment is confirmed, we also assist you on WhatsApp.`,
      ],
      [
        'Your booking is confirmed when the payment is approved. At that moment we issue a voucher with a unique number, which is your proof of purchase.',
        'Your booking is confirmed when the payment is approved: by card, when the card issuer approves it; by Pix, when the bank confirms the payment, which usually takes a few seconds. At that moment we issue a voucher for each item in your order, with a unique number, which is your proof of purchase.',
      ],
      [
        'Payment is for the full amount of the booking, by Pix or credit card (for holiday homes, see item 7). While online payment is being activated, you register the booking on the website and complete the payment with our team on WhatsApp. The website does not store your card details.',
        `For tours and transfers, payment is always for the full amount, by card (credit or debit) or Pix, right here on the website (for holiday homes, see item 8). With Pix, the price is ${P}% lower than the card price. Card and Pix payments are processed by Stripe: your card details go straight to Stripe and are not stored by us.`,
      ],
      [
        'These terms are governed by Brazilian law, in particular the Consumer Protection Code. Any dispute will be settled in the courts of the consumer’s place of residence. Before that, talk to us: most issues are solved quickly on WhatsApp or by email.',
        'These terms are governed by Brazilian law, in particular the Consumer Protection Code. Any dispute will be settled in the courts of the consumer’s place of residence. Before that, talk to us: most issues are solved quickly by email or, after payment, on WhatsApp.',
      ],
    ],
    secoes: [
      [
        '4. Prices and payment',
        {
          titulo: '5. Paying by Pix',
          paragrafos: ['These rules apply when you pay by Pix:'],
          lista: [
            'Deadline: Pix is available up to 2 hours before the first service in your order starts (tour, transfer or check-in at the home). After that, by card only: an order already placed can be paid by card up to 30 minutes before the first service.',
            'Code: the QR code and the copy-and-paste code are valid for 30 minutes, or less when the Pix deadline ends sooner. If the code expires unpaid, nothing is charged, and you can generate a new one on your order page while the deadline allows.',
            'Confirmation: it is automatic. Stripe tells the website as soon as the bank confirms the payment, with no receipt needed, and your voucher is issued at that moment.',
            'Recipient: in your bank app, the Pix may show the name of the company that processes the payment for Stripe (such as EBANX), not Orla Nativa.',
            'Limit: a Pix has a maximum amount per payment, the equivalent of US$ 3,000.00 in reais. To be safe, for orders close to or above that amount, the website offers card payment only.',
            'Refund: any amount to be returned goes back through Stripe to the account the Pix came from. More than 90 days after the payment, Stripe can no longer refund by Pix: in that case, we refund by bank transfer to an account you tell us.',
          ],
        },
      ],
    ],
  },
  es: {
    trocas: [
      [
        `Contacto: e-mail ${E.email}. Después de la reserva, también te atendemos por WhatsApp.`,
        `Contacto: e-mail ${E.email}. Después del pago confirmado, también te atendemos por WhatsApp.`,
      ],
      [
        'La reserva se confirma cuando se aprueba el pago. En ese momento emitimos un voucher con número único, que es tu comprobante.',
        'La reserva se confirma cuando se aprueba el pago: con tarjeta, cuando la emisora lo aprueba; con Pix, cuando el banco confirma el pago, lo que suele tardar unos segundos. En ese momento emitimos un voucher para cada ítem del pedido, con número único, que es tu comprobante.',
      ],
      [
        'El pago es por el valor total de la reserva, con Pix o tarjeta de crédito (en las casas de temporada, rige el punto 7). Mientras se activa el pago online, la reserva se registra en el sitio y el pago se completa con nuestro equipo por WhatsApp. El sitio no guarda los datos de tu tarjeta.',
        `En los paseos y traslados, el pago es siempre por el valor total, con tarjeta (de crédito o débito) o Pix, en el propio sitio (en las casas de temporada, rige el punto 8). Con Pix, el precio tiene un ${P}% de descuento sobre el precio con tarjeta. Los pagos con tarjeta y con Pix los procesa Stripe: los datos de la tarjeta van directo a Stripe y no quedan guardados con nosotros.`,
      ],
      [
        'Estos términos se rigen por la legislación brasileña, en especial el Código de Defensa del Consumidor. Cualquier conflicto se resolverá en los tribunales del domicilio del consumidor. Antes de eso, escríbenos: la mayoría de las cuestiones se resuelven rápido por WhatsApp o por e-mail.',
        'Estos términos se rigen por la legislación brasileña, en especial el Código de Defensa del Consumidor. Cualquier conflicto se resolverá en los tribunales del domicilio del consumidor. Antes de eso, escríbenos: la mayoría de las cuestiones se resuelven rápido por e-mail o, después del pago, por WhatsApp.',
      ],
    ],
    secoes: [
      [
        '4. Precios y pago',
        {
          titulo: '5. Pago con Pix',
          paragrafos: ['En el pago con Pix, valen estas reglas:'],
          lista: [
            'Plazo: el Pix vale hasta 2 horas antes del inicio del primer servicio del pedido (paseo, traslado o entrada a la casa). Después, solo con tarjeta: un pedido ya hecho se puede pagar con tarjeta hasta 30 minutos antes del primer servicio.',
            'Código: el código QR y el código copia y pega valen por 30 minutos, o menos, cuando el plazo del Pix termina antes. Si el código vence sin pago, no se cobra nada, y se puede generar otro en la página del pedido mientras el plazo lo permita.',
            'Confirmación: es automática. Stripe avisa al sitio apenas el banco confirma el pago, sin necesidad de comprobante, y el voucher sale en ese momento.',
            'Destinatario: en la app de tu banco, el Pix puede aparecer a nombre de la empresa que procesa el pago para Stripe (como EBANX), y no a nombre de Orla Nativa.',
            'Límite: un Pix tiene un monto máximo por pago, el equivalente a US$ 3.000,00 en reales. Por seguridad, en un pedido cercano a ese monto o superior, el sitio ofrece solo la tarjeta.',
            'Reembolso: lo que haya que devolver vuelve por Stripe a la cuenta de la que salió el Pix. Pasados 90 días del pago, Stripe ya no devuelve por Pix: en ese caso, devolvemos por transferencia a una cuenta que nos indiques.',
          ],
        },
      ],
    ],
  },
};

/** As frases novas dos Términos que têm "tú": a versão argentina, com "vos". */
const NOVOS_PARES_TERMOS: readonly ParAR[] = [
  [
    'Estos términos se rigen por la legislación brasileña, en especial el Código de Defensa del Consumidor. Cualquier conflicto se resolverá en los tribunales del domicilio del consumidor. Antes de eso, escríbenos: la mayoría de las cuestiones se resuelven rápido por e-mail o, después del pago, por WhatsApp.',
    'Estos términos se rigen por la legislación brasileña, en especial el Código de Defensa del Consumidor. Cualquier conflicto se resolverá en los tribunales del domicilio del consumidor. Antes de eso, escribinos: la mayoría de las cuestiones se resuelven rápido por e-mail o, después del pago, por WhatsApp.',
  ],
];

/* ------------------------------------------------------------------ */
/* Política de cancelamento: o reembolso pela Stripe, a desistência   */
/* pelo site e a seção nova dos pedidos pagos por Pix                 */

const MUDANCAS_CANCELAMENTO: Record<IdiomaConteudo, MudancasDoDocumento> = {
  pt: {
    trocas: [
      [
        `Esta política vale para todos os passeios e transfers comprados no site ${E.dominio}, operado por ${E.marca}, sediada em ${E.cidade} – ${E.uf}. O que ela diz sobre o passeio vale também para o transfer. As casas de temporada têm regras próprias (veja o item 10).`,
        `Esta política vale para todos os passeios e transfers comprados no site ${E.dominio}, operado por ${E.marca}, sediada em ${E.cidade} – ${E.uf}. O que ela diz sobre o passeio vale também para o transfer. As casas de temporada têm regras próprias (veja o item 11).`,
      ],
      [
        'Nesse caso, devolvemos imediatamente todos os valores pagos, com atualização monetária, desde que o serviço ainda não tenha acontecido. O pedido pode ser feito pelos mesmos canais usados na compra (veja o item 8).',
        'Nesse caso, devolvemos imediatamente todos os valores pagos, com atualização monetária, desde que o serviço ainda não tenha acontecido: pedimos o estorno à Stripe assim que o seu pedido de desistência chega. Você pode desistir pelo próprio site, no link “Desistir da compra” da página do pedido, ou pelos canais do item 8.',
      ],
      [
        'O reembolso é feito pelo mesmo meio de pagamento usado na compra, e o estorno é solicitado em até 2 (dois) dias úteis após a confirmação do cancelamento.',
        'O reembolso é feito pelo mesmo meio de pagamento usado na compra, pela Stripe, e o estorno é solicitado em até 2 (dois) dias úteis após a confirmação do cancelamento (no arrependimento do item 2, assim que o pedido chega).',
      ],
      [
        'Pix: o valor volta para a conta de origem, em geral no mesmo dia do estorno.',
        'Pix: o valor volta pela Stripe para a conta de onde o Pix saiu, em geral em poucos minutos. Depois de 90 dias do pagamento, a Stripe não devolve mais por Pix: nesse caso, devolvemos por transferência para uma conta que você indicar.',
      ],
      [
        'Cartão de crédito: o estorno é enviado à administradora do cartão e o crédito aparece na fatura conforme o prazo dela, normalmente em uma ou duas faturas.',
        'Cartão: o estorno é enviado à administradora do cartão, e o valor volta no prazo dela (no crédito, normalmente em uma ou duas faturas).',
      ],
    ],
    depois: [
      [
        'Confirmamos o recebimento do pedido pelo mesmo canal. O horário da sua mensagem é o que vale para contar a antecedência.',
        [
          'Para desistir da compra inteira, você também pode usar o link “Desistir da compra”, na página do pedido: a confirmação aparece na hora, na tela.',
        ],
      ],
    ],
    secoes: [
      [
        '9. Prazos e forma de reembolso',
        {
          titulo: '10. Pedidos pagos por Pix',
          paragrafos: ['Nos pedidos pagos por Pix, as regras acima valem do mesmo jeito, e também estas:'],
          lista: [
            'Prazo: o Pix só vale até 2 horas antes do início do primeiro serviço do pedido.',
            'Código vencido: se o QR Code vencer sem pagamento, nada é cobrado. O pedido continua guardado, e você pode pagar de novo na página do pedido enquanto houver prazo.',
            'Confirmação: é automática, pela Stripe, assim que o banco confirma o pagamento. Não é preciso mandar comprovante.',
            'Pagamento em dobro: se o mesmo pedido for pago duas vezes (por exemplo, em duas abas), o pagamento a mais volta pela Stripe para a conta de onde saiu, sem você precisar pedir.',
          ],
        },
      ],
    ],
  },
  en: {
    trocas: [
      [
        `This policy applies to all tours and transfers purchased on ${E.dominio}, operated by ${E.marca}, based in ${E.cidade} – ${E.uf}, Brazil. What it says about tours also applies to transfers. Holiday homes have their own rules (see item 10).`,
        `This policy applies to all tours and transfers purchased on ${E.dominio}, operated by ${E.marca}, based in ${E.cidade} – ${E.uf}, Brazil. What it says about tours also applies to transfers. Holiday homes have their own rules (see item 11).`,
      ],
      [
        'In that case we immediately refund everything you paid, adjusted for inflation, provided the service has not yet taken place. You can make the request through the same channels used for the purchase (see item 8).',
        'In that case we immediately refund everything you paid, adjusted for inflation, provided the service has not yet taken place: we request the refund from Stripe as soon as your withdrawal request arrives. You can withdraw on the website itself, with the “Cancel this purchase” link on your order page, or through the channels in item 8.',
      ],
      [
        'Refunds are made to the same payment method used for the purchase, and the refund is requested within 2 (two) business days after the cancellation is confirmed.',
        'Refunds are made to the same payment method used for the purchase, through Stripe, and the refund is requested within 2 (two) business days after the cancellation is confirmed (for a withdrawal under item 2, as soon as the request arrives).',
      ],
      [
        'Pix: the amount returns to the original account, usually on the same day the refund is issued.',
        'Pix: the amount goes back through Stripe to the account the Pix came from, usually within a few minutes. More than 90 days after the payment, Stripe can no longer refund by Pix: in that case, we refund by bank transfer to an account you tell us.',
      ],
      [
        'Credit card: the refund is sent to the card issuer and the credit shows on your statement according to their timing, usually within one or two statements.',
        'Card: the refund is sent to the card issuer, and the money comes back on their timing (for credit cards, usually within one or two statements).',
      ],
    ],
    depois: [
      [
        'We confirm receipt of your request through the same channel. The time of your message is what counts for the notice period.',
        [
          'To withdraw from the whole purchase, you can also use the “Cancel this purchase” link on your order page: the confirmation appears on screen straight away.',
        ],
      ],
    ],
    secoes: [
      [
        '9. Refund timing and method',
        {
          titulo: '10. Orders paid by Pix',
          paragrafos: ['For orders paid by Pix, the rules above apply in the same way, and so do these:'],
          lista: [
            'Deadline: Pix is only available up to 2 hours before the first service in your order starts.',
            'Expired code: if the QR code expires unpaid, nothing is charged. Your order stays saved, and you can pay again on your order page while there is still time.',
            'Confirmation: it is automatic, through Stripe, as soon as the bank confirms the payment. You do not need to send a receipt.',
            'Double payment: if the same order is paid twice (for example, in two tabs), the extra payment goes back through Stripe to the account it came from, without you having to ask.',
          ],
        },
      ],
    ],
  },
  es: {
    trocas: [
      [
        `Esta política se aplica a todos los paseos y traslados comprados en el sitio ${E.dominio}, operado por ${E.marca}, con sede en ${E.cidade} – ${E.uf}, Brasil. Lo que dice sobre el paseo vale también para el traslado. Las casas de temporada tienen reglas propias (ver el punto 10).`,
        `Esta política se aplica a todos los paseos y traslados comprados en el sitio ${E.dominio}, operado por ${E.marca}, con sede en ${E.cidade} – ${E.uf}, Brasil. Lo que dice sobre el paseo vale también para el traslado. Las casas de temporada tienen reglas propias (ver el punto 11).`,
      ],
      [
        'En ese caso devolvemos de inmediato todo lo que pagaste, con actualización monetaria, siempre que el servicio todavía no se haya realizado. El pedido se puede hacer por los mismos canales usados en la compra (ver el punto 8).',
        'En ese caso devolvemos de inmediato todo lo que pagaste, con actualización monetaria, siempre que el servicio todavía no se haya realizado: pedimos la devolución a Stripe apenas llega tu pedido de desistimiento. Se puede desistir en el propio sitio, con el enlace “Desistir de la compra” de la página del pedido, o por los canales del punto 8.',
      ],
      [
        'El reembolso se hace por el mismo medio de pago usado en la compra, y la devolución se solicita dentro de los 2 (dos) días hábiles siguientes a la confirmación de la cancelación.',
        'El reembolso se hace por el mismo medio de pago usado en la compra, por Stripe, y la devolución se solicita dentro de los 2 (dos) días hábiles siguientes a la confirmación de la cancelación (en el arrepentimiento del punto 2, apenas llega el pedido).',
      ],
      [
        'Pix: el valor vuelve a la cuenta de origen, en general el mismo día de la devolución.',
        'Pix: el valor vuelve por Stripe a la cuenta de la que salió el Pix, en general en pocos minutos. Pasados 90 días del pago, Stripe ya no devuelve por Pix: en ese caso, devolvemos por transferencia a una cuenta que nos indiques.',
      ],
      [
        'Tarjeta de crédito: la devolución se envía al banco emisor de la tarjeta y el crédito aparece en el estado de cuenta según sus plazos, normalmente en uno o dos estados de cuenta.',
        'Tarjeta: la devolución se envía al banco emisor de la tarjeta, y el valor vuelve según sus plazos (con tarjeta de crédito, normalmente en uno o dos estados de cuenta).',
      ],
    ],
    depois: [
      [
        'Confirmamos la recepción del pedido por el mismo canal. La hora de tu mensaje es la que cuenta para la anticipación.',
        [
          'Para desistir de toda la compra, también se puede usar el enlace “Desistir de la compra”, en la página del pedido: la confirmación aparece en el momento, en la pantalla.',
        ],
      ],
    ],
    secoes: [
      [
        '9. Plazos y forma de reembolso',
        {
          titulo: '10. Pedidos pagados con Pix',
          paragrafos: ['En los pedidos pagados con Pix, las reglas de arriba valen igual, y también estas:'],
          lista: [
            'Plazo: el Pix solo vale hasta 2 horas antes del inicio del primer servicio del pedido.',
            'Código vencido: si el código QR vence sin pago, no se cobra nada. El pedido queda guardado, y se puede pagar de nuevo en la página del pedido mientras haya plazo.',
            'Confirmación: es automática, por Stripe, apenas el banco confirma el pago. No hace falta enviar comprobante.',
            'Pago doble: si el mismo pedido se paga dos veces (por ejemplo, en dos pestañas), el pago de más vuelve por Stripe a la cuenta de la que salió, sin necesidad de pedirlo.',
          ],
        },
      ],
    ],
  },
};

/** As frases novas da Política de Cancelación com palavra argentina: o resumen da tarjeta (no neutro, estado de cuenta). */
const NOVOS_PARES_CANCELAMENTO: readonly ParAR[] = [
  [
    'Tarjeta: la devolución se envía al banco emisor de la tarjeta, y el valor vuelve según sus plazos (con tarjeta de crédito, normalmente en uno o dos estados de cuenta).',
    'Tarjeta: la devolución se envía al banco emisor de la tarjeta, y el valor vuelve según sus plazos (con tarjeta de crédito, normalmente en uno o dos resúmenes).',
  ],
];

/* ------------------------------------------------------------------ */
/* Política de privacidade: a Stripe (com os cookies antifraude do    */
/* formulário de pagamento), o Resend e o lembrete do carrinho        */

const MUDANCAS_PRIVACIDADE: Record<IdiomaConteudo, MudancasDoDocumento> = {
  pt: {
    trocas: [
      [
        'Pagamento: forma de pagamento, status e, no caso de cartão, apenas bandeira e quatro últimos dígitos. O site não recebe nem guarda o número completo do cartão.',
        'Pagamento: forma de pagamento, status, os códigos do pagamento na Stripe, o valor que você viu na sua moeda e o país informado no pagamento; no cartão, apenas a bandeira, os quatro últimos dígitos e o país do cartão. O número completo do cartão é digitado no formulário da Stripe e nunca passa pelos nossos servidores.',
      ],
      [
        'Guardar o seu carrinho e lembrar você de uma reserva que ficou sem terminar — legítimo interesse (art. 7º, IX). Você pode pedir para não receber esse lembrete.',
        'Guardar o seu carrinho e mandar por e-mail um lembrete da reserva que ficou sem terminar — legítimo interesse (art. 7º, IX). Todo lembrete traz um link para sair da lista.',
      ],
      [
        'Bancos e empresas de pagamento: processamento dos pagamentos por Pix e cartão.',
        'Stripe: processamento dos pagamentos com cartão e Pix e prevenção a fraudes. A Stripe recebe os dados do cartão e o que mais a cobrança exigir, e pode contar com empresas parceiras para processar o Pix.',
      ],
      [
        'O site usa conexão criptografada (HTTPS). As reservas ficam em armazenamento privado, acessível apenas por área administrativa protegida por senha, e o site não guarda dados de cartão.',
        'O site usa conexão criptografada (HTTPS). As reservas ficam em armazenamento privado, acessível apenas pela área administrativa protegida por senha. Você acompanha o seu pedido por um link privado. Os dados do cartão são digitados no formulário da Stripe e processados apenas por ela.',
      ],
    ],
    depois: [
      [
        'Processar pagamentos, reembolsos e prevenir fraudes — execução de contrato e legítimo interesse (art. 7º, V e IX).',
        ['Mandar por e-mail a confirmação do pedido, os vouchers e os avisos do pagamento — execução de contrato (art. 7º, V).'],
      ],
      [
        'Vercel e Supabase: hospedagem do site e armazenamento seguro das reservas.',
        ['Resend: envio dos e-mails do pedido (confirmação, vouchers, avisos do pagamento e o lembrete do carrinho).'],
      ],
      [
        'O site usa um cookie para guardar o seu carrinho, outro para lembrar por 30 dias de qual campanha você veio e armazenamento local para lembrar a sua escolha sobre cookies. O Pixel da Meta e a tag do Google Ads, que medem o resultado dos nossos anúncios, só são carregados se você clicar em “Aceitar” no aviso de cookies.',
        [
          'Na página de pagamento, o formulário da Stripe, que fica dentro do nosso site, usa cookies e informações do aparelho e da navegação para o pagamento funcionar e para prevenir fraudes. Esses dados vão para a Stripe, que os usa conforme a política de privacidade dela (stripe.com/privacy). Eles não dependem do aviso de cookies, porque são necessários para pagar.',
        ],
      ],
    ],
  },
  en: {
    trocas: [
      [
        'Payment: payment method, status and, for cards, only the brand and last four digits. The website does not receive or store the full card number.',
        'Payment: payment method, status, the payment codes at Stripe, the amount you saw in your currency and the country given at payment; for cards, only the brand, the last four digits and the card’s country. The full card number is typed into Stripe’s form and never passes through our servers.',
      ],
      [
        'To keep your cart and remind you of a booking you did not finish — legitimate interest (art. 7, IX). You can ask not to receive this reminder.',
        'To keep your cart and email you a reminder of a booking you did not finish — legitimate interest (art. 7, IX). Every reminder has a link to unsubscribe.',
      ],
      [
        'Banks and payment companies: processing Pix and card payments.',
        'Stripe: processing card and Pix payments and preventing fraud. Stripe receives your card details and whatever else the charge requires, and may rely on partner companies to process Pix.',
      ],
      [
        'The website uses an encrypted connection (HTTPS). Bookings are kept in private storage, accessible only through a password-protected admin area, and the website does not store card details.',
        'The website uses an encrypted connection (HTTPS). Bookings are kept in private storage, accessible only through a password-protected admin area. You follow your order through a private link. Card details are entered in Stripe’s form and processed only by Stripe.',
      ],
    ],
    depois: [
      [
        'To process payments and refunds and prevent fraud — performance of a contract and legitimate interest (art. 7, V and IX).',
        ['To email you the order confirmation, the vouchers and payment notices — performance of a contract (art. 7, V).'],
      ],
      [
        'Vercel and Supabase: website hosting and secure storage of bookings.',
        ['Resend: sending the order emails (confirmation, vouchers, payment notices and the cart reminder).'],
      ],
      [
        'The website uses a cookie to keep your cart, another to remember for 30 days which campaign you came from, and local storage to remember your cookie choice. The Meta Pixel and the Google Ads tag, which measure the results of our ads, are loaded only if you click “Accept” on the cookie notice.',
        [
          'On the payment page, Stripe’s form, which sits inside our website, uses cookies and information about your device and browsing to make the payment work and to prevent fraud. This data goes to Stripe, which uses it under its own privacy policy (stripe.com/privacy). It does not depend on the cookie notice, because it is needed to pay.',
        ],
      ],
    ],
  },
  es: {
    trocas: [
      [
        'Pago: forma de pago, estado y, en el caso de tarjeta, solo la marca y los cuatro últimos dígitos. El sitio no recibe ni guarda el número completo de la tarjeta.',
        'Pago: forma de pago, estado, los códigos del pago en Stripe, el monto que viste en tu moneda y el país informado en el pago; con tarjeta, solo la marca, los cuatro últimos dígitos y el país de la tarjeta. El número completo de la tarjeta se escribe en el formulario de Stripe y nunca pasa por nuestros servidores.',
      ],
      [
        'Guardar tu carrito y recordarte una reserva que quedó sin terminar — interés legítimo (art. 7, IX). Puedes pedir no recibir ese recordatorio.',
        'Guardar tu carrito y enviarte por e-mail un recordatorio de la reserva que quedó sin terminar — interés legítimo (art. 7, IX). Cada recordatorio trae un enlace para salir de la lista.',
      ],
      [
        'Bancos y empresas de pago: procesamiento de pagos con Pix y tarjeta.',
        'Stripe: procesamiento de los pagos con tarjeta y con Pix y prevención de fraudes. Stripe recibe los datos de la tarjeta y lo que el cobro requiera, y puede trabajar con empresas asociadas para procesar el Pix.',
      ],
      [
        'El sitio usa conexión cifrada (HTTPS). Las reservas quedan en un almacenamiento privado, accesible solo desde un área administrativa protegida con contraseña, y el sitio no guarda datos de tarjetas.',
        'El sitio usa conexión cifrada (HTTPS). Las reservas quedan en un almacenamiento privado, accesible solo desde un área administrativa protegida con contraseña. El pedido se sigue por un enlace privado. Los datos de la tarjeta se ingresan en el formulario de Stripe y los procesa solo Stripe.',
      ],
    ],
    depois: [
      [
        'Procesar pagos y reembolsos y prevenir fraudes — ejecución de contrato e interés legítimo (art. 7, V y IX).',
        ['Enviarte por e-mail la confirmación del pedido, los vouchers y los avisos del pago — ejecución de contrato (art. 7, V).'],
      ],
      [
        'Vercel y Supabase: alojamiento del sitio y almacenamiento seguro de las reservas.',
        ['Resend: envío de los e-mails del pedido (confirmación, vouchers, avisos del pago y el recordatorio del carrito).'],
      ],
      [
        'El sitio usa una cookie para guardar tu carrito, otra para recordar durante 30 días de qué campaña viniste y almacenamiento local para recordar tu elección sobre cookies. El Píxel de Meta y la etiqueta de Google Ads, que miden el resultado de nuestros anuncios, solo se cargan si haces clic en “Aceptar” en el aviso de cookies.',
        [
          'En la página de pago, el formulario de Stripe, que está dentro de nuestro sitio, usa cookies y datos del dispositivo y de la navegación para que el pago funcione y para prevenir fraudes. Esos datos van a Stripe, que los usa según su propia política de privacidad (stripe.com/privacy). No dependen del aviso de cookies, porque son necesarios para pagar.',
        ],
      ],
    ],
  },
};

/* ------------------------------------------------------------------ */
/* As três versões, nos quatro idiomas                                */

/** O documento na versão do pagamento online (pt, en, es pelas mudanças; es-ar pelos pares que ficam mais os novos). */
function versaoOnline(
  hoje: Traduzido<DocumentoLegal>,
  mudancas: Record<IdiomaConteudo, MudancasDoDocumento>,
  paresDeHoje: readonly ParAR[],
  novosPares: readonly ParAR[],
): { doc: Traduzido<DocumentoLegal>; pares: readonly ParAR[] } {
  const es = comMudancas(hoje.es, mudancas.es);
  const pares = [...paresQueFicam(paresDeHoje, mudancas.es), ...novosPares];
  return {
    doc: { pt: comMudancas(hoje.pt, mudancas.pt), en: comMudancas(hoje.en, mudancas.en), es, 'es-ar': comAjustesAR(es, pares) },
    pares,
  };
}

const TERMOS_ON = versaoOnline(TERMOS, MUDANCAS_TERMOS, AJUSTES_AR_TERMOS, NOVOS_PARES_TERMOS);
const CANCELAMENTO_ON = versaoOnline(CANCELAMENTO, MUDANCAS_CANCELAMENTO, AJUSTES_AR_CANCELAMENTO, NOVOS_PARES_CANCELAMENTO);
const PRIVACIDADE_ON = versaoOnline(PRIVACIDADE, MUDANCAS_PRIVACIDADE, AJUSTES_AR_PRIVACIDADE, []);

/** Os Termos de Uso com o pagamento online no ar, nos quatro idiomas. */
export const TERMOS_ONLINE = TERMOS_ON.doc;
/** A Política de Cancelamento com o pagamento online no ar, nos quatro idiomas. */
export const CANCELAMENTO_ONLINE = CANCELAMENTO_ON.doc;
/** A Política de Privacidade com o pagamento online no ar, nos quatro idiomas. */
export const PRIVACIDADE_ONLINE = PRIVACIDADE_ON.doc;
/** Os pares argentinos de cada versão online (para os testes conferirem, como os AJUSTES_AR_* de hoje). */
export const AJUSTES_AR_TERMOS_ONLINE = TERMOS_ON.pares;
export const AJUSTES_AR_CANCELAMENTO_ONLINE = CANCELAMENTO_ON.pares;
export const AJUSTES_AR_PRIVACIDADE_ONLINE = PRIVACIDADE_ON.pares;

/** Os três textos legais e a data da versão que vale. */
export interface TextosLegais {
  termos: Traduzido<DocumentoLegal>;
  cancelamento: Traduzido<DocumentoLegal>;
  privacidade: Traduzido<DocumentoLegal>;
  atualizadoEm: string;
}

/**
 * Os textos legais que as páginas mostram: com o pagamento online no ar para o público (pagamentoOnlineNoAr, src/lib/
 * formas-pagamento.ts), a versão dele; senão, o texto de hoje, sem mudar nada.
 */
export function textosLegais(online: boolean): TextosLegais {
  return online
    ? { termos: TERMOS_ONLINE, cancelamento: CANCELAMENTO_ONLINE, privacidade: PRIVACIDADE_ONLINE, atualizadoEm: ATUALIZADO_EM_ONLINE }
    : { termos: TERMOS, cancelamento: CANCELAMENTO, privacidade: PRIVACIDADE, atualizadoEm: ATUALIZADO_EM };
}
