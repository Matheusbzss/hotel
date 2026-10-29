'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { calcular, formatarCentavos, normalizarPessoas, type Pessoas } from '@/lib/orcamento';
import type { FaixaContador } from '@/lib/passeio-view';
import { textoPessoas, type RotulosPessoas } from '@/lib/pessoas';
import { rastrear } from '@/lib/pixel';
import {
  CIDADES_HOSPEDAGEM,
  DDIS,
  NOME_CIDADE_HOSPEDAGEM,
  cartaoValido,
  cpfValido,
  dataPasseioValida,
  emailValido,
  formatarDataIso,
  hojeEmBuzios,
  passaporteValido,
  somarDias,
  soDigitos,
  telefoneValido,
  validadeCartaoValida,
  type CidadeHospedagem,
} from '@/lib/validacao';
import { Contador } from './grupo/Contador';
import { IconeWhatsApp } from './IconeWhatsApp';
import type { OpcaoWidget } from './WidgetReserva';

type Textos = {
  seusDados: string;
  nome: string;
  email: string;
  telefone: string;
  telefoneAjuda: string;
  ddi: string;
  documento: string;
  cpf: string;
  passaporte: string;
  numeroDocumento: string;
  hospedagem: string;
  cidadeHospedagem: string;
  selecione: string;
  hotel: string;
  passeio: string;
  data: string;
  observacoes: string;
  observacoesAjuda: string;
  aceitePre: string;
  aceiteTermos: string;
  aceiteMeio: string;
  aceitePolitica: string;
  pagamento: string;
  pix: string;
  cartao: string;
  pixTexto: string;
  cartaoNumero: string;
  cartaoNome: string;
  cartaoValidade: string;
  cartaoCvv: string;
  cobranca: string;
  pais: string;
  cep: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  pagarPix: string;
  pagarCartao: string;
  processando: string;
  avisoTotal: string;
  seguro: string;
  resumo: string;
  total: string;
  indisponivelTitulo: string;
  indisponivelTexto: string;
  finalizarWhatsapp: string;
  diminuir: string;
  aumentar: string;
  opcao: string;
  quantas: string;
  unidadeSingular: string;
  unidadePlural: string;
  rotulos: RotulosPessoas;
  erros: {
    obrigatorio: string;
    email: string;
    telefone: string;
    cpf: string;
    passaporte: string;
    data: string;
    pessoas: string;
    aceite: string;
    cartao: string;
    recusado: string;
    generico: string;
    revise: string;
  };
};

const PAISES = ['BR', 'AR', 'UY', 'CL', 'PY', 'BO', 'PE', 'CO', 'MX', 'US', 'CA', 'PT', 'ES', 'FR', 'DE', 'IT', 'GB', 'NL', 'CH', 'IL'];

type Erros = Partial<Record<string, string>>;

function Campo({
  id,
  rotulo,
  erro,
  ajuda,
  children,
  className = '',
}: {
  id: string;
  rotulo: string;
  erro?: string;
  ajuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      {children}
      {ajuda && !erro && (
        <span id={`${id}-ajuda`} className="ajuda">
          {ajuda}
        </span>
      )}
      {erro && (
        <span id={`${id}-erro`} className="erro-campo" role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}

const descricao = (id: string, erro?: string, ajuda?: string) => (erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined);

export function FormularioCheckout({
  idioma,
  locale,
  passeio,
  opcoes,
  mostrarOpcoes,
  contadores,
  regras,
  semFaixas,
  inicial,
  pagamentoOnline,
  chavePublica,
  textos,
  links,
}: {
  idioma: 'pt' | 'en' | 'es';
  locale: string;
  passeio: { slug: string; nome: string; cidade: string; duracao: string };
  opcoes: OpcaoWidget[];
  mostrarOpcoes: boolean;
  contadores: FaixaContador[];
  regras: string[];
  semFaixas: boolean;
  inicial: { data: string; opcao: string; pessoas: Partial<Pessoas> };
  pagamentoOnline: boolean;
  chavePublica?: string;
  textos: Textos;
  links: { termos: string; politica: string; reserva: string };
}) {
  const router = useRouter();
  const [hoje, setHoje] = useState('');
  const [data, setData] = useState(inicial.data);
  const [opcaoId, setOpcaoId] = useState(opcoes.some((o) => o.id === inicial.opcao) ? inicial.opcao : opcoes[0].id);
  const opcao = opcoes.find((o) => o.id === opcaoId) ?? opcoes[0];
  const [pessoas, setPessoas] = useState<Pessoas>(() => {
    const p = normalizarPessoas(opcoes[0].tabela, inicial.pessoas);
    return { ...p, adultos: Math.max(1, p.adultos) };
  });
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [ddi, setDdi] = useState(idioma === 'es' ? '54' : idioma === 'en' ? '1' : '55');
  const [telefone, setTelefone] = useState('');
  const [docTipo, setDocTipo] = useState<'cpf' | 'passaporte'>(idioma === 'pt' ? 'cpf' : 'passaporte');
  const [documento, setDocumento] = useState('');
  const [cidadeHosp, setCidadeHosp] = useState<CidadeHospedagem | ''>('');
  const [hotel, setHotel] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [aceite, setAceite] = useState(false);
  const [metodo, setMetodo] = useState<'pix' | 'cartao'>('pix');
  const [cartao, setCartao] = useState({ numero: '', nome: '', validade: '', cvv: '' });
  const [cobranca, setCobranca] = useState({
    pais: idioma === 'es' ? 'AR' : idioma === 'en' ? 'US' : 'BR',
    cep: '',
    endereco: '',
    bairro: '',
    cidade: '',
    estado: '',
  });
  const [tentou, setTentou] = useState(false);
  const [errosExtras, setErrosExtras] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [isca, setIsca] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setHoje(hojeEmBuzios());
  }, []);

  const orc = useMemo(() => calcular(opcao.tabela, pessoas), [opcao, pessoas]);
  const brl = (c: number) => formatarCentavos(c, locale);

  useEffect(() => {
    rastrear('InitiateCheckout', {
      content_ids: [passeio.slug],
      content_type: 'product',
      value: orc.totalCentavos / 100,
      currency: 'BRL',
      num_items: 1,
    });
    // só na abertura do checkout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nomesPaises = useMemo(() => {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'region' });
      return Object.fromEntries(PAISES.map((p) => [p, dn.of(p) ?? p]));
    } catch {
      return Object.fromEntries(PAISES.map((p) => [p, p]));
    }
  }, [locale]);

  function validar(): Erros {
    const e: Erros = {};
    const E = textos.erros;
    if (!dataPasseioValida(data)) e.data = E.data;
    if (pessoas.adultos < 1) e.adultos = E.pessoas;
    if (nome.trim().length < 3) e.nome = E.obrigatorio;
    if (!emailValido(email)) e.email = E.email;
    if (!telefoneValido(ddi, telefone)) e.telefone = E.telefone;
    if (docTipo === 'cpf' ? !cpfValido(documento) : !passaporteValido(documento)) e.documento = docTipo === 'cpf' ? E.cpf : E.passaporte;
    if (!cidadeHosp) e.cidadeHosp = E.obrigatorio;
    if (hotel.trim().length < 2) e.hotel = E.obrigatorio;
    if (!aceite) e.aceite = E.aceite;
    if (pagamentoOnline && metodo === 'cartao') {
      const [mm, aa] = cartao.validade.split('/').map((v) => Number(v));
      if (!cartaoValido(cartao.numero)) e.cartaoNumero = E.cartao;
      if (cartao.nome.trim().length < 3) e.cartaoNome = E.obrigatorio;
      if (!validadeCartaoValida(mm, aa)) e.cartaoValidade = E.cartao;
      if (!/^\d{3,4}$/.test(cartao.cvv)) e.cartaoCvv = E.cartao;
      if (!cobranca.cep.trim()) e.cep = E.obrigatorio;
      if (!cobranca.endereco.trim()) e.endereco = E.obrigatorio;
      if (!cobranca.cidade.trim()) e.cidade = E.obrigatorio;
      if (!cobranca.estado.trim()) e.estado = E.obrigatorio;
    }
    return e;
  }

  // depois da primeira tentativa, os erros são recalculados a cada mudança (somem quando o campo é corrigido)
  const erros: Erros = { ...(tentou ? validar() : {}), ...errosExtras };
  const temErros = Object.keys(erros).length > 0;

  async function tokenizarCartao(): Promise<string> {
    const [mm, aa] = cartao.validade.split('/').map((v) => Number(v));
    const api = process.env.NEXT_PUBLIC_PAGARME_API_URL || 'https://api.pagar.me/core/v5';
    const res = await fetch(`${api}/tokens?appId=${encodeURIComponent(chavePublica ?? '')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'card',
        card: {
          number: soDigitos(cartao.numero),
          holder_name: cartao.nome.trim(),
          exp_month: mm,
          exp_year: aa < 100 ? 2000 + aa : aa,
          cvv: cartao.cvv,
        },
      }),
    });
    if (!res.ok) throw new Error('token');
    const corpo = (await res.json()) as { id?: string };
    if (!corpo.id) throw new Error('token');
    return corpo.id;
  }

  async function enviar(forma: 'pix' | 'cartao' | 'whatsapp') {
    setErroGeral('');
    setErrosExtras({});
    setTentou(true);
    const e = validar();
    if (Object.keys(e).length) {
      requestAnimationFrame(() => {
        const primeiro = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        primeiro?.focus();
      });
      return;
    }
    setEnviando(true);
    try {
      let pagamento: Record<string, unknown> = { metodo: forma };
      if (forma === 'cartao') {
        let token: string;
        try {
          token = await tokenizarCartao();
        } catch {
          setErrosExtras({ cartaoNumero: textos.erros.cartao });
          setErroGeral(textos.erros.cartao);
          setEnviando(false);
          return;
        }
        pagamento = { metodo: 'cartao', token, cobranca: { ...cobranca, cep: cobranca.cep.trim() } };
      }
      rastrear('AddPaymentInfo', { content_ids: [passeio.slug], value: orc.totalCentavos / 100, currency: 'BRL' });
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idioma,
          slug: passeio.slug,
          data,
          ...(mostrarOpcoes ? { opcao: opcao.id } : {}),
          adultos: pessoas.adultos,
          criancasMeia: pessoas.criancasMeia,
          criancasGratis: pessoas.criancasGratis,
          cliente: { nome: nome.trim(), email: email.trim(), ddi, telefone, documentoTipo: docTipo, documento: documento.trim() },
          hospedagem: { cidade: cidadeHosp, hotel: hotel.trim() },
          observacoes: observacoes.trim(),
          aceite: true,
          pagamento,
          site: isca,
        }),
      });
      const corpo = (await res.json().catch(() => ({}))) as { ok?: boolean; codigo?: string; token?: string; erro?: string };
      if (corpo.ok && corpo.codigo && corpo.token) {
        router.push(`${links.reserva}/${corpo.codigo}?t=${encodeURIComponent(corpo.token)}`);
        return;
      }
      setErroGeral(corpo.erro === 'recusado' ? textos.erros.recusado : textos.erros.generico);
    } catch {
      setErroGeral(textos.erros.generico);
    }
    setEnviando(false);
  }

  const T = textos;
  const pessoasTexto = textoPessoas(pessoas, T.rotulos, semFaixas);
  const R = T.rotulos;
  const rotuloLinha = (tipo: string, q: number) =>
    tipo === 'adulto'
      ? `${q} × ${semFaixas ? (q === 1 ? R.pessoa : R.pessoas) : q === 1 ? R.adulto : R.adultos}`
      : tipo === 'meia'
        ? `${q} × ${q === 1 ? R.criancaMeia : R.criancasMeia}`
        : tipo === 'gratis'
          ? `${q} × ${q === 1 ? R.criancaGratis : R.criancasGratis}`
          : `${q} × ${q === 1 ? T.unidadeSingular : T.unidadePlural}`;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        enviar(pagamentoOnline ? metodo : 'whatsapp');
      }}
      className="grid gap-10 lg:grid-cols-12 lg:gap-14"
    >
      <div className="space-y-12 lg:col-span-7">
        {/* PASSEIO */}
        <fieldset className="min-w-0">
          <legend className="text-lead font-bold">{T.passeio}</legend>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Campo id="data" rotulo={T.data} erro={erros.data} className="sm:col-span-2">
              <input
                id="data"
                type="date"
                className="campo"
                value={data}
                min={hoje || undefined}
                max={hoje ? somarDias(hoje, 366) : undefined}
                onChange={(e) => setData(e.target.value)}
                aria-invalid={Boolean(erros.data)}
                aria-describedby={descricao('data', erros.data)}
                required
              />
            </Campo>
            {mostrarOpcoes && (
              <fieldset className="min-w-0 sm:col-span-2">
                <legend className="rotulo">{T.opcao}</legend>
                <div className="grid grid-cols-2 gap-1.5" role="radiogroup">
                  {opcoes.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={o.id === opcao.id}
                      onClick={() => setOpcaoId(o.id)}
                      className="filtro flex-col items-start !gap-0 py-2.5 text-left"
                    >
                      <span>{o.nome}</span>
                      <span className="numeros text-small font-normal">{brl(o.tabela.precoCentavos)}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className="min-w-0 space-y-4 bg-papel p-5 sm:col-span-2">
              <legend className="sr-only">{T.quantas}</legend>
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
              {regras.length > 0 && <p className="text-small text-(--tinta-suave)">{regras.join(' ')}</p>}
            </fieldset>
          </div>
        </fieldset>

        {/* DADOS */}
        <fieldset className="min-w-0">
          <legend className="text-lead font-bold">{T.seusDados}</legend>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Campo id="nome" rotulo={T.nome} erro={erros.nome} className="sm:col-span-2">
              <input
                id="nome"
                className="campo"
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={120}
                aria-invalid={Boolean(erros.nome)}
                aria-describedby={descricao('nome', erros.nome)}
                required
              />
            </Campo>
            <Campo id="email" rotulo={T.email} erro={erros.email} className="sm:col-span-2">
              <input
                id="email"
                type="email"
                inputMode="email"
                className="campo"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={160}
                aria-invalid={Boolean(erros.email)}
                aria-describedby={descricao('email', erros.email)}
                required
              />
            </Campo>
            <div className="sm:col-span-2">
              <span className="rotulo" id="telefone-rotulo">
                {T.telefone}
              </span>
              <div className="flex gap-2">
                <label htmlFor="ddi" className="sr-only">
                  {T.ddi}
                </label>
                <select
                  id="ddi"
                  className="campo w-[7.5rem] shrink-0"
                  value={ddi}
                  onChange={(e) => setDdi(e.target.value)}
                  autoComplete="tel-country-code"
                >
                  {DDIS.map((o) => (
                    <option key={o.ddi + o.pais} value={o.ddi}>
                      {o.pais} +{o.ddi}
                    </option>
                  ))}
                </select>
                <input
                  id="telefone"
                  type="tel"
                  inputMode="tel"
                  className="campo"
                  autoComplete="tel-national"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  maxLength={24}
                  aria-labelledby="telefone-rotulo"
                  aria-invalid={Boolean(erros.telefone)}
                  aria-describedby={descricao('telefone', erros.telefone, T.telefoneAjuda)}
                  required
                />
              </div>
              {erros.telefone ? (
                <span id="telefone-erro" className="erro-campo" role="alert">
                  {erros.telefone}
                </span>
              ) : (
                <span id="telefone-ajuda" className="ajuda">
                  {T.telefoneAjuda}
                </span>
              )}
            </div>
            <fieldset className="min-w-0 sm:col-span-2">
              <legend className="rotulo">{T.documento}</legend>
              <div className="flex flex-wrap gap-2">
                {(['cpf', 'passaporte'] as const).map((t) => (
                  <label
                    key={t}
                    className="filtro cursor-pointer has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-turquesa"
                    data-ativo={docTipo === t}
                  >
                    <input
                      type="radio"
                      name="docTipo"
                      value={t}
                      checked={docTipo === t}
                      onChange={() => setDocTipo(t)}
                      className="sr-only"
                    />
                    {t === 'cpf' ? T.cpf : T.passaporte}
                  </label>
                ))}
              </div>
            </fieldset>
            <Campo id="documento" rotulo={T.numeroDocumento} erro={erros.documento} className="sm:col-span-2">
              <input
                id="documento"
                className="campo"
                inputMode={docTipo === 'cpf' ? 'numeric' : 'text'}
                autoComplete="off"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                maxLength={24}
                aria-invalid={Boolean(erros.documento)}
                aria-describedby={descricao('documento', erros.documento)}
                required
              />
            </Campo>
          </div>
        </fieldset>

        {/* HOSPEDAGEM */}
        <fieldset className="min-w-0">
          <legend className="text-lead font-bold">{T.hospedagem}</legend>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <Campo id="cidadeHosp" rotulo={T.cidadeHospedagem} erro={erros.cidadeHosp}>
              <select
                id="cidadeHosp"
                className="campo"
                value={cidadeHosp}
                onChange={(e) => setCidadeHosp(e.target.value as CidadeHospedagem)}
                aria-invalid={Boolean(erros.cidadeHosp)}
                aria-describedby={descricao('cidadeHosp', erros.cidadeHosp)}
                required
              >
                <option value="">{T.selecione}</option>
                {CIDADES_HOSPEDAGEM.map((c) => (
                  <option key={c} value={c}>
                    {NOME_CIDADE_HOSPEDAGEM[c]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="hotel" rotulo={T.hotel} erro={erros.hotel}>
              <input
                id="hotel"
                className="campo"
                value={hotel}
                onChange={(e) => setHotel(e.target.value)}
                maxLength={120}
                aria-invalid={Boolean(erros.hotel)}
                aria-describedby={descricao('hotel', erros.hotel)}
                required
              />
            </Campo>
            <Campo id="obs" rotulo={T.observacoes} ajuda={T.observacoesAjuda} className="sm:col-span-2">
              <textarea
                id="obs"
                className="campo min-h-28"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                maxLength={600}
                aria-describedby="obs-ajuda"
              />
            </Campo>
          </div>
        </fieldset>

        {/* campo-isca para robôs: escondido de pessoas */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="site">Site</label>
          <input id="site" tabIndex={-1} autoComplete="off" value={isca} onChange={(e) => setIsca(e.target.value)} />
        </div>

        {/* PAGAMENTO */}
        <fieldset className="min-w-0">
          <legend className="text-lead font-bold">{T.pagamento}</legend>
          {pagamentoOnline ? (
            <>
              <div className="mt-5 flex flex-wrap gap-2" role="radiogroup" aria-label={T.pagamento}>
                {(['pix', 'cartao'] as const).map((m) => (
                  <label
                    key={m}
                    className="filtro cursor-pointer px-6 has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-turquesa"
                    data-ativo={metodo === m}
                  >
                    <input type="radio" name="metodo" value={m} checked={metodo === m} onChange={() => setMetodo(m)} className="sr-only" />
                    {m === 'pix' ? T.pix : T.cartao}
                  </label>
                ))}
              </div>
              {metodo === 'pix' ? (
                <p className="mt-5 bg-papel px-5 py-4">{T.pixTexto}</p>
              ) : (
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <Campo id="cartaoNumero" rotulo={T.cartaoNumero} erro={erros.cartaoNumero} className="sm:col-span-2">
                    <input
                      id="cartaoNumero"
                      className="campo"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      value={cartao.numero}
                      onChange={(e) => {
                        setErrosExtras({});
                        setCartao({ ...cartao, numero: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) });
                      }}
                      aria-invalid={Boolean(erros.cartaoNumero)}
                      aria-describedby={descricao('cartaoNumero', erros.cartaoNumero)}
                    />
                  </Campo>
                  <Campo id="cartaoNome" rotulo={T.cartaoNome} erro={erros.cartaoNome} className="sm:col-span-2">
                    <input
                      id="cartaoNome"
                      className="campo"
                      autoComplete="cc-name"
                      value={cartao.nome}
                      onChange={(e) => setCartao({ ...cartao, nome: e.target.value })}
                      aria-invalid={Boolean(erros.cartaoNome)}
                      aria-describedby={descricao('cartaoNome', erros.cartaoNome)}
                    />
                  </Campo>
                  <Campo id="cartaoValidade" rotulo={T.cartaoValidade} erro={erros.cartaoValidade}>
                    <input
                      id="cartaoValidade"
                      className="campo"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/AA"
                      value={cartao.validade}
                      onChange={(e) => {
                        const d = soDigitos(e.target.value).slice(0, 4);
                        setCartao({ ...cartao, validade: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d });
                      }}
                      aria-invalid={Boolean(erros.cartaoValidade)}
                      aria-describedby={descricao('cartaoValidade', erros.cartaoValidade)}
                    />
                  </Campo>
                  <Campo id="cartaoCvv" rotulo={T.cartaoCvv} erro={erros.cartaoCvv}>
                    <input
                      id="cartaoCvv"
                      className="campo"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      value={cartao.cvv}
                      onChange={(e) => setCartao({ ...cartao, cvv: soDigitos(e.target.value).slice(0, 4) })}
                      aria-invalid={Boolean(erros.cartaoCvv)}
                      aria-describedby={descricao('cartaoCvv', erros.cartaoCvv)}
                    />
                  </Campo>
                  <p className="font-semibold sm:col-span-2">{T.cobranca}</p>
                  <Campo id="pais" rotulo={T.pais}>
                    <select
                      id="pais"
                      className="campo"
                      value={cobranca.pais}
                      onChange={(e) => setCobranca({ ...cobranca, pais: e.target.value })}
                      autoComplete="country"
                    >
                      {PAISES.map((p) => (
                        <option key={p} value={p}>
                          {nomesPaises[p]}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo id="cep" rotulo={T.cep} erro={erros.cep}>
                    <input
                      id="cep"
                      className="campo"
                      autoComplete="postal-code"
                      value={cobranca.cep}
                      onChange={(e) => setCobranca({ ...cobranca, cep: e.target.value.slice(0, 16) })}
                      aria-invalid={Boolean(erros.cep)}
                      aria-describedby={descricao('cep', erros.cep)}
                    />
                  </Campo>
                  <Campo id="endereco" rotulo={T.endereco} erro={erros.endereco} className="sm:col-span-2">
                    <input
                      id="endereco"
                      className="campo"
                      autoComplete="address-line1"
                      value={cobranca.endereco}
                      onChange={(e) => setCobranca({ ...cobranca, endereco: e.target.value.slice(0, 120) })}
                      aria-invalid={Boolean(erros.endereco)}
                      aria-describedby={descricao('endereco', erros.endereco)}
                    />
                  </Campo>
                  <Campo id="bairro" rotulo={T.bairro}>
                    <input
                      id="bairro"
                      className="campo"
                      autoComplete="address-line2"
                      value={cobranca.bairro}
                      onChange={(e) => setCobranca({ ...cobranca, bairro: e.target.value.slice(0, 80) })}
                    />
                  </Campo>
                  <Campo id="cidade" rotulo={T.cidade} erro={erros.cidade}>
                    <input
                      id="cidade"
                      className="campo"
                      autoComplete="address-level2"
                      value={cobranca.cidade}
                      onChange={(e) => setCobranca({ ...cobranca, cidade: e.target.value.slice(0, 80) })}
                      aria-invalid={Boolean(erros.cidade)}
                      aria-describedby={descricao('cidade', erros.cidade)}
                    />
                  </Campo>
                  <Campo id="estado" rotulo={T.estado} erro={erros.estado}>
                    <input
                      id="estado"
                      className="campo"
                      autoComplete="address-level1"
                      value={cobranca.estado}
                      onChange={(e) => setCobranca({ ...cobranca, estado: e.target.value.slice(0, 40) })}
                      aria-invalid={Boolean(erros.estado)}
                      aria-describedby={descricao('estado', erros.estado)}
                    />
                  </Campo>
                </div>
              )}
            </>
          ) : (
            <div className="tom-sol mt-5 px-5 py-5">
              <p className="font-bold">{T.indisponivelTitulo}</p>
              <p className="mt-2">{T.indisponivelTexto}</p>
            </div>
          )}
        </fieldset>

        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              id="aceite"
              type="checkbox"
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
              className="mt-1 size-6 shrink-0 accent-[var(--color-mar)]"
              aria-invalid={Boolean(erros.aceite)}
              aria-describedby={erros.aceite ? 'aceite-erro' : undefined}
            />
            <span>
              {T.aceitePre}{' '}
              <Link href={links.termos} target="_blank" className="link font-semibold">
                {T.aceiteTermos}
              </Link>{' '}
              {T.aceiteMeio}{' '}
              <Link href={links.politica} target="_blank" className="link font-semibold">
                {T.aceitePolitica}
              </Link>
              .
            </span>
          </label>
          {erros.aceite && (
            <span id="aceite-erro" className="erro-campo" role="alert">
              {erros.aceite}
            </span>
          )}
        </div>
      </div>

      {/* RESUMO EM FORMA DE BILHETE */}
      <aside className="lg:col-span-5">
        <div className="lg:sticky lg:top-6">
          <div className="tom-mar">
            <div className="px-6 pb-6 pt-6">
              <h2 className="text-lead font-bold">{T.resumo}</h2>
              <p className="mt-4 text-lead font-bold leading-tight text-sol">{passeio.nome}</p>
              <p className="mt-1 text-small text-(--tinta-suave)">
                {passeio.cidade} · {mostrarOpcoes ? opcao.nome : passeio.duracao}
              </p>
              <dl className="mt-5 space-y-2">
                <div className="flex justify-between gap-4">
                  <dt>{T.data}</dt>
                  <dd className="text-right font-semibold">{dataPasseioValida(data) ? formatarDataIso(data, locale) : '—'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>{T.quantas}</dt>
                  <dd className="text-right font-semibold">{pessoasTexto}</dd>
                </div>
                {orc.linhas.map((l) => (
                  <div key={l.tipo} className="flex justify-between gap-4">
                    <dt>{rotuloLinha(l.tipo, l.quantidade)}</dt>
                    <dd className="numeros text-right font-semibold">{brl(l.subtotalCentavos)}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="flex items-center justify-between gap-4 bg-mar-2 px-6 py-5">
              <span className="font-semibold">{T.total}</span>
              <span className="numeros text-head font-bold leading-none text-sol" aria-live="polite">
                {brl(orc.totalCentavos)}
              </span>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {(erroGeral || (tentou && temErros)) && (
              <p className="bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
                {erroGeral || textos.erros.revise}
              </p>
            )}
            {pagamentoOnline ? (
              <button type="submit" className="botao w-full" disabled={enviando} aria-busy={enviando}>
                {enviando ? T.processando : (metodo === 'pix' ? T.pagarPix : T.pagarCartao).replace('{valor}', brl(orc.totalCentavos))}
              </button>
            ) : (
              <button type="submit" className="botao botao-whats w-full" disabled={enviando} aria-busy={enviando}>
                <IconeWhatsApp className="size-5" />
                {enviando ? T.processando : T.finalizarWhatsapp}
              </button>
            )}
            <p className="text-small">{T.avisoTotal}</p>
            {pagamentoOnline && <p className="text-small text-tinta-suave">{T.seguro}</p>}
          </div>
        </div>
      </aside>
    </form>
  );
}
