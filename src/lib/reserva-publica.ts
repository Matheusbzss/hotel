import { timingSafeEqual } from 'node:crypto';
import { obterPasseio } from '@/data/passeios';
import type { Idioma } from '@/i18n/config';
import type { Reserva, StatusReserva } from './reservas';
import { NOME_CIDADE_HOSPEDAGEM } from './validacao';

/** Dados da reserva que podem aparecer para o cliente (com o link secreto). */
export interface ReservaPublica {
  codigo: string;
  status: StatusReserva;
  passeioSlug: string;
  passeioNome: string;
  data: string;
  adultos: number;
  criancas: number;
  unidades: number;
  totalCentavos: number;
  nome: string;
  hotel: string;
  cidadeHospedagem: string;
  metodo: Reserva['pagamento']['metodo'];
  pixCopiaECola?: string;
  pixExpiraEm?: string;
  cartaoFinal?: string;
}

export function tokenConfere(reserva: Reserva, token: string | undefined | null): boolean {
  if (!token) return false;
  const a = Buffer.from(reserva.token);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function paraPublico(r: Reserva, idioma: Idioma): ReservaPublica {
  const p = obterPasseio(r.passeio.slug);
  return {
    codigo: r.codigo,
    status: r.status,
    passeioSlug: r.passeio.slug,
    passeioNome: p?.nome[idioma] ?? r.passeio.nome,
    data: r.data,
    adultos: r.adultos,
    criancas: r.criancas,
    unidades: r.unidades,
    totalCentavos: r.totalCentavos,
    nome: r.cliente.nome,
    hotel: r.hospedagem.hotel,
    cidadeHospedagem: NOME_CIDADE_HOSPEDAGEM[r.hospedagem.cidade],
    metodo: r.pagamento.metodo,
    pixCopiaECola: r.status === 'pendente' ? r.pagamento.pixCopiaECola : undefined,
    pixExpiraEm: r.status === 'pendente' ? r.pagamento.pixExpiraEm : undefined,
    cartaoFinal: r.pagamento.cartaoFinal,
  };
}
