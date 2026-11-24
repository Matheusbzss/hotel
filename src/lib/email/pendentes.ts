import 'server-only';
import { JANELA_DOS_PENDENTES_MS, PENDENTES_POR_RODADA, pedidosSemEmailDoPagamento } from '../emails-pendentes';
import { mensagemDoErro } from '../erros.ts';
import { listarPagosDesde, obterReservaDoPedido } from '../reservas';
import { emailLigado } from './enviar';
import { AVISO_EMAIL_PAGO_SAINDO, MARCA_DO_EMAIL } from './marcas';
import { enviarEmailDoPedido } from './pedidos';

/** Quanto tempo uma rodada envia (a rota tem 60 s; sobra folga para responder). */
const TEMPO_DA_RODADA_MS = 40_000;

export interface ResumoDosEmailsPendentes {
  ok: boolean;
  /** Sem RESEND_API_KEY: nada foi lido nem enviado. */
  desligado?: true;
  erro?: string;
  /** Pedidos pagos nas últimas 48 horas (todos, com ou sem o e-mail). */
  pagos: number;
  /** Os que estavam sem nenhum sinal do e-mail do pagamento aprovado e entraram nesta rodada. */
  tentados: number;
  /** Os que ganharam a linha do envio no histórico. */
  enviados: number;
  /** Os que não saíram: o aviso gravado antes do envio fica no histórico, e o painel destaca. */
  naoSairam: number;
  /** Os que passaram do limite da rodada ou do tempo: ficam para a próxima. */
  paraDepois: number;
}

/**
 * Uma rodada do agendamento do e-mail do pagamento aprovado que não saiu (Pacote 25, achado B1; a regra em
 * src/lib/emails-pendentes.ts): lê os pedidos pagos das últimas 48 horas, escolhe os que estão sem nenhum sinal do e-mail
 * há 10 minutos ou mais e manda o e-mail pelo código de sempre (enviarEmailDoPedido), um de cada vez, esperando cada um. É
 * esse código que grava o aviso antes de enviar (o painel destaca se o envio falhar) e que não manda duas vezes (a linha
 * no histórico e a chave de idempotência do Resend, `pagamento-aprovado/<pedido>`). O aviso de compra para a Meta não é
 * mandado de novo. Uma linha no registro do servidor por pedido e uma por rodada, só com códigos e números.
 */
export async function enviarEmailsPendentes(agora: Date = new Date()): Promise<ResumoDosEmailsPendentes> {
  const resumo: ResumoDosEmailsPendentes = { ok: true, pagos: 0, tentados: 0, enviados: 0, naoSairam: 0, paraDepois: 0 };
  if (!emailLigado()) {
    console.log('[emails-pendentes] desligado (sem RESEND_API_KEY): nada lido nem enviado');
    return { ...resumo, desligado: true };
  }
  try {
    const pagos = await listarPagosDesde(new Date(agora.getTime() - JANELA_DOS_PENDENTES_MS));
    resumo.pagos = pagos.length;
    const { escolhidos, fora } = pedidosSemEmailDoPagamento(pagos, agora, PENDENTES_POR_RODADA);
    resumo.paraDepois = fora;
    const fimDaRodada = Date.now() + TEMPO_DA_RODADA_MS;
    for (const [n, p] of escolhidos.entries()) {
      if (Date.now() > fimDaRodada) {
        resumo.paraDepois += escolhidos.length - n;
        break;
      }
      resumo.tentados++;
      try {
        await enviarEmailDoPedido('pagamento-aprovado', p.codigo);
        // relido depois do envio: a linha do envio só entra quando o Resend aceitou o e-mail
        const depois = await obterReservaDoPedido(p.codigo);
        const linhas = depois?.historico.map((h) => h.evento) ?? [];
        if (linhas.some((e) => e.startsWith(MARCA_DO_EMAIL['pagamento-aprovado']))) {
          resumo.enviados++;
          console.log(`[emails-pendentes] ${p.codigo}: pago em ${p.pagoEm} sem o e-mail do pagamento aprovado; enviado agora`);
        } else {
          resumo.naoSairam++;
          const aviso = linhas.some((e) => e.startsWith(AVISO_EMAIL_PAGO_SAINDO)) ? 'o aviso ficou no painel' : 'sem o aviso no histórico';
          console.error(`[emails-pendentes] ${p.codigo}: pago em ${p.pagoEm} sem o e-mail do pagamento aprovado; não saiu (${aviso})`);
        }
      } catch (e) {
        resumo.naoSairam++;
        console.error(`[emails-pendentes] ${p.codigo}: o envio falhou (${mensagemDoErro(e)})`);
      }
    }
  } catch (e) {
    resumo.ok = false;
    resumo.erro = mensagemDoErro(e);
  }
  console.log(`[emails-pendentes] rodada ${JSON.stringify(resumo)}`);
  return resumo;
}
