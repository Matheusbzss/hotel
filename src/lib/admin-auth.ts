import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ENDERECO_DA_SESSAO_VENCIDA, navegacaoDoNavegador, origemDeFora } from './sessao-do-painel';

/**
 * Sessão do /admin: cookie assinado com HMAC.
 * Senha em ADMIN_PASSWORD. Opcional: ADMIN_SESSION_SECRET para assinar o cookie.
 */
export const COOKIE_ADMIN = 'vh_admin';
const DURACAO_MS = 12 * 60 * 60 * 1000;

function segredo(): string | null {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return null;
  return process.env.ADMIN_SESSION_SECRET || createHash('sha256').update(`vh-admin:${senha}`).digest('hex');
}

const assinar = (valor: string, chave: string) => createHmac('sha256', chave).update(valor).digest('base64url');

function iguais(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function adminConfigurado(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/**
 * Os botões novos de dinheiro só aparecem com o ADMIN_SESSION_SECRET criado na Vercel (decisão P14 do dono, 25/11:
 * "criar o ADMIN_SESSION_SECRET antes de ligar os botões novos de dinheiro", porque sem ele a chave do cookie do painel
 * sai da própria senha). Hoje vale para o "Cancelar sem reembolso…" (Pacote 33): o painel não mostra o botão, a tela de
 * resumo explica o que falta, e a rota recusa. Com a variável criada e o site publicado de novo, tudo aparece sozinho.
 */
export const segredoDoPainelCriado = (): boolean => Boolean(process.env.ADMIN_SESSION_SECRET);

/** O que a tela de resumo diz quando o "Cancelar sem reembolso…" ainda espera o segredo do painel. */
export const ESPERA_O_SEGREDO_DO_PAINEL =
  'O "Cancelar sem reembolso" fica disponível depois que o segredo do painel (ADMIN_SESSION_SECRET) for criado na Vercel e o site for publicado de novo. Nada foi feito.';

export function senhaCorreta(tentativa: string): boolean {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return false;
  return iguais(tentativa, senha);
}

export function criarSessao(): { valor: string; expira: Date } {
  const chave = segredo();
  if (!chave) throw new Error('ADMIN_PASSWORD não configurada');
  const expira = new Date(Date.now() + DURACAO_MS);
  const base = String(expira.getTime());
  return { valor: `${base}.${assinar(base, chave)}`, expira };
}

export function sessaoValida(valor: string | undefined): boolean {
  const chave = segredo();
  if (!chave || !valor) return false;
  const [base, assinatura] = valor.split('.');
  if (!base || !assinatura) return false;
  if (!iguais(assinatura, assinar(base, chave))) return false;
  return Number(base) > Date.now();
}

/**
 * As rotas do painel: só vindo do próprio site e com a sessão do admin. Devolve a recusa, ou null se puder seguir. O
 * pedido de outro site é recusado antes de tudo (403). Sem a sessão (Pacote 33, D3): o botão de um formulário do painel
 * (a navegação do navegador) volta para a entrada do painel com o aviso "Sua sessão venceu. Entre de novo.", sempre o
 * mesmo endereço fixo do próprio site; o fetch (JSON) recebe o 401 de sempre (src/lib/sessao-do-painel.ts).
 */
export async function pedidoRecusado(req: Request): Promise<NextResponse | null> {
  if (origemDeFora(req.headers.get('origin'), req.url)) return NextResponse.json({ ok: false }, { status: 403 });
  const loja = await cookies();
  if (sessaoValida(loja.get(COOKIE_ADMIN)?.value)) return null;
  if (navegacaoDoNavegador(req.headers)) return NextResponse.redirect(new URL(ENDERECO_DA_SESSAO_VENCIDA, req.url), 303);
  return NextResponse.json({ ok: false }, { status: 401 });
}

/** Confere um segredo sem deixar pista pelo tempo de resposta. Sem o segredo cadastrado, nada confere. */
export const segredoConfere = (recebido: string | null, esperado: string | undefined) =>
  Boolean(recebido && esperado) && iguais(recebido as string, esperado as string);

/** O agendamento da Vercel (vercel.json) manda "Authorization: Bearer CRON_SECRET". */
export const chamadaDoAgendamento = (req: Request) =>
  Boolean(process.env.CRON_SECRET) && segredoConfere(req.headers.get('authorization'), `Bearer ${process.env.CRON_SECRET}`);
