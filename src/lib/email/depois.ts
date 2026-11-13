import { after } from 'next/server';

/**
 * Roda a tarefa depois que a resposta sai (after, de next/server): o webhook da Stripe e as rotas respondem na hora,
 * e o e-mail vai logo em seguida, no tempo que sobra da função (maxDuration da rota). Fora de uma requisição (um
 * script), roda na hora. A tarefa nunca derruba quem chamou: o erro fica no registro do servidor, só com o nome
 * dado aqui (o tipo do e-mail e o código do pedido, nunca dado do cliente).
 */
export function depoisDaResposta(nome: string, tarefa: () => Promise<unknown>): void {
  const rodar = async () => {
    try {
      await tarefa();
    } catch (e) {
      console.error(`[email] ${nome}: falhou (${e instanceof Error ? e.message : String(e)})`);
    }
  };
  try {
    after(rodar);
  } catch {
    void rodar();
  }
}
