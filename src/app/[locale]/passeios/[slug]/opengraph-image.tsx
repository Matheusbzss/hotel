import { ImageResponse } from 'next/og';
import { CIDADES, obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { isIdioma } from '@/i18n/config';
import { COR_OG, TAMANHO_OG, emblemaDataUri, fontesOg, fotoDataUri } from '@/lib/og';
import { rotuloUnidade } from '@/lib/passeio-view';
import { formatarPreco, precoAPartirCentavos } from '@/lib/precos';

export const size = TAMANHO_OG;
export const contentType = 'image/png';
export const alt = 'Passeio — Agência Victor Hugo';

const FUNDO_CIDADE: Record<string, string> = {
  buzios: '#134960',
  'arraial-do-cabo': COR_OG.turquesa,
  'cabo-frio': COR_OG.sol,
  'rio-de-janeiro': COR_OG.areia,
};

/** Prévia de cada passeio: a primeira foto (ou a capa desenhada) e o nome com o preço. */
export default async function Imagem({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const idioma = isIdioma(locale) ? locale : 'pt';
  const d = dicionario(idioma);
  const p = obterPasseio(slug);
  const [fonts, emblema, foto] = await Promise.all([fontesOg(), emblemaDataUri(), p?.fotos[0] ? fotoDataUri(p.fotos[0]) : null]);
  if (!p) {
    return new ImageResponse(<div style={{ display: 'flex', width: '100%', height: '100%', background: COR_OG.mar }} />, {
      ...size,
      fonts,
    });
  }
  const fundo = FUNDO_CIDADE[p.cidade];
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: COR_OG.mar }}>
      <div style={{ display: 'flex', position: 'relative', width: 560, height: 630, background: fundo, overflow: 'hidden' }}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} width={560} height={630} alt="" style={{ objectFit: 'cover' }} />
        ) : (
          <>
            <div
              style={{
                position: 'absolute',
                left: 300,
                top: 90,
                width: 200,
                height: 200,
                borderRadius: 100,
                background: p.cidade === 'cabo-frio' ? '#FFFFFF' : COR_OG.sol,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 380,
                bottom: 0,
                background: p.cidade === 'buzios' ? COR_OG.mar2 : '#1B97A4',
              }}
            />
            <div style={{ position: 'absolute', left: 0, right: 0, top: 440, bottom: 0, background: COR_OG.mar }} />
          </>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '54px 52px', color: COR_OG.brilho }}>
        <div style={{ display: 'flex', fontFamily: 'TikTok Sans', fontWeight: 500, fontSize: 26, color: '#B9B28A' }}>
          {CIDADES[p.cidade].nome[idioma]} · {p.duracao[idioma]}
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: 'TikTok Sans',
            fontWeight: 700,
            fontSize: 54,
            lineHeight: 1.05,
            marginTop: 16,
            color: COR_OG.sol,
          }}
        >
          {p.nome[idioma]}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <span style={{ fontFamily: 'TikTok Sans', fontWeight: 500, fontSize: 24 }}>{d.comum.aPartirDe}</span>
          <span style={{ fontFamily: 'Largo', fontSize: 64, lineHeight: 1, color: COR_OG.sol }}>
            {formatarPreco(precoAPartirCentavos(p), idioma)}
          </span>
          <span style={{ fontFamily: 'TikTok Sans', fontWeight: 500, fontSize: 24 }}>{rotuloUnidade(p, d)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 30 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={emblema} width={44} height={44} alt="" />
          <span style={{ fontFamily: 'TikTok Sans', fontWeight: 700, fontSize: 24 }}>Agência Victor Hugo</span>
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
