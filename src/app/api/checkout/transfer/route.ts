import { NextResponse } from 'next/server';
import { z } from 'zod';
import { IDS_LUGARES, LUGARES, cabeNoVeiculo, precoTrecho, primeiroDiaTransfer, type IdLugar } from '@/data/transfer';
import { IDIOMAS } from '@/i18n/config';
import { criarReserva, type TrechoTransfer } from '@/lib/reservas';
import { emailValido, hojeEmBuzios, soDigitos, somarDias, telefoneValido } from '@/lib/validacao';

export const runtime = 'nodejs';
export const maxDuration = 30;

const texto = (max: number) => z.string().trim().min(1).max(max);
const quantidade = z.number().int().min(0).max(40);

const Ponta = z.object({
  lugar: z.enum(IDS_LUGARES as [IdLugar, ...IdLugar[]]),
  endereco: z.string().trim().max(160).optional().default(''),
});
const Trecho = z.object({
  saida: Ponta,
  destino: Ponta,
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  voo: z.string().trim().max(12).optional().default(''),
});

const Esquema = z.object({
  idioma: z.enum(IDIOMAS),
  veiculo: z.enum(['carro', 'van']),
  ida: Trecho,
  volta: Trecho.optional(),
  passageiros: z.number().int().min(1).max(17),
  malas: z.object({ grandes: quantidade, medias: quantidade, mao: quantidade }),
  /** A idade de cada criança que vai de cadeirinha ou assento de elevação. */
  cadeirinhas: z.array(z.number().int().min(0).max(12)).max(17).optional().default([]),
  cliente: z.object({
    nome: texto(120),
    email: texto(160),
    ddi: z.string().max(4),
    telefone: z.string().max(24),
  }),
  observacoes: z.string().trim().max(600).optional().default(''),
  aceite: z.literal(true),
  /** Campo-isca contra robôs: precisa vir vazio. */
  site: z.string().max(0).optional(),
});

function erro(campo: string, status = 400) {
  return NextResponse.json({ ok: false, erro: campo }, { status });
}

/** Fora dos aeroportos, cada ponta precisa do hotel, da pousada ou do endereço; "outra cidade" é sob cotação. */
const pontaValida = (p: z.infer<typeof Ponta>) => p.lugar !== 'outra-cidade' && (LUGARES[p.lugar].aeroporto || p.endereco.length >= 3);

/** Reserva de transfer privado. Por enquanto finaliza pelo WhatsApp; o pagamento online entra na Etapa 8. */
export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return erro('json');
  }
  const r = Esquema.safeParse(corpo);
  if (!r.success) return erro(r.error.issues[0]?.path.join('.') || 'dados');
  const e = r.data;

  const trechos = [e.ida, ...(e.volta ? [e.volta] : [])];
  if (!trechos.every((t) => pontaValida(t.saida) && pontaValida(t.destino))) return erro('trajeto');

  // transfer só a partir de amanhã, até 1 ano; a volta depois da ida
  const hoje = hojeEmBuzios();
  if (e.ida.data < primeiroDiaTransfer(hoje) || e.ida.data > somarDias(hoje, 366)) return erro('data');
  if (e.volta && `${e.volta.data}T${e.volta.hora}` <= `${e.ida.data}T${e.ida.hora}`) return erro('volta');

  if (!emailValido(e.cliente.email)) return erro('cliente.email');
  if (!telefoneValido(e.cliente.ddi, e.cliente.telefone)) return erro('cliente.telefone');
  if (e.cadeirinhas.length > e.passageiros) return erro('cadeirinhas');
  if (!cabeNoVeiculo(e.veiculo, e.passageiros, e.malas)) return erro('veiculo');

  // o preço vem sempre da tabela do servidor, trecho por trecho
  const precos = trechos.map((t) => precoTrecho(t.saida.lugar, t.destino.lugar, e.veiculo));
  if (precos.some((p) => p === null)) return erro('cotacao');
  const trecho = (t: z.infer<typeof Trecho>, preco: number): TrechoTransfer => ({
    saida: { lugar: t.saida.lugar, ...(t.saida.endereco && !LUGARES[t.saida.lugar].aeroporto ? { endereco: t.saida.endereco } : {}) },
    destino: {
      lugar: t.destino.lugar,
      ...(t.destino.endereco && !LUGARES[t.destino.lugar].aeroporto ? { endereco: t.destino.endereco } : {}),
    },
    data: t.data,
    hora: t.hora,
    ...(t.voo ? { voo: t.voo.toUpperCase() } : {}),
    precoCentavos: preco * 100,
  });
  const centavos = (precos as number[]).map((p) => p * 100);

  try {
    const reserva = await criarReserva({
      tipo: 'transfer',
      idioma: e.idioma,
      status: 'aguardando_whatsapp',
      data: e.ida.data,
      totalCentavos: centavos.reduce((s, c) => s + c, 0),
      // o transfer não tem preço de parceiro cadastrado
      custoParceiroCentavos: 0,
      cliente: {
        nome: e.cliente.nome,
        email: e.cliente.email.toLowerCase(),
        telefone: `+${soDigitos(e.cliente.ddi)} ${soDigitos(e.cliente.telefone)}`,
      },
      observacoes: e.observacoes || undefined,
      pagamento: { metodo: 'whatsapp' },
      transfer: {
        veiculo: e.veiculo,
        ida: trecho(e.ida, precos[0] as number),
        ...(e.volta ? { volta: trecho(e.volta, precos[1] as number) } : {}),
        passageiros: e.passageiros,
        malas: e.malas,
        cadeirinhas: e.cadeirinhas,
      },
    });
    return NextResponse.json({ ok: true, codigo: reserva.codigo, token: reserva.token, status: reserva.status });
  } catch (err) {
    console.error('[checkout/transfer] falha ao gravar reserva', err);
    return erro('banco', 503);
  }
}
