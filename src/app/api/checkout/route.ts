import { NextResponse } from 'next/server';
import { z } from 'zod';
import { obterPasseio } from '@/data/passeios';
import { IDIOMAS } from '@/i18n/config';
import { criarPedido, ErroPagarme, interpretarPedido, pagarmeConfigurado } from '@/lib/pagarme';
import { calcularOrcamento, custoParceiroCentavos } from '@/lib/precos';
import { atualizarReserva, criarReserva, registrar } from '@/lib/reservas';
import {
  CIDADES_HOSPEDAGEM,
  cpfValido,
  dataPasseioValida,
  emailValido,
  passaporteValido,
  soDigitos,
  telefoneValido,
} from '@/lib/validacao';

export const runtime = 'nodejs';
export const maxDuration = 30;

const texto = (max: number) => z.string().trim().min(1).max(max);

const Esquema = z.object({
  idioma: z.enum(IDIOMAS),
  slug: z.string().max(80),
  data: z.string(),
  adultos: z.number().int().min(1).max(30),
  criancas: z.number().int().min(0).max(30),
  cliente: z.object({
    nome: texto(120),
    email: texto(160),
    ddi: z.string().max(4),
    telefone: z.string().max(24),
    documentoTipo: z.enum(['cpf', 'passaporte']),
    documento: texto(24),
  }),
  hospedagem: z.object({
    cidade: z.enum(CIDADES_HOSPEDAGEM),
    hotel: texto(120),
  }),
  observacoes: z.string().trim().max(600).optional().default(''),
  aceite: z.literal(true),
  pagamento: z.discriminatedUnion('metodo', [
    z.object({ metodo: z.literal('pix') }),
    z.object({ metodo: z.literal('whatsapp') }),
    z.object({
      metodo: z.literal('cartao'),
      token: z.string().min(5).max(120),
      cobranca: z.object({
        pais: z.string().length(2),
        cep: texto(16),
        endereco: texto(120),
        bairro: z.string().trim().max(80).optional().default(''),
        cidade: texto(80),
        estado: texto(40),
      }),
    }),
  ]),
  /** Campo-isca contra robôs: precisa vir vazio. */
  site: z.string().max(0).optional(),
});

function erro(campo: string, status = 400) {
  return NextResponse.json({ ok: false, erro: campo }, { status });
}

export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return erro('json');
  }
  const r = Esquema.safeParse(corpo);
  if (!r.success) {
    const campo = r.error.issues[0]?.path.join('.') || 'dados';
    return erro(campo);
  }
  const e = r.data;

  const passeio = obterPasseio(e.slug);
  if (!passeio) return erro('slug');
  if (!dataPasseioValida(e.data)) return erro('data');
  if (!emailValido(e.cliente.email)) return erro('cliente.email');
  if (!telefoneValido(e.cliente.ddi, e.cliente.telefone)) return erro('cliente.telefone');
  if (e.cliente.documentoTipo === 'cpf' ? !cpfValido(e.cliente.documento) : !passaporteValido(e.cliente.documento)) {
    return erro('cliente.documento');
  }

  const orc = calcularOrcamento(passeio, e.adultos, e.criancas);
  if (orc.totalCentavos <= 0) return erro('total');

  const online = pagarmeConfigurado() && e.pagamento.metodo !== 'whatsapp';
  const metodo = online ? e.pagamento.metodo : 'whatsapp';

  let reserva;
  try {
    reserva = await criarReserva({
      idioma: e.idioma,
      status: online ? 'pendente' : 'aguardando_whatsapp',
      passeio: { slug: passeio.slug, nome: passeio.nome.pt, cidade: passeio.cidade, unidade: passeio.unidade },
      data: e.data,
      adultos: e.adultos,
      criancas: e.criancas,
      unidades: orc.unidades,
      totalCentavos: orc.totalCentavos,
      custoParceiroCentavos: custoParceiroCentavos(passeio, e.adultos, e.criancas),
      cliente: {
        nome: e.cliente.nome,
        email: e.cliente.email.toLowerCase(),
        telefone: `+${soDigitos(e.cliente.ddi)} ${soDigitos(e.cliente.telefone)}`,
        documentoTipo: e.cliente.documentoTipo,
        documento: e.cliente.documentoTipo === 'cpf' ? soDigitos(e.cliente.documento) : e.cliente.documento.toUpperCase(),
      },
      hospedagem: { cidade: e.hospedagem.cidade, hotel: e.hospedagem.hotel },
      observacoes: e.observacoes || undefined,
      pagamento: { metodo },
    });
  } catch (err) {
    console.error('[checkout] falha ao gravar reserva', err);
    return erro('banco', 503);
  }

  if (!online) {
    return NextResponse.json({ ok: true, codigo: reserva.codigo, token: reserva.token, status: reserva.status });
  }

  // descrição interna (aparece no painel da Pagar.me), sempre em português
  const nomePasseio = passeio.nome.pt;
  const unidade = passeio.unidade === 'veiculo' ? 'veículo' : 'embarcação';
  const itens = orc.linhas.map((l) => ({
    descricao:
      l.tipo === 'crianca'
        ? `${nomePasseio} (criança)`
        : l.tipo === 'unidade'
          ? `${nomePasseio} (por ${unidade})`
          : `${nomePasseio} (adulto)`,
    quantidade: l.quantidade,
    unitarioCentavos: l.unitarioCentavos,
    codigo: `${passeio.slug}-${l.tipo}`,
  }));

  try {
    const pedido = await criarPedido(
      reserva,
      itens,
      e.pagamento.metodo === 'cartao'
        ? { metodo: 'cartao', cartao: { token: e.pagamento.token, ...e.pagamento.cobranca } }
        : { metodo: 'pix' },
    );
    const info = interpretarPedido(pedido);
    const atualizada = await atualizarReserva(reserva.codigo, (res) => {
      res.pagamento.pedidoId = pedido.id;
      res.pagamento.pixCopiaECola = info.pixCopiaECola;
      res.pagamento.pixExpiraEm = info.pixExpiraEm;
      res.pagamento.cartaoFinal = info.cartaoFinal;
      res.pagamento.cartaoBandeira = info.cartaoBandeira;
      if (info.status === 'recusado') res.pagamento.motivo = info.motivo;
      if (info.status === 'pago') res.pagamento.pagoEm = info.pagoEm ?? new Date().toISOString();
      res.status = info.status === 'pago' || info.status === 'recusado' ? info.status : 'pendente';
      return registrar(res, `Pedido ${pedido.id} criado na Pagar.me (${metodo}): ${info.status}`);
    });
    const final = atualizada ?? reserva;
    if (final.status === 'recusado') {
      return NextResponse.json({ ok: false, erro: 'recusado', codigo: final.codigo }, { status: 402 });
    }
    return NextResponse.json({ ok: true, codigo: final.codigo, token: final.token, status: final.status });
  } catch (err) {
    const msg = err instanceof ErroPagarme ? `${err.status} ${err.message}` : String(err);
    console.error('[checkout] erro Pagar.me', msg, err instanceof ErroPagarme ? JSON.stringify(err.detalhes) : '');
    await atualizarReserva(reserva.codigo, (res) => {
      res.status = 'recusado';
      res.pagamento.motivo = msg.slice(0, 300);
      return registrar(res, 'Falha ao criar o pedido na Pagar.me');
    }).catch(() => null);
    const recusado = err instanceof ErroPagarme && err.status >= 400 && err.status < 500;
    return NextResponse.json(
      { ok: false, erro: recusado ? 'recusado' : 'pagamento', codigo: reserva.codigo },
      { status: recusado ? 402 : 502 },
    );
  }
}
