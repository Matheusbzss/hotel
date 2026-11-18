// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { EMPRESA } from '../../config/empresa.ts';
import { cabeNaCotaDoDia } from './cota.ts';
import type { TipoEmail } from './mensagens';

/**
 * O envio pelo Resend, pela API REST (sem pacote novo): POST https://api.resend.com/emails com a chave no cabeçalho
 * Authorization. Variáveis (só no .env.local e na Vercel, nunca no código):
 * - RESEND_API_KEY: a chave "Sending access", presa ao domínio do remetente. Sem ela, NADA é enviado: o registro do
 *   servidor guarda só o tipo do e-mail e o código do pedido (nenhum dado pessoal) e o site segue normal.
 * - EMAIL_REMETENTE: quem envia; padrão "Orla Nativa <reservas@orlanativa.online>" (o domínio verificado no Resend).
 * - EMAIL_RESPOSTA: para onde vai a resposta do cliente; padrão, o e-mail da empresa (src/config/empresa.ts).
 * A chave de idempotência (cabeçalho Idempotency-Key, válida por 24 horas no Resend) impede o mesmo e-mail duas vezes
 * quando dois avisos chegam juntos. Cada e-mail conta na cota do dia (src/lib/email/cota.ts): passando de 60 no dia,
 * só os essenciais saem. Os registros do servidor nunca levam o endereço, o nome nem o assunto.
 */

export const URL_RESEND = 'https://api.resend.com/emails';
export const REMETENTE_PADRAO = 'Orla Nativa <reservas@orlanativa.online>';
/** O Resend recusa (403) a chamada sem User-Agent: um nome genérico do site, sem dado de ninguém. */
const AGENTE = 'orla-nativa-site/1.0';
const PRAZO_MS = 10_000;

export const emailLigado = (): boolean => Boolean(process.env.RESEND_API_KEY?.trim());
export const remetente = (): string => process.env.EMAIL_REMETENTE?.trim() || REMETENTE_PADRAO;
export const responderPara = (): string => process.env.EMAIL_RESPOSTA?.trim() || EMPRESA.email;

export interface Anexo {
  nome: string;
  conteudo: Uint8Array;
}

export interface EmailParaEnviar {
  tipo: TipoEmail;
  /** O código do pedido ou a referência curta do carrinho: é só isso que aparece no registro do servidor. */
  referencia: string;
  para: string;
  assunto: string;
  html: string;
  texto: string;
  anexos?: Anexo[];
  /** Cabeçalhos extras do e-mail (List-Unsubscribe nos lembretes). */
  cabecalhos?: Record<string, string>;
  /** A chave de idempotência: "<tipo>/<pedido ou carrinho>". */
  chave?: string;
}

/**
 * - enviado: o Resend aceitou (id do e-mail).
 * - desligado: sem RESEND_API_KEY.
 * - repetido: a mesma chave já foi usada nas últimas 24 horas (o e-mail já saiu): quem chama trata como enviado.
 * - cota: acabou a cota do dia ou do mês do plano (o Resend não guarda para depois), ou o site guardou o resto da cota
 *   do dia para os e-mails essenciais (detalhe 'guardada', src/lib/email/cota.ts).
 * - recusado: o Resend recusou o pedido (chave inválida, domínio não verificado, endereço inválido).
 * - falha: rede, tempo esgotado ou o Resend fora do ar, mesmo depois de tentar de novo.
 */
export type ResultadoEnvio =
  | { enviado: true; id: string }
  | {
      enviado: false;
      motivo: 'desligado' | 'repetido' | 'cota' | 'recusado' | 'falha';
      /** O status HTTP do Resend, quando ele respondeu. */
      status?: number;
      detalhe?: string;
    };

export interface OpcoesDoEnvio {
  /** Para os testes: o fetch e a espera entre tentativas. */
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  /** Para os testes: a regra da cota do dia (padrão: cabeNaCotaDoDia, que conta este e-mail no dia). */
  cota?: (tipo: TipoEmail) => Promise<boolean>;
}

const esperarDeVerdade = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** O corpo que o Resend recebe. */
export function corpoDoEnvio(e: EmailParaEnviar): Record<string, unknown> {
  return {
    from: remetente(),
    to: [e.para],
    reply_to: responderPara(),
    subject: e.assunto,
    html: e.html,
    text: e.texto,
    ...(e.cabecalhos && Object.keys(e.cabecalhos).length ? { headers: e.cabecalhos } : {}),
    ...(e.anexos?.length
      ? { attachments: e.anexos.map((a) => ({ filename: a.nome, content: Buffer.from(a.conteudo).toString('base64') })) }
      : {}),
    tags: [{ name: 'tipo', value: e.tipo }],
  };
}

/** Envia um e-mail. Nunca lança: o resultado diz o que aconteceu, e quem chama decide (o pagamento nunca é desfeito). */
export async function enviarEmail(e: EmailParaEnviar, opcoes: OpcoesDoEnvio = {}): Promise<ResultadoEnvio> {
  const chaveApi = process.env.RESEND_API_KEY?.trim();
  if (!chaveApi) {
    console.log(`[email] desligado (sem RESEND_API_KEY): ${e.tipo} ${e.referencia}`);
    return { enviado: false, motivo: 'desligado' };
  }
  // a cota do dia: passando de 60, só os essenciais (se a contagem falhar, o e-mail sai)
  const cabe = await (opcoes.cota ?? cabeNaCotaDoDia)(e.tipo).catch(() => true);
  if (!cabe) {
    console.error(`[email] ${e.tipo} ${e.referencia}: não enviado (cota do dia guardada para os e-mails essenciais)`);
    return { enviado: false, motivo: 'cota', detalhe: 'guardada' };
  }
  const chamar = opcoes.fetch ?? fetch;
  const esperar = opcoes.esperar ?? esperarDeVerdade;
  const corpo = JSON.stringify(corpoDoEnvio(e));
  const cabecalhos: Record<string, string> = {
    Authorization: `Bearer ${chaveApi}`,
    'Content-Type': 'application/json',
    'User-Agent': AGENTE,
    ...(e.chave ? { 'Idempotency-Key': e.chave.slice(0, 256) } : {}),
  };

  let resultado: ResultadoEnvio = { enviado: false, motivo: 'falha' };
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    let tentarDeNovo = false;
    try {
      const resposta = await chamar(URL_RESEND, {
        method: 'POST',
        headers: cabecalhos,
        body: corpo,
        signal: AbortSignal.timeout(PRAZO_MS),
      });
      const dados = (await resposta.json().catch(() => ({}))) as { id?: string; name?: string };
      if (resposta.ok && dados.id) {
        resultado = { enviado: true, id: dados.id };
      } else {
        const status = resposta.status;
        const detalhe = `${status} ${dados.name ?? 'sem nome'}`;
        if (status === 409 && dados.name === 'concurrent_idempotent_requests') {
          // a mesma chave ainda está sendo enviada por outra chamada: a próxima tentativa devolve o id do e-mail
          resultado = { enviado: false, motivo: 'repetido', status, detalhe };
          tentarDeNovo = true;
        } else if (status === 409) {
          resultado = { enviado: false, motivo: 'repetido', status, detalhe };
        } else if (status === 429 && /quota/.test(dados.name ?? '')) {
          resultado = { enviado: false, motivo: 'cota', status, detalhe };
        } else if (status === 429 || status >= 500) {
          resultado = { enviado: false, motivo: 'falha', status, detalhe };
          tentarDeNovo = true;
        } else {
          resultado = { enviado: false, motivo: 'recusado', status, detalhe };
        }
      }
    } catch (erro) {
      resultado = { enviado: false, motivo: 'falha', detalhe: erro instanceof Error ? erro.name : 'erro' };
      tentarDeNovo = true;
    }
    if (!tentarDeNovo || tentativa === 2) break;
    await esperar(1500);
  }

  if (resultado.enviado) console.log(`[email] ${e.tipo} ${e.referencia}: enviado (${resultado.id})`);
  else
    console.error(
      `[email] ${e.tipo} ${e.referencia}: não enviado (${resultado.motivo}${resultado.detalhe ? `, ${resultado.detalhe}` : ''})`,
    );
  return resultado;
}

/** O e-mail saiu agora ou já tinha saído com a mesma chave: é o que conta para não mandar de novo. */
export const saiu = (r: ResultadoEnvio): boolean => r.enviado || r.motivo === 'repetido';

/**
 * A falha é da conta ou do serviço, não deste e-mail: sem chave, sem cota, o Resend fora do ar, a rede, ou a chave e o
 * domínio recusados (401 e 403). Aí nenhum outro e-mail sairia agora: o lote para e tenta de novo depois. O resto
 * (400 e 422: o endereço ou o conteúdo deste e-mail) é problema só deste e-mail.
 */
export function falhaDaConta(r: ResultadoEnvio): boolean {
  if (r.enviado) return false;
  return r.motivo === 'desligado' || r.motivo === 'cota' || r.motivo === 'falha' || r.status === 401 || r.status === 403;
}
