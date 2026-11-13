import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPRESA } from '../src/config/empresa.ts';
import { HREFLANG, IDIOMAS, type Idioma } from '../src/i18n/config.ts';
import { TEXTOS_CONSULTA } from '../src/lib/consulta-textos.ts';
import {
  REMETENTE_PADRAO,
  URL_RESEND,
  corpoDoEnvio,
  emailLigado,
  enviarEmail,
  falhaDaConta,
  remetente,
  responderPara,
  saiu,
  type EmailParaEnviar,
} from '../src/lib/email/enviar.ts';
import { cabecalhosDeSair } from '../src/lib/email/links.ts';
import {
  EMAILS_DO_DIA_ANTES_DE_GUARDAR,
  PEDIDOS_RECEBIDOS_POR_ENDERECO,
  cabeNaCotaDoDia,
  emailEssencial,
  enderecoCabeNoDia,
  resumoDoEndereco,
} from '../src/lib/email/cota.ts';
import {
  emailAvisoDaDesistencia,
  emailDesistenciaRecebida,
  emailLembrete,
  emailLinkDoPedido,
  emailPagamentoAprovado,
  emailPedidoRecebido,
  emailPixVencido,
  nomeDaSaudacao,
  primeiroNome,
  type DadosDoPedido,
  type MensagemEmail,
  type TipoEmail,
} from '../src/lib/email/mensagens.ts';
import { escaparHtml } from '../src/lib/email/modelo.ts';
import { zerarLimitesEmMemoria } from '../src/lib/limite-ip.ts';
import { TEXTOS_EMAIL } from '../src/lib/email/textos.ts';

// Etapa 6: os e-mails automáticos. Cada e-mail é montado nos quatro idiomas com dados de exemplo e conferido por
// dentro (nenhum marcador sobrando, o link do pedido no HTML e no texto, o que o cliente digitou escapado, o WhatsApp
// só no pagamento aprovado, nenhum dado legal da empresa); o envio pelo Resend é conferido com um fetch de mentira,
// inclusive o caminho desligado (sem RESEND_API_KEY nada sai e o registro só leva o tipo e o código).

delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_REMETENTE;
delete process.env.EMAIL_RESPOSTA;

const SITE = {
  url: 'https://orlanativa.online',
  logo: 'https://orlanativa.online/logo/orla-nativa-emblema-512.png',
  nome: 'Orla Nativa',
  dominio: 'orlanativa.online',
};
const LINK_PEDIDO = 'https://orlanativa.online/pedido/ON-7K3P9Q?t=abc_DEF-123';

const pedido = (idioma: Idioma, pago = false): DadosDoPedido => ({
  idioma,
  // o primeiro nome vai na saudação: com marcação, para conferir que nada vira HTML
  nome: '<b>Ana</b> Souza',
  codigo: 'ON-7K3P9Q',
  linkPedido: LINK_PEDIDO,
  itens: [
    {
      nome: 'Passeio de Escuna em Búzios',
      linhas: ['sáb., 14 nov. 2026 às 10h', '2 adultos'],
      ...(pago
        ? {
            voucher: {
              codigo: 'ON-AB2CD3',
              link: 'https://orlanativa.online/reserva/ON-AB2CD3?t=x',
              pdf: 'https://orlanativa.online/api/voucher/ON-AB2CD3?t=x',
            },
          }
        : {}),
    },
    {
      nome: 'Transfer privado: Galeão → Búzios',
      linhas: ['dom., 15 nov. 2026 às 14h', 'Volta: sex., 20 nov. 2026 às 9h', '3 passageiros'],
      ...(pago
        ? {
            voucher: {
              codigo: 'ON-EF4GH5',
              link: 'https://orlanativa.online/reserva/ON-EF4GH5?t=x',
              pdf: 'https://orlanativa.online/api/voucher/ON-EF4GH5?t=x',
            },
          }
        : {}),
    },
  ],
  site: SITE,
});

const VALOR = { valor: 'R$ 270,00', dolar: '≈ US$ 49,10' };
/** O preço de um item no idioma: com o ≈ US$ em espanhol e inglês, como no resto do site. */
const precoDoItem = (idioma: Idioma, valor: string, dolar: string) => ({ valor, ...(idioma === 'pt' ? {} : { dolar }) });

/** Todos os e-mails de um idioma, com o nome de cada um. */
function todos(idioma: Idioma): [string, MensagemEmail][] {
  return [
    ['pedido recebido (WhatsApp)', emailPedidoRecebido({ ...pedido(idioma), caminho: 'whatsapp', totais: { pix: VALOR, cartao: VALOR } })],
    ['pedido recebido (online)', emailPedidoRecebido({ ...pedido(idioma), caminho: 'online', totais: { pix: VALOR } })],
    ['desistência recebida', emailDesistenciaRecebida({ ...pedido(idioma), quando: '13 de novembro de 2026 às 14:32' })],
    [
      'pagamento aprovado',
      emailPagamentoAprovado({
        ...pedido(idioma, true),
        total: VALOR,
        forma: 'pix',
        anexos: true,
        whatsapp: 'https://wa.me/5521990502377?text=oi',
      }),
    ],
    ['Pix vencido', emailPixVencido({ ...pedido(idioma), totais: { pix: VALOR, cartao: VALOR } })],
    ['link do pedido', emailLinkDoPedido(pedido(idioma, true))],
    ...([1, 2] as const).map(
      (n) =>
        [
          `lembrete ${n}`,
          emailLembrete({
            idioma,
            n,
            itens: [
              {
                nome: 'Passeio de Escuna em Búzios',
                linhas: ['sáb., 14 nov. 2026 às 10h', '2 adultos'],
                pix: precoDoItem(idioma, 'R$ 135,00', '≈ US$ 24,50'),
                cartao: precoDoItem(idioma, 'R$ 150,00', '≈ US$ 27,20'),
              },
              {
                nome: 'Quadriciclo em Búzios',
                linhas: ['dom., 15 nov. 2026 às 9h', '1 quadriciclo'],
                pix: precoDoItem(idioma, 'R$ 135,00', '≈ US$ 24,50'),
                cartao: precoDoItem(idioma, 'R$ 120,00', '≈ US$ 21,80'),
              },
            ],
            totais: { pix: VALOR, cartao: VALOR },
            linkVoltar: 'https://orlanativa.online/api/carrinho/voltar?t=volta.assinada',
            linkSair: 'https://orlanativa.online/api/email/sair?t=sair.assinado',
            site: SITE,
          }),
        ] as [string, MensagemEmail],
    ),
  ];
}

/**
 * Os dados legais da empresa (razão social, número da empresa e endereço) só aparecem no rodapé do site, nos termos e
 * na privacidade: nunca num e-mail. As chaves são achadas pelo começo do nome, sem escrever o nome inteiro aqui
 * (tests/sem-cnpj.test.ts não deixa o nome desses campos fora daqueles três arquivos).
 */
const DADOS_LEGAIS = Object.entries(EMPRESA)
  .filter(([chave]) => /^(razao|endereco)/.test(chave) || chave === ['c', 'n', 'p', 'j'].join(''))
  .map(([, valor]) => String(valor));

/** O texto que o cliente vê no HTML, sem as marcas (o "e-mail" vai num <span> que não quebra a linha). */
const visivel = (html: string) => html.replace(/<[^>]+>/g, '');

test('os e-mails têm a mesma estrutura nos quatro idiomas, sem texto vazio e com os mesmos marcadores', () => {
  const folhas = (v: unknown, caminho = ''): [string, string][] =>
    typeof v === 'string' ? [[caminho, v]] : Object.entries(v as object).flatMap(([k, x]) => folhas(x, caminho ? `${caminho}.${k}` : k));
  const marcadores = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [nome, tabela] of [
    ['e-mails', TEXTOS_EMAIL],
    ['consulta', TEXTOS_CONSULTA],
  ] as const) {
    const base = new Map(folhas(tabela.pt));
    for (const idioma of IDIOMAS) {
      const aqui = folhas(tabela[idioma]);
      assert.deepEqual(
        aqui.map(([c]) => c),
        [...base.keys()],
        `${nome} ${idioma}: as chaves não batem com o português`,
      );
      for (const [caminho, texto] of aqui) {
        assert.ok(texto.trim(), `${nome} ${idioma} ${caminho}: vazio`);
        assert.deepEqual(marcadores(texto), marcadores(base.get(caminho) as string), `${nome} ${idioma} ${caminho}: marcadores`);
        assert.doesNotMatch(texto, /promo[cç]/i, `${nome} ${idioma} ${caminho}: nada de "promoção"`);
      }
    }
  }
});

test('cada e-mail, nos quatro idiomas: assunto, HTML e texto montados, sem marcador sobrando', () => {
  for (const idioma of IDIOMAS) {
    for (const [nome, m] of todos(idioma)) {
      const onde = `${nome} (${idioma})`;
      assert.ok(m.assunto.trim(), `${onde}: sem assunto`);
      for (const parte of [m.assunto, m.html, m.texto]) assert.doesNotMatch(parte, /\{\w+\}/, `${onde}: marcador sobrando`);
      assert.ok(m.html.startsWith('<!doctype html>'), onde);
      assert.ok(m.html.includes(`<html lang="${HREFLANG[idioma]}">`), `${onde}: idioma do HTML`);
      assert.ok(m.html.includes(`<title>${escaparHtml(m.assunto)}</title>`), `${onde}: título`);
      // a única imagem é o emblema, com o nome no texto alternativo: com as imagens bloqueadas o e-mail continua inteiro
      assert.equal(m.html.match(/<img\b/g)?.length, 1, `${onde}: uma imagem só`);
      assert.ok(m.html.includes('alt="Orla Nativa"'), `${onde}: texto alternativo do emblema`);
      for (const valor of DADOS_LEGAIS) {
        assert.ok(!m.html.includes(valor) && !m.texto.includes(valor), `${onde}: dado legal da empresa no e-mail (${valor})`);
      }
      assert.ok(m.texto.includes('orlanativa.online'), `${onde}: o site no texto`);
    }
  }
});

test('os e-mails do pedido levam o link privado no botão e no texto, e o código do pedido', () => {
  for (const idioma of IDIOMAS) {
    for (const [nome, m] of todos(idioma).filter(([n]) => !n.startsWith('lembrete'))) {
      assert.ok(m.html.includes(`href="${LINK_PEDIDO}"`), `${nome} (${idioma}): link no botão`);
      assert.ok(m.texto.includes(LINK_PEDIDO), `${nome} (${idioma}): link no texto`);
      assert.ok(m.html.includes('ON-7K3P9Q') && m.texto.includes('ON-7K3P9Q'), `${nome} (${idioma}): código`);
      assert.ok(m.assunto.includes('ON-7K3P9Q'), `${nome} (${idioma}): código no assunto`);
    }
  }
});

test('o que o cliente digitou nunca vira HTML nem link: na saudação, só o primeiro nome feito de letras', () => {
  // com marcação, o nome não serve: a saudação sai sem nome, e nada do que foi digitado entra no e-mail
  const m = emailPedidoRecebido({ ...pedido('pt'), caminho: 'online', totais: { cartao: VALOR } });
  assert.ok(!m.html.includes('<b>Ana</b>') && !m.html.includes('&lt;b&gt;Ana'), 'nada da marcação');
  assert.ok(visivel(m.html).includes('Olá.') && m.texto.includes('Olá.'), 'a saudação sem nome');
  assert.ok(!m.html.includes('Souza'));
  // o nome comum: só o primeiro
  const comNome = emailPedidoRecebido({ ...pedido('pt'), nome: 'Ana Souza', caminho: 'online', totais: { cartao: VALOR } });
  assert.ok(comNome.html.includes('Olá, Ana.') && !comNome.html.includes('Souza'));
  assert.equal(primeiroNome('  Maria   Clara Souza '), 'Maria');
  assert.equal(primeiroNome('   '), '');
  // letras com acento, hífen e apóstrofo valem; até 30
  for (const [nome, primeiro] of [
    ['María José', 'María'],
    ["D'Angelo Rossi", "D'Angelo"],
    ['Jean-Luc Picard', 'Jean-Luc'],
    ['João', 'João'],
    ['a'.repeat(30), 'a'.repeat(30)],
  ])
    assert.equal(nomeDaSaudacao(nome), primeiro, nome);
  // link, número, sinal, e-mail, nome comprido demais: sem nome
  for (const nome of [
    'https://orlanativa-reembolso.example/pix?pedido=ON-ABC123 Silva',
    'www.golpe.example Silva',
    'ON-ABC123',
    'Ana2',
    'ana@exemplo.com',
    '<b>Ana</b>',
    '-Ana',
    'a'.repeat(31),
    '',
  ])
    assert.equal(nomeDaSaudacao(nome), '', nome);
  const golpe = emailPedidoRecebido({
    ...pedido('es'),
    nome: 'https://orlanativa-reembolso.example/pix?pedido=ON-ABC123 Silva',
    caminho: 'online',
    totais: { cartao: VALOR },
  });
  assert.ok(!golpe.html.includes('reembolso.example') && !golpe.texto.includes('reembolso.example'), 'o link digitado não entra');
  assert.ok(golpe.texto.includes('Hola.'));
  // sem nome, a saudação sem nome (nada de "Hola, ." solto)
  const semNome = emailLinkDoPedido({ ...pedido('es'), nome: '' });
  assert.ok(!semNome.html.includes('Hola, .') && !semNome.texto.includes('Hola, .'));
  assert.ok(semNome.texto.includes(TEXTOS_EMAIL.es.comum.olaSemNome));
  assert.equal(escaparHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('a confirmação da desistência: a data e a hora de Brasília, o código, o que acontece agora e "se não foi você"', () => {
  for (const idioma of IDIOMAS) {
    const D = TEXTOS_EMAIL[idioma].desistencia;
    const m = emailDesistenciaRecebida({ ...pedido(idioma), quando: '13 de novembro de 2026 às 14:32' });
    assert.ok(m.assunto.includes('ON-7K3P9Q'), idioma);
    assert.ok(m.texto.includes('13 de novembro de 2026 às 14:32'), `${idioma}: a data e a hora`);
    assert.match(D.recebido, /Bras[ií]lia/, `${idioma}: o horário de Brasília`);
    // os 7 dias, o 1 dia útil e a política
    assert.match(D.agora, /7/, idioma);
    assert.match(D.agora, /1/, idioma);
    assert.ok(m.texto.includes(D.agora) && m.texto.includes(D.naoFoiVoce), idioma);
    // é o comprovante do cliente: os itens do pedido, sem voucher (o pedido continua pago até a equipe responder)
    assert.ok(m.texto.includes('Passeio de Escuna em Búzios') && !m.texto.includes('ON-AB2CD3'), idioma);
  }
});

test('o aviso da desistência para a equipe: o motivo entre « », o prazo, o link do painel, tudo escapado', () => {
  const m = emailAvisoDaDesistencia({
    codigo: 'ON-7K3P9Q',
    quando: '13 de novembro de 2026 às 14:32',
    prazo: 'dentro dos 7 dias do arrependimento (compra em 10/11/2026 09:00): reembolso integral',
    primeiroServico: 'sáb., 14 nov. 2026 às 09h00',
    motivo: "Mudei os planos <script>alert(1)</script> 'x'",
    linkPainel: 'https://orlanativa.online/admin?q=ON-7K3P9Q',
    site: SITE,
  });
  assert.equal(m.assunto, 'Desistência pelo site: pedido ON-7K3P9Q');
  assert.ok(m.html.includes('href="https://orlanativa.online/admin?q=ON-7K3P9Q"'));
  assert.ok(!m.html.includes('<script>'), 'o motivo nunca vira HTML');
  assert.ok(m.texto.includes("Motivo escrito pelo cliente: «Mudei os planos <script>alert(1)</script> 'x'»"));
  assert.ok(m.texto.includes('reembolso integral') && m.texto.includes('sáb., 14 nov. 2026'));
  assert.match(m.texto, /nunca para uma conta ou chave escrita no motivo/);
  for (const valor of DADOS_LEGAIS) assert.ok(!m.html.includes(valor) && !m.texto.includes(valor), valor);
  // sem motivo, a frase diz que não veio
  const semMotivo = emailAvisoDaDesistencia({
    codigo: 'ON-7K3P9Q',
    quando: 'x',
    prazo: 'y',
    primeiroServico: 'z',
    motivo: '',
    linkPainel: 'https://orlanativa.online/admin?q=ON-7K3P9Q',
    site: SITE,
  });
  assert.ok(semMotivo.texto.includes('O cliente não escreveu motivo.'));
});

test('os links do voucher no e-mail não quebram no meio ("Descargar el PDF" inteiro): só depois do "·"', () => {
  const m = emailPagamentoAprovado({ ...pedido('es', true), total: VALOR, anexos: false });
  const links = m.html.match(/<a href="https:\/\/orlanativa\.online\/(reserva|api\/voucher)\/[^"]+"[^>]*>/g) ?? [];
  assert.equal(links.length, 4, 'dois vouchers, dois links cada');
  for (const a of links) assert.match(a, /white-space:nowrap;/);
  assert.ok(m.html.includes('</a>&nbsp;&nbsp;·&nbsp; <a href='), 'o espaço comum depois do "·" é onde a linha quebra');
});

test('a cota do dia: passando de 60, só os essenciais saem; o mesmo endereço recebe no máximo 3 "pedido recebido"', async () => {
  zerarLimitesEmMemoria();
  delete process.env.SUPABASE_URL;
  // um dia longe de hoje, para não somar com os outros testes
  const dia = new Date('2030-01-15T12:00:00Z');
  const outroDia = new Date('2030-01-16T00:30:00Z');
  try {
    assert.equal(EMAILS_DO_DIA_ANTES_DE_GUARDAR, 60);
    for (let i = 0; i < EMAILS_DO_DIA_ANTES_DE_GUARDAR; i++) assert.equal(await cabeNaCotaDoDia('pedido-recebido', dia), true, `${i}`);
    for (const tipo of ['pedido-recebido', 'link-do-pedido', 'lembrete-1', 'lembrete-2'] as TipoEmail[]) {
      assert.equal(emailEssencial(tipo), false, tipo);
      assert.equal(await cabeNaCotaDoDia(tipo, dia), false, `${tipo}: guardado`);
    }
    for (const tipo of ['pagamento-aprovado', 'pix-vencido', 'desistencia-recebida', 'desistencia-equipe'] as TipoEmail[]) {
      assert.equal(emailEssencial(tipo), true, tipo);
      assert.equal(await cabeNaCotaDoDia(tipo, dia), true, `${tipo}: sempre sai`);
    }
    // o dia do Resend vira à meia-noite UTC: a contagem recomeça
    assert.equal(await cabeNaCotaDoDia('pedido-recebido', outroDia), true);
    // o mesmo endereço, sem diferença de maiúsculas: 3 por dia; outro endereço não conta
    assert.equal(PEDIDOS_RECEBIDOS_POR_ENDERECO, 3);
    for (let i = 0; i < 3; i++) assert.equal(await enderecoCabeNoDia(i % 2 ? 'Maria@Exemplo.com' : 'maria@exemplo.com', dia), true);
    assert.equal(await enderecoCabeNoDia('maria@exemplo.com ', dia), false);
    assert.equal(await enderecoCabeNoDia('joao@exemplo.com', dia), true);
    assert.equal(await enderecoCabeNoDia('maria@exemplo.com', outroDia), true);
    // a chave da contagem leva um resumo do endereço, nunca o e-mail
    assert.ok(!resumoDoEndereco('maria@exemplo.com').includes('maria'));
    assert.equal(resumoDoEndereco('Maria@Exemplo.com'), resumoDoEndereco(' maria@exemplo.com'));
  } finally {
    zerarLimitesEmMemoria();
  }
});

test('o WhatsApp da equipe só aparece no e-mail do pagamento aprovado', () => {
  for (const idioma of IDIOMAS) {
    for (const [nome, m] of todos(idioma)) {
      const tem = m.html.includes('wa.me') || m.texto.includes('wa.me');
      assert.equal(tem, nome === 'pagamento aprovado', `${nome} (${idioma})`);
    }
  }
  // sem o link (status que não mostra o WhatsApp), o pago também sai sem
  const semWhats = emailPagamentoAprovado({ ...pedido('pt', true), total: VALOR, anexos: false });
  assert.ok(!semWhats.html.includes('wa.me'));
  assert.ok(!visivel(semWhats.html).includes(TEXTOS_EMAIL.pt.pagamentoAprovado.anexos), 'sem anexos, sem a frase dos anexos');
});

test('pagamento aprovado: um voucher por item, cada um com o link e o PDF, e o total pago com a forma', () => {
  for (const idioma of IDIOMAS) {
    const T = TEXTOS_EMAIL[idioma];
    const m = emailPagamentoAprovado({ ...pedido(idioma, true), total: VALOR, forma: 'pix', anexos: true, whatsapp: 'https://wa.me/1' });
    for (const voucher of ['ON-AB2CD3', 'ON-EF4GH5']) {
      assert.ok(m.html.includes(`https://orlanativa.online/reserva/${voucher}?t=x`), `${idioma} ${voucher}: link`);
      assert.ok(m.html.includes(`https://orlanativa.online/api/voucher/${voucher}?t=x`), `${idioma} ${voucher}: PDF`);
      assert.ok(m.texto.includes(`${T.comum.voucher} ${voucher}`), `${idioma} ${voucher}: no texto`);
    }
    assert.ok(m.html.includes(escaparHtml(`${T.comum.totalPago} (${T.comum.formaPix})`)), idioma);
    assert.ok(m.html.includes('R$ 270,00') && m.html.includes('≈ US$ 49,10'), `${idioma}: valor e dólar`);
    assert.ok(visivel(m.html).includes(escaparHtml(T.pagamentoAprovado.anexos)), `${idioma}: a frase dos anexos`);
  }
});

test('pedido recebido: o caminho do WhatsApp manda abrir o pedido (sem o número); o online fala do pagamento', () => {
  for (const idioma of IDIOMAS) {
    const T = TEXTOS_EMAIL[idioma].pedidoRecebido;
    const whats = emailPedidoRecebido({ ...pedido(idioma), caminho: 'whatsapp', totais: { pix: VALOR, cartao: VALOR } });
    const online = emailPedidoRecebido({ ...pedido(idioma), caminho: 'online', totais: { cartao: VALOR } });
    assert.ok(whats.texto.includes(T.textoWhatsapp) && !whats.texto.includes(T.textoOnline), idioma);
    assert.ok(online.texto.includes(T.textoOnline) && online.texto.includes(T.notaOnline), idioma);
    assert.ok(
      !whats.html.includes(EMPRESA.whatsapp) && !whats.html.includes(EMPRESA.telefoneExibicao),
      `${idioma}: o número nunca vai antes do pagamento`,
    );
    // o online mostra só o total da forma escolhida
    assert.ok(
      online.texto.includes(TEXTOS_EMAIL[idioma].comum.totalNoCartao) && !online.texto.includes(TEXTOS_EMAIL[idioma].comum.totalNoPix),
    );
  }
});

test('o lembrete do carrinho: os itens com o preço (e o ≈ US$ em es e en), o botão de voltar e o link de sair da lista', () => {
  for (const idioma of IDIOMAS) {
    const L = TEXTOS_EMAIL[idioma].lembrete;
    const [, um] = todos(idioma).find(([n]) => n === 'lembrete 1') as [string, MensagemEmail];
    const [, dois] = todos(idioma).find(([n]) => n === 'lembrete 2') as [string, MensagemEmail];
    assert.equal(um.assunto, L.assunto1);
    assert.equal(dois.assunto, L.assunto2);
    const dolar = (texto: string) => (idioma === 'pt' ? '' : ` (${texto})`);
    for (const m of [um, dois]) {
      assert.ok(m.html.includes('href="https://orlanativa.online/api/carrinho/voltar?t=volta.assinada"'), idioma);
      assert.ok(m.html.includes('href="https://orlanativa.online/api/email/sair?t=sair.assinado"'), idioma);
      assert.ok(m.html.includes(escaparHtml(L.sair)) && m.texto.includes(L.sair), `${idioma}: sair da lista`);
      // o preço de cada item nas formas que valem, com o aproximado em dólar ao lado em espanhol e inglês
      assert.ok(
        m.texto.includes(`R$ 135,00 ${L.noPix}${dolar('≈ US$ 24,50')} · R$ 150,00 ${L.noCartao}${dolar('≈ US$ 27,20')}`),
        `${idioma}: preço nas duas formas`,
      );
      // quem já reservou por outro caminho pode ignorar
      assert.ok(m.texto.includes(L.jaReservou) && visivel(m.html).includes(escaparHtml(L.jaReservou)), `${idioma}: já reservou`);
      // nada de urgência falsa
      assert.doesNotMatch(m.texto, /últimas? (vagas|plazas)|last chance|hurry|apresse|date prisa|antes que acabe/i, idioma);
    }
    // com um item só, o preço do item é o total de baixo: não se repete na linha do item
    const umItem = emailLembrete({
      idioma,
      n: 1,
      itens: [
        {
          nome: 'Passeio de Escuna em Búzios',
          linhas: ['2 adultos'],
          pix: { valor: 'R$ 135,00' },
          cartao: { valor: 'R$ 150,00' },
        },
      ],
      totais: { pix: VALOR, cartao: VALOR },
      linkVoltar: 'https://x/voltar',
      linkSair: 'https://x/sair',
      site: SITE,
    });
    assert.ok(!umItem.texto.includes(`R$ 135,00 ${L.noPix}`), `${idioma}: preço repetido`);
    // fora do prazo (ou acima do limite) do Pix, o lembrete não oferece o preço no Pix: só o cartão
    const semPix = emailLembrete({
      idioma,
      n: 1,
      itens: [
        { nome: 'Passeio de Escuna em Búzios', linhas: ['2 adultos'], cartao: { valor: 'R$ 150,00' } },
        { nome: 'Quadriciclo em Búzios', linhas: ['1 quadriciclo'], cartao: { valor: 'R$ 120,00' } },
      ],
      totais: { cartao: VALOR },
      linkVoltar: 'https://x/voltar',
      linkSair: 'https://x/sair',
      site: SITE,
    });
    const C = TEXTOS_EMAIL[idioma].comum;
    assert.ok(!semPix.texto.includes(L.noPix) && !semPix.texto.includes(C.totalNoPix), `${idioma}: sem o Pix`);
    assert.ok(semPix.texto.includes(`R$ 150,00 ${L.noCartao}`) && semPix.texto.includes(C.totalNoCartao), `${idioma}: o cartão`);
  }
  // o "e-mail" nunca quebra no hífen no celular
  const recebido = emailPedidoRecebido({ ...pedido('pt'), caminho: 'online', totais: { cartao: VALOR } });
  assert.ok(recebido.html.includes('<span style="white-space:nowrap;">e-mail</span>'));
  assert.ok(
    !/[^>]e-mail/.test(recebido.html.replace(/<title>.*<\/title>/, '').replace(/href="[^"]*"/g, '')),
    'todo "e-mail" do texto vai inteiro',
  );
  assert.deepEqual(cabecalhosDeSair('https://orlanativa.online/api/email/sair?t=x'), {
    'List-Unsubscribe': '<https://orlanativa.online/api/email/sair?t=x>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  });
});

/* ------------------------------------------------------------------ */
/* O envio pelo Resend                                                  */

const EMAIL: EmailParaEnviar = {
  tipo: 'pagamento-aprovado',
  referencia: 'ON-7K3P9Q',
  para: 'cliente@exemplo.com',
  assunto: 'Pagamento aprovado: pedido ON-7K3P9Q',
  html: '<p>oi</p>',
  texto: 'oi',
  chave: 'pagamento-aprovado/ON-7K3P9Q',
};

/** Um fetch de mentira que responde em sequência e guarda o que recebeu. */
function fetchFalso(respostas: { status: number; corpo: unknown }[]) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  let n = 0;
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    chamadas.push({ url: String(url), init: init ?? {} });
    const r = respostas[Math.min(n++, respostas.length - 1)];
    return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  };
  return { chamadas, fetch: fetch as typeof globalThis.fetch };
}
const semEspera = async () => {};

test('sem RESEND_API_KEY nada sai: nenhuma chamada, e o registro leva só o tipo do e-mail e o código do pedido', async (t) => {
  delete process.env.RESEND_API_KEY;
  const log = t.mock.method(console, 'log', () => {});
  const falso = fetchFalso([{ status: 200, corpo: { id: 'x' } }]);
  assert.equal(emailLigado(), false);
  const r = await enviarEmail(EMAIL, { fetch: falso.fetch, esperar: semEspera });
  assert.deepEqual(r, { enviado: false, motivo: 'desligado' });
  assert.equal(falso.chamadas.length, 0);
  assert.equal(log.mock.callCount(), 1);
  const linha = String(log.mock.calls[0].arguments[0]);
  assert.match(linha, /pagamento-aprovado ON-7K3P9Q/);
  for (const pessoal of [EMAIL.para, EMAIL.assunto, 'oi']) assert.ok(!linha.includes(pessoal), `o registro não leva "${pessoal}"`);
  assert.equal(saiu(r), false);
  assert.equal(falhaDaConta(r), true);
});

test('com a chave: o corpo e os cabeçalhos que o Resend recebe (remetente, resposta, idempotência, anexos)', async (t) => {
  process.env.RESEND_API_KEY = 're_teste_123';
  t.mock.method(console, 'log', () => {});
  try {
    assert.equal(emailLigado(), true);
    assert.equal(remetente(), REMETENTE_PADRAO);
    assert.equal(responderPara(), EMPRESA.email);
    const falso = fetchFalso([{ status: 200, corpo: { id: 'email_1' } }]);
    const r = await enviarEmail(
      {
        ...EMAIL,
        anexos: [{ nome: 'voucher-ON-AB2CD3.pdf', conteudo: new Uint8Array([37, 80, 68, 70]) }],
        cabecalhos: cabecalhosDeSair('https://x/sair'),
      },
      { fetch: falso.fetch, esperar: semEspera },
    );
    assert.deepEqual(r, { enviado: true, id: 'email_1' });
    assert.equal(falso.chamadas.length, 1);
    const { url, init } = falso.chamadas[0];
    assert.equal(url, URL_RESEND);
    assert.equal(init.method, 'POST');
    const cab = init.headers as Record<string, string>;
    assert.equal(cab.Authorization, 'Bearer re_teste_123');
    assert.equal(cab['Idempotency-Key'], 'pagamento-aprovado/ON-7K3P9Q');
    assert.ok(cab['User-Agent'], 'o Resend recusa chamada sem User-Agent');
    const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
    assert.equal(corpo.from, REMETENTE_PADRAO);
    assert.deepEqual(corpo.to, ['cliente@exemplo.com']);
    assert.equal(corpo.reply_to, EMPRESA.email);
    assert.equal(corpo.text, 'oi');
    assert.deepEqual(corpo.attachments, [{ filename: 'voucher-ON-AB2CD3.pdf', content: 'JVBERg==' }]);
    assert.deepEqual(corpo.headers, cabecalhosDeSair('https://x/sair'));
    assert.deepEqual(corpo.tags, [{ name: 'tipo', value: 'pagamento-aprovado' }]);

    process.env.EMAIL_REMETENTE = 'Orla Nativa <ola@exemplo.com>';
    process.env.EMAIL_RESPOSTA = 'equipe@exemplo.com';
    const outro = corpoDoEnvio(EMAIL);
    assert.equal(outro.from, 'Orla Nativa <ola@exemplo.com>');
    assert.equal(outro.reply_to, 'equipe@exemplo.com');
  } finally {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_REMETENTE;
    delete process.env.EMAIL_RESPOSTA;
  }
});

test('as respostas do Resend: repetido conta como enviado; cota e falha param o lote; endereço recusado não', async (t) => {
  process.env.RESEND_API_KEY = 're_teste_123';
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  try {
    const enviar = (respostas: { status: number; corpo: unknown }[]) => {
      const falso = fetchFalso(respostas);
      return enviarEmail(EMAIL, { fetch: falso.fetch, esperar: semEspera }).then((r) => ({ r, chamadas: falso.chamadas.length }));
    };
    // a mesma chave ainda saindo por outra chamada: tenta de novo e recebe o id do e-mail original
    const concorrente = await enviar([
      { status: 409, corpo: { name: 'concurrent_idempotent_requests' } },
      { status: 200, corpo: { id: 'email_original' } },
    ]);
    assert.deepEqual(concorrente, { r: { enviado: true, id: 'email_original' }, chamadas: 2 });
    // a chave já usada (com outro conteúdo): o e-mail já saiu
    const repetido = await enviar([{ status: 409, corpo: { name: 'invalid_idempotent_request' } }]);
    assert.equal(repetido.chamadas, 1);
    assert.equal(saiu(repetido.r), true);
    // a cota do dia acabou: não tenta de novo, e o lote para
    const cota = await enviar([{ status: 429, corpo: { name: 'daily_quota_exceeded' } }]);
    assert.equal(cota.chamadas, 1);
    assert.equal(!cota.r.enviado && cota.r.motivo, 'cota');
    assert.equal(falhaDaConta(cota.r), true);
    // o Resend fora do ar: tenta duas vezes e desiste
    const fora = await enviar([{ status: 500, corpo: { name: 'application_error' } }]);
    assert.equal(fora.chamadas, 2);
    assert.equal(!fora.r.enviado && fora.r.motivo, 'falha');
    assert.equal(falhaDaConta(fora.r), true);
    // o endereço deste e-mail não presta: só este e-mail falha
    const endereco = await enviar([{ status: 422, corpo: { name: 'validation_error' } }]);
    assert.equal(!endereco.r.enviado && endereco.r.motivo, 'recusado');
    assert.equal(falhaDaConta(endereco.r), false);
    // o domínio não verificado ou a chave sem permissão: problema da conta
    const dominio = await enviar([{ status: 403, corpo: { name: 'validation_error' } }]);
    assert.equal(falhaDaConta(dominio.r), true);
  } finally {
    delete process.env.RESEND_API_KEY;
  }
});

test('o envio respeita a cota do dia: guardada, o e-mail não vai ao Resend e o lote dos lembretes para', async (t) => {
  process.env.RESEND_API_KEY = 're_teste_123';
  t.mock.method(console, 'log', () => {});
  const erro = t.mock.method(console, 'error', () => {});
  try {
    const falso = fetchFalso([{ status: 200, corpo: { id: 'x' } }]);
    const tipos: TipoEmail[] = [];
    const r = await enviarEmail(
      { ...EMAIL, tipo: 'lembrete-1', chave: 'lembrete-1/x' },
      {
        fetch: falso.fetch,
        esperar: semEspera,
        cota: async (tipo) => {
          tipos.push(tipo);
          return false;
        },
      },
    );
    assert.deepEqual(tipos, ['lembrete-1']);
    assert.equal(falso.chamadas.length, 0, 'nada vai ao Resend');
    assert.deepEqual(r, { enviado: false, motivo: 'cota', detalhe: 'guardada' });
    assert.equal(falhaDaConta(r), true, 'o lote para e o lembrete volta para a fila');
    assert.ok(!String(erro.mock.calls[0]?.arguments[0]).includes(EMAIL.para), 'o registro não leva o e-mail');
    // a contagem que falha deixa o e-mail sair
    const outro = fetchFalso([{ status: 200, corpo: { id: 'email_2' } }]);
    const r2 = await enviarEmail(EMAIL, {
      fetch: outro.fetch,
      esperar: semEspera,
      cota: async () => {
        throw new Error('banco fora');
      },
    });
    assert.deepEqual(r2, { enviado: true, id: 'email_2' });
  } finally {
    delete process.env.RESEND_API_KEY;
  }
});
