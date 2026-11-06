import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

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
