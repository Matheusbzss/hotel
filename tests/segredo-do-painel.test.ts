import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// O "Cancelar sem reembolso…" (Pacote 33) só liga com o ADMIN_SESSION_SECRET criado na Vercel (decisão P14 do dono,
// 25/11: "criar o ADMIN_SESSION_SECRET antes de ligar os botões novos de dinheiro"). Os três lugares conferem a mesma
// função: o painel não mostra o botão, a tela de resumo explica o que falta e a rota recusa sem gravar nada.
const ler = (caminho: string) => readFileSync(new URL(`../${caminho}`, import.meta.url), 'utf8');

test('a regra: o segredo do painel é o ADMIN_SESSION_SECRET da Vercel', () => {
  const auth = ler('src/lib/admin-auth.ts');
  assert.match(auth, /export const segredoDoPainelCriado = \(\): boolean => Boolean\(process\.env\.ADMIN_SESSION_SECRET\);/);
  assert.match(auth, /export const ESPERA_O_SEGREDO_DO_PAINEL =/);
});

test('o painel só mostra o "Cancelar sem reembolso…" com o segredo criado', () => {
  const painel = ler('src/app/admin/page.tsx');
  assert.match(painel, /const semReembolso = segredoDoPainelCriado\(\) && planoDoCancelamento\(/);
});

test('a tela de resumo do cancelamento espera o segredo, sem desenhar o formulário', () => {
  const resumo = ler('src/app/admin/resumo/[codigo]/page.tsx');
  const bloco = resumo.slice(resumo.indexOf('if (escolha && ehCancelamento(escolha))'));
  const espera = bloco.indexOf('if (!segredoDoPainelCriado())');
  const tela = bloco.indexOf('telaDoCancelamento(');
  assert.ok(espera > 0 && tela > espera, 'a conferência do segredo vem antes da tela do cancelamento');
  assert.match(bloco, /ESPERA_O_SEGREDO_DO_PAINEL/);
});

test('a rota recusa o cancelamento sem reembolso sem o segredo, antes de gravar qualquer coisa', () => {
  const rota = ler('src/app/api/admin/reservas/[codigo]/route.ts');
  const inicio = rota.indexOf("if (acao === 'cancelar_sem_reembolso' || acao === 'cancelar_item_sem_reembolso') {");
  assert.ok(inicio > 0);
  const bloco = rota.slice(inicio, inicio + 900);
  const recusa = bloco.indexOf("if (!segredoDoPainelCriado()) return voltar('acao-nao-vale');");
  const primeiraGravacao = bloco.indexOf('vouchersACompletar(');
  assert.ok(recusa > 0 && primeiraGravacao > recusa, 'a recusa vem antes de completar ou gravar qualquer cancelamento');
});
