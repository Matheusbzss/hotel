import { ImageResponse } from 'next/og';
import { IlustracaoHero } from '@/components/Ilustracao';
import { dicionario } from '@/i18n';
import { isIdioma } from '@/i18n/config';
import { FaixaOg, TAMANHO_OG, emblemaDataUri, fontesOg, svgParaDataUri } from '@/lib/og';

export const size = TAMANHO_OG;
export const contentType = 'image/png';
export const alt = 'Agência Victor Hugo — Viagens & Passeios';

export default async function Imagem({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const d = dicionario(isIdioma(locale) ? locale : 'pt');
  const [fonts, cena, emblema] = await Promise.all([fontesOg(), svgParaDataUri(<IlustracaoHero titulo="Búzios" />), emblemaDataUri()]);
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#FFFFFF', padding: 24, gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: 640, background: '#FBF4E6' }}>
        <FaixaOg />
        <div style={{ display: 'flex', flexDirection: 'column', padding: '34px 48px', flex: 1 }}>
          <div style={{ display: 'flex', fontFamily: 'Yellowtail', fontSize: 84, color: '#DB4F3A', lineHeight: 1 }}>
            {d.home.heroScript}
          </div>
          <div style={{ display: 'flex', fontFamily: 'Imbue', fontSize: 190, color: '#0B3B5C', lineHeight: 0.9, marginTop: 6 }}>BÚZIOS</div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Albert Sans',
              fontWeight: 500,
              fontSize: 30,
              color: '#0B3B5C',
              marginTop: 22,
              lineHeight: 1.25,
            }}
          >
            {d.home.heroCidades}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 'auto' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={emblema} width={64} height={64} alt="" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', fontFamily: 'Albert Sans', fontWeight: 700, fontSize: 30, color: '#0B3B5C' }}>
                Agência Victor Hugo
              </div>
              <div style={{ display: 'flex', fontFamily: 'Albert Sans', fontWeight: 500, fontSize: 22, color: '#0A5C8A' }}>
                agenciavictorhugo.online
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cena} width={496} height={582} alt="" style={{ objectFit: 'cover' }} />
    </div>,
    { ...size, fonts },
  );
}
