import type { FormaPagamento } from './formas-pagamento';
import type { StatusReserva } from './reservas';

/**
 * A tela "Confirmando o pagamento…" do pedido pendente, nas páginas do pedido e da reserva (PagarPedido,
 * src/components/pagamento/CheckoutEmbutido.tsx): o que ela mostra quando a espera termina (depoisDaEspera) e quando as
 * formas acabam com a escolha aberta (etapaComAsFormasDeAgora). E, na escolha da forma da mesma tela, o erro do "Pagar"
 * que esbarra no 403 'forma' (formasDaResposta, erroDaFormaRecusada) e a frase do Pix já gerado embaixo da frase de por
 * que o Pix ficou de fora (pixGeradoNaEscolha). Este arquivo roda no navegador e nos testes (node puro), por isso só
 * importa tipos: nada de src/lib/formas-pagamento.ts com valor vai para o navegador por causa dele.
 */

/**
 * O que a tela mostra quando a espera dela (ESPERA_PARA_PAGAR_MS, 15 s) termina sem o pagamento chegar:
 * - 'pagar': o botão "Ainda não pagou? Pagar agora", para quem voltou sem pagar (alguma forma ainda vale), como sempre;
 * - 'esperar-o-pix': a tela continua em "Confirmando o pagamento…", e embaixo de "Se você já pagou…" entra a frase do
 *   Pix já gerado (pedido.pixGerado: pagar pelo app do banco, e a página se atualiza sozinha);
 * - 'sem-formas': o aviso de que o pedido não pode mais ser pago pelo site (pedido.semPrazo), com o e-mail da equipe.
 */
export type DepoisDaEspera = 'pagar' | 'esperar-o-pix' | 'sem-formas';

/**
 * A decisão. Com alguma forma valendo, o botão de pagar. Sem nenhuma, o pedido pendente de Pix continua esperando: o QR
 * que o cliente já gerou vale até a sessão acabar (desligar o pagamento online às pressas, o freio de emergência, não
 * fecha a sessão aberta na Stripe, e o aviso e a consulta do site continuam confirmando o Pix pago), e a consulta do
 * status (useStatusDoPedido) leva a página a "Reserva confirmada!" quando ele é pago, ou a "O tempo para pagar terminou"
 * quando a sessão acaba. Até o reteste de 17/11 (L5d), aos 15 s a tela trocava para "não pode mais ser pago pelo site",
 * com o QR valendo, pago normalmente minutos depois. No cartão, ou sem a forma do pedido, o aviso de sempre.
 */
export function depoisDaEspera(status: StatusReserva, formas: readonly FormaPagamento[], formaAtual?: FormaPagamento): DepoisDaEspera {
  if (formas.length > 0) return 'pagar';
  return status === 'pendente' && formaAtual === 'pix' ? 'esperar-o-pix' : 'sem-formas';
}

/** As etapas da tela de pagar um pedido em aberto: a espera ("Confirmando o pagamento…"), a escolha da forma e o formulário. */
export type EtapaDePagar = 'confirmando' | 'escolher' | 'checkout';

/**
 * A etapa da tela de pagar com as formas de agora, quando elas mudam com a tela aberta. O caso: o cliente na escolha da
 * forma ("Ainda não pagou? Pagar agora", com as formas valendo), o freio de emergência publicado nesse meio-tempo
 * (PAGAMENTO_ONLINE=desligado) e o toque em "Pagar": a rota responde 403 'forma', a tela relê a página (router.refresh)
 * e as formas voltam vazias, com o pedido ainda pendente. A mesma decisão do relógio dos 15 s (depoisDaEspera): no pedido
 * de Pix ('esperar-o-pix'), a escolha volta à espera, já passada (a frase do Pix gerado embaixo de "Se você já pagou…"),
 * porque o QR que o cliente já gerou vale até a sessão acabar. Até o Pacote 16 (17/11; nota 3 do revisor do Pacote 14),
 * a tela ficava na escolha e dizia "Este pedido não pode mais ser pago pelo site", com o QR valendo. No cartão, ou sem a
 * forma do pedido ('sem-formas'), e com alguma forma valendo ('pagar'), a escolha fica como sempre; as outras etapas
 * também.
 */
export function etapaComAsFormasDeAgora(etapa: EtapaDePagar, depois: DepoisDaEspera): EtapaDePagar {
  return etapa === 'escolher' && depois === 'esperar-o-pix' ? 'confirmando' : etapa;
}

/**
 * As formas que valem, como a rota de pagar as manda no 403 'forma' (POST /api/pedido/[codigo]/pagar): só as conhecidas.
 * Sem a lista (o 403 do prazo do Pix que passou no meio da criação da sessão não a traz) ou com outra coisa no lugar,
 * undefined: não se sabe quais valem.
 */
export function formasDaResposta(valor: unknown): FormaPagamento[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  return valor.filter((forma): forma is FormaPagamento => forma === 'cartao' || forma === 'pix');
}

/**
 * O erro que a escolha da forma mostra quando o "Pagar" esbarra no 403 'forma' (a forma deixou de valer com a tela
 * aberta), até a página relida (router.refresh) chegar com as formas de agora:
 * - 'nenhum': o 403 diz que nenhuma forma vale e o pedido é de Pix pendente (o freio de emergência publicado com o cliente
 *   na escolha). A página relida volta à espera com a frase do Pix gerado (etapaComAsFormasDeAgora), porque o QR já gerado
 *   vale até a sessão acabar: qualquer erro ali seria falso;
 * - 'sem-prazo': nenhuma forma vale nos outros pedidos, ou o cartão deixou de valer: "Este pedido não pode mais ser pago
 *   pelo site" (pedido.semPrazo);
 * - 'sem-pix': o Pix saiu e outra forma ainda vale (o prazo do Pix passou, ou o valor passa do limite de um Pix): a frase
 *   do motivo (fraseSemPix, com o semPix do 403), como sempre. Também quando o 403 não traz as formas (o prazo do Pix que
 *   passou no meio da criação da sessão): aí o motivo é o prazo.
 * Com as formas vazias, nunca a frase do prazo do Pix. Até o Pacote 17 (reteste de 17-18/11, F7) o 403 do freio (sem
 * formas e sem motivo) dava, por cerca de 1 segundo, "O Pix só vale até 2 horas antes do primeiro serviço do pedido.
 * Agora, só dá para pagar com cartão.": falso (o passeio era em dezembro, e o cartão também estava desligado). A decisão
 * do pedido de Pix pendente é a mesma do relógio da espera (depoisDaEspera).
 */
export type ErroDaFormaRecusada = 'nenhum' | 'sem-pix' | 'sem-prazo';

export function erroDaFormaRecusada(
  escolhida: FormaPagamento,
  formasDoServidor: readonly FormaPagamento[] | undefined,
  status: StatusReserva,
  formaAtual?: FormaPagamento,
): ErroDaFormaRecusada {
  if (formasDoServidor && formasDoServidor.length === 0) {
    return depoisDaEspera(status, formasDoServidor, formaAtual) === 'esperar-o-pix' ? 'nenhum' : 'sem-prazo';
  }
  return escolhida === 'pix' ? 'sem-pix' : 'sem-prazo';
}

/**
 * Na escolha da forma (depois de "Ainda não pagou? Pagar agora"), embaixo da frase de por que o Pix ficou de fora, a frase
 * do Pix já gerado (pedido.pixGerado): só no pedido de Pix pendente cujo Pix não está mais entre as formas que valem, com
 * outra valendo (passado o prazo de 2 horas, só o cartão). O QR que o cliente já gerou continua valendo até vencer, e
 * pagar no cartão ali troca a sessão e mata o QR; a tela dizia só "O Pix só vale até 2 horas antes… Agora, só dá para
 * pagar com cartão" (reteste de 17-18/11, C2, ON-CGGYY5; Pacote 17). A regra das formas não muda. Sem nenhuma forma, a
 * escolha nem mostra as formas: o aviso sem formas, ou a volta à espera com a mesma frase (etapaComAsFormasDeAgora).
 */
export function pixGeradoNaEscolha(status: StatusReserva, formas: readonly FormaPagamento[], formaAtual?: FormaPagamento): boolean {
  return status === 'pendente' && formaAtual === 'pix' && formas.length > 0 && !formas.includes('pix');
}
