import { NextResponse } from 'next/server';
import { chamadaDoAgendamento } from '@/lib/admin-auth';
import { enviarEmailsPendentes } from '@/lib/email/pendentes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// cada e-mail gera os PDFs dos vouchers; a rodada envia por até 40 s e o que não couber fica para a próxima
export const maxDuration = 60;

/**
 * A tarefa agendada (vercel.json, a cada 15 minutos) do e-mail do pagamento aprovado que não saiu (Pacote 25, achado B1):
 * só com o segredo do agendamento ("Authorization: Bearer CRON_SECRET"), como /api/carrinho/lembretes. Sem
 * RESEND_API_KEY, responde sem ler nem enviar nada. A resposta e o registro do servidor só têm números e códigos de
 * pedido (nenhum e-mail, nome ou valor).
 */
export async function GET(req: Request) {
  if (!chamadaDoAgendamento(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const resumo = await enviarEmailsPendentes();
  return NextResponse.json(resumo, { status: resumo.ok ? 200 : 500, headers: { 'Cache-Control': 'no-store' } });
}
