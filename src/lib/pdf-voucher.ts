import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import QRCode from 'qrcode';
import { EMPRESA } from '@/config/empresa';
import { obterPasseio } from '@/data/passeios';
import { LOCALE_INTL } from '@/i18n/config';
import { dicionario } from '@/i18n';
import { semFaixas } from './passeio-view';
import { textoPessoas } from './pessoas';
import { formatarPreco } from './precos';
import type { Reserva } from './reservas';
import { NOME_CIDADE_HOSPEDAGEM, formatarDataIso } from './validacao';
import { LOGO_VOUCHER_PNG_BASE64 } from './logo-voucher';

/** As cores do site: a tinta azul-noite, a superfície do cartão, o verde-água das ações e o cinza das notas. */
const COR = {
  tinta: rgb(11 / 255, 37 / 255, 48 / 255),
  superficie: rgb(225 / 255, 232 / 255, 230 / 255),
  acao: rgb(10 / 255, 107 / 255, 116 / 255),
  cinza: rgb(66 / 255, 85 / 255, 92 / 255),
};

const AVISOS = {
  pt: [
    'Apresente este voucher no celular ou impresso no dia do passeio.',
    'Horário e ponto de encontro são confirmados pelo WhatsApp.',
    'Cancelamento com 24h de antecedência: reembolso integral.',
    'Cancelado por chuva, mau tempo ou mar: reembolso integral ou nova data, à sua escolha.',
  ],
  en: [
    'Show this voucher on your phone or printed on the day of the tour.',
    'Time and meeting point are confirmed on WhatsApp.',
    'Cancellation at least 24h in advance: full refund.',
    'Cancelled due to rain, bad weather or sea conditions: full refund or a new date, your choice.',
  ],
  es: [
    'Presentá este voucher en el celular o impreso el día del paseo.',
    'El horario y el punto de encuentro se confirman por WhatsApp.',
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

export async function gerarVoucherPdf(reserva: Reserva, urlReserva: string): Promise<Uint8Array> {
  const idioma = reserva.idioma;
  const d = dicionario(idioma);
  const locale = LOCALE_INTL[idioma];
  const passeio = obterPasseio(reserva.passeio.slug);
  const opcao = reserva.passeio.opcao ? passeio?.opcoes?.find((o) => o.id === reserva.passeio.opcao?.id) : undefined;
  const nomeOpcao = opcao?.nome[idioma] ?? reserva.passeio.opcao?.nome;
  const nomePasseio = `${passeio?.nome[idioma] ?? reserva.passeio.nome}${nomeOpcao ? ` (${nomeOpcao})` : ''}`;

  const pdf = await PDFDocument.create();
  pdf.setTitle(`Voucher ${reserva.codigo} — ${EMPRESA.marca}`);
  pdf.setAuthor(EMPRESA.marca);
  const page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 48;

  // faixa do mar no topo
  const faixa = 14;
  page.drawRectangle({ x: 0, y: height - faixa, width, height: faixa, color: COR.tinta });

  const logo = await pdf.embedPng(Buffer.from(LOGO_VOUCHER_PNG_BASE64, 'base64'));
  const lw = 210;
  page.drawImage(logo, {
    x: M,
    y: height - faixa - 30 - (lw * logo.height) / logo.width,
    width: lw,
    height: (lw * logo.height) / logo.width,
  });

  // código do voucher
  texto(page, d.reserva.voucher, width - M - 200, height - 70, regular, 12, COR.cinza);
  texto(page, reserva.codigo, width - M - 200, height - 102, negrito, 30);

  // cartão com os dados
  const topoCartao = height - 170;
  const alturaCartao = 330;
  page.drawRectangle({ x: M, y: topoCartao - alturaCartao, width: width - 2 * M, height: alturaCartao, color: COR.superficie });

  const pessoas = textoPessoas(reserva, d.comum.rotulos, passeio ? semFaixas(passeio) : false);

  const campos: [string, string][] = [
    [d.reserva.passeio, nomePasseio],
    [d.reserva.data, formatarDataIso(reserva.data, locale)],
    [d.reserva.nome, reserva.cliente.nome],
    [d.reserva.pessoas, pessoas],
    [d.reserva.hotel, `${reserva.hospedagem.hotel} — ${NOME_CIDADE_HOSPEDAGEM[reserva.hospedagem.cidade]}`],
    [d.reserva.total, formatarPreco(reserva.totalCentavos, idioma)],
  ];

  let y = topoCartao - 44;
  const larguraValor = width - 2 * M - 48 - 150;
  for (const [rotulo, valor] of campos) {
    texto(page, rotulo, M + 24, y, regular, 10, COR.cinza);
    const linhas = quebrar(valor, negrito, 14, larguraValor);
    linhas.forEach((l, i) => texto(page, l, M + 24, y - 17 - i * 17, negrito, 14));
    y -= 30 + linhas.length * 17;
  }

  // QR code com o link da reserva
  const qr = await QRCode.toBuffer(urlReserva, { margin: 2, width: 300, color: { dark: '#0B2530', light: '#FFFFFF' } });
  const qrImg = await pdf.embedPng(qr);
  page.drawImage(qrImg, { x: width - M - 24 - 130, y: topoCartao - 44 - 130, width: 130, height: 130 });
  texto(page, d.status.pago || 'Pago', width - M - 24 - 130, topoCartao - 44 - 152, negrito, 14, COR.acao);

  // avisos
  let ya = topoCartao - alturaCartao - 50;
  texto(page, IMPORTANTE[idioma], M, ya, negrito, 13);
  ya -= 22;
  for (const aviso of AVISOS[idioma]) {
    for (const l of quebrar(`• ${aviso}`, regular, 11, width - 2 * M)) {
      texto(page, l, M, ya, regular, 11);
      ya -= 16;
    }
    ya -= 2;
  }

  // rodapé com dados da empresa
  const rodape = [
    `${EMPRESA.marca} — ${EMPRESA.slogan}`,
    `CNPJ ${EMPRESA.cnpj}`,
    `WhatsApp ${EMPRESA.telefoneExibicao} · ${EMPRESA.email} · ${EMPRESA.dominio}`,
    `${EMPRESA.cidade} – ${EMPRESA.uf}`,
  ];
  rodape.forEach((l, i) => texto(page, l, M, 92 - i * 15, i === 0 ? negrito : regular, 10, i === 0 ? COR.tinta : COR.cinza));
  page.drawRectangle({ x: 0, y: 0, width, height: 10, color: COR.tinta });

  return pdf.save();
}
