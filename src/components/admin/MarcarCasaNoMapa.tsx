import { MapaCasa } from '@/components/casas/MapaCasa';
import { CIDADES } from '@/data/passeios';
import { dicionario } from '@/i18n';
import type { CasaPainel } from '@/lib/casa';
import type { Ponto } from '@/lib/circulo-casa';
import { centroCabeNoRecorte, rotulosDoRecorte } from '@/lib/satelite-casa';

/** O ponto como o dono colou: a latitude e a longitude com ponto decimal, separadas por vírgula. */
const comoNoGoogle = (p: Ponto) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;

/**
 * "Marcar a casa no mapa" (Pacote 32, opção A do dono): o dono cola as coordenadas do Google Maps, e a ação
 * marcar_no_mapa (src/app/api/admin/casas/[id]/acoes/route.ts) grava o ponto só pela função fechada do banco. Depois de
 * marcada, a prévia usa o MESMO mapa da página da casa (MapaCasa, com o recorte da foto de satélite em volta do centro
 * público), com a imagem da rota do painel, que vale também para a casa fora do ar. O ponto salvo aparece só aqui, no
 * painel: ele nunca vai para a página, para o endereço nem para o log.
 */
export function MarcarCasaNoMapa({
  casa,
  ponto,
  aviso,
}: {
  casa: CasaPainel;
  /** O ponto salvo (lido pela função do banco), ou null se a casa não está marcada ou se o banco não respondeu. */
  ponto: Ponto | null;
  aviso?: { ok: boolean; texto: string };
}) {
  const marcada = Boolean(casa.centro);
  const naFoto = casa.centro ? centroCabeNoRecorte(casa.centro) : false;
  const T = dicionario('pt').casas;
  const local = [casa.local.pt, CIDADES[casa.cidade].nome.pt].filter(Boolean).join(', ');

  return (
    <section id="no-mapa" className="scroll-mt-4 bg-white p-5" aria-labelledby="no-mapa-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="no-mapa-titulo" className="text-xl font-bold">
          Marcar a casa no mapa
        </h2>
        <span
          className={`inline-block px-3 py-1 text-small font-semibold ${marcada ? 'bg-[#d8f5e4] text-[#0f5132]' : 'bg-[#e5e9ee] text-mar'}`}
        >
          {marcada ? 'Marcada no mapa' : 'Ainda não marcada'}
        </span>
      </div>
      <p className="mt-2 max-w-[70ch] text-small text-tinta-suave">
        O site nunca mostra este ponto: a página da casa mostra só uma área de cerca de 1 km em volta de um ponto sorteado perto dele. A
        localização exata vai para o cliente depois da reserva, pela equipe, no WhatsApp.
      </p>
      {ponto && (
        <p className="mt-3 text-small">
          Ponto salvo (só aparece aqui no painel): <span className="numeros font-semibold">{comoNoGoogle(ponto)}</span>
        </p>
      )}

      {aviso && (
        <p
          role={aviso.ok ? 'status' : 'alert'}
          className={`mt-4 px-4 py-3 font-semibold ${aviso.ok ? 'bg-[#d8f5e4] text-[#0f5132]' : 'bg-erro-claro'}`}
        >
          {aviso.texto}
        </p>
      )}

      <form
        method="post"
        action={`/api/admin/casas/${casa.id}/acoes`}
        className="mt-4 grid gap-3 md:grid-cols-[minmax(0,28rem)_max-content] md:items-start md:justify-start"
      >
        <input type="hidden" name="acao" value="marcar_no_mapa" />
        <div>
          <label htmlFor="coordenadas" className="rotulo">
            Coordenadas do Google Maps
          </label>
          <input
            id="coordenadas"
            name="coordenadas"
            required
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            placeholder="-22.75012, -41.88034"
            className="campo"
          />
          <p className="ajuda">
            No celular, abra o Google Maps e segure o dedo em cima da casa até aparecer um alfinete: os números aparecem na tela. Toque
            neles para copiar e cole aqui. No computador, clique com o botão direito em cima da casa e clique nos números.
            {marcada && ' Mudar o ponto leva o círculo junto, com o mesmo sorteio.'}
          </p>
        </div>
        <button type="submit" className="min-h-11 bg-mar px-5 font-semibold text-white md:mt-7">
          {marcada ? 'Mudar o ponto' : 'Marcar a casa'}
        </button>
      </form>

      {marcada && casa.centro && (
        <div className="mt-6 border-t border-borda pt-4">
          {naFoto ? (
            <>
              <p className="font-semibold">Prévia: é assim que a página da casa mostra a região</p>
              <div className="mt-3 max-w-2xl">
                <MapaCasa
                  slug={casa.slug}
                  comMapa
                  imagem={`/api/admin/casas/${casa.id}/mapa`}
                  rotulos={rotulosDoRecorte(casa.centro)}
                  local={local}
                  bairro={casa.detalhes.textoBairro?.pt ?? ''}
                  textos={{ mapaTitulo: T.mapaTitulo, mapaTexto: T.mapaTexto, mapaFonte: T.mapaFonte, mapaCirculo: T.mapaCirculo }}
                />
              </div>
            </>
          ) : (
            <p className="bg-erro-claro px-4 py-3 font-semibold">
              O ponto ficou fora da foto de satélite do site, que cobre Búzios, Cabo Frio e Arraial do Cabo: a página da casa vai mostrar só
              o texto, sem o mapa. Confira se as coordenadas são mesmo as da casa.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
