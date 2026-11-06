import { NextResponse } from 'next/server';
import { LUGARES } from '@/data/transfer';
import { EsquemaCotacao, faltaNaCotacao } from '@/lib/cotacao';
import { criarCotacao } from '@/lib/cotacoes';
import { soCampanha } from '@/lib/origem';
import { origemDaVisita } from '@/lib/origem-servidor';
import { emailValido, soDigitos, telefoneValido } from '@/lib/validacao';

export const runtime = 'nodejs';

function erro(campo: string, status = 400) {
  return NextResponse.json({ ok: false, erro: campo }, { status });
}

/** Grava um pedido de orçamento ou uma mensagem do site, para a equipe responder pelo painel. */
export async function POST(req: Request) {
  const r = EsquemaCotacao.safeParse(await req.json().catch(() => null));
  if (!r.success) return erro(r.error.issues[0]?.path.join('.') || 'dados');
  const e = r.data;

  const falta = faltaNaCotacao(e);
  if (falta) return erro(falta);
  if (!emailValido(e.email)) return erro('email');
  if (e.telefone && !telefoneValido(e.ddi, e.telefone)) return erro('telefone');
  const trechos = e.trajeto ? [e.trajeto.ida, ...(e.trajeto.volta ? [e.trajeto.volta] : [])] : [];
  if (!trechos.every((t) => t.saida.lugar in LUGARES && t.destino.lugar in LUGARES)) return erro('trajeto');

  try {
    await criarCotacao({
      tipo: e.tipo,
      nome: e.nome,
      email: e.email.toLowerCase(),
      idioma: e.idioma,
      ...(e.telefone ? { telefone: `+${soDigitos(e.ddi)} ${soDigitos(e.telefone)}` } : {}),
      ...(e.mensagem ? { mensagem: e.mensagem } : {}),
      ...(e.trajeto ? { trajeto: e.trajeto } : {}),
      origem: soCampanha(await origemDaVisita()),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[cotacoes] falha ao gravar', err);
    return erro('banco', 503);
  }
}
