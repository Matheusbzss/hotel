import { NextResponse } from 'next/server';
import { pedidoRecusado } from '@/lib/admin-auth';
import { EsquemaBloqueio, EsquemaTarifa, faltaParaPublicar, type CasaPainel } from '@/lib/casa';
import { apagarBloqueio, apagarTarifa, criarBloqueio, criarTarifa, importarAgora, obterCasaPainel, publicarCasa } from '@/lib/casas';

export const runtime = 'nodejs';

type Campos = Record<string, string>;

/** Cada ação devolve o aviso que aparece na página da casa. */
const ACOES: Record<string, (casa: CasaPainel, campos: Campos) => Promise<string>> = {
  async publicar(casa) {
    if (faltaParaPublicar(casa).length) return 'falta';
    await publicarCasa(casa.id, true);
    return 'publicada';
  },
  async esconder(casa) {
    await publicarCasa(casa.id, false);
    return 'escondida';
  },
  async nova_tarifa(casa, campos) {
    const r = EsquemaTarifa.safeParse({
      ...campos,
      nome: { pt: campos['nome.pt']?.trim(), es: campos['nome.es']?.trim(), en: campos['nome.en']?.trim() },
    });
    if (!r.success) return 'tarifa-invalida';
    await criarTarifa(casa, r.data);
    return 'tarifa-salva';
  },
  async apagar_tarifa(casa, campos) {
    await apagarTarifa(casa, campos.id);
    return 'tarifa-apagada';
  },
  async novo_bloqueio(casa, campos) {
    const r = EsquemaBloqueio.safeParse(campos);
    if (!r.success) return 'bloqueio-invalido';
    await criarBloqueio(casa.id, r.data);
    return 'bloqueio-salvo';
  },
  async apagar_bloqueio(casa, campos) {
    await apagarBloqueio(casa.id, campos.id);
    return 'bloqueio-apagado';
  },
  async importar(casa) {
    if (!casa.icalUrl) return 'sem-link';
    return (await importarAgora(casa)) ? 'importado' : 'importacao-falhou';
  },
};

/** Publicar, esconder, as diárias por período, os bloqueios e a importação do Airbnb. */
export async function POST(req: Request, ctx: RouteContext<'/api/admin/casas/[id]/acoes'>) {
  const recusado = await pedidoRecusado(req);
  if (recusado) return recusado;
  const { id } = await ctx.params;
  const casa = await obterCasaPainel(id);
  if (!casa) return NextResponse.json({ ok: false }, { status: 404 });
  const campos = Object.fromEntries(await req.formData()) as Campos;
  const acao = ACOES[campos.acao];
  if (!acao) return NextResponse.json({ ok: false }, { status: 400 });
  const volta = new URL(`/admin/casas/${id}`, req.url);
  volta.searchParams.set('aviso', await acao(casa, campos));
  return NextResponse.redirect(volta, 303);
}
