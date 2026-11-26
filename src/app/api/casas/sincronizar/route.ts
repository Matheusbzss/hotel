import { NextResponse } from 'next/server';
import { chamadaDoAgendamento } from '@/lib/admin-auth';
import { calendarioMudou, importarCalendarios } from '@/lib/casas';
import { mensagemDoErro } from '@/lib/erros';
import { redeDeSegurancaDasCasas, type ResultadoDaRede } from '@/lib/rede-das-casas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// a rede de segurança das datas pode consultar a Stripe por alguns pedidos parados: 60 s, como o aviso da Stripe
export const maxDuration = 60;

/**
 * A tarefa agendada de hora em hora (vercel.json): traz as datas ocupadas no Airbnb para os bloqueios de cada casa e, desde
 * a Etapa 7 (pacote 2), passa a rede de segurança das datas das casas (redeDeSegurancaDasCasas, src/lib/rede-das-casas.ts):
 * solta a trava que sobrou de um pedido vencido, cancelado ou devolvido e do voucher cancelado ou devolvido sozinho, passa
 * para a sessão corrente a trava presa a uma sessão antiga, consulta a Stripe pelo pedido pendente há mais de 2 horas e
 * confere que toda casa paga tem a trava (faltando: prende ou avisa a equipe). Se alguma noite mudou, as páginas das casas
 * refazem o calendário (calendarioMudou só nas rotas). Uma falha da rede não derruba a importação do Airbnb.
 */
export async function GET(req: Request) {
  if (!chamadaDoAgendamento(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const resultado = await importarCalendarios();
  // fica nos registros da Vercel: é por eles que se confere o agendamento
  console.log(`casas-airbnb ${JSON.stringify(resultado)}`);
  let rede: ResultadoDaRede | { erro: true };
  try {
    rede = await redeDeSegurancaDasCasas();
    if (rede.mudou) calendarioMudou();
    console.log(`casas-rede ${JSON.stringify(rede)}`);
  } catch (e) {
    // o motivo fica só no registro do servidor
    console.error(`[casas] a rede de segurança das datas falhou: ${mensagemDoErro(e)}`);
    rede = { erro: true };
  }
  const redeOk = !('erro' in rede) && rede.erros === 0;
  return NextResponse.json({ ok: resultado.falhas === 0 && redeOk, ...resultado, rede }, { headers: { 'Cache-Control': 'no-store' } });
}
