import Image from 'next/image';

/** Moldura de celular com um print real do site: a barra de status com a ilha da câmera e a página embaixo. */
export function Celular({ src, alt, sizes, className = '' }: { src: string; alt: string; sizes: string; className?: string }) {
  return (
    <div className={`celular ${className}`}>
      <div className="celular-corpo">
        <div className="celular-tela">
          <div className="celular-pagina">
            <Image src={src} alt={alt} fill sizes={sizes} quality={80} className="object-cover object-top" />
          </div>
        </div>
      </div>
    </div>
  );
}
