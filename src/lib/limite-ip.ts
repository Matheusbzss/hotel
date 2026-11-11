/**
 * Limite de acessos por IP nas rotas públicas (pedido, carrinho, cotação) e no login do painel, para um robô não
 * encher o painel de pedidos pendentes, não abrir sessões à toa na Stripe e não tentar adivinhar a senha.
 * - Na Vercel (usarBanco()): a contagem fica na tabela limites_ip, pela função SQL contar_limite, porque
 *   numa função serverless um contador em memória não vale (cada chamada pode cair numa máquina diferente).
 * - No computador: um Map em memória, com a mesma regra.
 * A janela começa no primeiro acesso e recomeça quando vence. Se o banco falhar, deixa passar e registra o
 * erro: um problema nosso nunca pode barrar um cliente de verdade.
 */

interface EstadoLimite {
  contagem: number;
  /** Em milissegundos desde 1970 (Date.getTime()). */
  janelaInicio: number;
}

const memoria = new Map<string, EstadoLimite>();

/** Janelas paradas há mais de um dia saem na limpeza. */
const DESCARTE_MS = 24 * 60 * 60 * 1000;

type Banco = typeof import('./banco.ts');

/**
 * O banco, quando é ele quem guarda a contagem. Sem o endereço do Supabase (os testes, o computador sem
 * .env.local) o banco.ts nem é carregado: ele é "server-only" e não abre fora do Next. Com o endereço, quem
 * decide é usarBanco() (chave configurada e, na Vercel ou com RESERVAS_NO_BANCO=1). A chave secreta só o
 * banco.ts lê.
 */
async function carregarBanco(): Promise<Banco | null> {
  if (!process.env.SUPABASE_URL) return null;
  const banco = await import('./banco.ts');
  return banco.usarBanco() ? banco : null;
}

/** A mesma regra da função SQL contar_limite: a contagem da janela corrente, já contando este acesso. */
export function contarEmMemoria(chave: string, janelaSegundos: number, agora: number = Date.now()): number {
  const atual = memoria.get(chave);
  if (!atual || atual.janelaInicio + janelaSegundos * 1000 <= agora) {
    memoria.set(chave, { contagem: 1, janelaInicio: agora });
    return 1;
  }
  atual.contagem += 1;
  return atual.contagem;
}

/**
 * Conta este acesso e diz se ele ainda cabe no limite: até `limite` acessos por `janelaSegundos` na chave.
 * Ex.: permitir(chaveDoLimite('pedido', ip), 10, 600) → no máximo 10 pedidos a cada 10 minutos por IP.
 */
export async function permitir(chave: string, limite: number, janelaSegundos: number, agora: Date = new Date()): Promise<boolean> {
  const banco = await carregarBanco();
  if (!banco) return contarEmMemoria(chave, janelaSegundos, agora.getTime()) <= limite;
  const { data, error } = await banco.supabase().rpc('contar_limite', { p_chave: chave, p_janela_segundos: janelaSegundos });
  if (error || typeof data !== 'number') {
    console.error(`[limite-ip] falha ao contar ${chave}: ${error?.message ?? 'resposta inesperada'}`);
    return true;
  }
  return data <= limite;
}

/** Apaga as janelas paradas há mais de um dia (chamado pelo agendamento diário de /api/saude). Devolve quantas saíram. */
export async function limparLimites(agora: Date = new Date()): Promise<number> {
  const corte = agora.getTime() - DESCARTE_MS;
  const banco = await carregarBanco();
  if (!banco) {
    let apagadas = 0;
    for (const [chave, estado] of memoria) {
      if (estado.janelaInicio < corte) {
        memoria.delete(chave);
        apagadas++;
      }
    }
    return apagadas;
  }
  const { data, error } = await banco
    .supabase()
    .from('limites_ip')
    .delete()
    .lt('janela_inicio', new Date(corte).toISOString())
    .select('chave');
  if (error) throw new Error(`Banco de dados: ${error.message}`);
  return data?.length ?? 0;
}

/** Só para os testes: esquece as contagens em memória. */
export function zerarLimitesEmMemoria(): void {
  memoria.clear();
}

/** A chave de uma rota e um IP: "pedido:203.0.113.9". Sem IP conhecido, todos caem na mesma chave "sem-ip". */
export const chaveDoLimite = (rota: string, ip: string | null | undefined): string => `${rota}:${ip?.trim() || 'sem-ip'}`;

/** O IP de quem chamou, como a Vercel manda (x-forwarded-for: o primeiro da lista é o cliente). */
export function ipDaRequisicao(headers: Headers): string | null {
  const lista = headers.get('x-forwarded-for');
  return lista?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || null;
}
