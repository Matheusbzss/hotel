import Image from 'next/image';
import type { Dicionario } from '@/i18n';
import { linkWhatsApp } from '@/lib/whatsapp';
import { SeletorGrupo } from '../grupo/SeletorGrupo';
import { IconeWhatsApp } from '../IconeWhatsApp';

/** Primeira tela: a foto do mar escurecida e, por cima, o cartão da agência com a reserva. */
export function Abertura({ d }: { d: Dicionario }) {
  const H = d.home;
  return (
    <section className="abertura relative isolate flex min-h-[100svh] items-center overflow-hidden" aria-labelledby="titulo-agencia">
      <Image
        src="/fotos/buzios/escuna-no-mar.jpg"
        alt={H.heroFoto}
        fill
        priority
        sizes="100vw"
        className="respira -z-10 object-cover brightness-[0.62]"
      />
      <div className="moldura pb-10 pt-28 md:pb-16 md:pt-32">
        <div className="tom-sol chegar mx-auto w-full max-w-[62rem] p-5 sm:p-8">
          <h1 id="titulo-agencia" className="largo flex flex-wrap justify-between gap-x-[0.35em] text-[clamp(1.75rem,0.9rem+3.4vw,3rem)]">
            {H.heroTitulo.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </h1>
          <ul className="meio-largo mt-6 space-y-1.5 text-lead uppercase leading-none">
            {H.heroFatos.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-5 max-w-[36ch] text-lead font-medium">{H.heroTexto}</p>
          <SeletorGrupo
            className="mt-6"
            textos={{ ...d.grupo, diminuir: d.comum.diminuir, aumentar: d.comum.aumentar, rotulos: d.comum.rotulos }}
          />
          <div className="mt-6 grid items-center gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <a href="#precos" className="botao order-first w-full sm:order-none sm:w-auto sm:px-10">
              {H.heroBotao}
            </a>
            <span className="text-small text-(--tinta-suave) sm:order-first">{H.heroFoto}</span>
            <a
              href={linkWhatsApp(d.contato.msg)}
              target="_blank"
              rel="noopener noreferrer"
              className="link inline-flex items-center gap-2 font-semibold sm:justify-self-end"
              data-evento="Contact"
            >
              <IconeWhatsApp className="size-5" />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
