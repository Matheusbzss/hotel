import { EMPRESA, enderecoCompleto } from '../../config/empresa.ts';
import type { IdiomaConteudo, Traduzido } from '../../i18n/conteudo.ts';
import { comAjustesAR, type ParAR } from './argentino.ts';
import type { DocumentoLegal } from './tipos.ts';

const E = EMPRESA;

/** Português, inglês e o espanhol neutro (es, com "tú"). O espanhol da Argentina sai de BASE.es + AJUSTES_AR, no fim. */
const BASE: Record<IdiomaConteudo, DocumentoLegal> = {
  pt: {
    titulo: 'Política de Privacidade',
    descricao:
      'Usamos seus dados só para fazer a sua reserva acontecer, cumprir a lei e, se você permitir, medir e personalizar nossos anúncios. Não vendemos dados pessoais.',
    resumo:
      'Usamos seus dados só para fazer a sua reserva acontecer, cumprir a lei e, se você permitir, medir e personalizar nossos anúncios. Não vendemos dados pessoais. Esta política segue a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).',
    secoes: [
      {
        titulo: '1. Quem é o controlador dos dados',
        paragrafos: [
          `${E.razaoSocial}, CNPJ ${E.cnpj}, com sede na ${enderecoCompleto}.`,
          `Canal do titular de dados (encarregado): ${E.email}.`,
        ],
      },
      {
        titulo: '2. Quais dados coletamos',
        paragrafos: ['Coletamos apenas o necessário:'],
        lista: [
          'Identificação: nome completo e, quando pedimos, o número do CPF (brasileiros) ou do passaporte (estrangeiros).',
          'Contato: e-mail e telefone/WhatsApp, inclusive quando você pede uma cotação ou manda uma mensagem pelo site.',
          'Reserva: passeio ou transfer, data, horário, quantidade de adultos e crianças, cidade e nome do hotel ou pousada e as observações que você escrever. No transfer, também o trajeto, os voos, as malas e a idade das crianças que vão de cadeirinha.',
          'Carrinho: os itens que você escolheu e, se digitar no checkout, o seu e-mail, mesmo que você não termine a reserva.',
          'Origem da visita: o nome da campanha do anúncio de onde você veio, quando o link tem essa marca.',
          'Pagamento: forma de pagamento, status e, no caso de cartão, apenas bandeira e quatro últimos dígitos. O site não recebe nem guarda o número completo do cartão.',
          'Navegação: endereço IP, tipo de dispositivo e páginas visitadas, registrados pelos nossos provedores para segurança e funcionamento do site; e, só com o seu consentimento, dados de navegação para o Pixel da Meta e para a tag do Google Ads.',
        ],
        depois: [
          'Evite escrever informações de saúde nas observações, a não ser que sejam necessárias para a sua segurança no passeio (por exemplo, restrições para mergulho). Se você escrever, usaremos apenas para esse fim.',
        ],
      },
      {
        titulo: '3. Para que usamos e com qual base legal',
        paragrafos: [],
        lista: [
          'Fazer e gerenciar a sua reserva, emitir o voucher com o horário, enviar o ponto de encontro e repassar ao operador os dados necessários para o serviço — execução de contrato (art. 7º, V, da LGPD).',
          'Processar pagamentos, reembolsos e prevenir fraudes — execução de contrato e legítimo interesse (art. 7º, V e IX).',
          'Guardar registros fiscais, contábeis e de consumo — cumprimento de obrigação legal e exercício regular de direitos (art. 7º, II e VI).',
          'Atender você pelo WhatsApp e por e-mail — execução de contrato e legítimo interesse.',
          'Guardar o seu carrinho e lembrar você de uma reserva que ficou sem terminar — legítimo interesse (art. 7º, IX). Você pode pedir para não receber esse lembrete.',
          'Saber de qual campanha veio cada reserva, para medir o resultado dos anúncios — legítimo interesse (art. 7º, IX).',
          'Medir, melhorar e personalizar nossos anúncios no Facebook, no Instagram e no Google (Pixel da Meta, API de Conversões e tag do Google Ads), inclusive mostrar anúncios a quem visitou o site e avisar essas plataformas quando uma reserva é paga, com o valor, o código do clique no anúncio e, para a Meta, o e-mail e o telefone embaralhados (hash) — consentimento (art. 7º, I), que você pode recusar ou revogar a qualquer momento.',
        ],
      },
      {
        titulo: '4. Com quem compartilhamos',
        paragrafos: ['Compartilhamos dados somente quando necessário:'],
        lista: [
          'Operadores dos passeios e do transfer (embarcações, veículos, motoristas, guias): nome, quantidade de pessoas, hospedagem e contato e, no transfer, também o trajeto, os voos, as malas e a idade das crianças que vão de cadeirinha, para realizar o serviço.',
          'Bancos e empresas de pagamento: processamento dos pagamentos por Pix e cartão.',
          'Vercel e Supabase: hospedagem do site e armazenamento seguro das reservas.',
          'Meta (WhatsApp, Facebook e Instagram): atendimento pelo WhatsApp e, com o seu consentimento, medição e personalização de anúncios.',
          'Google: com o seu consentimento, medição e personalização de anúncios.',
          'Autoridades públicas, quando exigido por lei ou ordem judicial.',
        ],
        depois: [
          'Alguns desses fornecedores podem tratar dados fora do Brasil. Nesses casos, a transferência internacional é feita com as garantias previstas no art. 33 da LGPD. Não vendemos nem alugamos dados pessoais.',
        ],
      },
      {
        titulo: '5. Cookies, Pixel da Meta e Google',
        paragrafos: [
          'O site usa um cookie para guardar o seu carrinho, outro para lembrar por 30 dias de qual campanha você veio, armazenamento local para lembrar a sua escolha sobre cookies e, se você aceitar, um cookie que guarda essa escolha por 1 ano. O Pixel da Meta e a tag do Google Ads, que medem o resultado dos nossos anúncios, só são carregados se você clicar em “Aceitar” no aviso de cookies.',
          `Com o seu aceite, o Google e a Meta (Facebook e Instagram) também podem usar cookies e identificadores do aparelho para mostrar anúncios da ${E.marca} em outros sites e aplicativos, com base na sua visita a este site. Para desativar os anúncios personalizados, use as Configurações de anúncios do Google (adssettings.google.com), as preferências de anúncios da Meta (facebook.com/adpreferences) ou as páginas aboutads.info/choices e youronlinechoices.eu.`,
          'Você pode mudar sua escolha a qualquer momento pelo botão no fim desta página.',
        ],
      },
      {
        titulo: '6. Por quanto tempo guardamos',
        paragrafos: [
          'Os dados das reservas são guardados por 5 (cinco) anos após o serviço, prazo relacionado às obrigações fiscais e aos direitos do consumidor. Dados usados com base no consentimento são mantidos até você revogá-lo. Depois disso, os dados são apagados ou anonimizados.',
        ],
      },
      {
        titulo: '7. Seus direitos',
        paragrafos: ['Pela LGPD (art. 18), você pode pedir a qualquer momento:'],
        lista: [
          'confirmação de que tratamos seus dados e acesso a eles;',
          'correção de dados incompletos, inexatos ou desatualizados;',
          'anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;',
          'portabilidade dos dados;',
          'informação sobre com quem compartilhamos seus dados;',
          'eliminação dos dados tratados com base no consentimento e revogação do consentimento.',
        ],
        depois: [
          `Para exercer seus direitos, escreva para ${E.email}. Responderemos em até 15 (quinze) dias. Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).`,
        ],
      },
      {
        titulo: '8. Segurança',
        paragrafos: [
          'O site usa conexão criptografada (HTTPS). As reservas ficam em armazenamento privado, acessível apenas por área administrativa protegida por senha, e o site não guarda dados de cartão.',
        ],
      },
      {
        titulo: '9. Crianças e adolescentes',
        paragrafos: [
          'Dados de crianças e adolescentes são informados pelo adulto responsável pela reserva, apenas na medida necessária para o passeio ou o transfer (por exemplo, a quantidade de crianças e, no transfer, a idade das que vão de cadeirinha), em seu melhor interesse (art. 14 da LGPD).',
        ],
      },
      {
        titulo: '10. Alterações desta política',
        paragrafos: [
          'Podemos atualizar esta política para refletir mudanças no site ou na lei. A data da última atualização aparece no topo da página.',
        ],
      },
    ],
  },
  en: {
    titulo: 'Privacy Policy',
    descricao:
      'We use your data only to make your booking happen, comply with the law and, if you allow it, measure and personalise our ads. We do not sell personal data.',
    resumo:
      'We use your data only to make your booking happen, comply with the law and, if you allow it, measure and personalise our ads. We do not sell personal data. This policy follows the Brazilian General Data Protection Law (LGPD – Law 13,709/2018).',
    secoes: [
      {
        titulo: '1. Data controller',
        paragrafos: [
          `${E.razaoSocial}, CNPJ (Brazilian company registration number) ${E.cnpj}, with its registered office at ${enderecoCompleto}, Brazil.`,
          `Data subject contact (data protection officer): ${E.email}.`,
        ],
      },
      {
        titulo: '2. What data we collect',
        paragrafos: ['We collect only what is needed:'],
        lista: [
          'Identification: full name and, when we ask for it, CPF number (Brazilian citizens) or passport number (foreign visitors).',
          'Contact: email and phone/WhatsApp, including when you request a quote or send a message through the website.',
          'Booking: tour or transfer, date, time, number of adults and children, town and name of your hotel or guesthouse, and any notes you write. For transfers, also the route, flights, luggage and the age of children travelling in a child seat.',
          'Cart: the items you chose and, if you type it at checkout, your email, even if you do not finish the booking.',
          'Visit source: the name of the ad campaign you came from, when the link carries it.',
          'Payment: payment method, status and, for cards, only the brand and last four digits. The website does not receive or store the full card number.',
          'Browsing: IP address, device type and pages visited, logged by our providers for security and to keep the website running; and, only with your consent, browsing data for the Meta Pixel and the Google Ads tag.',
        ],
        depois: [
          'Please avoid writing health information in the notes unless it is needed for your safety on the tour (for example, diving restrictions). If you do, we will use it only for that purpose.',
        ],
      },
      {
        titulo: '3. Why we use it and on what legal basis',
        paragrafos: [],
        lista: [
          'To make and manage your booking, issue the voucher with the time, send the meeting point and pass the necessary details to the operator — performance of a contract (LGPD art. 7, V).',
          'To process payments and refunds and prevent fraud — performance of a contract and legitimate interest (art. 7, V and IX).',
          'To keep tax, accounting and consumer records — legal obligation and exercise of rights (art. 7, II and VI).',
          'To assist you on WhatsApp and by email — performance of a contract and legitimate interest.',
          'To keep your cart and remind you of a booking you did not finish — legitimate interest (art. 7, IX). You can ask not to receive this reminder.',
          'To know which campaign each booking came from, so we can measure our ads — legitimate interest (art. 7, IX).',
          'To measure, improve and personalise our ads on Facebook, Instagram and Google (Meta Pixel, Conversions API and Google Ads tag), including showing ads to people who visited the website and telling these platforms when a booking is paid, with the amount, the ad click code and, for Meta, your email and phone number scrambled (hashed) — consent (art. 7, I), which you can refuse or withdraw at any time.',
        ],
      },
      {
        titulo: '4. Who we share it with',
        paragrafos: ['We share data only when necessary:'],
        lista: [
          'Tour and transfer operators (boats, vehicles, drivers, guides): name, number of people, accommodation and contact and, for transfers, also the route, flights, luggage and the age of children travelling in a child seat, to run the service.',
          'Banks and payment companies: processing Pix and card payments.',
          'Vercel and Supabase: website hosting and secure storage of bookings.',
          'Meta (WhatsApp, Facebook and Instagram): customer service on WhatsApp and, with your consent, ad measurement and personalisation.',
          'Google: with your consent, ad measurement and personalisation.',
          'Public authorities, when required by law or court order.',
        ],
        depois: [
          'Some of these providers may process data outside Brazil. In those cases, the international transfer follows the safeguards set out in LGPD article 33. We do not sell or rent personal data.',
        ],
      },
      {
        titulo: '5. Cookies, the Meta Pixel and Google',
        paragrafos: [
          'The website uses a cookie to keep your cart, another to remember for 30 days which campaign you came from, local storage to remember your cookie choice, and, if you accept, a cookie that keeps that choice for 1 year. The Meta Pixel and the Google Ads tag, which measure the results of our ads, are loaded only if you click “Accept” on the cookie notice.',
          `With your consent, Google and Meta (Facebook and Instagram) may also use cookies and device identifiers to show ${E.marca} ads on other websites and apps based on your visit to this website. To turn off personalised ads, use Google Ads Settings (adssettings.google.com), Meta’s ad preferences (facebook.com/adpreferences) or the pages aboutads.info/choices and youronlinechoices.eu.`,
          'You can change your choice at any time with the button at the end of this page.',
        ],
      },
      {
        titulo: '6. How long we keep it',
        paragrafos: [
          'Booking data is kept for 5 (five) years after the service, in line with tax obligations and consumer rights. Data used on the basis of consent is kept until you withdraw it. After that, the data is deleted or anonymised.',
        ],
      },
      {
        titulo: '7. Your rights',
        paragrafos: ['Under the LGPD (art. 18), you may request at any time:'],
        lista: [
          'confirmation that we process your data and access to it;',
          'correction of incomplete, inaccurate or outdated data;',
          'anonymisation, blocking or deletion of unnecessary data or data processed unlawfully;',
          'data portability;',
          'information about who we share your data with;',
          'deletion of data processed on the basis of consent and withdrawal of consent.',
        ],
        depois: [
          `To exercise your rights, write to ${E.email}. We will reply within 15 (fifteen) days. You may also file a complaint with the Brazilian National Data Protection Authority (ANPD).`,
        ],
      },
      {
        titulo: '8. Security',
        paragrafos: [
          'The website uses an encrypted connection (HTTPS). Bookings are kept in private storage, accessible only through a password-protected admin area, and the website does not store card details.',
        ],
      },
      {
        titulo: '9. Children and teenagers',
        paragrafos: [
          'Data about children and teenagers is provided by the adult responsible for the booking, only as far as needed for the tour or transfer (for example, the number of children and, for transfers, the age of those travelling in a child seat), in their best interest (LGPD art. 14).',
        ],
      },
      {
        titulo: '10. Changes to this policy',
        paragrafos: [
          'We may update this policy to reflect changes to the website or the law. The date of the last update is shown at the top of the page.',
        ],
      },
    ],
  },
  es: {
    titulo: 'Política de Privacidad',
    descricao:
      'Usamos tus datos solo para concretar tu reserva, cumplir la ley y, si lo permites, medir y personalizar nuestros anuncios. No vendemos datos personales.',
    resumo:
      'Usamos tus datos solo para concretar tu reserva, cumplir la ley y, si lo permites, medir y personalizar nuestros anuncios. No vendemos datos personales. Esta política sigue la Ley General de Protección de Datos de Brasil (LGPD – Ley 13.709/2018).',
    secoes: [
      {
        titulo: '1. Responsable de los datos',
        paragrafos: [
          `${E.razaoSocial}, CNPJ (registro de empresas de Brasil) ${E.cnpj}, con sede en ${enderecoCompleto}, Brasil.`,
          `Canal del titular de datos (delegado de protección de datos): ${E.email}.`,
        ],
      },
      {
        titulo: '2. Qué datos recopilamos',
        paragrafos: ['Recopilamos solo lo necesario:'],
        lista: [
          'Identificación: nombre completo y, cuando lo pedimos, número de CPF (brasileños) o de pasaporte (extranjeros).',
          'Contacto: e-mail y teléfono/WhatsApp, también cuando pides una cotización o mandas un mensaje por el sitio.',
          'Reserva: paseo o traslado, fecha, horario, cantidad de adultos y niños, ciudad y nombre del hotel o posada, y las observaciones que escribas. En el traslado, también el trayecto, los vuelos, las maletas y la edad de los niños que van en silla.',
          'Carrito: los ítems que elegiste y, si lo escribes en el checkout, tu e-mail, aunque no termines la reserva.',
          'Origen de la visita: el nombre de la campaña del anuncio del que viniste, cuando el enlace lo indica.',
          'Pago: forma de pago, estado y, en el caso de tarjeta, solo la marca y los cuatro últimos dígitos. El sitio no recibe ni guarda el número completo de la tarjeta.',
          'Navegación: dirección IP, tipo de dispositivo y páginas visitadas, registrados por nuestros proveedores por seguridad y para el funcionamiento del sitio; y, solo con tu consentimiento, datos de navegación para el Píxel de Meta y la etiqueta de Google Ads.',
        ],
        depois: [
          'Evita escribir información de salud en las observaciones, salvo que sea necesaria para tu seguridad en el paseo (por ejemplo, restricciones para bucear). Si la escribes, la usaremos solo para ese fin.',
        ],
      },
      {
        titulo: '3. Para qué los usamos y con qué base legal',
        paragrafos: [],
        lista: [
          'Hacer y gestionar tu reserva, emitir el voucher con el horario, enviar el punto de encuentro y pasar al operador los datos necesarios para el servicio — ejecución de contrato (art. 7, V, de la LGPD).',
          'Procesar pagos y reembolsos y prevenir fraudes — ejecución de contrato e interés legítimo (art. 7, V y IX).',
          'Guardar registros fiscales, contables y de consumo — obligación legal y ejercicio regular de derechos (art. 7, II y VI).',
          'Atenderte por WhatsApp y e-mail — ejecución de contrato e interés legítimo.',
          'Guardar tu carrito y recordarte una reserva que quedó sin terminar — interés legítimo (art. 7, IX). Puedes pedir no recibir ese recordatorio.',
          'Saber de qué campaña vino cada reserva, para medir el resultado de los anuncios — interés legítimo (art. 7, IX).',
          'Medir, mejorar y personalizar nuestros anuncios en Facebook, Instagram y Google (Píxel de Meta, API de Conversiones y etiqueta de Google Ads), incluso mostrar anuncios a quienes visitaron el sitio y avisar a esas plataformas cuando una reserva se paga, con el valor, el código del clic en el anuncio y, para Meta, tu e-mail y tu teléfono cifrados (hash) — consentimiento (art. 7, I), que puedes rechazar o revocar en cualquier momento.',
        ],
      },
      {
        titulo: '4. Con quién los compartimos',
        paragrafos: ['Compartimos datos solo cuando es necesario:'],
        lista: [
          'Operadores de los paseos y traslados (embarcaciones, vehículos, conductores, guías): nombre, cantidad de personas, alojamiento y contacto y, en el traslado, también el trayecto, los vuelos, las maletas y la edad de los niños que van en silla, para realizar el servicio.',
          'Bancos y empresas de pago: procesamiento de pagos con Pix y tarjeta.',
          'Vercel y Supabase: alojamiento del sitio y almacenamiento seguro de las reservas.',
          'Meta (WhatsApp, Facebook e Instagram): atención por WhatsApp y, con tu consentimiento, medición y personalización de anuncios.',
          'Google: con tu consentimiento, medición y personalización de anuncios.',
          'Autoridades públicas, cuando lo exija la ley o una orden judicial.',
        ],
        depois: [
          'Algunos de estos proveedores pueden tratar datos fuera de Brasil. En esos casos, la transferencia internacional se hace con las garantías previstas en el art. 33 de la LGPD. No vendemos ni alquilamos datos personales.',
        ],
      },
      {
        titulo: '5. Cookies, Píxel de Meta y Google',
        paragrafos: [
          'El sitio usa una cookie para guardar tu carrito, otra para recordar durante 30 días de qué campaña viniste, almacenamiento local para recordar tu elección sobre cookies y, si aceptas, una cookie que guarda esa elección por 1 año. El Píxel de Meta y la etiqueta de Google Ads, que miden el resultado de nuestros anuncios, solo se cargan si haces clic en “Aceptar” en el aviso de cookies.',
          `Con tu aceptación, Google y Meta (Facebook e Instagram) también pueden usar cookies e identificadores del dispositivo para mostrar anuncios de ${E.marca} en otros sitios y aplicaciones, según tu visita a este sitio. Para desactivar los anuncios personalizados, usa la Configuración de anuncios de Google (adssettings.google.com), las preferencias de anuncios de Meta (facebook.com/adpreferences) o las páginas aboutads.info/choices y youronlinechoices.eu.`,
          'Puedes cambiar tu elección en cualquier momento con el botón al final de esta página.',
        ],
      },
      {
        titulo: '6. Por cuánto tiempo los guardamos',
        paragrafos: [
          'Los datos de las reservas se guardan por 5 (cinco) años después del servicio, plazo relacionado con las obligaciones fiscales y los derechos del consumidor. Los datos usados con base en el consentimiento se mantienen hasta que lo revoques. Después, se eliminan o se anonimizan.',
        ],
      },
      {
        titulo: '7. Tus derechos',
        paragrafos: ['Según la LGPD (art. 18), puedes pedir en cualquier momento:'],
        lista: [
          'confirmación de que tratamos tus datos y acceso a ellos;',
          'corrección de datos incompletos, inexactos o desactualizados;',
          'anonimización, bloqueo o eliminación de datos innecesarios o tratados en desacuerdo con la ley;',
          'portabilidad de los datos;',
          'información sobre con quién compartimos tus datos;',
          'eliminación de los datos tratados con base en el consentimiento y revocación del consentimiento.',
        ],
        depois: [
          `Para ejercer tus derechos, escribe a ${E.email}. Responderemos en un plazo de hasta 15 (quince) días. También puedes presentar un reclamo ante la Autoridad Nacional de Protección de Datos de Brasil (ANPD).`,
        ],
      },
      {
        titulo: '8. Seguridad',
        paragrafos: [
          'El sitio usa conexión cifrada (HTTPS). Las reservas quedan en un almacenamiento privado, accesible solo desde un área administrativa protegida con contraseña, y el sitio no guarda datos de tarjetas.',
        ],
      },
      {
        titulo: '9. Niños y adolescentes',
        paragrafos: [
          'Los datos de niños y adolescentes los informa el adulto responsable de la reserva, solo en la medida necesaria para el paseo o el traslado (por ejemplo, la cantidad de niños y, en el traslado, la edad de los que van en silla), en su mejor interés (art. 14 de la LGPD).',
        ],
      },
      {
        titulo: '10. Cambios en esta política',
        paragrafos: [
          'Podemos actualizar esta política para reflejar cambios en el sitio o en la ley. La fecha de la última actualización aparece al inicio de la página.',
        ],
      },
    ],
  },
};

/**
 * O espanhol da Argentina: só as frases desta Política que mudam do neutro, com o texto que o site tinha antes
 * ("vos", imperativo sem acento, valijas). Cada par é [frase neutra inteira, a mesma frase em argentino].
 * Se alguém editar a frase neutra sem mexer aqui, comAjustesAR() falha na carga e aponta a frase.
 */
export const AJUSTES_AR_PRIVACIDADE: readonly ParAR[] = [
  [
    'Usamos tus datos solo para concretar tu reserva, cumplir la ley y, si lo permites, medir y personalizar nuestros anuncios. No vendemos datos personales.',
    'Usamos tus datos solo para concretar tu reserva, cumplir la ley y, si lo permitís, medir y personalizar nuestros anuncios. No vendemos datos personales.',
  ],
  [
    'Usamos tus datos solo para concretar tu reserva, cumplir la ley y, si lo permites, medir y personalizar nuestros anuncios. No vendemos datos personales. Esta política sigue la Ley General de Protección de Datos de Brasil (LGPD – Ley 13.709/2018).',
    'Usamos tus datos solo para concretar tu reserva, cumplir la ley y, si lo permitís, medir y personalizar nuestros anuncios. No vendemos datos personales. Esta política sigue la Ley General de Protección de Datos de Brasil (LGPD – Ley 13.709/2018).',
  ],
  [
    'Contacto: e-mail y teléfono/WhatsApp, también cuando pides una cotización o mandas un mensaje por el sitio.',
    'Contacto: e-mail y teléfono/WhatsApp, también cuando pedís una cotización o mandás un mensaje por el sitio.',
  ],
  [
    'Reserva: paseo o traslado, fecha, horario, cantidad de adultos y niños, ciudad y nombre del hotel o posada, y las observaciones que escribas. En el traslado, también el trayecto, los vuelos, las maletas y la edad de los niños que van en silla.',
    'Reserva: paseo o traslado, fecha, horario, cantidad de adultos y niños, ciudad y nombre del hotel o posada, y las observaciones que escribas. En el traslado, también el trayecto, los vuelos, las valijas y la edad de los niños que van en silla.',
  ],
  [
    'Carrito: los ítems que elegiste y, si lo escribes en el checkout, tu e-mail, aunque no termines la reserva.',
    'Carrito: los ítems que elegiste y, si lo escribís en el checkout, tu e-mail, aunque no termines la reserva.',
  ],
  [
    'Evita escribir información de salud en las observaciones, salvo que sea necesaria para tu seguridad en el paseo (por ejemplo, restricciones para bucear). Si la escribes, la usaremos solo para ese fin.',
    'Evitá escribir información de salud en las observaciones, salvo que sea necesaria para tu seguridad en el paseo (por ejemplo, restricciones para bucear). Si la escribís, la usaremos solo para ese fin.',
  ],
  [
    'Guardar tu carrito y recordarte una reserva que quedó sin terminar — interés legítimo (art. 7, IX). Puedes pedir no recibir ese recordatorio.',
    'Guardar tu carrito y recordarte una reserva que quedó sin terminar — interés legítimo (art. 7, IX). Podés pedir no recibir ese recordatorio.',
  ],
  [
    'Medir, mejorar y personalizar nuestros anuncios en Facebook, Instagram y Google (Píxel de Meta, API de Conversiones y etiqueta de Google Ads), incluso mostrar anuncios a quienes visitaron el sitio y avisar a esas plataformas cuando una reserva se paga, con el valor, el código del clic en el anuncio y, para Meta, tu e-mail y tu teléfono cifrados (hash) — consentimiento (art. 7, I), que puedes rechazar o revocar en cualquier momento.',
    'Medir, mejorar y personalizar nuestros anuncios en Facebook, Instagram y Google (Píxel de Meta, API de Conversiones y etiqueta de Google Ads), incluso mostrar anuncios a quienes visitaron el sitio y avisar a esas plataformas cuando una reserva se paga, con el valor, el código del clic en el anuncio y, para Meta, tu e-mail y tu teléfono cifrados (hash) — consentimiento (art. 7, I), que podés rechazar o revocar en cualquier momento.',
  ],
  [
    'Operadores de los paseos y traslados (embarcaciones, vehículos, conductores, guías): nombre, cantidad de personas, alojamiento y contacto y, en el traslado, también el trayecto, los vuelos, las maletas y la edad de los niños que van en silla, para realizar el servicio.',
    'Operadores de los paseos y traslados (embarcaciones, vehículos, conductores, guías): nombre, cantidad de personas, alojamiento y contacto y, en el traslado, también el trayecto, los vuelos, las valijas y la edad de los niños que van en silla, para realizar el servicio.',
  ],
  [
    'El sitio usa una cookie para guardar tu carrito, otra para recordar durante 30 días de qué campaña viniste, almacenamiento local para recordar tu elección sobre cookies y, si aceptas, una cookie que guarda esa elección por 1 año. El Píxel de Meta y la etiqueta de Google Ads, que miden el resultado de nuestros anuncios, solo se cargan si haces clic en “Aceptar” en el aviso de cookies.',
    'El sitio usa una cookie para guardar tu carrito, otra para recordar durante 30 días de qué campaña viniste, almacenamiento local para recordar tu elección sobre cookies y, si aceptás, una cookie que guarda esa elección por 1 año. El Píxel de Meta y la etiqueta de Google Ads, que miden el resultado de nuestros anuncios, solo se cargan si hacés clic en “Aceptar” en el aviso de cookies.',
  ],
  [
    `Con tu aceptación, Google y Meta (Facebook e Instagram) también pueden usar cookies e identificadores del dispositivo para mostrar anuncios de ${E.marca} en otros sitios y aplicaciones, según tu visita a este sitio. Para desactivar los anuncios personalizados, usa la Configuración de anuncios de Google (adssettings.google.com), las preferencias de anuncios de Meta (facebook.com/adpreferences) o las páginas aboutads.info/choices y youronlinechoices.eu.`,
    `Con tu aceptación, Google y Meta (Facebook e Instagram) también pueden usar cookies e identificadores del dispositivo para mostrar anuncios de ${E.marca} en otros sitios y aplicaciones, según tu visita a este sitio. Para desactivar los anuncios personalizados, usá la Configuración de anuncios de Google (adssettings.google.com), las preferencias de anuncios de Meta (facebook.com/adpreferences) o las páginas aboutads.info/choices y youronlinechoices.eu.`,
  ],
  [
    'Puedes cambiar tu elección en cualquier momento con el botón al final de esta página.',
    'Podés cambiar tu elección en cualquier momento con el botón al final de esta página.',
  ],
  ['Según la LGPD (art. 18), puedes pedir en cualquier momento:', 'Según la LGPD (art. 18), podés pedir en cualquier momento:'],
  [
    `Para ejercer tus derechos, escribe a ${E.email}. Responderemos en un plazo de hasta 15 (quince) días. También puedes presentar un reclamo ante la Autoridad Nacional de Protección de Datos de Brasil (ANPD).`,
    `Para ejercer tus derechos, escribí a ${E.email}. Responderemos en un plazo de hasta 15 (quince) días. También podés presentar un reclamo ante la Autoridad Nacional de Protección de Datos de Brasil (ANPD).`,
  ],
];

/** A Política nos quatro idiomas: as páginas leem com texto(PRIVACIDADE, locale) (src/i18n/conteudo.ts). */
export const PRIVACIDADE: Traduzido<DocumentoLegal> = { ...BASE, 'es-ar': comAjustesAR(BASE.es, AJUSTES_AR_PRIVACIDADE) };
