import 'server-only';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { LOCALE_INTL, fmt, rota, type Idioma } from '@/i18n/config';
import { formatarCifra } from '../cifra';
import { AVISO_DESISTENCIA, desistenciaPedida, prazoDoArrependimento } from '../desistencia';
import { cotacaoDolar, textoDolar } from '../dolar';
import {
  formasDoPagamento,
  inicioDoItem,
  mostrarWhatsApp,
  pagamentoOnlineNoAr,
  type FormaPagamento,
  type ItemPagavel,
} from '../formas-pagamento';
import { formatarHora } from '../horarios';
import { gerarVoucherPdf } from '../pdf-voucher';
import { provedorDaReserva, valorRecebido } from '../pedidos-painel';
import { itensPagaveis, paraPublico, statusDoVoucher } from '../reserva-publica';
import { atualizarReserva, obterPedido, obterReservaDoPedido, registrar, type Reserva } from '../reservas';
import { urlDoSite } from '../site';
import { formatarDataIso } from '../validacao';
import { linkWhatsApp } from '../whatsapp';
import { enderecoCabeNoDia } from './cota';
import { depoisDaResposta } from './depois';
import { emailLigado, enviarEmail, responderPara, saiu, type Anexo } from './enviar';
import { AVISO_EMAIL_PAGO_SAINDO, MARCA_DO_AVISO_A_EQUIPE, MARCA_DO_EMAIL, type TipoEmailDoPedido } from './marcas';
import {
  emailAvisoDaDesistencia,
  emailDesistenciaRecebida,
  emailLinkDoPedido,
  emailPagamentoAprovado,
  emailPedidoRecebido,
  emailPixVencido,
  type DadosDoPedido,
  type ItemDoPedido,
  type MensagemEmail,
  type SiteDoEmail,
  type TotaisDasFormas,
  type ValorEmail,
} from './mensagens';

export { MARCA_DO_EMAIL, type TipoEmailDoPedido } from './marcas';

/**
 * Os e-mails de um pedido (Etapa 6): busca o pedido, monta o e-mail no idioma do cliente e envia pelo Resend.
 * - pedido-recebido: quando o pedido nasce (POST /api/pedido), no caminho do WhatsApp ou com o pagamento online
 *   esperando; não sai se o pedido já foi pago ou cancelado até a hora do envio, nem passando de 3 no dia para o mesmo
 *   endereço (src/lib/email/cota.ts).
 * - pagamento-aprovado: quando o pedido vira pago (pedidoPago, em src/lib/pagamento-stripe.ts, e "marcar como pago"
 *   no painel, nos pedidos do WhatsApp), com um voucher por item, o PDF de cada um anexado e o WhatsApp da equipe. Antes
 *   de enviar, fica no histórico o aviso de que ele está saindo (AVISO_EMAIL_PAGO_SAINDO): se a função for cortada no
 *   meio ou o envio falhar, o painel destaca.
 * - pix-vencido: quando o Pix vence sem pagamento (o pedido vira expirado no webhook ou na consulta à Stripe), com os
 *   totais só das formas que ainda valem para o pedido; sem nenhuma, não sai (não há como pagar de novo).
 * - link-do-pedido: pedido na página "Consultar meu pedido".
 * - desistencia-recebida: a confirmação do pedido de desistência pelo site, com a data e a hora em que chegou; junto,
 *   o aviso à equipe (enviarAvisoDaDesistencia).
 * Cada envio fica no histórico do pedido ("E-mail ao cliente: …"), e o mesmo e-mail não sai de novo quando o aviso
 * chega repetido (a linha no histórico e a chave de idempotência do Resend). Sem RESEND_API_KEY, nada sai e nada é
 * lido do banco. Nada aqui desfaz um pagamento: quem chama agenda com agendarEmailDoPedido, depois da resposta.
 */

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
    case 'desistencia-recebida':
      return desistenciaPedida(r);
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
export function valorNoIdioma(centavos: number, idioma: Idioma, taxa: number | null): ValorEmail {
  const intl = LOCALE_INTL[idioma];
  const dolar = idioma === 'pt' ? '' : textoDolar(centavos, taxa, dicionario(idioma).preco.dolar, intl);
  return { valor: formatarCifra(centavos, intl), ...(dolar ? { dolar } : {}) };
}

/** Só os totais das formas que valem. */
export function totaisQueValem(formas: readonly FormaPagamento[], ambos: Required<TotaisDasFormas>): TotaisDasFormas {
  return { ...(formas.includes('pix') ? { pix: ambos.pix } : {}), ...(formas.includes('cartao') ? { cartao: ambos.cartao } : {}) };
}

/**
 * As formas cujo preço um e-mail com o carrinho (o lembrete) mostra: com o pagamento online no ar, as que o checkout
 * ofereceria agora (o Pix só no prazo e no limite dele, src/lib/formas-pagamento.ts); no caminho do WhatsApp, as duas,
 * como na tela.
 */
export async function formasDoCarrinho(itens: ItemPagavel[], agora: Date): Promise<FormaPagamento[]> {
  if (!pagamentoOnlineNoAr()) return ['pix', 'cartao'];
  return (await formasDoPagamento(itens, agora, { admin: false })).formas;
}

/**
 * Uma data e hora no idioma, no horário de Brasília: "13 de novembro de 2026 às 14:32", "13 de noviembre de 2026 a las
 * 14:32" (24 horas, como se lê no Brasil, na Argentina e no Chile), "November 13, 2026 at 2:32 PM".
 */
const quandoNoIdioma = (iso: string, idioma: Idioma) =>
  new Intl.DateTimeFormat(LOCALE_INTL[idioma], {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
    ...(idioma === 'en' ? {} : { hourCycle: 'h23' as const }),
  }).format(new Date(iso));

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
  // o "pedido recebido" sai para o endereço que a pessoa digitou, sem confirmação: no máximo 3 por endereço por dia
  if (tipo === 'pedido-recebido' && !(await enderecoCabeNoDia(r.cliente.email))) {
    console.log(`[email] ${tipo} ${pedido}: não enviado (limite do dia para este endereço)`);
    return;
  }

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
      // antes de tudo, o aviso de que o e-mail está saindo: se a função for cortada no meio, ele fica no histórico
      await anotar(r.codigo, AVISO_EMAIL_PAGO_SAINDO);
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
    case 'pix-vencido': {
      // os totais só das formas que ainda valem para o pedido (a mesma regra da página do pedido: o Pix até 2 horas
      // antes do primeiro serviço e dentro do limite; o cartão até 30 minutos antes); sem nenhuma, não há o que pagar
      const { formas } = await formasDoPagamento(itensPagaveis(lista), new Date(), { admin: true });
      if (!formas.length) {
        console.log(`[email] ${tipo} ${pedido}: não enviado (nenhuma forma de pagamento vale mais para o pedido)`);
        return;
      }
      mensagem = emailPixVencido({ ...base, totais: totaisQueValem(formas, ambos) });
      chave = `pix-vencido/${sessao || pedido}`;
      break;
    }
    case 'link-do-pedido':
      mensagem = emailLinkDoPedido(base);
      // o mesmo pedido de link, repetido em 10 minutos, sai uma vez só
      chave = `link-do-pedido/${pedido}/${Math.floor(Date.now() / 600_000)}`;
      break;
    case 'desistencia-recebida': {
      // a data e a hora são as da linha gravada no histórico: é o recebimento que o e-mail confirma
      const linha = r.historico.find((h) => h.evento.startsWith(AVISO_DESISTENCIA));
      mensagem = emailDesistenciaRecebida({ ...base, quando: quandoNoIdioma(linha?.em ?? new Date().toISOString(), idioma) });
      chave = `desistencia-recebida/${pedido}`;
      break;
    }
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

/** O primeiro serviço do pedido, para a equipe: "sáb., 14 nov. 2026 às 09h00" (os itens devolvidos sozinhos não contam). */
function primeiroServico(lista: Reserva[]): string {
  const ativos = lista.filter((v) => v.statusItem !== 'cancelado' && v.statusItem !== 'reembolsado');
  const [primeiro] = itensPagaveis(ativos.length ? ativos : lista)
    .map(inicioDoItem)
    .sort((a, b) => `${a.data} ${a.hora}`.localeCompare(`${b.data} ${b.hora}`));
  return primeiro ? `${formatarDataIso(primeiro.data, 'pt-BR')} às ${formatarHora(primeiro.hora, 'pt')}` : '—';
}

/**
 * O aviso do pedido de desistência para a equipe, no e-mail de resposta (EMAIL_RESPOSTA; padrão, o da empresa): o
 * código, quando chegou, se está dentro dos 7 dias, o primeiro serviço, o motivo e o link do pedido no painel. Uma vez
 * por pedido (a linha MARCA_DO_AVISO_A_EQUIPE no histórico e a chave de idempotência). Sem a chave do Resend, não sai:
 * a faixa do topo do painel continua contando o pedido.
 */
export async function enviarAvisoDaDesistencia(codigo: string, motivo: string): Promise<void> {
  if (!emailLigado()) {
    console.log(`[email] desligado (sem RESEND_API_KEY): desistencia-equipe ${codigo}`);
    return;
  }
  const lista = await vouchers(codigo);
  const r = lista[0];
  if (!r) return;
  const pedido = r.pedido?.codigo ?? r.codigo;
  const linha = r.historico.find((h) => h.evento.startsWith(AVISO_DESISTENCIA));
  if (!linha || r.historico.some((h) => h.evento.startsWith(MARCA_DO_AVISO_A_EQUIPE))) return;
  const mensagem = emailAvisoDaDesistencia({
    codigo: pedido,
    quando: quandoNoIdioma(linha.em, 'pt'),
    prazo: prazoDoArrependimento(r.pagamento.pagoEm ?? r.criadaEm, new Date(linha.em)),
    primeiroServico: primeiroServico(lista),
    motivo,
    linkPainel: `${urlDoSite()}/admin?q=${encodeURIComponent(pedido)}`,
    site: siteDoEmail(),
  });
  const resultado = await enviarEmail({
    tipo: 'desistencia-equipe',
    referencia: pedido,
    para: responderPara(),
    assunto: mensagem.assunto,
    html: mensagem.html,
    texto: mensagem.texto,
    chave: `desistencia-equipe/${pedido}`,
  });
  if (saiu(resultado)) await anotar(r.codigo, MARCA_DO_AVISO_A_EQUIPE);
}

/**
 * Os dois e-mails do pedido de desistência, depois da resposta: a confirmação ao cliente, no e-mail do pedido, e o aviso
 * à equipe. `motivo` já vem limpo (limparMotivo).
 */
export function agendarAvisosDaDesistencia(codigo: string, motivo: string): void {
  // cada um na sua tarefa: a falha de um não segura o outro
  depoisDaResposta(`desistencia-recebida ${codigo}`, () => enviarEmailDoPedido('desistencia-recebida', codigo));
  depoisDaResposta(`desistencia-equipe ${codigo}`, () => enviarAvisoDaDesistencia(codigo, motivo));
}
