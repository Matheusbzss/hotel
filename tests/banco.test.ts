import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// A chave secreta do banco (Supabase) passa por cima das travas de acesso: ela só pode ser lida no
// servidor, num arquivo só, e nunca pode ir para o navegador.

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = path.join(pasta, e.name);
    return e.isDirectory() ? arquivos(caminho) : [caminho];
  });
}

const FONTES = arquivos('src').filter((a) => /\.(ts|tsx|js|jsx|mjs)$/.test(a));
const BANCO = path.join('src', 'lib', 'banco.ts');
const ler = (a: string) => readFileSync(a, 'utf8');
/** O arquivo sem as linhas de comentário (os tipos gerados pelo Supabase citam createClient num comentário). */
const codigo = (a: string) =>
  ler(a)
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n');

test('a chave secreta do banco só é lida em src/lib/banco.ts, e só ele cria o acesso ao banco', () => {
  // citar o nome numa mensagem de erro pode; ler o valor, só o banco.ts
  assert.deepEqual(
    FONTES.filter((a) => /process\.env(\.SUPABASE_SECRET_KEY|\[['"]SUPABASE_SECRET_KEY)/.test(codigo(a))),
    [BANCO],
  );
  assert.deepEqual(
    FONTES.filter((a) => /\bcreateClient\s*[<(]/.test(codigo(a))),
    [BANCO],
  );
});

test('nenhuma variável do banco vai para o navegador (NEXT_PUBLIC_)', () => {
  assert.deepEqual(
    FONTES.filter((a) => /NEXT_PUBLIC_SUPABASE/.test(ler(a))),
    [],
  );
});

test('o banco é só do servidor: "server-only" e nenhum componente do navegador o importa', () => {
  assert.match(ler(BANCO), /^import 'server-only';/);
  const doNavegador = FONTES.filter((a) => /^['"]use client['"]/m.test(ler(a)) && /from ['"](@\/lib\/banco|\.\.?\/(lib\/)?banco)['"]/.test(ler(a)));
  assert.deepEqual(doNavegador, []);
});

test('o agendamento diário da Vercel roda o teste do banco (/api/saude)', () => {
  const config = JSON.parse(ler('vercel.json')) as { crons?: { path: string; schedule: string }[] };
  const cron = config.crons?.find((c) => c.path === '/api/saude');
  assert.ok(cron, 'falta o agendamento de /api/saude no vercel.json');
  // uma vez por dia, em minuto e hora fixos
  assert.match(cron.schedule, /^\d{1,2} \d{1,2} \* \* \*$/);
});
