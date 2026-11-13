import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caminhoDoAviso, lerAvisosCsp, origemDoBloqueio } from '../src/lib/csp.ts';

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

test('origemDoBloqueio: só a origem, nunca o caminho nem os parâmetros', () => {
  assert.equal(origemDoBloqueio('https://exemplo.com/x.js?email=a@b.com'), 'https://exemplo.com');
  assert.equal(origemDoBloqueio('inline'), 'inline');
  assert.equal(origemDoBloqueio('data:image/png;base64,AAAA'), 'data');
  assert.equal(origemDoBloqueio(''), '?');
});

test('caminhoDoAviso: sem parâmetros e sem o código do pedido', () => {
  assert.equal(caminhoDoAviso('https://orlanativa.online/es/pedido/ON-ABC123?t=segredo'), '/es/pedido/:codigo');
  assert.equal(caminhoDoAviso('https://orlanativa.online/reserva/ON-XYZ999?t=1#topo'), '/reserva/:codigo');
  assert.equal(caminhoDoAviso('https://orlanativa.online/es/paseos'), '/es/paseos');
});
