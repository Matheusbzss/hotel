import Stripe from 'stripe';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { VERSAO_API_STRIPE, modoStripe, type ModoStripe } from './stripe.ts';

/**
 * O saldo da Stripe na tela de resumo do "Reembolsar na Stripe…" (Pacote 33, item 1; decisões do dono de 25/11, P1 e P2).
 *
 * - A leitura usa uma chave SÓ DELA, restrita, com uma permissão só: Balance, leitura (STRIPE_SALDO_KEY, que o dono cria
 *   na Stripe e cola na Vercel como Sensitive). A chave dos pagamentos (STRIPE_SECRET_KEY) não muda e não lê o saldo.
 * - A chave só existe no servidor: este arquivo é o único que a lê, nunca a escreve no registro do servidor (nem a
 *   mensagem de erro da Stripe, que traz o fim da chave), e nada dela vai para a página. A página recebe só os valores.
 * - O saldo só avisa, nunca trava (P2): sem a chave, com erro ou com demora (um limite curto, LIMITE_DO_SALDO_MS), a tela
 *   diz "saldo indisponível" e o reembolso continua possível.
 * - É o GET /v1/balance (stripe.balance.retrieve), em reais: o disponível (available) e o a liberar (pending). O saldo
 *   tem de ser do mesmo modo (teste ou produção) da chave dos pagamentos: uma chave de teste mostraria o saldo de teste.
 */

/** O tempo máximo da leitura: a tela do resumo espera por ela, e depois disso diz "saldo indisponível". */
export const LIMITE_DO_SALDO_MS = 3000;

/** O saldo como a Stripe devolve, só com o que a conta usa. */
export interface SaldoDaStripe {
  available: readonly { amount: number; currency: string }[];
  pending: readonly { amount: number; currency: string }[];
  livemode: boolean;
}

/** Por que o saldo não foi lido. */
export type SaldoIndisponivel = 'sem-chave' | 'chave-errada' | 'modo-diferente' | 'erro' | 'demora';

export type LeituraDoSaldo =
  | {
      estado: 'lido';
      /** Em centavos de real: o que já pode ser usado (pode ser negativo, no saldo devedor). */
      disponivelCentavos: number;
      /** Em centavos de real: o que entrou e ainda não foi liberado. */
      aLiberarCentavos: number;
      /** A hora da leitura (ISO). */
      lidoEm: string;
      /** A chave do saldo é uma chave secreta completa (sk_…), e não a restrita: funciona, mas pode mais do que devia. */
      chaveCompleta: boolean;
    }
  | { estado: 'indisponivel'; motivo: SaldoIndisponivel };

/** A soma das linhas em reais (a Stripe manda uma linha por moeda); sem linha em reais, zero. */
export function saldoEmReais(linhas: readonly { amount: number; currency: string }[]): number {
  return linhas
    .filter((l) => String(l.currency).toLowerCase() === 'brl' && Number.isFinite(l.amount))
    .reduce((soma, l) => soma + l.amount, 0);
}

/** O modo da chave pelo prefixo (rk_ ou sk_, live ou test), sem mostrar o valor; null quando não tem cara de chave da Stripe. */
export function modoDaChave(chave: string): Exclude<ModoStripe, 'desligado'> | null {
  if (/^(rk|sk)_live_\S+$/.test(chave)) return 'producao';
  if (/^(rk|sk)_test_\S+$/.test(chave)) return 'teste';
  return null;
}

/** O tipo do erro, para o registro do servidor: nunca a mensagem (a da Stripe, na chave errada, traz o fim da chave). */
function tipoDoErro(e: unknown): string {
  if (e instanceof Stripe.errors.StripeError) return e.type;
  return e instanceof Error ? e.name : 'desconhecido';
}

/** A leitura de verdade: um cliente da Stripe só com a chave do saldo, sem novas tentativas e com o limite de tempo. */
async function buscarNaStripe(chave: string, limiteMs: number): Promise<SaldoDaStripe> {
  const cliente = new Stripe(chave, {
    apiVersion: VERSAO_API_STRIPE,
    typescript: true,
    maxNetworkRetries: 0,
    timeout: limiteMs,
    appInfo: { name: 'Orla Nativa (site)' },
  });
  return cliente.balance.retrieve();
}

export interface OpcoesDoSaldo {
  /** A chave do saldo; sem ela, STRIPE_SALDO_KEY (sem os espaços das pontas). */
  chave?: string;
  /** O modo da chave dos pagamentos; sem ele, o de STRIPE_SECRET_KEY (modoStripe). */
  modo?: ModoStripe;
  limiteMs?: number;
  /** Para os testes: quem busca o saldo (na vida real, a Stripe). */
  buscar?: (chave: string, limiteMs: number) => Promise<SaldoDaStripe>;
  agora?: () => Date;
}

/**
 * Lê o saldo da Stripe agora. Nunca lança erro: o que não deu certo volta como 'indisponivel', com o motivo, e a tela
 * segue com o reembolso possível. Sem a chave, com uma chave sem cara de chave da Stripe ou de outro modo (teste ou
 * produção) que a dos pagamentos, a Stripe nem é chamada.
 */
export async function lerSaldoDaStripe(opcoes: OpcoesDoSaldo = {}): Promise<LeituraDoSaldo> {
  const chave = (opcoes.chave ?? process.env.STRIPE_SALDO_KEY ?? '').trim();
  if (!chave) return { estado: 'indisponivel', motivo: 'sem-chave' };
  const modo = modoDaChave(chave);
  if (!modo) return { estado: 'indisponivel', motivo: 'chave-errada' };
  const modoDosPagamentos = opcoes.modo ?? modoStripe();
  if (modoDosPagamentos !== 'desligado' && modo !== modoDosPagamentos) return { estado: 'indisponivel', motivo: 'modo-diferente' };
  const limiteMs = opcoes.limiteMs ?? LIMITE_DO_SALDO_MS;
  const buscar = opcoes.buscar ?? buscarNaStripe;
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const demora = new Promise<'demora'>((resolver) => {
    relogio = setTimeout(() => resolver('demora'), limiteMs);
  });
  try {
    const saldo = await Promise.race([buscar(chave, limiteMs), demora]);
    if (saldo === 'demora') {
      console.error(`[saldo] a leitura do saldo da Stripe passou de ${limiteMs} ms: a tela mostra "saldo indisponível"`);
      return { estado: 'indisponivel', motivo: 'demora' };
    }
    if (saldo.livemode !== (modo === 'producao')) return { estado: 'indisponivel', motivo: 'modo-diferente' };
    return {
      estado: 'lido',
      disponivelCentavos: saldoEmReais(saldo.available ?? []),
      aLiberarCentavos: saldoEmReais(saldo.pending ?? []),
      lidoEm: (opcoes.agora?.() ?? new Date()).toISOString(),
      chaveCompleta: chave.startsWith('sk_'),
    };
  } catch (e) {
    console.error(`[saldo] a leitura do saldo da Stripe falhou (${tipoDoErro(e)}): a tela mostra "saldo indisponível"`);
    return { estado: 'indisponivel', motivo: 'erro' };
  } finally {
    clearTimeout(relogio);
  }
}
