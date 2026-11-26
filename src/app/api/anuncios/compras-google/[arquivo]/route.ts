import { segredoConfere } from '@/lib/admin-auth';
import { ARQUIVO_GOOGLE_COM_SENHA, arquivoDoGoogle, senhaDoBasic } from '@/lib/conversoes';
import { agruparPedidos } from '@/lib/pedidos-painel';
import { listarReservas } from '@/lib/reservas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * O arquivo de vendas pagas que o Google busca todo dia. Dois jeitos de entrar, os dois com o GOOGLE_ARQUIVO_SEGREDO:
 * - o de antes: o segredo no próprio endereço, <GOOGLE_ARQUIVO_SEGREDO>.csv;
 * - o do Data Manager do Google Ads, que pede usuário e senha: o endereço fixo compras.csv com "Authorization: Basic"
 *   (o usuário pode ser qualquer um, e a senha é o segredo). Sem a senha certa, 401 com o pedido de usuário e senha.
 * Sem o segredo cadastrado na Vercel, o arquivo não existe (404), nos dois jeitos.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/anuncios/compras-google/[arquivo]'>) {
  const { arquivo } = await ctx.params;
  const segredo = process.env.GOOGLE_ARQUIVO_SEGREDO;
  const naoExiste = () => new Response('Arquivo não encontrado', { status: 404 });
  if (!segredo) return naoExiste();
  if (arquivo === ARQUIVO_GOOGLE_COM_SENHA) {
    if (!segredoConfere(senhaDoBasic(req.headers.get('authorization')), segredo)) {
      return new Response('Usuário ou senha errados', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="compras", charset="UTF-8"', 'Cache-Control': 'no-store' },
      });
    }
  } else if (!segredoConfere(arquivo.replace(/\.csv$/, ''), segredo)) {
    return naoExiste();
  }
  return new Response(arquivoDoGoogle(agruparPedidos(await listarReservas()), new Date()), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
