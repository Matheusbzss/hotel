'use client';

import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';
// a versão "pure" só baixa o script da Stripe quando loadStripe é chamado (o checkout abriu); a padrão o baixaria
// em toda página que importa este arquivo (checkout, pedido, reserva), mesmo com o pagamento online desligado
import { loadStripe } from '@stripe/stripe-js/pure';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fmt, type Idioma } from '@/i18n/config';
import { formatarCifra } from '@/lib/cifra';
import type { FormaPagamento, MotivoSemPix } from '@/lib/formas-pagamento';
import { mostrarDicaInternacional, type ChaveRecusa } from '@/lib/recusas';
import type { ReservaPublica } from '@/lib/reserva-publica';
import type { StatusReserva } from '@/lib/reservas';
import {
  EscolhaPagamento,
  formaPadrao,
  fraseSemPix,
  valorDaForma,
  type TextosEscolhaPagamento,
  type TotaisDasFormas,
} from './EscolhaPagamento';

/**
 * O checkout embutido da Stripe: o formulário dela (cartão, carteiras ou o QR do Pix) dentro da nossa página.
 * O navegador nunca decide o status do pedido: enquanto o checkout está aberto, a página pergunta ao servidor
 * (GET /api/reservas/[codigo]) a cada 4 segundos e, quando o pedido vira pago, expira ou é cancelado, vai para a
 * página do pedido, que mostra o estado de verdade. Uma sessão nova (Pix depois do cartão recusado, "pagar de
 * novo") é pedida ao servidor em POST /api/pedido/[codigo]/pagar, que é quem cria a sessão e grava o pedido.
 */

const INTERVALO_CONSULTA_MS = 4000;
/** Em "confirmando o pagamento", quanto esperar antes de oferecer o botão "Pagar" para quem voltou sem pagar. */
const ESPERA_PARA_PAGAR_MS = 15_000;

let stripePromessa: Promise<Stripe | null> | null = null;

/**
 * O Stripe.js, carregado uma vez só, com a chave pública (a única chave da Stripe que vai ao navegador). Se o
 * script não carregar (sem rede, bloqueador), a promessa vira null e a próxima tentativa carrega de novo.
 */
function stripeDoNavegador(): Promise<Stripe | null> {
  if (!stripePromessa) {
    const chave = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    stripePromessa = chave
      ? loadStripe(chave).catch(() => {
          stripePromessa = null;
          return null;
        })
      : Promise.resolve(null);
  }
  return stripePromessa;
}

/**
 * O que a rota de pagar devolve: a sessão nova (client_secret) ou o motivo de não ter aberto uma. Os erros do
 * servidor: 'forma' (a forma não vale mais para estes itens: o prazo dela passou, o valor passa do limite do Pix, ou o
 * interruptor fechou; sem o Pix, `semPix` diz o motivo), 'status' (o pedido não está pendente nem expirado: pago em
 * outra aba, cancelado), 'limite' (muitas tentativas), 'nao-encontrado', 'stripe'; 'rede' é daqui, quando a chamada
 * nem chegou.
 */
type RespostaPagar = { clientSecret: string } | { erro: string; semPix?: MotivoSemPix };

/** O motivo de o Pix ter ficado de fora, como o servidor manda no erro 'forma' (qualquer outra coisa vira nada). */
export const motivoSemPix = (valor: unknown): MotivoSemPix | undefined => (valor === 'prazo' || valor === 'limite' ? valor : undefined);

/** Pede ao servidor uma sessão de pagamento nova para o pedido (POST /api/pedido/[codigo]/pagar, com o token do link privado). */
export async function pedirNovaSessao(codigoPedido: string, token: string, forma: FormaPagamento): Promise<RespostaPagar> {
  try {
    const res = await fetch(`/api/pedido/${encodeURIComponent(codigoPedido)}/pagar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token, forma }),
    });
    const corpo = (await res.json().catch(() => ({}))) as { ok?: boolean; clientSecret?: string; erro?: string; semPix?: unknown };
    if (res.ok && corpo.ok && corpo.clientSecret) return { clientSecret: corpo.clientSecret };
    const semPix = motivoSemPix(corpo.semPix);
    return { erro: corpo.erro ?? 'generico', ...(semPix ? { semPix } : {}) };
  } catch {
    return { erro: 'rede' };
  }
}

/** O que a página precisa saber da resposta de GET /api/reservas/[codigo]. */
export type LeituraDoPedido = Pick<ReservaPublica, 'status' | 'recusa'>;

/**
 * Pergunta ao servidor o status do pedido a cada 4 segundos (e ao voltar para a aba) enquanto `ativo`. Quem
 * decide é o servidor, que relê a sessão na Stripe se o webhook atrasar; o navegador só pergunta e mostra.
 */
export function useStatusDoPedido(codigo: string, token: string, idioma: Idioma, ativo: boolean, aoLer: (lido: LeituraDoPedido) => void) {
  const aoLerRef = useRef(aoLer);
  useEffect(() => {
    aoLerRef.current = aoLer;
  }, [aoLer]);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const consultar = async () => {
      try {
        const res = await fetch(`/api/reservas/${encodeURIComponent(codigo)}?t=${encodeURIComponent(token)}&idioma=${idioma}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const corpo = (await res.json()) as { reserva?: LeituraDoPedido };
        if (vivo && corpo.reserva) aoLerRef.current(corpo.reserva);
      } catch {}
    };
    const id = window.setInterval(consultar, INTERVALO_CONSULTA_MS);
    const aoVoltar = () => document.visibilityState === 'visible' && consultar();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      vivo = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, [codigo, token, idioma, ativo]);
}

/** Os estados em que o checkout embutido fecha e a página do pedido mostra o resultado. */
const FECHA_O_CHECKOUT: readonly StatusReserva[] = ['pago', 'expirado', 'cancelado', 'reembolsado', 'contestado'];

/* ------------------------------------------------------------------ */

/** Os textos do checkout embutido e do aviso de recusa (chaves de pedido.*, recusa.* e checkout.*). */
export interface TextosCheckoutEmbutido {
  recusadoTitulo: string;
  /** "Cartão recusado? Pague com Pix e ganhe {p}% de desconto", já com o {p} preenchido. */
  recusadoPix: string;
  /** Para o cartão de fora: ligar para o banco e pedir para liberar compras internacionais. */
  dicaInternacional: string;
  tentarOutroCartao: string;
  semPixPrazo: string;
  /** Quando o valor do pedido passa do limite de um Pix. */
  semPixLimite: string;
  /** Em cima do QR do Pix: o nome que o app do banco mostra pode ser o da empresa que processa o pagamento. */
  pixRecebedor: string;
  /** O motivo da recusa em linguagem simples, por chave (src/lib/recusas.ts). */
  recusa: Record<ChaveRecusa, string>;
  processando: string;
  erroGenerico: string;
  /** Quando o formulário da Stripe não carrega (bloqueador de anúncios, rede de empresa): o que fazer (checkout.semStripe). */
  semStripe: string;
  /** "Tentar de novo" (reserva.tentarNovamente): carrega o formulário da Stripe outra vez, ali mesmo. */
  tentarDeNovo: string;
}

export function CheckoutEmbutido({
  clientSecret,
  forma,
  codigoPedido,
  codigoConsulta,
  token,
  idioma,
  pixDisponivel,
  semPix: semPixDoServidor,
  urlVolta,
  contato,
  textos: T,
  aoTrocarForma,
}: {
  /** O client_secret da sessão criada no servidor. */
  clientSecret: string;
  /** A forma que esta sessão cobra. */
  forma: FormaPagamento;
  /** O código do pedido (para pedir a sessão do Pix). */
  codigoPedido: string;
  /** O código que GET /api/reservas/[codigo] consulta (o do pedido, ou o de um voucher dele). */
  codigoConsulta: string;
  token: string;
  idioma: Idioma;
  /** O Pix ainda vale para este pedido (o servidor decidiu): a oferta depois do cartão recusado só aparece com ele. */
  pixDisponivel: boolean;
  /** Sem o Pix, por quê (o prazo ou o limite de valor), para a frase no lugar da oferta. */
  semPix?: MotivoSemPix;
  /** A página do pedido com o token: para onde a página vai ao concluir ou quando o servidor fecha o pedido. */
  urlVolta: string;
  /** O e-mail da equipe, para quando o formulário da Stripe não carrega. */
  contato?: { href: string; rotulo: string };
  textos: TextosCheckoutEmbutido;
  /** Avisa quem mostra o total que o cliente trocou para o Pix. */
  aoTrocarForma?: (forma: FormaPagamento) => void;
}) {
  const [stripe, setStripe] = useState(stripeDoNavegador);
  const [semStripe, setSemStripe] = useState(false);
  const [segredo, setSegredo] = useState(clientSecret);
  const [formaAtual, setFormaAtual] = useState(forma);
  const [recusa, setRecusa] = useState<ChaveRecusa | undefined>();
  const [trocando, setTrocando] = useState(false);
  const [erro, setErro] = useState('');
  // o servidor avisou que o Pix não vale mais (o prazo de 2 h passou com o checkout aberto): a oferta sai da tela, e o
  // motivo que ele mandou entra no lugar
  const [semPix, setSemPix] = useState(false);
  const [motivoDoServidor, setMotivoDoServidor] = useState<MotivoSemPix | undefined>();
  const avisoRef = useRef<HTMLDivElement>(null);
  const erroRef = useRef<HTMLParagraphElement>(null);
  const semStripeRef = useRef<HTMLParagraphElement>(null);

  // a página inteira recarrega: o estado de verdade (pago, confirmando, expirado) vem do servidor. Tem de ser assim
  // (nunca router.push): a página do pedido leva o token do cliente no endereço e nasce sem as tags de anúncio
  const irParaOPedido = useCallback(() => window.location.assign(urlVolta), [urlVolta]);

  // sem a chave pública, ou com o script da Stripe bloqueado: o aviso no lugar de um quadro vazio
  useEffect(() => {
    let vivo = true;
    stripe.then((s) => {
      if (vivo && !s) setSemStripe(true);
    });
    return () => {
      vivo = false;
    };
  }, [stripe]);

  // o aviso (e o erro de pagar com Pix) recebem o foco: o botão que o cliente tocou sumiu ou ficou desligado, e sem
  // isso o próximo Tab recomeçaria do topo da página. O foco também traz o aviso para a vista
  useEffect(() => {
    if (semStripe) semStripeRef.current?.focus();
  }, [semStripe]);
  useEffect(() => {
    if (erro) erroRef.current?.focus();
  }, [erro]);

  // o Stripe.js que não carregou é pedido de novo (stripeDoNavegador esquece a tentativa que falhou), ali mesmo, sem
  // recarregar a página: o pedido e a sessão continuam os mesmos
  function carregarDeNovo() {
    setSemStripe(false);
    setStripe(stripeDoNavegador());
  }

  // pausa enquanto troca de sessão: a anterior é expirada no servidor e o pedido pode passar um instante por
  // "expirado" antes de a sessão nova voltar a deixá-lo pendente
  useStatusDoPedido(codigoConsulta, token, idioma, !trocando, (lido) => {
    if (FECHA_O_CHECKOUT.includes(lido.status)) {
      irParaOPedido();
      return;
    }
    if (lido.recusa) setRecusa(lido.recusa);
  });

  // a recusa chega com o cliente lá embaixo, no botão de pagar da Stripe: a tela sobe até o aviso (e a oferta do
  // Pix) quando ele nasce fora da vista. O jeito de rolar (suave, ou direto para quem pediu menos movimento) vem
  // do CSS da página
  useEffect(() => {
    if (!recusa || formaAtual !== 'cartao') return;
    const aviso = avisoRef.current;
    if (!aviso) return;
    const { top, bottom } = aviso.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) aviso.scrollIntoView({ block: 'start' });
  }, [recusa, formaAtual]);

  async function pagarComPix() {
    setTrocando(true);
    setErro('');
    const resposta = await pedirNovaSessao(codigoPedido, token, 'pix');
    if ('clientSecret' in resposta) {
      setSegredo(resposta.clientSecret);
      setFormaAtual('pix');
      setRecusa(undefined);
      aoTrocarForma?.('pix');
    } else if (resposta.erro === 'status') {
      // o pedido mudou por baixo (pago, cancelado): a página do pedido mostra o estado de verdade
      irParaOPedido();
      return;
    } else if (resposta.erro === 'forma') {
      // o prazo do Pix passou com o checkout aberto: no lugar da oferta entra o convite para outro cartão (a
      // sessão do cartão que está aberta aqui continua valendo, o servidor não a fechou)
      setSemPix(true);
      setMotivoDoServidor(resposta.semPix);
    } else setErro(T.erroGenerico);
    setTrocando(false);
  }

  return (
    <div className="space-y-5">
      {/* o motivo da recusa em linguagem simples, acima do formulário da Stripe (que também mostra a recusa dela) */}
      {recusa && formaAtual === 'cartao' && (
        <div ref={avisoRef} role="alert" className="scroll-mt-24 rounded-cartao bg-erro-claro px-5 py-4 text-mar">
          <p className="font-semibold">{T.recusadoTitulo}</p>
          <p className="mt-1">{T.recusa[recusa]}</p>
          {/* a dica vem em toda recusa de cartão, como o dono pediu, menos na "internacional", em que o motivo já diz o mesmo */}
          {mostrarDicaInternacional(recusa) && <p className="mt-2 text-small">{T.dicaInternacional}</p>}
          {pixDisponivel && !semPix ? (
            <button type="button" className="botao mt-4 w-full" onClick={pagarComPix} disabled={trocando} aria-busy={trocando}>
              {trocando ? T.processando : T.recusadoPix}
            </button>
          ) : (
            <p className="mt-2 text-small">
              {fraseSemPix(T, motivoDoServidor ?? semPixDoServidor)} {T.tentarOutroCartao}
            </p>
          )}
          {erro && (
            <p ref={erroRef} tabIndex={-1} className="mt-2 text-small font-semibold outline-none">
              {erro}
            </p>
          )}
        </div>
      )}
      {/* em cima do QR, antes de o cliente abrir o app do banco: o recebedor pode aparecer com outro nome, e não é golpe */}
      {formaAtual === 'pix' && !semStripe && <p className="max-w-[52ch] text-small text-(--color-tinta-suave)">{T.pixRecebedor}</p>}
      {semStripe ? (
        // o script da Stripe não carregou (bloqueador de anúncios, rede de empresa ou de hotel): o que fazer, o botão para
        // carregar de novo ali mesmo e o e-mail da equipe. O pedido já existe e continua esperando o pagamento
        <div className="rounded-cartao bg-erro-claro px-5 py-4 text-mar">
          <p ref={semStripeRef} tabIndex={-1} role="alert" className="max-w-[52ch] font-semibold outline-none">
            {T.semStripe}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button type="button" className="botao w-full sm:w-auto" onClick={carregarDeNovo}>
              {T.tentarDeNovo}
            </button>
            {contato && (
              <a href={contato.href} className="botao botao-vazado w-full sm:w-auto" data-evento="Contact">
                {contato.rotulo}
              </a>
            )}
          </div>
        </div>
      ) : (
        // a Stripe desenha sem margem: o respiro fica aqui; enquanto troca de sessão, o quadro fica esmaecido
        <div
          className="rounded-cartao bg-(--color-papel) p-3 transition-opacity duration-200 aria-busy:opacity-50 sm:p-5"
          aria-busy={trocando}
        >
          {/* a chave troca com a sessão: o formulário da Stripe é montado de novo com o client_secret novo */}
          <EmbeddedCheckoutProvider key={segredo} stripe={stripe} options={{ clientSecret: segredo, onComplete: irParaOPedido }}>
            <EmbeddedCheckout className="min-h-[28rem]" />
          </EmbeddedCheckoutProvider>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Os textos da tela de pagar um pedido em aberto (chaves de pedido.*, checkout.*, reserva.* e recusa.*). */
export interface TextosPagarPedido extends TextosEscolhaPagamento, TextosCheckoutEmbutido {
  /** "Pagar {valor}" */
  pagar: string;
  /** O título da tela de escolher a forma: "Pagamento". */
  pagamento: string;
  /** Embaixo do formulário do cartão: os dados do cartão vão direto para a Stripe. */
  seguro: string;
  confirmando: string;
  confirmandoTexto: string;
  /** "Esta página atualiza sozinha": reserva.atualizaSozinho (um voucher) ou pedido.atualizaSozinho (um por item). */
  atualizaSozinho: string;
  /** O botão "Pagar" do pedido pendente cujo pagamento não chegou (o cliente voltou sem pagar). */
  pagarAgora: string;
  pagarDeNovo: string;
  tempoEsgotado: string;
  tempoEsgotadoTexto: string;
  /** Quando nenhuma forma vale mais (faltam menos de 30 minutos para o serviço, ou o pagamento online está fechado). */
  semPrazo: string;
}

type Etapa = 'confirmando' | 'escolher' | 'checkout';

/**
 * O pedido pendente ou expirado pela Stripe, na página do pedido ou da reserva: "confirmando o pagamento"
 * enquanto o servidor espera o webhook; "o tempo para pagar terminou" com o botão de pagar de novo; a recusa
 * do cartão com a oferta do Pix. O pagamento novo abre o checkout embutido ali mesmo, com o mesmo pedido, o
 * mesmo código e o mesmo link, sem redigitar nada.
 */
export function PagarPedido({
  codigoPedido,
  codigoConsulta,
  token,
  idioma,
  locale,
  dolar = null,
  status,
  recusa: recusaInicial,
  formas,
  semPix,
  totais,
  formaAtual,
  urlVolta,
  contato,
  textos: T,
}: {
  codigoPedido: string;
  /** Um código que GET /api/reservas/[codigo] aceita: o do primeiro voucher. */
  codigoConsulta: string;
  token: string;
  idioma: Idioma;
  locale: string;
  dolar?: number | null;
  status: Extract<StatusReserva, 'pendente' | 'expirado'>;
  /** A última recusa do cartão, se houve (a chave do texto, de paraPublico). */
  recusa?: ChaveRecusa;
  /** As formas que o servidor liberou agora para este pedido. */
  formas: FormaPagamento[];
  /** Sem o Pix, por quê (o prazo ou o limite de valor de um Pix): o servidor decide junto com as formas. */
  semPix?: MotivoSemPix;
  totais: TotaisDasFormas;
  /** A forma que o pedido tinha (metodo_pagamento). */
  formaAtual?: FormaPagamento;
  /** Esta página com o token: para onde o checkout embutido volta ao concluir. */
  urlVolta: string;
  /** O e-mail da equipe, para quando nenhuma forma dá mais tempo. */
  contato: { href: string; rotulo: string };
  textos: TextosPagarPedido;
}) {
  const router = useRouter();
  const [recusa, setRecusa] = useState(recusaInicial);
  // vencido, ou com o cartão recusado: já dá para escolher a forma; pendente sem recusa: o pagamento pode estar a caminho
  const [etapa, setEtapa] = useState<Etapa>(status === 'expirado' || recusaInicial ? 'escolher' : 'confirmando');
  // depois de uma recusa do cartão, o Pix já vem marcado (se ainda der tempo)
  const [forma, setForma] = useState<FormaPagamento | null>(() =>
    formaPadrao(formas, idioma, recusaInicial && formas.includes('pix') ? 'pix' : formaAtual),
  );
  const [segredo, setSegredo] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const [esperou, setEsperou] = useState(false);
  const erroRef = useRef<HTMLParagraphElement>(null);
  // as formas podem encolher depois de um router.refresh (o prazo passou): a marcada precisa continuar valendo
  const formaValida = forma && formas.includes(forma) ? forma : formaPadrao(formas, idioma);

  // o erro de pagar recebe o foco: o botão ficou desligado durante o envio, e sem isso o próximo Tab recomeçaria do topo.
  // O foco também rola a tela até ele, quando nasce fora da vista
  useEffect(() => {
    if (erro) erroRef.current?.focus();
  }, [erro]);

  // quem voltou sem pagar vê "confirmando" sem nada chegar: depois de um tempo, aparece o botão de pagar; sem forma
  // nenhuma (faltam menos de 30 minutos para o serviço), a tela troca para o aviso de que o pedido não pode mais ser pago pelo site
  const temFormas = formas.length > 0;
  useEffect(() => {
    if (etapa !== 'confirmando') return;
    const id = window.setTimeout(() => (temFormas ? setEsperou(true) : setEtapa('escolher')), ESPERA_PARA_PAGAR_MS);
    return () => window.clearTimeout(id);
  }, [etapa, temFormas]);

  // enquanto o checkout não está aberto aqui, a página acompanha o pedido: mudou de status, o servidor redesenha.
  // Pausa enquanto a sessão nova é criada: ela mesma tira o pedido de expirado, e redesenhar ali fecharia o checkout
  useStatusDoPedido(codigoConsulta, token, idioma, etapa !== 'checkout' && !criando, (lido) => {
    if (lido.status !== status) {
      router.refresh();
      return;
    }
    if (lido.recusa && lido.recusa !== recusa) {
      setRecusa(lido.recusa);
      if (formas.includes('pix')) setForma('pix');
      setEtapa('escolher');
    }
  });

  async function abrirCheckout(escolhida: FormaPagamento) {
    setCriando(true);
    setErro('');
    const resposta = await pedirNovaSessao(codigoPedido, token, escolhida);
    if ('clientSecret' in resposta) {
      setForma(escolhida);
      setSegredo(resposta.clientSecret);
      setEtapa('checkout');
    } else if (resposta.erro === 'status') {
      // o pedido mudou por baixo (pago em outra aba, cancelado): a página mostra o estado de verdade
      router.refresh();
    } else if (resposta.erro === 'forma') {
      // a forma deixou de valer enquanto o cliente escolhia (passou o prazo do Pix, ou o do cartão): a página relê as formas
      setErro(escolhida === 'pix' ? fraseSemPix(T, resposta.semPix) : T.semPrazo);
      router.refresh();
    } else setErro(T.erroGenerico);
    setCriando(false);
  }

  const brl = (c: number) => formatarCifra(c, locale);
  const semFormas = (
    <>
      <p className="max-w-[52ch] bg-superficie px-5 py-4">{T.semPrazo}</p>
      <a href={contato.href} className="botao botao-vazado mt-5 w-full sm:w-auto" data-evento="Contact">
        {contato.rotulo}
      </a>
    </>
  );

  if (etapa === 'checkout' && formaValida) {
    return (
      <div>
        <h1 className="display text-head">{T.pagamento}</h1>
        <div className="mt-8">
          <CheckoutEmbutido
            clientSecret={segredo}
            forma={formaValida}
            codigoPedido={codigoPedido}
            codigoConsulta={codigoConsulta}
            token={token}
            idioma={idioma}
            pixDisponivel={formas.includes('pix')}
            semPix={semPix}
            urlVolta={urlVolta}
            contato={contato}
            textos={T}
            aoTrocarForma={setForma}
          />
        </div>
        {formaValida === 'cartao' && <p className="mt-4 text-small text-(--color-tinta-suave)">{T.seguro}</p>}
      </div>
    );
  }

  if (etapa === 'confirmando') {
    return (
      <div>
        <h1 className="display text-head">{T.confirmando}</h1>
        <p className="mt-4 max-w-[44ch] text-lead">{T.confirmandoTexto}</p>
        <p className="mt-6 max-w-[52ch] bg-superficie px-5 py-4">{T.atualizaSozinho}</p>
        {esperou && temFormas && (
          <div className="mt-6">
            <button type="button" className="botao botao-vazado w-full sm:w-auto" onClick={() => setEtapa('escolher')}>
              {T.pagarAgora}
            </button>
          </div>
        )}
      </div>
    );
  }

  // escolher a forma: depois do tempo esgotado, do cartão recusado, ou de "pagar" num pedido pendente
  const recusado = status === 'pendente' && recusa !== undefined;
  const titulo = status === 'expirado' ? T.tempoEsgotado : recusado ? T.recusadoTitulo : T.pagamento;
  const texto = status === 'expirado' ? T.tempoEsgotadoTexto : recusado ? T.recusa[recusa] : '';
  return (
    <div>
      <h1 className="display text-head">{titulo}</h1>
      {texto && (
        <p className="mt-4 max-w-[44ch] text-lead" role={recusado ? 'alert' : undefined}>
          {texto}
        </p>
      )}
      {recusado && mostrarDicaInternacional(recusa) && <p className="mt-3 max-w-[44ch]">{T.dicaInternacional}</p>}
      <div className="mt-8">
        {formas.length > 0 && formaValida ? (
          <>
            {/* depois da recusa, o empurrão para o Pix (já marcado), ou, sem ele, o convite para outro cartão */}
            {recusado && (
              <p className="mb-6 max-w-[52ch] bg-superficie px-5 py-4 font-semibold">
                {formas.includes('pix') ? T.recusadoPix : T.tentarOutroCartao}
              </p>
            )}
            <EscolhaPagamento
              formas={formas}
              semPix={semPix}
              escolhida={formaValida}
              aoEscolher={setForma}
              totais={totais}
              locale={locale}
              dolar={dolar}
              textos={T}
            />
            <button
              type="button"
              className="botao mt-5 w-full sm:w-auto"
              onClick={() => abrirCheckout(formaValida)}
              disabled={criando}
              aria-busy={criando}
            >
              {criando
                ? T.processando
                : status === 'expirado'
                  ? T.pagarDeNovo
                  : fmt(T.pagar, { valor: brl(valorDaForma(totais, formaValida)) })}
            </button>
            {/* o erro nasce embaixo do botão, e não entre a escolha e ele: assim o botão não é empurrado para fora da tela */}
            {erro && (
              <p ref={erroRef} tabIndex={-1} className="mt-4 bg-erro-claro px-4 py-3 font-semibold text-mar outline-none" role="alert">
                {erro}
              </p>
            )}
          </>
        ) : (
          semFormas
        )}
      </div>
    </div>
  );
}
