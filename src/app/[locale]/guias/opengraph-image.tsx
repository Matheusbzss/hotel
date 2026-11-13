import { EMPRESA } from '@/config/empresa';
import { TAMANHO_OG, previaDaPagina } from '@/lib/og';

export const size = TAMANHO_OG;
export const contentType = 'image/jpeg';
export const alt = EMPRESA.marca;

/** Prévia da lista de guias. */
export default function Imagem() {
  return previaDaPagina({
    foto: '/fotos/buzios/por-do-sol-barcos-na-baia.jpg',
    titulo: 'Guías de viaje',
    texto: 'Búzios, Arraial do Cabo y Cabo Frio: qué hacer, cómo llegar y cuándo ir.',
  });
}
