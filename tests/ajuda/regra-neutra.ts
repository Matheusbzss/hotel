/**
 * A regra que leva o espanhol da Argentina (o texto que o site tinha antes, com "vos") ao espanhol neutro (com "tú"),
 * palavra por palavra, do jeito que o lote 2 da Etapa 3 reescreveu o /es. Os testes aplicam esta regra a CADA frase
 * argentina do site e exigem que o resultado seja exatamente a frase neutra: assim um erro de digitação em qualquer
 * dos lados, ou uma troca fora da regra, aparece.
 *
 * A ordem importa: primeiro as frases e as palavras com gênero ou preposição ("con vos" → "contigo", "un cuatriciclo"
 * → "una cuatrimoto"), depois os verbos (em minúscula e com inicial maiúscula).
 */

/** Verbos em "vos" → "tú": presente do indicativo e imperativo (com os pronomes colados, que ganham acento). */
export const VERBOS_VOS: Record<string, string> = {
  podés: 'puedes',
  tenés: 'tienes',
  querés: 'quieres',
  elegís: 'eliges',
  necesitás: 'necesitas',
  revisás: 'revisas',
  pagás: 'pagas',
  cancelás: 'cancelas',
  // Etapa 8: "cancelá gratis hasta 24 h antes" (as descrições para o Google)
  cancelá: 'cancela',
  sabés: 'sabes',
  preferís: 'prefieres',
  seguís: 'sigues',
  conocés: 'conoces',
  venís: 'vienes',
  hacés: 'haces',
  salís: 'sales',
  decidís: 'decides',
  alojás: 'alojas',
  viajás: 'viajas',
  recibís: 'recibes',
  llegás: 'llegas',
  perdés: 'pierdes',
  presentás: 'presentas',
  registrás: 'registras',
  terminás: 'terminas',
  completás: 'completas',
  arrepentís: 'arrepientes',
  declarás: 'declaras',
  comprometés: 'comprometes',
  permitís: 'permites',
  pedís: 'pides',
  mandás: 'mandas',
  escribís: 'escribes',
  dependés: 'dependes',
  acordás: 'acuerdas',
  sumás: 'sumas',
  cambiás: 'cambias',
  navegás: 'navegas',
  animás: 'animas',
  buscás: 'buscas',
  aprendés: 'aprendes',
  manejás: 'manejas',
  armás: 'armas',
  disfrutás: 'disfrutas',
  reservás: 'reservas',
  paseás: 'paseas',
  sos: 'eres',
  // imperativos
  reservá: 'reserva',
  llegá: 'llega',
  disfrutá: 'disfruta',
  elegí: 'elige',
  mirá: 'mira',
  armá: 'arma',
  poné: 'pon',
  probá: 'prueba',
  pensá: 'piensa',
  entrá: 'entra',
  contá: 'cuenta',
  dejá: 'deja',
  llevá: 'lleva',
  evitá: 'evita',
  esperá: 'espera',
  sacá: 'saca',
  calculá: 'calcula',
  pedí: 'pide',
  sumá: 'suma',
  conocé: 'conoce',
  confirmá: 'confirma',
  indicá: 'indica',
  seguí: 'sigue',
  revisá: 'revisa',
  pagá: 'paga',
  completá: 'completa',
  ingresá: 'ingresa',
  intentá: 'intenta',
  tocá: 'toca',
  embarcá: 'embarca',
  hablá: 'habla',
  compará: 'compara',
  cuidá: 'cuida',
  guardá: 'guarda',
  seleccioná: 'selecciona',
  avisá: 'avisa',
  recibí: 'recibe',
  pegá: 'pega',
  escaneá: 'escanea',
  abrí: 'abre',
  hacé: 'haz',
  usá: 'usa',
  escribí: 'escribe',
  escapá: 'escapa',
  manejá: 'maneja',
  presentá: 'presenta',
  // "consulte" (usted) virou "consultá" no es-ar e "consulta" no neutro
  consultá: 'consulta',
  // com pronome colado
  fijate: 'fíjate',
  acordate: 'acuérdate',
  escribinos: 'escríbenos',
  contactanos: 'contáctanos',
  avisanos: 'avísanos',
  avisame: 'avísame',
  mandanos: 'mándanos',
  decinos: 'dinos',
  dejanos: 'déjanos',
  mostralo: 'muéstralo',
  mostralos: 'muéstralos',
  mostraselo: 'muéstraselo',
  llevalo: 'llévalo',
  sumale: 'súmale',
  confirmalas: 'confírmalas',
  confirmalos: 'confírmalos',
  informanos: 'infórmanos',
  envianos: 'envíanos',
  envialo: 'envíalo',
};

/**
 * Frases e palavras, na ordem de aplicação: "vos" com preposição, "ustedes", gênero (cuatrimoto, dunas e llegadas são
 * femininos), as palavras argentinas decididas pelo dono e as trocas extras que os tradutores relataram.
 */
export const FRASES_ARGENTINAS: [string, string][] = [
  ['con vos', 'contigo'],
  ['a vos', 'a ti'],
  ['para vos', 'para ti'],
  ['de vos', 'de ti'],
  ['por vos', 'por ti'],
  ['vos', 'tú'],
  ['Vos', 'Tú'],
  ['con ustedes', 'contigo y tu grupo'],
  // médanos → dunas (feminino)
  ['Los Médanos do Peró', 'Las Dunas do Peró'],
  ['los Médanos', 'las Dunas'],
  ['los médanos', 'las dunas'],
  ['Médanos', 'Dunas'],
  ['médanos', 'dunas'],
  // cuatriciclo → cuatrimoto (feminino)
  ['el [cuatriciclo]', 'la [cuatrimoto]'],
  ['el cuatriciclo', 'la cuatrimoto'],
  ['un cuatriciclo rojo', 'una cuatrimoto roja'],
  ['un cuatriciclo', 'una cuatrimoto'],
  ['propio cuatriciclo', 'propia cuatrimoto'],
  ['cuatriciclo rojo', 'cuatrimoto roja'],
  ['los cuatriciclos', 'las cuatrimotos'],
  ['cuatriciclos', 'cuatrimotos'],
  ['Cuatriciclo', 'Cuatrimoto'],
  ['cuatriciclo', 'cuatrimoto'],
  // crianças, malas, chegadas, aqui
  ['Chicos', 'Niños'],
  ['chicos', 'niños'],
  ['chico', 'niño'],
  ['Valijas', 'Maletas'],
  ['valijas', 'maletas'],
  ['valija', 'maleta'],
  ['arribos', 'llegadas'],
  ['Acá', 'Aquí'],
  ['acá', 'aquí'],
  // trocas extras relatadas pelos tradutores (a confirmar com o dono; o es-ar guarda a palavra argentina)
  ['una seña', 'un anticipo'],
  ['Seña', 'Anticipo'],
  ['seña', 'anticipo'],
  ['resúmenes', 'estados de cuenta'],
  ['el resumen', 'el estado de cuenta'],
  ['Campera', 'Chaqueta'],
  ['A la mañana', 'Por la mañana'],
  ['a la mañana', 'por la mañana'],
  ['A la tarde', 'Por la tarde'],
  ['a la tarde', 'por la tarde'],
  ['salir a la noche', 'salir por la noche'],
  ['arrancar por el mar', 'empezar por el mar'],
  ['paradores', 'bares'],
  // o exemplo de telefone do checkout: argentino/uruguaio no es-ar, chileno no es (DDI padrão +56)
  ['+54 9 11 1234-5678 o +598 99 123 456', '+56 9 1234 5678 o +54 9 11 1234-5678'],
  // textos alternativos das fotos
  ['Brochette', 'Brocheta'],
  ['picadas', 'aperitivos'],
  ['Baúl', 'Maletero'],
  // as casas (Etapa 7): na Argentina, "hamaca" é o balanço e a rede é "hamaca paraguaya"; lavarropas, heladera e mesada
  // são a lavadora, o refrigerador e a cubierta (a bancada) do neutro. As frases mais longas vêm antes das curtas.
  ['Lavadero con lavarropas y pileta', 'Lavandería con lavadora y lavadero'],
  ['Lavadero con lavarropas', 'Lavandería con lavadora'],
  ['Hamaca paraguaya', 'Hamaca'],
  ['hamaca paraguaya', 'hamaca'],
  ['hamacas', 'columpios'],
  ['heladera', 'refrigerador'],
  ['mesada', 'cubierta'],
];

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const inteira = (w: string) => new RegExp(`(?<!\\p{L})${escapar(w)}(?!\\p{L})`, 'gu');
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** O espanhol neutro a partir do argentino. */
export function neutroDoArgentino(texto: string): string {
  let s = texto;
  for (const [de, para] of FRASES_ARGENTINAS) s = s.replace(inteira(de), para);
  for (const [de, para] of Object.entries(VERBOS_VOS)) {
    s = s.replace(inteira(de), para).replace(inteira(capitalizar(de)), capitalizar(para));
  }
  return s;
}

/**
 * Palavras do espanhol neutro que terminam em -á/-é/-í(s) sem serem verbo em "vos" (em minúscula, como a varredura
 * compara): a varredura por terminação, que pega qualquer forma de vos, inclusive as que não estão na lista acima,
 * ignora só estas. Nomes próprios (Geribá, José, Maracaná) e o pretérito "llegué" entram aqui; "sofá" e "sofás" vieram
 * com as casas (Etapa 7).
 */
export const INOCENTES_COM_ACENTO_FINAL = new Set(
  `más qué está estás sí así ahí aquí allí después demás además detrás atrás través país interés café josé geribá maracaná
  portugués inglés francés cortés quizás jamás resolverá cobrará devolverá llegará tardará leí llegué prevé revés sofá sofás`
    .split(/\s+/)
    .filter(Boolean),
);

/** As palavras (só letras, em minúscula) de um texto. */
export const palavras = (s: string): string[] => (s.match(/\p{L}+/gu) ?? []).map((t) => t.toLowerCase());

/** As palavras de um texto que parecem verbo em "vos" (terminação -á/-é/-í, com ou sem "s") e não são inocentes. */
export function suspeitasDeVos(texto: string): string[] {
  return palavras(texto).filter((p) => /(á|é|í)s?$/u.test(p) && !INOCENTES_COM_ACENTO_FINAL.has(p));
}
