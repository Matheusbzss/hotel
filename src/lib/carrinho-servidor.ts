import 'server-only';
import { randomBytes } from 'node:crypto';
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

// o "·" fica preso à palavra de antes (espaço que não quebra): a linha nunca começa com ele, no máximo termina
const quando = (data: string, hora: string, idioma: Idioma) =>
  `${formatarDataIso(data, LOCALE_INTL[idioma])} · ${formatarHora(hora, idioma)}`;

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
      titulo: opcao ? `${texto(p.nome, idioma)} · ${texto(opcao.nome, idioma)}` : texto(p.nome, idioma),
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
      `${texto(VEICULOS[t.veiculo].nome, idioma)} · ${textoPassageiros(t.passageiros, d.transfer)}`,
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

export interface CarrinhoGuardado {
  itens: ItemCarrinho[];
  email?: string;
  pedidoId?: string | null;
  /** O pedido que o carrinho virou, quando ainda existe. Só vem preenchido junto com `pedidoId`. */
  pedido?: PedidoDoCarrinho;
  /** A campanha do anúncio de onde o cliente veio. */
  origem?: Origem;
  /** Só nos arquivos do computador: no banco, são as colunas criado_em e checkout_em. */
  criadoEm?: string;
  checkoutEm?: string;
}

export const novoCodigoCarrinho = () => randomBytes(18).toString('base64url');
export const codigoCarrinhoValido = (c: string | undefined): c is string => !!c && /^[A-Za-z0-9_-]{20,40}$/.test(c);

// No banco na Vercel (ou no computador com RESERVAS_NO_BANCO=1); senão, arquivos em .data/carrinhos/.
const PASTA = path.join(process.cwd(), '.data', 'carrinhos');

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
  await fs.mkdir(PASTA, { recursive: true });
  await fs.writeFile(
    path.join(PASTA, `${codigo}.json`),
    JSON.stringify(
      {
        itens: mudanca.itens ?? atual.itens,
        email: mudanca.email ?? atual.email,
        pedidoId: mudanca.pedidoId ?? atual.pedidoId,
        origem: mudanca.origem && Object.keys(mudanca.origem).length ? mudanca.origem : atual.origem,
        criadoEm: atual.criadoEm ?? new Date().toISOString(),
        checkoutEm: atual.checkoutEm,
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
  await fs.writeFile(path.join(PASTA, `${codigo}.json`), JSON.stringify({ ...atual, checkoutEm: agora }, null, 2));
}

/** Os carrinhos criados a partir de uma data (ou todos), só com o que o funil das estatísticas usa. */
export async function carrinhosDoFunil(desde?: string): Promise<CarrinhoNoFunil[]> {
  if (usarBanco()) {
    const lista: CarrinhoNoFunil[] = [];
    for (let de = 0; ; de += 1000) {
      let consulta = supabase().from('carrinhos').select('criado_em, checkout_em, pedido_id, pedidos(status)');
      if (desde) consulta = consulta.gte('criado_em', desde);
      const { data, error } = await consulta.order('criado_em', { ascending: false }).range(de, de + 999);
      if (error) throw new Error(`Banco de dados: ${error.message}`);
      for (const c of data) {
        lista.push({
          criadoEm: c.criado_em,
          ...(c.checkout_em ? { checkoutEm: c.checkout_em } : {}),
          fezPedido: c.pedido_id !== null,
          pagou: c.pedidos?.status === 'pago',
        });
      }
      if (data.length < 1000) return lista;
    }
  }
  const nomes = (await fs.readdir(PASTA).catch(() => [] as string[])).filter((n) => n.endsWith('.json'));
  const status = new Map((await listarReservas()).map((r) => [r.pedido?.codigo ?? r.codigo, r.status]));
  const lista = await Promise.all(
    nomes.map(async (nome) => {
      const arquivo = path.join(PASTA, nome);
      const c = JSON.parse(await fs.readFile(arquivo, 'utf8')) as CarrinhoGuardado;
      return {
        criadoEm: c.criadoEm ?? (await fs.stat(arquivo)).mtime.toISOString(),
        ...(c.checkoutEm ? { checkoutEm: c.checkoutEm } : {}),
        fezPedido: Boolean(c.pedidoId),
        pagou: Boolean(c.pedidoId) && status.get(c.pedidoId as string) === 'pago',
      };
    }),
  );
  return desde ? lista.filter((c) => c.criadoEm >= desde) : lista;
}

/** Os itens que ainda valem, já com o texto e o preço no idioma. */
export function itensVisiveis(itens: ItemCarrinho[], idioma: Idioma, d: Dicionario): ItemVisivel[] {
  return itens.map((i) => itemVisivel(i, idioma, d)).filter((i): i is ItemVisivel => i !== null);
}
