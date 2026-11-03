/**
 * ARQUIVO DE DADOS DO TRANSFER PRIVADO (carro ou van, com motorista particular)
 *
 * Como editar:
 * - PREÇOS: em TRAJETOS, por trecho (só ida), por veículo, não por pessoa. São o preço de venda no
 *   cartão; o ajuste geral de preços e o desconto do Pix ficam em src/config/precos.ts. Ida e volta =
 *   a soma dos dois trechos. Um preço `null` deixa aquele veículo "sob cotação" no trajeto.
 * - Qualquer trajeto que não esteja em TRAJETOS (por exemplo, dentro da mesma cidade) é "sob cotação".
 * - LUGARES: a lista de saída e de destino. Os aeroportos já vêm com o ponto de encontro (o desembarque);
 *   as cidades pedem o hotel, a pousada ou o endereço.
 * - MALAS: os limites de cada veículo estão em cabeNoCarro e cabeNaVan.
 */

// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { precoComAjuste } from '../lib/orcamento.ts';

export type Idioma = 'pt' | 'en' | 'es';
type Texto = Record<Idioma, string>;

/** O preço de TRAJETOS com o ajuste geral de preços, em reais. */
const comAjuste = (reais: number) => precoComAjuste(reais) / 100;

/** A região do preço: o Rio (cidade e os dois aeroportos), o aeroporto de Cabo Frio e cada cidade. */
export type Zona = 'rio' | 'aeroporto-cabo-frio' | 'buzios' | 'cabo-frio' | 'arraial-do-cabo' | 'outra';

export type IdLugar =
  'galeao' | 'santos-dumont' | 'aeroporto-cabo-frio' | 'rio-de-janeiro' | 'buzios' | 'cabo-frio' | 'arraial-do-cabo' | 'outra-cidade';

export interface Lugar {
  nome: Texto;
  zona: Zona;
  /** Aeroporto: o motorista espera no desembarque, e o checkout pede o número do voo. */
  aeroporto?: boolean;
}

/** Na ordem em que aparecem na lista: primeiro os aeroportos, depois as cidades. */
export const LUGARES: Record<IdLugar, Lugar> = {
  galeao: {
    nome: { pt: 'Aeroporto do Galeão (GIG), Rio', en: 'Galeão Airport (GIG), Rio', es: 'Aeropuerto de Galeão (GIG), Río' },
    zona: 'rio',
    aeroporto: true,
  },
  'santos-dumont': {
    nome: { pt: 'Aeroporto Santos Dumont (SDU), Rio', en: 'Santos Dumont Airport (SDU), Rio', es: 'Aeropuerto Santos Dumont (SDU), Río' },
    zona: 'rio',
    aeroporto: true,
  },
  'aeroporto-cabo-frio': {
    nome: { pt: 'Aeroporto de Cabo Frio (CFB)', en: 'Cabo Frio Airport (CFB)', es: 'Aeropuerto de Cabo Frio (CFB)' },
    zona: 'aeroporto-cabo-frio',
    aeroporto: true,
  },
  'rio-de-janeiro': { nome: { pt: 'Rio de Janeiro (cidade)', en: 'Rio de Janeiro (city)', es: 'Río de Janeiro (ciudad)' }, zona: 'rio' },
  buzios: { nome: { pt: 'Búzios', en: 'Búzios', es: 'Búzios' }, zona: 'buzios' },
  'cabo-frio': { nome: { pt: 'Cabo Frio', en: 'Cabo Frio', es: 'Cabo Frio' }, zona: 'cabo-frio' },
  'arraial-do-cabo': { nome: { pt: 'Arraial do Cabo', en: 'Arraial do Cabo', es: 'Arraial do Cabo' }, zona: 'arraial-do-cabo' },
  'outra-cidade': { nome: { pt: 'Outra cidade', en: 'Another city', es: 'Otra ciudad' }, zona: 'outra' },
};

export const IDS_LUGARES = Object.keys(LUGARES) as IdLugar[];

/**
 * As fotos reais dos veículos, com as placas borradas (scripts/preparar-fotos-transfer.mjs): a do topo
 * da página e as do trilho de fotos (as de cada veículo estão em VEICULOS).
 */
export const FOTO_TOPO_TRANSFER = '/fotos/transfer/carro-virtus-com-clientes.jpg';
export const FOTOS_TRANSFER = [
  '/fotos/transfer/carros-creta-com-motoristas.jpg',
  '/fotos/transfer/carro-creta-aeroporto.jpg',
  '/fotos/transfer/van-porta-lateral-bancos.jpg',
  '/fotos/transfer/van-traseira-bagageiro.jpg',
  '/fotos/transfer/van-lateral.jpg',
];

export type Veiculo = 'carro' | 'van';

export const VEICULOS: Record<Veiculo, { nome: Texto; modelos: Texto; capacidade: number; malas: Texto; foto: string }> = {
  carro: {
    nome: { pt: 'Carro executivo', en: 'Executive car', es: 'Auto ejecutivo' },
    modelos: {
      pt: 'Corolla, Virtus, Creta, Spin ou similar',
      en: 'Corolla, Virtus, Creta, Spin or similar',
      es: 'Corolla, Virtus, Creta, Spin o similar',
    },
    capacidade: 4,
    malas: {
      pt: 'Até 3 malas médias, ou 2 grandes e 2 de mão',
      en: 'Up to 3 medium suitcases, or 2 large and 2 carry-ons',
      es: 'Hasta 3 valijas medianas, o 2 grandes y 2 de mano',
    },
    foto: '/fotos/transfer/carro-corolla.jpg',
  },
  van: {
    nome: { pt: 'Van executiva', en: 'Executive van', es: 'Van ejecutiva' },
    modelos: { pt: 'Mercedes Sprinter 17+1', en: 'Mercedes Sprinter, 17 seats + driver', es: 'Mercedes Sprinter 17+1' },
    capacidade: 17,
    malas: {
      pt: '1 mala grande e 1 de mão por pessoa',
      en: '1 large suitcase and 1 carry-on per person',
      es: '1 valija grande y 1 de mano por persona',
    },
    foto: '/fotos/transfer/van-frente.jpg',
  },
};

const REGIAO_DOS_LAGOS: Zona[] = ['buzios', 'cabo-frio', 'arraial-do-cabo'];

/** Os trajetos com preço fixo, nos dois sentidos, em reais por trecho e por veículo. */
export const TRAJETOS: { nome: Texto; de: Zona; para: Zona[]; preco: Record<Veiculo, number | null> }[] = [
  {
    nome: {
      pt: 'Rio de Janeiro (cidade, Galeão ou Santos Dumont) ↔ Búzios, Cabo Frio ou Arraial do Cabo',
      en: 'Rio de Janeiro (city, Galeão or Santos Dumont) ↔ Búzios, Cabo Frio or Arraial do Cabo',
      es: 'Río de Janeiro (ciudad, Galeão o Santos Dumont) ↔ Búzios, Cabo Frio o Arraial do Cabo',
    },
    de: 'rio',
    para: REGIAO_DOS_LAGOS,
    preco: { carro: 800, van: 1200 },
  },
  {
    nome: {
      pt: 'Aeroporto de Cabo Frio ↔ Búzios, Cabo Frio ou Arraial do Cabo',
      en: 'Cabo Frio Airport ↔ Búzios, Cabo Frio or Arraial do Cabo',
      es: 'Aeropuerto de Cabo Frio ↔ Búzios, Cabo Frio o Arraial do Cabo',
    },
    de: 'aeroporto-cabo-frio',
    para: REGIAO_DOS_LAGOS,
    preco: { carro: 300, van: 500 },
  },
];

/** O preço de um trecho (só ida) no veículo, em reais; `null` quando o trajeto é sob cotação. */
export function precoTrecho(saida: IdLugar, destino: IdLugar, veiculo: Veiculo): number | null {
  const a = LUGARES[saida].zona;
  const b = LUGARES[destino].zona;
  for (const t of TRAJETOS) {
    if ((t.de === a && t.para.includes(b)) || (t.de === b && t.para.includes(a))) {
      const p = t.preco[veiculo];
      return p === null ? null : comAjuste(p);
    }
  }
  return null;
}

/** O menor preço de um trecho que sai ou chega na zona (para o "a partir de" dos cartões). */
export function menorPrecoDaZona(zona: Zona): number | null {
  const precos = TRAJETOS.filter((t) => t.de === zona || t.para.includes(zona)).flatMap((t) =>
    Object.values(t.preco).filter((p): p is number => p !== null),
  );
  return precos.length ? comAjuste(Math.min(...precos)) : null;
}

export interface Malas {
  grandes: number;
  medias: number;
  mao: number;
}

/** Carro: até 4 pessoas e até 3 malas de despachar (no máximo 2 grandes), mais 2 de mão. */
export function cabeNoCarro(pessoas: number, m: Malas): boolean {
  return pessoas <= VEICULOS.carro.capacidade && m.grandes + m.medias <= 3 && m.grandes <= 2 && m.mao <= 2;
}

/** Van: até 17 pessoas, com 1 mala grande (ou média) e 1 de mão por pessoa. */
export function cabeNaVan(pessoas: number, m: Malas): boolean {
  return pessoas <= VEICULOS.van.capacidade && m.grandes + m.medias <= pessoas && m.mao <= pessoas;
}

/** Transfer não se reserva no mesmo dia: o primeiro dia é amanhã (no fuso de Búzios). */
export function primeiroDiaTransfer(hoje: string): string {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function cabeNoVeiculo(veiculo: Veiculo, pessoas: number, m: Malas): boolean {
  return veiculo === 'carro' ? cabeNoCarro(pessoas, m) : cabeNaVan(pessoas, m);
}

/** O total em reais dos trechos (ida e, se houver, volta) no veículo; `null` quando algum é sob cotação. */
export function totalTransfer(trechos: { saida: IdLugar; destino: IdLugar }[], veiculo: Veiculo): number | null {
  let soma = 0;
  for (const t of trechos) {
    const p = precoTrecho(t.saida, t.destino, veiculo);
    if (p === null) return null;
    soma += p;
  }
  return soma;
}
