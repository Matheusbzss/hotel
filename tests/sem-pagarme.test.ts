import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// A Pagar.me saiu do site: o pagamento online é pela Stripe (Fase 4, Etapa 4). O nome só pode sobreviver como o
// valor 'pagarme' do provedor dos pedidos antigos, nos poucos arquivos que cuidam deles, e em comentários do código
// que expliquem o que mudou.

const PAGARME = /pagar\.?me/i;

/** Textos do site: nenhuma menção, de nenhum jeito (nem em comentário). */
const PASTAS_DE_TEXTO = [path.join('src', 'i18n'), path.join('src', 'content'), path.join('src', 'data')];

/** Páginas e componentes que o cliente vê: nenhuma menção fora de comentário. */
const PASTAS_DAS_TELAS = [path.join('src', 'components'), path.join('src', 'app', '[locale]')];

/** O código inteiro: nem a biblioteca antiga, nem as rotas antigas, nem as variáveis PAGARME_*. */
const PASTAS_DO_CODIGO = [path.join('src', 'app'), path.join('src', 'lib'), path.join('src', 'components')];
const CODIGO_ANTIGO =
  /lib\/pagarme|lib\/pagamentos['"]|api\/checkout(\/|['"])|webhooks\/pagarme|PAGARME_|pagarmeConfigurado|NEXT_PUBLIC_PAGARME/;

/**
 * Os arquivos que ainda podem escrever o nome fora de comentário, porque guardam o provedor 'pagarme' dos pedidos
 * antigos (o tipo Provedor, a tradução para o banco, o painel que os mostra).
 */
const PODEM_CITAR_OS_PEDIDOS_ANTIGOS = new Set(
  [
    path.join('src', 'lib', 'reservas.ts'),
    path.join('src', 'lib', 'reservas-banco.ts'),
    path.join('src', 'lib', 'pedidos-painel.ts'),
    path.join('src', 'lib', 'reserva-publica.ts'),
    path.join('src', 'app', 'admin', 'page.tsx'),
  ].map((p) => path.normalize(p)),
);

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    return e.isDirectory() ? arquivos(caminho) : [caminho];
  });
}

/** Uma linha só de comentário (// ou dentro de /* ... *\/): o cliente nunca a vê. */
const ehComentario = (linha: string) => /^\s*(\/\/|\/\*|\*)/.test(linha);

const linhasQueBatem = (arquivo: string, padrao: RegExp, semComentarios = false) =>
  readFileSync(arquivo, 'utf8')
    .split('\n')
    .flatMap((linha, i) =>
      padrao.test(linha) && !(semComentarios && ehComentario(linha)) ? [`${arquivo}:${i + 1}: ${linha.trim().slice(0, 120)}`] : [],
    );

test('nenhum texto do site fala em Pagar.me', () => {
  const achados = PASTAS_DE_TEXTO.flatMap(arquivos).flatMap((arquivo) => linhasQueBatem(arquivo, PAGARME));
  assert.deepEqual(achados, []);
});

test('nenhuma página ou componente que o cliente vê fala em Pagar.me', () => {
  const achados = PASTAS_DAS_TELAS.flatMap(arquivos).flatMap((arquivo) => linhasQueBatem(arquivo, PAGARME, true));
  assert.deepEqual(achados, []);
});

test('o código não usa mais a biblioteca, as rotas nem as variáveis da Pagar.me', () => {
  const achados = PASTAS_DO_CODIGO.flatMap(arquivos).flatMap((arquivo) => linhasQueBatem(arquivo, CODIGO_ANTIGO));
  assert.deepEqual(achados, []);
});

test('fora dos arquivos que cuidam dos pedidos antigos, o nome só aparece em comentário', () => {
  const achados = PASTAS_DO_CODIGO.flatMap(arquivos)
    .filter((arquivo) => !PODEM_CITAR_OS_PEDIDOS_ANTIGOS.has(path.normalize(arquivo)))
    .flatMap((arquivo) => linhasQueBatem(arquivo, PAGARME, true));
  assert.deepEqual(achados, []);
});
