import type { TipoEmail } from './mensagens';

/**
 * Os e-mails automáticos como o cartão "E-mails automáticos" das estatísticas os lista (Pacote 33, D4): um nome curto e
 * para quem sai cada um. Até aqui o cartão citava só os e-mails da Etapa 6 (pedido recebido, pagamento aprovado, Pix
 * vencido, link do pedido e lembretes), e na conferência da Etapa 6 o dono pensaria que os de cancelamento e reembolso
 * estavam desligados. É um Record de TipoEmail (src/lib/email/mensagens.ts): um tipo de e-mail novo não passa no tsc sem
 * entrar aqui, e o cartão nunca mais fica para trás. Os dois lembretes do carrinho têm o mesmo nome e aparecem uma vez,
 * com o limite do dia no lugar de {n}. O painel é só em português.
 */
export type DestinoDoEmail = 'cliente' | 'equipe';

export const EMAILS_AUTOMATICOS: Record<TipoEmail, { para: DestinoDoEmail; nome: string }> = {
  'pedido-recebido': { para: 'cliente', nome: 'pedido recebido' },
  'pagamento-aprovado': { para: 'cliente', nome: 'pagamento aprovado com os vouchers' },
  'pix-vencido': { para: 'cliente', nome: 'Pix vencido' },
  'link-do-pedido': { para: 'cliente', nome: 'link do pedido' },
  'desistencia-recebida': { para: 'cliente', nome: 'confirmação do pedido de desistência' },
  reembolso: { para: 'cliente', nome: 'reembolso (confirmado ou a caminho)' },
  'reembolso-concluido': { para: 'cliente', nome: 'reembolso concluído' },
  'pedido-cancelado': { para: 'cliente', nome: 'pedido cancelado' },
  // Pacote 33: o cancelamento sem reembolso pela equipe, o pedido inteiro e um voucher só
  'pedido-cancelado-sem-reembolso': { para: 'cliente', nome: 'pedido cancelado sem reembolso' },
  'voucher-cancelado': { para: 'cliente', nome: 'voucher cancelado sem reembolso' },
  'lembrete-1': { para: 'cliente', nome: 'até {n} lembretes de carrinho por dia' },
  'lembrete-2': { para: 'cliente', nome: 'até {n} lembretes de carrinho por dia' },
  'pedido-pago-equipe': { para: 'equipe', nome: 'pedido pago' },
  'desistencia-equipe': { para: 'equipe', nome: 'pedido de desistência' },
  'reembolso-falho-equipe': { para: 'equipe', nome: 'reembolso que falhou' },
  'pagamento-retido-equipe': { para: 'equipe', nome: 'pagamento que chegou num pedido cancelado' },
};

/** Os nomes dos e-mails de um destino, na ordem da lista e sem repetir. */
export function nomesDosEmails(para: DestinoDoEmail): string[] {
  return [
    ...new Set(
      Object.values(EMAILS_AUTOMATICOS)
        .filter((e) => e.para === para)
        .map((e) => e.nome),
    ),
  ];
}

/** "a, b e c". */
export const listaEmFrase = (nomes: readonly string[]): string =>
  nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;

/** A frase do cartão para um destino, com o limite de lembretes do carrinho no lugar de {n}. */
export const fraseDosEmails = (para: DestinoDoEmail, lembretesPorDia: number): string =>
  listaEmFrase(nomesDosEmails(para).map((n) => n.replace('{n}', String(lembretesPorDia))));
