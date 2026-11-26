/**
 * O INTERRUPTOR DA RESERVA DAS CASAS (Etapa 7), como o do pagamento online (PAGAMENTO_ONLINE, src/lib/formas-pagamento.ts):
 * a variável RESERVA_CASAS na Vercel, com 'desligado' (o padrão, também sem a variável), 'admin' (só quem tem o cookie do
 * painel vê o botão "Reservar com sinal" e consegue pôr a casa no carrinho) ou 'publico' (todo mundo). O dono liga com um
 * novo deploy, porque a página da casa é estática.
 *
 * A casa nunca abre sem o pagamento online: o caminho "registrar e finalizar pelo WhatsApp" não serve para ela (decisão
 * 11 da seção 3 do ETAPA-7-PLANO-DAS-CASAS.md). Desligado o pagamento online (o freio de emergência), a reserva das casas
 * fecha junto, mesmo com RESERVA_CASAS=publico.
 *
 * Só contas e a variável de ambiente: a Stripe é carregada na hora (pagamentoOnlineAberto), e os testes rodam no node.
 */

export type ModoReservaCasas = 'desligado' | 'admin' | 'publico';

export function modoReservaCasas(valor: string | undefined = process.env.RESERVA_CASAS): ModoReservaCasas {
  const v = valor?.trim();
  return v === 'admin' || v === 'publico' ? v : 'desligado';
}

/**
 * A reserva das casas está aberta para todo mundo (RESERVA_CASAS=publico): os textos legais ganham as regras das casas
 * (src/content/legal/casas.ts; textosLegais só as põe com o pagamento online no ar, porque a casa nunca abre sem ele). As
 * páginas legais são estáticas: o valor é lido no build, e o dono liga com um novo deploy. No modo 'admin' o público ainda
 * não reserva casa, e os textos continuam os do pagamento online.
 */
export const reservaCasasNoAr = (): boolean => modoReservaCasas() === 'publico';

/**
 * A regra, sem variável de ambiente nem rede: a reserva das casas vale para este visitante quando o interruptor deixa (no
 * 'publico', todos; no 'admin', só o admin) e o pagamento online vale para ele.
 */
export function reservaCasasVale(modo: ModoReservaCasas, admin: boolean, pagamentoOnline: boolean): boolean {
  if (!pagamentoOnline) return false;
  return modo === 'publico' || (modo === 'admin' && admin);
}

/**
 * A reserva das casas vale para este visitante agora: o interruptor RESERVA_CASAS e o pagamento online (o interruptor
 * PAGAMENTO_ONLINE e a Stripe configurada). Só no servidor. A página da casa, que é estática, pergunta com admin: false (o
 * botão para todos); o GET /api/carrinho pergunta com o cookie do painel (o botão só para o admin, no modo 'admin').
 */
export async function casasAbertasPara(opcoes: { admin: boolean }): Promise<boolean> {
  const modo = modoReservaCasas();
  if (modo === 'desligado' || (modo === 'admin' && !opcoes.admin)) return false;
  const { pagamentoOnlineAberto } = await import('./formas-pagamento.ts');
  return reservaCasasVale(modo, opcoes.admin, await pagamentoOnlineAberto(opcoes));
}
