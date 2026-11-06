/**
 * DADOS DA EMPRESA — único lugar para trocar nome, e-mail e telefone.
 *
 * Rodapé, políticas, termos, voucher em PDF e checkout leem tudo daqui.
 * Nenhum CNPJ aparece no site (regra do CLAUDE.md). Quando chegar o CNPJ novo, ele volta só no
 * rodapé e nos termos, e o teste tests/sem-cnpj.test.ts muda junto.
 */
export const EMPRESA = {
  marca: 'Orla Nativa',
  slogan: 'Viagens & Passeios',

  // Contato
  email: 'financeiro@orlanativa.com',
  telefoneExibicao: '+55 21 99050-2377',
  /**
   * Só números, com DDI e DDD. O WhatsApp aparece só no fim da reserva
   * (finalizar o pagamento e falar sobre o voucher), nunca antes.
   */
  whatsapp: '5521990502377',

  // Localização
  cidade: 'Armação dos Búzios',
  uf: 'RJ',
  regiao: 'Região dos Lagos',

  // Site
  /**
   * Domínio mostrado no voucher, nas políticas e nas prévias: o do endereço oficial
   * (NEXT_PUBLIC_SITE_URL na Vercel), para nunca mostrar um endereço que ainda não abre.
   */
  dominio: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL).host : 'orlanativa.com.br',

  /** Nome que aparece na fatura do cartão (até 13 caracteres, sem acento). */
  descricaoFatura: 'ORLANATIVA',
} as const;

export const enderecoCurto = `${EMPRESA.cidade} – ${EMPRESA.uf}`;
