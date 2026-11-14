import type { Texto } from './passeios';

/**
 * AS REGRAS DE TODAS AS CASAS (FASE-4, Etapa 7, decisão do dono de 07/11) e a política de cancelamento delas. Valem
 * para as casas de hoje e para as próximas: a página da casa (src/lib/casa-pagina.ts) junta estas com as regras
 * próprias de cada casa (evento, fumar, escadas e câmeras, em src/data/comodidades.ts), e o cadastro
 * (scripts/dados/casas.ts) grava as mesmas frases nas colunas antigas de regras e cancelamento.
 *
 * Os textos são neutros (sem "tú" nem "vos"): servem às duas versões do espanhol.
 */

export const REGRAS_DAS_CASAS = {
  entradaSaida: {
    pt: 'Entrada a partir das 15h e saída até as 12h',
    es: 'Entrada desde las 15 h y salida hasta las 12 h',
    en: 'Check-in from 3 p.m. and check-out by noon',
  },
  pet: { pt: 'Não aceita animais de estimação', es: 'No se aceptan mascotas', en: 'No pets allowed' },
  silencio: {
    pt: 'Silêncio das 22h às 8h, sujeito a multa',
    es: 'Silencio de 22 h a 8 h, sujeto a multa',
    en: 'Quiet hours from 10 p.m. to 8 a.m., subject to a fine',
  },
  // o FASE-4 pede a placa e diz para que serve; a portaria só "quando houver" (não se sabe se a Ferradura tem uma)
  cadastro: {
    pt: 'Cadastro de todos os hóspedes depois do pagamento (nome completo e documento, e a placa do carro, se vierem de carro), para a nossa segurança e a portaria, quando houver',
    es: 'Registro de todos los huéspedes después del pago (nombre completo y documento, y la patente del auto, si vienen en auto), para nuestra seguridad y la portería, cuando la haya',
    en: 'All guests are registered after payment (full name, ID and, if arriving by car, the license plate), for our security and the gatehouse, where there is one',
  },
  recepcao: {
    pt: 'Nossa equipe recebe os hóspedes e entrega a chave; o horário de chegada é combinado pelo WhatsApp depois do pagamento',
    es: 'Nuestro equipo recibe a los huéspedes y entrega la llave; la hora de llegada se coordina por WhatsApp después del pago',
    en: 'Our team welcomes guests and hands over the key; the arrival time is arranged on WhatsApp after payment',
  },
} as const satisfies Record<string, Texto>;

/** O limite de hóspedes da casa: os lugares nas camas (regra do dono, 07/11). */
export const regraDeHospedes = (capacidade: number): Texto => ({
  pt: `Até ${capacidade} hóspedes`,
  es: `Hasta ${capacidade} huéspedes`,
  en: `Up to ${capacidade} guests`,
});

/** As regras de todas as casas, na ordem das colunas antigas (o cadastro grava assim). */
export function regrasDeTodasAsCasas(capacidade: number): Texto[] {
  const r = REGRAS_DAS_CASAS;
  return [r.entradaSaida, regraDeHospedes(capacidade), r.pet, r.silencio, r.cadastro, r.recepcao];
}

/**
 * As câmeras do lado de fora: a página tem de avisar onde ficam, se houver (recortar a foto não dispensa o aviso). Sem
 * resposta do dono (null), nada se escreve sobre câmeras.
 */
export function regraDeCameras(cameras: { tem: false } | { tem: true; onde: Texto } | null): Texto | null {
  if (!cameras) return null;
  if (!cameras.tem) return { pt: 'Sem câmeras do lado de fora', es: 'Sin cámaras exteriores', en: 'No outdoor cameras' };
  const { onde } = cameras;
  return {
    pt: `Câmeras do lado de fora: ${onde.pt}`,
    es: `Cámaras exteriores: ${onde.es}`,
    en: `Outdoor cameras: ${onde.en}`,
    ...(onde['es-ar'] ? { 'es-ar': `Cámaras exteriores: ${onde['es-ar']}` } : {}),
  };
}

/** A política de cancelamento das casas (decisão recomendada da pendência 3: o dono confirma antes de publicar). */
export const CANCELAMENTO_DAS_CASAS: Texto[] = [
  {
    pt: 'Cancelamento grátis até 30 dias antes da entrada',
    es: 'Cancelación gratis hasta 30 días antes de la entrada',
    en: 'Free cancellation up to 30 days before check-in',
  },
  {
    pt: 'Arrependimento em até 7 dias depois da compra, desde que antes da entrada, com devolução total',
    es: 'Derecho de arrepentimiento hasta 7 días después de la compra, siempre que sea antes de la entrada, con devolución total',
    en: 'Change of mind within 7 days of purchase, as long as it is before check-in, with a full refund',
  },
  {
    pt: 'Cancelando a menos de 30 dias da entrada (fora dos 7 dias), o sinal de 50% pago no site não é devolvido e o restante não é cobrado',
    es: 'Si se cancela a menos de 30 días de la entrada (fuera de los 7 días), el 50% pagado en el sitio no se devuelve y el resto no se cobra',
    en: 'If cancelled less than 30 days before check-in (outside the 7 days), the 50% paid on the site is not refunded and the balance is not charged',
  },
];
