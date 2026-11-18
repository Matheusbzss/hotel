/**
 * A mensagem de um erro para o registro do servidor (Etapa 11: nada de dado pessoal nos logs): só o texto e o código,
 * nunca o objeto inteiro. Num erro do banco, o campo "details" pode trazer a linha inteira que falhou, com o nome, o
 * e-mail e o telefone do cliente; por isso ele nunca vai para o registro. Sem import: os testes rodam com node direto.
 */
export function mensagemDoErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; code?: unknown };
    const texto = typeof o.message === 'string' && o.message ? o.message : 'erro sem mensagem';
    return typeof o.code === 'string' && o.code ? `${texto} (${o.code})` : texto;
  }
  return String(e);
}
