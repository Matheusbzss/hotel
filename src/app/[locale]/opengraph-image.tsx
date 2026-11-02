import { ImageResponse } from 'next/og';
import { EMPRESA } from '@/config/empresa';
import { dicionario } from '@/i18n';
import { isIdioma } from '@/i18n/config';
import { COR_OG, TAMANHO_OG, emblemaDataUri, fontesOg, fotoDataUri } from '@/lib/og';

export const size = TAMANHO_OG;
export const contentType = 'image/png';
export const alt = `${EMPRESA.marca} — ${EMPRESA.slogan}`;

/** Prévia do site: a foto do mar com o nome grande embaixo, como a primeira tela. */
export default async function Imagem({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = dicionario(isIdioma(locale) ? locale : 'pt');
  const [fonts, foto, emblema] = await Promise.all([fontesOg(), fotoDataUri('/fotos/buzios/escuna-no-mar.jpg'), emblemaDataUri()]);
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        position: 'relative',
        background: COR_OG.tinta,
        color: '#FFFFFF',
        fontFamily: 'Archivo',
      }}
    >
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} width={1200} height={630} alt="" style={{ position: 'absolute', inset: 0, objectFit: 'cover' }} />
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: 200,
          backgroundImage: 'linear-gradient(rgba(11,37,48,0.6), rgba(11,37,48,0))', // taste-skill-ignore: escurece a foto
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 470,
          backgroundImage: 'linear-gradient(rgba(11,37,48,0), rgba(11,37,48,0.6) 35%, rgba(11,37,48,0.9))', // taste-skill-ignore: escurece a foto
        }}
      />
      <div style={{ position: 'absolute', left: 60, top: 50, display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={emblema} width={56} height={56} alt="" />
        <span style={{ fontWeight: 600, fontSize: 30 }}>{EMPRESA.slogan}</span>
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, bottom: 34, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 500, fontSize: 34, lineHeight: 1.25, maxWidth: 780 }}>{d.home.heroTexto}</span>
        <span style={{ fontWeight: 600, fontSize: 186, lineHeight: 0.92, letterSpacing: -5, marginTop: 14 }}>
          {d.home.heroTitulo.join(' ')}
        </span>
      </div>
    </div>,
    { ...size, fonts },
  );
}
