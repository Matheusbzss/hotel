import Link from 'next/link';
import { altDaFoto } from '@/data/fotos-alt';
import type { Dicionario } from '@/i18n';
import { rota, type Idioma } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { casasDaPagina } from '@/lib/casas';
import { FaixaFoto, TITULO_NA_FOTO } from './BlocosHome';

/**
 * A foto do bloco: a piscina com vista para o mar da Geribá (1.600 px, nítida de borda a borda no computador). Sem a
 * Geribá no ar, a capa da primeira casa no ar (a da Ferradura também é a piscina com vista para o mar, mas tem 720 px:
 * fica macia na tela grande até chegarem as fotos originais).
 */
const FOTO_PREFERIDA: Record<string, string> = {
  'mansao-geriba-vista-mar': '/fotos/casas/mansao-geriba-vista-mar/borda-da-piscina-e-oceano.jpg',
};

/**
 * O bloco "Casas" da página inicial (FASE-4, Etapa 7, parte D): a foto real da piscina com vista para o mar, de borda a
 * borda, o texto das casas em vidro escuro por cima e o botão para a página das casas. Só aparece com casa no ar (a
 * mesma regra do menu); na prévia local (CASAS_PREVIA=1, nunca na Vercel), com as casas da prévia.
 */
export async function BlocoCasas({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const casas = await casasDaPagina().catch(() => []);
  if (!casas.length) return null;
  const preferida = casas.find((c) => FOTO_PREFERIDA[c.slug]);
  const foto = preferida ? FOTO_PREFERIDA[preferida.slug] : casas[0].fotos[0];
  if (!foto) return null;
  const t = d.casas;
  return (
    <FaixaFoto
      src={foto}
      alt={altDaFoto(foto, idioma, texto(casas[0].nome, idioma))}
      posicao="50% 70%"
      posicaoMd="50% 62%"
      veu="cima"
      aria-labelledby="casas-inicio-titulo"
    >
      <h2 id="casas-inicio-titulo" className={TITULO_NA_FOTO}>
        {t.titulo}
      </h2>
      <div className="entrar vidro vidro-escuro mt-6 max-w-xl rounded-vidro px-5 py-5 text-white md:mt-8 md:px-7 md:py-6">
        <p className="text-lead">{t.texto}</p>
        <Link href={rota(idioma, '/casas-de-temporada')} className="botao mt-5 w-full sm:w-auto">
          {t.verCasas}
        </Link>
      </div>
    </FaixaFoto>
  );
}
