import { initBotId } from 'botid/client/core';
import { nivelDaVerificacao, protecaoDoNavegador } from './lib/robos';

/**
 * Roda no navegador antes de a página ficar interativa (o arquivo instrumentation-client do Next, a partir da 15.3; é o
 * lugar que a documentação do BotID pede para esta versão). A proteção contra robôs (src/lib/robos.ts): com o interruptor
 * ligado e no site no ar, o BotID prepara os quatro envios protegidos (ENVIOS_PROTEGIDOS), com o nível do interruptor.
 * Desligado, ou fora do site no ar, nada: nenhum script do BotID é carregado e nenhum envio é tocado. As duas variáveis
 * entram no build (NEXT_PUBLIC_): mudar o interruptor pede uma publicação nova.
 */
const protecao = protecaoDoNavegador(nivelDaVerificacao(process.env.NEXT_PUBLIC_VERIFICACAO_ROBOS), process.env.NEXT_PUBLIC_VERCEL_ENV);
if (protecao) {
  try {
    initBotId({ protect: protecao });
  } catch (e) {
    // um erro aqui nunca pode parar a página (a documentação do Next pede o try em volta do que roda neste arquivo)
    console.error('[robos] o BotID não iniciou', e);
  }
}
