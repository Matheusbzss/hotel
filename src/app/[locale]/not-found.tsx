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
    <div className="moldura pb-32 pt-16 md:pt-24">
      <p className="script text-[clamp(3rem,2rem+4vw,5rem)] leading-none text-coral-forte">404</p>
      <h1 className="titulo-display mt-2 text-head">{d.erro404.titulo}</h1>
      <p className="mt-4 max-w-[40ch] text-lead">{d.erro404.texto}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href={rota(idioma, '/')} className="botao botao-tinta">
          {d.erro404.voltar}
        </Link>
        <Link href={rota(idioma, '/passeios')} className="botao botao-coral">
          {d.comum.verPasseios}
        </Link>
      </div>
    </div>
  );
}
