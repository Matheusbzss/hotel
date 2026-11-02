import { EMPRESA } from '@/config/empresa';
import type { Reserva, StatusReserva } from './reservas';
import { soDigitos } from './validacao';

/**
 * Integração com a API v5 da Pagar.me (checkout transparente).
 * Variáveis de ambiente:
 *   PAGARME_SECRET_KEY            chave secreta (sk_...) — só no servidor
 *   NEXT_PUBLIC_PAGARME_PUBLIC_KEY chave pública (pk_...) — usada no navegador para tokenizar o cartão
 */

/** Pode ser trocada só para testes locais com um servidor simulado. */
const API = process.env.PAGARME_API_URL || 'https://api.pagar.me/core/v5';
const PIX_EXPIRA_SEGUNDOS = 60 * 60;

export function pagarmeConfigurado(): boolean {
  return Boolean(process.env.PAGARME_SECRET_KEY && process.env.NEXT_PUBLIC_PAGARME_PUBLIC_KEY);
}

export class ErroPagarme extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detalhes?: unknown,
  ) {
    super(message);
  }
}

async function chamar<T>(caminho: string, init: RequestInit & { idempotencia?: string } = {}): Promise<T> {
  const chave = process.env.PAGARME_SECRET_KEY;
  if (!chave) throw new ErroPagarme('PAGARME_SECRET_KEY não configurada', 500);
  const res = await fetch(`${API}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${chave}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.idempotencia ? { 'Idempotency-Key': init.idempotencia } : {}),
      ...init.headers,
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  });
  const texto = await res.text();
  let corpo: unknown = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = texto;
  }
  if (!res.ok) {
    const msg = (corpo as { message?: string })?.message ?? `Erro ${res.status} na Pagar.me`;
    throw new ErroPagarme(msg, res.status, corpo);
  }
  return corpo as T;
}

/* ------------------------------------------------------------------ */

interface Transacao {
  id?: string;
  status?: string;
  transaction_type?: string;
  qr_code?: string;
  qr_code_url?: string;
  expires_at?: string;
  acquirer_message?: string;
  gateway_response?: { code?: string; errors?: { message?: string }[] };
  antifraud_response?: { status?: string; return_message?: string };
  card?: { last_four_digits?: string; brand?: string };
}

export interface Pedido {
  id: string;
  code?: string;
  status: 'pending' | 'paid' | 'canceled' | 'failed' | string;
  charges?: {
    id: string;
    status: string;
    payment_method?: string;
    paid_at?: string;
    last_transaction?: Transacao;
  }[];
}

export interface DadosCobrancaCartao {
  token: string;
  pais: string;
  cep: string;
  endereco: string;
  bairro?: string;
  cidade: string;
  estado: string;
}

export interface ItemPedido {
  descricao: string;
  quantidade: number;
  unitarioCentavos: number;
  codigo: string;
}

function telefonePagarme(telefoneE164: string) {
  // telefone gravado como +<ddi> <número>
  const m = telefoneE164.match(/^\+(\d{1,3})\s(.+)$/);
  const ddi = m ? m[1] : '55';
  const nacional = soDigitos(m ? m[2] : telefoneE164);
  return { country_code: ddi, area_code: nacional.slice(0, 2), number: nacional.slice(2) };
}

export async function criarPedido(
  reserva: Reserva,
  itens: ItemPedido[],
  pagamento: { metodo: 'pix' } | { metodo: 'cartao'; cartao: DadosCobrancaCartao },
): Promise<Pedido> {
  const cliente = reserva.cliente;
  const documento = cliente.documentoTipo === 'cpf' ? soDigitos(cliente.documento) : cliente.documento.replace(/[\s-]/g, '').toUpperCase();

  const pagamentoPagarme =
    pagamento.metodo === 'pix'
      ? {
          payment_method: 'pix',
          pix: {
            expires_in: PIX_EXPIRA_SEGUNDOS,
            additional_information: [{ name: 'Voucher', value: reserva.codigo }],
          },
        }
      : {
          payment_method: 'credit_card',
          credit_card: {
            installments: 1,
            statement_descriptor: EMPRESA.descricaoFatura,
            operation_type: 'auth_and_capture',
            card_token: pagamento.cartao.token,
            card: {
              billing_address: {
                line_1: pagamento.cartao.endereco,
                ...(pagamento.cartao.bairro ? { line_2: pagamento.cartao.bairro } : {}),
                zip_code: soDigitos(pagamento.cartao.cep) || pagamento.cartao.cep,
                city: pagamento.cartao.cidade,
                state: pagamento.cartao.estado,
                country: pagamento.cartao.pais,
              },
            },
          },
        };

  return chamar<Pedido>('/orders', {
    method: 'POST',
    idempotencia: `${reserva.codigo}-${pagamento.metodo}-${reserva.historico.length}`,
    body: JSON.stringify({
      code: reserva.codigo,
      customer: {
        name: cliente.nome,
        email: cliente.email,
        type: 'individual',
        document: documento,
        document_type: cliente.documentoTipo === 'cpf' ? 'CPF' : 'PASSPORT',
        phones: { mobile_phone: telefonePagarme(cliente.telefone) },
      },
      items: itens.map((i) => ({
        amount: i.unitarioCentavos,
        description: i.descricao.slice(0, 250),
        quantity: i.quantidade,
        code: i.codigo,
      })),
      payments: [{ ...pagamentoPagarme, amount: reserva.totalCentavos }],
      metadata: { voucher: reserva.codigo, passeio: reserva.passeio.slug, data: reserva.data },
    }),
  });
}

export function obterPedido(id: string): Promise<Pedido> {
  return chamar<Pedido>(`/orders/${encodeURIComponent(id)}`);
}

/** Traduz o pedido da Pagar.me para o status da reserva e os dados de pagamento. */
export function interpretarPedido(pedido: Pedido): {
  status: StatusReserva;
  pixCopiaECola?: string;
  pixExpiraEm?: string;
  cartaoFinal?: string;
  cartaoBandeira?: string;
  motivo?: string;
  pagoEm?: string;
} {
  const cobranca = pedido.charges?.[0];
  const tx = cobranca?.last_transaction;
  const extra = {
    pixCopiaECola: tx?.qr_code,
    pixExpiraEm: tx?.expires_at,
    cartaoFinal: tx?.card?.last_four_digits,
    cartaoBandeira: tx?.card?.brand,
    motivo:
      tx?.acquirer_message ||
      tx?.antifraud_response?.return_message ||
      tx?.gateway_response?.errors
        ?.map((e) => e.message)
        .filter(Boolean)
        .join('; ') ||
      undefined,
    pagoEm: cobranca?.paid_at,
  };

  if (cobranca?.status === 'refunded' || cobranca?.status === 'chargedback') return { status: 'reembolsado', ...extra };
  if (pedido.status === 'paid' || cobranca?.status === 'paid' || cobranca?.status === 'overpaid') return { status: 'pago', ...extra };
  if (pedido.status === 'failed' || cobranca?.status === 'failed') return { status: 'recusado', ...extra };
  if (pedido.status === 'canceled' || cobranca?.status === 'canceled') {
    const expirou = tx?.expires_at && new Date(tx.expires_at).getTime() < Date.now();
    return { status: expirou ? 'expirado' : 'cancelado', ...extra };
  }
  if (tx?.expires_at && new Date(tx.expires_at).getTime() < Date.now() && cobranca?.payment_method === 'pix') {
    return { status: 'expirado', ...extra };
  }
  return { status: 'pendente', ...extra };
}
