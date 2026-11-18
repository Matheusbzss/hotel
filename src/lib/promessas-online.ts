// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import type { Dicionario } from '../i18n/pt';
import { modoPagamentoOnline } from './formas-pagamento.ts';

/**
 * As promessas que só o pagamento online no site cumpre: o voucher na hora e o pagamento seguro pelo site (Etapa 8).
 * Com o interruptor desligado (hoje) ou em 'admin', o pedido fica registrado e o pagamento é fechado com a equipe pelo
 * WhatsApp, e o voucher só sai quando a equipe confirma. Então as etiquetas do topo da inicial, as 4 garantias da
 * inicial e o quadro ao lado do Reservar de cada passeio mostram só o que vale hoje. O dicionário guarda as duas
 * versões lado a lado: a de hoje no campo de sempre e a do pagamento online no campo terminado em "Online". As páginas
 * são estáticas: o valor é lido no build, e as frases do pagamento online entram sozinhas no deploy que liga
 * PAGAMENTO_ONLINE=publico. As descrições para o Google não mudam: já só dizem o que vale nos dois casos.
 */
export function comPromessasOnline(d: Dicionario, online: boolean = modoPagamentoOnline() === 'publico'): Dicionario {
  if (!online) return d;
  return {
    ...d,
    home: { ...d.home, confianca: d.home.confiancaOnline, garantiasCurtas: d.home.garantiasCurtasOnline },
    passeio: { ...d.passeio, garantias: d.passeio.garantiasOnline, pagoSeguro: d.passeio.pagoSeguroOnline },
  };
}
