import { EMPRESA } from '@/config/empresa';
import type { DocumentoLegal } from './tipos';

const E = EMPRESA;

export const PRIVACIDADE: Record<'pt' | 'en' | 'es', DocumentoLegal> = {
  pt: {
    titulo: 'Política de Privacidade',
    resumo:
      'Usamos seus dados apenas para fazer a sua reserva acontecer, cumprir a lei e, se você permitir, medir nossos anúncios. Não vendemos dados pessoais. Esta política segue a Lei Geral de Proteção de Dados (LGPD – Lei nº 13.709/2018).',
    secoes: [
      {
        titulo: '1. Quem é o controlador dos dados',
        paragrafos: [
          `${E.razaoSocial} (${E.tipoEmpresa}), CNPJ ${E.cnpj}, nome fantasia ${E.marca}, sediada em ${E.cidade} – ${E.uf}.`,
          `Canal do titular de dados (encarregado): ${E.email} ou WhatsApp ${E.telefoneExibicao}.`,
        ],
      },
      {
        titulo: '2. Quais dados coletamos',
        paragrafos: ['Coletamos apenas o necessário:'],
        lista: [
          'Identificação: nome completo e número do CPF (brasileiros) ou do passaporte (estrangeiros).',
          'Contato: e-mail e telefone/WhatsApp.',
          'Reserva: passeio, data, quantidade de adultos e crianças, cidade e nome do hotel ou pousada e as observações que você escrever.',
          'Pagamento: forma de pagamento, status e, no caso de cartão, apenas bandeira e quatro últimos dígitos. O número completo do cartão é enviado direto à Pagar.me e nunca passa pelos nossos servidores.',
          'Navegação: endereço IP, tipo de dispositivo e páginas visitadas, registrados pelos nossos provedores para segurança e funcionamento do site; e, só com o seu consentimento, dados de navegação para o Pixel da Meta.',
        ],
        depois: [
          'Evite escrever informações de saúde nas observações, a não ser que sejam necessárias para a sua segurança no passeio (por exemplo, restrições para mergulho). Se você escrever, usaremos apenas para esse fim.',
        ],
      },
      {
        titulo: '3. Para que usamos e com qual base legal',
        paragrafos: [],
        lista: [
          'Fazer e gerenciar a sua reserva, emitir o voucher, combinar horário e ponto de encontro e repassar ao operador os dados necessários para o passeio — execução de contrato (art. 7º, V, da LGPD).',
          'Processar pagamentos, reembolsos e prevenir fraudes — execução de contrato e legítimo interesse (art. 7º, V e IX).',
          'Guardar registros fiscais, contábeis e de consumo — cumprimento de obrigação legal e exercício regular de direitos (art. 7º, II e VI).',
          'Atender você pelo WhatsApp e por e-mail — execução de contrato e legítimo interesse.',
          'Medir e melhorar nossos anúncios no Facebook e Instagram (Pixel da Meta) — consentimento (art. 7º, I), que você pode recusar ou revogar a qualquer momento.',
        ],
      },
      {
        titulo: '4. Com quem compartilhamos',
        paragrafos: ['Compartilhamos dados somente quando necessário:'],
        lista: [
          'Operadores dos passeios (embarcações, veículos, guias): nome, quantidade de pessoas, hospedagem e contato, para realizar o passeio.',
          'Pagar.me (Stone): processamento dos pagamentos por Pix e cartão.',
          'Vercel: hospedagem do site e armazenamento seguro das reservas.',
          'Meta (WhatsApp, Facebook e Instagram): atendimento pelo WhatsApp e, com o seu consentimento, medição de anúncios.',
          'Autoridades públicas, quando exigido por lei ou ordem judicial.',
        ],
        depois: [
          'Alguns desses fornecedores podem tratar dados fora do Brasil. Nesses casos, a transferência internacional é feita com as garantias previstas no art. 33 da LGPD. Não vendemos nem alugamos dados pessoais.',
        ],
      },
      {
        titulo: '5. Cookies e Pixel da Meta',
        paragrafos: [
          'O site usa armazenamento local apenas para lembrar a sua escolha sobre cookies. O Pixel da Meta, que mede o resultado dos nossos anúncios, só é carregado se você clicar em “Aceitar” no aviso de cookies.',
          'Você pode mudar sua escolha a qualquer momento pelo botão no fim desta página.',
        ],
      },
      {
        titulo: '6. Por quanto tempo guardamos',
        paragrafos: [
          'Os dados das reservas são guardados por 5 (cinco) anos após o passeio, prazo relacionado às obrigações fiscais e aos direitos do consumidor. Dados usados com base no consentimento são mantidos até você revogá-lo. Depois disso, os dados são apagados ou anonimizados.',
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
          'O site usa conexão criptografada (HTTPS). As reservas ficam em armazenamento privado, acessível apenas por área administrativa protegida por senha, e os dados de cartão são tokenizados no seu navegador e processados apenas pela Pagar.me.',
        ],
      },
      {
        titulo: '9. Crianças e adolescentes',
        paragrafos: [
          'Dados de crianças e adolescentes são informados pelo adulto responsável pela reserva, apenas na medida necessária para o passeio (por exemplo, a quantidade de crianças), em seu melhor interesse (art. 14 da LGPD).',
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
    resumo:
      'We use your data only to make your booking happen, to comply with the law and, if you allow it, to measure our ads. We do not sell personal data. This policy follows the Brazilian General Data Protection Law (LGPD – Law 13,709/2018).',
    secoes: [
      {
        titulo: '1. Data controller',
        paragrafos: [
          `${E.razaoSocial} (${E.tipoEmpresa}), CNPJ ${E.cnpj}, trading as ${E.marca}, based in ${E.cidade} – ${E.uf}, Brazil.`,
          `Data subject contact (data protection officer): ${E.email} or WhatsApp ${E.telefoneExibicao}.`,
        ],
      },
      {
        titulo: '2. What data we collect',
        paragrafos: ['We collect only what is needed:'],
        lista: [
          'Identification: full name and CPF number (Brazilian citizens) or passport number (foreign visitors).',
          'Contact: email and phone/WhatsApp.',
          'Booking: tour, date, number of adults and children, town and name of your hotel or guesthouse, and any notes you write.',
          'Payment: payment method, status and, for cards, only the brand and last four digits. The full card number is sent straight to Pagar.me and never passes through our servers.',
          'Browsing: IP address, device type and pages visited, logged by our providers for security and to keep the website running; and, only with your consent, browsing data for the Meta Pixel.',
        ],
        depois: [
          'Please avoid writing health information in the notes unless it is needed for your safety on the tour (for example, diving restrictions). If you do, we will use it only for that purpose.',
        ],
      },
      {
        titulo: '3. Why we use it and on what legal basis',
        paragrafos: [],
        lista: [
          'To make and manage your booking, issue the voucher, arrange the time and meeting point and pass the necessary details to the tour operator — performance of a contract (LGPD art. 7, V).',
          'To process payments and refunds and prevent fraud — performance of a contract and legitimate interest (art. 7, V and IX).',
          'To keep tax, accounting and consumer records — legal obligation and exercise of rights (art. 7, II and VI).',
          'To assist you on WhatsApp and by email — performance of a contract and legitimate interest.',
          'To measure and improve our ads on Facebook and Instagram (Meta Pixel) — consent (art. 7, I), which you can refuse or withdraw at any time.',
        ],
      },
      {
        titulo: '4. Who we share it with',
        paragrafos: ['We share data only when necessary:'],
        lista: [
          'Tour operators (boats, vehicles, guides): name, number of people, accommodation and contact, to run the tour.',
          'Pagar.me (Stone): processing Pix and card payments.',
          'Vercel: website hosting and secure storage of bookings.',
          'Meta (WhatsApp, Facebook and Instagram): customer service on WhatsApp and, with your consent, ad measurement.',
          'Public authorities, when required by law or court order.',
        ],
        depois: [
          'Some of these providers may process data outside Brazil. In those cases, the international transfer follows the safeguards set out in LGPD article 33. We do not sell or rent personal data.',
        ],
      },
      {
        titulo: '5. Cookies and the Meta Pixel',
        paragrafos: [
          'The website uses local storage only to remember your cookie choice. The Meta Pixel, which measures the results of our ads, is loaded only if you click “Accept” on the cookie notice.',
          'You can change your choice at any time with the button at the end of this page.',
        ],
      },
      {
        titulo: '6. How long we keep it',
        paragrafos: [
          'Booking data is kept for 5 (five) years after the tour, in line with tax obligations and consumer rights. Data used on the basis of consent is kept until you withdraw it. After that, the data is deleted or anonymised.',
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
          'The website uses an encrypted connection (HTTPS). Bookings are kept in private storage, accessible only through a password-protected admin area, and card details are tokenised in your browser and processed only by Pagar.me.',
        ],
      },
      {
        titulo: '9. Children and teenagers',
        paragrafos: [
          'Data about children and teenagers is provided by the adult responsible for the booking, only as far as needed for the tour (for example, the number of children), in their best interest (LGPD art. 14).',
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
    resumo:
      'Usamos tus datos solo para que tu reserva se concrete, para cumplir la ley y, si lo permitís, para medir nuestros anuncios. No vendemos datos personales. Esta política sigue la Ley General de Protección de Datos de Brasil (LGPD – Ley 13.709/2018).',
    secoes: [
      {
        titulo: '1. Responsable de los datos',
        paragrafos: [
          `${E.razaoSocial} (${E.tipoEmpresa}), CNPJ ${E.cnpj}, nombre comercial ${E.marca}, con sede en ${E.cidade} – ${E.uf}, Brasil.`,
          `Canal del titular de datos (encargado): ${E.email} o WhatsApp ${E.telefoneExibicao}.`,
        ],
      },
      {
        titulo: '2. Qué datos recopilamos',
        paragrafos: ['Recopilamos solo lo necesario:'],
        lista: [
          'Identificación: nombre completo y número de CPF (brasileños) o de pasaporte (extranjeros).',
          'Contacto: e-mail y teléfono/WhatsApp.',
          'Reserva: paseo, fecha, cantidad de adultos y niños, ciudad y nombre del hotel o posada, y las observaciones que escribas.',
          'Pago: forma de pago, estado y, en el caso de tarjeta, solo la marca y los cuatro últimos dígitos. El número completo de la tarjeta se envía directo a Pagar.me y nunca pasa por nuestros servidores.',
          'Navegación: dirección IP, tipo de dispositivo y páginas visitadas, registrados por nuestros proveedores por seguridad y para el funcionamiento del sitio; y, solo con tu consentimiento, datos de navegación para el Píxel de Meta.',
        ],
        depois: [
          'Evitá escribir información de salud en las observaciones, salvo que sea necesaria para tu seguridad en el paseo (por ejemplo, restricciones para bucear). Si la escribís, la usaremos solo para ese fin.',
        ],
      },
      {
        titulo: '3. Para qué los usamos y con qué base legal',
        paragrafos: [],
        lista: [
          'Hacer y gestionar tu reserva, emitir el voucher, coordinar horario y punto de encuentro y pasar al operador los datos necesarios para el paseo — ejecución de contrato (art. 7, V, de la LGPD).',
          'Procesar pagos y reembolsos y prevenir fraudes — ejecución de contrato e interés legítimo (art. 7, V y IX).',
          'Guardar registros fiscales, contables y de consumo — obligación legal y ejercicio regular de derechos (art. 7, II y VI).',
          'Atenderte por WhatsApp y e-mail — ejecución de contrato e interés legítimo.',
          'Medir y mejorar nuestros anuncios en Facebook e Instagram (Píxel de Meta) — consentimiento (art. 7, I), que podés rechazar o revocar en cualquier momento.',
        ],
      },
      {
        titulo: '4. Con quién los compartimos',
        paragrafos: ['Compartimos datos solo cuando es necesario:'],
        lista: [
          'Operadores de los paseos (embarcaciones, vehículos, guías): nombre, cantidad de personas, alojamiento y contacto, para realizar el paseo.',
          'Pagar.me (Stone): procesamiento de pagos con Pix y tarjeta.',
          'Vercel: alojamiento del sitio y almacenamiento seguro de las reservas.',
          'Meta (WhatsApp, Facebook e Instagram): atención por WhatsApp y, con tu consentimiento, medición de anuncios.',
          'Autoridades públicas, cuando lo exija la ley o una orden judicial.',
        ],
        depois: [
          'Algunos de estos proveedores pueden tratar datos fuera de Brasil. En esos casos, la transferencia internacional se hace con las garantías previstas en el art. 33 de la LGPD. No vendemos ni alquilamos datos personales.',
        ],
      },
      {
        titulo: '5. Cookies y Píxel de Meta',
        paragrafos: [
          'El sitio usa almacenamiento local solo para recordar tu elección sobre cookies. El Píxel de Meta, que mide el resultado de nuestros anuncios, solo se carga si hacés clic en “Aceptar” en el aviso de cookies.',
          'Podés cambiar tu elección en cualquier momento con el botón al final de esta página.',
        ],
      },
      {
        titulo: '6. Por cuánto tiempo los guardamos',
        paragrafos: [
          'Los datos de las reservas se guardan por 5 (cinco) años después del paseo, plazo relacionado con las obligaciones fiscales y los derechos del consumidor. Los datos usados con base en el consentimiento se mantienen hasta que lo revoques. Después, se eliminan o se anonimizan.',
        ],
      },
      {
        titulo: '7. Tus derechos',
        paragrafos: ['Según la LGPD (art. 18), podés pedir en cualquier momento:'],
        lista: [
          'confirmación de que tratamos tus datos y acceso a ellos;',
          'corrección de datos incompletos, inexactos o desactualizados;',
          'anonimización, bloqueo o eliminación de datos innecesarios o tratados en desacuerdo con la ley;',
          'portabilidad de los datos;',
          'información sobre con quién compartimos tus datos;',
          'eliminación de los datos tratados con base en el consentimiento y revocación del consentimiento.',
        ],
        depois: [
          `Para ejercer tus derechos, escribí a ${E.email}. Responderemos en hasta 15 (quince) días. También podés presentar un reclamo ante la Autoridad Nacional de Protección de Datos de Brasil (ANPD).`,
        ],
      },
      {
        titulo: '8. Seguridad',
        paragrafos: [
          'El sitio usa conexión cifrada (HTTPS). Las reservas quedan en un almacenamiento privado, accesible solo desde un área administrativa protegida con contraseña, y los datos de la tarjeta se tokenizan en tu navegador y los procesa solo Pagar.me.',
        ],
      },
      {
        titulo: '9. Niños y adolescentes',
        paragrafos: [
          'Los datos de niños y adolescentes los informa el adulto responsable de la reserva, solo en la medida necesaria para el paseo (por ejemplo, la cantidad de niños), en su mejor interés (art. 14 de la LGPD).',
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
