import type { Idioma } from '../i18n/config';

/**
 * Os textos das páginas da Etapa 6 que o cliente vê no site: "Consultar meu pedido" (com o link no rodapé) e a página
 * de quem saiu da lista dos lembretes do carrinho. Ficam fora dos dicionários (src/i18n), como os textos dos e-mails
 * (src/lib/email/textos.ts). O 'es-ar' é o 'es' com as frases em que o verbo muda (tests/es-ar.test.ts confere cada
 * par). {email} é o e-mail da empresa.
 */
export interface TextosConsulta {
  linkRodape: string;
  titulo: string;
  texto: string;
  email: string;
  codigo: string;
  codigoAjuda: string;
  botao: string;
  enviando: string;
  prontoTitulo: string;
  prontoTexto: string;
  outraConsulta: string;
  erroEmail: string;
  erroCodigo: string;
  erroLimite: string;
  erroGeral: string;
  /** Sem o envio de e-mail ligado: o caminho é escrever para a equipe. */
  semEmailTexto: string;
  semEmailBotao: string;
  semEmailAssunto: string;
  ajuda: string;
  sairTitulo: string;
  sairTexto: string;
  sairErroTitulo: string;
  sairErroTexto: string;
  /** A página aberta sem vir do link do e-mail. */
  sairSemLinkTitulo: string;
  sairSemLinkTexto: string;
  voltarSite: string;
}

const PT: TextosConsulta = {
  linkRodape: 'Consultar meu pedido',
  titulo: 'Consultar meu pedido',
  texto: 'Digite o e-mail usado na compra e o código do pedido. Se os dados conferirem, mandamos o link do pedido para o seu e-mail.',
  email: 'E-mail usado na compra',
  codigo: 'Código do pedido',
  codigoAjuda: 'Começa com ON-, como ON-7K3P9Q. Está na página do pedido e no voucher.',
  botao: 'Receber o link no e-mail',
  enviando: 'Enviando…',
  prontoTitulo: 'Confira o seu e-mail',
  prontoTexto: 'Se os dados conferirem, o link chega no seu e-mail em alguns minutos. Olhe também a caixa de spam.',
  outraConsulta: 'Fazer outra consulta',
  erroEmail: 'Confira o e-mail.',
  erroCodigo: 'O código tem o formato ON-7K3P9Q.',
  erroLimite: 'Muitas tentativas seguidas. Tente de novo em alguns minutos.',
  erroGeral: 'Não deu para enviar agora. Tente de novo em instantes.',
  semEmailTexto: 'Para receber o link do seu pedido, escreva para {email} com o código do pedido e o e-mail usado na compra.',
  semEmailBotao: 'Escrever um e-mail',
  semEmailAssunto: 'Link do meu pedido',
  ajuda: 'Não recebeu? Escreva para {email}.',
  sairTitulo: 'Pronto',
  sairTexto: 'Você não vai receber mais lembretes do carrinho. Os e-mails dos seus pedidos continuam chegando normalmente.',
  sairErroTitulo: 'Não deu para confirmar',
  sairErroTexto: 'O link não vale mais. Para sair da lista, escreva para {email}.',
  sairSemLinkTitulo: 'Lembretes do carrinho',
  sairSemLinkTexto: 'Para sair da lista de lembretes do carrinho, use o link que vem no fim do e-mail.',
  voltarSite: 'Ir para o site',
};

const EN: TextosConsulta = {
  linkRodape: 'Find my order',
  titulo: 'Find my order',
  texto: 'Enter the email you used to book and your order code. If they match, we will email you the link to your order.',
  email: 'Email used to book',
  codigo: 'Order code',
  codigoAjuda: 'It starts with ON-, like ON-7K3P9Q. You can find it on the order page and on your voucher.',
  botao: 'Email me the link',
  enviando: 'Sending…',
  prontoTitulo: 'Check your email',
  prontoTexto: 'If the details match, the link will reach your email within a few minutes. Please also check your spam folder.',
  outraConsulta: 'Look up another order',
  erroEmail: 'Please check the email.',
  erroCodigo: 'The code looks like ON-7K3P9Q.',
  erroLimite: 'Too many attempts in a row. Please try again in a few minutes.',
  erroGeral: "We couldn't send it right now. Please try again shortly.",
  semEmailTexto: 'To get the link to your order, write to {email} with your order code and the email you used to book.',
  semEmailBotao: 'Send an email',
  semEmailAssunto: 'Link to my order',
  ajuda: "Didn't get it? Write to {email}.",
  sairTitulo: 'Done',
  sairTexto: "You won't get any more cart reminders. Emails about your orders will keep arriving as usual.",
  sairErroTitulo: "We couldn't confirm",
  sairErroTexto: 'This link is no longer valid. To leave the list, write to {email}.',
  sairSemLinkTitulo: 'Cart reminders',
  sairSemLinkTexto: 'To stop cart reminders, use the link at the end of the email.',
  voltarSite: 'Go to the website',
};

/** Espanhol neutro, com "tú". */
const ES: TextosConsulta = {
  linkRodape: 'Consultar mi pedido',
  titulo: 'Consultar mi pedido',
  texto: 'Escribe el e-mail de la compra y el código del pedido. Si los datos coinciden, te mandamos el enlace del pedido por e-mail.',
  email: 'E-mail de la compra',
  codigo: 'Código del pedido',
  codigoAjuda: 'Empieza con ON-, como ON-7K3P9Q. Está en la página del pedido y en el voucher.',
  botao: 'Recibir el enlace por e-mail',
  enviando: 'Enviando…',
  prontoTitulo: 'Revisa tu e-mail',
  prontoTexto: 'Si los datos coinciden, el enlace llega a tu e-mail en unos minutos. Fíjate también en la carpeta de spam.',
  outraConsulta: 'Hacer otra consulta',
  erroEmail: 'Revisa el e-mail.',
  erroCodigo: 'El código tiene el formato ON-7K3P9Q.',
  erroLimite: 'Muchos intentos seguidos. Intenta de nuevo en unos minutos.',
  erroGeral: 'No se pudo enviar ahora. Intenta de nuevo en un momento.',
  semEmailTexto: 'Para recibir el enlace de tu pedido, escríbenos a {email} con el código del pedido y el e-mail de la compra.',
  semEmailBotao: 'Enviar e-mail',
  semEmailAssunto: 'Enlace de mi pedido',
  ajuda: '¿No te llegó? Escríbenos a {email}.',
  sairTitulo: 'Listo',
  sairTexto: 'No vas a recibir más recordatorios del carrito. Los e-mails de tus pedidos siguen llegando normalmente.',
  sairErroTitulo: 'No se pudo confirmar',
  sairErroTexto: 'El enlace ya no es válido. Para salir de la lista, escríbenos a {email}.',
  sairSemLinkTitulo: 'Recordatorios del carrito',
  sairSemLinkTexto: 'Para salir de la lista de recordatorios del carrito, usa el enlace que viene al final del e-mail.',
  voltarSite: 'Ir al sitio',
};

/** Espanhol da Argentina, com "vos": o neutro com as frases em que o verbo muda. */
const ES_AR: TextosConsulta = {
  ...ES,
  texto: 'Escribí el e-mail de la compra y el código del pedido. Si los datos coinciden, te mandamos el enlace del pedido por e-mail.',
  prontoTitulo: 'Revisá tu e-mail',
  prontoTexto: 'Si los datos coinciden, el enlace llega a tu e-mail en unos minutos. Fijate también en la carpeta de spam.',
  erroEmail: 'Revisá el e-mail.',
  erroLimite: 'Muchos intentos seguidos. Intentá de nuevo en unos minutos.',
  erroGeral: 'No se pudo enviar ahora. Intentá de nuevo en un momento.',
  semEmailTexto: 'Para recibir el enlace de tu pedido, escribinos a {email} con el código del pedido y el e-mail de la compra.',
  ajuda: '¿No te llegó? Escribinos a {email}.',
  sairErroTexto: 'El enlace ya no es válido. Para salir de la lista, escribinos a {email}.',
  sairSemLinkTexto: 'Para salir de la lista de recordatorios del carrito, usá el enlace que viene al final del e-mail.',
};

export const TEXTOS_CONSULTA: Record<Idioma, TextosConsulta> = { pt: PT, en: EN, es: ES, 'es-ar': ES_AR };

export const textosConsulta = (idioma: Idioma): TextosConsulta => TEXTOS_CONSULTA[idioma];
