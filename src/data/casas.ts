import type { Cidade, Lista, Texto } from './passeios';

/**
 * CASAS DE TEMPORADA — área separada dos passeios, desligada até fechar as primeiras parcerias.
 *
 * Como ativar:
 * 1. Cadastre as casas na lista CASAS abaixo (fotos em /public/fotos/casas/<slug>/).
 * 2. Mude CASAS_ATIVO para true.
 * Com CASAS_ATIVO = false, a página /casas-de-temporada mostra "Em breve" com o convite para
 * proprietários, fica fora do menu e do sitemap e não aparece no Google.
 *
 * A reserva das casas é sempre pelo WhatsApp (consulta de datas), sem checkout.
 */
export const CASAS_ATIVO = false;

export interface Casa {
  slug: string;
  ativo?: boolean;
  cidade: Exclude<Cidade, 'rio-de-janeiro'>;
  nome: Texto;
  resumo: Texto;
  quartos: number;
  hospedes: number;
  /** Diária a partir de (em reais). Deixe sem para mostrar "sob consulta". */
  diariaAPartir?: number;
  destaques: Lista;
  fotos: string[];
}

export const CASAS: Casa[] = [
  // Exemplo (copie, preencha e tire o comentário):
  // {
  //   slug: 'casa-geriba',
  //   cidade: 'buzios',
  //   nome: { pt: 'Casa Geribá', en: 'Geribá House', es: 'Casa Geribá' },
  //   resumo: { pt: 'A 300 m da praia de Geribá, com piscina.', en: '300 m from Geribá beach, with a pool.', es: 'A 300 m de la playa de Geribá, con pileta.' },
  //   quartos: 3,
  //   hospedes: 8,
  //   diariaAPartir: 900,
  //   destaques: { pt: ['Piscina', 'Wi-Fi', '2 vagas'], en: ['Pool', 'Wi-Fi', '2 parking spaces'], es: ['Pileta', 'Wi-Fi', '2 cocheras'] },
  //   fotos: ['/fotos/casas/casa-geriba/1.jpg'],
  // },
];

export const casasAtivas = () => (CASAS_ATIVO ? CASAS.filter((c) => c.ativo !== false) : []);
