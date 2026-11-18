import { z } from 'zod';
import type { Dicionario } from '@/i18n';
// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { IDIOMAS } from '../i18n/config.ts';

/**
 * Os pedidos de orçamento e as mensagens de quem ainda não reservou: o trajeto sob cotação do transfer, o
 * "Avise-me" das casas e a página de Contato. Ficam na tabela cotacoes e aparecem no painel (/admin/cotacoes).
 */

export const TIPOS_COTACAO = ['transfer', 'casa', 'outro'] as const;
export const STATUS_COTACAO = ['nova', 'respondida', 'fechada', 'perdida'] as const;
export type TipoCotacao = (typeof TIPOS_COTACAO)[number];
export type StatusCotacao = (typeof STATUS_COTACAO)[number];

const Ponta = z.object({
  lugar: z.string().max(40),
  endereco: z.string().trim().max(160).optional(),
  /** Só em "Outra cidade". */
  cidade: z.string().trim().max(80).optional(),
});
const Trecho = z.object({ saida: Ponta, destino: Ponta, data: z.string().max(10), hora: z.string().max(5) });
const quantidade = z.number().int().min(0).max(40);

/** O transfer que o cliente montou no cartão: o trajeto sem preço fixo ou o grupo maior que a van. */
export const EsquemaTrajeto = z.object({
  ida: Trecho,
  volta: Trecho.optional(),
  passageiros: z.number().int().min(1).max(100),
  malas: z.object({ grandes: quantidade, medias: quantidade, mao: quantidade }),
});
export type TrajetoCotacao = z.infer<typeof EsquemaTrajeto>;
export type PontaCotacao = z.infer<typeof Ponta>;

export const EsquemaCotacao = z.object({
  tipo: z.enum(TIPOS_COTACAO),
  idioma: z.enum(IDIOMAS),
  nome: z.string().trim().min(3).max(120),
  email: z.string().trim().min(3).max(160),
  ddi: z.string().max(4).optional().default(''),
  telefone: z.string().trim().max(24).optional().default(''),
  mensagem: z.string().trim().max(1000).optional().default(''),
  trajeto: EsquemaTrajeto.optional(),
  /** Campo-isca contra robôs: precisa vir vazio. */
  site: z.string().max(0).optional(),
});

/** O que cada pedido exige além do nome e do e-mail. Retorna o campo que faltou, ou null. */
export function faltaNaCotacao(c: z.infer<typeof EsquemaCotacao>): string | null {
  if (c.tipo === 'transfer' && !c.trajeto) return 'trajeto';
  if (c.tipo === 'transfer' && !c.telefone) return 'telefone';
  if (c.tipo === 'outro' && c.mensagem.length < 3) return 'mensagem';
  return null;
}

/** Os textos do formulário, no idioma da página. */
export const textosCotacao = (d: Dicionario) => ({
  ...d.cotacao,
  nome: d.checkout.nome,
  email: d.checkout.email,
  telefone: d.checkout.telefone,
  telefoneAjuda: d.checkout.telefoneAjuda,
  ddi: d.checkout.ddi,
  erroObrigatorio: d.checkout.erros.obrigatorio,
  erroEmail: d.checkout.erros.email,
  erroTelefone: d.checkout.erros.telefone,
});
export type TextosCotacao = ReturnType<typeof textosCotacao>;
