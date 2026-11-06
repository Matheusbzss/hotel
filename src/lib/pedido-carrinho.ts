import 'server-only';
import type { Idioma } from '@/i18n/config';
import type { Conferida } from './carrinho-servidor';
import type { TrechoEscolhido } from './carrinho';
import { obterOpcao, temOpcoes } from './precos';
import type { NovaReserva, ReservaPasseio, TrechoTransfer } from './reservas';

/** O que o titular informa uma vez só no checkout do carrinho. */
export interface DadosDoPedido {
  idioma: Idioma;
  cliente: { nome: string; email: string; telefone: string };
  hospedagem?: ReservaPasseio['hospedagem'];
  observacoes?: string;
}

/** O que o checkout pergunta de cada transfer. */
export interface ExtrasTransfer {
  vooIda: string;
  vooVolta: string;
  cadeirinhas: number[];
}

/**
 * A reserva de um item do carrinho, com os mesmos dados que o checkout de um item só grava. O pagamento
 * é o que funciona hoje: a equipe finaliza pelo WhatsApp, no Pix ou no cartão.
 */
export function reservaDoItem(c: Extract<Conferida, { ok: true }>, dados: DadosDoPedido, extras?: ExtrasTransfer): NovaReserva {
  const comum = {
    idioma: dados.idioma,
    status: 'aguardando_whatsapp' as const,
    totalCentavos: c.totalCentavos,
    totalPixCentavos: c.totalPixCentavos,
    cliente: dados.cliente,
    observacoes: dados.observacoes,
    pagamento: { metodo: 'whatsapp' as const },
  };

  if ('passeio' in c) {
    if (!dados.hospedagem) throw new Error('Passeio sem hospedagem');
    const { passeio: p, escolha: e, orc } = c;
    const opcao = temOpcoes(p) ? obterOpcao(p, e.opcao) : undefined;
    return {
      ...comum,
      passeio: {
        slug: p.slug,
        nome: p.nome.pt,
        cidade: p.cidade,
        unidade: p.unidade,
        ...(opcao ? { opcao: { id: opcao.id, nome: opcao.nome.pt } } : {}),
      },
      data: e.data,
      horario: { hora: e.hora, busca: c.busca },
      adultos: e.adultos,
      criancas: e.meia + e.gratis,
      criancasMeia: e.meia,
      criancasGratis: e.gratis,
      unidades: orc.unidades,
      hospedagem: dados.hospedagem,
    };
  }

  const e = c.escolha;
  const trecho = (t: TrechoEscolhido, precoCentavos: number, voo = ''): TrechoTransfer => ({
    ...t,
    ...(voo ? { voo: voo.toUpperCase() } : {}),
    precoCentavos,
  });
  return {
    ...comum,
    tipo: 'transfer',
    data: e.ida.data,
    transfer: {
      veiculo: e.veiculo,
      ida: trecho(e.ida, c.trechosCentavos[0], extras?.vooIda),
      ...(e.volta ? { volta: trecho(e.volta, c.trechosCentavos[1], extras?.vooVolta) } : {}),
      passageiros: e.passageiros,
      malas: e.malas,
      cadeirinhas: extras?.cadeirinhas ?? [],
    },
  };
}
