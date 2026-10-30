import Image from 'next/image';
import type { Dicionario } from '@/i18n';

/** Três fotos do mar com o mesmo enquadramento, que se revezam devagar. */
const FOTOS = [
  { src: '/fotos/buzios/escuna-no-mar.jpg', legenda: 'escunaNoMar', posicao: '58% 50%' },
  { src: '/fotos/arraial/barco-toboga.jpg', legenda: 'barcoToboga', posicao: '50% 50%' },
  { src: '/fotos/buzios/escuna-no-pier.jpg', legenda: 'escunaNoPier', posicao: '40% 50%' },
] as const;

/** Primeira tela: a foto do mar ocupa tudo e o nome fica na borda de baixo, como título de filme. */
export function Abertura({ d }: { d: Dicionario }) {
  const H = d.home;
  return (
    <section
      className="abertura relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden text-white [--acao-tinta:var(--color-tinta)] [--acao:#ffffff] [--foco:#ffffff]"
      aria-labelledby="titulo-agencia"
    >
      <div className="troca absolute inset-0 -z-20">
        {FOTOS.map((f, i) => (
          <div key={f.src} className="absolute inset-0">
            <Image
              src={f.src}
              alt={H.legendas[f.legenda]}
              fill
              priority={i === 0}
              sizes="100vw"
              quality={80}
              className="object-cover"
              style={{ objectPosition: f.posicao }}
            />
          </div>
        ))}
      </div>
      <div className="veu-cima absolute inset-x-0 top-0 -z-10 h-40" aria-hidden="true" />
      <div className="veu-baixo absolute inset-x-0 bottom-0 -z-10 h-[60%]" aria-hidden="true" />
      {/* no computador: frase e botão acima das pontas do nome; no celular, o botão fecha a tela embaixo do nome */}
      <div className="moldura chegar grid pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:pb-5">
        <p className="relative z-10 max-w-[32ch] text-lead font-medium lg:col-start-1 lg:row-start-1 lg:self-end">{H.heroTexto}</p>
        <h1
          id="titulo-agencia"
          className="display mt-5 text-[33vw] leading-[0.84] md:whitespace-nowrap md:text-display lg:col-span-2 lg:row-start-2 lg:mt-10"
        >
          <span className="block md:inline">{H.heroTitulo[0]}</span> <span className="block md:inline">{H.heroTitulo[1]}</span>
        </h1>
        <a
          href="#passeios"
          className="botao relative z-10 mt-6 justify-self-start lg:col-start-2 lg:row-start-1 lg:mt-0 lg:self-end lg:justify-self-end"
        >
          {H.heroBotao}
        </a>
      </div>
    </section>
  );
}
