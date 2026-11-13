import { TAMANHO_MAXIMO_AVISO, hostsDaRequisicao, lerAvisosCsp, lerCorpoAte, linhaDoAviso } from '@/lib/csp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Quantos avisos cada instância do servidor escreve no registro por minuto: o resto é descartado. */
const AVISOS_POR_MINUTO = 30;

let inicioDaJanela = 0;
let avisosNaJanela = 0;

/**
 * Recebe do navegador os avisos da política de segurança em modo de aviso (Content-Security-Policy-Report-Only, em
 * next.config.ts) e escreve uma linha curta no registro da Vercel: a regra, a origem do que seria bloqueado e a página,
 * sem o resto do endereço (o link privado do pedido leva o token na URL). Nunca grava dado de cliente. O corpo maior que
 * TAMANHO_MAXIMO_AVISO é descartado sem ser lido inteiro; cada pedaço da linha passa pelos filtros de src/lib/csp.ts
 * (tamanho máximo, sem quebra de linha nem caractere de controle); e o aviso de uma página que não é deste site fica de
 * fora, sem gastar o teto por minuto.
 * Responde sempre 204: o navegador não espera nada de volta.
 */
export async function POST(req: Request) {
  const corpo = await lerCorpoAte(req, TAMANHO_MAXIMO_AVISO);
  if (!corpo) return new Response(null, { status: 204 });

  const agora = Date.now();
  if (agora - inicioDaJanela > 60_000) {
    inicioDaJanela = agora;
    avisosNaJanela = 0;
  }
  const hosts = hostsDaRequisicao(req);
  for (const aviso of lerAvisosCsp(corpo)) {
    if (avisosNaJanela >= AVISOS_POR_MINUTO) break;
    const linha = linhaDoAviso(aviso, hosts);
    if (!linha) continue;
    avisosNaJanela++;
    console.log(linha);
  }
  return new Response(null, { status: 204 });
}
