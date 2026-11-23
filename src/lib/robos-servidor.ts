import { NextResponse } from 'next/server';
import { checkBotId } from 'botid/server';
import { RESPOSTA_DO_ROBO, nivelDaVerificacao, verificarRobo } from './robos';

/**
 * A proteção contra robôs nas rotas (src/lib/robos.ts tem a regra e docs/protecao-contra-robos.md o guia). Cada uma das
 * quatro rotas chama barrarRobo depois do campo-isca, das conferências que não custam nada e do limite por endereço, e
 * antes de qualquer gravação: com o robô, devolve a resposta pronta (403 'robo', sem guardar em cache); senão, null e a
 * rota segue. Com o interruptor desligado, ou fora do site no ar, a verificação nem é chamada.
 */
export async function barrarRobo(rota: string): Promise<NextResponse | null> {
  const resultado = await verificarRobo(rota, {
    nivel: nivelDaVerificacao(process.env.NEXT_PUBLIC_VERIFICACAO_ROBOS),
    ambienteDaVercel: process.env.NEXT_PUBLIC_VERCEL_ENV,
    ambienteDoServidor: process.env.VERCEL_ENV,
    deMentira: process.env.ROBOS_DE_MENTIRA,
    verificar: (opcoes) => checkBotId(opcoes),
    registrar: (linha) => console.warn(linha),
  });
  if (resultado === 'passa') return null;
  return NextResponse.json(RESPOSTA_DO_ROBO.corpo, { status: RESPOSTA_DO_ROBO.status, headers: { 'Cache-Control': 'no-store' } });
}
