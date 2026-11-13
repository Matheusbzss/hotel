import type { EscolhaItem } from './carrinho';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { dentroDoPrazo, type ItemAgendado } from './formas-pagamento.ts';
import { ANTECEDENCIA_MINIMA_MINUTOS } from './horarios.ts';

/**
 * Quando mandar o lembrete do carrinho abandonado (Etapa 6). Quem digitou o e-mail no checkout e não terminou recebe
 * no máximo dois lembretes: o primeiro a partir de 1 hora sem mexer no carrinho, o segundo a partir de 24 horas (e
 * pelo menos 12 horas depois do primeiro). Nenhum sai se: o carrinho virou pedido (ele mesmo, ou a cópia aberta pelo
 * link "voltar ao carrinho"), o dono do e-mail já fez um pedido por outro carrinho (jaComprou), o carrinho é a cópia
 * aberta pela volta, a pessoa saiu da lista, o lembrete já foi mandado, a data de algum item já passou ou falta menos de 3 horas
 * para o primeiro serviço (FOLGA_DO_LEMBRETE_MINUTOS), ou o carrinho está parado há mais de 3 dias. O agendamento
 * (/api/carrinho/lembretes, a cada 15 minutos, vercel.json) pergunta aqui, carrinho por carrinho. Aqui também a regra
 * do link "voltar ao carrinho" (voltarAoCarrinho). Sem rede nem banco: testado em tests/lembretes.test.ts.
 */

export const LEMBRETE_1_DEPOIS_HORAS = 1;
export const LEMBRETE_2_DEPOIS_HORAS = 24;
/** O segundo lembrete nunca sai menos de 12 horas depois do primeiro (o agendamento pode ter ficado parado). */
export const INTERVALO_ENTRE_LEMBRETES_HORAS = 12;
/** Carrinho parado há mais de 3 dias não recebe lembrete: a escolha já ficou velha. */
export const LEMBRETE_ATE_HORAS = 72;
/**
 * No máximo 30 lembretes por dia (o dia do Resend começa à meia-noite UTC). O plano grátis do Resend manda 100
 * e-mails por dia somando todos: o resto fica para os e-mails dos pedidos, que importam mais (src/lib/email/cota.ts).
 */
export const LEMBRETES_POR_DIA = 30;
/**
 * O lembrete só sai com pelo menos 3 horas até o primeiro serviço. O site reserva até 2 horas antes
 * (ANTECEDENCIA_MINIMA_MINUTOS, src/lib/horarios.ts): a hora a mais é o tempo de ler o e-mail, voltar e pagar.
 */
export const FOLGA_DO_LEMBRETE_MINUTOS = ANTECEDENCIA_MINIMA_MINUTOS + 60;
/** Um pedido com o mesmo e-mail nas últimas 72 horas (ou depois do carrinho) quer dizer que o cliente já comprou. */
export const JA_COMPROU_HORAS = 72;

/** O carrinho como o agendamento enxerga: o e-mail, os itens, o pedido e as datas. */
export interface CarrinhoParaLembrete {
  email?: string | null;
  itens: { escolha: EscolhaItem }[];
  pedidoId?: string | null;
  /** Quando o carrinho nasceu: um pedido com o mesmo e-mail feito depois disso é a compra deste carrinho. */
  criadoEm?: string | null;
  /** A última vez que o cliente mexeu no carrinho (itens, e-mail, abriu o checkout). */
  atualizadoEm: string;
  lembrete1Em?: string | null;
  lembrete2Em?: string | null;
  /** Este carrinho é a cópia aberta pela volta de um lembrete (o id do carrinho de origem): ele não recebe lembrete. */
  veioDe?: string | null;
}

export type MotivoParaPular =
  | 'sem-email'
  | 'virou-pedido'
  | 'copia'
  | 'saiu-da-lista'
  | 'ja-comprou'
  | 'vazio'
  | 'ja-mandado'
  | 'cedo'
  | 'velho'
  | 'data-passou'
  | 'servico-proximo'
  | 'intervalo';

export type DecisaoDoLembrete = { lembrete: 1 | 2 } | { pular: MotivoParaPular };

const HORA_MS = 3_600_000;

/** Um item do carrinho como as regras de prazo precisam: a data e a hora em que começa. */
export function agendaDoItem(escolha: EscolhaItem): ItemAgendado {
  return escolha.tipo === 'passeio'
    ? { tipo: 'passeio', data: escolha.data, horario: { hora: escolha.hora } }
    : { tipo: 'transfer', data: escolha.ida.data, transfer: { ida: { hora: escolha.ida.hora } } };
}

/**
 * Qual lembrete este carrinho recebe agora, ou por que nenhum. `descadastrado`: o e-mail do carrinho saiu da lista
 * dos lembretes (o link do e-mail ou o botão "cancelar inscrição" do aplicativo). `jaComprou`: o dono do e-mail já fez
 * um pedido por outro carrinho (a função jaComprou, logo abaixo). `copiaVirouPedido`: o cliente voltou pelo link do
 * lembrete e fez o pedido na cópia (voltarAoCarrinho). A volta sozinha não para o segundo lembrete: os filtros de
 * e-mail das empresas abrem os links sozinhos, e quem voltou e não comprou ainda pode ter dúvida.
 */
export function decidirLembrete(
  c: CarrinhoParaLembrete,
  agora: Date,
  opcoes: { descadastrado: boolean; jaComprou?: boolean; copiaVirouPedido?: boolean },
): DecisaoDoLembrete {
  if (!c.email) return { pular: 'sem-email' };
  if (c.pedidoId || opcoes.copiaVirouPedido) return { pular: 'virou-pedido' };
  if (c.veioDe) return { pular: 'copia' };
  if (opcoes.descadastrado) return { pular: 'saiu-da-lista' };
  if (opcoes.jaComprou) return { pular: 'ja-comprou' };
  if (!c.itens.length) return { pular: 'vazio' };
  if (c.lembrete1Em && c.lembrete2Em) return { pular: 'ja-mandado' };

  const parado = agora.getTime() - Date.parse(c.atualizadoEm);
  if (!(parado >= LEMBRETE_1_DEPOIS_HORAS * HORA_MS)) return { pular: 'cedo' };
  if (parado > LEMBRETE_ATE_HORAS * HORA_MS) return { pular: 'velho' };

  const agendas = c.itens.map((i) => agendaDoItem(i.escolha));
  // começou ou já passou: o item não vale mais (dentroDoPrazo com zero minutos de antecedência)
  if (agendas.some((a) => !dentroDoPrazo(a, agora, 0))) return { pular: 'data-passou' };
  if (agendas.some((a) => !dentroDoPrazo(a, agora, FOLGA_DO_LEMBRETE_MINUTOS))) return { pular: 'servico-proximo' };

  if (!c.lembrete1Em) return { lembrete: 1 };
  if (parado < LEMBRETE_2_DEPOIS_HORAS * HORA_MS) return { pular: 'cedo' };
  if (agora.getTime() - Date.parse(c.lembrete1Em) < INTERVALO_ENTRE_LEMBRETES_HORAS * HORA_MS) return { pular: 'intervalo' };
  return { lembrete: 2 };
}

/** Um pedido como a regra do "já comprou" precisa: o e-mail do cliente, quando nasceu e o status. */
export interface PedidoDoEmail {
  email: string;
  criadoEm: string;
  status: string;
}

/**
 * O dono do e-mail já fez um pedido: com o mesmo e-mail (sem diferença de maiúsculas), criado depois do carrinho ou
 * nas últimas 72 horas, em qualquer status menos cancelado (pendente, pago, expirado, pelo WhatsApp...). O caso comum:
 * o cliente digitou o e-mail no navegador do Instagram e comprou depois pelo Chrome, noutro carrinho. Sem esta regra
 * ele recebia "seu carrinho está guardado" e podia pagar de novo.
 */
export function jaComprou(
  email: string,
  carrinhoCriadoEm: string | null | undefined,
  pedidos: readonly PedidoDoEmail[],
  agora: Date,
): boolean {
  const alvo = email.trim().toLowerCase();
  if (!alvo) return false;
  const desde = agora.getTime() - JA_COMPROU_HORAS * HORA_MS;
  const criado = carrinhoCriadoEm ? Date.parse(carrinhoCriadoEm) : Number.NaN;
  return pedidos.some((p) => {
    if (p.status === 'cancelado' || p.email.trim().toLowerCase() !== alvo) return false;
    const quando = Date.parse(p.criadoEm);
    return quando >= desde || quando >= criado;
  });
}

/** O começo do dia de agora no relógio do Resend (UTC), para contar os lembretes do dia. */
export const inicioDoDiaUtc = (agora: Date): string => `${agora.toISOString().slice(0, 10)}T00:00:00.000Z`;

/** Uma referência curta do carrinho para o registro do servidor (o começo do id; nunca o e-mail nem o cookie). */
export const referenciaDoCarrinho = (id: string): string => `carrinho ${id.slice(0, 8)}`;

/* ------------------------------------------------------------------ */
/* O link "voltar ao carrinho"                                         */

/** Para onde o link leva: o checkout (com o cookie de um carrinho NOVO, quando há o que devolver) ou "Consultar meu pedido". */
export type DestinoDaVolta = { destino: 'checkout'; cookie?: string } | { destino: 'consultar' };

/** O que a volta precisa do banco (ou dos arquivos do computador): src/lib/carrinho-lembretes.ts liga às funções de verdade. */
export interface DependenciasDaVolta<Item> {
  /** O carrinho que recebeu o e-mail, pelo id do link assinado: o código do cookie, os itens e o pedido, se virou um. */
  carrinho(id: string): Promise<{ token: string; itens: Item[]; pedidoId: string | null } | null>;
  /** Alguma cópia aberta por uma volta anterior já virou pedido. */
  copiaVirouPedido(id: string): Promise<boolean>;
  /** Cria um carrinho NOVO só com os itens (sem e-mail, sem pedido, sem origem), ligado ao de origem; devolve o código dele. */
  criarCopia(itens: Item[], origem: string): Promise<string>;
  /** Guarda a volta no carrinho de origem, para as estatísticas (só a primeira vale). */
  registrarVolta(id: string): Promise<void>;
}

/**
 * O link "voltar ao carrinho" do lembrete NUNCA entrega o código do carrinho que recebeu o e-mail: o link vale 30 dias,
 * pode ser aberto por quem recebeu o e-mail encaminhado (ou pelo filtro de spam), e o código do cookie abriria o
 * carrinho do cliente e o pedido que nascer dele (com o link privado do pedido). Então:
 * - o carrinho que já virou pedido (em qualquer status), ou cuja cópia de uma volta anterior virou: sem cookie, para
 *   "Consultar meu pedido", onde o link do pedido vai para o e-mail da compra;
 * - o carrinho vazio, ou que sumiu: o checkout, sem cookie;
 * - senão: um carrinho NOVO, com uma cópia só dos itens, e a volta anotada no de origem (as estatísticas contam a
 *   cópia como o carrinho de origem, src/lib/estatisticas.ts).
 */
export async function voltarAoCarrinho<Item>(id: string, deps: DependenciasDaVolta<Item>): Promise<DestinoDaVolta> {
  const carrinho = await deps.carrinho(id);
  if (!carrinho) return { destino: 'checkout' };
  if (carrinho.pedidoId || (await deps.copiaVirouPedido(id))) return { destino: 'consultar' };
  if (!carrinho.itens.length) return { destino: 'checkout' };
  const cookie = await deps.criarCopia(carrinho.itens, id);
  if (!cookie || cookie === carrinho.token) throw new Error('A cópia do carrinho não ganhou um código próprio.');
  await deps.registrarVolta(id);
  return { destino: 'checkout', cookie };
}
