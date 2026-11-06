import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { IDIOMAS } from '@/i18n/config';
import { MAXIMO_ITENS } from '@/lib/carrinho';
import { COOKIE_CARRINHO, conferirEscolha, gravarCarrinho, lerCarrinho } from '@/lib/carrinho-servidor';
import { origemDaVisita } from '@/lib/origem-servidor';
import { reservaDoItem } from '@/lib/pedido-carrinho';
import { criarPedido } from '@/lib/reservas';
import { CIDADES_HOSPEDAGEM, emailValido, soDigitos, telefoneValido } from '@/lib/validacao';

export const runtime = 'nodejs';
export const maxDuration = 30;

const texto = (max: number) => z.string().trim().min(1).max(max);

const Esquema = z.object({
  idioma: z.enum(IDIOMAS),
  /** Os itens que o cliente viu: se o carrinho mudou, ele confere de novo antes de enviar. */
  ids: z.array(z.string().max(40)).min(1).max(MAXIMO_ITENS),
  cliente: z.object({
    nome: texto(120),
    email: texto(160),
    ddi: z.string().max(4),
    telefone: z.string().max(24),
  }),
  hospedagem: z.object({ cidade: z.enum(CIDADES_HOSPEDAGEM), hotel: texto(120) }).optional(),
  /** Por item de transfer: os voos e a idade de cada criança que vai de cadeirinha ou assento de elevação. */
  transfers: z
    .record(
      z.string().max(40),
      z.object({
        vooIda: z.string().trim().max(12).optional().default(''),
        vooVolta: z.string().trim().max(12).optional().default(''),
        cadeirinhas: z.array(z.number().int().min(0).max(12)).max(17).optional().default([]),
      }),
    )
    .optional()
    .default({}),
  observacoes: z.string().trim().max(600).optional().default(''),
  aceite: z.literal(true),
  /** Campo-isca contra robôs: precisa vir vazio. */
  site: z.string().max(0).optional(),
});

function erro(campo: string, status = 400) {
  return NextResponse.json({ ok: false, erro: campo }, { status });
}

/**
 * Fecha o carrinho do cookie num pedido: os dados do titular uma vez só, um pagamento (pelo WhatsApp, até
 * o pagamento online entrar) e um voucher por item. Os itens e os preços vêm do servidor, nunca do navegador.
 */
export async function POST(req: Request) {
  const r = Esquema.safeParse(await req.json().catch(() => null));
  if (!r.success) return erro(r.error.issues[0]?.path.join('.') || 'dados');
  const e = r.data;
  if (!emailValido(e.cliente.email)) return erro('cliente.email');
  if (!telefoneValido(e.cliente.ddi, e.cliente.telefone)) return erro('cliente.telefone');

  const loja = await cookies();
  const codigoCarrinho = loja.get(COOKIE_CARRINHO)?.value;
  try {
    const { itens, origem } = await lerCarrinho(codigoCarrinho);
    const conferidas = itens.flatMap((i) => {
      const c = conferirEscolha(i.escolha);
      return c.ok ? [{ id: i.id, c }] : [];
    });
    // um item venceu agora (a data ou o horário passou) ou o carrinho mudou em outra aba: o cliente confere antes
    const igual = conferidas.length === e.ids.length && conferidas.every(({ id }) => e.ids.includes(id));
    if (!codigoCarrinho || !igual) return erro('mudou', 409);

    const dados = {
      idioma: e.idioma,
      cliente: {
        nome: e.cliente.nome,
        email: e.cliente.email.toLowerCase(),
        telefone: `+${soDigitos(e.cliente.ddi)} ${soDigitos(e.cliente.telefone)}`,
      },
      hospedagem: e.hospedagem,
      observacoes: e.observacoes || undefined,
      // a campanha guardada no carrinho vale se o cookie da visita já tiver vencido
      origem: { ...origem, ...(await origemDaVisita()) },
    };
    const novas = [];
    for (const { id, c } of conferidas) {
      if ('passeio' in c && !e.hospedagem) return erro('hospedagem');
      const extras = e.transfers[id];
      if (!('passeio' in c) && extras && extras.cadeirinhas.length > c.escolha.passageiros) return erro('cadeirinhas');
      novas.push(reservaDoItem(c, dados, extras));
    }

    const pedido = await criarPedido(novas);
    // o pedido já existe: se marcar o carrinho falhar, o cliente não pode ver erro e enviar de novo
    await gravarCarrinho(codigoCarrinho, { pedidoId: pedido.id, email: dados.cliente.email }).catch((err) =>
      console.error('[pedido] falha ao marcar o carrinho', err),
    );
    loja.delete(COOKIE_CARRINHO);
    return NextResponse.json({ ok: true, codigo: pedido.codigo, token: pedido.token, itens: novas.length });
  } catch (err) {
    console.error('[pedido] falha ao gravar o pedido', err);
    return erro('banco', 503);
  }
}
