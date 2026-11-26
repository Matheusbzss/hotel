import 'server-only';
import { cookies, headers } from 'next/headers';
import { COOKIE_MEDICAO, COOKIE_ORIGEM, lerOrigem, soCampanha, type Origem } from './origem';

/**
 * A origem da visita atual. A campanha vale sempre. O que identifica o cliente nas plataformas de anúncio
 * só entra com o aceite dos cookies.
 */
export async function origemDaVisita(): Promise<Origem> {
  const loja = await cookies();
  const origem = lerOrigem(loja.get(COOKIE_ORIGEM)?.value);
  if (loja.get(COOKIE_MEDICAO)?.value !== 'sim') return soCampanha(origem);
  const fbp = loja.get('_fbp')?.value;
  const fbc = loja.get('_fbc')?.value;
  const navegador = (await headers()).get('user-agent')?.slice(0, 300);
  return { ...origem, ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}), ...(navegador ? { navegador } : {}), medicao: true };
}
