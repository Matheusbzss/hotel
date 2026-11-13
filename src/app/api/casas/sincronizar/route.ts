import { NextResponse } from 'next/server';
import { chamadaDoAgendamento } from '@/lib/admin-auth';
import { importarCalendarios } from '@/lib/casas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** A tarefa agendada (vercel.json): traz as datas ocupadas no Airbnb para os bloqueios de cada casa. */
export async function GET(req: Request) {
  if (!chamadaDoAgendamento(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const resultado = await importarCalendarios();
  // fica nos registros da Vercel: é por eles que se confere o agendamento
  console.log(`casas-airbnb ${JSON.stringify(resultado)}`);
  return NextResponse.json({ ok: resultado.falhas === 0, ...resultado }, { headers: { 'Cache-Control': 'no-store' } });
}
