import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { CORES_ETAPAS, COR_SERIE } from '@/components/admin/cores-graficos';
import { GraficoColunas, type Coluna } from '@/components/admin/GraficoColunas';
import { CIDADES } from '@/data/passeios';
import { COOKIE_ADMIN, sessaoValida } from '@/lib/admin-auth';
import { carrinhosDoFunil } from '@/lib/carrinho-servidor';
import {
  PERIODOS,
  calcularEstatisticas,
  escolherPeriodo,
  marcasDoEixo,
  variacao,
  verPorSemana,
  type CarrinhoNoFunil,
  type Fatia,
  type Funil,
  type Ponto,
} from '@/lib/estatisticas';
import { formatarPreco } from '@/lib/precos';
import { listarReservas, type Reserva } from '@/lib/reservas';
import { formatarDataIso, hojeEmBuzios } from '@/lib/validacao';

export const dynamic = 'force-dynamic';

const texto = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
const dataCurta = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
const dataLonga = (d: string) => `${dataCurta(d)}/${d.slice(0, 4)}`;
const contagem = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const decimal = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const parte = (de: number, total: number) => (total ? (de / total) * 100 : 0);
const porcento = (de: number, total: number) => `${decimal(parte(de, total))}%`;

const SEM_VENDAS = 'Nenhuma venda neste período.';
/** O ranking mostra estas linhas; as outras ficam em "Ver mais". */
const LINHAS_VISIVEIS = 8;

/** Reais no eixo, em números redondos: por extenso até R$ 10 mil e abreviado a partir daí, igual em todo o eixo. */
function eixoEmReais(centavos: number, topoCentavos: number) {
  const reais = centavos / 100;
  if (!reais) return 'R$ 0';
  if (topoCentavos >= 100_000_000) return `R$ ${decimal(reais / 1_000_000)} mi`;
  if (topoCentavos >= 1_000_000) return `R$ ${decimal(reais / 1_000)} mil`;
  return `R$ ${reais.toLocaleString('pt-BR')}`;
}

/** Quais colunas ganham texto embaixo: todas, se couberem; senão, umas quatro, com a primeira e a última. */
function colunasComTexto(total: number): Set<number> {
  const passo = total <= 6 ? 1 : Math.ceil((total - 1) / 3);
  const marcadas = new Set<number>();
  for (let i = 0; i < total; i += passo) marcadas.add(i);
  const anterior = Math.floor((total - 1) / passo) * passo;
  if (total - 1 - anterior < passo / 2) marcadas.delete(anterior);
  marcadas.add(total - 1);
  return marcadas;
}

function Comparacao({ atual, anterior }: { atual: number; anterior?: number }) {
  const v = variacao(atual, anterior);
  if (v === null) return null;
  if (v === 0) return <p className="mt-1 text-small text-tinta-suave">igual ao período anterior</p>;
  return (
    <p className={`mt-1 text-small font-semibold ${v > 0 ? 'text-sucesso' : 'text-erro'}`}>
      {v > 0 ? '▲' : '▼'} {Math.abs(v)}% vs. anterior
    </p>
  );
}

function Numero({ rotulo, valor, nota, atual, anterior }: { rotulo: string; valor: string; nota?: string; atual: number; anterior?: number }) {
  return (
    <div className="bg-white px-4 py-4 sm:px-5">
      <p className="text-small text-tinta-suave">{rotulo}</p>
      <p className="mt-1 whitespace-nowrap text-[clamp(1.125rem,5.2vw,1.5rem)] font-bold">{valor}</p>
      {nota && <p className="text-small text-tinta-suave">{nota}</p>}
      <Comparacao atual={atual} anterior={anterior} />
    </div>
  );
}

function Cartao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 bg-white p-5">
      <h2 className="text-xl font-bold">{titulo}</h2>
      {nota && <p className="mt-1 text-small text-tinta-suave">{nota}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Uma linha: o nome, o número e a barra, todas saindo da mesma base. */
function Linha({ nome, valor, nota, largura, cor }: { nome: string; valor: string; nota: string; largura: number; cor: string }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0">{nome}</span>
        <span className="shrink-0 font-semibold tabular-nums">{valor}</span>
      </div>
      <div className="mt-1 h-2" aria-hidden>
        {largura > 0 && <div className="h-full min-w-1 rounded-r-[4px]" style={{ width: `${largura}%`, background: cor }} />}
      </div>
      <p className="mt-0.5 text-small tabular-nums text-tinta-suave">{nota}</p>
    </li>
  );
}

function Ranking({ fatias, um, varios }: { fatias: Fatia[]; um: string; varios: string }) {
  if (!fatias.length) return <p className="text-tinta-suave">{SEM_VENDAS}</p>;
  const total = fatias.reduce((soma, f) => soma + f.centavos, 0);
  const linhas = (lista: Fatia[]) =>
    lista.map((f) => (
      <Linha
        key={f.chave}
        nome={f.rotulo}
        valor={formatarPreco(f.centavos)}
        nota={`${contagem(f.quantidade, um, varios)} · ${porcento(f.centavos, total)} do total`}
        largura={parte(f.centavos, fatias[0].centavos)}
        cor={COR_SERIE}
      />
    ));
  const resto = fatias.slice(LINHAS_VISIVEIS);
  return (
    <>
      <ul className="space-y-3">{linhas(fatias.slice(0, LINHAS_VISIVEIS))}</ul>
      {resto.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-small font-semibold">Ver mais {resto.length}</summary>
          <ul className="mt-3 space-y-3">{linhas(resto)}</ul>
        </details>
      )}
    </>
  );
}

function BlocoFunil({ f, anterior }: { f: Funil; anterior?: Funil }) {
  if (!f.carrinhos) return <p className="text-tinta-suave">Nenhum carrinho criado neste período.</p>;
  const etapas = [
    { nome: 'Carrinhos criados', n: f.carrinhos, nota: 'quem pôs ao menos um item no carrinho' },
    { nome: 'Chegaram ao checkout', n: f.checkout, nota: `${porcento(f.checkout, f.carrinhos)} dos carrinhos` },
    { nome: 'Fizeram o pedido', n: f.pedidos, nota: `${porcento(f.pedidos, f.checkout)} de quem chegou ao checkout` },
    { nome: 'Pagaram', n: f.pagos, nota: `${porcento(f.pagos, f.pedidos)} dos pedidos` },
  ];
  return (
    <>
      <p className="text-small text-tinta-suave">Carrinho que virou venda paga</p>
      <p className="text-2xl font-bold">{porcento(f.pagos, f.carrinhos)}</p>
      <Comparacao atual={parte(f.pagos, f.carrinhos)} anterior={anterior && parte(anterior.pagos, anterior.carrinhos)} />
      <ul className="mt-4 space-y-3">
        {etapas.map((e, i) => (
          <Linha key={e.nome} nome={e.nome} valor={String(e.n)} nota={e.nota} largura={parte(e.n, f.carrinhos)} cor={CORES_ETAPAS[i]} />
        ))}
      </ul>
    </>
  );
}

export default async function Estatisticas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const loja = await cookies();
  if (!sessaoValida(loja.get(COOKIE_ADMIN)?.value)) redirect('/admin');

  const q = await searchParams;
  const pedido = { periodo: texto(q.periodo), de: texto(q.de), ate: texto(q.ate) };
  const hoje = hojeEmBuzios();

  let reservas: Reserva[] = [];
  let carrinhos: CarrinhoNoFunil[] = [];
  let erroBanco = '';
  try {
    const { chave, periodo, anterior } = escolherPeriodo(pedido, hoje);
    const desde = chave === 'tudo' ? undefined : `${(anterior ?? periodo).de}T00:00:00-03:00`;
    [reservas, carrinhos] = await Promise.all([listarReservas(), carrinhosDoFunil(desde)]);
  } catch (e) {
    erroBanco = String(e instanceof Error ? e.message : e);
  }

  const inicios = [...reservas.map((r) => r.pagamento.pagoEm ?? r.criadaEm), ...carrinhos.map((c) => c.criadoEm)].map((d) => hojeEmBuzios(new Date(d)));
  const escolhido = escolherPeriodo(pedido, hoje, inicios.reduce((a, b) => (a < b ? a : b), hoje));
  const { chave, periodo, anterior } = escolhido;
  const e = calcularEstatisticas(reservas, carrinhos, escolhido);
  const { resumo: r, resumoAnterior: antes } = e;

  const ver = texto(q.ver);
  const porSemana = ver === 'semana' || (ver !== 'dia' && verPorSemana(periodo));
  const pontos = porSemana ? e.porSemana : e.porDia;

  /** O endereço da página com o período e a visão de agora, mudando só o que veio. */
  function endereco(mudanca: Record<string, string | undefined>) {
    const busca = new URLSearchParams();
    const tudo = { periodo: chave === 'outro' ? undefined : chave, de: chave === 'outro' ? periodo.de : undefined, ate: chave === 'outro' ? periodo.ate : undefined, ver, ...mudanca };
    for (const [nome, valor] of Object.entries(tudo)) if (valor) busca.set(nome, valor);
    return `/admin/estatisticas?${busca}`;
  }

  const rotuloDoPonto = (p: Ponto) => (porSemana ? `Semana de ${dataCurta(p.de)} a ${dataCurta(p.ate)}` : formatarDataIso(p.de, 'pt-BR'));
  const comTexto = colunasComTexto(pontos.length);
  const textoPedidos = (n: number) => contagem(n, 'pedido', 'pedidos');
  const colunasDe = (medida: 'centavos' | 'pedidos'): Coluna[] =>
    pontos.map((p, i) => ({
      rotulo: rotuloDoPonto(p),
      valor: p[medida],
      texto: medida === 'centavos' ? formatarPreco(p.centavos) : textoPedidos(p.pedidos),
      detalhe: medida === 'centavos' ? textoPedidos(p.pedidos) : formatarPreco(p.centavos),
      ...(comTexto.has(i) ? { eixo: dataCurta(p.de) } : {}),
    }));
  const marcasReais = marcasDoEixo(Math.max(...pontos.map((p) => p.centavos)), 10_000);
  const topoReais = marcasReais[marcasReais.length - 1];
  const marcasPedidos = marcasDoEixo(Math.max(...pontos.map((p) => p.pedidos)));
  const quando = porSemana ? 'por semana' : 'por dia';
  const nomeDaCidade = (f: Fatia) => ({ ...f, rotulo: CIDADES[f.chave as keyof typeof CIDADES]?.nome.pt ?? f.rotulo });

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-6 text-mar md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Estatísticas</h1>
          <p className="text-small text-tinta-suave">Só pedidos pagos, no dia do pagamento e pelo valor que entrou (no Pix, com o desconto)</p>
        </div>
        <a href="/admin" className="min-h-10 bg-white px-4 py-2 font-semibold">
          Voltar aos pedidos
        </a>
      </header>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Período">
        {PERIODOS.map((p) => (
          <a
            key={p.chave}
            href={endereco({ periodo: p.chave, de: undefined, ate: undefined })}
            aria-current={p.chave === chave ? 'page' : undefined}
            className={`filtro ${p.chave === chave ? '!bg-mar !text-sol' : '!bg-white'}`}
          >
            {p.rotulo}
          </a>
        ))}
      </div>
      <details className="mt-3" open={chave === 'outro'}>
        <summary className="cursor-pointer text-small font-semibold">Escolher as datas</summary>
        <form method="get" className="mt-2 flex flex-wrap items-end gap-2">
          {ver && <input type="hidden" name="ver" value={ver} />}
          <div>
            <label htmlFor="de" className="rotulo">
              De
            </label>
            <input id="de" name="de" type="date" required defaultValue={periodo.de} max={hoje} className="campo min-h-11 py-2" />
          </div>
          <div>
            <label htmlFor="ate" className="rotulo">
              Até
            </label>
            <input id="ate" name="ate" type="date" required defaultValue={periodo.ate} max={hoje} className="campo min-h-11 py-2" />
          </div>
          <button type="submit" className="min-h-11 bg-mar px-5 font-semibold text-white">
            Ver
          </button>
        </form>
      </details>
      <p className="mt-3 text-small text-tinta-suave">
        De {dataLonga(periodo.de)} a {dataLonga(periodo.ate)}
        {anterior ? `, comparado com ${dataLonga(anterior.de)} a ${dataLonga(anterior.ate)}` : ''}.
      </p>

      {erroBanco && <p className="mt-6 bg-erro-claro px-4 py-3 font-semibold">Erro ao ler o banco: {erroBanco}</p>}

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="Resumo">
        <div className="col-span-2 flex flex-col justify-center bg-white px-5 py-5 lg:col-span-1 lg:row-span-2">
          <p className="text-small text-tinta-suave">Faturamento</p>
          <p className="mt-1 whitespace-nowrap text-[clamp(2.25rem,11vw,3.25rem)] font-bold leading-none">{formatarPreco(r.centavos)}</p>
          <Comparacao atual={r.centavos} anterior={antes?.centavos} />
        </div>
        <Numero rotulo="Pedidos pagos" valor={String(r.pedidos)} atual={r.pedidos} anterior={antes?.pedidos} />
        <Numero rotulo="Ticket médio" valor={formatarPreco(r.ticketCentavos)} atual={r.ticketCentavos} anterior={antes?.ticketCentavos} />
        <Numero
          rotulo="Itens por pedido"
          valor={decimal(r.itensPorPedido)}
          nota={contagem(r.itens, 'item vendido', 'itens vendidos')}
          atual={r.itensPorPedido}
          anterior={antes?.itensPorPedido}
        />
        <Numero
          rotulo="Vendido pelas sugestões"
          valor={formatarPreco(r.sugestoesCentavos)}
          nota={`${porcento(r.sugestoesCentavos, r.centavos)} do faturamento`}
          atual={r.sugestoesCentavos}
          anterior={antes?.sugestoesCentavos}
        />
      </section>

      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Ver os gráficos">
        <a href={endereco({ ver: 'dia' })} aria-current={!porSemana ? 'true' : undefined} className={`filtro ${!porSemana ? '!bg-mar !text-sol' : '!bg-white'}`}>
          Por dia
        </a>
        <a href={endereco({ ver: 'semana' })} aria-current={porSemana ? 'true' : undefined} className={`filtro ${porSemana ? '!bg-mar !text-sol' : '!bg-white'}`}>
          Por semana
        </a>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Cartao titulo={`Faturamento ${quando}`}>
          {r.pedidos ? (
            <GraficoColunas
              nome={`Faturamento ${quando}`}
              colunas={colunasDe('centavos')}
              marcas={marcasReais.map((valor) => ({ valor, texto: eixoEmReais(valor, topoReais) }))}
            />
          ) : (
            <p className="text-tinta-suave">{SEM_VENDAS}</p>
          )}
        </Cartao>
        <Cartao titulo={`Pedidos pagos ${quando}`}>
          {r.pedidos ? (
            <GraficoColunas
              nome={`Pedidos pagos ${quando}`}
              colunas={colunasDe('pedidos')}
              marcas={marcasPedidos.map((valor) => ({ valor, texto: String(valor) }))}
            />
          ) : (
            <p className="text-tinta-suave">{SEM_VENDAS}</p>
          )}
        </Cartao>
      </div>
      {r.pedidos > 0 && (
        <details className="mt-3 bg-white px-5 py-3">
          <summary className="cursor-pointer text-small font-semibold">Ver em tabela</summary>
          <table className="mt-3 w-full text-small tabular-nums">
            <caption className="sr-only">
              Pedidos pagos e faturamento {quando}, só com o que teve venda
            </caption>
            <thead>
              <tr className="border-b border-borda text-left">
                <th className="py-1 font-semibold">{porSemana ? 'Semana' : 'Dia'}</th>
                <th className="py-1 text-right font-semibold">Pedidos</th>
                <th className="py-1 text-right font-semibold">Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {pontos
                .filter((p) => p.pedidos)
                .toReversed()
                .map((p) => (
                  <tr key={p.de} className="border-b border-superficie">
                    <td className="py-1">{porSemana ? `${dataCurta(p.de)} a ${dataCurta(p.ate)}` : dataLonga(p.de)}</td>
                    <td className="py-1 text-right">{p.pedidos}</td>
                    <td className="py-1 text-right">{formatarPreco(p.centavos)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Cartao titulo="Funil do carrinho" nota="Os carrinhos criados no período e até onde cada um chegou">
          <BlocoFunil f={e.funil} anterior={e.funilAnterior} />
        </Cartao>
        <Cartao titulo="Itens por pedido" nota={r.pedidos ? `Média de ${decimal(r.itensPorPedido)} por pedido` : undefined}>
          {r.pedidos ? (
            <ul className="space-y-3">
              {e.itensPorPedido.map((i, n) => (
                <Linha
                  key={i.rotulo}
                  nome={i.rotulo}
                  valor={String(i.pedidos)}
                  nota={`${porcento(i.pedidos, r.pedidos)} dos pedidos`}
                  largura={parte(i.pedidos, r.pedidos)}
                  cor={CORES_ETAPAS[n]}
                />
              ))}
            </ul>
          ) : (
            <p className="text-tinta-suave">{SEM_VENDAS}</p>
          )}
        </Cartao>
        <Cartao titulo="Vendas por passeio">
          <Ranking fatias={e.porPasseio} um="item" varios="itens" />
        </Cartao>
        <Cartao
          titulo="Vendido pelas sugestões"
          nota={
            e.sugestoes.itens
              ? `${contagem(e.sugestoes.itens, 'item', 'itens')} em ${textoPedidos(e.sugestoes.pedidos)}, ${porcento(e.sugestoes.centavos, r.centavos)} do faturamento`
              : undefined
          }
        >
          {e.sugestoes.itens ? (
            <Ranking fatias={e.sugestoes.porPasseio} um="item" varios="itens" />
          ) : (
            <p className="text-tinta-suave">Nenhum item das sugestões foi pago neste período.</p>
          )}
        </Cartao>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao titulo="Vendas por cidade" nota="O transfer fica à parte, porque liga uma cidade a outra">
          <Ranking fatias={e.porCidade.map(nomeDaCidade)} um="item" varios="itens" />
        </Cartao>
        <Cartao titulo="País do cliente" nota="Pelo código do país no WhatsApp">
          <Ranking fatias={e.porPais} um="pedido" varios="pedidos" />
        </Cartao>
        <Cartao titulo="Forma de pagamento">
          <Ranking fatias={e.porPagamento} um="pedido" varios="pedidos" />
        </Cartao>
        <Cartao titulo="Origem" nota="Pelos links dos anúncios; quem chega sem link marcado entra em Direto">
          <Ranking fatias={e.porOrigem} um="pedido" varios="pedidos" />
        </Cartao>
      </div>
    </main>
  );
}
