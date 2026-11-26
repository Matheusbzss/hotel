import { NextResponse } from 'next/server';
import { pedidoRecusado } from '@/lib/admin-auth';
import { lerFormularioCasa } from '@/lib/casa';
import { criarCasa } from '@/lib/casas';

export const runtime = 'nodejs';

/** Cadastra uma casa. Ela começa fora do ar. */
export async function POST(req: Request) {
  const recusado = await pedidoRecusado(req);
  if (recusado) return recusado;
  const lido = lerFormularioCasa(Object.fromEntries(await req.formData()) as Record<string, string>);
  if (!lido.ok) return NextResponse.json(lido, { status: 400 });
  const id = await criarCasa(lido.dados);
  if (!id) return NextResponse.json({ ok: false, erro: 'Já existe uma casa com este endereço de página.' }, { status: 409 });
  return NextResponse.json({ ok: true, id });
}
