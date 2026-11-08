import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { chamadaDoAgendamento } from '@/lib/admin-auth';
import { supabase, usarBanco } from '@/lib/banco';
import { TAG_CAMBIO, taxaDolarValida } from '@/lib/dolar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A cotação do dólar, num endereço só:
 * - Com o segredo do agendamento (vercel.json, dia útil às 13h30 de Brasília): busca a PTAX de venda do
 *   Banco Central (se ele falhar, o Frankfurter, o câmbio diário do Banco Central Europeu, grátis e sem
 *   chave) e guarda na tabela cambio_dolar. Grava só quando a data da cotação é nova; aí as páginas com
 *   a etiqueta 'cambio' são refeitas na próxima visita.
 * - Sem o segredo: só devolve a cotação guardada, sem mexer em nada. É dado público (a PTAX do BC) e é
 *   por aqui que o site lê o valor (src/lib/dolar.ts, que não pode falar com o banco direto).
 */

const PTAX = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';
const SEM_CACHE = { 'Cache-Control': 'no-store' };

const mmddaaaa = (d: Date) =>
  `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}-${d.getUTCFullYear()}`;

interface CotacaoBuscada {
  taxa: number;
  /** A data da cotação (AAAA-MM-DD), não a de hoje: na segunda de manhã ainda vale a de sexta. */
  data: string;
  fonte: 'bcb' | 'frankfurter';
}

/** A PTAX de venda mais nova dos últimos 10 dias (cobrem fim de semana e feriado), com a data dela. */
async function buscarBancoCentral(agora: Date): Promise<CotacaoBuscada | null> {
  const inicio = new Date(agora.getTime() - 10 * 864e5);
  const url =
    `${PTAX}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${mmddaaaa(inicio)}'&@dataFinalCotacao='${mmddaaaa(agora)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
  try {
    const resposta = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { value?: { cotacaoVenda?: number; dataHoraCotacao?: string }[] };
    const ultima = dados.value?.at(-1);
    const taxa = ultima?.cotacaoVenda;
    const data = ultima?.dataHoraCotacao?.slice(0, 10);
    return taxaDolarValida(taxa) && data ? { taxa, data, fonte: 'bcb' } : null;
  } catch {
    return null;
  }
}

/** A reserva quando o Banco Central falha. */
async function buscarFrankfurter(): Promise<CotacaoBuscada | null> {
  try {
    const resposta = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=BRL', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { date?: string; rates?: { BRL?: number } };
    const taxa = dados.rates?.BRL;
    return taxaDolarValida(taxa) && dados.date ? { taxa, data: dados.date, fonte: 'frankfurter' } : null;
  } catch {
    return null;
  }
}

/** A leitura, sem segredo: a última cotação guardada, sempre com resposta 200 para o cache do site. */
async function cotacaoGuardada(): Promise<NextResponse> {
  if (!usarBanco()) return NextResponse.json({ ok: false }, { headers: SEM_CACHE });
  const { data: linha, error } = await supabase()
    .from('cambio_dolar')
    .select('taxa, data_ptax')
    .order('data_ptax', { ascending: false })
    .limit(1)
    .maybeSingle();
  // o erro de banco responde 500 de propósito: resposta que não é 200 não fica no cache, e a próxima visita tenta de novo
  if (error) return NextResponse.json({ ok: false }, { status: 500, headers: SEM_CACHE });
  if (!linha) return NextResponse.json({ ok: false }, { headers: SEM_CACHE });
  return NextResponse.json({ ok: true, taxa: linha.taxa, data: linha.data_ptax }, { headers: SEM_CACHE });
}

export async function GET(req: Request) {
  if (!chamadaDoAgendamento(req)) return cotacaoGuardada();
  if (!usarBanco()) return NextResponse.json({ ok: false, erro: 'banco não configurado' }, { status: 503 });

  const cotacao = (await buscarBancoCentral(new Date())) ?? (await buscarFrankfurter());
  if (!cotacao) {
    console.error('cambio: nenhuma fonte respondeu com uma taxa entre 1 e 20');
    return NextResponse.json({ ok: false, erro: 'nenhuma fonte respondeu' }, { status: 502 });
  }

  const guardada = await supabase()
    .from('cambio_dolar')
    .select('data_ptax')
    .order('data_ptax', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (guardada.error) return NextResponse.json({ ok: false, erro: `banco: ${guardada.error.message}` }, { status: 500 });
  const ultimaData = guardada.data?.data_ptax;

  // grava só data nova (as datas AAAA-MM-DD se comparam como texto)
  let gravou = false;
  if (!ultimaData || cotacao.data > ultimaData) {
    const { error } = await supabase().from('cambio_dolar').insert({ data_ptax: cotacao.data, taxa: cotacao.taxa, fonte: cotacao.fonte });
    // 23505: outra chamada gravou a mesma data no meio do caminho; não é erro
    if (error && error.code !== '23505') return NextResponse.json({ ok: false, erro: `banco: ${error.message}` }, { status: 500 });
    gravou = !error;
    if (gravou) revalidateTag(TAG_CAMBIO, 'max');
  }

  const resumo = { ok: true, fonte: cotacao.fonte, data: cotacao.data, taxa: cotacao.taxa, gravou };
  // fica nos registros da Vercel: é por eles que se confere o agendamento
  console.log(`cambio ${JSON.stringify(resumo)}`);
  return NextResponse.json(resumo, { headers: SEM_CACHE });
}
