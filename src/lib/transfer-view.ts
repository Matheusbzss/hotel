import { LUGARES, VEICULOS, type Malas } from '@/data/transfer';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { formatarHora } from './horarios';
import type { PontaTransfer, ReservaTransfer, TrechoTransfer } from './reservas';

type T = Dicionario['transfer'];

/** "Búzios, Pousada X" ou "Aeroporto do Galeão (GIG), Rio". */
export function nomePonta(p: PontaTransfer, idioma: Idioma): string {
  const lugar = texto(LUGARES[p.lugar].nome, idioma);
  return p.endereco ? `${lugar}, ${p.endereco}` : lugar;
}

export function textoPassageiros(n: number, T: T): string {
  return n === 1 ? T.umPassageiro : fmt(T.nPassageiros, { n });
}

/** "Grandes (23 kg): 2 · De mão: 2", só com o que a pessoa leva. */
export function textoMalas(m: Malas, T: T): string {
  const partes: [string, number][] = [
    [T.malasGrandes, m.grandes],
    [T.malasMedias, m.medias],
    [T.malasMao, m.mao],
  ];
  const com = partes.filter(([, n]) => n > 0).map(([rotulo, n]) => `${rotulo}: ${n}`);
  return com.length ? com.join(' · ') : T.semMalas;
}

/** "2 (3 e 7 anos)": quantas cadeirinhas e a idade de cada criança. */
export function textoCadeirinhas(idades: number[], idioma: Idioma, T: T): string | undefined {
  if (!idades.length) return undefined;
  const lista = new Intl.ListFormat(LOCALE_INTL[idioma], { type: 'conjunction' }).format(
    idades.map((i) => (i === 0 ? T.idadeZero : String(i))),
  );
  return `${idades.length} (${fmt(T.anos, { idades: lista })})`;
}

export interface TrechoVisivel {
  saida: string;
  destino: string;
  data: string;
  /** A hora no idioma ("14h30", "14:30 h", "2:30pm"). */
  hora: string;
  voo?: string;
}

export interface TransferVisivel {
  veiculo: string;
  ida: TrechoVisivel;
  volta?: TrechoVisivel;
  passageiros: string;
  malas: string;
  cadeirinhas?: string;
}

/** O transfer pronto para mostrar no voucher (tela e PDF) e no painel, no idioma escolhido. */
export function transferVisivel(r: ReservaTransfer, idioma: Idioma, d: Dicionario): TransferVisivel {
  const t = r.transfer;
  const trecho = (x: TrechoTransfer): TrechoVisivel => ({
    saida: nomePonta(x.saida, idioma),
    destino: nomePonta(x.destino, idioma),
    data: x.data,
    hora: formatarHora(x.hora, idioma),
    voo: x.voo,
  });
  return {
    veiculo: texto(VEICULOS[t.veiculo].nome, idioma),
    ida: trecho(t.ida),
    volta: t.volta ? trecho(t.volta) : undefined,
    passageiros: textoPassageiros(t.passageiros, d.transfer),
    malas: textoMalas(t.malas, d.transfer),
    cadeirinhas: textoCadeirinhas(t.cadeirinhas, idioma, d.transfer),
  };
}
