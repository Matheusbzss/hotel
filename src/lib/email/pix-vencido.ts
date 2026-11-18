// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { formasDoPagamento, type FormaPagamento, type ItemPagavel } from '../formas-pagamento.ts';

/**
 * O e-mail do Pix vencido (src/lib/email/pedidos.ts) só sai com alguma forma de pagamento valendo para o pedido, e leva os
 * totais só delas. A regra é a da página do pedido (formasDoPagamento, src/lib/formas-pagamento.ts: o interruptor
 * PAGAMENTO_ONLINE, a Stripe configurada, o Pix até 2 horas antes do primeiro serviço e dentro do limite, o cartão até 30
 * minutos antes), contada como para o admin: o e-mail não leva o cookie do painel de ninguém, e no modo 'admin' quem paga
 * é o próprio dono, testando. Sem nenhuma forma, o e-mail não sai, porque não há como pagar de novo pelo site: passado o
 * prazo de todas, ou com o pagamento online desligado às pressas (o freio de emergência, PAGAMENTO_ONLINE=desligado).
 * O envio vem de fora (`enviar`: monta o e-mail com os totais destas formas e o manda), para a regra rodar em node com um
 * envio de mentira (tests/email.test.ts): pedidos.ts é só do servidor e usa o atalho "@/". Devolve se mandou enviar.
 */
export async function enviarSeAlgumaFormaVale(
  itens: ItemPagavel[],
  agora: Date,
  enviar: (formas: FormaPagamento[]) => Promise<void>,
): Promise<boolean> {
  const { formas } = await formasDoPagamento(itens, agora, { admin: true });
  if (!formas.length) return false;
  await enviar(formas);
  return true;
}
