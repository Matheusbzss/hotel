import { test } from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config.ts';
import {
  TAMANHO_MAXIMO_AVISO,
  caminhoDoAviso,
  hostsDaRequisicao,
  lerAvisosCsp,
  lerCorpoAte,
  linhaDoAviso,
  origemDoBloqueio,
  regraDoAviso,
} from '../src/lib/csp.ts';

test('lerAvisosCsp: formato antigo do report-uri', () => {
  const corpo = JSON.stringify({
    'csp-report': {
      'document-uri': 'https://orlanativa.online/es/pedido/ON-ABC123?t=segredo',
      'violated-directive': 'script-src-elem',
      'effective-directive': 'script-src-elem',
      'blocked-uri': 'https://exemplo.com/x.js?id=1',
    },
  });
  assert.deepEqual(lerAvisosCsp(corpo), [
    {
      regra: 'script-src-elem',
      bloqueado: 'https://exemplo.com/x.js?id=1',
      pagina: 'https://orlanativa.online/es/pedido/ON-ABC123?t=segredo',
    },
  ]);
});

test('lerAvisosCsp: formato novo da Reporting API e lixo', () => {
  const corpo = JSON.stringify([
    { type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'data', documentURL: 'https://orlanativa.online/' } },
    { type: 'deprecation', body: {} },
    7,
  ]);
  assert.deepEqual(lerAvisosCsp(corpo), [{ regra: 'img-src', bloqueado: 'data', pagina: 'https://orlanativa.online/' }]);
  assert.deepEqual(lerAvisosCsp('não é json'), []);
});

test('origemDoBloqueio: só a origem, o esquema ou a palavra do navegador; o resto vira "outro"', () => {
  assert.equal(origemDoBloqueio('https://exemplo.com/x.js?email=a@b.com'), 'https://exemplo.com');
  assert.equal(origemDoBloqueio('wss://exemplo.com:8443/canal'), 'wss://exemplo.com:8443');
  assert.equal(origemDoBloqueio('inline'), 'inline');
  assert.equal(origemDoBloqueio('wasm-eval'), 'wasm-eval');
  assert.equal(origemDoBloqueio('data:image/png;base64,AAAA'), 'data');
  assert.equal(origemDoBloqueio('chrome-extension://abcdef/injetado.js'), 'chrome-extension');
  assert.equal(origemDoBloqueio(''), '?');
  // o que não é endereço nem palavra do navegador pode ser um e-mail ou um texto inventado: nunca vai para o registro
  assert.equal(origemDoBloqueio('revisor@example.com nao-e-url'), 'outro');
  assert.equal(origemDoBloqueio('linha\n[email] pagamento-aprovado ON-FALSO1: enviado'), 'outro');
  // um esquema comprido é cortado
  assert.ok(origemDoBloqueio(`${'a'.repeat(300)}:x`).length <= 40);
});

test('regraDoAviso: só letras minúsculas e hífen, com até 40 letras', () => {
  assert.equal(regraDoAviso('script-src-elem'), 'script-src-elem');
  assert.equal(regraDoAviso('require-trusted-types-for'), 'require-trusted-types-for');
  assert.equal(regraDoAviso('X\n[email] pagamento-aprovado ON-FALSO1: enviado'), '?');
  assert.equal(regraDoAviso('img-src https://exemplo.com'), '?');
  assert.equal(regraDoAviso('a'.repeat(41)), '?');
  assert.equal(regraDoAviso(''), '?');
});

test('caminhoDoAviso: sem parâmetros e sem o código do pedido; só de um endereço da web', () => {
  assert.equal(caminhoDoAviso('https://orlanativa.online/es/pedido/ON-ABC123?t=segredo'), '/es/pedido/:codigo');
  assert.equal(caminhoDoAviso('https://orlanativa.online/reserva/ON-XYZ999?t=1#topo'), '/reserva/:codigo');
  assert.equal(caminhoDoAviso('https://orlanativa.online/es/paseos'), '/es/paseos');
  // o que não é endereço da web vira "?" (antes, o texto cru ia para o registro)
  assert.equal(caminhoDoAviso('revisor@example.com'), '?');
  assert.equal(caminhoDoAviso('javascript:alert(1)'), '?');
  assert.equal(caminhoDoAviso(''), '?');
  // a quebra de linha nunca chega crua: o leitor de endereços a tira ou a deixa codificada
  assert.ok(!/[\r\n]/.test(caminhoDoAviso('https://orlanativa.online/a\nb%0Ac')));
  assert.ok(caminhoDoAviso(`https://orlanativa.online/${'x'.repeat(500)}`).length <= 120);
});

const SITE = ['orlanativa.online'];

test('linhaDoAviso: uma linha só, curta, sem caractere de controle, e só das páginas deste site', () => {
  const aviso = {
    regra: 'script-src-elem',
    bloqueado: 'https://exemplo.com/x.js?id=1',
    pagina: 'https://orlanativa.online/es/pedido/ON-ABC123?t=segredo',
  };
  assert.equal(linhaDoAviso(aviso, SITE), '[csp] script-src-elem bloquearia https://exemplo.com em /es/pedido/:codigo');
  // o ataque da revisão: uma quebra de linha na regra escreveria uma linha falsa no registro; um e-mail no bloqueado
  const forjado = linhaDoAviso(
    {
      regra: 'X\n[email] pagamento-aprovado ON-FALSO1: enviado (linha forjada pelo revisor)',
      bloqueado: 'revisor@example.com nao-e-url',
      pagina: 'https://orlanativa.online/',
    },
    SITE,
  );
  assert.equal(forjado, '[csp] ? bloquearia outro em /');
  // nada fora do ASCII visível, mesmo com o que vier
  const estranho = linhaDoAviso({ regra: 'img-src', bloqueado: 'https://exémplo.com/ x', pagina: 'https://orlanativa.online/ç ' }, SITE);
  assert.ok(estranho && /^[\x20-\x7e]+$/.test(estranho), String(estranho));
  // a página de outro site (que apontou os avisos dele para cá), ou o que não é endereço da web: fica de fora
  assert.equal(linhaDoAviso({ ...aviso, pagina: 'https://outro-site.example/' }, SITE), null);
  assert.equal(linhaDoAviso({ ...aviso, pagina: 'about:blank' }, SITE), null);
  assert.equal(linhaDoAviso({ ...aviso, pagina: '' }, SITE), null);
  // no computador e na prévia, o host com a porta, como a requisição chegou
  assert.ok(linhaDoAviso({ ...aviso, pagina: 'http://localhost:3000/checkout' }, ['localhost:3000']));
});

test('hostsDaRequisicao: o host da URL e o do cabeçalho Host', () => {
  const req = new Request('http://localhost:3000/api/csp', { method: 'POST', headers: { host: 'Orlanativa.online' } });
  assert.deepEqual(hostsDaRequisicao(req).sort(), ['localhost:3000', 'orlanativa.online']);
});

test('lerCorpoAte: lê o aviso pequeno; o grande é recusado pelo Content-Length ou contando o que chega', async () => {
  const url = 'https://orlanativa.online/api/csp';
  assert.equal(await lerCorpoAte(new Request(url, { method: 'POST', body: '{"a":1}' })), '{"a":1}');
  assert.equal(await lerCorpoAte(new Request(url, { method: 'POST' })), '');
  // o tamanho dito no cabeçalho já basta para recusar, sem ler nada
  const declarado = new Request(url, { method: 'POST', body: 'x', headers: { 'content-length': String(8_000_000) } });
  assert.equal(await lerCorpoAte(declarado), null);
  // sem o tamanho dito, a leitura para assim que passa do teto, sem ler o resto
  let pedacosLidos = 0;
  const pedaco = new Uint8Array(4_096).fill(120);
  const fluxo = new ReadableStream<Uint8Array>({
    pull(controle) {
      pedacosLidos++;
      if (pedacosLidos > 2_000) controle.close();
      else controle.enqueue(pedaco);
    },
  });
  const semTamanho = new Request(url, { method: 'POST', body: fluxo, duplex: 'half' } as RequestInit);
  assert.equal(await lerCorpoAte(semTamanho), null);
  assert.ok(pedacosLidos < 20, `leu ${pedacosLidos} pedaços`);
  assert.equal(TAMANHO_MAXIMO_AVISO, 20_000);
});

test('o Permissions-Policy de todas as páginas: o pagamento pelo navegador (Google Pay, Apple Pay) só para o site e para a Stripe', async () => {
  // A documentação da Stripe (docs.stripe.com/google-pay?platform=web) pede, nas páginas que mostram o botão do Google Pay,
  // `Permissions-Policy: payment=(self "https://js.stripe.com" "https://checkout.stripe.com")`: alguns navegadores, entre
  // eles o Chrome do Android, exigem o próprio site (self) na lista do payment (Pacote 18, 18/11). O formulário embutido
  // aparece no checkout, no pedido e na reserva: o cabeçalho vale para todas as páginas, com o que já fechava câmera,
  // microfone e localização
  assert.ok(nextConfig.headers, 'os cabeçalhos do next.config.ts');
  const regras = await nextConfig.headers();
  const todas = regras.find((r) => r.source === '/(.*)');
  assert.ok(todas, 'a regra de todas as páginas');
  const permissoes = todas.headers.filter((h) => h.key === 'Permissions-Policy');
  assert.equal(permissoes.length, 1);
  assert.equal(
    permissoes[0].value,
    'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com" "https://checkout.stripe.com")',
  );
  // nenhuma outra regra muda o Permissions-Policy (no Next, a última que bate vence)
  assert.equal(regras.flatMap((r) => r.headers).filter((h) => h.key === 'Permissions-Policy').length, 1);
  // cada recurso numa diretiva só, e o pagamento só para o próprio site e para os dois endereços dos quadros da Stripe
  const diretivas = Object.fromEntries(permissoes[0].value.split(/,\s*/).map((d) => d.split(/=(.*)/s).slice(0, 2)));
  assert.deepEqual(diretivas, {
    camera: '()',
    microphone: '()',
    geolocation: '()',
    payment: '(self "https://js.stripe.com" "https://checkout.stripe.com")',
  });
  // os dois endereços são quadros que a política de segurança (em aviso) já deixa abrir
  const csp = todas.headers.find((h) => h.key === 'Content-Security-Policy-Report-Only')?.value ?? '';
  const quadros = csp.split('; ').find((d) => d.startsWith('frame-src ')) ?? '';
  for (const origem of ['https://js.stripe.com', 'https://checkout.stripe.com']) assert.ok(quadros.split(' ').includes(origem), origem);
});
