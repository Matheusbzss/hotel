import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { Ilustracao } from '@/components/Ilustracao';
import { CIDADES, obterPasseio } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { isIdioma } from '@/i18n/config';
import { FaixaOg, TAMANHO_OG, emblemaDataUri, fontesOg, svgParaDataUri } from '@/lib/og';
import { rotuloUnidade } from '@/lib/passeio-view';
import { formatarPreco, precoAdultoCentavos } from '@/lib/precos';

export const size = TAMANHO_OG;
export const contentType = 'image/png';
export const alt = 'Passeio — Agência Victor Hugo';

async function imagemDoPasseio(slug: string): Promise<string | null> {
  const p = obterPasseio(slug);
  if (!p) return null;
  const foto = p.fotos[0];
  if (foto && /\.(jpe?g|png)$/i.test(foto)) {
    try {
      const arq = await readFile(join(process.cwd(), 'public', foto));
      return `data:image/${foto.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'};base64,${arq.toString('base64')}`;
    } catch {}
  }
  return svgParaDataUri(<Ilustracao cena={p.ilustracao} cidade={p.cidade} titulo={p.nome.pt} />);
}

export default async function Imagem({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const idioma = isIdioma(locale) ? locale : 'pt';
  const d = dicionario(idioma);
  const p = obterPasseio(slug);
  const [fonts, figura, emblema] = await Promise.all([fontesOg(), imagemDoPasseio(slug), emblemaDataUri()]);
  if (!p || !figura) {
    return new ImageResponse(<div style={{ display: 'flex', width: '100%', height: '100%', background: '#FBF4E6' }} />, { ...size, fonts });
  }
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#FFFFFF', padding: 24, gap: 16 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={figura} width={600} height={582} alt="" style={{ objectFit: 'cover' }} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#FBF4E6' }}>
        <FaixaOg altura={22} />
        <div style={{ display: 'flex', flexDirection: 'column', padding: '30px 36px', flex: 1 }}>
          <div style={{ display: 'flex', fontFamily: 'Albert Sans', fontWeight: 700, fontSize: 26, color: '#0A5C8A' }}>
            {CIDADES[p.cidade].nome[idioma]} · {p.duracao[idioma]}
          </div>
          <div
            style={{
              display: 'flex',
              fontFamily: 'Albert Sans',
              fontWeight: 700,
              fontSize: 50,
              color: '#0B3B5C',
              lineHeight: 1.05,
              marginTop: 14,
            }}
          >
            {p.nome[idioma]}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto', background: '#FF7A66', padding: '18px 22px' }}>
            <div style={{ display: 'flex', fontFamily: 'Albert Sans', fontWeight: 500, fontSize: 24, color: '#0B3B5C' }}>
              {d.comum.aPartirDe}
            </div>
            <div style={{ display: 'flex', fontFamily: 'Albert Sans', fontWeight: 700, fontSize: 52, color: '#0B3B5C', lineHeight: 1 }}>
              {formatarPreco(precoAdultoCentavos(p), idioma)}
            </div>
            <div style={{ display: 'flex', fontFamily: 'Albert Sans', fontWeight: 500, fontSize: 24, color: '#0B3B5C' }}>
              {rotuloUnidade(p, d)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={emblema} width={44} height={44} alt="" />
            <div style={{ display: 'flex', fontFamily: 'Albert Sans', fontWeight: 700, fontSize: 24, color: '#0B3B5C' }}>
              Agência Victor Hugo
            </div>
          </div>
        </div>
      </div>
    </div>,
    { ...size, fonts },
  );
}
