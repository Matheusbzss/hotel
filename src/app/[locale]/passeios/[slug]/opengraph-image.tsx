import { ImageResponse } from 'next/og';
import { CapaPasseio } from '@/components/MidiaPasseio';
import { EMPRESA } from '@/config/empresa';
import { CIDADES, obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { isIdioma } from '@/i18n/config';
import { COR_OG, TAMANHO_OG, emblemaDataUri, fontesOg, fotoDataUri } from '@/lib/og';
import { rotuloUnidade } from '@/lib/passeio-view';
import { formatarPreco, precoAPartirCentavos } from '@/lib/precos';

export const size = TAMANHO_OG;
export const contentType = 'image/png';
export const alt = `Passeio — ${EMPRESA.marca}`;

/** Prévia de cada passeio: a primeira foto (ou a capa desenhada) e, ao lado, o nome com o preço. */
export default async function Imagem({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const idioma = isIdioma(locale) ? locale : 'pt';
  const d = dicionario(idioma);
  const p = obterPasseio(slug);
  const [fonts, emblema, foto] = await Promise.all([fontesOg(), emblemaDataUri(), p?.fotos[0] ? fotoDataUri(p.fotos[0]) : null]);
  if (!p) {
    return new ImageResponse(<div style={{ display: 'flex', width: '100%', height: '100%', background: COR_OG.tinta }} />, {
      ...size,
      fonts,
    });
  }
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: COR_OG.tinta, color: '#FFFFFF', fontFamily: 'Archivo' }}>
      <div style={{ display: 'flex', width: 560, height: 630, overflow: 'hidden' }}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} width={560} height={630} alt="" style={{ objectFit: 'cover' }} />
        ) : (
          <CapaPasseio passeio={p} idioma={idioma} texto={false} ajuste="slice" largura={560} altura={630} />
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '54px 56px 48px' }}>
        <span style={{ fontWeight: 500, fontSize: 26, color: COR_OG.suave }}>
          {`${CIDADES[p.cidade].nome[idioma]} · ${p.duracao[idioma]}`}
        </span>
        <span style={{ fontWeight: 600, fontSize: 56, lineHeight: 1.06, marginTop: 14 }}>{p.nome[idioma]}</span>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <span style={{ fontWeight: 500, fontSize: 24, color: COR_OG.suave }}>{d.comum.aPartirDe}</span>
          <span style={{ fontWeight: 600, fontSize: 80, lineHeight: 1, marginTop: 6 }}>
            {formatarPreco(precoAPartirCentavos(p), idioma)}
          </span>
          <span style={{ fontWeight: 500, fontSize: 24, color: COR_OG.suave, marginTop: 8 }}>{rotuloUnidade(p, d)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 36 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={emblema} width={40} height={40} alt="" />
          <span style={{ fontWeight: 600, fontSize: 26 }}>{EMPRESA.marca}</span>
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
