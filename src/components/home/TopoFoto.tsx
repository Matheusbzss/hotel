import Image from 'next/image';
import { altDaFoto } from '@/data/fotos-alt';
import type { Dicionario } from '@/i18n';
import type { Idioma } from '@/i18n/config';
import { casasNoAr } from '@/lib/casas';
import { Profundidade } from './Profundidade';

/** O topo: a foto real do pôr do sol na baía de Búzios, a frase principal, o botão e as garantias em vidro. */
export async function TopoFoto({ idioma, d }: { idioma: Idioma; d: Dicionario }) {
  const H = d.home;
  return (
    <section className="topo-foto flex flex-col justify-end" aria-labelledby="gancho">
      <Profundidade>
        <Image
          src="/fotos/buzios/por-do-sol-barcos-na-baia.jpg"
          alt={altDaFoto('/fotos/buzios/por-do-sol-barcos-na-baia.jpg', idioma)}
          fill
          preload
          fetchPriority="high"
          sizes="100vw"
          quality={80}
          className="object-cover object-[50%_62%]"
        />
      </Profundidade>
      <div className="moldura w-full pb-7 pt-28 md:pb-12">
        <h1 id="gancho" className="gancho">
          {H.gancho}
        </h1>
        <p className="mt-4 max-w-[42ch] text-lead">{(await casasNoAr()) ? H.ganchoTexto : H.ganchoTextoSemCasas}</p>
        <a href="#passeios" className="botao mt-6">
          {H.ganchoCta}
        </a>
        {/* cada garantia fica numa linha só; só quando nem sozinha ela cabe na largura (letra grande em tela estreita), o
            texto dela quebra por dentro, em vez de ser cortado na borda da foto */}
        <ul className="mt-6 flex flex-wrap gap-2">
          {H.confianca.map((c) => (
            <li key={c} className="etiqueta vidro vidro-foto whitespace-normal">
              {c}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
