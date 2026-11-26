/**
 * O checkout que abriu sem as formas de pagamento e ganhou itens depois (achado CE-1 da varredura de 24/11, Pacote 26).
 * O formulário recebe as formas do servidor uma vez só, quando a página abre (pagamentoDoCheckout,
 * src/lib/reserva-publica.ts), e com o carrinho vazio o servidor não manda nenhuma. Se o cliente põe um passeio e volta
 * para a mesma página (o botão de voltar reaproveita a página guardada pelo Next, ou o Safari a devolve inteira da
 * memória de voltar), o formulário mostra os itens, que o carrinho do navegador já tem, mas sem as formas: caía no
 * quadro antigo do pagamento pelo WhatsApp, cujo botão o servidor recusa com o pagamento online aberto (400
 * 'pagamento'). O cliente ficava preso.
 *
 * Com o pagamento online valendo para este visitante (o servidor diz: pagamentoLigado), o formulário pede a página de
 * novo ao servidor (router.refresh), uma vez a cada volta à página: se a página relida ainda vier sem formas, fica como
 * hoje e não pede de novo; sem rede, não pede nada. Com o pagamento online desligado (ou no modo 'admin', para quem não está no painel), nada muda: o servidor diz
 * que não está ligado e o caminho do WhatsApp continua como sempre. Só regras, sem React nem rede: o
 * FormularioCarrinho usa, e tests/releitura-do-checkout.test.ts confere.
 */

/** O que o formulário sabe na hora de decidir se pede a página de novo ao servidor. */
export interface EstadoDaReleitura {
  /** O servidor disse que o pagamento online vale para este visitante (pagamentoOnlineAberto, src/lib/formas-pagamento.ts). */
  pagamentoLigado: boolean;
  /** Quantas formas de pagamento a página recebeu do servidor (as do último carregamento ou da última releitura). */
  formasDoServidor: number;
  /** Quantos itens o formulário mostra agora (o carrinho do navegador, depois de carregado). */
  itens: number;
  /** O checkout embutido da Stripe já está aberto (o pedido foi criado): ali nada é relido. */
  sessaoAberta: boolean;
  /** Este formulário já pediu a página de novo uma vez (a trava contra o laço). */
  jaReleu: boolean;
}

/**
 * Pedir a página de novo ao servidor: o pagamento online está ligado, há itens na tela, o servidor não mandou forma
 * nenhuma, o checkout embutido não está aberto e este formulário ainda não pediu. Só as formas que vieram do servidor
 * contam: a lista que encolheu porque o servidor recusou a forma no envio (o 403 'forma', o prazo passou) não pede nada,
 * como hoje.
 */
export function releituraDoCheckout(e: EstadoDaReleitura): boolean {
  return e.pagamentoLigado && e.formasDoServidor === 0 && e.itens > 0 && !e.sessaoAberta && !e.jaReleu;
}

/**
 * A página relida trouxe as formas que a página de antes não tinha: só então o formulário passa a usar as formas novas
 * (a lista, o motivo de o Pix ficar de fora e a forma marcada). Uma página que já tinha as formas fica com as dela: uma
 * releitura qualquer não desfaz a lista que encolheu no envio nem a forma que o cliente marcou.
 */
export const formasChegaram = (antes: number, agora: number): boolean => antes === 0 && agora > 0;
