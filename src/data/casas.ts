import type { TabelaDiarias } from '@/lib/diarias';
import type { Cidade, Lista, Texto } from './passeios';

/**
 * CASAS DE TEMPORADA DA ORLA NATIVA: casas nossas, de alto padrão, com 5 quartos ou mais, de frente
 * para a praia, reservadas no site com sinal de SINAL_PORCENTO (src/lib/diarias.ts) do total.
 *
 * Como cadastrar uma casa (com as fotos, as informações e o endereço que o dono mandar):
 * 1. Fotos em /public/fotos/casas/<slug>/ (a primeira é a capa).
 * 2. Copie o MODELO do fim deste arquivo para dentro de CASAS e preencha. Não invente nada: o que o
 *    dono não mandou, pergunte.
 * 3. O mapa da localização aproximada sai sozinho da foto de satélite do site (/mapa/casas/<slug>).
 * Enquanto CASAS estiver vazia, a página mostra "Em breve", e "Casas" fica fora do menu e do Google.
 *
 * DIÁRIAS (as contas estão em src/lib/diarias.ts): `diaria` vale fora dos períodos; um período de
 * `temporadas` troca a diária naquelas noites, e um de `feriados` vale por cima da temporada. Cada
 * período pode ter o próprio mínimo de noites.
 * As datas são da primeira e da última NOITE do período (AAAA-MM-DD).
 */

export type CidadeCasa = Exclude<Cidade, 'rio-de-janeiro'>;

export interface Casa extends TabelaDiarias {
  slug: string;
  ativo?: boolean;
  cidade: CidadeCasa;
  nome: Texto;
  /** A praia ou o bairro, que aparece antes da reserva ("Praia de Geribá"). */
  local: Texto;
  /** O endereço exato: só no voucher, depois da reserva paga. */
  endereco: string;
  /**
   * Um ponto PERTO da casa (por exemplo, o meio da praia), não a casa: o mapa mostra a área em volta,
   * com um círculo.
   */
  pontoAproximado: { lat: number; lng: number };
  resumo: Texto;
  descricao: Texto;
  quartos: number;
  suites: number;
  banheiros: number;
  /** Quantas pessoas a casa recebe. */
  capacidade: number;
  /** Ex.: ['3 camas de casal', '4 camas de solteiro']. */
  camas: Lista;
  comodidades: Lista;
  regras: Lista;
  /** As regras de cancelamento da casa (a política do site manda olhar aqui). */
  cancelamento: Lista;
  /** Horários como '15h' ou '15h30'. */
  checkIn: string;
  checkOut: string;
  /** Em reais. */
  caucao: number;
  fotos: string[];
}

export const CASAS: Casa[] = [];

/**
 * false até existir o pagamento das casas (Fase 3): a página mostra o calendário e a conta, e no lugar
 * do botão de reservar avisa que a reserva abre em breve.
 */
export const RESERVA_CASAS_ABERTA = false;

export const casasAtivas = (): Casa[] => CASAS.filter((c) => c.ativo !== false);
/** "Casas" só entra no menu, no mapa do site e no Google quando há casa no ar. */
export const CASAS_NO_AR = casasAtivas().length > 0;

export function obterCasa(slug: string): Casa | undefined {
  return casasAtivas().find((c) => c.slug === slug);
}

/*
MODELO para copiar para dentro de CASAS (preencha só com o que o dono mandar):
{
  slug: 'nome-da-casa',
  cidade: 'buzios',
  nome: { pt: '', en: '', es: '' },
  local: { pt: 'Praia de ...', en: '... beach', es: 'Playa de ...' },
  endereco: '',
  pontoAproximado: { lat: 0, lng: 0 },
  resumo: { pt: '', en: '', es: '' },
  descricao: { pt: '', en: '', es: '' },
  quartos: 5,
  suites: 0,
  banheiros: 0,
  capacidade: 0,
  camas: { pt: [], en: [], es: [] },
  comodidades: { pt: [], en: [], es: [] },
  regras: { pt: [], en: [], es: [] },
  cancelamento: { pt: [], en: [], es: [] },
  checkIn: '',
  checkOut: '',
  diaria: 0,
  minimoNoites: 0,
  temporadas: [],
  feriados: [],
  taxaLimpeza: 0,
  caucao: 0,
  fotos: [],
},
*/
