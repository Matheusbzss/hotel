import { caminhoDoAviso, lerAvisosCsp, origemDoBloqueio } from '@/lib/csp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quantos avisos cada instância do servidor escreve no registro por minuto: o resto é descartado. */
const AVISOS_POR_MINUTO = 30;
/** Um aviso de verdade tem poucos kB: corpo maior que isto é descartado sem ler. */
const TAMANHO_MAXIMO = 20_000;

let inicioDaJanela = 0;
let avisosNaJanela = 0;

/**
 * Recebe do navegador os avisos da política de segurança em modo de aviso (Content-Security-Policy-Report-Only, em
 * next.config.ts) e escreve uma linha curta no registro da Vercel: a regra, a origem do que seria bloqueado e a página,
 * sem o resto do endereço (o link privado do pedido leva o token na URL). Nunca grava dado de cliente.
 * Responde sempre 204: o navegador não espera nada de volta.
 */
export async function POST(req: Request) {
  const corpo = await req.text().catch(() => '');
  if (!corpo || corpo.length > TAMANHO_MAXIMO) return new Response(null, { status: 204 });

  const agora = Date.now();
  if (agora - inicioDaJanela > 60_000) {
    inicioDaJanela = agora;
    avisosNaJanela = 0;
  }
  for (const aviso of lerAvisosCsp(corpo)) {
    if (avisosNaJanela >= AVISOS_POR_MINUTO) break;
    avisosNaJanela++;
    console.log(`[csp] ${aviso.regra} bloquearia ${origemDoBloqueio(aviso.bloqueado)} em ${caminhoDoAviso(aviso.pagina)}`);
  }
  return new Response(null, { status: 204 });
}
