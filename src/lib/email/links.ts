import { createHmac, timingSafeEqual } from 'node:crypto';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { isIdioma, type Idioma } from '../../i18n/config.ts';

/**
 * Os links assinados dos lembretes do carrinho: "voltar ao carrinho" e "sair da lista". O link leva o id do carrinho
 * (nunca o e-mail nem o código do cookie) e uma assinatura HMAC-SHA256; sem a assinatura certa, nada acontece. A chave
 * sai do CRON_SECRET (o mesmo segredo do agendamento que manda os lembretes), derivada só para este uso: não há
 * variável nova para criar. Trocar o CRON_SECRET invalida os links dos e-mails que já saíram (o "voltar" e o "sair").
 * Sem rede nem banco: testado em tests/lembretes.test.ts.
 */

export type FinalidadeDoLink = 'voltar' | 'sair';

export interface DadosDoLink {
  /** Para que o link serve: um link de "voltar" não tira ninguém da lista, e vice-versa. */
  f: FinalidadeDoLink;
  /** O id do carrinho (carrinhos.id). */
  c: string;
  /** O idioma do e-mail: a página que o link abre fala o mesmo idioma. */
  i: Idioma;
  /** Qual lembrete levou o cliente de volta (1 ou 2), para as estatísticas. */
  n?: 1 | 2;
  /** Quando o link vence, em segundos desde 1970. O de sair da lista não vence. */
  x?: number;
}

/** Por quanto tempo o "voltar ao carrinho" vale: o cookie do carrinho dura 60 dias, o link do e-mail, 30. */
export const VALIDADE_DO_VOLTAR_DIAS = 30;

/** A chave dos links, derivada do CRON_SECRET; null sem ele (aí os lembretes não saem). */
export function chaveDosLinks(segredo: string | undefined = process.env.CRON_SECRET): Buffer | null {
  if (!segredo) return null;
  return createHmac('sha256', segredo).update('orla-nativa/links-dos-lembretes/v1').digest();
}

const assinatura = (conteudo: string, chave: Buffer) => createHmac('sha256', chave).update(conteudo).digest('base64url');

export function assinarLink(dados: DadosDoLink, chave: Buffer): string {
  const conteudo = Buffer.from(JSON.stringify(dados)).toString('base64url');
  return `${conteudo}.${assinatura(conteudo, chave)}`;
}

/**
 * Lê um link assinado: devolve os dados se a assinatura confere, a finalidade é a esperada e o link não venceu; senão,
 * null. A comparação da assinatura não deixa pista pelo tempo de resposta.
 */
export function lerLink(
  token: string | null | undefined,
  finalidade: FinalidadeDoLink,
  chave: Buffer,
  agora: Date = new Date(),
): DadosDoLink | null {
  if (!token || token.length > 600) return null;
  const [conteudo, recebida, ...resto] = token.split('.');
  if (!conteudo || !recebida || resto.length) return null;
  const esperada = Buffer.from(assinatura(conteudo, chave));
  const veio = Buffer.from(recebida);
  if (veio.length !== esperada.length || !timingSafeEqual(veio, esperada)) return null;
  let dados: Partial<DadosDoLink>;
  try {
    dados = JSON.parse(Buffer.from(conteudo, 'base64url').toString('utf8')) as Partial<DadosDoLink>;
  } catch {
    return null;
  }
  if (dados.f !== finalidade || typeof dados.c !== 'string' || !dados.c || typeof dados.i !== 'string' || !isIdioma(dados.i)) return null;
  if (dados.x !== undefined && (typeof dados.x !== 'number' || dados.x * 1000 < agora.getTime())) return null;
  const n = dados.n === 1 || dados.n === 2 ? dados.n : undefined;
  return { f: dados.f, c: dados.c, i: dados.i, ...(n ? { n } : {}), ...(dados.x !== undefined ? { x: dados.x } : {}) };
}

/**
 * Só o idioma de um link, mesmo sem a assinatura conferir: serve para a página de erro falar a língua do cliente.
 * Nada mais do link é usado sem a assinatura.
 */
export function idiomaDoLink(token: string | null | undefined): Idioma {
  try {
    const i = (JSON.parse(Buffer.from((token ?? '').split('.')[0] ?? '', 'base64url').toString('utf8')) as { i?: unknown }).i;
    return typeof i === 'string' && isIdioma(i) ? i : 'pt';
  } catch {
    return 'pt';
  }
}

/** O link de voltar ao carrinho, que vale VALIDADE_DO_VOLTAR_DIAS dias. */
export function linkDeVoltar(carrinhoId: string, idioma: Idioma, n: 1 | 2, chave: Buffer, agora: Date = new Date()): string {
  const x = Math.floor(agora.getTime() / 1000) + VALIDADE_DO_VOLTAR_DIAS * 86_400;
  return assinarLink({ f: 'voltar', c: carrinhoId, i: idioma, n, x }, chave);
}

/** O link de sair da lista dos lembretes: não vence (quem quiser sair sempre consegue). */
export const linkDeSair = (carrinhoId: string, idioma: Idioma, chave: Buffer): string =>
  assinarLink({ f: 'sair', c: carrinhoId, i: idioma }, chave);

/**
 * Os cabeçalhos do "cancelar inscrição" do próprio aplicativo de e-mail (Gmail, Apple Mail, Outlook), em um toque:
 * List-Unsubscribe com o endereço de sair da lista e List-Unsubscribe-Post (RFC 8058), que faz o aplicativo mandar
 * um POST para esse endereço, sem abrir página nenhuma.
 */
export const cabecalhosDeSair = (url: string): Record<string, string> => ({
  'List-Unsubscribe': `<${url}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
});
