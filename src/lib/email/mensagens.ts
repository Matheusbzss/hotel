// com a extensão, para os testes (node) acharem os arquivos sem o atalho "@/"
import { fmt, type Idioma } from '../../i18n/config.ts';
import { montarEmail, type ConteudoEmail, type ItemEmail, type LinhaTotal } from './modelo.ts';
import { textosEmail, type TextosEmail } from './textos.ts';

/**
 * Cada e-mail automático, montado a partir de dados já prontos (nomes, datas e valores no idioma do cliente, links
 * completos): quem busca o pedido no banco e formata é src/lib/email/pedidos.ts (pedidos) e
 * src/lib/carrinho-lembretes.ts (lembretes do carrinho). Sem rede nem banco: testado em tests/email.test.ts nos
 * quatro idiomas.
 */

export type TipoEmail =
  | 'pedido-recebido'
  | 'pagamento-aprovado'
  | 'pix-vencido'
  | 'link-do-pedido'
  | 'desistencia-recebida'
  | 'desistencia-equipe'
  | 'lembrete-1'
  | 'lembrete-2';

export interface MensagemEmail {
  assunto: string;
  html: string;
  texto: string;
}

/** O que todo e-mail mostra do site: o endereço, o emblema, o nome e o domínio. */
export interface SiteDoEmail {
  /** https://orlanativa.online, sem a barra no fim. */
  url: string;
  logo: string;
  nome: string;
  dominio: string;
}

/** Um valor em reais já formatado ("R$ 270,00") e, em espanhol e inglês, o aproximado em dólar. */
export interface ValorEmail {
  valor: string;
  dolar?: string;
}

/** Um item do pedido: o nome, as linhas de baixo (quando, a volta do transfer, quem vai) e, pago, o voucher. */
export interface ItemDoPedido {
  nome: string;
  linhas: string[];
  voucher?: { codigo: string; link: string; pdf: string };
}

export interface DadosDoPedido {
  idioma: Idioma;
  /** O nome que o cliente digitou; o e-mail usa só o primeiro nome. */
  nome: string;
  codigo: string;
  /** O link privado do pedido, com o token. */
  linkPedido: string;
  itens: ItemDoPedido[];
  site: SiteDoEmail;
}

/** Os totais nas duas formas, quando a forma ainda não está fechada. */
export interface TotaisDasFormas {
  pix?: ValorEmail;
  cartao?: ValorEmail;
}

/** "Maria Clara Souza" → "Maria". */
export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? '';

/** O tamanho máximo do primeiro nome na saudação. */
export const NOME_DA_SAUDACAO_MAXIMO = 30;

/**
 * O primeiro nome que pode ir na saudação, ou '' quando não serve: só letras (com acento), hífen e apóstrofo, até 30.
 * O nome é o que a pessoa digitou no checkout, e o e-mail sai pelo remetente oficial para o endereço que ela digitou:
 * sem esta regra, "https://site-do-golpe… Silva" virava "Olá, https://site-do-golpe…" (e o Gmail transforma o endereço
 * em link). Número, ponto, barra, arroba ou qualquer outro sinal: só a saudação, sem nome.
 */
export function nomeDaSaudacao(nome: string): string {
  const primeiro = primeiroNome(nome.normalize('NFC'));
  return primeiro.length <= NOME_DA_SAUDACAO_MAXIMO && /^\p{L}[\p{L}\p{M}'’-]*$/u.test(primeiro) ? primeiro : '';
}

const saudacao = (T: TextosEmail, nome: string): string => {
  const primeiro = nomeDaSaudacao(nome);
  return primeiro ? fmt(T.comum.ola, { nome: primeiro }) : T.comum.olaSemNome;
};

const linhaTotal = (rotulo: string, v: ValorEmail): LinhaTotal => ({ rotulo, valor: v.valor, ...(v.dolar ? { nota: v.dolar } : {}) });

function totaisDasFormas(T: TextosEmail, t: TotaisDasFormas): LinhaTotal[] {
  return [...(t.pix ? [linhaTotal(T.comum.totalNoPix, t.pix)] : []), ...(t.cartao ? [linhaTotal(T.comum.totalNoCartao, t.cartao)] : [])];
}

function itensDoPedido(T: TextosEmail, itens: ItemDoPedido[]): ItemEmail[] {
  return itens.map((i) => ({
    nome: i.nome,
    linhas: i.linhas,
    ...(i.voucher
      ? {
          voucher: {
            rotulo: T.comum.voucher,
            codigo: i.voucher.codigo,
            links: [
              { texto: T.comum.verVoucher, href: i.voucher.link },
              { texto: T.comum.baixarPdf, href: i.voucher.pdf },
            ],
          },
        }
      : {}),
  }));
}

/** A parte comum dos e-mails de um pedido: o código, o rodapé e o site. */
function basePedido(T: TextosEmail, d: DadosDoPedido): Pick<ConteudoEmail, 'idioma' | 'saudacao' | 'codigo' | 'rodape' | 'site'> {
  return {
    idioma: d.idioma,
    saudacao: saudacao(T, d.nome),
    codigo: { rotulo: T.comum.codigoPedido, valor: d.codigo },
    rodape: { linhas: [T.comum.duvidas, fmt(T.comum.rodapeMotivo, { site: d.site.dominio })] },
    site: d.site,
  };
}

function mensagem(conteudo: ConteudoEmail): MensagemEmail {
  return { assunto: conteudo.assunto, ...montarEmail(conteudo) };
}

/**
 * (1) Pedido recebido, com o link privado do pedido. Duas versões: o pedido que termina pelo WhatsApp (o pagamento
 * online desligado; o e-mail manda para a página do pedido, onde está o botão, e não traz o número) e o que espera o
 * pagamento online (cartão ou Pix pela Stripe).
 */
export function emailPedidoRecebido(d: DadosDoPedido & { caminho: 'whatsapp' | 'online'; totais: TotaisDasFormas }): MensagemEmail {
  const T = textosEmail(d.idioma);
  const R = T.pedidoRecebido;
  return mensagem({
    ...basePedido(T, d),
    assunto: fmt(R.assunto, { codigo: d.codigo }),
    preCabecalho: R.preCabecalho,
    titulo: R.titulo,
    paragrafos: [d.caminho === 'whatsapp' ? R.textoWhatsapp : R.textoOnline],
    tituloItens: R.itens,
    itens: itensDoPedido(T, d.itens),
    totais: totaisDasFormas(T, d.totais),
    botao: { texto: T.comum.abrirPedido, href: d.linkPedido, alternativo: T.comum.linkAlternativo },
    depois: d.caminho === 'online' ? [R.notaOnline] : [],
  });
}

/**
 * (2) Pagamento aprovado (cartão ou Pix pela Stripe, ou marcado como pago no painel num pedido do WhatsApp): um
 * voucher por item, cada um com o link e o PDF, o total pago e o link do pedido. O WhatsApp da equipe entra aqui,
 * porque o pagamento já foi aprovado.
 */
export function emailPagamentoAprovado(
  d: DadosDoPedido & {
    total: ValorEmail;
    forma?: 'pix' | 'cartao';
    /** Os PDFs dos vouchers foram anexados. */
    anexos: boolean;
    /** O link do WhatsApp da equipe, com o código do pedido já escrito. */
    whatsapp?: string;
  },
): MensagemEmail {
  const T = textosEmail(d.idioma);
  const A = T.pagamentoAprovado;
  const forma = d.forma === 'pix' ? T.comum.formaPix : d.forma === 'cartao' ? T.comum.formaCartao : '';
  return mensagem({
    ...basePedido(T, d),
    assunto: fmt(A.assunto, { codigo: d.codigo }),
    preCabecalho: A.preCabecalho,
    titulo: A.titulo,
    paragrafos: [A.texto, ...(d.anexos ? [A.anexos] : [])],
    tituloItens: A.vouchers,
    itens: itensDoPedido(T, d.itens),
    totais: [linhaTotal(forma ? `${T.comum.totalPago} (${forma})` : T.comum.totalPago, d.total)],
    botao: { texto: T.comum.abrirPedido, href: d.linkPedido, alternativo: T.comum.linkAlternativo },
    ...(d.whatsapp ? { depois: [A.whatsapp], botaoSecundario: { texto: A.botaoWhatsapp, href: d.whatsapp, cor: 'whats' as const } } : {}),
  });
}

/** (3) O Pix venceu sem pagamento: nada foi cobrado, e o link do pedido leva ao "pagar de novo". */
export function emailPixVencido(d: DadosDoPedido & { totais: TotaisDasFormas }): MensagemEmail {
  const T = textosEmail(d.idioma);
  const V = T.pixVencido;
  return mensagem({
    ...basePedido(T, d),
    assunto: fmt(V.assunto, { codigo: d.codigo }),
    preCabecalho: V.preCabecalho,
    titulo: V.titulo,
    paragrafos: [V.texto, V.convite],
    itens: itensDoPedido(T, d.itens),
    totais: totaisDasFormas(T, d.totais),
    botao: { texto: V.botao, href: d.linkPedido, alternativo: T.comum.linkAlternativo },
  });
}

/** O link do pedido pedido na página "Consultar meu pedido" (só chega a quem tem o e-mail da compra). */
export function emailLinkDoPedido(d: DadosDoPedido): MensagemEmail {
  const T = textosEmail(d.idioma);
  const L = T.linkDoPedido;
  return mensagem({
    ...basePedido(T, d),
    assunto: fmt(L.assunto, { codigo: d.codigo }),
    preCabecalho: L.preCabecalho,
    titulo: L.titulo,
    paragrafos: [L.texto],
    itens: itensDoPedido(T, d.itens),
    botao: { texto: T.comum.abrirPedido, href: d.linkPedido, alternativo: T.comum.linkAlternativo },
    depois: [L.nota],
  });
}

/**
 * A confirmação do pedido de desistência pelo site (Decreto 7.962/2013, art. 5º, § 4º: "confirmação imediata do
 * recebimento"): a data e a hora em que ele chegou, no horário de Brasília, o código, os itens e o que acontece agora.
 * A resposta a este e-mail vai para a equipe (reply_to): é o caminho de quem não pediu a desistência.
 */
export function emailDesistenciaRecebida(d: DadosDoPedido & { quando: string }): MensagemEmail {
  const T = textosEmail(d.idioma);
  const D = T.desistencia;
  return mensagem({
    ...basePedido(T, d),
    assunto: fmt(D.assunto, { codigo: d.codigo }),
    preCabecalho: D.preCabecalho,
    titulo: D.titulo,
    paragrafos: [fmt(D.recebido, { quando: d.quando }), D.agora],
    tituloItens: D.itens,
    itens: itensDoPedido(T, d.itens),
    botao: { texto: T.comum.abrirPedido, href: d.linkPedido, alternativo: T.comum.linkAlternativo },
    depois: [D.naoFoiVoce],
  });
}

/**
 * O aviso do pedido de desistência para a equipe (EMAIL_RESPOSTA, em português): quando chegou, se está dentro dos 7
 * dias do arrependimento, o primeiro serviço, o motivo que o cliente escreveu (entre « », do jeito que ficou no
 * histórico) e o que fazer. O botão abre o pedido no painel.
 */
export function emailAvisoDaDesistencia(d: {
  codigo: string;
  /** A data e a hora do pedido de desistência, no horário de Brasília. */
  quando: string;
  /** "dentro dos 7 dias do arrependimento (compra em …)" ou "fora dos 7 dias…" (prazoDoArrependimento). */
  prazo: string;
  /** A data e a hora do primeiro serviço do pedido. */
  primeiroServico: string;
  /** O motivo já limpo (limparMotivo); vazio quando o cliente não escreveu. */
  motivo: string;
  linkPainel: string;
  site: SiteDoEmail;
}): MensagemEmail {
  return mensagem({
    idioma: 'pt',
    assunto: `Desistência pelo site: pedido ${d.codigo}`,
    preCabecalho: `O cliente pediu a desistência em ${d.quando}. Responder em até 1 dia útil.`,
    titulo: 'Pedido de desistência pelo site',
    paragrafos: [
      `O cliente pediu a desistência da compra pelo site em ${d.quando} (horário de Brasília).`,
      `Prazo: ${d.prazo}. Primeiro serviço: ${d.primeiroServico}.`,
      d.motivo ? `Motivo escrito pelo cliente: «${d.motivo}»` : 'O cliente não escreveu motivo.',
      'Antes de estornar, confirme com o titular pelo e-mail ou pelo WhatsApp do pedido. O estorno é só pela forma original do pagamento ("Reembolsar na Stripe", no painel), nunca para uma conta ou chave escrita no motivo. Responda ao cliente em até 1 dia útil.',
    ],
    codigo: { rotulo: 'Pedido', valor: d.codigo },
    botao: { texto: 'Abrir o pedido no painel', href: d.linkPainel },
    rodape: { linhas: ['Aviso automático do site para a equipe.'] },
    site: d.site,
  });
}

/** Um item do carrinho no lembrete: o nome, as linhas de baixo e o preço nas formas que valem (com o ≈ US$ em es e en). */
export interface ItemDoCarrinho {
  nome: string;
  linhas: string[];
  /** Só quando o Pix ainda vale para o carrinho (o prazo e o limite do Pix, src/lib/formas-pagamento.ts). */
  pix?: ValorEmail;
  cartao?: ValorEmail;
}

/** "R$ 138,60 con Pix (≈ US$ 25,20)": o valor, a forma e, em espanhol e inglês, o aproximado em dólar. */
const precoDoItem = (v: ValorEmail, forma: string) => `${v.valor} ${forma}${v.dolar ? ` (${v.dolar})` : ''}`;

/**
 * O lembrete do carrinho abandonado: o primeiro (1 hora depois) e o segundo (24 horas depois). Os itens como
 * estavam, o preço nas formas que valem (o Pix só quando ainda dá para pagar com ele), o link que devolve o carrinho e
 * o link de sair da lista (também nos cabeçalhos List-Unsubscribe, montados por quem envia). Sem urgência: só o que foi
 * escolhido e como voltar, e a frase para quem já reservou por outro caminho.
 */
export function emailLembrete(d: {
  idioma: Idioma;
  n: 1 | 2;
  itens: ItemDoCarrinho[];
  totais: TotaisDasFormas;
  linkVoltar: string;
  linkSair: string;
  site: SiteDoEmail;
}): MensagemEmail {
  const T = textosEmail(d.idioma);
  const L = T.lembrete;
  const primeiro = d.n === 1;
  // com um item só, o preço dele é o total que vem logo abaixo: não se repete
  const varios = d.itens.length > 1;
  return mensagem({
    idioma: d.idioma,
    assunto: primeiro ? L.assunto1 : L.assunto2,
    preCabecalho: primeiro ? L.preCabecalho1 : L.preCabecalho2,
    titulo: primeiro ? L.titulo1 : L.titulo2,
    paragrafos: [primeiro ? L.texto1 : L.texto2, L.jaReservou],
    itens: d.itens.map((i) => {
      const precos = [...(i.pix ? [precoDoItem(i.pix, L.noPix)] : []), ...(i.cartao ? [precoDoItem(i.cartao, L.noCartao)] : [])];
      return { nome: i.nome, linhas: [...i.linhas, ...(varios && precos.length ? [precos.join(' · ')] : [])] };
    }),
    totais: totaisDasFormas(T, d.totais),
    botao: { texto: L.botao, href: d.linkVoltar },
    depois: [L.nota],
    rodape: { linhas: [fmt(L.motivo, { site: d.site.dominio })], link: { texto: L.sair, href: d.linkSair } },
    site: d.site,
  });
}
