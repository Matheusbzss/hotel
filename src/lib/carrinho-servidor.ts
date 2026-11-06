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
import { supabase, usarBanco } from './banco';
import type { Json } from './banco-tipos';
import {
  MAXIMO_ITENS,
  type EscolhaPasseio,
  type EscolhaTransfer,
  type ItemCarrinho,
  type ItemVisivel,
  type SugestaoVisivel,
  type TrechoEscolhido,
} from './carrinho';
import { formatarHora, horasDisponiveis } from './horarios';
import { calcular, normalizarPessoas, precoPixCentavos, totalPixCentavos, type Orcamento } from './orcamento';
import { semFaixas } from './passeio-view';
import { textoPessoas } from './pessoas';
import { obterOpcao, opcoesPasseio, regraCriancas, tabelaPreco, temOpcoes } from './precos';
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

const quando = (data: string, hora: string, idioma: Idioma) =>
  `${formatarDataIso(data, LOCALE_INTL[idioma])} · ${formatarHora(hora, idioma)}`;

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
      titulo: opcao ? `${p.nome[idioma]} · ${opcao.nome[idioma]}` : p.nome[idioma],
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
  const lugar = (l: IdLugar) => LUGARES[l].nome[idioma];
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
      `${VEICULOS[t.veiculo].nome[idioma]} · ${textoPassageiros(t.passageiros, d.transfer)}`,
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
      nome: p.nome[idioma],
      foto: p.fotos[0] ?? '',
      href: rota(idioma, `/passeios/${slug}`),
      horas: horarios.horas,
      rotuloHorario: horarios.busca ? d.horario.busca : d.horario.saida,
      opcoes: opcoesPasseio(p).map((o) => {
        const orc = calcular(tabelaPreco(p, o), grupo);
        return { id: o.id, nome: o.nome[idioma], totalCentavos: orc.totalCentavos, totalPixCentavos: totalPixCentavos(orc) };
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

export interface CarrinhoGuardado {
  itens: ItemCarrinho[];
  email?: string;
  pedidoId?: string | null;
}

export const novoCodigoCarrinho = () => randomBytes(18).toString('base64url');
export const codigoCarrinhoValido = (c: string | undefined): c is string => !!c && /^[A-Za-z0-9_-]{20,40}$/.test(c);

// No banco na Vercel (ou no computador com RESERVAS_NO_BANCO=1); senão, arquivos em .data/carrinhos/.
const PASTA = path.join(process.cwd(), '.data', 'carrinhos');

/** Os itens ficam guardados depois do pedido, mas para o cliente o carrinho que virou pedido está vazio. */
const semOQueVirouPedido = (c: CarrinhoGuardado): CarrinhoGuardado => (c.pedidoId ? { ...c, itens: [] } : c);

export async function lerCarrinho(codigo: string | undefined): Promise<CarrinhoGuardado> {
  if (!codigoCarrinhoValido(codigo)) return { itens: [] };
  if (usarBanco()) {
    const { data, error } = await supabase().from('carrinhos').select('itens, email, pedido_id').eq('token', codigo).maybeSingle();
    if (error) throw new Error(`Banco de dados: ${error.message}`);
    if (!data) return { itens: [] };
    return semOQueVirouPedido({
      itens: (data.itens as unknown as ItemCarrinho[]) ?? [],
      email: data.email ?? undefined,
      pedidoId: data.pedido_id,
    });
  }
  try {
    return semOQueVirouPedido(JSON.parse(await fs.readFile(path.join(PASTA, `${codigo}.json`), 'utf8')) as CarrinhoGuardado);
  } catch {
    return { itens: [] };
  }
}

/** Grava os itens (e o e-mail, se veio), criando o carrinho na primeira vez. */
export async function gravarCarrinho(
  codigo: string,
  mudanca: { itens?: ItemCarrinho[]; email?: string; idioma?: Idioma; pedidoId?: string },
): Promise<void> {
  if (mudanca.itens && mudanca.itens.length > MAXIMO_ITENS) throw new Error('Carrinho cheio');
  if (usarBanco()) {
    const linha = {
      token: codigo,
      ...(mudanca.itens ? { itens: mudanca.itens as unknown as Json } : {}),
      ...(mudanca.email !== undefined ? { email: mudanca.email } : {}),
      ...(mudanca.idioma ? { idioma: mudanca.idioma } : {}),
      ...(mudanca.pedidoId ? { pedido_id: mudanca.pedidoId } : {}),
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
      },
      null,
      2,
    ),
  );
}

/** Os itens que ainda valem, já com o texto e o preço no idioma. */
export function itensVisiveis(itens: ItemCarrinho[], idioma: Idioma, d: Dicionario): ItemVisivel[] {
  return itens.map((i) => itemVisivel(i, idioma, d)).filter((i): i is ItemVisivel => i !== null);
}
