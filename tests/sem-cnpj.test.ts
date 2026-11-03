import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// Nenhum CNPJ no site (regra do CLAUDE.md): nem em texto, rodapé, políticas, voucher, metadados ou dados
// estruturados. Tudo o que vira página, PDF ou texto sai destas pastas. Quando chegar o CNPJ novo, ele
// volta só no rodapé e nos termos, e este teste muda junto.

const PASTAS = ['src', 'public', 'scripts', 'tests'];
// os dois conferidores precisam citar o que procuram
const CONFERIDORES = [path.join('tests', 'sem-cnpj.test.ts'), path.join('scripts', 'conferir-sem-cnpj.mjs')];
const TEXTO = /\.(ts|tsx|js|mjs|cjs|jsx|json|md|css|html|txt|xml|svg|webmanifest)$/i;

/** O número com pontuação: 00.000.000/0000-00 ou 00000000/0000-00. */
const FORMATADO = /(?<![\d.])(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{8}\/\d{4}-\d{2})(?!\d)/;
/** 14 dígitos juntos, fora de um número decimal (a posição de um pino no mapa tem 14 casas depois da vírgula). */
const JUNTOS = /(?<![\d.,])\d{14}(?!\d|[.,]\d)/g;
const PALAVRA = /cnpj/i;
// a palavra num comentário de código não aparece no site; o número não pode estar em lugar nenhum
const COMENTARIO = /^\s*(\/\/|\/?\*)/;

/** Os dois dígitos verificadores batem: os 14 dígitos formam um CNPJ. */
function digitosBatem(n: string): boolean {
  if (/^(\d)\1+$/.test(n)) return false;
  const verificador = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = [...base].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = verificador(n.slice(0, 12));
  return n.endsWith(`${d1}${verificador(n.slice(0, 12) + d1)}`);
}

const temNumero = (linha: string) => FORMATADO.test(linha) || [...linha.matchAll(JUNTOS)].some((m) => digitosBatem(m[0]));

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    return e.isDirectory() ? arquivos(caminho) : [caminho];
  });
}

test('nenhum CNPJ, nem a palavra nem o número, no que vira página, voucher ou texto do site', () => {
  const achados: string[] = [];
  for (const arquivo of PASTAS.flatMap(arquivos)) {
    if (CONFERIDORES.includes(arquivo) || !TEXTO.test(arquivo)) continue;
    readFileSync(arquivo, 'utf8')
      .split('\n')
      .forEach((linha, i) => {
        if (temNumero(linha) || (PALAVRA.test(linha) && !COMENTARIO.test(linha))) {
          achados.push(`${arquivo}:${i + 1}: ${linha.trim().slice(0, 120)}`);
        }
      });
  }
  assert.deepEqual(achados, []);
});

test('o teste reconhece o número com e sem pontuação, e não confunde com outros números', () => {
  for (const exemplo of ['11.222.333/0001-81', '11222333/0001-81', '"11222333000181"']) assert.ok(temNumero(`x ${exemplo} x`), exemplo);
  for (const outro of ['--x:86.89378750843586%', '89378750843586', '1793299954033', '+55 21 99050-2377', 'ON-7K3P9Q']) {
    assert.ok(!temNumero(outro), outro);
  }
});
