import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { EMPRESA } from '../src/config/empresa.ts';

// O CNPJ da empresa aparece no rodapé, nos termos de uso e na política de privacidade (Decreto 7.962/2013)
// e é o único que pode aparecer. O número só é digitado em src/config/empresa.ts; quem mostra lê de lá.

/** Escrito aqui de propósito: se trocarem um dígito em empresa.ts, o teste avisa. */
const OFICIAL = '69.664.651/0001-82';
const DIGITOS = OFICIAL.replace(/\D/g, '');

const FONTE = path.join('src', 'config', 'empresa.ts');
const RODAPE = path.join('src', 'components', 'Rodape.tsx');
const TERMOS = path.join('src', 'content', 'legal', 'termos.ts');
const PRIVACIDADE = path.join('src', 'content', 'legal', 'privacidade.ts');
/** Só estes arquivos falam em CNPJ, razão social e endereço. Em outro lugar (voucher, e-mail, dados para o Google), só se o dono pedir. */
const PODEM = [FONTE, RODAPE, TERMOS, PRIVACIDADE];

const PASTAS = ['src', 'public', 'scripts', 'tests'];
// os dois conferidores precisam citar o que procuram
const CONFERIDORES = [path.join('tests', 'sem-cnpj.test.ts'), path.join('scripts', 'conferir-sem-cnpj.mjs')];
const TEXTO = /\.(ts|tsx|js|mjs|cjs|jsx|json|md|css|html|txt|xml|svg|webmanifest)$/i;

/** O número com pontuação: 00.000.000/0000-00 ou 00000000/0000-00. */
const FORMATADO = /(?<![\d.])(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{8}\/\d{4}-\d{2})(?!\d)/g;
/** 14 dígitos juntos, fora de um número decimal (a posição de um pino no mapa tem 14 casas depois da vírgula). */
const JUNTOS = /(?<![\d.,])\d{14}(?!\d|[.,]\d)/g;
// a frase inteira: só 'ltda' acharia altDaFoto
const PALAVRA = /cnpj|razaoSocial|enderecoRua|enderecoCidade|enderecoCompleto|orla nativa ltda|travessa dos pescadores/i;
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

/** Todos os CNPJs do texto, só os dígitos: o da empresa não pode esconder outro na mesma linha. */
const numeros = (texto: string) => [
  ...[...texto.matchAll(FORMATADO)].map((m) => m[0].replace(/\D/g, '')),
  ...[...texto.matchAll(JUNTOS)].map((m) => m[0]).filter(digitosBatem),
];

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    return e.isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const LINHAS = PASTAS.flatMap(arquivos)
  .filter((a) => !CONFERIDORES.includes(a) && TEXTO.test(a))
  .flatMap((arquivo) =>
    readFileSync(arquivo, 'utf8')
      .split('\n')
      .map((linha, i) => ({ arquivo, linha, onde: `${arquivo}:${i + 1}: ${linha.trim().slice(0, 120)}` })),
  );

test('o CNPJ de src/config/empresa.ts é o da empresa', () => {
  assert.equal(EMPRESA.cnpj, OFICIAL);
  assert.ok(digitosBatem(DIGITOS));
});

test('nenhum outro CNPJ no projeto, e o da empresa só é digitado em empresa.ts', () => {
  const achados = LINHAS.filter(({ arquivo, linha }) => numeros(linha).some((n) => n !== DIGITOS || arquivo !== FONTE));
  assert.deepEqual(
    achados.map((l) => l.onde),
    [],
  );
});

test('só o rodapé, os termos e a política de privacidade falam em CNPJ, razão social e endereço', () => {
  const achados = LINHAS.filter(({ arquivo, linha }) => PALAVRA.test(linha) && !COMENTARIO.test(linha) && !PODEM.includes(arquivo));
  assert.deepEqual(
    achados.map((l) => l.onde),
    [],
  );
});

test('o rodapé mostra razão social, CNPJ, endereço e e-mail', () => {
  const rodape = readFileSync(RODAPE, 'utf8');
  for (const campo of ['razaoSocial', 'cnpj', 'enderecoRua', 'enderecoCidade', 'email']) {
    assert.ok(rodape.includes(`EMPRESA.${campo}`), campo);
  }
});

test('termos e política de privacidade trazem razão social, CNPJ e endereço em todos os idiomas', () => {
  for (const arquivo of [TERMOS, PRIVACIDADE]) {
    // cada idioma é uma chave com dois espaços de recuo: "  pt: {"
    const idiomas = readFileSync(arquivo, 'utf8')
      .split(/^ {2}[\w'-]+: \{\r?$/m)
      .slice(1);
    assert.ok(idiomas.length >= 3, arquivo);
    for (const texto of idiomas) {
      for (const campo of ['${E.razaoSocial}', '${E.cnpj}', '${enderecoCompleto}'])
        assert.ok(texto.includes(campo), `${arquivo}: ${campo}`);
    }
  }
});

test('o rodapé não tem ícone de enfeite nem o WhatsApp da equipe', () => {
  const rodape = readFileSync(RODAPE, 'utf8');
  assert.ok(!/wa\.me|linkWhatsApp|EMPRESA\.whatsapp|telefoneExibicao|instagram\.com/i.test(rodape));
  // revisão para os anúncios (14/11): os ícones do Instagram e do WhatsApp sem link pareciam link quebrado. O do
  // Instagram volta como link de verdade quando o endereço oficial entrar em EMPRESA.perfis
  assert.doesNotMatch(rodape, /IconeInstagram|IconeWhatsApp/);
});

test('o teste reconhece o número com e sem pontuação, e não confunde com outros números', () => {
  for (const exemplo of ['11.222.333/0001-81', '11222333/0001-81', '"11222333000181"'])
    assert.deepEqual(numeros(`x ${exemplo} x`), ['11222333000181'], exemplo);
  for (const outro of ['--x:86.89378750843586%', '89378750843586', '1793299954033', '+55 21 99050-2377', 'ON-7K3P9Q']) {
    assert.deepEqual(numeros(outro), [], outro);
  }
  // o da empresa não esconde outro na mesma linha
  assert.deepEqual(numeros(`${OFICIAL} e 11.222.333/0001-81`), [DIGITOS, '11222333000181']);
});
