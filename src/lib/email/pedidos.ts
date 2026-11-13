import 'server-only';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, rota, type Idioma } from '@/i18n/config';
import { formatarCifra } from '../cifra';
import { cotacaoDolar, textoDolar } from '../dolar';
import { mostrarWhatsApp } from '../formas-pagamento';
import { gerarVoucherPdf } from '../pdf-voucher';
import { provedorDaReserva, valorRecebido } from '../pedidos-painel';
import { paraPublico, statusDoVoucher } from '../reserva-publica';
import { atualizarReserva, obterPedido, obterReservaDoPedido, registrar, type Reserva } from '../reservas';
import { urlDoSite } from '../site';
import { formatarDataIso } from '../validacao';
import { linkWhatsApp } from '../whatsapp';
import { depoisDaResposta } from './depois';
import { emailLigado, enviarEmail, saiu, type Anexo } from './enviar';
import {
  emailLinkDoPedido,
  emailPagamentoAprovado,
  emailPedidoRecebido,
  emailPixVencido,
  type DadosDoPedido,
  type ItemDoPedido,
  type MensagemEmail,
  type SiteDoEmail,
  type ValorEmail,
} from './mensagens';

/**
 * Os e-mails de um pedido (Etapa 6): busca o pedido, monta o e-mail no idioma do cliente e envia pelo Resend.
 * - pedido-recebido: quando o pedido nasce (POST /api/pedido), no caminho do WhatsApp ou com o pagamento online
 *   esperando; não sai se o pedido já foi pago ou cancelado até a hora do envio.
 * - pagamento-aprovado: quando o pedido vira pago (pedidoPago, em src/lib/pagamento-stripe.ts, e "marcar como pago"
 *   no painel, nos pedidos do WhatsApp), com um voucher por item, o PDF de cada um anexado e o WhatsApp da equipe.
 * - pix-vencido: quando o Pix vence sem pagamento (o pedido vira expirado no webhook ou na consulta à Stripe).
 * - link-do-pedido: pedido na página "Consultar meu pedido".
 * Cada envio fica no histórico do pedido ("E-mail ao cliente: …"), e o mesmo e-mail não sai de novo quando o aviso
 * chega repetido (a linha no histórico e a chave de idempotência do Resend). Sem RESEND_API_KEY, nada sai e nada é
 * lido do banco. Nada aqui desfaz um pagamento: quem chama agenda com agendarEmailDoPedido, depois da resposta.
 */

export type TipoEmailDoPedido = 'pedido-recebido' | 'pagamento-aprovado' | 'pix-vencido' | 'link-do-pedido';

/** A linha do histórico de cada envio (o painel mostra, em português, para a equipe). */
export const MARCA_DO_EMAIL: Record<TipoEmailDoPedido, string> = {
  'pedido-recebido': 'E-mail ao cliente: pedido recebido',
  'pagamento-aprovado': 'E-mail ao cliente: pagamento aprovado, com os vouchers',
  'pix-vencido': 'E-mail ao cliente: Pix vencido',
  'link-do-pedido': 'E-mail ao cliente: link do pedido (pedido em "Consultar meu pedido")',
};

/** Os PDFs dos vouchers vão anexados até este tamanho somado; acima disso, o e-mail leva só os links. */
const MAXIMO_ANEXOS_BYTES = 5 * 1024 * 1024;

const mensagemDeErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** O e-mail ainda faz sentido no status em que o pedido está agora (o envio sai depois da resposta). */
function cabeNoStatus(tipo: TipoEmailDoPedido, r: Reserva): boolean {
  switch (tipo) {
    case 'pedido-recebido':
      return r.status === 'pendente' || r.status === 'aguardando_whatsapp';
    case 'pagamento-aprovado':
      return r.status === 'pago';
    case 'pix-vencido':
      return r.status === 'expirado' && r.pagamento.metodo === 'pix';
    case 'link-do-pedido':
      return true;
  }
}

/** Os vouchers do pedido, pelo código do pedido ou de um voucher, na ordem da viagem. */
async function vouchers(codigo: string): Promise<Reserva[]> {
  const r = await obterReservaDoPedido(codigo);
  if (!r) return [];
  if (!r.pedido) return [r];
  const todos = await obterPedido(r.pedido.codigo);
  return todos.length ? todos : [r];
}

export function siteDoEmail(): SiteDoEmail {
  const url = urlDoSite();
  return { url, logo: `${url}/logo/orla-nativa-emblema-512.png`, nome: EMPRESA.marca, dominio: EMPRESA.dominio };
}

/** O link privado do pedido: a página do pedido (vários itens) ou a do voucher (um item só), com o token. */
export function linkPrivado(idioma: Idioma, codigo: string, token: string, umItem: boolean): string {
  const pagina = umItem ? rota(idioma, `/reserva/${codigo}`) : rota(idioma, `/pedido/${codigo}`);
  return `${urlDoSite()}${pagina}?t=${encodeURIComponent(token)}`;
}

/** Os itens do pedido como o e-mail mostra; `comVouchers`: os vouchers pagos levam o link e o PDF. */
function itensDoEmail(lista: Reserva[], idioma: Idioma, comVouchers: boolean): ItemDoPedido[] {
  const d = dicionario(idioma);
  const intl = LOCALE_INTL[idioma];
  const dataHora = (data: string, hora?: string) => {
    const texto = formatarDataIso(data, intl);
    return hora ? fmt(d.horario.dataHora, { data: texto, hora }) : texto;
  };
  return lista.map((v) => {
    const p = paraPublico(v, idioma);
    const nome = p.transfer
      ? `${p.passeioNome}: ${p.transfer.ida.saida} → ${p.transfer.ida.destino}`
      : p.opcaoNome
        ? `${p.passeioNome} (${p.opcaoNome})`
        : p.passeioNome;
    const volta = p.transfer?.volta;
    const linhas = [
      dataHora(p.data, p.transfer?.ida.hora ?? p.horario?.texto),
      ...(volta ? [fmt(d.carrinho.volta, { quando: dataHora(volta.data, volta.hora) })] : []),
      p.pessoasTexto,
    ];
    const t = encodeURIComponent(v.token);
    const voucher =
      comVouchers && statusDoVoucher(v) === 'pago'
        ? {
            codigo: v.codigo,
            link: `${urlDoSite()}${rota(idioma, `/reserva/${v.codigo}`)}?t=${t}`,
            pdf: `${urlDoSite()}/api/voucher/${v.codigo}?t=${t}`,
          }
        : undefined;
    return { nome, linhas, ...(voucher ? { voucher } : {}) };
  });
}

/** Um valor em reais no idioma, com o aproximado em dólar em espanhol e inglês (quando há cotação). */
function valorNoIdioma(centavos: number, idioma: Idioma, taxa: number | null): ValorEmail {
  const intl = LOCALE_INTL[idioma];
  const dolar = idioma === 'pt' ? '' : textoDolar(centavos, taxa, dicionario(idioma).preco.dolar, intl);
  return { valor: formatarCifra(centavos, intl), ...(dolar ? { dolar } : {}) };
}

/** Os PDFs dos vouchers pagos, se couberem; qualquer falha deixa o e-mail só com os links. */
async function anexosDosVouchers(lista: Reserva[]): Promise<Anexo[]> {
  try {
    const anexos: Anexo[] = [];
    let total = 0;
    for (const v of lista) {
      if (statusDoVoucher(v) !== 'pago') continue;
      const link = `${urlDoSite()}${rota(v.idioma, `/reserva/${v.codigo}`)}?t=${encodeURIComponent(v.token)}`;
      const conteudo = await gerarVoucherPdf(v, link);
      total += conteudo.byteLength;
      if (total > MAXIMO_ANEXOS_BYTES) return [];
      anexos.push({ nome: `voucher-${v.codigo}.pdf`, conteudo });
    }
    return anexos;
  } catch (e) {
    console.error(`[email] os PDFs dos vouchers não puderam ser gerados: ${mensagemDeErro(e)}`);
    return [];
  }
}

/** Grava a linha do envio no histórico do pedido (uma vez só, menos o link do pedido, que pode ser pedido de novo). */
async function anotar(codigo: string, evento: string, repetivel = false): Promise<void> {
  await atualizarReserva(codigo, (r) =>
    !repetivel && r.historico.some((h) => h.evento.startsWith(evento)) ? null : registrar(r, evento),
  ).catch((e) => console.error(`[email] o envio não ficou no histórico do pedido ${codigo}: ${mensagemDeErro(e)}`));
}

export interface OpcoesDoEmailDoPedido {
  /** No Pix vencido: a sessão que venceu (um e-mail por sessão). */
  sessaoId?: string;
  /** O idioma do e-mail, quando não é o do pedido (a consulta pede no idioma da página). */
  idioma?: Idioma;
}

/** Busca o pedido, monta e envia o e-mail. Não lança: as falhas ficam no registro do servidor (e, no pago, no histórico). */
export async function enviarEmailDoPedido(tipo: TipoEmailDoPedido, codigo: string, opcoes: OpcoesDoEmailDoPedido = {}): Promise<void> {
  if (!emailLigado()) {
    console.log(`[email] desligado (sem RESEND_API_KEY): ${tipo} ${codigo}`);
    return;
  }
  const lista = await vouchers(codigo);
  const r = lista[0];
  if (!r) return;
  const pedido = r.pedido?.codigo ?? r.codigo;
  if (!cabeNoStatus(tipo, r)) {
    console.log(`[email] ${tipo} ${pedido}: não enviado (o pedido está ${r.status})`);
    return;
  }
  const sessao = opcoes.sessaoId ?? r.pagamentoExternoId ?? '';
  const marca = tipo === 'pix-vencido' ? `${MARCA_DO_EMAIL[tipo]} (${sessao})` : MARCA_DO_EMAIL[tipo];
  if (tipo !== 'link-do-pedido' && r.historico.some((h) => h.evento.startsWith(marca))) return;

  const idioma = opcoes.idioma ?? r.idioma;
  const taxa = idioma === 'pt' ? null : await cotacaoDolar().catch(() => null);
  const totalCartao = r.pedido?.totalCentavos ?? r.totalCentavos;
  const totalPix = (r.pedido ? r.pedido.totalPixCentavos : r.totalPixCentavos) ?? totalCartao;
  const base: DadosDoPedido = {
    idioma,
    nome: r.cliente.nome,
    codigo: pedido,
    linkPedido: linkPrivado(idioma, pedido, r.token, lista.length === 1 && !r.pedido),
    itens: itensDoEmail(lista, idioma, tipo === 'pagamento-aprovado' || tipo === 'link-do-pedido'),
    site: siteDoEmail(),
  };
  const ambos = { pix: valorNoIdioma(totalPix, idioma, taxa), cartao: valorNoIdioma(totalCartao, idioma, taxa) };

  let mensagem: MensagemEmail;
  let anexos: Anexo[] = [];
  let chave: string;
  switch (tipo) {
    case 'pedido-recebido': {
      const online = provedorDaReserva(r) === 'stripe';
      const forma = r.pagamento.metodo;
      const totais = !online ? ambos : forma === 'pix' ? { pix: ambos.pix } : { cartao: ambos.cartao };
      mensagem = emailPedidoRecebido({ ...base, caminho: online ? 'online' : 'whatsapp', totais });
      chave = `pedido-recebido/${pedido}`;
      break;
    }
    case 'pagamento-aprovado': {
      anexos = await anexosDosVouchers(lista);
      const recebido = lista.reduce((soma, v) => soma + valorRecebido(v), 0);
      const forma = r.pagamento.metodo === 'whatsapp' ? undefined : r.pagamento.metodo;
      const whatsapp = mostrarWhatsApp(r.status) ? linkWhatsApp(`${dicionario(idioma).contato.msg} (${pedido})`) : undefined;
      mensagem = emailPagamentoAprovado({
        ...base,
        total: valorNoIdioma(recebido, idioma, taxa),
        forma,
        anexos: anexos.length > 0,
        whatsapp,
      });
      chave = `pagamento-aprovado/${pedido}`;
      break;
    }
    case 'pix-vencido':
      mensagem = emailPixVencido({ ...base, totais: ambos });
      chave = `pix-vencido/${sessao || pedido}`;
      break;
    case 'link-do-pedido':
      mensagem = emailLinkDoPedido(base);
      // o mesmo pedido de link, repetido em 10 minutos, sai uma vez só
      chave = `link-do-pedido/${pedido}/${Math.floor(Date.now() / 600_000)}`;
      break;
  }

  const resultado = await enviarEmail({
    tipo,
    referencia: pedido,
    para: r.cliente.email,
    assunto: mensagem.assunto,
    html: mensagem.html,
    texto: mensagem.texto,
    anexos,
    chave,
  });
  if (saiu(resultado)) {
    await anotar(r.codigo, marca, tipo === 'link-do-pedido');
  } else if (!resultado.enviado && tipo === 'pagamento-aprovado' && resultado.motivo !== 'desligado') {
    // o e-mail com os vouchers é o que mais importa: a equipe vê no painel e manda o link por outro caminho
    await anotar(r.codigo, `Aviso: o e-mail do pagamento aprovado não saiu (${resultado.motivo}): mandar ao cliente o link do pedido`);
  }
}

/** Agenda o e-mail para depois da resposta (o webhook e as rotas respondem na hora). */
export function agendarEmailDoPedido(tipo: TipoEmailDoPedido, codigo: string, opcoes: OpcoesDoEmailDoPedido = {}): void {
  depoisDaResposta(`${tipo} ${codigo}`, () => enviarEmailDoPedido(tipo, codigo, opcoes));
}
