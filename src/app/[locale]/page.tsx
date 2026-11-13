import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EMPRESA } from '@/config/empresa';
import { DadosEstruturados } from '@/components/DadosEstruturados';
import { altDaFoto } from '@/data/fotos-alt';
import { CardPasseio } from '@/components/CardPasseio';
import { ComoFunciona, Garantias, Perguntas } from '@/components/home/BlocosHome';
import { MapaRegiao } from '@/components/home/MapaRegiao';
import { Opinioes } from '@/components/home/Opinioes';
import { TopoFoto } from '@/components/home/TopoFoto';
import { Tutorial } from '@/components/home/Tutorial';
import { Vitrine } from '@/components/home/Vitrine';
import { CardTransfer } from '@/components/transfer/CardTransfer';
import { CIDADES, passeiosAtivos, type Cidade } from '@/data/passeios';
import { TUTORIAL_ATIVO, telaTutorial } from '@/data/tutorial';
import { dicionario } from '@/i18n';
import { fmt, isIdioma, rota } from '@/i18n/config';
import { texto } from '@/i18n/conteudo';
import { avaliacoesDoSite, notaDaAgencia, opinioesDoSite, origemDaNota } from '@/lib/avaliacao';
import { caixaMapa, entornoMapa, pinosMapa, praiasMapa } from '@/lib/mapa';
import { alternates, openGraphDaPagina, urlDoSite } from '@/lib/site';

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
    openGraph: openGraphDaPagina(locale, { title: d.meta.titulo, description: d.meta.descricao, url: rota(locale, '/') }),
  };
}

export default async function Inicio({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!isIdioma(locale)) notFound();
  const d = dicionario(locale);
  const H = d.home;
  const passeios = passeiosAtivos();
  // sem o banco, a página abre sem a seção: as opiniões nunca podem derrubar a inicial
  // (a leitura tem a etiqueta 'avaliacoes': publicar no painel atualiza o site sem novo deploy)
  const publicadas = await avaliacoesDoSite().catch(() => []);
  const opinioes = opinioesDoSite(publicadas, locale);
  // a nota em cima das opiniões conta todas as publicadas da agência, não só as que aparecem na seção
  const nota = { ...notaDaAgencia(publicadas), origem: origemDaNota(publicadas) };
  const quantos = (n: number) => (n === 1 ? H.destinosUm : fmt(H.destinosQtd, { n }));
  const daCidade = (c: Cidade) => passeios.filter((p) => p.cidade === c);
  const cidades = (Object.keys(CIDADES) as Cidade[])
    .filter((c) => daCidade(c).length > 0)
    .sort((a, b) => CIDADES[a].ordem - CIDADES[b].ordem);

  const secoes = cidades.map((c) => ({
    id: c,
    titulo: c === 'rio-de-janeiro' ? H.saindoDaRegiao : texto(CIDADES[c].nome, locale),
    contagem: quantos(daCidade(c).length),
    cartoes: [
      ...daCidade(c).map((p) => (
        <li key={p.slug}>
          <CardPasseio passeio={p} idioma={locale} d={d} mostrarCidade={c === 'rio-de-janeiro'} />
        </li>
      )),
      // o transfer privado entra como mais uma opção de cada cidade
      <li key="transfer">
        <CardTransfer cidade={c} idioma={locale} d={d} />
      </li>,
    ],
  }));

  const textosCidade = H.mapaCidades as Partial<Record<Cidade, string>>;
  const pinos = pinosMapa()
    .filter((p) => daCidade(p.id).length > 0)
    .map((p) => ({
      ...p,
      nome: texto(CIDADES[p.id].nome, locale),
      foto: FOTO_CIDADE[p.id] ?? daCidade(p.id)[0].fotos[0],
      fotoAlt: altDaFoto(FOTO_CIDADE[p.id] ?? daCidade(p.id)[0].fotos[0], locale),
      texto: textosCidade[p.id] ?? '',
      qtd: quantos(daCidade(p.id).length),
    }));

  return (
    <main id="conteudo">
      <TopoFoto idioma={locale} d={d} />

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
          fotoAlt: H.mapaFotoAlt,
          texto: H.mapaTexto,
          toque: H.mapaToque,
          fonte: H.mapaFonte,
          voltar: H.mapaVoltar,
          verPasseios: H.mapaVerPasseios,
        }}
      />

      {/* do mapa para baixo (Etapa 8, proposta B): foto e faixa clara se alternam. O tutorial com os prints do site
          fica desligado até o pagamento de teste */}
      {TUTORIAL_ATIVO ? (
        <Tutorial idioma={locale} d={d} telas={[1, 2, 3, 4].map((n) => telaTutorial(locale, n))} />
      ) : (
        <ComoFunciona idioma={locale} d={d} />
      )}
      <Garantias d={d} hrefPolitica={rota(locale, '/politica-de-cancelamento')} />
      <Opinioes itens={opinioes} nota={nota} idioma={locale} d={d} />
      <Perguntas idioma={locale} d={d} />

      <DadosEstruturados
        dados={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: d.faq.map((f) => ({ '@type': 'Question', name: f.p, acceptedAnswer: { '@type': 'Answer', text: f.r } })),
        }}
      />
      {/* o nome que o Google mostra ao lado do endereço nos resultados */}
      <DadosEstruturados dados={{ '@context': 'https://schema.org', '@type': 'WebSite', name: EMPRESA.marca, url: `${urlDoSite()}/` }} />
    </main>
  );
}
