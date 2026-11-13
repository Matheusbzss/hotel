// com a extensão, para os testes (node) acharem o arquivo sem o atalho "@/"
import { HREFLANG, type Idioma } from '../../i18n/config.ts';

/**
 * A moldura de todos os e-mails: o HTML que funciona no celular (tabelas, estilo embutido em cada elemento, nada de
 * folha de estilo externa) e a versão em texto puro, montados a partir do mesmo conteúdo. As cores e as medidas são
 * as do site (MASTER.md): chão #F4F8F8, tinta #063643, papel branco, ação dourada com texto escuro, raio de 8 px nos
 * cartões e 4 px nos botões. A única imagem é o emblema no topo, com o nome da marca no texto alternativo: com as
 * imagens bloqueadas, o e-mail continua inteiro. Sem rede nem banco: testado em tests/email.test.ts.
 */

export const CORES = {
  fundo: '#F4F8F8',
  papel: '#FFFFFF',
  superficie: '#E6EEEF',
  borda: '#C3D2D4',
  tinta: '#063643',
  suave: '#4A6470',
  acao: '#F2AD47',
  link: '#0A6F72',
  whats: '#25D366',
  creme: '#F4E9D2',
} as const;

const FONTE = 'Arial, Helvetica, sans-serif';

export interface Botao {
  texto: string;
  href: string;
  /** O dourado das ações (padrão) ou o verde do WhatsApp. */
  cor?: 'acao' | 'whats';
}

export interface LinkSimples {
  texto: string;
  href: string;
}

/** Um item do pedido ou do carrinho: o nome, as linhas de baixo (data, pessoas) e, quando pago, o voucher. */
export interface ItemEmail {
  nome: string;
  linhas: string[];
  voucher?: { rotulo: string; codigo: string; links: LinkSimples[] };
}

export interface LinhaTotal {
  rotulo: string;
  valor: string;
  /** O aproximado em dólar, ao lado do valor (só em espanhol e inglês). */
  nota?: string;
}

export interface ConteudoEmail {
  idioma: Idioma;
  /** Vai no <title> (alguns aplicativos mostram). */
  assunto: string;
  /** A linha cinza que o aplicativo mostra ao lado do assunto, antes de abrir. */
  preCabecalho: string;
  titulo: string;
  saudacao?: string;
  paragrafos: string[];
  codigo?: { rotulo: string; valor: string };
  tituloItens?: string;
  itens?: ItemEmail[];
  totais?: LinhaTotal[];
  /** O botão principal; `alternativo` é a frase com o endereço escrito, para quando o botão não abre. */
  botao?: Botao & { alternativo?: string };
  /** Parágrafos depois do botão principal. */
  depois?: string[];
  /** Um segundo botão (o WhatsApp da equipe), depois dos parágrafos de baixo. */
  botaoSecundario?: Botao;
  rodape: { linhas: string[]; link?: LinkSimples };
  site: { url: string; logo: string; nome: string; dominio: string };
}

/** O texto que entra no HTML: nada do que o cliente digitou (nome, hotel) vira marcação. */
export function escaparHtml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** O texto escapado, com "e-mail" sempre inteiro na mesma linha (o celular quebrava no hífen: "este e-" / "mail"). */
const frase = (texto: string) =>
  escaparHtml(texto).replace(/(?<![\w-])e-mail(?![\w-])/gi, (palavra) => `<span style="white-space:nowrap;">${palavra}</span>`);

const p = (texto: string, estilo = '') =>
  `<p style="margin:0 0 16px;font-family:${FONTE};font-size:16px;line-height:24px;color:${CORES.tinta};${estilo}">${frase(texto)}</p>`;

function botaoHtml(b: Botao): string {
  const fundo = b.cor === 'whats' ? CORES.whats : CORES.acao;
  // o botão "à prova de bala": a célula pinta o fundo mesmo quando o aplicativo ignora o estilo do link
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;">`,
    `<tr><td align="center" bgcolor="${fundo}" style="background:${fundo};border-radius:4px;">`,
    `<a href="${escaparHtml(b.href)}" target="_blank" style="display:block;padding:15px 20px;font-family:${FONTE};font-size:17px;line-height:22px;font-weight:bold;color:${CORES.tinta};text-decoration:none;border-radius:4px;">${escaparHtml(b.texto)}</a>`,
    `</td></tr></table>`,
  ].join('');
}

function itemHtml(item: ItemEmail, primeiro: boolean): string {
  const borda = primeiro ? '' : `border-top:1px solid ${CORES.borda};`;
  const linhas = item.linhas
    .map(
      (l) => `<p style="margin:2px 0 0;font-family:${FONTE};font-size:15px;line-height:21px;color:${CORES.suave};">${escaparHtml(l)}</p>`,
    )
    .join('');
  const voucher = item.voucher
    ? [
        `<p style="margin:8px 0 0;font-family:${FONTE};font-size:15px;line-height:21px;color:${CORES.tinta};">${escaparHtml(item.voucher.rotulo)} <strong style="letter-spacing:0.5px;">${escaparHtml(item.voucher.codigo)}</strong></p>`,
        `<p style="margin:6px 0 0;font-family:${FONTE};font-size:15px;line-height:21px;">`,
        item.voucher.links
          .map(
            (l) =>
              `<a href="${escaparHtml(l.href)}" target="_blank" style="color:${CORES.link};font-weight:bold;text-decoration:underline;">${escaparHtml(l.texto)}</a>`,
          )
          .join('&nbsp;&nbsp;·&nbsp;&nbsp;'),
        `</p>`,
      ].join('')
    : '';
  return [
    `<tr><td style="padding:14px 0;${borda}">`,
    `<p style="margin:0;font-family:${FONTE};font-size:17px;line-height:23px;font-weight:bold;color:${CORES.tinta};">${escaparHtml(item.nome)}</p>`,
    linhas,
    voucher,
    `</td></tr>`,
  ].join('');
}

function totaisHtml(totais: LinhaTotal[]): string {
  const linhas = totais
    .map(
      (t) =>
        `<tr><td style="padding:6px 0;font-family:${FONTE};font-size:15px;line-height:21px;color:${CORES.suave};">${escaparHtml(t.rotulo)}</td>` +
        `<td align="right" style="padding:6px 0;font-family:${FONTE};font-size:17px;line-height:23px;font-weight:bold;color:${CORES.tinta};white-space:nowrap;">${escaparHtml(t.valor)}` +
        (t.nota
          ? `<br><span style="font-size:14px;line-height:20px;font-weight:normal;color:${CORES.suave};">${escaparHtml(t.nota)}</span>`
          : '') +
        `</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-top:2px solid ${CORES.tinta};">${linhas}</table>`;
}

export function montarHtml(c: ConteudoEmail): string {
  const corpo: string[] = [];
  corpo.push(
    `<h1 style="margin:0 0 16px;font-family:${FONTE};font-size:26px;line-height:31px;font-weight:bold;color:${CORES.tinta};">${frase(c.titulo)}</h1>`,
  );
  if (c.saudacao) corpo.push(p(c.saudacao));
  for (const texto of c.paragrafos) corpo.push(p(texto));
  if (c.codigo) {
    corpo.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;"><tr>` +
        `<td bgcolor="${CORES.superficie}" style="background:${CORES.superficie};border-radius:8px;padding:14px 16px;">` +
        `<p style="margin:0;font-family:${FONTE};font-size:14px;line-height:20px;color:${CORES.suave};">${escaparHtml(c.codigo.rotulo)}</p>` +
        `<p style="margin:4px 0 0;font-family:${FONTE};font-size:26px;line-height:31px;font-weight:bold;letter-spacing:1px;color:${CORES.tinta};">${escaparHtml(c.codigo.valor)}</p>` +
        `</td></tr></table>`,
    );
  }
  if (c.itens?.length) {
    if (c.tituloItens) {
      corpo.push(
        `<h2 style="margin:8px 0 4px;font-family:${FONTE};font-size:19px;line-height:25px;font-weight:bold;color:${CORES.tinta};">${escaparHtml(c.tituloItens)}</h2>`,
      );
    }
    corpo.push(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;">${c.itens.map((i, n) => itemHtml(i, n === 0)).join('')}</table>`,
    );
  }
  if (c.totais?.length) corpo.push(totaisHtml(c.totais));
  if (c.botao) {
    corpo.push(botaoHtml(c.botao));
    if (c.botao.alternativo) {
      corpo.push(
        `<p style="margin:0 0 20px;font-family:${FONTE};font-size:13px;line-height:19px;color:${CORES.suave};">${frase(c.botao.alternativo)}<br>` +
          `<a href="${escaparHtml(c.botao.href)}" target="_blank" style="color:${CORES.link};word-break:break-all;">${escaparHtml(c.botao.href)}</a></p>`,
      );
    }
  }
  for (const texto of c.depois ?? []) corpo.push(p(texto));
  if (c.botaoSecundario) corpo.push(botaoHtml(c.botaoSecundario));

  const rodape = [
    ...c.rodape.linhas.map(
      (l) => `<p style="margin:0 0 8px;font-family:${FONTE};font-size:13px;line-height:19px;color:${CORES.suave};">${frase(l)}</p>`,
    ),
    c.rodape.link
      ? `<p style="margin:0 0 8px;font-family:${FONTE};font-size:13px;line-height:19px;"><a href="${escaparHtml(c.rodape.link.href)}" target="_blank" style="color:${CORES.suave};text-decoration:underline;">${escaparHtml(c.rodape.link.texto)}</a></p>`
      : '',
    `<p style="margin:0;font-family:${FONTE};font-size:13px;line-height:19px;"><a href="${escaparHtml(c.site.url)}" target="_blank" style="color:${CORES.tinta};font-weight:bold;text-decoration:none;">${escaparHtml(c.site.nome)}</a>` +
      `<span style="color:${CORES.suave};"> · ${escaparHtml(c.site.dominio)}</span></p>`,
  ].join('');

  return [
    '<!doctype html>',
    `<html lang="${HREFLANG[c.idioma]}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="x-apple-disable-message-reformatting">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escaparHtml(c.assunto)}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background:${CORES.fundo};">`,
    // o pré-cabeçalho: lido pelo aplicativo na lista de e-mails, escondido no corpo
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escaparHtml(c.preCabecalho)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CORES.fundo}" style="background:${CORES.fundo};">`,
    `<tr><td align="center" style="padding:20px 12px;">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">`,
    `<tr><td align="center" bgcolor="${CORES.tinta}" style="background:${CORES.tinta};border-radius:8px 8px 0 0;padding:20px 24px;">`,
    `<a href="${escaparHtml(c.site.url)}" target="_blank" style="text-decoration:none;">`,
    `<img src="${escaparHtml(c.site.logo)}" width="72" height="72" alt="${escaparHtml(c.site.nome)}" style="display:block;width:72px;height:72px;border:0;outline:none;font-family:${FONTE};font-size:18px;font-weight:bold;color:${CORES.creme};">`,
    `</a></td></tr>`,
    `<tr><td bgcolor="${CORES.papel}" style="background:${CORES.papel};padding:28px 24px 12px;">${corpo.join('')}</td></tr>`,
    `<tr><td bgcolor="${CORES.superficie}" style="background:${CORES.superficie};border-radius:0 0 8px 8px;padding:20px 24px;">${rodape}</td></tr>`,
    `</table>`,
    `</td></tr></table>`,
    '</body>',
    '</html>',
  ].join('\n');
}

/** A mesma mensagem em texto puro, para os aplicativos que não mostram HTML (e para os filtros de spam). */
export function montarTexto(c: ConteudoEmail): string {
  const blocos: string[] = [c.site.nome.toUpperCase(), c.titulo];
  if (c.saudacao) blocos.push(c.saudacao);
  blocos.push(...c.paragrafos);
  if (c.codigo) blocos.push(`${c.codigo.rotulo}: ${c.codigo.valor}`);
  if (c.itens?.length) {
    const itens = c.itens.map((i) =>
      [
        `- ${i.nome}`,
        ...i.linhas.map((l) => `  ${l}`),
        ...(i.voucher ? [`  ${i.voucher.rotulo} ${i.voucher.codigo}`, ...i.voucher.links.map((l) => `  ${l.texto}: ${l.href}`)] : []),
      ].join('\n'),
    );
    blocos.push([...(c.tituloItens ? [c.tituloItens] : []), ...itens].join('\n\n'));
  }
  if (c.totais?.length) blocos.push(c.totais.map((t) => `${t.rotulo}: ${t.valor}${t.nota ? ` (${t.nota})` : ''}`).join('\n'));
  if (c.botao) blocos.push(`${c.botao.texto}: ${c.botao.href}`);
  blocos.push(...(c.depois ?? []));
  if (c.botaoSecundario) blocos.push(`${c.botaoSecundario.texto}: ${c.botaoSecundario.href}`);
  const rodape = [
    ...c.rodape.linhas,
    ...(c.rodape.link ? [`${c.rodape.link.texto}: ${c.rodape.link.href}`] : []),
    `${c.site.nome} · ${c.site.url}`,
  ];
  return `${blocos.join('\n\n')}\n\n--\n${rodape.join('\n')}\n`;
}

export function montarEmail(c: ConteudoEmail): { html: string; texto: string } {
  return { html: montarHtml(c), texto: montarTexto(c) };
}
