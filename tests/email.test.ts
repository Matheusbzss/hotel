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
  emailLembrete,
  emailLinkDoPedido,
  emailPagamentoAprovado,
  emailPedidoRecebido,
  emailPixVencido,
  primeiroNome,
  type DadosDoPedido,
  type MensagemEmail,
} from '../src/lib/email/mensagens.ts';
import { escaparHtml } from '../src/lib/email/modelo.ts';
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

/** Todos os e-mails de um idioma, com o nome de cada um. */
function todos(idioma: Idioma): [string, MensagemEmail][] {
  return [
    ['pedido recebido (WhatsApp)', emailPedidoRecebido({ ...pedido(idioma), caminho: 'whatsapp', totais: { pix: VALOR, cartao: VALOR } })],
    ['pedido recebido (online)', emailPedidoRecebido({ ...pedido(idioma), caminho: 'online', totais: { pix: VALOR } })],
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
                pix: 'R$ 135,00',
                cartao: 'R$ 150,00',
              },
              {
                nome: 'Quadriciclo em Búzios',
                linhas: ['dom., 15 nov. 2026 às 9h', '1 quadriciclo'],
                pix: 'R$ 135,00',
                cartao: 'R$ 120,00',
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

test('o que o cliente digitou nunca vira HTML: só o primeiro nome, escapado', () => {
  const m = emailPedidoRecebido({ ...pedido('pt'), caminho: 'online', totais: { cartao: VALOR } });
  assert.ok(!m.html.includes('<b>Ana</b>'));
  assert.ok(m.html.includes('Olá, &lt;b&gt;Ana&lt;/b&gt;.'));
  assert.ok(!m.html.includes('Souza'), 'só o primeiro nome');
  assert.equal(primeiroNome('  Maria   Clara Souza '), 'Maria');
  assert.equal(primeiroNome('   '), '');
  // sem nome, sem saudação (nada de "Olá, ." solto)
  const semNome = emailLinkDoPedido({ ...pedido('es'), nome: '' });
  assert.ok(!semNome.html.includes('Hola, .') && !semNome.texto.includes('Hola, .'));
  assert.equal(escaparHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
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

test('o lembrete do carrinho: os itens com o preço nas duas formas, o botão de voltar e o link de sair da lista', () => {
  for (const idioma of IDIOMAS) {
    const L = TEXTOS_EMAIL[idioma].lembrete;
    const [, um] = todos(idioma).find(([n]) => n === 'lembrete 1') as [string, MensagemEmail];
    const [, dois] = todos(idioma).find(([n]) => n === 'lembrete 2') as [string, MensagemEmail];
    assert.equal(um.assunto, L.assunto1);
    assert.equal(dois.assunto, L.assunto2);
    for (const m of [um, dois]) {
      assert.ok(m.html.includes('href="https://orlanativa.online/api/carrinho/voltar?t=volta.assinada"'), idioma);
      assert.ok(m.html.includes('href="https://orlanativa.online/api/email/sair?t=sair.assinado"'), idioma);
      assert.ok(m.html.includes(escaparHtml(L.sair)) && m.texto.includes(L.sair), `${idioma}: sair da lista`);
      assert.ok(m.texto.includes(`R$ 135,00 ${L.noPix} · R$ 150,00 ${L.noCartao}`), `${idioma}: preço nas duas formas`);
      // nada de urgência falsa
      assert.doesNotMatch(m.texto, /últimas? (vagas|plazas)|last chance|hurry|apresse|date prisa|antes que acabe/i, idioma);
    }
    // com um item só, o preço do item é o total de baixo: não se repete na linha do item
    const umItem = emailLembrete({
      idioma,
      n: 1,
      itens: [{ nome: 'Passeio de Escuna em Búzios', linhas: ['2 adultos'], pix: 'R$ 135,00', cartao: 'R$ 150,00' }],
      totais: { pix: VALOR, cartao: VALOR },
      linkVoltar: 'https://x/voltar',
      linkSair: 'https://x/sair',
      site: SITE,
    });
    assert.ok(!umItem.texto.includes(`R$ 135,00 ${L.noPix}`), `${idioma}: preço repetido`);
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
