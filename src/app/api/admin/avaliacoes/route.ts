import { NextResponse } from 'next/server';
import { obterPasseio } from '@/data/passeios';
import { pedidoRecusado } from '@/lib/admin-auth';
import { EsquemaAvaliacao } from '@/lib/avaliacao';
import { criarAvaliacao } from '@/lib/avaliacoes';
import { hojeEmBuzios } from '@/lib/validacao';

export const runtime = 'nodejs';

/** Cadastra uma avaliação real, com a origem. Ela começa escondida. */
export async function POST(req: Request) {
  // a proteção de todas as rotas do painel: o próprio site e a sessão (sem ela, o formulário volta à entrada do painel)
  const recusado = await pedidoRecusado(req);
  if (recusado) return recusado;

  const volta = new URL('/admin/avaliacoes', req.url);
  const r = EsquemaAvaliacao.safeParse(Object.fromEntries(await req.formData()));
  const campo = r.success ? '' : String(r.error.issues[0]?.path[0] ?? 'dados');
  if (!r.success || r.data.data > hojeEmBuzios() || (r.data.produtoSlug && !obterPasseio(r.data.produtoSlug))) {
    volta.searchParams.set('erro', campo || 'data');
    return NextResponse.redirect(volta, 303);
  }

  const { pais, cidade, titulo, produtoSlug, nota, origemUrl, ...resto } = r.data;
  await criarAvaliacao({
    ...resto,
    ...(pais ? { pais } : {}),
    ...(cidade ? { cidade } : {}),
    ...(titulo ? { titulo } : {}),
    ...(produtoSlug ? { produtoSlug } : {}),
    ...(nota ? { nota } : {}),
    ...(origemUrl ? { origemUrl } : {}),
  });
  volta.searchParams.set('ok', '1');
  return NextResponse.redirect(volta, 303);
}
