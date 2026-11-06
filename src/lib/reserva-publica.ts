import { timingSafeEqual } from 'node:crypto';
import { obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import type { Idioma } from '@/i18n/config';
import { formatarHora } from './horarios';
import { semFaixas } from './passeio-view';
import { valorRecebido } from './pedidos-painel';
import { textoPessoas } from './pessoas';
import { ehTransfer, type Reserva, type StatusReserva } from './reservas';
import { transferVisivel, type TransferVisivel } from './transfer-view';
import { NOME_CIDADE_HOSPEDAGEM } from './validacao';

/** Dados da reserva que podem aparecer para o cliente (com o link secreto). */
export interface ReservaPublica {
  codigo: string;
  status: StatusReserva;
  tipo: 'passeio' | 'transfer';
  /** No transfer, "transfer" (o código do produto no Pixel). */
  passeioSlug: string;
  /** No transfer, "Transfer privado". */
  passeioNome: string;
  data: string;
  /** A hora no idioma da página ("9h", "9am") e se é a da busca na hospedagem. */
  horario?: { texto: string; busca: boolean };
  adultos: number;
  criancas: number;
  /** "2 adultos + 1 criança (meia)", ou "4 passageiros" no transfer, no idioma da página. */
  pessoasTexto: string;
  /** Opção escolhida (ex.: "2 horas"), quando o passeio tem opções. */
  opcaoNome?: string;
  unidades: number;
  totalCentavos: number;
  /** O total no Pix, enquanto a reserva espera o pagamento pelo WhatsApp. */
  totalPixCentavos?: number;
  nome: string;
  hotel: string;
  cidadeHospedagem: string;
  /** Só no transfer: veículo, trechos, malas e cadeirinhas, já no idioma da página. */
  transfer?: TransferVisivel;
  metodo: Reserva['pagamento']['metodo'];
  /** Só no voucher de um pedido do carrinho com vários itens. */
  pedidoCodigo?: string;
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
  const d = dicionario(idioma);
  const pagamento = {
    // pago no Pix, o cliente vê o que pagou, com o desconto
    totalCentavos: valorRecebido(r),
    totalPixCentavos: r.status === 'aguardando_whatsapp' ? r.totalPixCentavos : undefined,
    nome: r.cliente.nome,
    metodo: r.pagamento.metodo,
    pedidoCodigo: r.pedido?.codigo,
    pixCopiaECola: r.status === 'pendente' ? r.pagamento.pixCopiaECola : undefined,
    pixExpiraEm: r.status === 'pendente' ? r.pagamento.pixExpiraEm : undefined,
    cartaoFinal: r.pagamento.cartaoFinal,
  };
  if (ehTransfer(r)) {
    const transfer = transferVisivel(r, idioma, d);
    return {
      codigo: r.codigo,
      status: r.status,
      tipo: 'transfer',
      passeioSlug: 'transfer',
      passeioNome: d.transfer.titulo,
      data: r.data,
      adultos: r.transfer.passageiros,
      criancas: 0,
      pessoasTexto: transfer.passageiros,
      unidades: 1,
      hotel: '',
      cidadeHospedagem: '',
      transfer,
      ...pagamento,
    };
  }
  const p = obterPasseio(r.passeio.slug);
  const opcao = r.passeio.opcao ? p?.opcoes?.find((o) => o.id === r.passeio.opcao?.id) : undefined;
  return {
    codigo: r.codigo,
    status: r.status,
    tipo: 'passeio',
    passeioSlug: r.passeio.slug,
    passeioNome: p?.nome[idioma] ?? r.passeio.nome,
    data: r.data,
    horario: r.horario ? { texto: formatarHora(r.horario.hora, idioma), busca: r.horario.busca } : undefined,
    adultos: r.adultos,
    criancas: r.criancas,
    pessoasTexto: textoPessoas(r, d.comum.rotulos, p ? semFaixas(p) : false),
    opcaoNome: opcao?.nome[idioma] ?? r.passeio.opcao?.nome,
    unidades: r.unidades,
    hotel: r.hospedagem.hotel,
    cidadeHospedagem: NOME_CIDADE_HOSPEDAGEM[r.hospedagem.cidade],
    ...pagamento,
  };
}
