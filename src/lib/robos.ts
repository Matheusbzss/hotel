/**
 * A proteção contra robôs nos quatro envios do site (Pacote 20; a Opção B que o dono escolheu em 23/11/2026): a
 * verificação invisível BotID, da Vercel, em fechar o pedido (POST /api/pedido), pagar de novo um pedido em aberto
 * (POST /api/pedido/[codigo]/pagar), pedir orçamento ou mandar mensagem (POST /api/cotacoes) e "Consultar meu pedido"
 * (POST /api/consultar-pedido). Desligada até o dono ligar: um interruptor público, lido no build, com três valores
 * (NEXT_PUBLIC_VERIFICACAO_ROBOS = desligada, basica ou profunda; o que faltar ou vier diferente vale desligada).
 *
 * Este arquivo não importa nada com valor (roda no navegador, no servidor e nos testes, em node puro, sem o atalho "@/"):
 * a decisão do interruptor (nivelDaVerificacao, verificacaoNoAr), a lista do navegador (protecaoDoNavegador) e a regra do
 * servidor (verificarRobo, com a verificação de verdade passada de fora: src/lib/robos-servidor.ts). O guia está em
 * docs/protecao-contra-robos.md.
 */

/** O interruptor: desligada (nada muda para ninguém), basica (a verificação grátis) ou profunda (a Deep Analysis, paga). */
export type NivelDaVerificacao = 'desligada' | 'basica' | 'profunda';

/** O nível da verificação, como o BotID o chama (advancedOptions.checkLevel, igual no navegador e no servidor). */
export type NivelDoBotId = 'basic' | 'deepAnalysis';

/** O valor da variável, lido uma vez: só "basica" e "profunda" ligam; o resto (vazio, errado, maiúsculas) é desligada. */
export function nivelDaVerificacao(valor: string | undefined): NivelDaVerificacao {
  return valor === 'basica' || valor === 'profunda' ? valor : 'desligada';
}

/** O nível do BotID para o interruptor; desligada não tem nível. */
export function nivelDoBotId(nivel: NivelDaVerificacao): NivelDoBotId | null {
  return nivel === 'basica' ? 'basic' : nivel === 'profunda' ? 'deepAnalysis' : null;
}

/**
 * A verificação de verdade só roda no site no ar (a produção da Vercel: NEXT_PUBLIC_VERCEL_ENV, que a Vercel põe sozinha
 * no build) e com o interruptor ligado. Fora dela (a bancada, next dev, next start num computador, as prévias da Vercel)
 * nunca, diga o interruptor o que disser. O navegador e o servidor leem as mesmas duas variáveis do build, então decidem
 * sempre igual: o servidor nunca cobra a verificação de um envio que o navegador não preparou (o que barraria o cliente).
 */
export function verificacaoNoAr(nivel: NivelDaVerificacao, ambienteDaVercel: string | undefined): boolean {
  return nivel !== 'desligada' && ambienteDaVercel === 'production';
}

/** Um envio protegido: o caminho (com * no pedaço do código do pedido) e o método, como o BotID pede no navegador. */
export interface EnvioProtegido {
  path: string;
  method: 'POST';
}

/**
 * Os quatro envios, na ordem do plano. O "*" do pagar casa com o código do pedido (o BotID troca "*" por ".*"): só o
 * POST do pagar, nunca o "desistir" (outro caminho) nem o GET das páginas. É esta a lista que vai para o navegador e
 * é com ela que os testes conferem as quatro rotas.
 */
export const ENVIOS_PROTEGIDOS: readonly EnvioProtegido[] = [
  { path: '/api/pedido', method: 'POST' },
  { path: '/api/pedido/*/pagar', method: 'POST' },
  { path: '/api/cotacoes', method: 'POST' },
  { path: '/api/consultar-pedido', method: 'POST' },
];

/** O que o initBotId recebe: cada envio com o nível (o mesmo que o servidor pede, ou a verificação falha). */
export type ProtecaoDoNavegador = (EnvioProtegido & { advancedOptions: { checkLevel: NivelDoBotId } })[];

/**
 * A lista do navegador (src/instrumentation-client.ts), ou null para não carregar nada: com o interruptor desligado, ou
 * fora do site no ar, nenhum script do BotID é carregado e nenhum envio é tocado.
 */
export function protecaoDoNavegador(nivel: NivelDaVerificacao, ambienteDaVercel: string | undefined): ProtecaoDoNavegador | null {
  const checkLevel = nivelDoBotId(nivel);
  if (!checkLevel || !verificacaoNoAr(nivel, ambienteDaVercel)) return null;
  return ENVIOS_PROTEGIDOS.map((envio) => ({ ...envio, advancedOptions: { checkLevel } }));
}

/** O que a verificação do BotID recebe (as duas formas que este site usa: a de verdade e a de mentira da bancada). */
export type OpcoesDaVerificacao =
  { advancedOptions: { checkLevel: NivelDoBotId } } | { developmentOptions: { bypass: 'BAD-BOT'; isDevelopment: true } };

export interface DependenciasDoRobo {
  /** O interruptor (nivelDaVerificacao de NEXT_PUBLIC_VERIFICACAO_ROBOS). */
  nivel: NivelDaVerificacao;
  /** NEXT_PUBLIC_VERCEL_ENV, do build. */
  ambienteDaVercel: string | undefined;
  /** VERCEL_ENV, do servidor na hora: a segunda trava da bancada (vale também quando a primeira faltar). */
  ambienteDoServidor: string | undefined;
  /** ROBOS_DE_MENTIRA, só lido fora da produção: "robo" faz todo envio protegido ser tratado como robô (a bancada). */
  deMentira: string | undefined;
  /** A verificação (checkBotId, de botid/server). */
  verificar: (opcoes: OpcoesDaVerificacao) => Promise<{ isBot: boolean }>;
  /** O registro do servidor (console.warn). Uma linha, sem nada do que o cliente digitou. */
  registrar: (linha: string) => void;
  /** O tempo máximo da verificação: passou, o envio passa. */
  limiteMs?: number;
}

/** Quanto a verificação pode levar antes de o envio passar sem ela (a mesma folga da consulta do checkout à Stripe). */
export const LIMITE_DA_VERIFICACAO_MS = 3_000;

/** A bancada pode ver a mensagem do robô (ROBOS_DE_MENTIRA=robo), só fora da produção da Vercel. */
export function robosDeMentira(deps: Pick<DependenciasDoRobo, 'ambienteDaVercel' | 'ambienteDoServidor' | 'deMentira'>): boolean {
  return deps.ambienteDaVercel !== 'production' && deps.ambienteDoServidor !== 'production' && deps.deMentira === 'robo';
}

/** O motivo curto de uma falha, numa linha só e sem caracteres estranhos (nunca chega nada do cliente aqui). */
const motivoCurto = (e: unknown) =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/[^\x20-\x7e]+/g, ' ').slice(0, 160);

/**
 * A regra do servidor, chamada por cada rota DEPOIS do que já existia (o campo-isca, as conferências que não custam nada
 * e o limite por endereço) e ANTES de qualquer gravação: um envio que o limite já recusou nunca é verificado (com a
 * profunda, cada verificação é cobrada). 'robo': a rota responde 403 'robo' e não grava nada. 'passa': segue.
 * - Interruptor desligado, ou fora do site no ar: a verificação nem é chamada (a bancada pode pedir a de mentira).
 * - Ligado, no ar: a verificação com o nível do interruptor; robô, uma linha no registro.
 * - A verificação falhou (erro da Vercel, demora acima do limite): o envio PASSA e fica uma linha no registro. Um problema
 *   da verificação nunca barra um cliente, como os limites por endereço quando o banco falha.
 */
export async function verificarRobo(rota: string, deps: DependenciasDoRobo): Promise<'passa' | 'robo'> {
  let opcoes: OpcoesDaVerificacao | null = null;
  if (robosDeMentira(deps)) opcoes = { developmentOptions: { bypass: 'BAD-BOT', isDevelopment: true } };
  else if (verificacaoNoAr(deps.nivel, deps.ambienteDaVercel)) {
    const checkLevel = nivelDoBotId(deps.nivel);
    if (checkLevel) opcoes = { advancedOptions: { checkLevel } };
  }
  if (!opcoes) return 'passa';

  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    const limite = new Promise<never>((_, recusar) => {
      relogio = setTimeout(() => recusar(new Error('a verificação demorou demais')), deps.limiteMs ?? LIMITE_DA_VERIFICACAO_MS);
    });
    const resultado = await Promise.race([deps.verificar(opcoes), limite]);
    if (resultado.isBot) {
      deps.registrar(`[robos] ${rota}: barrado como robô (403)`);
      return 'robo';
    }
    return 'passa';
  } catch (e) {
    deps.registrar(`[robos] ${rota}: a verificação falhou e o envio passou (${motivoCurto(e)})`);
    return 'passa';
  } finally {
    clearTimeout(relogio);
  }
}

/** O corpo e o status da resposta ao robô: o código curto que os quatro formulários conhecem. */
export const RESPOSTA_DO_ROBO = { status: 403, corpo: { ok: false, erro: 'robo' } } as const;

/** O formulário recebeu a resposta ao robô (403 com erro 'robo')? Só então ele mostra a mensagem do robô. */
export function respostaDeRobo(status: number, corpo: unknown): boolean {
  return status === 403 && typeof corpo === 'object' && corpo !== null && (corpo as { erro?: unknown }).erro === 'robo';
}
