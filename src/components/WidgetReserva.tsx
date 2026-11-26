'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Idioma } from '@/i18n/config';
import { avisoDaFalta, textoDaRecusa, type TextosDaFalta, type TextosDaRecusa } from '@/lib/aviso-reserva';
import { formatarCifra } from '@/lib/cifra';
import { formatarHora, horasDisponiveis, primeiroDiaComHorario } from '@/lib/horarios';
import { textoDolar } from '@/lib/dolar';
import { calcular, normalizarPessoas, precoPixCentavos, totalPixCentavos, type Pessoas, type TabelaPreco } from '@/lib/orcamento';
import type { FaixaContador } from '@/lib/passeio-view';
import { cartaoEmDestaque, rotuloPixComDesconto } from '@/lib/preco-destaque';
import { levarAoCampo } from '@/lib/levar-ao-campo';
import { rastrear } from '@/lib/pixel';
import { dataPasseioValida, hojeEmBuzios, somarDias } from '@/lib/validacao';
import { CampoData } from './CampoData';
import { useCarrinho } from './carrinho/CarrinhoContexto';
import { Cifra } from './Cifra';
import { ComDolar, Pedaco, Pedacos } from './ComDolar';
import { Contador } from './grupo/Contador';
import { pessoasDoGrupo, useGrupo } from './grupo/GrupoContexto';

export interface OpcaoWidget {
  id: string;
  nome: string;
  tabela: TabelaPreco;
}

/**
 * Com os avisos de src/lib/aviso-reserva.ts: o que falta, repetido perto do botão (faltaData, faltaHorario,
 * faltaDataEHorario e semHorarioHoje), e o da recusa (erroConexao, erroAdicionar, erroTemporario e cheio).
 */
export interface TextosWidget extends TextosDaFalta, TextosDaRecusa {
  titulo: string;
  data: string;
  total: string;
  escolhaData: string;
  escolhaOpcao: string;
  unidadesAviso: string;
  pessoa: string;
  pessoas: string;
  unidadeSingular: string;
  unidadePlural: string;
  rotuloUnidade: string;
  aPartirDe: string;
  diminuir: string;
  aumentar: string;
  /** "Ainda não cobramos nada: você confere tudo antes de pagar.", logo abaixo dos botões. */
  semCobranca: string;
  /**
   * "Não inclui taxas municipais ou de embarque, pagas no local quando cobradas.", logo depois do semCobranca. Vazio no
   * passeio sem taxa paga no local (temTaxaNoLocal, src/data/passeios.ts): a linha não aparece.
   */
  taxasNoLocal: string;
  noPix: string;
  noCartao: string;
  /** "con Pix (−{p}%)": o Pix na linha de baixo, quando o cartão é o preço grande (espanhol e inglês) */
  noPixComDesconto: string;
  /** "≈ US$ {v}" */
  dolar: string;
  /** "Horário de saída" ou "Horário de busca na hospedagem". */
  rotuloHorario: string;
  escolhaHorario: string;
  adicionar: string;
  reservarAgora: string;
  adicionando: string;
}

/**
 * Cartão de reserva: opção, data e pessoas, com o total na hora (no Pix em destaque e no cartão) e,
 * embaixo do botão, as garantias. Abre com o grupo escolhido no site.
 */
export function WidgetReserva({
  slug,
  nome,
  horas,
  opcoes,
  mostrarOpcoes,
  contadores,
  regras,
  locale,
  finalizarHref,
  garantias,
  dolar = null,
  notaCambio = '',
  textos: T,
}: {
  slug: string;
  nome: string;
  /** Os horários do passeio ("HH:MM"): quando os de hoje já passaram, a data começa amanhã. */
  horas: string[];
  opcoes: OpcaoWidget[];
  mostrarOpcoes: boolean;
  contadores: FaixaContador[];
  regras: string[];
  locale: string;
  /** O checkout único, para onde o "Reservar agora" leva com o item já no carrinho. */
  finalizarHref: string;
  /** As garantias (cancelamento, chuva, voucher, pagamento) logo abaixo do botão. */
  garantias?: ReactNode;
  /** Reais por dólar, para o "≈ US$" das páginas em espanhol e inglês (null no português). */
  dolar?: number | null;
  /** A nota com a fonte e a data da cotação, perto do total (vazia sem o ≈ US$). */
  notaCambio?: string;
  textos: TextosWidget;
}) {
  const router = useRouter();
  const { grupo, alterar, pronto } = useGrupo();
  const [opcaoId, setOpcaoId] = useState(opcoes[0].id);
  const [hoje, setHoje] = useState('');
  const [primeiroDia, setPrimeiroDia] = useState('');
  const [pessoas, setPessoas] = useState<Pessoas>(() => normalizarPessoas(opcoes[0].tabela, { adultos: 2 }));
  const [erroData, setErroData] = useState(false);
  const [hora, setHora] = useState(horas.length === 1 ? horas[0] : '');
  const [erroHora, setErroHora] = useState(false);
  const [enviando, setEnviando] = useState<'' | 'agora' | 'carrinho'>('');
  const [erroEnvio, setErroEnvio] = useState('');
  const { itens, carregado, adicionar } = useCarrinho();
  // o item do carrinho que o cliente está mudando (?mudar=): o cartão abre com o que ele tinha escolhido
  const [mudando, setMudando] = useState('');
  const dataRef = useRef<HTMLInputElement>(null);
  // os pedaços da data e do horário: para onde a tela vai quando um deles falta (Pacote 34, ENT-02)
  const blocoData = useRef<HTMLDivElement>(null);
  const blocoHora = useRef<HTMLDivElement>(null);
  const idData = useId();
  const idHora = useId();
  const idioma = locale.slice(0, 2) as Idioma;
  const opcao = opcoes.find((o) => o.id === opcaoId) ?? opcoes[0];

  // quando o grupo salvo na sessão é lido, a reserva começa com ele
  const aplicado = useRef(false);
  useEffect(() => {
    if (!pronto || aplicado.current) return;
    aplicado.current = true;
    setPessoas(pessoasDoGrupo(grupo, opcoes[0].tabela));
  }, [pronto, grupo, opcoes]);

  const mudarLido = useRef(false);
  useEffect(() => {
    if (!pronto || !carregado || mudarLido.current) return;
    mudarLido.current = true;
    const id = new URLSearchParams(window.location.search).get('mudar');
    const e = itens.find((i) => i.id === id)?.escolha;
    if (!id || e?.tipo !== 'passeio' || e.slug !== slug) return;
    setMudando(id);
    if (e.opcao) setOpcaoId(e.opcao);
    alterar({ data: e.data });
    setHora(e.hora);
    setPessoas({ adultos: e.adultos, criancasMeia: e.meia, criancasGratis: e.gratis });
  }, [pronto, carregado, itens, slug, alterar]);

  useEffect(() => {
    setHoje(hojeEmBuzios());
    setPrimeiroDia(primeiroDiaComHorario(horas));
  }, [horas]);

  useEffect(() => {
    rastrear('ViewContent', {
      content_ids: [slug],
      content_name: nome,
      content_type: 'product',
      value: opcoes[0].tabela.precoCentavos / 100,
      currency: 'BRL',
    });
  }, [slug, nome, opcoes]);

  const orc = useMemo(() => calcular(opcao.tabela, pessoas), [opcao, pessoas]);
  const totalPix = totalPixCentavos(orc);
  const brl = (c: number) => formatarCifra(c, locale);
  const menorPreco = Math.min(...opcoes.map((o) => o.tabela.precoCentavos));
  const usd = (c: number) => textoDolar(c, dolar, T.dolar, locale);
  // em espanhol e inglês, o preço do cartão é o grande e o do Pix vai embaixo, com o desconto (src/lib/preco-destaque.ts)
  const cartaoPrimeiro = cartaoEmDestaque(locale);
  const rotuloPix = rotuloPixComDesconto(T.noPixComDesconto);
  const [precoGrande, precoEmbaixo] = cartaoPrimeiro
    ? [menorPreco, precoPixCentavos(menorPreco)]
    : [precoPixCentavos(menorPreco), menorPreco];
  const [totalGrande, totalEmbaixo] = cartaoPrimeiro ? [orc.totalCentavos, totalPix] : [totalPix, orc.totalCentavos];
  const totalPessoas = pessoas.adultos + pessoas.criancasMeia + pessoas.criancasGratis;
  // a data do grupo é hoje, mas os horários de hoje já passaram
  const semHorarioHoje = Boolean(primeiroDia) && grupo.data === hoje && hoje < primeiroDia;
  // no dia de hoje, os horários que já passaram ficam apagados
  const livres = hoje ? horasDisponiveis(horas, grupo.data) : horas;
  const faltaData = !dataPasseioValida(grupo.data) || semHorarioHoje;
  // com um horário só, ele já vem escolhido: só falta quando ele já passou hoje (e aí o que muda é a data)
  const faltaHora = !hora || !livres.includes(hora);
  // depois do toque sem a data ou sem o horário, o que ainda falta, repetido perto dos botões (some quando a pessoa escolhe)
  const avisoPerto = avisoDaFalta({ data: erroData, horario: erroHora, semHorarioHoje }, T);

  /** Põe no carrinho: "Adicionar" abre a gaveta; "Reservar agora" segue direto para o checkout. */
  const colocar = async (destino: 'agora' | 'carrinho') => {
    setErroEnvio('');
    if (faltaData || faltaHora) {
      // Pacote 34 (ENT-02): os dois campos que faltam ficam em destaque e a tela vai até o primeiro, no meio da tela,
      // longe da cápsula do menu. Antes, sem o horário, nada se mexia e o botão parecia não funcionar
      setErroData(faltaData);
      setErroHora(faltaHora);
      if (faltaData) levarAoCampo(blocoData.current, dataRef.current);
      else levarAoCampo(blocoHora.current, blocoHora.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'));
      return;
    }
    setEnviando(destino);
    const r = await adicionar(
      {
        tipo: 'passeio',
        slug,
        ...(mostrarOpcoes ? { opcao: opcao.id } : {}),
        data: grupo.data,
        hora,
        adultos: pessoas.adultos,
        meia: pessoas.criancasMeia,
        gratis: pessoas.criancasGratis,
      },
      { abrir: destino === 'carrinho', ...(mudando ? { substituir: mudando } : {}) },
    );
    if (r.ok) {
      setMudando('');
      rastrear('AddToCart', {
        content_ids: [slug],
        content_name: nome,
        content_type: 'product',
        value: orc.totalCentavos / 100,
        currency: 'BRL',
      });
      if (destino === 'agora') {
        // fica "adicionando" até a página do checkout abrir
        router.push(finalizarHref);
        return;
      }
    } else {
      // Pacote 34 (ENT-10): sem conexão, o aviso pede para conferir a internet; só os erros de data ou de horário falam deles
      setErroEnvio(textoDaRecusa(r.erro, T));
    }
    setEnviando('');
  };

  return (
    // abaixo da cápsula do menu, que também fica presa no topo
    <div id="reservar" className="scroll-mt-24">
      <div className="rounded-cartao border border-(--color-borda) bg-(--color-papel) p-5 sm:p-6">
        <h2 className="text-lead font-semibold">{T.titulo}</h2>
        {/* cada pedaço fica inteiro e o "·" do dólar só aparece ao lado de outro pedaço, nunca no começo da linha */}
        <p className="mt-1">
          <Pedacos folga="justa" comPonto={Boolean(usd(precoGrande))}>
            {mostrarOpcoes && <Pedaco className="text-small text-(--color-tinta-suave)">{T.aPartirDe}</Pedaco>}
            <Pedaco forte className="cifra text-figure">
              {brl(precoGrande)}
            </Pedaco>
            {cartaoPrimeiro ? (
              <Pedaco className="text-small font-semibold whitespace-nowrap">{T.noCartao}</Pedaco>
            ) : (
              <Pedaco className="text-small font-semibold whitespace-nowrap text-(--color-sucesso)">{T.noPix}</Pedaco>
            )}
            {usd(precoGrande) && (
              <Pedaco ponto className="text-small text-(--color-tinta-suave)">
                {usd(precoGrande)}
              </Pedaco>
            )}
            <Pedaco className="text-small text-(--color-tinta-suave)">{T.rotuloUnidade}</Pedaco>
          </Pedacos>
        </p>
        <p className="text-small text-(--color-tinta-suave)">
          <ComDolar dolar={usd(precoEmbaixo)}>
            <span className="whitespace-nowrap">
              <span className="numeros font-semibold text-(--color-tinta)">{brl(precoEmbaixo)}</span>{' '}
              {cartaoPrimeiro ? <span className="font-semibold text-(--color-sucesso)">{rotuloPix}</span> : T.noCartao}
            </span>
          </ComDolar>
        </p>

        {mostrarOpcoes && (
          <fieldset className="mt-5 min-w-0">
            <legend className="rotulo">{T.escolhaOpcao}</legend>
            {/* duas colunas; quando cada uma ficaria com menos de 7rem (letra grande em tela estreita), um botão embaixo
                do outro. Com a letra normal, a partir de 320 px, são sempre duas */}
            <div className="@container">
              <div className="grid grid-cols-2 gap-1.5 @max-[14.375rem]:grid-cols-1" role="radiogroup">
                {opcoes.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={o.id === opcao.id}
                    onClick={() => setOpcaoId(o.id)}
                    className="filtro flex-col items-start justify-start !gap-0 whitespace-normal py-2.5 text-left"
                  >
                    <span>{o.nome}</span>
                    {/* em tela estreita, com preço alto, o "no Pix" desce para a linha de baixo, dentro do botão; o conteúdo
                        fica no alto, para os nomes dos botões lado a lado ficarem na mesma altura quando só um preço desce. O
                        preço pode usar 8 px do recuo antes de descer (-mr-2): em 360 px ele fica numa linha só, como sempre foi */}
                    <span className="numeros -mr-2 text-small font-normal">
                      {brl(cartaoPrimeiro ? o.tabela.precoCentavos : precoPixCentavos(o.tabela.precoCentavos))}{' '}
                      <span className="whitespace-nowrap">{cartaoPrimeiro ? T.noCartao : T.noPix}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </fieldset>
        )}

        {/* a data e o horário, cada um no seu pedaço: com o toque em Reservar sem ele, o pedaço ganha o fundo rosado e a
            tela vai até ele (Pacote 34, ENT-02) */}
        <div ref={blocoData} className="bloco-campo mt-5" data-falta={erroData ? '' : undefined}>
          <label htmlFor={idData} className="rotulo">
            {T.data}
          </label>
          <CampoData
            ref={dataRef}
            id={idData}
            valor={grupo.data}
            dica={T.escolhaData}
            min={primeiroDia || undefined}
            max={hoje ? somarDias(hoje, 366) : undefined}
            onChange={(e) => {
              alterar({ data: e.target.value });
              setErroData(false);
            }}
            aria-invalid={erroData || semHorarioHoje}
            aria-describedby={erroData || semHorarioHoje ? `${idData}-erro` : undefined}
            required
          />
          {(erroData || semHorarioHoje) && (
            <span id={`${idData}-erro`} className="erro-campo">
              {semHorarioHoje ? T.semHorarioHoje : T.escolhaData}
            </span>
          )}
        </div>

        {horas.length > 1 && (
          <div ref={blocoHora} className="bloco-campo mt-5" data-falta={erroHora ? '' : undefined}>
            <fieldset className="min-w-0" aria-describedby={erroHora ? `${idHora}-erro` : undefined}>
              <legend className="rotulo">{T.rotuloHorario}</legend>
              <div className="flex flex-wrap gap-1.5">
                {horas.map((h) => {
                  const passou = !livres.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-pressed={hora === h}
                      disabled={passou}
                      onClick={() => {
                        setHora(h);
                        setErroHora(false);
                      }}
                      className="filtro numeros min-w-[4.5rem] justify-center disabled:opacity-40"
                    >
                      {formatarHora(h, idioma)}
                    </button>
                  );
                })}
              </div>
              {erroHora && (
                <span id={`${idHora}-erro`} className="erro-campo">
                  {T.escolhaHorario}
                </span>
              )}
            </fieldset>
          </div>
        )}

        <div className="mt-5 space-y-4">
          {contadores.map((c) => (
            <Contador
              key={c.campo}
              rotulo={c.rotulo}
              ajuda={c.ajuda}
              valor={pessoas[c.campo]}
              min={c.campo === 'adultos' ? 1 : 0}
              max={30}
              aoMudar={(v) => setPessoas((p) => ({ ...p, [c.campo]: v }))}
              textos={T}
            />
          ))}
        </div>
        {regras.length > 0 && <p className="mt-4 text-small text-(--color-tinta-suave)">{regras.join(' ')}</p>}

        <div className="mt-5 border-t border-(--color-borda) pt-4">
          {/* "Total no Pix" e "≈ US$ 24,93" ficam inteiros; quando o rótulo e o valor não cabem lado a lado (tela estreita,
              total alto), o valor desce para a linha de baixo, à direita, em vez de alargar o cartão e a página rolar de lado */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="flex-1 font-semibold">
              <ComDolar dolar={usd(totalGrande)} className="text-small font-normal text-(--color-tinta-suave)">
                <span className="whitespace-nowrap">
                  {T.total} {cartaoPrimeiro ? T.noCartao : <span className="text-(--color-sucesso)">{T.noPix}</span>}
                </span>
              </ComDolar>
            </span>
            {/* os números rolam na tela; o leitor de tela ouve só os valores finais */}
            <span aria-hidden="true" className="ml-auto">
              <Cifra centavos={totalGrande} locale={locale} className="cifra text-figure-lg" />
            </span>
          </div>
          <p
            className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-small text-(--color-tinta-suave)"
            aria-hidden="true"
          >
            <span className="flex-1">
              <ComDolar dolar={usd(totalEmbaixo)}>
                <span className="whitespace-nowrap">
                  {T.total} {cartaoPrimeiro ? <span className="font-semibold text-(--color-sucesso)">{rotuloPix}</span> : T.noCartao}
                </span>
              </ComDolar>
            </span>
            <Cifra centavos={totalEmbaixo} locale={locale} className="numeros ml-auto font-semibold text-(--color-tinta)" />
          </p>
          <span className="sr-only" aria-live="polite">
            {cartaoPrimeiro
              ? `${T.total} ${T.noCartao}: ${brl(orc.totalCentavos)}. ${T.total} ${T.noPix}: ${brl(totalPix)}.`
              : `${T.total} ${T.noPix}: ${brl(totalPix)}. ${T.total} ${T.noCartao}: ${brl(orc.totalCentavos)}.`}
          </span>
          {/* a fonte e a data da cotação, só quando o ≈ US$ aparece (espanhol e inglês) */}
          {dolar && notaCambio && <p className="mt-2 text-caption text-(--color-tinta-suave)">{notaCambio}</p>}
        </div>
        {opcao.tabela.unidade !== 'pessoa' && (
          <p className="mt-2 text-right text-small font-semibold" aria-live="polite">
            {T.unidadesAviso
              .replace('{pessoas}', `${totalPessoas} ${totalPessoas === 1 ? T.pessoa : T.pessoas}`)
              .replace('{n}', String(orc.unidades))
              .replace('{unidade}', orc.unidades === 1 ? T.unidadeSingular : T.unidadePlural)}
          </p>
        )}
        {/* perto dos botões: o que falta escolher lá em cima (o mesmo aviso dos campos) ou por que o envio não passou */}
        {(avisoPerto || erroEnvio) && (
          <p className="mt-4 bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
            {avisoPerto || erroEnvio}
          </p>
        )}
        <div className="mt-5 grid gap-2">
          <button
            type="button"
            onClick={() => colocar('agora')}
            disabled={Boolean(enviando)}
            aria-busy={enviando === 'agora'}
            className="botao w-full"
          >
            {enviando === 'agora' ? T.adicionando : T.reservarAgora}
          </button>
          <button
            type="button"
            onClick={() => colocar('carrinho')}
            disabled={Boolean(enviando)}
            aria-busy={enviando === 'carrinho'}
            className="botao botao-vazado w-full"
          >
            {enviando === 'carrinho' ? T.adicionando : T.adicionar}
          </button>
          {/* nenhum dos botões cobra na hora: a frase tira a dúvida ali mesmo */}
          <p className="text-small text-(--color-tinta-suave)">{T.semCobranca}</p>
          {/* o total não inclui as taxas pagas no local (embarque ou prefeitura): dito perto dele, antes da compra */}
          {T.taxasNoLocal && <p className="text-small text-(--color-tinta-suave)">{T.taxasNoLocal}</p>}
        </div>
        {garantias && <div className="mt-5">{garantias}</div>}
      </div>
    </div>
  );
}
