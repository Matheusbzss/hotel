import { PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { EMPRESA } from '@/config/empresa';
import { obterPasseio } from '@/data/passeios';
import { LOCALE_INTL, fmt } from '@/i18n/config';
import { dicionario, type Dicionario } from '@/i18n';
import { formatarHora } from './horarios';
import { semFaixas } from './passeio-view';
import { textoPessoas } from './pessoas';
import { formatarPreco } from './precos';
import { ehTransfer, type Reserva, type ReservaPasseio, type ReservaTransfer } from './reservas';
import { transferVisivel, type TrechoVisivel } from './transfer-view';
import { NOME_CIDADE_HOSPEDAGEM, formatarDataIso } from './validacao';
import { LOGO_VOUCHER_PNG_BASE64 } from './logo-voucher';

/** As cores do site: a tinta azul-noite, a superfície do cartão, o verde-água das ações e o cinza das notas. */
const COR = {
  tinta: rgb(11 / 255, 37 / 255, 48 / 255),
  superficie: rgb(225 / 255, 232 / 255, 230 / 255),
  acao: rgb(10 / 255, 107 / 255, 116 / 255),
  cinza: rgb(66 / 255, 85 / 255, 92 / 255),
  /** o verde do botão de WhatsApp do site */
  whats: rgb(37 / 255, 211 / 255, 102 / 255),
};

/** Os avisos fixos. O do horário (busca na hospedagem ou ponto de encontro) entra em segundo, vindo do dicionário. */
const AVISOS = {
  pt: [
    'Apresente este voucher no celular ou impresso no dia do passeio.',
    'Cancelamento com 24h de antecedência: reembolso integral.',
    'Cancelado por chuva, mau tempo ou mar: reembolso integral ou nova data, à sua escolha.',
  ],
  en: [
    'Show this voucher on your phone or printed on the day of the tour.',
    'Cancellation at least 24h in advance: full refund.',
    'Cancelled due to rain, bad weather or sea conditions: full refund or a new date, your choice.',
  ],
  es: [
    'Presentá este voucher en el celular o impreso el día del paseo.',
    'Cancelación con 24 h de anticipación: reembolso total.',
    'Cancelado por lluvia, mal tiempo o mar: reembolso total o nueva fecha, a tu elección.',
  ],
} as const;

const IMPORTANTE = { pt: 'Importante', en: 'Important', es: 'Importante' } as const;

/** As fontes padrão do PDF só aceitam o conjunto WinAnsi: troca o que não couber. */
function limpar(texto: string): string {
  const permitido = /[ -~ -ÿ–—‘’“”•…€]/;
  return Array.from(texto.replace(/ | /g, ' '))
    .map((c) => {
      if (permitido.test(c)) return c;
      const sem = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return permitido.test(sem) ? sem : '?';
    })
    .join('');
}

function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const palavras = limpar(texto).split(/\s+/);
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (fonte.widthOfTextAtSize(teste, tamanho) > largura && atual) {
      linhas.push(atual);
      atual = p;
    } else atual = teste;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function texto(page: PDFPage, t: string, x: number, y: number, fonte: PDFFont, tamanho: number, cor = COR.tinta) {
  page.drawText(limpar(t), { x, y, font: fonte, size: tamanho, color: cor });
}

/** Torna uma área da página clicável: no leitor de PDF, o toque abre o link. */
function link(pdf: PDFDocument, page: PDFPage, url: string, x: number, y: number, largura: number, altura: number) {
  const anotacao = pdf.context.register(
    pdf.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [x, y, x + largura, y + altura],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
    }),
  );
  const anotacoes = page.node.Annots();
  if (anotacoes) anotacoes.push(anotacao);
  else page.node.set(PDFName.of('Annots'), pdf.context.obj([anotacao]));
}

/** O que muda entre o voucher de passeio e o de transfer: os campos do cartão, a mensagem do WhatsApp e os avisos. */
interface ConteudoVoucher {
  /** Cada campo: o rótulo e um ou mais parágrafos (cada parágrafo quebra em linhas sozinho). */
  campos: [string, string[]][];
  mensagem: string;
  avisos: string[];
}

function conteudoPasseio(reserva: ReservaPasseio, d: Dicionario): ConteudoVoucher {
  const idioma = reserva.idioma;
  const locale = LOCALE_INTL[idioma];
  const passeio = obterPasseio(reserva.passeio.slug);
  const opcao = reserva.passeio.opcao ? passeio?.opcoes?.find((o) => o.id === reserva.passeio.opcao?.id) : undefined;
  const nomeOpcao = opcao?.nome[idioma] ?? reserva.passeio.opcao?.nome;
  const nomePasseio = `${passeio?.nome[idioma] ?? reserva.passeio.nome}${nomeOpcao ? ` (${nomeOpcao})` : ''}`;
  const pessoas = textoPessoas(reserva, d.comum.rotulos, passeio ? semFaixas(passeio) : false);
  const dataTexto = formatarDataIso(reserva.data, locale);
  const horario = reserva.horario;
  const hora = horario ? formatarHora(horario.hora, idioma) : '';
  return {
    campos: [
      [d.reserva.passeio, [nomePasseio]],
      [d.reserva.data, [dataTexto]],
      ...(horario ? [[horario.busca ? d.horario.busca : d.horario.saida, [hora]] as [string, string[]]] : []),
      [d.reserva.nome, [reserva.cliente.nome]],
      [d.reserva.pessoas, [pessoas]],
      [d.reserva.hotel, [`${reserva.hospedagem.hotel} — ${NOME_CIDADE_HOSPEDAGEM[reserva.hospedagem.cidade]}`]],
      [d.reserva.total, [formatarPreco(reserva.totalCentavos, idioma)]],
    ],
    mensagem: fmt(d.reserva.msgVoucher, {
      codigo: reserva.codigo,
      passeio: nomePasseio,
      data: horario ? fmt(d.horario.dataHora, { data: dataTexto, hora }) : dataTexto,
      pessoas,
      hotel: `${reserva.hospedagem.hotel} (${NOME_CIDADE_HOSPEDAGEM[reserva.hospedagem.cidade]})`,
    }),
    // o aviso do horário (busca na hospedagem ou ponto de encontro) vem logo depois do primeiro
    avisos: [AVISOS[idioma][0], horario?.busca ? d.reserva.proximo1Busca : d.reserva.proximo1Saida, ...AVISOS[idioma].slice(1)],
  };
}

function conteudoTransfer(reserva: ReservaTransfer, d: Dicionario): ConteudoVoucher {
  const idioma = reserva.idioma;
  const locale = LOCALE_INTL[idioma];
  const T = d.transfer;
  const v = transferVisivel(reserva, idioma, d);
  const dataHora = (tr: TrechoVisivel) => fmt(d.horario.dataHora, { data: formatarDataIso(tr.data, locale), hora: tr.hora });
  // a seta não existe nas letras do PDF: o trajeto usa o travessão
  const trecho = (tr: TrechoVisivel) => [dataHora(tr), `${tr.saida} – ${tr.destino}`, ...(tr.voo ? [`${T.voo} ${tr.voo}`] : [])];
  return {
    campos: [
      [T.titulo, [v.veiculo]],
      [T.ida, trecho(v.ida)],
      ...(v.volta ? [[T.volta, trecho(v.volta)] as [string, string[]]] : []),
      [d.reserva.nome, [reserva.cliente.nome]],
      [T.passageiros, [v.passageiros]],
      [T.malas, [v.malas]],
      ...(v.cadeirinhas ? [[T.cadeirinhas, [v.cadeirinhas]] as [string, string[]]] : []),
      [d.reserva.total, [formatarPreco(reserva.totalCentavos, idioma)]],
    ],
    mensagem: fmt(T.msgVoucherTransfer, {
      codigo: reserva.codigo,
      trajeto: `${v.ida.saida} → ${v.ida.destino}`,
      data: dataHora(v.ida),
      pessoas: v.passageiros,
    }),
    // o motorista no desembarque, a espera, o nome dos outros passageiros e o cancelamento
    avisos: [T.como[0], T.como[1], T.demaisPassageiros, AVISOS[idioma][1]],
  };
}

export async function gerarVoucherPdf(reserva: Reserva, urlReserva: string): Promise<Uint8Array> {
  const idioma = reserva.idioma;
  const d = dicionario(idioma);
  const conteudo = ehTransfer(reserva) ? conteudoTransfer(reserva, d) : conteudoPasseio(reserva, d);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Voucher ${reserva.codigo} — ${EMPRESA.marca}`);
  pdf.setAuthor(EMPRESA.marca);
  const A4: [number, number] = [595.28, 841.89];
  const page = pdf.addPage(A4);
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 48;

  // faixa do mar no topo
  const faixa = 14;
  page.drawRectangle({ x: 0, y: height - faixa, width, height: faixa, color: COR.tinta });

  const logo = await pdf.embedPng(Buffer.from(LOGO_VOUCHER_PNG_BASE64, 'base64'));
  // o emblema redondo, à esquerda do código do voucher
  const lw = 96;
  page.drawImage(logo, {
    x: M,
    y: height - faixa - 18 - (lw * logo.height) / logo.width,
    width: lw,
    height: (lw * logo.height) / logo.width,
  });

  // código do voucher
  texto(page, d.reserva.voucher, width - M - 200, height - 70, regular, 12, COR.cinza);
  texto(page, reserva.codigo, width - M - 200, height - 102, negrito, 30);

  // cartão com os dados: a altura acompanha o número de linhas
  const larguraValor = width - 2 * M - 48 - 150;
  const blocos = conteudo.campos.map(([rotulo, paragrafos]) => ({
    rotulo,
    linhas: paragrafos.flatMap((p) => quebrar(p, negrito, 14, larguraValor)),
  }));
  const topoCartao = height - 170;
  const alturaCartao = Math.max(330, 38 + blocos.reduce((s, b) => s + 30 + b.linhas.length * 17, 0));
  page.drawRectangle({ x: M, y: topoCartao - alturaCartao, width: width - 2 * M, height: alturaCartao, color: COR.superficie });

  let y = topoCartao - 44;
  for (const { rotulo, linhas } of blocos) {
    texto(page, rotulo, M + 24, y, regular, 10, COR.cinza);
    linhas.forEach((l, i) => texto(page, l, M + 24, y - 17 - i * 17, negrito, 14));
    y -= 30 + linhas.length * 17;
  }

  // QR code com o link da reserva
  const xColuna = width - M - 24 - 130;
  const qr = await QRCode.toBuffer(urlReserva, { margin: 2, width: 300, color: { dark: '#0B2530', light: '#FFFFFF' } });
  const qrImg = await pdf.embedPng(qr);
  page.drawImage(qrImg, { x: xColuna, y: topoCartao - 44 - 130, width: 130, height: 130 });
  texto(page, d.status.pago || 'Pago', xColuna, topoCartao - 44 - 152, negrito, 14, COR.acao);

  // o WhatsApp da equipe, num botão que abre a conversa com o voucher já escrito
  const urlWhats = `https://wa.me/${EMPRESA.whatsapp}?text=${encodeURIComponent(conteudo.mensagem)}`;
  const yBotao = topoCartao - 44 - 152 - 64;
  texto(page, d.reserva.whatsappEquipe, xColuna, yBotao + 42, regular, 10, COR.cinza);
  page.drawRectangle({ x: xColuna, y: yBotao, width: 130, height: 32, color: COR.whats });
  const numero = limpar(EMPRESA.telefoneExibicao);
  const larguraNumero = negrito.widthOfTextAtSize(numero, 11);
  texto(page, numero, xColuna + (130 - larguraNumero) / 2, yBotao + 12, negrito, 11);
  link(pdf, page, urlWhats, xColuna, yBotao, 130, 32);

  // avisos: se não couberem acima do rodapé, continuam numa segunda página
  let folha = page;
  let ya = topoCartao - alturaCartao - 50;
  const garantirEspaco = (precisa: number) => {
    if (ya - precisa >= 130) return;
    folha = pdf.addPage(A4);
    folha.drawRectangle({ x: 0, y: height - faixa, width, height: faixa, color: COR.tinta });
    ya = height - 70;
  };
  garantirEspaco(40);
  texto(folha, IMPORTANTE[idioma], M, ya, negrito, 13);
  ya -= 22;
  for (const aviso of conteudo.avisos) {
    const linhas = quebrar(`• ${aviso}`, regular, 11, width - 2 * M);
    garantirEspaco(linhas.length * 16);
    for (const l of linhas) {
      texto(folha, l, M, ya, regular, 11);
      ya -= 16;
    }
    ya -= 2;
  }

  // rodapé com dados da empresa, em todas as páginas
  const rodape = [
    `${EMPRESA.marca} — ${EMPRESA.slogan}`,
    `CNPJ ${EMPRESA.cnpj}`,
    `WhatsApp ${EMPRESA.telefoneExibicao} · ${EMPRESA.email} · ${EMPRESA.dominio}`,
    `${EMPRESA.cidade} – ${EMPRESA.uf}`,
  ];
  for (const p of pdf.getPages()) {
    rodape.forEach((l, i) => texto(p, l, M, 92 - i * 15, i === 0 ? negrito : regular, 10, i === 0 ? COR.tinta : COR.cinza));
    p.drawRectangle({ x: 0, y: 0, width, height: 10, color: COR.tinta });
  }

  return pdf.save();
}
