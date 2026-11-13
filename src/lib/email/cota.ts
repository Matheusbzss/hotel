import { createHash } from 'node:crypto';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { permitir } from '../limite-ip.ts';
import type { TipoEmail } from './mensagens';

/**
 * A cota do Resend guardada para o que importa. O plano grátis manda 100 e-mails por dia somando todos (o dia vira à
 * meia-noite UTC) e, acima disso, recusa sem guardar para depois. Os e-mails dos pedidos saem para o endereço que a
 * pessoa digitou, sem confirmação: sem um teto, um robô gastaria a cota do dia em menos de uma hora e o "pagamento
 * aprovado" (com os vouchers) não sairia. Então:
 * - cada e-mail que vai ao Resend conta no dia (na tabela limites_ip, pela mesma função do limite por IP; no
 *   computador, em memória). Passando de 60 no dia, só os essenciais saem: o pagamento aprovado, o Pix vencido, a
 *   confirmação da desistência e o aviso dela à equipe. O pedido recebido, o link do pedido e os lembretes do carrinho
 *   esperam o dia seguinte (o lembrete volta para a fila; os outros não saem);
 * - um mesmo endereço recebe no máximo 3 "pedido recebido" por dia (o link do pedido, no máximo 3 por pedido por dia:
 *   src/lib/consulta-pedido.ts).
 * Se a contagem falhar, o e-mail sai: um problema nosso nunca segura um e-mail. Sem rede: testado em tests/email.test.ts.
 */

/** Até aqui no dia, todo e-mail sai; daqui em diante, só os essenciais (sobram 40 dos 100 do plano grátis para eles). */
export const EMAILS_DO_DIA_ANTES_DE_GUARDAR = 60;
/** Quantos "pedido recebido" um mesmo endereço recebe por dia. */
export const PEDIDOS_RECEBIDOS_POR_ENDERECO = 3;
const DIA_SEGUNDOS = 86_400;

/** Os e-mails que sempre saem, com a cota do dia guardada ou não. */
const ESSENCIAIS: ReadonlySet<TipoEmail> = new Set<TipoEmail>([
  'pagamento-aprovado',
  'pix-vencido',
  'desistencia-recebida',
  'desistencia-equipe',
]);

export const emailEssencial = (tipo: TipoEmail): boolean => ESSENCIAIS.has(tipo);

/** O dia do Resend (UTC), "2026-11-13": é o que vai na chave da contagem. */
export const diaDoResend = (agora: Date): string => agora.toISOString().slice(0, 10);

/** Conta este e-mail no dia e diz se ele sai: o essencial sempre; os outros, até EMAILS_DO_DIA_ANTES_DE_GUARDAR. */
export async function cabeNaCotaDoDia(tipo: TipoEmail, agora: Date = new Date()): Promise<boolean> {
  const cabe = await permitir(`emails-do-dia:${diaDoResend(agora)}`, EMAILS_DO_DIA_ANTES_DE_GUARDAR, DIA_SEGUNDOS, agora);
  return cabe || emailEssencial(tipo);
}

/** Um resumo do endereço para a chave da contagem: a tabela e o registro do servidor nunca levam o e-mail. */
export const resumoDoEndereco = (email: string): string =>
  createHash('sha256').update(email.trim().toLowerCase()).digest('base64url').slice(0, 22);

/** O endereço ainda recebe mais um "pedido recebido" hoje (e conta este). */
export function enderecoCabeNoDia(email: string, agora: Date = new Date()): Promise<boolean> {
  return permitir(`email-recebido:${resumoDoEndereco(email)}:${diaDoResend(agora)}`, PEDIDOS_RECEBIDOS_POR_ENDERECO, DIA_SEGUNDOS, agora);
}
