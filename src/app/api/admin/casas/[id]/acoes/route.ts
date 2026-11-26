import { NextResponse } from 'next/server';
import { pedidoRecusado } from '@/lib/admin-auth';
import { EsquemaBloqueio, EsquemaTarifa, faltaParaPublicar, lerCoordenadas, type CasaPainel } from '@/lib/casa';
import { apagarBloqueio, apagarTarifa, criarBloqueio, criarTarifa, importarAgora, obterCasaPainel, publicarCasa } from '@/lib/casas';
import { marcarPontoDaCasa, semCoordenadas } from '@/lib/casas-painel';
import { reservasDoSiteNasDatas } from '@/lib/pedido-carrinho';
import { reservasQueImpedemOBloqueio, type ReservaQueSegura } from '@/lib/trava-das-casas';

export const runtime = 'nodejs';

type Campos = Record<string, string>;

/** O aviso que aparece na página da casa e, quando ele precisa, o que vai junto no endereço da volta (só datas). */
type Volta = string | { aviso: string; parametros: Record<string, string> };

/** Cada ação devolve o aviso que aparece na página da casa. */
const ACOES: Record<string, (casa: CasaPainel, campos: Campos) => Promise<Volta>> = {
  async publicar(casa) {
    if (faltaParaPublicar(casa).length) return 'falta';
    await publicarCasa(casa.id, true);
    return 'publicada';
  },
  async esconder(casa) {
    await publicarCasa(casa.id, false);
    return 'escondida';
  },
  /**
   * Marcar a casa no mapa (Pacote 32): as coordenadas coladas do Google Maps vão só para a função fechada do banco, que
   * sorteia o deslocamento e grava o centro público do círculo. As coordenadas não voltam no endereço nem no log.
   */
  async marcar_no_mapa(casa, campos) {
    const lidas = lerCoordenadas(typeof campos.coordenadas === 'string' ? campos.coordenadas : '');
    if (!lidas.ok) return lidas.erro === 'fora' ? 'ponto-fora' : 'ponto-invalido';
    if (!(await marcarPontoDaCasa(casa.id, lidas.ponto))) return 'ponto-falhou';
    return casa.centro ? 'ponto-mudado' : 'ponto-marcado';
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
  /**
   * Bloquear datas à mão. Antes de gravar, as reservas do site que cruzam as noites (crítica de 26/11, furo 6): a paga ou a
   * que espera o pagamento recusa o bloqueio, com a lista na página (as datas voltam no endereço, e a página relê as reservas
   * de agora): bloquear por cima poria duas pessoas na mesma casa, e uma delas pagou. A equipe cancela ou devolve a reserva
   * no painel dos pedidos e então bloqueia. Sem migração: uma consulta antes da inserção (a função do banco que prende as
   * datas do site já confere os bloqueios à mão: a reserva que chegar depois do bloqueio é recusada). Sem conseguir
   * conferir (o banco não respondeu), nada é bloqueado: nunca por cima do que não se viu.
   */
  async novo_bloqueio(casa, campos) {
    const r = EsquemaBloqueio.safeParse(campos);
    if (!r.success) return 'bloqueio-invalido';
    let impedem: ReservaQueSegura[];
    try {
      impedem = reservasQueImpedemOBloqueio(await reservasDoSiteNasDatas(casa.id, r.data.inicio, r.data.fim));
    } catch (e) {
      // como os outros registros desta rota: sem nenhum número com cara de coordenada (semCoordenadas)
      console.error(
        `[casas] não deu para conferir as reservas do site antes do bloqueio: ${semCoordenadas(e instanceof Error ? e.message : String(e))}`,
      );
      return 'bloqueio-sem-conferir';
    }
    if (impedem.length) return { aviso: 'bloqueio-cruza-reserva', parametros: { inicio: r.data.inicio, fim: r.data.fim } };
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

/** Publicar, esconder, marcar no mapa, as diárias por período, os bloqueios e a importação do Airbnb. */
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
  const resultado = await acao(casa, campos);
  const aviso = typeof resultado === 'string' ? resultado : resultado.aviso;
  volta.searchParams.set('aviso', aviso);
  if (typeof resultado !== 'string')
    for (const [chave, valor] of Object.entries(resultado.parametros)) volta.searchParams.set(chave, valor);
  // o aviso do mapa aparece na própria parte do mapa: a página já abre nela
  if (aviso.startsWith('ponto-')) volta.hash = 'no-mapa';
  return NextResponse.redirect(volta, 303);
}
