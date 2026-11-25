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
import { avisoDoPagamentoRetidoPorEmail, avisoDoReembolsoFalho, provedorDaReserva, recebidoDoPedido } from '../pedidos-painel';
import { itensPagaveis, paraPublico, statusDoVoucher } from '../reserva-publica';
import { atualizarReserva, obterPedido, obterReservaDoPedido, registrar, type Reserva } from '../reservas';
import { urlDoSite } from '../site';
import { stripe } from '../stripe';
import { formatarDataIso } from '../validacao';
import { linkWhatsApp } from '../whatsapp';
import { enderecoCabeNoDia } from './cota';
import { depoisDaResposta } from './depois';
import { enviarSeAlgumaFormaVale } from './pix-vencido';
import { emailLigado, enviarEmail, responderPara, saiu, type Anexo } from './enviar';
import {
  AVISO_EMAIL_PAGO_SAINDO,
  MARCA_DO_AVISO_A_EQUIPE,
  MARCA_DO_AVISO_DO_PEDIDO_PAGO,
  MARCA_DO_EMAIL,
  MARCA_DO_EMAIL_DO_CANCELAMENTO,
  avisoDoAvisoDoPedidoPagoQueNaoSaiu,
  avisoDoEmailDoCancelamentoQueNaoSaiu,
  avisoDoEmailDoReembolsoQueNaoSaiu,
  emailDoReembolsoJaSaiu,
  marcaDoAvisoDeReembolsoFalho,
  marcaDoAvisoDoPagamentoRetido,
  marcaDoEmailDoReembolso,
  type TipoEmailDoPedido,
} from './marcas';
import {
  avisoDoPedidoPagoSai,
  emailDoCancelamentoSai,
  linhaDoConcluidoQueFalta,
  motivoDoEnvioQueNaoSaiu,
  planoDoEmailDoReembolso,
  versaoParaMarcar,
} from './regras-dos-avisos';
import {
  emailAvisoDaDesistencia,
  emailAvisoDoPagamentoRetido,
  emailAvisoDoPedidoPago,
  emailAvisoDoReembolsoFalho,
  emailDesistenciaRecebida,
  emailLinkDoPedido,
  emailPagamentoAprovado,
  emailPedidoCancelado,
  emailPedidoRecebido,
  emailPixVencido,
  emailReembolso,
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
 * - reembolso-falho-equipe: só para a equipe, quando um reembolso falha na Stripe (enviarAvisoDoReembolsoFalho).
 * - pagamento-retido-equipe: só para a equipe, quando um pagamento chega para um pedido cancelado e fica parado na Stripe
 *   (enviarAvisoDoPagamentoRetido, Pacote 22).
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

  /** O envio pelo Resend e, quando sai, a linha no histórico; o pagamento aprovado que não sai fica como aviso no painel. */
  const despachar = async (email: MensagemEmail, chaveDoEnvio: string, arquivos: Anexo[] = []): Promise<void> => {
    const resultado = await enviarEmail({
      tipo,
      referencia: pedido,
      para: r.cliente.email,
      assunto: email.assunto,
      html: email.html,
      texto: email.texto,
      anexos: arquivos,
      chave: chaveDoEnvio,
    });
    if (saiu(resultado)) {
      await anotar(r.codigo, marca, tipo === 'link-do-pedido');
    } else if (!resultado.enviado && tipo === 'pagamento-aprovado' && resultado.motivo !== 'desligado') {
      // o e-mail com os vouchers é o que mais importa: a equipe vê no painel e manda o link por outro caminho
      await anotar(r.codigo, `Aviso: o e-mail do pagamento aprovado não saiu (${resultado.motivo}): mandar ao cliente o link do pedido`);
    }
  };

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
      // o que entrou: com um valor recebido pela Stripe diferente do esperado (Pacote 23), o que ela recebeu de verdade
      const recebido = recebidoDoPedido(lista);
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
      // antes do primeiro serviço e dentro do limite; o cartão até 30 minutos antes); sem nenhuma, não há o que pagar e
      // nada sai, também com o pagamento online desligado às pressas (enviarSeAlgumaFormaVale, ./pix-vencido.ts, que roda
      // em node nos testes com um envio de mentira)
      const enviado = await enviarSeAlgumaFormaVale(itensPagaveis(lista), new Date(), (formas) =>
        despachar(emailPixVencido({ ...base, totais: totaisQueValem(formas, ambos) }), `pix-vencido/${sessao || pedido}`),
      );
      if (!enviado) console.log(`[email] ${tipo} ${pedido}: não enviado (nenhuma forma de pagamento vale mais para o pedido)`);
      return;
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

  await despachar(mensagem, chave, anexos);
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

/**
 * O aviso à equipe (EMAIL_RESPOSTA) de um reembolso que a Stripe não conseguiu concluir (decisão do dono de 16/11): a
 * falha pode chegar semanas depois, quando ninguém está olhando o painel. Lido da linha que o webhook gravou no histórico
 * (avisoDoReembolsoFalho, src/lib/pedidos-painel.ts): o valor e o motivo em português, sem nenhum dado do cartão; na
 * contestação aberta com o reembolso a caminho, numa contestação aberta depois da falha e com o pedido já contestado na
 * hora de montar o e-mail, ele manda NÃO devolver por outro meio; com a contestação já perdida, não sai (o banco
 * devolveu). Um por reembolso (a linha marcaDoAvisoDeReembolsoFalho no histórico e a chave de idempotência); a devolução
 * falha de um pagamento repetido fica só no histórico. Sem a chave do Resend, não sai: a faixa do topo do painel
 * continua contando o pedido.
 */
export async function enviarAvisoDoReembolsoFalho(codigo: string, reembolsoId: string): Promise<void> {
  if (!emailLigado()) {
    console.log(`[email] desligado (sem RESEND_API_KEY): reembolso-falho-equipe ${codigo}`);
    return;
  }
  const lista = await vouchers(codigo);
  const r = lista[0];
  if (!r) return;
  const pedido = r.pedido?.codigo ?? r.codigo;
  // o status do pedido agora: já contestado, o e-mail manda não devolver por outro meio
  const aviso = avisoDoReembolsoFalho(r.historico, reembolsoId, r.status);
  if (!aviso) return;
  const mensagem = emailAvisoDoReembolsoFalho({
    codigo: pedido,
    valor: formatarCifra(aviso.centavos, 'pt-BR'),
    motivo: aviso.motivo,
    contestacao: aviso.contestacao,
    naoDizerOMotivo: aviso.naoDizerOMotivo,
    // Pacote 28 (achado B4): o cliente já recebeu o e-mail do site sobre este reembolso ("a caminho" ou "confirmado")
    clienteAvisado: emailDoReembolsoJaSaiu(r.historico, reembolsoId),
    linkPainel: `${urlDoSite()}/admin?q=${encodeURIComponent(pedido)}`,
    site: siteDoEmail(),
  });
  const resultado = await enviarEmail({
    tipo: 'reembolso-falho-equipe',
    referencia: pedido,
    para: responderPara(),
    assunto: mensagem.assunto,
    html: mensagem.html,
    texto: mensagem.texto,
    chave: `reembolso-falho-equipe/${reembolsoId}`,
  });
  if (saiu(resultado)) await anotar(r.codigo, marcaDoAvisoDeReembolsoFalho(reembolsoId));
}

/** Agenda o aviso à equipe do reembolso que falhou para depois da resposta (o webhook da Stripe responde na hora). */
export function agendarAvisoDoReembolsoFalho(codigo: string, reembolsoId: string): void {
  depoisDaResposta(`reembolso-falho-equipe ${codigo}`, () => enviarAvisoDoReembolsoFalho(codigo, reembolsoId));
}

/**
 * O aviso à equipe (EMAIL_RESPOSTA) de um pagamento que chegou para um pedido cancelado e ficou parado na Stripe (Pacote 22,
 * decisão do dono de 23/11/2026), com o mesmo cuidado do aviso do reembolso que falhou: lido do pedido gravado
 * (avisoDoPagamentoRetidoPorEmail, src/lib/pedidos-painel.ts), um por pagamento (a linha marcaDoAvisoDoPagamentoRetido no
 * histórico e a chave de idempotência `pagamento-retido-equipe/<pi_…>`), essencial na cota, e não sai se a equipe já
 * decidiu. Nenhum e-mail ao cliente agora. Sem a chave do Resend, não sai: a faixa do topo do painel continua contando o
 * pedido.
 */
export async function enviarAvisoDoPagamentoRetido(codigo: string, paymentIntentId: string): Promise<void> {
  if (!emailLigado()) {
    console.log(`[email] desligado (sem RESEND_API_KEY): pagamento-retido-equipe ${codigo}`);
    return;
  }
  const lista = await vouchers(codigo);
  const r = lista[0];
  if (!r) return;
  const pedido = r.pedido?.codigo ?? r.codigo;
  const aviso = avisoDoPagamentoRetidoPorEmail(r, paymentIntentId);
  if (!aviso) return;
  const mensagem = emailAvisoDoPagamentoRetido({
    codigo: pedido,
    valor: formatarCifra(aviso.centavos, 'pt-BR'),
    linkPainel: `${urlDoSite()}/admin?q=${encodeURIComponent(pedido)}`,
    site: siteDoEmail(),
  });
  const resultado = await enviarEmail({
    tipo: 'pagamento-retido-equipe',
    referencia: pedido,
    para: responderPara(),
    assunto: mensagem.assunto,
    html: mensagem.html,
    texto: mensagem.texto,
    chave: `pagamento-retido-equipe/${paymentIntentId}`,
  });
  if (saiu(resultado)) await anotar(r.codigo, marcaDoAvisoDoPagamentoRetido(paymentIntentId));
}

/** Agenda o aviso à equipe do pagamento parado para depois da resposta (o webhook da Stripe responde na hora). */
export function agendarAvisoDoPagamentoRetido(codigo: string, paymentIntentId: string): void {
  depoisDaResposta(`pagamento-retido-equipe ${codigo}`, () => enviarAvisoDoPagamentoRetido(codigo, paymentIntentId));
}

/* ------------------------------------------------------------------ */
/* Pacote 28: o reembolso, o pedido cancelado e o aviso do pedido pago  */

const idDoCampo = (v: string | { id: string } | null | undefined): string | null => (typeof v === 'string' ? v : (v?.id ?? null));

/**
 * O e-mail do reembolso ao cliente (Pacote 28), um por reembolso: relê o reembolso na Stripe (a verdade é ela) e o
 * pedido, e a regra (planoDoEmailDoReembolso, ./regras-dos-avisos.ts) decide se sai e em que versão: "confirmado" (já
 * concluído), "a caminho" (pendente, sem data) ou "concluído" (o que estava a caminho terminou, depois da linha do
 * refund.updated). Não sai para o reembolso que falhou ou foi cancelado (a equipe resolve), para a devolução de um
 * pagamento a mais, para o pedido contestado, nem para o reembolso de parte feito direto na Stripe num pedido de vários
 * itens enquanto a equipe não disser de qual voucher foi. A marca no histórico (marcaDoEmailDoReembolso) e a chave de
 * idempotência (`reembolso/<re_…>` ou `reembolso-concluido/<re_…>`) impedem o segundo e-mail do mesmo reembolso. Nunca
 * muda o pedido, além da marca. Sem a chave do Resend, nada sai e nada é lido.
 */
export async function enviarEmailDoReembolso(codigo: string, reembolsoId: string): Promise<void> {
  if (!emailLigado()) {
    console.log(`[email] desligado (sem RESEND_API_KEY): reembolso ${codigo}`);
    return;
  }
  let lista = await vouchers(codigo);
  let r = lista[0];
  if (!r) return;
  const pedido = r.pedido?.codigo ?? r.codigo;
  let re: Awaited<ReturnType<ReturnType<typeof stripe>['refunds']['retrieve']>>;
  try {
    re = await stripe().refunds.retrieve(reembolsoId);
  } catch (e) {
    // a Stripe não respondeu (o cliente dela já tenta de novo duas vezes): o e-mail não sai, e a equipe fica sabendo
    // pelo aviso no histórico (achado M1), que fecha sozinho se um envio seguinte deste reembolso sair
    console.error(`[email] reembolso ${pedido}: a releitura do reembolso na Stripe falhou (${mensagemDeErro(e)})`);
    await anotar(r.codigo, avisoDoEmailDoReembolsoQueNaoSaiu(reembolsoId, 'a Stripe não respondeu na hora de conferir o reembolso'));
    return;
  }
  // achado B5: o reembolso que estava pendente e já terminou ganha a linha do concluído antes da regra decidir a versão
  const concluido = linhaDoConcluidoQueFalta(
    lista.map((v) => v.historico),
    re,
  );
  if (concluido) {
    await atualizarReserva(r.codigo, (x) => (x.historico.some((h) => h.evento === concluido) ? null : registrar(x, concluido))).catch((e) =>
      console.error(`[email] reembolso ${pedido}: a linha do reembolso concluído não ficou no histórico (${mensagemDeErro(e)})`),
    );
    lista = await vouchers(codigo);
    r = lista[0] ?? r;
  }
  const plano = planoDoEmailDoReembolso(r, lista, {
    id: re.id,
    amount: re.amount,
    status: re.status,
    referencia: re.metadata?.referencia,
    paymentIntentId: idDoCampo(re.payment_intent),
  });
  if (!plano.sai) {
    console.log(`[email] reembolso ${pedido}: não enviado (${plano.motivo})`);
    return;
  }
  const idioma = r.idioma;
  const taxa = idioma === 'pt' ? null : await cotacaoDolar().catch(() => null);
  const alcance =
    plano.alcance.tipo === 'voucher'
      ? (() => {
          const codigoDoVoucher = plano.alcance.voucher;
          const v = lista.find((x) => x.codigo === codigoDoVoucher);
          const nome = v ? itensDoEmail([v], idioma, false)[0]?.nome : undefined;
          return { tipo: 'voucher' as const, voucher: nome ? `${codigoDoVoucher} (${nome})` : codigoDoVoucher };
        })()
      : plano.alcance;
  const valem = lista.filter((v) => plano.aindaValem.includes(v.codigo));
  const mensagem = emailReembolso({
    idioma,
    nome: r.cliente.nome,
    codigo: pedido,
    linkPedido: linkPrivado(idioma, pedido, r.token, lista.length === 1 && !r.pedido),
    // no pedido inteiro nada continua valendo; nos outros, os vouchers que seguem pagos, com os links
    itens: plano.alcance.tipo === 'pedido' ? [] : itensDoEmail(valem, idioma, true),
    site: siteDoEmail(),
    versao: plano.versao,
    valor: valorNoIdioma(plano.centavos, idioma, taxa),
    forma: plano.forma,
    alcance,
  });
  const tipo = plano.versao === 'concluido' ? 'reembolso-concluido' : 'reembolso';
  const resultado = await enviarEmail({
    tipo,
    referencia: pedido,
    para: r.cliente.email,
    assunto: mensagem.assunto,
    html: mensagem.html,
    texto: mensagem.texto,
    chave: `${tipo}/${re.id}`,
  });
  // a mesma chave já usada marca o "a caminho" (achado B3: versaoParaMarcar); o que não saiu vira aviso no painel (M1)
  if (saiu(resultado)) await anotar(r.codigo, marcaDoEmailDoReembolso(versaoParaMarcar(plano.versao, resultado), re.id));
  const motivo = motivoDoEnvioQueNaoSaiu(resultado);
  if (motivo) await anotar(r.codigo, avisoDoEmailDoReembolsoQueNaoSaiu(re.id, motivo, plano.versao));
}

/** Agenda o e-mail do reembolso para depois da resposta (o webhook e o painel respondem na hora). */
export function agendarEmailDoReembolso(codigo: string, reembolsoId: string): void {
  depoisDaResposta(`reembolso ${codigo}`, () => enviarEmailDoReembolso(codigo, reembolsoId));
}

/**
 * O e-mail "Pedido cancelado" ao cliente (Pacote 28), quando a equipe cancela no painel um pedido sem dinheiro a
 * devolver (emailDoCancelamentoSai, ./regras-dos-avisos.ts): o código, os itens, "Nada foi cobrado" no pedido que nunca foi
 * pago e o link da política de cancelamento, sem nenhuma opção de pedir estorno. Um por pedido (a marca e a chave
 * `pedido-cancelado/<pedido>`). Os cancelamentos automáticos do site não mandam este e-mail.
 */
export async function enviarEmailDoCancelamento(codigo: string): Promise<void> {
  if (!emailLigado()) {
    console.log(`[email] desligado (sem RESEND_API_KEY): pedido-cancelado ${codigo}`);
    return;
  }
  const lista = await vouchers(codigo);
  const r = lista[0];
  if (!r) return;
  const pedido = r.pedido?.codigo ?? r.codigo;
  const regra = emailDoCancelamentoSai(r);
  if (!regra.sai) {
    console.log(`[email] pedido-cancelado ${pedido}: não enviado (${regra.motivo})`);
    return;
  }
  const idioma = r.idioma;
  const mensagem = emailPedidoCancelado({
    idioma,
    nome: r.cliente.nome,
    codigo: pedido,
    linkPedido: linkPrivado(idioma, pedido, r.token, lista.length === 1 && !r.pedido),
    itens: itensDoEmail(lista, idioma, false),
    site: siteDoEmail(),
    nadaCobrado: regra.nadaCobrado,
    linkPolitica: `${urlDoSite()}${rota(idioma, '/politica-de-cancelamento')}`,
  });
  const resultado = await enviarEmail({
    tipo: 'pedido-cancelado',
    referencia: pedido,
    para: r.cliente.email,
    assunto: mensagem.assunto,
    html: mensagem.html,
    texto: mensagem.texto,
    chave: `pedido-cancelado/${pedido}`,
  });
  if (saiu(resultado)) await anotar(r.codigo, MARCA_DO_EMAIL_DO_CANCELAMENTO);
  const motivo = motivoDoEnvioQueNaoSaiu(resultado);
  if (motivo) await anotar(r.codigo, avisoDoEmailDoCancelamentoQueNaoSaiu(motivo));
}

/** Agenda o e-mail do pedido cancelado no painel para depois da resposta. */
export function agendarEmailDoCancelamento(codigo: string): void {
  depoisDaResposta(`pedido-cancelado ${codigo}`, () => enviarEmailDoCancelamento(codigo));
}

/**
 * O aviso à equipe (EMAIL_RESPOSTA) do pedido que ficou pago (Pacote 28): pela Stripe (pedidoPago, também na reativação
 * do pagamento parado), marcado como pago no painel, ou recuperado pelo agendamento do e-mail do pagamento que não saiu.
 * O código, os itens com as datas, o total que entrou (recebidoDoPedido), a forma e o link do painel; nenhum dado do
 * cartão nem do cliente. Um por pedido (a marca MARCA_DO_AVISO_DO_PEDIDO_PAGO e a chave `pedido-pago-equipe/<pedido>`),
 * só com o pedido ainda pago na hora do envio. Sem a chave do Resend, não sai.
 */
export async function enviarAvisoDoPedidoPago(codigo: string): Promise<void> {
  if (!emailLigado()) {
    console.log(`[email] desligado (sem RESEND_API_KEY): pedido-pago-equipe ${codigo}`);
    return;
  }
  const lista = await vouchers(codigo);
  const r = lista[0];
  if (!r || !avisoDoPedidoPagoSai(r)) return;
  const pedido = r.pedido?.codigo ?? r.codigo;
  const metodo = r.pagamento.metodo;
  const mensagem = emailAvisoDoPedidoPago({
    codigo: pedido,
    valor: formatarCifra(recebidoDoPedido(lista), 'pt-BR'),
    ...(metodo === 'pix' || metodo === 'cartao' ? { forma: metodo } : {}),
    origem: provedorDaReserva(r) === 'stripe' ? 'stripe' : 'painel',
    primeiroServico: primeiroServico(lista),
    itens: itensDoEmail(lista, 'pt', false),
    linkPainel: `${urlDoSite()}/admin?q=${encodeURIComponent(pedido)}`,
    site: siteDoEmail(),
  });
  const resultado = await enviarEmail({
    tipo: 'pedido-pago-equipe',
    referencia: pedido,
    para: responderPara(),
    assunto: mensagem.assunto,
    html: mensagem.html,
    texto: mensagem.texto,
    chave: `pedido-pago-equipe/${pedido}`,
  });
  if (saiu(resultado)) await anotar(r.codigo, MARCA_DO_AVISO_DO_PEDIDO_PAGO);
  const motivo = motivoDoEnvioQueNaoSaiu(resultado);
  if (motivo) await anotar(r.codigo, avisoDoAvisoDoPedidoPagoQueNaoSaiu(motivo));
}

/** Agenda o aviso à equipe do pedido pago para depois da resposta. */
export function agendarAvisoDoPedidoPago(codigo: string): void {
  depoisDaResposta(`pedido-pago-equipe ${codigo}`, () => enviarAvisoDoPedidoPago(codigo));
}
