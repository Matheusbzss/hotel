import { altDaFoto } from '@/data/fotos-alt';
import type { Dicionario } from '@/i18n';
import type { Idioma } from '@/i18n/config';
import { FaixaFoto } from './BlocosHome';
import { Celular } from './Celular';

/**
 * Como funciona em 4 passos: os prints reais do site no celular, lado a lado (no celular deslizam para o
 * lado), cada um com a sua legenda em vidro, sobre a orla de Cabo Frio ao entardecer.
 */
export function Tutorial({ idioma, d, telas }: { idioma: Idioma; d: Dicionario; telas: string[] }) {
  const H = d.home;
  return (
    <FaixaFoto
      src="/fotos/cabo-frio/orla-entardecer.jpg"
      alt={altDaFoto('/fotos/cabo-frio/orla-entardecer.jpg', idioma)}
      posicao="50% 60%"
      aria-labelledby="como-titulo"
    >
      <h2 id="como-titulo" className="titulo text-white [text-shadow:0_1px_14px_rgb(0_0_0/0.35)]">
        {H.comoTitulo}
      </h2>
      <ol className="trilho trilho-celulares mt-6 md:mt-8">
        {H.tutorial.map((p, i) => (
          <li key={p.titulo} className="grid content-start gap-3">
            <Celular src={telas[i]} alt={H.tutorialTelas[i]} sizes="(min-width: 1024px) 18rem, 66vw" />
            <div className="vidro vidro-escuro rounded-[18px] p-4">
              <span className="numeros font-[family-name:var(--font-semi)] text-[1.75rem] font-semibold leading-none" aria-hidden="true">
                {i + 1}
              </span>
              <strong className="mt-2 block font-[family-name:var(--font-semi)] text-lead font-semibold">{p.titulo}</strong>
              <span className="mt-1 block text-small text-white/90">{p.texto}</span>
            </div>
          </li>
        ))}
      </ol>
    </FaixaFoto>
  );
}
