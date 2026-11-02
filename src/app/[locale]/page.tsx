import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CardPasseio } from '@/components/CardPasseio';
import { ChamadaPacotes, ComoFunciona, Garantias, Perguntas } from '@/components/home/BlocosHome';
import { MapaRegiao } from '@/components/home/MapaRegiao';
import { TopoFoto } from '@/components/home/TopoFoto';
import { Vitrine } from '@/components/home/Vitrine';
import { CIDADES, passeiosAtivos, type Cidade } from '@/data/passeios';
import { dicionario } from '@/i18n';
import { fmt, isIdioma, rota } from '@/i18n/config';
import { caixaMapa, entornoMapa, pinosMapa, praiasMapa } from '@/lib/mapa';
import { alternates } from '@/lib/site';

/** Foto real de cada cidade no cartão do mapa (das fotos dos passeios da agência). */
const FOTO_CIDADE: Partial<Record<Cidade, string>> = {
  buzios: '/fotos/buzios/escuna-no-mar.jpg',
  'arraial-do-cabo': '/fotos/arraial/pontal-do-atalaia-vista.jpg',
  'cabo-frio': '/fotos/cabo-frio/praia-do-forte-forte-sao-mateus.jpg',
};

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!isIdioma(locale)) return {};
  const d = dicionario(locale);
  return {
    title: { absolute: d.meta.titulo },
    description: d.meta.descricao,
    alternates: alternates(locale, '/'),
    openGraph: { title: d.meta.titulo, description: d.meta.descricao, url: rota(locale, '/') },
  };
}

export default async function Inicio({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const H = d.home;
  const passeios = passeiosAtivos();
  const quantos = (n: number) => (n === 1 ? H.destinosUm : fmt(H.destinosQtd, { n }));
  const daCidade = (c: Cidade) => passeios.filter((p) => p.cidade === c);
  const cidades = (Object.keys(CIDADES) as Cidade[])
    .filter((c) => daCidade(c).length > 0)
    .sort((a, b) => CIDADES[a].ordem - CIDADES[b].ordem);

  const secoes = cidades.map((c) => ({
    id: c,
    titulo: c === 'rio-de-janeiro' ? H.saindoDaRegiao : CIDADES[c].nome[locale],
    contagem: quantos(daCidade(c).length),
    cartoes: daCidade(c).map((p) => (
      <li key={p.slug}>
        <CardPasseio passeio={p} idioma={locale} d={d} mostrarCidade={c === 'rio-de-janeiro'} />
      </li>
    )),
  }));

  const textosCidade = H.mapaCidades as Partial<Record<Cidade, string>>;
  const pinos = pinosMapa()
    .filter((p) => daCidade(p.id).length > 0)
    .map((p) => ({
      ...p,
      nome: CIDADES[p.id].nome[locale],
      foto: FOTO_CIDADE[p.id] ?? daCidade(p.id)[0].fotos[0],
      texto: textosCidade[p.id] ?? '',
      qtd: quantos(daCidade(p.id).length),
    }));

  return (
    <main id="conteudo">
      <TopoFoto d={d} />

      <div className="moldura py-12 md:py-20">
        <Vitrine
          secoes={secoes}
          textos={{
            titulo: H.vitrineTitulo,
            texto: H.vitrineTexto,
            filtro: d.boletim.filtroCidades,
            todas: d.boletim.todas,
            grupo: { ...d.grupo, diminuir: d.comum.diminuir, aumentar: d.comum.aumentar, rotulos: d.comum.rotulos },
          }}
        />
      </div>

      <MapaRegiao
        cidades={pinos}
        praias={praiasMapa()}
        relevo={caixaMapa}
        entorno={entornoMapa}
        textos={{
          titulo: H.mapaTitulo,
          texto: H.mapaTexto,
          toque: H.mapaToque,
          fonte: H.mapaFonte,
          voltar: H.mapaVoltar,
          verPasseios: H.mapaVerPasseios,
        }}
      />

      <Garantias d={d} hrefPolitica={rota(locale, '/politica-de-cancelamento')} />
      <ComoFunciona d={d} />
      <ChamadaPacotes d={d} href={rota(locale, '/passeio-e-hospedagem')} />
      <Perguntas d={d} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: d.faq.map((f) => ({ '@type': 'Question', name: f.p, acceptedAnswer: { '@type': 'Answer', text: f.r } })),
          }),
        }}
      />
    </main>
  );
}
