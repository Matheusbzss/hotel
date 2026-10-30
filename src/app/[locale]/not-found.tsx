import Link from 'next/link';
import { locale } from 'next/root-params';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';

export default async function NaoEncontrado() {
  let idioma: 'pt' | 'en' | 'es' = 'pt';
  try {
    const l = await locale();
    if (l && isIdioma(l)) idioma = l;
  } catch {}
  const d = dicionario(idioma);
  return (
    <main id="conteudo" className="tom-fundo">
      <div className="moldura pb-32 pt-16 md:pt-24">
        <p className="display text-display" aria-hidden="true">
          404
        </p>
        <h1 className="mt-6 titulo">{d.erro404.titulo}</h1>
        <p className="mt-4 max-w-[40ch] text-lead">{d.erro404.texto}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={rota(idioma, '/')} className="botao">
            {d.erro404.voltar}
          </Link>
          <Link href={rota(idioma, '/passeios')} className="botao botao-vazado">
            {d.comum.verPasseios}
          </Link>
        </div>
      </div>
    </main>
  );
}
