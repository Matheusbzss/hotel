import { nivelDaVerificacao, protecaoDoNavegador } from './robos.ts';

/**
 * O envio dos quatro formulários protegidos contra robôs (Pacote 24; o achado R1 da revisão de 23/11): fechar o pedido
 * (POST /api/pedido), pagar de novo (POST /api/pedido/[codigo]/pagar), orçamento e mensagem (POST /api/cotacoes) e
 * "Consultar meu pedido" (POST /api/consultar-pedido). Só eles usam este arquivo; o resto do site usa o fetch de sempre.
 *
 * Por quê: com a proteção ligada, o BotID troca o window.fetch do navegador e, nesses quatro envios, ESPERA o desafio dele
 * antes de chamar o fetch de verdade, sem prazo nenhum. Se o script do desafio não carrega (bloqueador de anúncios, rede
 * ruim, o navegador de dentro de um aplicativo), o primeiro toque recusa na hora e o segundo nunca termina: o botão ficava
 * em "Enviando…" para sempre, nada era gravado e ninguém ficava sabendo.
 *
 * - Proteção desligada no build (a mesma conta de src/instrumentation-client.ts): é exatamente fetch(url, init). Nenhum
 *   controle, nenhum relógio, nada muda.
 * - Ligada: um prazo (PRAZO_DO_ENVIO_PROTEGIDO_MS). O fetch trocado pode nem chegar ao fetch de verdade, então só o sinal
 *   não resolve: o relógio corre contra o envio e, no prazo, a promessa recusa com ProtecaoSemResposta E o sinal do envio é
 *   abortado, para que um desafio que chegue depois não mande o POST (o BotID 1.5.13 repassa o init, com o sinal, ao fetch
 *   de verdade: `{...init, headers}`; o teste confere no pacote). A recusa na hora do primeiro toque (o script do desafio
 *   não carregou) também vira ProtecaoSemResposta: o BotID recusa com o evento "error" do <script>, e o fetch de verdade
 *   nunca recusa com um Event (só com TypeError ou com o DOMException do aborto). Qualquer outra falha passa como veio.
 * - O formulário mostra, para ProtecaoSemResposta, o mesmo que já mostra para o 403 'robo' (a mensagem comum.robo e o botão
 *   do WhatsApp do Pacote 21), e o botão de enviar volta a funcionar.
 *
 * Sem o atalho "@/", para os testes em node puro. O guia está em docs/protecao-contra-robos.md.
 */

/**
 * Quanto o envio protegido pode levar antes de o formulário desistir dele: 20 segundos. Bem acima do pior caso normal do
 * servidor nesses envios, que já soma até 3 s da verificação contra robôs (LIMITE_DA_VERIFICACAO_MS), o banco e, no pedido
 * e no pagar, a criação da sessão na Stripe: um envio que passa disso não está esperando o servidor, está preso no desafio.
 * E curto o bastante para o cliente não desistir da página antes de ver o botão do WhatsApp.
 */
export const PRAZO_DO_ENVIO_PROTEGIDO_MS = 20_000;

/** A recusa reconhecível: o desafio da proteção não respondeu no prazo (ou o script dele não carregou). Nada foi enviado. */
export class ProtecaoSemResposta extends Error {
  constructor(motivo: 'prazo' | 'script') {
    super(motivo === 'prazo' ? 'a proteção contra robôs não respondeu no prazo' : 'o script da proteção contra robôs não carregou');
    this.name = 'ProtecaoSemResposta';
  }
}

/** A falha veio da proteção (prazo ou script)? Então o formulário mostra a mensagem do robô. */
export function semRespostaDaProtecao(erro: unknown): erro is ProtecaoSemResposta {
  return erro instanceof ProtecaoSemResposta;
}

/**
 * A recusa do fetch trocado quando o script do desafio (ou o da análise profunda) não carrega: o evento "error" do <script>
 * (no BotID 1.5.13, `o.onerror = c => s(c)`). O fetch de verdade nunca recusa com um Event.
 */
const scriptDoDesafioFalhou = (erro: unknown) => typeof Event !== 'undefined' && erro instanceof Event;

/** O init do envio, sem sinal: quem aborta é o prazo (nenhum dos quatro formulários passa um sinal). */
export type InitDoEnvio = Omit<RequestInit, 'signal'>;

export type EnvioProtegido = (url: string, init: InitDoEnvio) => Promise<Response>;

/** Um relógio (o de verdade, ou o de mentira dos testes). */
export interface Relogio {
  agendar: (fn: () => void, ms: number) => unknown;
  cancelar: (id: unknown) => void;
}

const relogioDeVerdade: Relogio = {
  agendar: (fn, ms) => setTimeout(fn, ms),
  cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface OpcoesDoEnvio {
  /** A proteção está ligada no navegador (protecaoDoNavegador não é null). */
  ligada: boolean;
  /** O fetch, lido na hora de cada envio (o BotID troca o window.fetch depois de este arquivo carregar). */
  buscar?: (url: string, init: RequestInit) => Promise<Response>;
  prazoMs?: number;
  relogio?: Relogio;
}

export function criarEnvioProtegido({
  ligada,
  buscar = (url, init) => fetch(url, init),
  prazoMs = PRAZO_DO_ENVIO_PROTEGIDO_MS,
  relogio = relogioDeVerdade,
}: OpcoesDoEnvio): EnvioProtegido {
  // desligada: exatamente o fetch de sempre, com o mesmo init (sem controle, sem relógio)
  if (!ligada) return (url, init) => buscar(url, init);

  return (url, init) => {
    const controle = new AbortController();
    let id: unknown;
    const prazo = new Promise<never>((_, recusar) => {
      id = relogio.agendar(() => {
        // recusa antes de abortar: a recusa do aborto que vier do envio chega depois e não alcança quem chamou
        recusar(new ProtecaoSemResposta('prazo'));
        controle.abort();
      }, prazoMs);
    });
    const envio = buscar(url, { ...init, signal: controle.signal }).catch((erro: unknown) => {
      throw scriptDoDesafioFalhou(erro) ? new ProtecaoSemResposta('script') : erro;
    });
    return Promise.race([envio, prazo]).finally(() => relogio.cancelar(id));
  };
}

/** O envio dos quatro formulários, com a mesma decisão do navegador (src/instrumentation-client.ts), lida no build. */
export const envioProtegido: EnvioProtegido = criarEnvioProtegido({
  ligada: protecaoDoNavegador(nivelDaVerificacao(process.env.NEXT_PUBLIC_VERIFICACAO_ROBOS), process.env.NEXT_PUBLIC_VERCEL_ENV) !== null,
});
