import { NextResponse } from 'next/server';
import { pedidoRecusado } from '@/lib/admin-auth';
import { lerFormularioCasa } from '@/lib/casa';
import { atualizarCasa, obterCasaPainel } from '@/lib/casas';

export const runtime = 'nodejs';

/** Salva o cadastro da casa. */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/casas/[id]'>) {
  const recusado = await pedidoRecusado(req);
  if (recusado) return recusado;
  const { id } = await ctx.params;
  const casa = await obterCasaPainel(id);
  if (!casa) return NextResponse.json({ ok: false, erro: 'Casa não encontrada.' }, { status: 404 });
  const lido = lerFormularioCasa(Object.fromEntries(await req.formData()) as Record<string, string>);
  if (!lido.ok) return NextResponse.json(lido, { status: 400 });
  await atualizarCasa(id, lido.dados, casa);
  return NextResponse.json({ ok: true, id });
}
