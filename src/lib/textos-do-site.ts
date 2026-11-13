// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import type { Dicionario } from '../i18n/pt';
import { pagamentoOnlineNoAr } from './formas-pagamento.ts';

/**
 * Os textos que mudam no dia em que o pagamento online vai ao ar para o público (PAGAMENTO_ONLINE=publico): a FAQ das
 * formas de pagamento e de segurança e o aviso do WhatsApp. O dicionário guarda as duas versões lado a lado (a de hoje
 * em `r` e `avisoWhatsapp`; a do pagamento online em `rOnline` e `avisoWhatsappOnline`), e as páginas que mostram
 * esses textos (a inicial e a de contato) passam o dicionário por aqui. Os textos legais seguem a mesma chave em
 * src/content/legal/online.ts. Com o interruptor desligado ou em 'admin', o texto de hoje, sem mudar nada.
 */
export function comPagamentoOnline(d: Dicionario, online: boolean = pagamentoOnlineNoAr()): Dicionario {
  if (!online) return d;
  return {
    ...d,
    comum: { ...d.comum, avisoWhatsapp: d.comum.avisoWhatsappOnline },
    faq: d.faq.map((f) => (f.rOnline ? { ...f, r: f.rOnline } : f)),
  };
}
