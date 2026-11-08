import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { TAG_AVALIACOES } from '@/lib/avaliacao';
import { publicarAvaliacao } from '@/lib/avaliacoes';

export const runtime = 'nodejs';

/** Publica ou esconde a avaliação. As páginas são refeitas na próxima visita, já com a mudança, sem novo deploy. */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/avaliacoes/[id]'>) {
  const { id } = await ctx.params;
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) return NextResponse.json({ ok: false }, { status: 401 });
  const origem = req.headers.get('origin');
  if (origem && new URL(origem).host !== new URL(req.url).host) return NextResponse.json({ ok: false }, { status: 403 });

  const form = await req.formData();
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  await publicarAvaliacao(id, form.get('publicada') === 'sim');
  // a leitura guardada com a etiqueta 'avaliacoes' (página inicial e página do passeio) refaz na
  // próxima visita ('max': serve o que tem enquanto refaz)
  revalidateTag(TAG_AVALIACOES, 'max');
  return NextResponse.redirect(new URL('/admin/avaliacoes', req.url), 303);
}
