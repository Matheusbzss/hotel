import { agruparPedidos, valorRecebido, type PedidoPainel } from './pedidos-painel.ts';
import type { MetodoPagamento, Reserva } from './reservas';
import { DDIS, hojeEmBuzios, somarDias } from './validacao.ts';

/**
 * Os números da página de estatísticas. Conta só o pedido pago, no dia do pagamento (no fuso de Búzios) e
 * pelo valor que entrou. Aqui só se soma, sem tocar no banco: assim dá para testar
 * (tests/estatisticas.test.ts).
 */

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
  !!d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);

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
  centavos: number;
  ticketCentavos: number;
  itens: number;
  itensPorPedido: number;
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

/** Um carrinho, só com o que o funil usa. */
export interface CarrinhoNoFunil {
  criadoEm: string;
  checkoutEm?: string;
  fezPedido: boolean;
  pagou: boolean;
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
  itensPorPedido: { rotulo: string; pedidos: number }[];
  sugestoes: { centavos: number; itens: number; pedidos: number; porPasseio: Fatia[] };
  funil: Funil;
  funilAnterior?: Funil;
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

const produtoDoItem = (i: Reserva) =>
  i.tipo === 'transfer'
    ? { chave: 'transfer', rotulo: 'Transfer privado', centavos: valorRecebido(i) }
    : { chave: i.passeio.slug, rotulo: i.passeio.nome, centavos: valorRecebido(i) };

const veioDaSugestao = (i: Reserva) => i.tipo !== 'transfer' && i.sugestao === true;

function resumir(pedidos: PedidoPainel[]): Resumo {
  const itens = pedidos.flatMap((p) => p.itens);
  const centavos = pedidos.reduce((soma, p) => soma + p.recebidoCentavos, 0);
  return {
    pedidos: pedidos.length,
    centavos,
    ticketCentavos: pedidos.length ? Math.round(centavos / pedidos.length) : 0,
    itens: itens.length,
    itensPorPedido: pedidos.length ? itens.length / pedidos.length : 0,
    sugestoesCentavos: itens.filter(veioDaSugestao).reduce((soma, i) => soma + valorRecebido(i), 0),
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

export function calcularEstatisticas(reservas: Reserva[], carrinhos: CarrinhoNoFunil[], escolhido: PeriodoEscolhido): Estatisticas {
  const { periodo, anterior } = escolhido;
  const pagos = agruparPedidos(reservas).filter((p) => p.status === 'pago');
  const doPeriodo = (intervalo: Periodo) => pagos.filter((p) => dentro(diaDoPagamento(p), intervalo));
  const vendidos = doPeriodo(periodo);
  const itens = vendidos.flatMap((p) => p.itens);

  const porDia = diasDe(periodo);
  const lugar = new Map(porDia.map((d, n) => [d.de, n]));
  for (const p of vendidos) {
    const dia = porDia[lugar.get(diaDoPagamento(p)) ?? -1];
    if (!dia) continue;
    dia.pedidos += 1;
    dia.centavos += p.recebidoCentavos;
  }

  const quantosItens = (n: number, ouMais = false) => vendidos.filter((p) => (ouMais ? p.itens.length >= n : p.itens.length === n)).length;
  const sugeridos = itens.filter(veioDaSugestao);

  return {
    resumo: resumir(vendidos),
    ...(anterior ? { resumoAnterior: resumir(doPeriodo(anterior)), funilAnterior: funilDe(carrinhos, anterior) } : {}),
    porDia,
    porSemana: somarPorSemana(porDia),
    porPasseio: juntar(itens.map(produtoDoItem)),
    porCidade: juntar(
      itens.map((i) =>
        i.tipo === 'transfer'
          ? { chave: 'transfer', rotulo: 'Transfer', centavos: valorRecebido(i) }
          : { chave: i.passeio.cidade, rotulo: i.passeio.cidade, centavos: valorRecebido(i) },
      ),
    ),
    porPais: juntar(vendidos.map((p) => ({ ...paisDoTelefone(p.itens[0].cliente.telefone), centavos: p.recebidoCentavos }))),
    porPagamento: juntar(vendidos.map((p) => ({ chave: p.metodo, rotulo: FORMA_DE_PAGAMENTO[p.metodo], centavos: p.recebidoCentavos }))),
    porOrigem: juntar(vendidos.map((p) => ({ ...origemDoPedido(p), centavos: p.recebidoCentavos }))),
    itensPorPedido: [
      { rotulo: '1 item', pedidos: quantosItens(1) },
      { rotulo: '2 itens', pedidos: quantosItens(2) },
      { rotulo: '3 itens', pedidos: quantosItens(3) },
      { rotulo: '4 ou mais', pedidos: quantosItens(4, true) },
    ],
    sugestoes: {
      centavos: sugeridos.reduce((soma, i) => soma + valorRecebido(i), 0),
      itens: sugeridos.length,
      pedidos: vendidos.filter((p) => p.itens.some(veioDaSugestao)).length,
      porPasseio: juntar(sugeridos.map(produtoDoItem)),
    },
    funil: funilDe(carrinhos, periodo),
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
