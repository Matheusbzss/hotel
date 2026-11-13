import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { horariosDoPasseio, obterPasseio, type Passeio } from '@/data/passeios';
import { MAXIMO_SUGESTOES, sugestoesDoCarrinho } from '@/data/sugestoes';
import { IDS_LUGARES, LUGARES, VEICULOS, cabeNoVeiculo, precoTrecho, primeiroDiaTransfer, type IdLugar } from '@/data/transfer';
import type { Dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, rota, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { supabase, usarBanco } from './banco';
import type { Json } from './banco-tipos';
import type { CarrinhoNoFunil } from './estatisticas';
import {
  MAXIMO_ITENS,
  type EscolhaPasseio,
  type EscolhaTransfer,
  type ItemCarrinho,
  type ItemVisivel,
  type SugestaoVisivel,
  type TrechoEscolhido,
} from './carrinho';
import type { FormaPagamento } from './formas-pagamento';
import { formatarHora, horasDisponiveis } from './horarios';
import { calcular, normalizarPessoas, precoPixCentavos, totalPixCentavos, type Orcamento } from './orcamento';
import { podeAbrirSessao } from './pagamento-stripe';
import { semFaixas } from './passeio-view';
import { textoPessoas } from './pessoas';
import { PONTO_PRESO } from './ponto';
import type { Origem } from './origem';
import { obterOpcao, opcoesPasseio, regraCriancas, tabelaPreco, temOpcoes } from './precos';
import { listarReservas, obterReservaDoPedido, type StatusReserva } from './reservas';
import { textoPassageiros } from './transfer-view';
import { dataPasseioValida, formatarDataIso, hojeEmBuzios, somarDias } from './validacao';

/**
 * O carrinho no servidor: confere cada escolha com as mesmas regras do checkout, calcula o preço pela
 * tabela do site e guarda as escolhas (tabela carrinhos, com o código no cookie COOKIE_CARRINHO).
 */

export const COOKIE_CARRINHO = 'on_carrinho';

/* ------------------------------------------------------------------ */
/* As escolhas: formato e regras                                       */

const quantidade = z.number().int().min(0).max(40);
const Ponta = z.object({
  lugar: z.enum(IDS_LUGARES as [IdLugar, ...IdLugar[]]),
  endereco: z.string().trim().max(160).optional(),
});
const Trecho = z.object({
  saida: Ponta,
  destino: Ponta,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export const EsquemaEscolha = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('passeio'),
    slug: z.string().max(80),
    opcao: z.string().max(40).optional(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    hora: z.string().regex(/^\d{2}:\d{2}$/),
    adultos: z.number().int().min(0).max(40),
    meia: z.number().int().min(0).max(30).default(0),
    gratis: z.number().int().min(0).max(30).default(0),
    sugestao: z.literal(true).optional(),
  }),
  z.object({
    tipo: z.literal('transfer'),
    veiculo: z.enum(['carro', 'van']),
    ida: Trecho,
    volta: Trecho.optional(),
    passageiros: z.number().int().min(1).max(17),
    malas: z.object({ grandes: quantidade, medias: quantidade, mao: quantidade }),
  }),
]);

/** O preço de uma escolha, sempre pela tabela do site. */
export interface PrecoEscolha {
  totalCentavos: number;
  totalPixCentavos: number;
}

export type Conferida =
  | ({ ok: true; escolha: EscolhaPasseio; passeio: Passeio; orc: Orcamento; busca: boolean } & PrecoEscolha)
  | ({ ok: true; escolha: EscolhaTransfer; trechosCentavos: number[] } & PrecoEscolha)
  | { ok: false; erro: string };

/** Fora dos aeroportos, cada ponta precisa do hotel, da pousada ou do endereço; "outra cidade" é sob cotação. */
const pontaValida = (p: EscolhaTransfer['ida']['saida']) =>
  p.lugar !== 'outra-cidade' && (LUGARES[p.lugar].aeroporto || (p.endereco ?? '').length >= 3);

/** Confere a escolha com as regras de hoje (horário, crianças, datas, ida e volta) e calcula o preço. */
export function conferirEscolha(bruta: unknown, agora: Date = new Date()): Conferida {
  const r = EsquemaEscolha.safeParse(bruta);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.path.join('.') || 'dados' };
  const e = r.data;

  if (e.tipo === 'passeio') {
    const passeio = obterPasseio(e.slug);
    if (!passeio) return { ok: false, erro: 'slug' };
    if (!dataPasseioValida(e.data, agora)) return { ok: false, erro: 'data' };
    // a hora precisa ser uma das do passeio e, no dia de hoje, ainda estar livre
    const horarios = horariosDoPasseio(passeio);
    if (!horasDisponiveis(horarios.horas, e.data, agora).includes(e.hora)) return { ok: false, erro: 'hora' };
    const opcao = obterOpcao(passeio, temOpcoes(passeio) ? e.opcao : undefined);
    if (!opcao) return { ok: false, erro: 'opcao' };
    const tabela = tabelaPreco(passeio, opcao);
    const pessoas = normalizarPessoas(tabela, { adultos: e.adultos, criancasMeia: e.meia, criancasGratis: e.gratis });
    if (pessoas.adultos < 1) return { ok: false, erro: 'adultos' };
    const orc = calcular(tabela, pessoas);
    if (orc.totalCentavos <= 0 || orc.pessoas > 40) return { ok: false, erro: 'pessoas' };
    const escolha: EscolhaPasseio = {
      tipo: 'passeio',
      slug: passeio.slug,
      ...(temOpcoes(passeio) ? { opcao: opcao.id } : {}),
      data: e.data,
      hora: e.hora,
      adultos: pessoas.adultos,
      meia: pessoas.criancasMeia,
      gratis: pessoas.criancasGratis,
      ...(e.sugestao ? { sugestao: true as const } : {}),
    };
    return {
      ok: true,
      escolha,
      passeio,
      orc,
      busca: horarios.busca,
      totalCentavos: orc.totalCentavos,
      totalPixCentavos: totalPixCentavos(orc),
    };
  }

  const trechos = [e.ida, ...(e.volta ? [e.volta] : [])];
  if (!trechos.every((t) => pontaValida(t.saida) && pontaValida(t.destino))) return { ok: false, erro: 'trajeto' };
  // transfer só a partir de amanhã, até 1 ano; a volta depois da ida
  const hoje = hojeEmBuzios(agora);
  if (e.ida.data < primeiroDiaTransfer(hoje) || e.ida.data > somarDias(hoje, 366)) return { ok: false, erro: 'data' };
  if (e.volta && `${e.volta.data}T${e.volta.hora}` <= `${e.ida.data}T${e.ida.hora}`) return { ok: false, erro: 'volta' };
  if (!cabeNoVeiculo(e.veiculo, e.passageiros, e.malas)) return { ok: false, erro: 'veiculo' };
  const precos = trechos.map((t) => precoTrecho(t.saida.lugar, t.destino.lugar, e.veiculo));
  if (precos.some((p) => p === null)) return { ok: false, erro: 'cotacao' };
  const trechosCentavos = precos.map((p) => Math.round((p as number) * 100));
  const limpar = (t: EscolhaTransfer['ida']): EscolhaTransfer['ida'] => ({
    saida: { lugar: t.saida.lugar, ...(t.saida.endereco && !LUGARES[t.saida.lugar].aeroporto ? { endereco: t.saida.endereco } : {}) },
    destino: {
      lugar: t.destino.lugar,
      ...(t.destino.endereco && !LUGARES[t.destino.lugar].aeroporto ? { endereco: t.destino.endereco } : {}),
    },
    data: t.data,
    hora: t.hora,
  });
  const escolha: EscolhaTransfer = {
    tipo: 'transfer',
    veiculo: e.veiculo,
    ida: limpar(e.ida),
    ...(e.volta ? { volta: limpar(e.volta) } : {}),
    passageiros: e.passageiros,
    malas: e.malas,
  };
  return {
    ok: true,
    escolha,
    trechosCentavos,
    totalCentavos: trechosCentavos.reduce((s, c) => s + c, 0),
    // no Pix, cada trecho com o desconto (src/config/precos.ts)
    totalPixCentavos: trechosCentavos.reduce((s, c) => s + precoPixCentavos(c), 0),
  };
}

/** O que ainda vale: o item cuja data ou horário passou sai da conta. */
export const itensQueValem = (itens: ItemCarrinho[], agora?: Date) => itens.filter((i) => conferirEscolha(i.escolha, agora).ok);

/* ------------------------------------------------------------------ */
/* Como cada item aparece                                              */

// o "·" fica preso às palavras dos dois lados (espaços que não quebram): a linha nunca começa nem termina nele. Na
// tela, TextoDoItem faz a parte da direita descer inteira e sem o "·" quando não cabe
const quando = (data: string, hora: string, idioma: Idioma) =>
  `${formatarDataIso(data, LOCALE_INTL[idioma])}${PONTO_PRESO}${formatarHora(hora, idioma)}`;

/** O item como o cliente vê no carrinho e no checkout. Escolha que não vale mais (data passada) → null. */
export function itemVisivel(item: ItemCarrinho, idioma: Idioma, d: Dicionario, agora?: Date): ItemVisivel | null {
  const c = conferirEscolha(item.escolha, agora);
  if (!c.ok) return null;
  if (c.escolha.tipo === 'passeio' && 'passeio' in c) {
    const p = c.passeio;
    const opcao = temOpcoes(p) ? obterOpcao(p, c.escolha.opcao) : undefined;
    return {
      id: item.id,
      tipo: 'passeio',
      titulo: opcao ? `${texto(p.nome, idioma)}${PONTO_PRESO}${texto(opcao.nome, idioma)}` : texto(p.nome, idioma),
      foto: p.fotos[0] ?? '',
      detalhes: [
        quando(c.escolha.data, c.escolha.hora, idioma),
        textoPessoas(
          { adultos: c.escolha.adultos, criancasMeia: c.escolha.meia, criancasGratis: c.escolha.gratis },
          d.comum.rotulos,
          semFaixas(p),
        ),
      ],
      href: `${rota(idioma, `/passeios/${p.slug}`)}?mudar=${item.id}#reservar`,
      totalCentavos: c.totalCentavos,
      totalPixCentavos: c.totalPixCentavos,
      escolha: c.escolha,
    };
  }
  const t = c.escolha as EscolhaTransfer;
  const lugar = (l: IdLugar) => texto(LUGARES[l].nome, idioma);
  const temAeroporto = (x: TrechoEscolhido) => LUGARES[x.saida.lugar].aeroporto || LUGARES[x.destino.lugar].aeroporto;
  // saindo do aeroporto, o voo é o de chegada; indo para ele, o de partida
  const rotuloVoo = (x: TrechoEscolhido) => (LUGARES[x.saida.lugar].aeroporto ? d.transfer.vooChegada : d.transfer.vooPartida);
  return {
    id: item.id,
    tipo: 'transfer',
    titulo: fmt(d.carrinho.transferTitulo, { de: lugar(t.ida.saida.lugar), para: lugar(t.ida.destino.lugar) }),
    foto: VEICULOS[t.veiculo].foto,
    detalhes: [
      quando(t.ida.data, t.ida.hora, idioma),
      ...(t.volta ? [fmt(d.carrinho.volta, { quando: quando(t.volta.data, t.volta.hora, idioma) })] : []),
      `${texto(VEICULOS[t.veiculo].nome, idioma)}${PONTO_PRESO}${textoPassageiros(t.passageiros, d.transfer)}`,
    ],
    href: `${rota(idioma, '/transfer')}?mudar=${item.id}#reservar`,
    totalCentavos: c.totalCentavos,
    totalPixCentavos: c.totalPixCentavos,
    escolha: t,
    transfer: {
      voos: [
        ...(temAeroporto(t.ida) ? [{ trecho: 'ida' as const, rotulo: rotuloVoo(t.ida) }] : []),
        ...(t.volta && temAeroporto(t.volta)
          ? [{ trecho: 'volta' as const, rotulo: `${d.transfer.volta}: ${rotuloVoo(t.volta).toLowerCase()}` }]
          : []),
      ],
      passageiros: t.passageiros,
    },
  };
}

/**
 * As sugestões do carrinho (src/data/sugestoes.ts), com o preço para o grupo do último item e a data do dia
 * seguinte. Com criança no grupo, o passeio com idade mínima (mergulho) não aparece.
 */
export function sugestoesVisiveis(itens: ItemCarrinho[], idioma: Idioma, d: Dicionario, agora?: Date): SugestaoVisivel[] {
  const escolhas = itensQueValem(itens, agora).map((i) => i.escolha);
  const ultimo = escolhas.at(-1);
  if (!ultimo) return [];
  const grupo =
    ultimo.tipo === 'passeio'
      ? { adultos: ultimo.adultos, criancasMeia: ultimo.meia, criancasGratis: ultimo.gratis }
      : { adultos: ultimo.passageiros, criancasMeia: 0, criancasGratis: 0 };
  const data = somarDias(ultimo.tipo === 'passeio' ? ultimo.data : ultimo.ida.data, 1);

  const lista: SugestaoVisivel[] = [];
  for (const slug of sugestoesDoCarrinho(escolhas)) {
    const p = obterPasseio(slug);
    if (!p || (grupo.criancasMeia + grupo.criancasGratis > 0 && regraCriancas(p).idadeMinima)) continue;
    const horarios = horariosDoPasseio(p);
    const pessoas = normalizarPessoas(tabelaPreco(p), grupo);
    lista.push({
      slug,
      nome: texto(p.nome, idioma),
      foto: p.fotos[0] ?? '',
      href: rota(idioma, `/passeios/${slug}`),
      horas: horarios.horas,
      rotuloHorario: horarios.busca ? d.horario.busca : d.horario.saida,
      opcoes: opcoesPasseio(p).map((o) => {
        const orc = calcular(tabelaPreco(p, o), grupo);
        return { id: o.id, nome: texto(o.nome, idioma), totalCentavos: orc.totalCentavos, totalPixCentavos: totalPixCentavos(orc) };
      }),
      pessoas: { adultos: pessoas.adultos, meia: pessoas.criancasMeia, gratis: pessoas.criancasGratis },
      pessoasTexto: textoPessoas(pessoas, d.comum.rotulos, semFaixas(p)),
      data,
    });
    if (lista.length === MAXIMO_SUGESTOES) break;
  }
  return lista;
}

/* ------------------------------------------------------------------ */
/* Onde o carrinho fica guardado                                       */

/** O pedido que este carrinho virou, para a página de checkout oferecer "continuar o pagamento" enquanto ele está em aberto. */
export interface PedidoDoCarrinho {
  codigo: string;
  /** O token do link privado: quem tem o cookie do carrinho é quem fez o pedido. */
  token: string;
  status: StatusReserva;
  /** A forma escolhida na Stripe (cartão ou Pix); ausente no caminho do WhatsApp. */
  forma?: FormaPagamento;
}

/**
 * Os lembretes do carrinho abandonado (src/lib/carrinho-lembretes.ts): quando cada um saiu e quando o cliente voltou
 * pelo link do e-mail. No banco é a tabela carrinhos_lembretes, separada para não mexer no atualizado_em do carrinho
 * (que é a última vez que o CLIENTE mexeu nele); nos arquivos do computador, um campo do próprio arquivo.
 */
export interface LembretesDoCarrinho {
  lembrete1Em?: string;
  lembrete2Em?: string;
  voltouEm?: string;
  voltouLembrete?: 1 | 2;
}

export interface CarrinhoGuardado {
  itens: ItemCarrinho[];
  email?: string;
  pedidoId?: string | null;
  /** O pedido que o carrinho virou, quando ainda existe. Só vem preenchido junto com `pedidoId`. */
  pedido?: PedidoDoCarrinho;
  /** A campanha do anúncio de onde o cliente veio. */
  origem?: Origem;
  /**
   * Só nos arquivos do computador: no banco, são as colunas id, idioma, criado_em, atualizado_em e checkout_em e a
   * tabela carrinhos_lembretes. O id é o que vai no link assinado dos lembretes (nunca o código do cookie).
   */
  id?: string;
  idioma?: Idioma;
  criadoEm?: string;
  atualizadoEm?: string;
  checkoutEm?: string;
  lembretes?: LembretesDoCarrinho;
}

export const novoCodigoCarrinho = () => randomBytes(18).toString('base64url');
export const codigoCarrinhoValido = (c: string | undefined): c is string => !!c && /^[A-Za-z0-9_-]{20,40}$/.test(c);

/** O carrinho fica guardado 60 dias, só no cookie deste site (o navegador não lê o código). */
export const OPCOES_COOKIE_CARRINHO = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 60,
};

// No banco na Vercel (ou no computador com RESERVAS_NO_BANCO=1); senão, arquivos em .data/carrinhos/.
export const PASTA_CARRINHOS = path.join(process.cwd(), '.data', 'carrinhos');
const PASTA = PASTA_CARRINHOS;

/**
 * O carrinho que virou um pedido da Stripe continua aberto enquanto nada foi pago: com o pedido pendente ou
 * expirado, o cliente que fechou o formulário da Stripe volta e encontra tudo como estava, com "continuar o
 * pagamento" (pedidoPagavel); com o pedido cancelado (a sessão falhou, ou a equipe cancelou), ele refaz a compra
 * sem remontar o carrinho. Pago (ou fechado pelo WhatsApp), o carrinho acabou.
 */
export const carrinhoContinuaAberto = (status: StatusReserva): boolean => podeAbrirSessao(status) || status === 'cancelado';

/** O pedido do carrinho ainda pode ser pago: é quando a página oferece "continuar o pagamento". */
export const pedidoPagavel = (status: StatusReserva): boolean => podeAbrirSessao(status);

/** O carrinho ainda recebe itens: nunca virou pedido, ou o pedido que virou ainda está em aberto na Stripe. */
export const carrinhoReaproveitavel = (c: CarrinhoGuardado): boolean =>
  !c.pedidoId || (c.pedido !== undefined && carrinhoContinuaAberto(c.pedido.status));

/** Os itens ficam guardados depois do pedido, mas para o cliente o carrinho que virou pedido fechado está vazio. */
const conformeOPedido = (c: CarrinhoGuardado): CarrinhoGuardado => (carrinhoReaproveitavel(c) ? c : { ...c, itens: [] });

const formaDe = (metodo: string): FormaPagamento | undefined => (metodo === 'pix' || metodo === 'cartao' ? metodo : undefined);

export async function lerCarrinho(codigo: string | undefined): Promise<CarrinhoGuardado> {
  if (!codigoCarrinhoValido(codigo)) return { itens: [] };
  if (usarBanco()) {
    const { data, error } = await supabase()
      .from('carrinhos')
      .select('itens, email, pedido_id, origem_utm, pedidos(codigo, token, status, metodo_pagamento)')
      .eq('token', codigo)
      .maybeSingle();
    if (error) throw new Error(`Banco de dados: ${error.message}`);
    if (!data) return { itens: [] };
    const p = data.pedidos;
    return conformeOPedido({
      itens: (data.itens as unknown as ItemCarrinho[]) ?? [],
      email: data.email ?? undefined,
      pedidoId: data.pedido_id,
      ...(p
        ? { pedido: { codigo: p.codigo, token: p.token, status: p.status as StatusReserva, forma: formaDe(p.metodo_pagamento ?? '') } }
        : {}),
      origem: data.origem_utm as Origem,
    });
  }
  let c: CarrinhoGuardado;
  try {
    c = JSON.parse(await fs.readFile(path.join(PASTA, `${codigo}.json`), 'utf8')) as CarrinhoGuardado;
  } catch {
    return { itens: [] };
  }
  // nos arquivos do computador, o id do pedido é o próprio código
  const r = c.pedidoId ? await obterReservaDoPedido(c.pedidoId) : null;
  return conformeOPedido({
    ...c,
    ...(r
      ? { pedido: { codigo: r.pedido?.codigo ?? r.codigo, token: r.token, status: r.status, forma: formaDe(r.pagamento.metodo) } }
      : {}),
  });
}

/** Grava os itens (e o e-mail, se veio), criando o carrinho na primeira vez. */
export async function gravarCarrinho(
  codigo: string,
  mudanca: { itens?: ItemCarrinho[]; email?: string; idioma?: Idioma; pedidoId?: string; origem?: Origem },
): Promise<void> {
  if (mudanca.itens && mudanca.itens.length > MAXIMO_ITENS) throw new Error('Carrinho cheio');
  if (usarBanco()) {
    const linha = {
      token: codigo,
      ...(mudanca.itens ? { itens: mudanca.itens as unknown as Json } : {}),
      ...(mudanca.email !== undefined ? { email: mudanca.email } : {}),
      ...(mudanca.idioma ? { idioma: mudanca.idioma } : {}),
      ...(mudanca.pedidoId ? { pedido_id: mudanca.pedidoId } : {}),
      // o último anúncio é o que vale; sem anúncio nesta visita, fica o que já estava
      ...(mudanca.origem && Object.keys(mudanca.origem).length ? { origem_utm: mudanca.origem as Json } : {}),
    };
    const { error } = await supabase().from('carrinhos').upsert(linha, { onConflict: 'token' });
    if (error) throw new Error(`Banco de dados: ${error.message}`);
    return;
  }
  const atual = await lerCarrinho(codigo);
  const agora = new Date().toISOString();
  await fs.mkdir(PASTA, { recursive: true });
  await fs.writeFile(
    path.join(PASTA, `${codigo}.json`),
    JSON.stringify(
      {
        // como no banco: o id e o idioma do carrinho, e a última vez que o cliente mexeu nele (para os lembretes)
        id: atual.id ?? randomUUID(),
        idioma: mudanca.idioma ?? atual.idioma,
        itens: mudanca.itens ?? atual.itens,
        email: mudanca.email ?? atual.email,
        pedidoId: mudanca.pedidoId ?? atual.pedidoId,
        origem: mudanca.origem && Object.keys(mudanca.origem).length ? mudanca.origem : atual.origem,
        criadoEm: atual.criadoEm ?? agora,
        atualizadoEm: agora,
        checkoutEm: atual.checkoutEm,
        lembretes: atual.lembretes,
      },
      null,
      2,
    ),
  );
}

/** Marca a primeira vez que o carrinho abriu o checkout, para o funil das estatísticas. */
export async function marcarCheckout(codigo: string | undefined): Promise<void> {
  if (!codigoCarrinhoValido(codigo)) return;
  const agora = new Date().toISOString();
  if (usarBanco()) {
    const { error } = await supabase().from('carrinhos').update({ checkout_em: agora }).eq('token', codigo).is('checkout_em', null);
    if (error) throw new Error(`Banco de dados: ${error.message}`);
    return;
  }
  // o pedido é lido do banco de reservas a cada leitura: não entra no arquivo
  const { pedido: _pedido, ...atual } = await lerCarrinho(codigo);
  if (!atual.itens.length || atual.checkoutEm) return;
  await fs.writeFile(path.join(PASTA, `${codigo}.json`), JSON.stringify({ ...atual, checkoutEm: agora, atualizadoEm: agora }, null, 2));
}

/** Uma linha de carrinhos_lembretes como o banco devolve (a relação é de um para um, mas o PostgREST pode mandar lista). */
interface LinhaLembretes {
  lembrete_1_em: string | null;
  lembrete_2_em: string | null;
  voltou_em: string | null;
}
interface LinhaDoFunil {
  criado_em: string;
  checkout_em: string | null;
  pedido_id: string | null;
  pedidos: { status: string; criado_em: string } | null;
  carrinhos_lembretes?: LinhaLembretes | LinhaLembretes[] | null;
}

const umSo = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : (v ?? undefined));

/** Os lembretes de uma linha do funil, só com o que existe. */
function lembretesDaLinha(l: LinhaLembretes | undefined): Pick<CarrinhoNoFunil, 'lembrete1Em' | 'lembrete2Em' | 'voltouEm'> {
  return {
    ...(l?.lembrete_1_em ? { lembrete1Em: l.lembrete_1_em } : {}),
    ...(l?.lembrete_2_em ? { lembrete2Em: l.lembrete_2_em } : {}),
    ...(l?.voltou_em ? { voltouEm: l.voltou_em } : {}),
  };
}

/** As linhas dos carrinhos, de 1000 em 1000; `comLembretes`: junto com carrinhos_lembretes (a migração da Etapa 6). */
async function linhasDoFunil(desde: string | undefined, comLembretes: boolean): Promise<LinhaDoFunil[]> {
  const campos = `criado_em, checkout_em, pedido_id, pedidos(status, criado_em)${comLembretes ? ', carrinhos_lembretes(lembrete_1_em, lembrete_2_em, voltou_em)' : ''}`;
  const linhas: LinhaDoFunil[] = [];
  for (let de = 0; ; de += 1000) {
    let consulta = supabase().from('carrinhos').select(campos);
    if (desde) consulta = consulta.gte('criado_em', desde);
    const { data, error } = await consulta.order('criado_em', { ascending: false }).range(de, de + 999);
    if (error) throw new Error(`Banco de dados: ${error.message}`);
    const pagina = data as unknown as LinhaDoFunil[];
    linhas.push(...pagina);
    if (pagina.length < 1000) return linhas;
  }
}

/**
 * Os carrinhos criados a partir de uma data (ou todos), só com o que o funil e os lembretes das estatísticas usam.
 * A busca volta 3 dias antes da data: um carrinho criado um pouco antes do período pode ter recebido o lembrete
 * dentro dele (o funil continua contando só os criados no período, src/lib/estatisticas.ts).
 */
export async function carrinhosDoFunil(desde?: string): Promise<CarrinhoNoFunil[]> {
  const inicio = desde ? new Date(Date.parse(desde) - 3 * 86_400_000).toISOString() : undefined;
  if (usarBanco()) {
    let linhas: LinhaDoFunil[];
    try {
      linhas = await linhasDoFunil(inicio, true);
    } catch (e) {
      // a migração dos lembretes (carrinhos_lembretes) ainda não foi aplicada: o funil sai sem eles
      console.error(`[estatisticas] carrinhos sem os lembretes: ${e instanceof Error ? e.message : String(e)}`);
      linhas = await linhasDoFunil(inicio, false);
    }
    return linhas.map((c) => ({
      criadoEm: c.criado_em,
      ...(c.checkout_em ? { checkoutEm: c.checkout_em } : {}),
      fezPedido: c.pedido_id !== null,
      ...(c.pedidos?.criado_em ? { pedidoEm: c.pedidos.criado_em } : {}),
      pagou: c.pedidos?.status === 'pago',
      ...lembretesDaLinha(umSo(c.carrinhos_lembretes)),
    }));
  }
  const nomes = (await fs.readdir(PASTA).catch(() => [] as string[])).filter((n) => n.endsWith('.json'));
  const pedidos = new Map((await listarReservas()).map((r) => [r.pedido?.codigo ?? r.codigo, r]));
  const lista = await Promise.all(
    nomes.map(async (nome) => {
      const arquivo = path.join(PASTA, nome);
      const c = JSON.parse(await fs.readFile(arquivo, 'utf8')) as CarrinhoGuardado;
      const pedido = c.pedidoId ? pedidos.get(c.pedidoId) : undefined;
      const l = c.lembretes;
      return {
        criadoEm: c.criadoEm ?? (await fs.stat(arquivo)).mtime.toISOString(),
        ...(c.checkoutEm ? { checkoutEm: c.checkoutEm } : {}),
        fezPedido: Boolean(c.pedidoId),
        ...(pedido ? { pedidoEm: pedido.criadaEm } : {}),
        pagou: pedido?.status === 'pago',
        ...lembretesDaLinha({
          lembrete_1_em: l?.lembrete1Em ?? null,
          lembrete_2_em: l?.lembrete2Em ?? null,
          voltou_em: l?.voltouEm ?? null,
        }),
      };
    }),
  );
  return inicio ? lista.filter((c) => Date.parse(c.criadoEm) >= Date.parse(inicio)) : lista;
}

/** Os itens que ainda valem, já com o texto e o preço no idioma. */
export function itensVisiveis(itens: ItemCarrinho[], idioma: Idioma, d: Dicionario): ItemVisivel[] {
  return itens.map((i) => itemVisivel(i, idioma, d)).filter((i): i is ItemVisivel => i !== null);
}
