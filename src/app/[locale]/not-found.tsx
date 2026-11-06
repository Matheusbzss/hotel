import Image from 'next/image';
import Link from 'next/link';
import { locale } from 'next/root-params';
import { CATEGORIAS, type Categoria } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { isIdioma, rota } from '@/i18n/config';

/** Três jeitos de começar, cada um com a sua foto (enfeite: o nome do tipo já diz aonde o link leva), que abrem a lista já filtrada. */
const ATALHOS: { tipo: Categoria; foto: string }[] = [
  { tipo: 'barco', foto: '/fotos/buzios/escuna-mastros.jpg' },
  { tipo: 'buggy-quadriciclo', foto: '/fotos/buzios/buggy-comboio.jpg' },
  { tipo: 'mergulho', foto: '/fotos/arraial/mergulho.jpg' },
];

/** A página que "foi com a maré": o recado de um lado, o mar do outro. */
export default async function NaoEncontrado() {
  let idioma: 'pt' | 'en' | 'es' = 'pt';
  try {
    const l = await locale();
    if (l && isIdioma(l)) idioma = l;
  } catch {}
  const d = dicionario(idioma);
  return (
    <main id="conteudo" className="tom-fundo">
      <div className="moldura grid gap-12 pb-20 pt-12 md:pb-28 md:pt-20 lg:grid-cols-12 lg:items-center lg:gap-8">
        <div className="chegar lg:col-span-7">
          <p className="display text-[clamp(7rem,24vw,16rem)] leading-[0.85]" aria-hidden="true">
            404
          </p>
          <h1 className="titulo mt-6">{d.erro404.titulo}</h1>
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
        <figure className="relative aspect-[4/5] overflow-hidden sm:aspect-[16/10] lg:col-span-5 lg:aspect-[4/5]">
          <Image
            src="/fotos/buzios/vista-da-escuna.jpg"
            alt={d.home.legendas.vistaDaEscuna}
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="respira object-cover"
          />
        </figure>
      </div>

      <section className="moldura pb-24 md:pb-32" aria-labelledby="atalhos-titulo">
        <h2 id="atalhos-titulo" className="titulo entrar">
          <span>{d.erro404.atalhos}</span>
        </h2>
        <ul className="entrar mt-8 grid gap-2 sm:grid-cols-3 md:mt-10">
          {ATALHOS.map((a) => (
            <li key={a.tipo}>
              <Link href={`${rota(idioma, '/passeios')}?tipo=${a.tipo}`} className="group block">
                <span className="zoom relative block aspect-[4/3] overflow-hidden">
                  <Image src={a.foto} alt="" fill sizes="(min-width: 640px) 33vw, 100vw" className="object-cover" />
                </span>
                <span className="mt-3 block text-lead font-semibold underline-offset-4 group-hover:underline">
                  {CATEGORIAS[a.tipo].nome[idioma]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
