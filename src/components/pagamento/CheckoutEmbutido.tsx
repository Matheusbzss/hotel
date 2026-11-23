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
import {
  depoisDaEspera,
  erroDaFormaRecusada,
  etapaComAsFormasDeAgora,
  formasDaResposta,
  noLugarDaOfertaDoPix,
  pixGeradoNaEscolha,
  type EtapaDePagar,
  type NoLugarDaOfertaDoPix,
} from '@/lib/espera-do-pagamento';
import type { FormaPagamento, MotivoSemPix } from '@/lib/formas-pagamento';
import { escalaDoQuadro, LARGURA_MINIMA_STRIPE } from '@/lib/quadro-stripe';
import { mostrarDicaInternacional, type ChaveRecusa } from '@/lib/recusas';
import type { StatusReserva } from '@/lib/reservas';
import {
  EscolhaPagamento,
  formaPadrao,
  fraseSemPix,
  valorDaForma,
  type TextosEscolhaPagamento,
  type TotaisDasFormas,
} from './EscolhaPagamento';
import { avisarSessaoNova } from './PalavraDoStatus';
import { useStatusDoPedido } from './useStatusDoPedido';

/**
 * O checkout embutido da Stripe: o formulário dela (cartão, carteiras ou o QR do Pix) dentro da nossa página.
 * O navegador nunca decide o status do pedido: enquanto o checkout está aberto, a página pergunta ao servidor
 * (GET /api/reservas/[codigo], pelo gancho useStatusDoPedido, ./useStatusDoPedido.ts) a cada 4 segundos e, quando o
 * pedido vira pago, expira ou é cancelado, vai para a página do pedido, que mostra o estado de verdade. Uma sessão
 * nova (Pix depois do cartão recusado, "pagar de novo") é pedida ao servidor em POST /api/pedido/[codigo]/pagar, que
 * é quem cria a sessão e grava o pedido.
 */

/** Em "confirmando o pagamento", quanto esperar antes de oferecer o botão "Pagar" para quem voltou sem pagar. */
const ESPERA_PARA_PAGAR_MS = 15_000;
/**
 * Quanto esperar pelo formulário da Stripe (o quadro dela dentro da caixa) antes de mostrar o aviso "o formulário não
 * carregou": a rede que deixa o script pendurado sem dar erro (hotel, Wi-Fi com portal) e o script que carrega sem conseguir
 * montar o formulário deixavam só uma caixa branca (lacuna 16 do teste de 15/11). Bem acima do tempo normal (o quadro entra
 * em 1 a 3 s), para a rede lenta de celular não disparar o aviso à toa.
 */
const ESPERA_PELO_FORMULARIO_MS = 15_000;

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
 * interruptor fechou; `formas` diz as que ainda valem, vazia com o interruptor fechado, e, sem o Pix, `semPix` diz o
 * motivo), 'status' (o pedido não está pendente nem expirado: pago em outra aba, cancelado), 'limite' (muitas
 * tentativas), 'nao-encontrado', 'stripe'; 'rede' é daqui, quando a chamada nem chegou.
 */
type RespostaPagar = { clientSecret: string } | { erro: string; semPix?: MotivoSemPix; formas?: FormaPagamento[] };

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
    const corpo = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      clientSecret?: string;
      erro?: string;
      semPix?: unknown;
      formas?: unknown;
    };
    if (res.ok && corpo.ok && corpo.clientSecret) return { clientSecret: corpo.clientSecret };
    const semPix = motivoSemPix(corpo.semPix);
    // as formas que ainda valem, que o 403 'forma' traz (vazias com o freio de emergência): é com elas que a escolha decide
    // o erro (erroDaFormaRecusada). Até o reteste de 17-18/11 (F7) elas ficavam pelo caminho
    const formas = formasDaResposta(corpo.formas);
    return { erro: corpo.erro ?? 'generico', ...(semPix ? { semPix } : {}), ...(formas ? { formas } : {}) };
  } catch {
    return { erro: 'rede' };
  }
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
  /**
   * Quando o formulário da Stripe não carrega (bloqueador de anúncios, rede de empresa ou de hotel, ou nada na caixa depois
   * do prazo): o que fazer (checkout.semStripe).
   */
  semStripe: string;
  /**
   * "Tentar de novo" (reserva.tentarNovamente): com o script da Stripe barrado, carrega o formulário outra vez, ali mesmo;
   * depois do prazo sem formulário, abre a página do pedido com a página inteira carregando.
   */
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
  // o script da Stripe não carregou (a promessa do Stripe.js resolveu sem a Stripe): o aviso no lugar da caixa
  const [semStripe, setSemStripe] = useState(false);
  // passou o prazo sem o quadro da Stripe na caixa (o script pendurado, o formulário que não montou): o aviso acima dela
  const [demorou, setDemorou] = useState(false);
  const [segredo, setSegredo] = useState(clientSecret);
  const [formaAtual, setFormaAtual] = useState(forma);
  const [recusa, setRecusa] = useState<ChaveRecusa | undefined>();
  const [trocando, setTrocando] = useState(false);
  const [erro, setErro] = useState('');
  // o servidor avisou que o Pix não vale mais (o prazo de 2 h passou com o checkout aberto): a oferta sai da tela, e o
  // motivo que ele mandou entra no lugar
  const [semPix, setSemPix] = useState(false);
  const [motivoDoServidor, setMotivoDoServidor] = useState<MotivoSemPix | undefined>();
  // o que entra no lugar da oferta: a frase do motivo com o convite para outro cartão (como sempre) ou, quando o servidor
  // diz que nenhuma forma vale mais (o freio de emergência), só o convite (noLugarDaOfertaDoPix)
  const [noLugarDoPix, setNoLugarDoPix] = useState<NoLugarDaOfertaDoPix>('motivo-do-pix');
  const avisoRef = useRef<HTMLDivElement>(null);
  const erroRef = useRef<HTMLParagraphElement>(null);
  const semStripeRef = useRef<HTMLParagraphElement>(null);
  // a caixa do formulário: é dentro dela que o prazo procura o quadro da Stripe
  const caixaRef = useRef<HTMLDivElement>(null);
  // dentro da caixa, a régua (mede a largura que o formulário tem) e as duas caixas em volta da peça da Stripe: a de fora
  // fica no fluxo da página; a de dentro é a que encolhe quando a Stripe não cabe (o efeito da escala, mais abaixo)
  const reguaRef = useRef<HTMLDivElement>(null);
  const foraRef = useRef<HTMLDivElement>(null);
  const dentroRef = useRef<HTMLDivElement>(null);
  // o aviso "o formulário não carregou" aparece pelos dois motivos; a caixa só sai pelo primeiro (semStripe)
  const semFormulario = semStripe || demorou;

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

  // a rede que não responde (hotel, Wi-Fi com portal) deixa o script da Stripe pendurado sem dar erro, e o script que
  // carrega pode não conseguir montar o formulário: a promessa acima nunca diz "sem a Stripe" e só sobrava a caixa branca.
  // Passado o prazo sem nenhum quadro da Stripe na caixa, o aviso entra acima dela, e a caixa continua montada: a peça da
  // Stripe para React, se desmontada, ainda cria o formulário quando o script chega e nunca o destrói, e o Stripe.js recusa
  // o seguinte ("You cannot have multiple Embedded Checkout objects"). O formulário que chega atrasado (a rede voltou, ou
  // era só lenta) tira o aviso sozinho. O prazo recomeça a cada sessão nova (o Pix depois do cartão recusado) e a cada
  // "Tentar de novo" do script barrado
  useEffect(() => {
    if (semStripe) return;
    const caixa = caixaRef.current;
    if (!caixa) return;
    const temQuadro = () => caixa.querySelector('iframe') !== null;
    const id = window.setTimeout(() => {
      if (!temQuadro()) setDemorou(true);
    }, ESPERA_PELO_FORMULARIO_MS);
    const olho = new MutationObserver(() => {
      if (!temQuadro()) return;
      window.clearTimeout(id);
      setDemorou(false);
    });
    olho.observe(caixa, { childList: true, subtree: true });
    return () => {
      window.clearTimeout(id);
      olho.disconnect();
    };
  }, [stripe, segredo, semStripe]);

  // A Stripe não deixa o formulário ficar mais estreito que LARGURA_MINIMA_STRIPE (a caixa do Pix antes do QR pede 412 px, e
  // um celular comum tem 390; o cartão pede até 322): sem isto, a direita do formulário ficava escondida (T1, T2 e pix#3 do
  // teste de 15/11). Quando a largura que sobra (medida pela régua, um bloco vazio sem altura, com getBoundingClientRect:
  // há celulares com largura fracionária) é menor, o quadro é desenhado com a largura que a Stripe pede e encolhido até
  // caber (transform), e a caixa de fora fica com a altura do quadro encolhido. O quadro encolhido sai do fluxo (absolute),
  // para a largura fixa dele nunca empurrar a coluna da página. O vigia acompanha a largura (girar o celular) e a altura do
  // formulário (a Stripe muda a altura sozinha). Ele só mexe no estilo destas duas caixas: a margem do celular vem das
  // classes do cartão, nunca daqui, senão o navegador avisa "ResizeObserver loop". Nenhum estado muda aqui: a escala nunca
  // monta de novo nem tira da tela a peça da Stripe. A folha do QR do Pix é outro quadro da Stripe, preso à página, e não
  // encolhe. Recomeça com a forma (o Pix depois do cartão recusado pede outra largura) e com a caixa que volta depois do
  // script barrado (semStripe)
  useEffect(() => {
    const regua = reguaRef.current;
    const fora = foraRef.current;
    const dentro = dentroRef.current;
    if (semStripe || !regua || !fora || !dentro || typeof ResizeObserver === 'undefined') return;
    const minima = LARGURA_MINIMA_STRIPE[formaAtual];
    const soltar = () => {
      for (const p of ['position', 'left', 'top', 'width', 'transform', 'transform-origin']) dentro.style.removeProperty(p);
      for (const p of ['height', 'overflow']) fora.style.removeProperty(p);
    };
    const acertar = () => {
      const escala = escalaDoQuadro(regua.getBoundingClientRect().width, minima);
      if (escala === 1) return soltar();
      dentro.style.position = 'absolute';
      dentro.style.left = '0';
      dentro.style.top = '0';
      dentro.style.width = `${minima}px`;
      dentro.style.transformOrigin = '0 0';
      dentro.style.transform = `scale(${escala})`;
      fora.style.overflow = 'hidden';
      fora.style.height = `${dentro.offsetHeight * escala}px`;
    };
    const vigia = new ResizeObserver(acertar);
    vigia.observe(regua);
    vigia.observe(dentro);
    acertar();
    return () => {
      vigia.disconnect();
      soltar();
    };
  }, [formaAtual, semStripe]);

  // o aviso (e o erro de pagar com Pix) recebem o foco: o botão que o cliente tocou sumiu ou ficou desligado, e sem
  // isso o próximo Tab recomeçaria do topo da página. O foco também traz o aviso para a vista. O aviso do prazo recebe o
  // foco ao nascer: ele só nasce com a caixa vazia, quando não há mais nada para o cliente fazer ali
  useEffect(() => {
    if (semFormulario) semStripeRef.current?.focus();
  }, [semFormulario]);
  useEffect(() => {
    if (erro) erroRef.current?.focus();
  }, [erro]);

  // o Stripe.js que não carregou é pedido de novo (stripeDoNavegador esquece a tentativa que falhou), ali mesmo, sem
  // recarregar a página: o pedido e a sessão continuam os mesmos. Só para o script barrado (semStripe): ali a peça da
  // Stripe recebeu "sem a Stripe" e não criou nada, então montar de novo é seguro. O prazo recomeça do zero
  function carregarDeNovo() {
    setSemStripe(false);
    setDemorou(false);
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

  // a página que o navegador guardou inteira e devolveu pelo botão de voltar (a memória de voltar do Safari): a troca para
  // o Pix que terminou com a página inteira indo para o pedido (o pedido mudou por baixo, em pagarComPix) deixaria o botão
  // em "Processando…", o quadro esmaecido e a consulta do status parada. A troca é dada por terminada, e a consulta volta
  // (ela leva de novo à página do pedido, se ele não espera mais o pagamento)
  useEffect(() => {
    const aoMostrar = (e: PageTransitionEvent) => {
      if (e.persisted) setTrocando(false);
    };
    window.addEventListener('pageshow', aoMostrar);
    return () => window.removeEventListener('pageshow', aoMostrar);
  }, []);

  // a recusa chega com o cliente lá embaixo, no botão de pagar da Stripe: a tela sobe até o aviso (e a oferta do
  // Pix) quando ele nasce fora da vista. O jeito de rolar (suave, ou direto para quem pediu menos movimento) vem
  // do CSS da página. O começo da tela fica atrás do menu do topo, preso no alto (4rem no celular, 4,5rem do md para
  // cima): a folga é a margem de rolagem do próprio aviso (scroll-mt-24, 6rem, a mesma que o scrollIntoView respeita e
  // que cresce com a letra, como o menu). Até o reteste de 16-17/11 (R6) só rolava com o topo do aviso acima da tela, e em
  // 390 px o título "O cartão não foi aprovado" nascia atrás do menu
  useEffect(() => {
    if (!recusa || formaAtual !== 'cartao') return;
    const aviso = avisoRef.current;
    if (!aviso) return;
    const folga = parseFloat(getComputedStyle(aviso).scrollMarginTop) || 0;
    const { top, bottom } = aviso.getBoundingClientRect();
    if (top < folga || bottom > window.innerHeight) aviso.scrollIntoView({ block: 'start' });
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
      // sessão do cartão que está aberta aqui continua valendo, o servidor não a fechou). Com a frase do motivo do Pix, menos
      // quando o 403 diz que nenhuma forma vale mais (as formas vazias: o pagamento online desligado às pressas): aí só o
      // convite, porque nenhuma frase do Pix seria verdade (noLugarDaOfertaDoPix; B5 do reteste de 22/11)
      setSemPix(true);
      setMotivoDoServidor(resposta.semPix);
      setNoLugarDoPix(noLugarDaOfertaDoPix(resposta.formas));
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
          ) : noLugarDoPix === 'so-outro-cartao' ? (
            // nenhuma forma vale mais (o freio de emergência): só o convite; o formulário do cartão, embaixo, continua aberto
            <p className="mt-2 text-small">{T.tentarOutroCartao}</p>
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
      {formaAtual === 'pix' && !semFormulario && <p className="max-w-[52ch] text-small text-(--color-tinta-suave)">{T.pixRecebedor}</p>}
      {semFormulario && (
        // o formulário da Stripe não carregou: o script barrado na hora (bloqueador de anúncios, rede de empresa ou de hotel),
        // ou nenhum quadro na caixa depois do prazo (o script pendurado, o formulário que não montou). O que fazer, o botão de
        // tentar de novo e o e-mail da equipe. O pedido já existe e continua esperando o pagamento
        <div className="rounded-cartao bg-erro-claro px-5 py-4 text-mar">
          <p ref={semStripeRef} tabIndex={-1} role="alert" className="max-w-[52ch] font-semibold outline-none">
            {T.semStripe}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {/* o script barrado: carrega de novo ali mesmo. Depois do prazo, a página do pedido com a página inteira carregando
                (um documento limpo, de onde dá para pagar): montar de novo aqui esbarraria no formulário que ficou para trás */}
            <button type="button" className="botao w-full sm:w-auto" onClick={semStripe ? carregarDeNovo : irParaOPedido}>
              {T.tentarDeNovo}
            </button>
            {contato && (
              <a href={contato.href} className="botao botao-vazado w-full sm:w-auto" data-evento="Contact">
                {contato.rotulo}
              </a>
            )}
          </div>
        </div>
      )}
      {!semStripe && (
        // a Stripe desenha sem margem: o respiro fica aqui. No celular (abaixo do sm, 40rem: 640 px com a letra padrão do
        // navegador), o cartão branco vai de ponta a ponta da tela (-mx-(--margem) devolve a margem da página), sem cantos e
        // sem respiro dos lados: a Stripe já desenha o respiro dela por dentro, e cada pixel conta (a caixa do Pix pede 412).
        // Do sm para cima, como sempre. Enquanto troca de sessão, o quadro fica esmaecido. A caixa só sai com o script
        // barrado, nunca pelo prazo: desmontada, a peça da Stripe deixaria um formulário fantasma
        <div
          ref={caixaRef}
          className="-mx-(--margem) bg-(--color-papel) py-3 transition-opacity duration-200 aria-busy:opacity-50 sm:mx-0 sm:rounded-cartao sm:p-5"
          aria-busy={trocando}
        >
          {/* a régua: um bloco vazio, sem altura, que mede a largura que o formulário tem */}
          <div ref={reguaRef} aria-hidden="true" />
          {/* a caixa de fora fica no fluxo; a de dentro é a que encolhe quando a Stripe não cabe (o efeito da escala). As
              três não têm condição nenhuma: a peça da Stripe continua montada como sempre */}
          <div ref={foraRef} className="relative">
            <div ref={dentroRef}>
              {/* a chave troca com a sessão: o formulário da Stripe é montado de novo com o client_secret novo. A altura
                  guardada enquanto ele carrega é em px: o que a Stripe desenha não cresce com a letra do celular (em rem, com
                  a letra em 150%, sobrava um vão branco de 147 px embaixo do formulário). Com a letra normal, 448 px = 28rem.
                  Dentro da caixa que encolhe, a altura guardada encolhe junto com o formulário */}
              <EmbeddedCheckoutProvider key={segredo} stripe={stripe} options={{ clientSecret: segredo, onComplete: irParaOPedido }}>
                <EmbeddedCheckout className="min-h-[448px]" />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
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
  /**
   * Embaixo de confirmandoTexto, passada a espera, no pedido de Pix sem outra forma que valha (o pagamento online desligado
   * às pressas, com o QR já gerado): pagar pelo app do banco (pedido.pixGerado). Também na escolha da forma do pedido de
   * Pix pendente depois do prazo do Pix, embaixo da frase do prazo (pixGeradoNaEscolha).
   */
  pixGerado: string;
  /** "Esta página atualiza sozinha": reserva.atualizaSozinho (um voucher) ou pedido.atualizaSozinho (um por item). */
  atualizaSozinho: string;
  /** O botão "Pagar" do pedido pendente cujo pagamento não chegou (o cliente voltou sem pagar). */
  pagarAgora: string;
  pagarDeNovo: string;
  tempoEsgotado: string;
  tempoEsgotadoTexto: string;
  /**
   * Quando nenhuma forma vale mais (faltam menos de 30 minutos para o serviço, ou o pagamento online está fechado). No
   * pedido de Pix pendente, só depois que a sessão acaba (o pedido vence): até lá, o QR já gerado vale (pixGerado).
   */
  semPrazo: string;
}

/**
 * O elemento está fora da vista: o começo dele atrás do menu do topo (a folga é a margem de rolagem do próprio elemento,
 * scroll-mt-24, lida do CSS na hora) ou o fim dele abaixo da tela. É a mesma medida do aviso do cartão recusado
 * (CheckoutEmbutido, mais acima).
 */
function foraDaVista(elemento: HTMLElement): boolean {
  const folga = parseFloat(getComputedStyle(elemento).scrollMarginTop) || 0;
  const { top, bottom } = elemento.getBoundingClientRect();
  return top < folga || bottom > window.innerHeight;
}

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
  const [etapa, setEtapa] = useState<EtapaDePagar>(status === 'expirado' || recusaInicial ? 'escolher' : 'confirmando');
  // depois de uma recusa do cartão, o Pix já vem marcado (se ainda der tempo)
  const [forma, setForma] = useState<FormaPagamento | null>(() =>
    formaPadrao(formas, idioma, recusaInicial && formas.includes('pix') ? 'pix' : formaAtual),
  );
  const [segredo, setSegredo] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const [esperou, setEsperou] = useState(false);
  const erroRef = useRef<HTMLParagraphElement>(null);
  // o título da tela (o da espera ou o da escolha: só uma das duas está na página de cada vez)
  const tituloRef = useRef<HTMLHeadingElement>(null);
  // o "Pagar" que o servidor acabou de recusar pela forma (403 'forma'): a página está sendo relida
  const pagarRecusado = useRef(false);
  // as formas podem encolher depois de um router.refresh (o prazo passou): a marcada precisa continuar valendo
  const formaValida = forma && formas.includes(forma) ? forma : formaPadrao(formas, idioma);

  // o erro de pagar recebe o foco: o botão ficou desligado durante o envio, e sem isso o próximo Tab recomeçaria do topo.
  // O foco também rola a tela até ele, quando nasce fora da vista
  useEffect(() => {
    if (erro) erroRef.current?.focus();
  }, [erro]);

  // quem voltou sem pagar vê "confirmando" sem nada chegar: depois de um tempo, aparece o botão de pagar; sem forma
  // nenhuma (faltam menos de 30 minutos para o serviço, ou o pagamento online foi desligado), a tela troca para o aviso de
  // que o pedido não pode mais ser pago pelo site. Menos no pedido de Pix: o QR que o cliente já gerou vale até a sessão
  // acabar, e a tela continua esperando, com a frase do Pix gerado (depoisDaEspera, src/lib/espera-do-pagamento.ts; L5d do
  // reteste de 17/11). A consulta do status continua: pago, a página mostra os vouchers; a sessão acabou, o tempo esgotado
  const depois = depoisDaEspera(status, formas, formaAtual);
  useEffect(() => {
    if (etapa !== 'confirmando') return;
    const id = window.setTimeout(() => (depois === 'sem-formas' ? setEtapa('escolher') : setEsperou(true)), ESPERA_PARA_PAGAR_MS);
    return () => window.clearTimeout(id);
  }, [etapa, depois]);

  // a escolha da forma que fica sem forma nenhuma com o pedido de Pix pendente (o freio de emergência publicado enquanto o
  // cliente escolhia: o "Pagar" esbarra no 403 'forma' e a página relida volta sem formas) segue a decisão do relógio e
  // volta à espera, já passada: a frase do Pix gerado embaixo de "Se você já pagou…", porque o QR já gerado vale até a
  // sessão acabar (etapaComAsFormasDeAgora, src/lib/espera-do-pagamento.ts). O erro do "Pagar" sai junto (a espera não o
  // mostra). No cartão, ou sem a forma do pedido, a escolha fica com o aviso de sempre. A troca é feita aqui, na
  // renderização, com a condição que só vale uma vez: o React desenha de novo na hora, sem mostrar a do meio (o aviso de
  // que o pedido não pode mais ser pago pelo site); num efeito, ele apareceria por um instante
  const etapaDeAgora = etapaComAsFormasDeAgora(etapa, depois);
  if (etapaDeAgora !== etapa) {
    setErro('');
    setEsperou(true);
    setEtapa(etapaDeAgora);
  }

  // depois do "Pagar" recusado pela forma, a página relida pode tirar a escolha da tela: sem forma nenhuma, entra o aviso de
  // que o pedido não pode mais ser pago pelo site (ou, no pedido de Pix pendente, a espera). O que entra fica lá em cima, e
  // o cliente estava embaixo, no botão: no motor do iPhone a página continuava rolada onde o botão estava e ele via só o
  // resumo do pedido (reteste de 22/11, em 390×664 e 320×568; o Chromium sobe sozinho). A tela e o foco vão até o título do
  // que entrou: rola só quando o título está fora da vista (a mesma medida do aviso do cartão recusado), sem animação, e o
  // foco não rola de novo. Só depois desse toque (pagarRecusado), nunca quando a página nasce nem quando a espera troca
  // sozinha; se a página relida ainda tem a escolha (o Pix saiu e o cartão ficou), nada se mexe: o erro do "Pagar" já tem o
  // foco. As formas chegam como uma lista nova a cada releitura da página, e é isso que acorda o efeito
  useEffect(() => {
    if (!pagarRecusado.current) return;
    pagarRecusado.current = false;
    const semAEscolha = etapa === 'confirmando' || (etapa === 'escolher' && formas.length === 0);
    const titulo = tituloRef.current;
    if (!semAEscolha || !titulo) return;
    if (foraDaVista(titulo)) titulo.scrollIntoView({ block: 'start', behavior: 'instant' });
    titulo.focus({ preventScroll: true });
  }, [etapa, formas]);

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
      // a sessão nova tira o pedido vencido de "expirado": a faixa do resumo, desenhada com o status de quando a página
      // abriu, passa a "Aguardando pagamento" (PalavraDoStatus). Por um evento, sem redesenhar a página: com a chave do
      // status, o redesenho desmontaria esta tela e o formulário da Stripe que acabou de abrir
      avisarSessaoNova(codigoPedido);
    } else if (resposta.erro === 'status') {
      // o pedido mudou por baixo (pago em outra aba, cancelado): a página mostra o estado de verdade
      router.refresh();
    } else if (resposta.erro === 'forma') {
      // a forma deixou de valer enquanto o cliente escolhia (passou o prazo do Pix, ou o do cartão, ou o pagamento online
      // foi desligado às pressas): a página relê as formas. O erro, pelas formas que o 403 trouxe (erroDaFormaRecusada):
      // sem nenhuma, nunca a frase do prazo do Pix; no pedido de Pix pendente, nenhum, porque a página relida volta à
      // espera com a frase do Pix gerado (o QR já gerado vale até a sessão acabar)
      const qual = erroDaFormaRecusada(escolhida, resposta.formas, status, formaAtual);
      if (qual !== 'nenhum') setErro(qual === 'sem-pix' ? fraseSemPix(T, resposta.semPix) : T.semPrazo);
      // se a página relida tirar a escolha da tela (nenhuma forma vale mais), a tela e o foco vão até o título do que entrou
      pagarRecusado.current = true;
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
        {/* o título recebe a tela e o foco quando a espera entra no lugar da escolha, depois do "Pagar" recusado (o efeito de
            pagarRecusado, mais acima): a margem de rolagem é a folga do menu do topo, como a do aviso do cartão recusado */}
        <h1 ref={tituloRef} tabIndex={-1} className="display scroll-mt-24 text-head outline-none">
          {T.confirmando}
        </h1>
        <p className="mt-4 max-w-[44ch] text-lead">{T.confirmandoTexto}</p>
        {/* o Pix já gerado sem outra forma que valha (o pagamento online desligado às pressas): o QR ainda vale */}
        {esperou && depois === 'esperar-o-pix' && <p className="mt-4 max-w-[44ch] text-lead">{T.pixGerado}</p>}
        <p className="mt-6 max-w-[52ch] bg-superficie px-5 py-4">{T.atualizaSozinho}</p>
        {esperou && depois === 'pagar' && (
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
      {/* o mesmo título com o foco quando o aviso sem formas entra no lugar da escolha, depois do "Pagar" recusado */}
      <h1 ref={tituloRef} tabIndex={-1} className="display scroll-mt-24 text-head outline-none">
        {titulo}
      </h1>
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
            {/* no pedido de Pix pendente, passado o prazo do Pix (só o cartão vale): embaixo da frase do prazo, a do Pix já
                gerado, porque o QR que o cliente tem na mão vale até vencer (pixGeradoNaEscolha) */}
            <EscolhaPagamento
              formas={formas}
              semPix={semPix}
              escolhida={formaValida}
              aoEscolher={setForma}
              totais={totais}
              locale={locale}
              dolar={dolar}
              textos={T}
              pixGerado={pixGeradoNaEscolha(status, formas, formaAtual) ? T.pixGerado : undefined}
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
