import { createHash, timingSafeEqual } from 'node:crypto';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { codigoValido } from './codigo-reserva.ts';
import { emailValido } from './validacao.ts';

/**
 * A página "Consultar meu pedido" (Etapa 6): o cliente digita o e-mail da compra e o código do pedido; se os dois
 * baterem, o link privado do pedido vai para aquele e-mail. A tela nunca mostra o pedido e a resposta é sempre a
 * mesma, conferindo ou não: assim ninguém descobre se um código existe, nem de quem é. A busca e o envio acontecem
 * depois da resposta (POST /api/consultar-pedido, com after), então nem o tempo de resposta muda. Sem rede nem banco
 * aqui: testado em tests/consulta-pedido.test.ts.
 */

/** A única resposta da rota quando os dados chegam no formato certo: igual para pedido que existe ou não. */
export const RESPOSTA_DA_CONSULTA = { ok: true } as const;

/** Até quantas consultas por IP em 10 minutos (uma pessoa faz uma ou duas). */
export const CONSULTAS_POR_IP = 5;
export const JANELA_CONSULTAS_SEGUNDOS = 600;
/**
 * Até quantos e-mails com o link do mesmo pedido por dia: ninguém enche a caixa do cliente nem gasta a cota do Resend
 * (src/lib/email/cota.ts).
 */
export const ENVIOS_POR_PEDIDO = 3;
export const JANELA_ENVIOS_SEGUNDOS = 86_400;

/**
 * O código como o cliente digita, no formato do site: "on-7k3p9q", "ON 7K3P9Q", "ON7K3P9Q" e "7K3P9Q" viram
 * "ON-7K3P9Q". O prefixo antigo VH- continua valendo. Fora do formato, null.
 */
export function normalizarCodigo(bruto: string): string | null {
  const limpo = bruto.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const codigo = /^(ON|VH)[A-Z0-9]{6}$/.test(limpo) ? `${limpo.slice(0, 2)}-${limpo.slice(2)}` : limpo.length === 6 ? `ON-${limpo}` : '';
  return codigoValido(codigo) ? codigo : null;
}

const resumo = (email: string) => createHash('sha256').update(email.trim().toLowerCase()).digest();

/** O e-mail digitado é o do pedido (sem diferença de maiúsculas e espaços), comparado sem deixar pista pelo tempo. */
export const emailConfere = (doPedido: string, digitado: string): boolean => timingSafeEqual(resumo(doPedido), resumo(digitado));

/** O pedido, só com o que a consulta precisa saber dele. */
export interface PedidoConsultado {
  /** O código do pedido (num pedido de um item só, o próprio voucher). */
  codigo: string;
  email: string;
}

export interface DependenciasDaConsulta {
  /** O pedido pelo código do pedido ou de um voucher dele; null se não existir. */
  buscar(codigo: string): Promise<PedidoConsultado | null>;
  /** Ainda cabe mais um e-mail com o link deste pedido hoje. */
  podeEnviar(codigoDoPedido: string): Promise<boolean>;
  /** Manda o link privado do pedido para o e-mail do próprio pedido. */
  enviar(codigoDoPedido: string): Promise<void>;
}

/**
 * O trabalho de depois da resposta: busca o pedido e, se o e-mail digitado for o do pedido, manda o link. Devolve se
 * mandou, só para os testes e o registro do servidor: a rota já respondeu RESPOSTA_DA_CONSULTA antes de chamar isto.
 */
export async function consultarPedido(entrada: { email: string; codigo: string }, deps: DependenciasDaConsulta): Promise<boolean> {
  const codigo = normalizarCodigo(entrada.codigo);
  if (!codigo || !emailValido(entrada.email)) return false;
  const pedido = await deps.buscar(codigo);
  if (!pedido || !emailConfere(pedido.email, entrada.email)) return false;
  if (!(await deps.podeEnviar(pedido.codigo))) return false;
  await deps.enviar(pedido.codigo);
  return true;
}

/**
 * O que a rota responde, antes de qualquer busca: erro de formato (o campo que o cliente precisa corrigir) ou
 * RESPOSTA_DA_CONSULTA. Nada aqui depende de o pedido existir.
 */
export function respostaDaConsulta(entrada: {
  email: unknown;
  codigo: unknown;
}): { status: 200; corpo: typeof RESPOSTA_DA_CONSULTA } | { status: 400; corpo: { ok: false; erro: 'email' | 'codigo' } } {
  if (typeof entrada.email !== 'string' || !emailValido(entrada.email)) return { status: 400, corpo: { ok: false, erro: 'email' } };
  if (typeof entrada.codigo !== 'string' || !normalizarCodigo(entrada.codigo)) return { status: 400, corpo: { ok: false, erro: 'codigo' } };
  return { status: 200, corpo: RESPOSTA_DA_CONSULTA };
}
