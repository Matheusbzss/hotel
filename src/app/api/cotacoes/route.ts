import { NextResponse } from 'next/server';
import { LUGARES } from '@/data/transfer';
import { EsquemaCotacao, faltaNaCotacao } from '@/lib/cotacao';
import { criarCotacao } from '@/lib/cotacoes';
import { chaveDoLimite, ipDaRequisicao, permitir } from '@/lib/limite-ip';
import { soCampanha } from '@/lib/origem';
import { origemDaVisita } from '@/lib/origem-servidor';
import { emailValido, soDigitos, telefoneValido } from '@/lib/validacao';
import { mensagemDoErro } from '@/lib/erros';

export const runtime = 'nodejs';

/** Até quantos pedidos de orçamento e mensagens um mesmo IP pode enviar em 10 minutos (uma pessoa manda um ou dois). */
const LIMITE_POR_IP = 10;
const JANELA_SEGUNDOS = 600;

function erro(campo: string, status = 400) {
  return NextResponse.json({ ok: false, erro: campo }, { status });
}

/**
 * Grava um pedido de orçamento ou uma mensagem do site, para a equipe responder pelo painel.
 * Erros: 400 com o campo; 429 'limite'; 503 'banco'.
 */
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
    // um robô não enche o painel de cotações: no máximo LIMITE_POR_IP envios por IP a cada 10 minutos
    if (!(await permitir(chaveDoLimite('cotacao', ipDaRequisicao(req.headers)), LIMITE_POR_IP, JANELA_SEGUNDOS)))
      return erro('limite', 429);
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
    console.error(`[cotacoes] falha ao gravar: ${mensagemDoErro(err)}`);
    return erro('banco', 503);
  }
}
