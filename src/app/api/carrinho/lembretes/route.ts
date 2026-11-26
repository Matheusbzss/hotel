import { NextResponse } from 'next/server';
import { chamadaDoAgendamento } from '@/lib/admin-auth';
import { enviarLembretes } from '@/lib/carrinho-lembretes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * A tarefa agendada (vercel.json, a cada 15 minutos) dos lembretes do carrinho abandonado: só com o segredo do
 * agendamento ("Authorization: Bearer CRON_SECRET"). Sem RESEND_API_KEY, responde sem ler nem enviar nada. A resposta
 * e o registro do servidor só têm números (nenhum e-mail, nome ou carrinho).
 */
export async function GET(req: Request) {
  if (!chamadaDoAgendamento(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const resumo = await enviarLembretes();
  // fica nos registros da Vercel: é por eles que se confere o agendamento
  console.log(`lembretes-carrinho ${JSON.stringify(resumo)}`);
  return NextResponse.json(resumo, { status: resumo.ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
