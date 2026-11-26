import { z } from 'zod';
import type { Texto } from '../data/passeios';
import { fmt, type Idioma } from '../i18n/config.ts';
import type { EscolhaCasa, EscolhaItem } from './carrinho';
// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { tabelaDaPagina, type PrecosDaCasa } from './casa-pagina.ts';
import { linhasDaConta, type LinhaDaConta } from './conta-casa.ts';
import { noitesEntre } from './diarias.ts';
import { contaEstadia, dataValida, primeiraEntradaPossivel, type MotivoEstadia, type Pacote } from './estadia.ts';
import { hojeEmBuzios } from './validacao.ts';

/**
 * A CASA NO CARRINHO (Etapa 7, a reserva completa das casas): a escolha (a casa, a entrada, a saída e os hóspedes), o
 * contexto que o servidor lê antes de conferir (a casa e as noites ocupadas de agora) e a conferência, com a MESMA conta
 * da página da casa (contaEstadia, src/lib/estadia.ts, pela tabela de tabelaDaPagina). Sem banco e sem Next: quem lê o
 * banco é src/lib/casas-carrinho.ts; a conferência mora em carrinho-servidor.ts (conferirEscolha), que chama esta. Os
 * testes estão em tests/reserva-casa.test.ts.
 *
 * As decisões do dono de 26/11/2026 que valem aqui:
 * 1. a casa só se reserva para entrar a partir do DIA SEGUINTE (primeiraEntradaPossivel; depois das 22h, de depois de
 *    amanhã) e não se paga no dia da entrada (limiteParaPagar, src/lib/formas-pagamento.ts);
 * 2. a saída vai até a saída do ÚLTIMO pacote de feriado cadastrado da casa (limiteDaSaida); casa sem pacote, 12 meses à
 *    frente. O limite anda sozinho quando o dono cadastra pacotes novos;
 * 3. sem teto de noites (só a trava técnica de MAXIMO_NOITES da conta).
 */

/** A escolha de uma casa como chega do navegador. Os hóspedes são conferidos com a capacidade da casa depois. */
export const EsquemaEscolhaCasa = z.object({
  tipo: z.literal('casa'),
  slug: z.string().max(80),
  entrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  saida: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hospedes: z.number().int().min(1).max(100),
});

/** A casa como a conta e o item do carrinho precisam (CasaDoSite, src/lib/casa.ts, tem tudo isto). */
export type CasaParaConta = PrecosDaCasa & {
  id: string;
  slug: string;
  nome: Texto;
  cidade: string;
  capacidade: number;
  fotos: string[];
};

export interface CasaNoContexto {
  casa: CasaParaConta;
  /** As noites ocupadas agora, venha o bloqueio de onde vier, SEM as do próprio pedido do visitante. */
  ocupadas: ReadonlySet<string>;
  /**
   * As noites presas pelo próprio pedido do visitante (o do carrinho, esperando o pagamento; ou o que se paga de novo):
   * para ele, são livres. Achadas pelo item do pedido (item_pedido_id), nunca pela sessão de pagamento (furo 9 da crítica).
   */
  proprias: readonly string[];
}

/**
 * O que a conferência de uma casa precisa saber além da escolha, lido no servidor ANTES de conferir: as casas do carrinho
 * (pelo slug) com as noites ocupadas de agora e se a reserva das casas vale para este visitante (o interruptor
 * RESERVA_CASAS e o pagamento online, src/lib/reserva-casas.ts). É obrigatório em todo lugar que confere o carrinho: um
 * contexto esquecido não passa no tsc. O carrinho sem casa usa SEM_CASAS, sem nenhuma leitura a mais.
 */
export interface ContextoDasCasas {
  /** O contexto foi lido para estas escolhas. Sem ele (SEM_CASAS), toda casa é recusada com 'casa': nunca cobra errado. */
  lido: boolean;
  aberta: boolean;
  casas: ReadonlyMap<string, CasaNoContexto>;
}

/** O contexto do carrinho sem casa: nada lido, e a casa que aparecer é recusada com 'casa'. */
export const SEM_CASAS: ContextoDasCasas = Object.freeze({ lido: false, aberta: false, casas: new Map<string, CasaNoContexto>() });

/** Uma escolha (ainda sem conferir) de casa, pelo tipo e o slug. */
export const ehEscolhaCasa = (v: unknown): v is Pick<EscolhaCasa, 'tipo' | 'slug'> =>
  typeof v === 'object' && v !== null && (v as { tipo?: unknown }).tipo === 'casa' && typeof (v as { slug?: unknown }).slug === 'string';

/** Os slugs das casas entre as escolhas, sem repetir: o contexto só lê o banco quando há algum. */
export const slugsDasCasas = (escolhas: readonly unknown[]): string[] => [...new Set(escolhas.filter(ehEscolhaCasa).map((e) => e.slug))];

/** Um bloqueio lido para o contexto: a casa, as datas e, na reserva do site, o item do pedido que o prendeu. */
export interface BloqueioLido {
  casaId: string;
  inicio: string;
  fim: string;
  /** O item do pedido (no banco, o id de itens_pedido; nos arquivos do computador, o código do voucher). */
  itemPedidoId?: string | null;
}

/**
 * As noites de uma casa a partir dos bloqueios dela: as ocupadas para este visitante e as presas pelo pedido dele (os
 * bloqueios cujo item é um dos `proprios`). A noite da saída fica livre, como em todo bloqueio.
 */
export function noitesDaCasa(
  bloqueios: readonly BloqueioLido[],
  proprios: ReadonlySet<string>,
): { ocupadas: Set<string>; proprias: string[] } {
  const ocupadas = new Set<string>();
  const proprias = new Set<string>();
  for (const b of bloqueios) {
    const meu = Boolean(b.itemPedidoId && proprios.has(b.itemPedidoId));
    for (const n of noitesEntre(b.inicio, b.fim)) (meu ? proprias : ocupadas).add(n);
  }
  // uma noite presa pelo pedido do visitante e por outro bloqueio (não deveria acontecer) continua ocupada
  return { ocupadas, proprias: [...proprias].filter((n) => !ocupadas.has(n)).sort() };
}

/** Sem pacote cadastrado, a casa aceita a saída até 12 meses à frente (decisão 2 do dono). */
export const MESES_A_FRENTE_SEM_PACOTE = 12;

/**
 * O último dia de saída que a casa aceita (decisão 2 do dono, 26/11/2026): a saída do último pacote de feriado cadastrado
 * (hoje, novembro de 2027); sem pacote, 12 meses depois de hoje. Quando o dono cadastra os pacotes do ano seguinte, o
 * limite anda sozinho. A página (o calendário) e o servidor usam a mesma conta.
 */
export function limiteDaSaida(pacotes: readonly Pick<Pacote, 'saida'>[], hoje: string): string {
  if (pacotes.length) return pacotes.reduce((maior, p) => (p.saida > maior ? p.saida : maior), pacotes[0].saida);
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + MESES_A_FRENTE_SEM_PACOTE);
  return d.toISOString().slice(0, 10);
}

/**
 * Por que a casa não entra: 'casa' (o contexto não foi lido), 'slug' (a casa não existe ou saiu do ar), 'casa-fechada' (a
 * reserva das casas não vale para este visitante), 'hospedes' (de 1 até a capacidade), 'fora-do-limite' (a saída passa do
 * limite de datas) ou o motivo da conta (datas, preco, ocupada, pacote, fim-de-semana, minimo).
 */
export type ErroDaCasa = 'casa' | 'slug' | 'casa-fechada' | 'hospedes' | 'fora-do-limite' | MotivoEstadia;

export interface CasaConferida {
  ok: true;
  escolha: EscolhaCasa;
  casa: CasaParaConta;
  noites: number;
  linhas: LinhaDaConta[];
  totalCentavos: number;
  totalPixCentavos: number;
  sinalCentavos: number;
  sinalPixCentavos: number;
  chegadaCentavos: number;
  chegadaPixCentavos: number;
}

export interface CasaRecusada {
  ok: false;
  erro: ErroDaCasa;
  /**
   * Nas recusas que dependem das noites ('ocupada', 'fim-de-semana', 'pacote' e 'minimo'): as noites ocupadas de agora (sem
   * as do próprio visitante), para o calendário da página se atualizar. A página guardada pode ter até um dia: uma sexta que
   * ela ainda risca pode ter ficado livre, e aí o fim de semana pede a sexta (revisão de 26/11, achado 6).
   */
  ocupadas?: string[];
}

/** As recusas da conta que dependem das noites: a recusa leva as noites ocupadas de agora. */
const RECUSAS_COM_AS_NOITES: ReadonlySet<MotivoEstadia> = new Set(['ocupada', 'fim-de-semana', 'pacote', 'minimo']);

/**
 * Confere uma casa com o contexto e faz a conta, a mesma da página: contaEstadia(tabelaDaPagina(casa), entrada, saida,
 * { ocupadas, hoje: primeiraEntradaPossivel(agora) }). `opcoes.hoje` troca o primeiro dia (o "Pagar de novo" de um pedido
 * antigo passa a própria entrada: o prazo de pagar fica com as formas de pagamento). Nunca a conta antiga de diarias.ts.
 */
export function conferirCasa(
  e: EscolhaCasa,
  ctx: ContextoDasCasas,
  agora: Date = new Date(),
  opcoes: { hoje?: string } = {},
): CasaConferida | CasaRecusada {
  if (!ctx.lido) return { ok: false, erro: 'casa' };
  const daCasa = ctx.casas.get(e.slug);
  if (!daCasa) return { ok: false, erro: 'slug' };
  if (!ctx.aberta) return { ok: false, erro: 'casa-fechada' };
  const { casa, ocupadas } = daCasa;
  if (!Number.isInteger(e.hospedes) || e.hospedes < 1 || e.hospedes > casa.capacidade) return { ok: false, erro: 'hospedes' };
  const hoje = opcoes.hoje ?? primeiraEntradaPossivel(agora);
  if (dataValida(e.saida) && e.saida > limiteDaSaida(casa.pacotes, hojeEmBuzios(agora))) return { ok: false, erro: 'fora-do-limite' };
  const conta = contaEstadia(tabelaDaPagina(casa), e.entrada, e.saida, { ocupadas, hoje });
  if (!conta.ok) {
    const motivo = conta.motivo ?? 'datas';
    if (!RECUSAS_COM_AS_NOITES.has(motivo)) return { ok: false, erro: motivo };
    return { ok: false, erro: motivo, ocupadas: [...ocupadas].filter((n) => n >= hoje).sort() };
  }
  return {
    ok: true,
    escolha: { tipo: 'casa', slug: casa.slug, entrada: e.entrada, saida: e.saida, hospedes: e.hospedes },
    casa,
    noites: conta.noites.length,
    linhas: linhasDaConta(conta.noites),
    totalCentavos: conta.totalCentavos,
    totalPixCentavos: conta.totalPixCentavos,
    sinalCentavos: conta.sinalCentavos,
    sinalPixCentavos: conta.sinalPixCentavos,
    chegadaCentavos: conta.chegadaCentavos,
    chegadaPixCentavos: conta.chegadaPixCentavos,
  };
}

/** Duas estadias que dividem alguma noite (a noite da saída não conta). */
export const estadiasSeCruzam = (a: Pick<EscolhaCasa, 'entrada' | 'saida'>, b: Pick<EscolhaCasa, 'entrada' | 'saida'>): boolean =>
  a.entrada < b.saida && b.entrada < a.saida;

/**
 * A mesma casa duas vezes no carrinho com noites que se cruzam não passa (recusada como 'ocupada'); duas casas diferentes,
 * sim. `outras` são os OUTROS itens: no "Mudar", sem o item que está sendo trocado (a mesma casa trocada de datas não se
 * recusa a si mesma; furo 22 da crítica).
 */
export function cruzaComAMesmaCasa(e: Pick<EscolhaCasa, 'slug' | 'entrada' | 'saida'>, outras: readonly EscolhaItem[]): boolean {
  return outras.some((o) => o.tipo === 'casa' && o.slug === e.slug && estadiasSeCruzam(e, o));
}

/**
 * A casa do carrinho que fica na lista como indisponível, fora da conta e do pedido, em vez de sumir calada: 'ocupada'
 * (alguém reservou alguma noite enquanto ela estava no carrinho: o cliente escolhe outras datas pelo "Mudar"; furo 8 da
 * crítica) e 'fechada' (a reserva das casas fechou para este visitante, pelo interruptor RESERVA_CASAS ou pelo pagamento
 * online: o cliente tira a casa pelo X para seguir com o resto; revisão de 26/11, achado 1). As outras recusas tiram a
 * casa da lista, como o passeio que passou da data.
 */
export type MotivoDaCasaIndisponivel = 'ocupada' | 'fechada';

export function motivoDaCasaIndisponivel(c: { ok: boolean; erro?: string }): MotivoDaCasaIndisponivel | undefined {
  if (c.ok) return undefined;
  if (c.erro === 'ocupada') return 'ocupada';
  return c.erro === 'casa-fechada' ? 'fechada' : undefined;
}

/**
 * O pedido (POST /api/pedido) é recusado com 403 'casa-fechada' só quando a tela mostrava a casa fechada como reservável:
 * o id dela veio em `ids` (a reserva fechou enquanto o cliente preenchia, e a tela relê o carrinho). A casa que a tela já
 * mostrava fechada fica fora da conta e não trava o pedido do resto: antes, o passeio do mesmo carrinho não saía nem pelo
 * WhatsApp, e cada envio dava o mesmo 403 (revisão de 26/11, achado 1).
 */
export function casaFechadaNoPedido(todas: readonly { id: string; c: { ok: boolean; erro?: string } }[], ids: readonly string[]): boolean {
  return todas.some(({ id, c }) => motivoDaCasaIndisponivel(c) === 'fechada' && ids.includes(id));
}

/**
 * O "Pagar de novo" de um pedido com casa VENCIDO (furo 4 da crítica; as datas tinham saído): a conta é refeita com a
 * tabela de AGORA e as noites ocupadas de agora (sem as do próprio pedido). A troca de forma de um pedido que ainda espera
 * o pagamento não passa por aqui: as datas continuam presas para ele e o preço é o combinado (revisão de 26/11, achado 2).
 * - Alguma noite tomada: 'datas'. A reserva das casas desligada: 'casa-fechada' (nada é cancelado: o freio pode voltar).
 * - A casa fora do ar, os hóspedes acima da capacidade nova, a saída além do limite, a casa sem preço ou um pacote novo
 *   pela metade: 'mudou' (a rota cancela o pedido e manda escolher de novo na página da casa).
 * - O fim de semana junto e o mínimo de noites, que o pedido já cumpria quando nasceu (o fim de semana muda com as noites
 *   dos outros: a sexta ocupada que ficou livre passa a ser pedida), não cancelam: só o preço conta.
 * - O preço: a conta de agora igual ou menor que a do pedido segue, e o cliente paga o que aceitou no pedido (os sinais
 *   guardados na compra); maior (no cartão ou no Pix), 'mudou'.
 * O primeiro dia da conta é a própria entrada quando ela vem antes (o prazo de pagar é das formas de pagamento).
 */
export type ConferenciaDoPagarDeNovo = { ok: true } | { ok: false; erro: 'datas' | 'mudou' | 'casa-fechada' };

/** As regras que o pedido já cumpria quando nasceu: no "Pagar de novo", só o preço delas conta. */
const REGRAS_DO_PEDIDO: ReadonlySet<string> = new Set(['fim-de-semana', 'minimo']);

export function conferirOPagarDeNovo(
  r: {
    casa: { slug: string };
    data: string;
    saida: string;
    hospedes: number;
    totalCentavos: number;
    totalPixCentavos?: number;
  },
  ctx: ContextoDasCasas,
  agora: Date = new Date(),
): ConferenciaDoPagarDeNovo {
  const primeira = primeiraEntradaPossivel(agora);
  const hoje = r.data < primeira ? r.data : primeira;
  const c = conferirCasa({ tipo: 'casa', slug: r.casa.slug, entrada: r.data, saida: r.saida, hospedes: r.hospedes }, ctx, agora, { hoje });
  // a conta de agora cabe na do pedido: igual ou menor, nas duas formas
  const cabe = (agoraCentavos: { totalCentavos: number; totalPixCentavos: number }): ConferenciaDoPagarDeNovo =>
    agoraCentavos.totalCentavos <= r.totalCentavos && agoraCentavos.totalPixCentavos <= (r.totalPixCentavos ?? r.totalCentavos)
      ? { ok: true }
      : { ok: false, erro: 'mudou' };
  if (c.ok) return cabe(c);
  if (c.erro === 'casa-fechada' || c.erro === 'casa') return { ok: false, erro: 'casa-fechada' };
  if (c.erro === 'ocupada') return { ok: false, erro: 'datas' };
  const daCasa = ctx.casas.get(r.casa.slug);
  if (!REGRAS_DO_PEDIDO.has(c.erro) || !daCasa) return { ok: false, erro: 'mudou' };
  // o fim de semana ou o mínimo: a conta das mesmas noites, pela tabela de agora, sem a regra
  return cabe(contaEstadia(tabelaDaPagina(daCasa.casa), r.data, r.saida, { ocupadas: daCasa.ocupadas, hoje }));
}

/* ------------------------------------------------------------------ */
/* Os textos do item no carrinho                                       */

/** "qui 10/12" e "jue 10/12"; "Thu, Dec 10" em inglês: a data curta com o dia da semana, como a página da casa escreve. */
export function dataComDiaDaSemana(dataIso: string, idioma: Idioma, locale: string): string {
  const dia = new Date(`${dataIso}T12:00:00Z`);
  const semana = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(dia).replace(/\.$/, '');
  if (idioma === 'en')
    return `${semana}, ${new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dia)}`;
  return `${semana} ${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}`;
}

export interface TextosDoItemDaCasa {
  /** "{diarias}, de {de} a {ate}" (casas.ajusteResultado). */
  ajusteResultado: string;
  nDiarias: string;
  umaDiaria: string;
  /** "1 hóspede" e "{n} hóspedes" (casas.linha). */
  hospede: string;
  hospedes: string;
  /** "Sinal de {p}% hoje; o restante, na chegada" (carrinho.casaSinalHoje). */
  sinalHoje: string;
}

/** As linhas de baixo do nome da casa no carrinho: "4 diárias, de qui 10/12 a seg 14/12", "12 hóspedes" e a do sinal. */
export function linhasDoItemDaCasa(
  e: Pick<EscolhaCasa, 'entrada' | 'saida' | 'hospedes'>,
  idioma: Idioma,
  locale: string,
  T: TextosDoItemDaCasa,
  sinalPorcento: number,
): string[] {
  const n = noitesEntre(e.entrada, e.saida).length;
  return [
    fmt(T.ajusteResultado, {
      diarias: n === 1 ? T.umaDiaria : fmt(T.nDiarias, { n }),
      de: dataComDiaDaSemana(e.entrada, idioma, locale),
      ate: dataComDiaDaSemana(e.saida, idioma, locale),
    }),
    e.hospedes === 1 ? T.hospede : fmt(T.hospedes, { n: e.hospedes }),
    fmt(T.sinalHoje, { p: sinalPorcento }),
  ];
}
