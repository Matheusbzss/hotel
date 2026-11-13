import { NextResponse, after } from 'next/server';
import { isIdioma, type Idioma } from '@/i18n/config';
import {
  CONSULTAS_POR_IP,
  ENVIOS_POR_PEDIDO,
  JANELA_CONSULTAS_SEGUNDOS,
  JANELA_ENVIOS_SEGUNDOS,
  RESPOSTA_DA_CONSULTA,
  consultarPedido,
  respostaDaConsulta,
} from '@/lib/consulta-pedido';
import { enviarEmailDoPedido } from '@/lib/email/pedidos';
import { chaveDoLimite, ipDaRequisicao, permitir } from '@/lib/limite-ip';
import { obterReservaDoPedido } from '@/lib/reservas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const SEM_CACHE = { 'Cache-Control': 'no-store' };

/**
 * "Consultar meu pedido": recebe { email, codigo, idioma } e responde SEMPRE o mesmo { ok: true } quando os dados vêm
 * no formato certo, exista o pedido ou não. A busca e o envio do link acontecem depois da resposta (after): se o e-mail
 * digitado for o do pedido, o link privado vai para ele (src/lib/consulta-pedido.ts). Erros: 400 com o campo de formato
 * errado; 429 'limite' (5 consultas por IP a cada 10 minutos). O campo-isca preenchido recebe a mesma resposta de
 * sempre, e nada é feito. Nada do que foi digitado vai para o registro do servidor.
 */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { email?: unknown; codigo?: unknown; idioma?: unknown; site?: unknown } | null;
  const formato = respostaDaConsulta({ email: corpo?.email, codigo: corpo?.codigo });
  if (formato.status !== 200) return NextResponse.json(formato.corpo, { status: formato.status, headers: SEM_CACHE });
  // campo-isca preenchido: um robô. Recebe a resposta de sempre e nada acontece
  if (typeof corpo?.site === 'string' && corpo.site) return NextResponse.json(RESPOSTA_DA_CONSULTA, { headers: SEM_CACHE });

  if (!(await permitir(chaveDoLimite('consulta-pedido', ipDaRequisicao(req.headers)), CONSULTAS_POR_IP, JANELA_CONSULTAS_SEGUNDOS))) {
    return NextResponse.json({ ok: false, erro: 'limite' }, { status: 429, headers: SEM_CACHE });
  }
  const idioma: Idioma = typeof corpo?.idioma === 'string' && isIdioma(corpo.idioma) ? corpo.idioma : 'pt';
  const entrada = { email: String(corpo?.email), codigo: String(corpo?.codigo) };

  after(async () => {
    try {
      await consultarPedido(entrada, {
        async buscar(codigo) {
          const r = await obterReservaDoPedido(codigo);
          return r ? { codigo: r.pedido?.codigo ?? r.codigo, email: r.cliente.email } : null;
        },
        podeEnviar: (codigo) => permitir(chaveDoLimite('consulta-envio', codigo), ENVIOS_POR_PEDIDO, JANELA_ENVIOS_SEGUNDOS),
        enviar: (codigo) => enviarEmailDoPedido('link-do-pedido', codigo, { idioma }),
      });
    } catch (e) {
      console.error(`[consulta] falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
  return NextResponse.json(RESPOSTA_DA_CONSULTA, { headers: SEM_CACHE });
}
