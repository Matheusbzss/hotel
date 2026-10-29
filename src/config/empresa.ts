/**
 * DADOS DA EMPRESA — único lugar para trocar razão social, CNPJ, e-mail e telefone.
 *
 * Quando migrar de MEI para LTDA, altere só este arquivo: rodapé, políticas,
 * termos, voucher em PDF e checkout leem tudo daqui.
 */
export const EMPRESA = {
  marca: 'Agência Victor Hugo',
  slogan: 'Viagens & Passeios',

  // Dados legais
  razaoSocial: 'VICTOR HUGO ALVES DE VASCONCELOS FREIRES',
  tipoEmpresa: 'MEI',
  cnpj: '69.664.651/0001-82',

  // Contato
  email: 'victorhugo@orlanativa.com.br',
  telefoneExibicao: '+55 21 99050-2377',
  /** Só números, com DDI e DDD — usado nos links do WhatsApp. */
  whatsapp: '5521990502377',
  instagramUrl: 'https://instagram.com/agencia_victor_hugo',
  instagramUsuario: '@agencia_victor_hugo',

  // Localização
  cidade: 'Armação dos Búzios',
  uf: 'RJ',
  regiao: 'Região dos Lagos',

  // Site
  dominio: 'agenciavictorhugo.online',
  url: 'https://agenciavictorhugo.online',

  /** Nome que aparece na fatura do cartão (até 13 caracteres, sem acento). */
  descricaoFatura: 'AGVICTORHUGO',
} as const;

export const enderecoCurto = `${EMPRESA.cidade} – ${EMPRESA.uf}`;
