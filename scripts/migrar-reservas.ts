// Copia as reservas do Vercel Blob (reservas/<VOUCHER>.json) para o banco de dados (Supabase).
// Nada é apagado do Blob: ele fica como cópia de segurança.
//
// Sem opção, só CONTA (não grava nada). Com --gravar, copia as que faltam e atualiza no banco as que
// mudaram no Blob depois da cópia; no fim, mostra a contagem de antes e de depois e confere, reserva por
// reserva, que o banco devolve exatamente o que estava no Blob. Com --conferir-links (depois de publicar),
// abre no site o link de cada reserva e confere que ele continua funcionando.
//
// Uso, na pasta do projeto (o .env.migracao.local tem o BLOB_READ_WRITE_TOKEN):
//   node --experimental-strip-types --env-file=.env.local --env-file=.env.migracao.local scripts/migrar-reservas.ts
//   (o mesmo comando) --gravar
//   (o mesmo comando) --conferir-links [endereço do site]

import { isDeepStrictEqual } from 'node:util';
import { get, list } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';
import { deLinhas, paraLinhas, type EventoHistorico, type LinhaItem, type LinhaPedido } from '../src/lib/reservas-banco.ts';
import type { Reserva } from '../src/lib/reservas.ts';

const GRAVAR = process.argv.includes('--gravar');
const CONFERIR_LINKS = process.argv.includes('--conferir-links');
const SITE = (process.argv.find((a) => a.startsWith('http')) ?? 'https://agenciavictorhugo.online').replace(/\/$/, '');

const faltam = ['BLOB_READ_WRITE_TOKEN', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY'].filter((v) => !process.env[v]);
if (faltam.length) {
  console.log(`Faltam variáveis: ${faltam.join(', ')}. O token do Blob vai no .env.migracao.local; o resto, no .env.local.`);
  process.exit(1);
}

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const CODIGO = /^(ON|VH)-[2-9A-HJ-NP-Z]{6}$/;
// Campos que saíram do site e não vão para o banco: o custo do parceiro, que o dono pediu para tirar do
// código e do painel (Fase 2, Etapa 8). Nas reservas antigas ele continua guardado só no Blob.
const CAMPOS_RETIRADOS = ['custoParceiroCentavos'];

/** Roda as tarefas de 6 em 6. */
async function emLotes<T, R>(itens: T[], fazer: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += 6) saida.push(...(await Promise.all(itens.slice(i, i + 6).map(fazer))));
  return saida;
}

async function contar(tabela: 'pedidos' | 'itens_pedido' | 'pedidos_historico'): Promise<number> {
  const { count, error } = await db.from(tabela).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return count ?? 0;
}

async function contagem() {
  return { pedidos: await contar('pedidos'), itens: await contar('itens_pedido'), historico: await contar('pedidos_historico') };
}

// 1. As reservas do Blob
const caminhos: string[] = [];
let cursor: string | undefined;
do {
  const pagina = await list({ prefix: 'reservas/', limit: 1000, cursor });
  caminhos.push(...pagina.blobs.map((b) => b.pathname));
  cursor = pagina.hasMore ? pagina.cursor : undefined;
} while (cursor);

const ilegiveis: string[] = [];
const lidas = await emLotes(caminhos, async (caminho) => {
  try {
    const r = await get(caminho, { access: 'private', useCache: false });
    const reserva = JSON.parse(await new Response(r!.stream).text()) as Reserva;
    if (!CODIGO.test(reserva.codigo) || !reserva.token || !reserva.cliente || !reserva.pagamento) throw new Error('formato');
    return reserva;
  } catch {
    ilegiveis.push(caminho);
    return null;
  }
});
const doBlob = lidas.filter((r): r is Reserva => r !== null);

// 2. O que o banco já tem
const noBanco = new Map<string, string>();
for (let de = 0; ; de += 1000) {
  const { data, error } = await db.from('pedidos').select('codigo, atualizado_em').range(de, de + 999);
  if (error) throw new Error(`pedidos: ${error.message}`);
  for (const p of data) noBanco.set(p.codigo, p.atualizado_em);
  if (data.length < 1000) break;
}

const copiar = doBlob.filter((r) => !noBanco.has(r.codigo));
const mudaramNoBlob = doBlob.filter((r) => noBanco.has(r.codigo) && Date.parse(r.atualizadaEm) > Date.parse(noBanco.get(r.codigo)!));
const iguais = doBlob.length - copiar.length - mudaramNoBlob.length;

const porChave = (lista: Reserva[], chave: (r: Reserva) => string) =>
  Object.entries(lista.reduce<Record<string, number>>((s, r) => ({ ...s, [chave(r)]: (s[chave(r)] ?? 0) + 1 }), {}))
    .map(([k, n]) => `${k}: ${n}`)
    .join(' · ') || 'nenhuma';

console.log(`Reservas no Blob: ${caminhos.length} arquivo(s), ${doBlob.length} reserva(s) lida(s)`);
if (ilegiveis.length) console.log(`  Não deu para ler: ${ilegiveis.join(', ')}`);
console.log(`  Por tipo: ${porChave(doBlob, (r) => (r.tipo === 'transfer' ? 'transfer' : 'passeio'))}`);
console.log(`  Por status: ${porChave(doBlob, (r) => r.status)}`);
console.log(`Já no banco e iguais: ${iguais}`);
console.log(`Para copiar: ${copiar.length}${copiar.length ? ` (${copiar.map((r) => r.codigo).join(', ')})` : ''}`);
console.log(`Mudaram no Blob depois da cópia (o banco é atualizado): ${mudaramNoBlob.length}`);

if (CONFERIR_LINKS) {
  // o mesmo caminho do cliente: o link com a senha (?t=) abre a reserva, agora lida do banco
  const resultado = await emLotes(doBlob, async (r) => {
    const api = await fetch(`${SITE}/api/reservas/${r.codigo}?t=${encodeURIComponent(r.token)}&idioma=${r.idioma}`);
    const corpo = (await api.json().catch(() => null)) as { reserva?: { codigo?: string } } | null;
    const pagina = await fetch(`${SITE}${r.idioma === 'pt' ? '' : `/${r.idioma}`}/reserva/${r.codigo}?t=${encodeURIComponent(r.token)}`);
    const ok = api.status === 200 && corpo?.reserva?.codigo === r.codigo && pagina.status === 200;
    return `${r.codigo}: ${ok ? 'abre' : `NÃO abre (api ${api.status}, página ${pagina.status})`}`;
  });
  console.log(`\nLinks no site (${SITE}):\n${resultado.join('\n') || 'nenhuma reserva'}`);
  process.exit(resultado.every((l) => l.endsWith('abre')) ? 0 : 1);
}

if (!GRAVAR) {
  console.log('\nNada foi gravado. Para copiar, rode de novo com --gravar.');
  process.exit(0);
}

// 3. Copiar
const antes = await contagem();
const falhas: string[] = [];
for (const r of copiar) {
  const l = paraLinhas(r);
  const { data, error } = await db.rpc('criar_reserva', { p_pedido: l.pedido, p_item: l.item, p_historico: l.historico });
  if (error || data !== true) falhas.push(`${r.codigo}: ${error?.message ?? 'o código já existe no banco'}`);
}
for (const r of mudaramNoBlob) {
  const l = paraLinhas(r);
  const { data, error } = await db.rpc('atualizar_reserva', { p_versao: null, p_pedido: l.pedido, p_item: l.item, p_historico: l.historico });
  if (error || data !== true) falhas.push(`${r.codigo}: ${error?.message ?? 'não atualizou'}`);
}
const depois = await contagem();

// 4. Conferir: o banco devolve exatamente o que estava no Blob?
type PedidoCompleto = LinhaPedido & { itens_pedido: LinhaItem[]; pedidos_historico: EventoHistorico[] };
const diferentes: string[] = [];
for (let i = 0; i < doBlob.length; i += 100) {
  const lote = doBlob.slice(i, i + 100);
  const { data, error } = await db
    .from('pedidos')
    .select('*, itens_pedido(*), pedidos_historico(em, evento)')
    .in('codigo', lote.map((r) => r.codigo));
  if (error) throw new Error(`conferência: ${error.message}`);
  const lidos = new Map((data as unknown as PedidoCompleto[]).map((p) => [p.codigo, p]));
  for (const r of lote) {
    const p = lidos.get(r.codigo);
    if (!p) {
      diferentes.push(`${r.codigo}: não está no banco`);
      continue;
    }
    const doBanco = deLinhas(p, p.itens_pedido[0], p.pedidos_historico);
    // as reservas antigas não tinham "tipo" e voltam como passeio; "atualizadaEm" muda quando o banco atualiza
    const original: Record<string, unknown> = { ...r, tipo: r.tipo ?? 'passeio', atualizadaEm: '' };
    for (const campo of CAMPOS_RETIRADOS) delete original[campo];
    if (!isDeepStrictEqual({ ...doBanco, atualizadaEm: '' }, JSON.parse(JSON.stringify(original)))) diferentes.push(`${r.codigo}: diferente`);
  }
}

console.log(`\nAntes:  ${antes.pedidos} pedido(s), ${antes.itens} item(ns), ${antes.historico} evento(s) de histórico`);
console.log(`Depois: ${depois.pedidos} pedido(s), ${depois.itens} item(ns), ${depois.historico} evento(s) de histórico`);
console.log(falhas.length ? `Falhas:\n  ${falhas.join('\n  ')}` : 'Nenhuma falha ao gravar.');
for (const campo of CAMPOS_RETIRADOS) {
  const n = doBlob.filter((r) => campo in r).length;
  if (n) console.log(`Ficou só no Blob, de propósito: ${campo} em ${n} reserva(s).`);
}
console.log(
  diferentes.length
    ? `Diferenças entre o Blob e o banco:\n  ${diferentes.join('\n  ')}`
    : `Conferência: as ${doBlob.length} reserva(s) do Blob estão no banco, iguais.`,
);
process.exit(falhas.length || diferentes.length ? 1 : 0);
