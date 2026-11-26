import { agruparPedidos, valorRecebido, voucherPago, type PedidoPainel } from './pedidos-painel.ts';
import type { MetodoPagamento, Reserva } from './reservas';
import { canceladoSemReembolso } from './sem-reembolso.ts';
import { DDIS, hojeEmBuzios, somarDias } from './validacao.ts';

/**
 * Os números da página de estatísticas. Conta só o pedido pago, no dia do pagamento (no fuso de Búzios) e
 * pelo valor que entrou, menos o que já voltou para o cliente: a mesma conta de "Vendido (pagos, menos reembolsos)" da
 * página de pedidos, para as duas páginas darem o mesmo número. O reembolso é descontado no dia do pagamento do pedido,
 * não no dia do reembolso. O voucher devolvido ou cancelado sozinho não é item vendido. Aqui só se soma, sem tocar no
 * banco: assim dá para testar (tests/estatisticas.test.ts).
 *
 * Limite que fica: os rankings por item (por passeio, por cidade, as sugestões) só sabem tirar o voucher MARCADO como
 * devolvido. Um reembolso sem voucher (um desconto num pedido de um item, ou o feito direto na Stripe antes de a equipe
 * dizer de qual voucher foi) desce o dinheiro do pedido e continua inteiro no item; cada ranking calcula a porcentagem
 * sobre a própria soma. O "Vendido pelas sugestões" e a parte dele no faturamento usam a mesma base do faturamento
 * (sugestoesDoPedido), para a porcentagem nunca passar de 100%.
 */

/** O que ficou do pedido: o que entrou, menos o que já voltou para o cliente (a conta da página de pedidos). */
const liquido = (p: PedidoPainel) => p.recebidoCentavos - p.reembolsoCentavos;
/**
 * O voucher devolvido ou cancelado sozinho não é item vendido (a mesma regra do voucher ainda pago do painel). O cancelado
 * pela equipe sem reembolso (Pacote 33) é: o dinheiro ficou, e ele continua contando como venda (decisão do dono de 25/11, P3).
 */
const itemVendido = (i: Reserva) => voucherPago(i) || canceladoSemReembolso(i);
/** Os itens vendidos de um pedido. */
const itensVendidos = (p: PedidoPainel) => p.itens.filter(itemVendido);
/** O que entrou por estes itens. */
const valorDosItens = (itens: readonly Reserva[]) => itens.reduce((soma, i) => soma + valorRecebido(i), 0);

/** Um intervalo de dias (AAAA-MM-DD), com o primeiro e o último incluídos. */
export interface Periodo {
  de: string;
  ate: string;
}

export const PERIODOS = [
  { chave: '7', rotulo: '7 dias', dias: 7 },
  { chave: '30', rotulo: '30 dias', dias: 30 },
  { chave: '90', rotulo: '90 dias', dias: 90 },
  { chave: '365', rotulo: '12 meses', dias: 365 },
  { chave: 'tudo', rotulo: 'Tudo' },
] as const;

const PERIODO_PADRAO = '30';
/** Datas digitadas à mão: o limite só evita um gráfico sem fim por um erro no ano. */
const MAXIMO_DE_DIAS = 3 * 366;

export interface PeriodoEscolhido {
  /** O botão marcado na página; "outro" é o intervalo digitado. */
  chave: string;
  periodo: Periodo;
  /** Os mesmos dias, logo antes, para comparar. Em "Tudo" não tem. */
  anterior?: Periodo;
}

const diasEntre = ({ de, ate }: Periodo) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1;

const dataValida = (d: string | undefined): d is string =>
  !!d &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) &&
  new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);

/** Os dias de antes, com o mesmo tamanho. */
function periodoAnterior(p: Periodo): Periodo {
  const dias = diasEntre(p);
  return { de: somarDias(p.de, -dias), ate: somarDias(p.de, -1) };
}

/** O período pedido na página, pelos botões ou pelas datas digitadas. Sem pedido válido, os últimos 30 dias. */
export function escolherPeriodo(
  pedido: { periodo?: string; de?: string; ate?: string },
  hoje: string,
  primeiroDia: string = hoje,
): PeriodoEscolhido {
  if (dataValida(pedido.de) && dataValida(pedido.ate) && pedido.de <= pedido.ate) {
    const ate = pedido.ate < hoje ? pedido.ate : hoje;
    const limite = somarDias(ate, -MAXIMO_DE_DIAS);
    const de = pedido.de > ate ? ate : pedido.de < limite ? limite : pedido.de;
    return { chave: 'outro', periodo: { de, ate }, anterior: periodoAnterior({ de, ate }) };
  }
  if (pedido.periodo === 'tudo') {
    return { chave: 'tudo', periodo: { de: primeiroDia < hoje ? primeiroDia : hoje, ate: hoje } };
  }
  const opcao = PERIODOS.find((p) => p.chave === pedido.periodo) ?? PERIODOS.find((p) => p.chave === PERIODO_PADRAO);
  const dias = opcao && 'dias' in opcao ? opcao.dias : 30;
  const periodo = { de: somarDias(hoje, 1 - dias), ate: hoje };
  return { chave: opcao?.chave ?? PERIODO_PADRAO, periodo, anterior: periodoAnterior(periodo) };
}

/** Em períodos longos, as colunas por dia ficam finas demais: o gráfico já abre por semana. */
export const verPorSemana = (p: Periodo) => diasEntre(p) > 45;

/* ------------------------------------------------------------------ */

export interface Resumo {
  pedidos: number;
  /** O faturamento: o que ficou dos pedidos pagos, menos reembolsos. */
  centavos: number;
  ticketCentavos: number;
  itens: number;
  itensPorPedido: number;
  /** O que as sugestões venderam, na mesma base do faturamento (sugestoesDoPedido): nunca passa de `centavos`. */
  sugestoesCentavos: number;
}

/** Um dia ou uma semana do gráfico. */
export interface Ponto {
  de: string;
  ate: string;
  pedidos: number;
  centavos: number;
}

/** Uma linha dos rankings: quanto vendeu e em quantos itens ou pedidos. */
export interface Fatia {
  chave: string;
  rotulo: string;
  centavos: number;
  quantidade: number;
}

/** Até onde chegaram os carrinhos criados no período. */
export interface Funil {
  carrinhos: number;
  checkout: number;
  pedidos: number;
  pagos: number;
}

/** Um carrinho, só com o que o funil e os lembretes do carrinho abandonado usam. */
export interface CarrinhoNoFunil {
  criadoEm: string;
  checkoutEm?: string;
  fezPedido: boolean;
  /** Quando o pedido do carrinho nasceu (para saber se ele veio depois da volta pelo lembrete). */
  pedidoEm?: string;
  pagou: boolean;
  /** Quando saíram os lembretes do carrinho abandonado e quando o cliente voltou pelo link do e-mail. */
  lembrete1Em?: string;
  lembrete2Em?: string;
  voltouEm?: string;
}

/** Um carrinho do funil com o id e, na cópia aberta pelo link "voltar ao carrinho" de um lembrete, o carrinho de origem. */
export interface CarrinhoComCopia extends CarrinhoNoFunil {
  id: string;
  veioDe?: string;
}

/**
 * O link "voltar ao carrinho" do lembrete abre um carrinho NOVO, a cópia dos itens (src/lib/lembretes.ts,
 * voltarAoCarrinho): o cliente continua nela, e o pedido nasce nela. Para o funil e para os lembretes, a cópia conta
 * como o carrinho de origem: o checkout, o pedido e o pagamento feitos nela são do carrinho que recebeu o e-mail, e
 * ela não entra como um carrinho a mais. A cópia cujo carrinho de origem não está na lista continua um carrinho comum.
 */
export function juntarCopias(carrinhos: CarrinhoComCopia[]): CarrinhoNoFunil[] {
  const ids = new Set(carrinhos.map((c) => c.id));
  const ehCopia = (c: CarrinhoComCopia) => Boolean(c.veioDe && c.veioDe !== c.id && ids.has(c.veioDe));
  const copiasDe = new Map<string, CarrinhoComCopia[]>();
  for (const c of carrinhos) if (ehCopia(c)) copiasDe.set(c.veioDe as string, [...(copiasDe.get(c.veioDe as string) ?? []), c]);
  const primeiro = (datas: (string | undefined)[]) => datas.filter((d): d is string => Boolean(d)).sort()[0];
  return carrinhos
    .filter((c) => !ehCopia(c))
    .map(({ id, veioDe: _veioDe, ...c }) => {
      const copias = copiasDe.get(id) ?? [];
      if (!copias.length) return c;
      const comPedido = copias.filter((x) => x.fezPedido);
      const checkoutEm = c.checkoutEm ?? primeiro(copias.map((x) => x.checkoutEm));
      const pedidoEm = c.fezPedido ? c.pedidoEm : primeiro(comPedido.map((x) => x.pedidoEm));
      return {
        ...c,
        ...(checkoutEm ? { checkoutEm } : {}),
        fezPedido: c.fezPedido || comPedido.length > 0,
        ...(pedidoEm ? { pedidoEm } : {}),
        pagou: c.pagou || copias.some((x) => x.pagou),
      };
    });
}

/**
 * O que os lembretes do carrinho abandonado trouxeram de volta, contando os carrinhos que receberam o primeiro
 * lembrete no período: quantos e-mails saíram (o primeiro e o segundo, no período), quantos carrinhos voltaram pelo
 * link e, desses, quantos viraram pedido e quantos foram pagos.
 */
export interface Lembretes {
  carrinhos: number;
  enviados: number;
  voltaram: number;
  pedidos: number;
  pagos: number;
}

/**
 * O cartão "Casas de temporada" (Etapa 7, pacote 2): as reservas de casa pagas no período (os vouchers vendidos, como no
 * faturamento: o cancelado sem reembolso conta, porque o dinheiro ficou), os sinais recebidos por elas (o sinal na forma
 * paga) e o que falta receber na chegada. Este último só das estadias de hoje em diante, em qualquer data de pagamento: o
 * painel não tem onde marcar o restante recebido, e a estadia que já começou sai da conta (crítica de 26/11, furo 23 a).
 * Só o voucher que ainda vale num pedido pago; no pedido contestado, nada se espera.
 */
export interface CasasNoPainel {
  reservas: number;
  sinaisCentavos: number;
  aReceber: { centavos: number; estadias: number };
}

export interface Estatisticas {
  resumo: Resumo;
  resumoAnterior?: Resumo;
  porDia: Ponto[];
  porSemana: Ponto[];
  porPasseio: Fatia[];
  /** A chave é a da cidade em src/data/passeios.ts; o transfer, que liga cidades, fica à parte. */
  porCidade: Fatia[];
  porPais: Fatia[];
  porPagamento: Fatia[];
  porOrigem: Fatia[];
  /** Só os pedidos que vieram de uma campanha. */
  porCampanha: Fatia[];
  itensPorPedido: { rotulo: string; pedidos: number }[];
  /**
   * `centavos` é o mesmo de resumo.sugestoesCentavos (na base do faturamento); o ranking `porPasseio`, como os outros
   * rankings por item, soma o valor cheio de cada item sugerido ainda vendido.
   */
  sugestoes: { centavos: number; itens: number; pedidos: number; porPasseio: Fatia[] };
  funil: Funil;
  funilAnterior?: Funil;
  lembretes: Lembretes;
  lembretesAnterior?: Lembretes;
  casas: CasasNoPainel;
}

/** O que fica para a chegada numa casa, na forma paga: o total da estadia menos o sinal, os dois guardados na compra. */
function chegadaDaCasa(i: Reserva): number {
  if (i.tipo !== 'casa') return 0;
  const pix = i.pagamento.metodo === 'pix';
  const total = pix ? (i.totalPixCentavos ?? i.totalCentavos) : i.totalCentavos;
  return total - (pix ? i.sinalPixCentavos : i.sinalCentavos);
}

/** O cartão das casas: as do período (vendidas) e o que falta receber das estadias de hoje em diante (casasNoPainel). */
function casasDe(pagos: readonly PedidoPainel[], vendidas: readonly Reserva[], hoje: string): CasasNoPainel {
  const casas = vendidas.filter((i) => i.tipo === 'casa');
  const aFrente = pagos.flatMap((p) => p.itens).filter((i) => i.tipo === 'casa' && voucherPago(i) && i.data >= hoje);
  return {
    reservas: casas.length,
    sinaisCentavos: valorDosItens(casas),
    aReceber: { centavos: aFrente.reduce((soma, i) => soma + chegadaDaCasa(i), 0), estadias: aFrente.length },
  };
}

const NOME_PAIS: Record<string, string> = {
  BR: 'Brasil',
  AR: 'Argentina',
  UY: 'Uruguai',
  CL: 'Chile',
  PY: 'Paraguai',
  BO: 'Bolívia',
  PE: 'Peru',
  CO: 'Colômbia',
  MX: 'México',
  'US/CA': 'EUA ou Canadá',
  PT: 'Portugal',
  ES: 'Espanha',
  UK: 'Reino Unido',
  FR: 'França',
  DE: 'Alemanha',
  IT: 'Itália',
};

const DDIS_DO_MAIOR = DDIS.toSorted((a, b) => b.ddi.length - a.ddi.length);

/** O checkout não pergunta o país: ele vem do código do WhatsApp do cliente. */
export function paisDoTelefone(telefone: string): { chave: string; rotulo: string } {
  const digitos = telefone.replace(/\D/g, '');
  const achado = DDIS_DO_MAIOR.find((d) => digitos.startsWith(d.ddi));
  return achado ? { chave: achado.pais, rotulo: NOME_PAIS[achado.pais] ?? achado.pais } : { chave: 'outro', rotulo: 'Outro país' };
}

const FORMA_DE_PAGAMENTO: Record<MetodoPagamento, string> = {
  pix: 'Pix',
  cartao: 'Cartão',
  whatsapp: 'Não informada',
};

const NOME_ORIGEM: Record<string, string> = { meta: 'Meta (Instagram e Facebook)', google: 'Google' };

function origemDoPedido(p: PedidoPainel): { chave: string; rotulo: string } {
  const fonte = p.itens[0].origem?.utm_source?.trim().toLowerCase();
  return fonte ? { chave: fonte, rotulo: NOME_ORIGEM[fonte] ?? fonte } : { chave: 'direto', rotulo: 'Direto ou sem origem' };
}

/** O dia do pagamento em Búzios: depois das 21h em Brasília, o horário universal já é o dia seguinte. */
const diaDe = (iso: string) => hojeEmBuzios(new Date(iso));
const dentro = (dia: string, p: Periodo) => dia >= p.de && dia <= p.ate;
const diaDoPagamento = (p: PedidoPainel) => diaDe(p.pagoEm ?? p.criadoEm);

/** Soma as linhas com a mesma chave; a que mais vendeu vem primeiro. */
function juntar(entradas: { chave: string; rotulo: string; centavos: number }[]): Fatia[] {
  const fatias = new Map<string, Fatia>();
  for (const { chave, rotulo, centavos } of entradas) {
    const f = fatias.get(chave) ?? { chave, rotulo, centavos: 0, quantidade: 0 };
    fatias.set(chave, { ...f, centavos: f.centavos + centavos, quantidade: f.quantidade + 1 });
  }
  return [...fatias.values()].sort((a, b) => b.centavos - a.centavos || b.quantidade - a.quantidade);
}

// a casa de temporada entra no ranking pelo slug e com o que entrou (o sinal: valorRecebido)
const produtoDoItem = (i: Reserva) =>
  i.tipo === 'transfer'
    ? { chave: 'transfer', rotulo: 'Transfer privado', centavos: valorRecebido(i) }
    : i.tipo === 'casa'
      ? { chave: i.casa.slug, rotulo: i.casa.nome, centavos: valorRecebido(i) }
      : { chave: i.passeio.slug, rotulo: i.passeio.nome, centavos: valorRecebido(i) };

const veioDaSugestao = (i: Reserva) => i.tipo !== 'transfer' && i.tipo !== 'casa' && i.sugestao === true;

/**
 * O que as sugestões venderam num pedido, na base do faturamento (o que ficou do pedido, menos reembolsos): o valor dos
 * itens sugeridos ainda vendidos, na proporção do que ficou do pedido sobre o valor dos itens ainda vendidos. Sem
 * reembolso, ou só com o voucher devolvido inteiro, é o valor cheio dos itens sugeridos que sobraram; com um reembolso
 * sem voucher (um desconto), ele desce na mesma proporção. Nunca passa do que ficou do pedido nem fica negativo: a soma
 * nunca passa do faturamento, e "do faturamento" nunca passa de 100% (antes, um desconto num pedido com um item sugerido
 * dava mais de 100%: o valor cheio do item sobre o faturamento já descontado).
 */
function sugestoesDoPedido(p: PedidoPainel): number {
  const itens = itensVendidos(p);
  const sugerido = valorDosItens(itens.filter(veioDaSugestao));
  const vendido = valorDosItens(itens);
  if (sugerido <= 0 || vendido <= 0) return 0;
  const base = Math.min(Math.max(0, liquido(p)), vendido);
  return Math.round((sugerido * base) / vendido);
}

/**
 * Quanto `centavos` é do faturamento, em %, de 0 a 100: a conta das porcentagens "do faturamento" da página. As
 * sugestões já vêm na base do faturamento (sugestoesDoPedido), então a conta fica entre 0 e 100; o limite segura um
 * dado fora do comum (um pedido com mais devolvido do que entrou). Sem faturamento, 0.
 */
export function parteDoFaturamento(centavos: number, faturamentoCentavos: number): number {
  if (!(centavos > 0) || !(faturamentoCentavos > 0)) return 0;
  return Math.min(100, (centavos / faturamentoCentavos) * 100);
}

function resumir(pedidos: PedidoPainel[]): Resumo {
  const itens = pedidos.flatMap(itensVendidos);
  const centavos = pedidos.reduce((soma, p) => soma + liquido(p), 0);
  return {
    pedidos: pedidos.length,
    centavos,
    ticketCentavos: pedidos.length ? Math.round(centavos / pedidos.length) : 0,
    itens: itens.length,
    itensPorPedido: pedidos.length ? itens.length / pedidos.length : 0,
    sugestoesCentavos: pedidos.reduce((soma, p) => soma + sugestoesDoPedido(p), 0),
  };
}

function diasDe(p: Periodo): Ponto[] {
  const dias: Ponto[] = [];
  for (let dia = p.de; dia <= p.ate; dia = somarDias(dia, 1)) dias.push({ de: dia, ate: dia, pedidos: 0, centavos: 0 });
  return dias;
}

/** A segunda-feira da semana daquele dia. */
function inicioDaSemana(dia: string): string {
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return somarDias(dia, -((semana + 6) % 7));
}

/** As semanas vão de segunda a domingo, cortadas nas pontas do período. */
function somarPorSemana(dias: Ponto[]): Ponto[] {
  const semanas = new Map<string, Ponto>();
  for (const d of dias) {
    const inicio = inicioDaSemana(d.de);
    const s = semanas.get(inicio) ?? { de: d.de, ate: d.de, pedidos: 0, centavos: 0 };
    semanas.set(inicio, { ...s, ate: d.de, pedidos: s.pedidos + d.pedidos, centavos: s.centavos + d.centavos });
  }
  return [...semanas.values()];
}

function funilDe(carrinhos: CarrinhoNoFunil[], p: Periodo): Funil {
  const doPeriodo = carrinhos.filter((c) => dentro(diaDe(c.criadoEm), p));
  return {
    carrinhos: doPeriodo.length,
    // quem fez o pedido passou pelo checkout, mesmo que a marca não tenha sido gravada
    checkout: doPeriodo.filter((c) => c.checkoutEm || c.fezPedido).length,
    pedidos: doPeriodo.filter((c) => c.fezPedido).length,
    pagos: doPeriodo.filter((c) => c.pagou).length,
  };
}

/**
 * Os lembretes do carrinho abandonado no período. O carrinho entra pelo dia do primeiro lembrete; o e-mail, pelo dia
 * em que saiu. "Voltou" é quem abriu o link do e-mail; o pedido só conta se nasceu depois dessa volta.
 */
export function lembretesDe(carrinhos: CarrinhoNoFunil[], p: Periodo): Lembretes {
  const lembrados = carrinhos.filter((c) => c.lembrete1Em && dentro(diaDe(c.lembrete1Em), p));
  const enviados = carrinhos.reduce(
    (soma, c) => soma + [c.lembrete1Em, c.lembrete2Em].filter((em) => em && dentro(diaDe(em), p)).length,
    0,
  );
  const voltaram = lembrados.filter((c) => c.voltouEm);
  const depoisDaVolta = voltaram.filter((c) => c.fezPedido && (!c.pedidoEm || !c.voltouEm || c.pedidoEm >= c.voltouEm));
  return {
    carrinhos: lembrados.length,
    enviados,
    voltaram: voltaram.length,
    pedidos: depoisDaVolta.length,
    pagos: depoisDaVolta.filter((c) => c.pagou).length,
  };
}

export function calcularEstatisticas(
  reservas: Reserva[],
  carrinhos: CarrinhoNoFunil[],
  escolhido: PeriodoEscolhido,
  agora: Date = new Date(),
): Estatisticas {
  const { periodo, anterior } = escolhido;
  const pagos = agruparPedidos(reservas).filter((p) => p.status === 'pago');
  const doPeriodo = (intervalo: Periodo) => pagos.filter((p) => dentro(diaDoPagamento(p), intervalo));
  const vendidos = doPeriodo(periodo);
  const itens = vendidos.flatMap(itensVendidos);

  const porDia = diasDe(periodo);
  const lugar = new Map(porDia.map((d, n) => [d.de, n]));
  for (const p of vendidos) {
    const dia = porDia[lugar.get(diaDoPagamento(p)) ?? -1];
    if (!dia) continue;
    dia.pedidos += 1;
    dia.centavos += liquido(p);
  }

  const quantosItens = (n: number, ouMais = false) =>
    vendidos.filter((p) => {
      const quantos = itensVendidos(p).length;
      return ouMais ? quantos >= n : quantos === n;
    }).length;
  const sugeridos = itens.filter(veioDaSugestao);
  const resumo = resumir(vendidos);

  return {
    resumo,
    ...(anterior
      ? {
          resumoAnterior: resumir(doPeriodo(anterior)),
          funilAnterior: funilDe(carrinhos, anterior),
          lembretesAnterior: lembretesDe(carrinhos, anterior),
        }
      : {}),
    porDia,
    porSemana: somarPorSemana(porDia),
    porPasseio: juntar(itens.map(produtoDoItem)),
    porCidade: juntar(
      itens.map((i) =>
        i.tipo === 'transfer'
          ? { chave: 'transfer', rotulo: 'Transfer', centavos: valorRecebido(i) }
          : i.tipo === 'casa'
            ? { chave: i.casa.cidade, rotulo: i.casa.cidade, centavos: valorRecebido(i) }
            : { chave: i.passeio.cidade, rotulo: i.passeio.cidade, centavos: valorRecebido(i) },
      ),
    ),
    porPais: juntar(vendidos.map((p) => ({ ...paisDoTelefone(p.itens[0].cliente.telefone), centavos: liquido(p) }))),
    porPagamento: juntar(vendidos.map((p) => ({ chave: p.metodo, rotulo: FORMA_DE_PAGAMENTO[p.metodo], centavos: liquido(p) }))),
    porOrigem: juntar(vendidos.map((p) => ({ ...origemDoPedido(p), centavos: liquido(p) }))),
    porCampanha: juntar(
      vendidos.flatMap((p) => {
        const campanha = p.itens[0].origem?.utm_campaign;
        return campanha ? [{ chave: campanha, rotulo: campanha, centavos: liquido(p) }] : [];
      }),
    ),
    itensPorPedido: [
      { rotulo: '1 item', pedidos: quantosItens(1) },
      { rotulo: '2 itens', pedidos: quantosItens(2) },
      { rotulo: '3 itens', pedidos: quantosItens(3) },
      { rotulo: '4 ou mais', pedidos: quantosItens(4, true) },
    ],
    sugestoes: {
      // na base do faturamento, como no resumo: a parte "do faturamento" do cartão das sugestões nunca passa de 100%
      centavos: resumo.sugestoesCentavos,
      itens: sugeridos.length,
      pedidos: vendidos.filter((p) => itensVendidos(p).some(veioDaSugestao)).length,
      porPasseio: juntar(sugeridos.map(produtoDoItem)),
    },
    funil: funilDe(carrinhos, periodo),
    lembretes: lembretesDe(carrinhos, periodo),
    casas: casasDe(pagos, itens, hojeEmBuzios(agora)),
  };
}

/** Quanto mudou em relação ao período anterior, em %. Sem base para comparar, null. */
export function variacao(atual: number, anterior: number | undefined): number | null {
  if (!anterior) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/** As marcas do eixo em números redondos, do zero até passar do maior valor. */
export function marcasDoEixo(maior: number, menorPasso = 1): number[] {
  if (maior <= 0) return [0, menorPasso];
  const bruto = maior / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fracao = bruto / potencia;
  const passo = Math.max(menorPasso, (fracao <= 1 ? 1 : fracao <= 2 ? 2 : fracao <= 5 ? 5 : 10) * potencia);
  const marcas = [0];
  while (marcas[marcas.length - 1] < maior) marcas.push(marcas[marcas.length - 1] + passo);
  return marcas;
}
