/**
 * A sessão vencida nos formulários do painel (Pacote 33, D3). Antes, o botão de um formulário do painel com a sessão
 * vencida (o painel aberto no celular desde a véspera) abria uma página crua com o texto {"ok":false}. Agora, quando o
 * pedido é a navegação do próprio navegador (o POST de um formulário, ou um link aberto), a rota manda de volta para a
 * entrada do painel, com o aviso "Sua sessão venceu. Entre de novo."; as chamadas por fetch (JSON) continuam recebendo
 * o 401 de sempre. A proteção não afrouxa: o pedido de outro site é recusado antes de tudo (403, sem mandar para lugar
 * nenhum), nada é feito sem a sessão, e a volta é sempre o mesmo endereço fixo do próprio site, nunca um que veio no
 * pedido. Sem o atalho "@/" e sem o Next, para os testes rodarem em node; quem usa é pedidoRecusado (src/lib/admin-auth.ts).
 */

/** A entrada do painel com o aviso da sessão vencida (o caminho é fixo; o site é o do próprio pedido). */
export const ENDERECO_DA_SESSAO_VENCIDA = '/admin?erro=sessao';

/** O aviso da entrada do painel (?erro=sessao). */
export const AVISO_DA_SESSAO_VENCIDA = 'Sua sessão venceu. Entre de novo.';

/**
 * O pedido veio de outro site: o cabeçalho Origin existe e não é o do próprio site. Uma origem que não dá para ler (o
 * "null" de alguns navegadores) também conta como de fora: na dúvida, recusa.
 */
export function origemDeFora(origem: string | null, url: string): boolean {
  if (!origem) return false;
  try {
    return new URL(origem).host !== new URL(url).host;
  } catch {
    return true;
  }
}

/**
 * O pedido é a navegação do próprio navegador, que abre a resposta como página: o POST de um formulário do painel (ou um
 * link aberto numa aba). Os navegadores de hoje dizem isso no Sec-Fetch-Mode ("navigate"; o fetch manda "cors",
 * "same-origin" ou "no-cors"). Sem esse cabeçalho (navegador antigo), vale o Accept: a página pede HTML, o fetch não.
 */
export function navegacaoDoNavegador(cabecalhos: { get(nome: string): string | null }): boolean {
  const modo = cabecalhos.get('sec-fetch-mode');
  if (modo) return modo.trim().toLowerCase() === 'navigate';
  return /\btext\/html\b/i.test(cabecalhos.get('accept') ?? '');
}
