import { ImageResponse } from 'next/og';
import { dicionario } from '@/i18n';
import { isIdioma } from '@/i18n/config';
import { COR_OG, TAMANHO_OG, emblemaDataUri, fontesOg, fotoDataUri } from '@/lib/og';

export const size = TAMANHO_OG;
export const contentType = 'image/png';
export const alt = 'Agência Victor Hugo — Viagens & Passeios';

/** Prévia do site: a foto do mar e o cartão amarelo da agência, como na primeira tela. */
export default async function Imagem({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = dicionario(isIdioma(locale) ? locale : 'pt');
  const [fonts, foto, emblema] = await Promise.all([fontesOg(), fotoDataUri('/fotos/buzios/escuna-no-mar.jpg'), emblemaDataUri()]);
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', position: 'relative', background: COR_OG.mar }}>
      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={foto} width={1200} height={630} alt="" style={{ position: 'absolute', inset: 0, objectFit: 'cover' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,47,63,0.42)' }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          left: 70,
          right: 70,
          top: 90,
          bottom: 90,
          background: COR_OG.sol,
          padding: '40px 48px',
          color: COR_OG.mar,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Largo', fontSize: 66, lineHeight: 1 }}>
          {d.home.heroTitulo.map((p) => (
            <span key={p}>{p.toUpperCase()}</span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, fontFamily: 'Largo', fontSize: 30, lineHeight: 1.15 }}>
          {d.home.heroFatos.map((f) => (
            <span key={f}>{f.toUpperCase()}</span>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 'auto' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={emblema} width={56} height={56} alt="" />
          <span style={{ fontFamily: 'TikTok Sans', fontWeight: 700, fontSize: 28 }}>agenciavictorhugo.online</span>
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
