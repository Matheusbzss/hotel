/**
 * DADOS DA EMPRESA — único lugar para trocar nome, endereço, e-mail e telefone.
 *
 * Rodapé, políticas, termos e voucher em PDF leem tudo daqui.
 * Razão social, CNPJ e endereço aparecem no rodapé, nos termos de uso e na política de privacidade
 * (Decreto 7.962/2013). Em outro lugar, só se o dono pedir: quem confere é tests/sem-cnpj.test.ts.
 */
export const EMPRESA = {
  marca: 'Orla Nativa',
  slogan: 'Viagens & Passeios',

  // Dados legais
  razaoSocial: 'ORLA NATIVA LTDA',
  cnpj: '69.664.651/0001-82',
  enderecoRua: 'Travessa dos Pescadores, 326',
  enderecoCidade: 'Búzios - RJ, CEP 28950-000',

  // Contato
  email: 'financeiro@orlanativa.com',
  telefoneExibicao: '+55 21 99050-2377',
  /**
   * Só números, com DDI e DDD. O WhatsApp aparece só no fim da reserva
   * (finalizar o pagamento e falar sobre o voucher), nunca antes.
   * O ícone do rodapé é só enfeite e não usa este número.
   */
  whatsapp: '5521990502377',

  // Localização
  cidade: 'Armação dos Búzios',
  uf: 'RJ',
  regiao: 'Região dos Lagos',

  /** Os perfis oficiais (Instagram, Facebook, TripAdvisor): entram nos dados da empresa para o Google ligar tudo ao site. */
  perfis: [] as string[],

  // Site
  /**
   * Domínio mostrado no voucher, nas políticas e nas prévias: o do endereço oficial
   * (NEXT_PUBLIC_SITE_URL na Vercel), para nunca mostrar um endereço que ainda não abre.
   */
  dominio: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host : 'orlanativa.online',

  /** Nome que aparece na fatura do cartão (até 13 caracteres, sem acento). */
  descricaoFatura: 'ORLANATIVA',
} as const;

export const enderecoCompleto = `${EMPRESA.enderecoRua}, ${EMPRESA.enderecoCidade}`;
