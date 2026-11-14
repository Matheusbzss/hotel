'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Idioma } from '@/i18n/config';
import type { TextosCotacao, TipoCotacao, TrajetoCotacao } from '@/lib/cotacao';
import { rastrear } from '@/lib/pixel';
import { DDIS, PAIS_PADRAO, emailValido, telefoneValido } from '@/lib/validacao';
import { Campo, descricao } from './Campo';

type Erros = Partial<Record<'nome' | 'email' | 'telefone' | 'mensagem', string>>;

/**
 * O formulário curto dos pedidos de orçamento e das mensagens do site: vai para a tabela cotacoes e aparece no
 * painel. Serve no cartão do transfer, nas casas e no Contato.
 */
export function FormularioCotacao({
  tipo,
  idioma,
  trajeto,
  rotuloMensagem,
  botao,
  telefoneObrigatorio = false,
  mensagemObrigatoria = false,
  mensagemInicial = '',
  textos: T,
}: {
  tipo: TipoCotacao;
  idioma: Idioma;
  /** No transfer, o que o cliente montou no cartão. */
  trajeto?: TrajetoCotacao;
  rotuloMensagem: string;
  botao: string;
  telefoneObrigatorio?: boolean;
  mensagemObrigatoria?: boolean;
  /** A mensagem já começa com isto (o "Avise-me" da página da casa leva a casa, as datas e os hóspedes). */
  mensagemInicial?: string;
  textos: TextosCotacao;
}) {
  const id = useId();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [ddi, setDdi] = useState(PAIS_PADRAO[idioma].ddi);
  const [telefone, setTelefone] = useState('');
  const [mensagem, setMensagem] = useState(mensagemInicial);
  const [isca, setIsca] = useState('');
  const [tentou, setTentou] = useState(false);
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const avisoRef = useRef<HTMLDivElement>(null);

  // o formulário some ao enviar: o aviso precisa ficar na tela, sem ir para baixo do cabeçalho
  useEffect(() => {
    if (enviado) avisoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [enviado]);

  function validar(): Erros {
    const e: Erros = {};
    if (nome.trim().length < 3) e.nome = T.erroObrigatorio;
    if (!emailValido(email)) e.email = T.erroEmail;
    if ((telefoneObrigatorio || telefone.trim()) && !telefoneValido(ddi, telefone)) e.telefone = T.erroTelefone;
    if (mensagemObrigatoria && mensagem.trim().length < 3) e.mensagem = T.erroObrigatorio;
    return e;
  }
  const erros: Erros = tentou ? validar() : {};

  async function enviar() {
    setErroGeral('');
    setTentou(true);
    if (Object.keys(validar()).length) return;
    setEnviando(true);
    try {
      const res = await fetch('/api/cotacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          idioma,
          nome: nome.trim(),
          email: email.trim(),
          ...(telefone.trim() ? { ddi, telefone } : {}),
          mensagem: mensagem.trim(),
          ...(trajeto ? { trajeto } : {}),
          site: isca,
        }),
      });
      if (res.ok) {
        rastrear('Contact');
        setEnviado(true);
        return;
      }
      setErroGeral(T.erro);
    } catch {
      setErroGeral(T.erro);
    }
    setEnviando(false);
  }

  if (enviado) {
    return (
      <div ref={avisoRef} role="status" className="mt-4">
        <p className="font-semibold">{T.sucessoTitulo}</p>
        <p className="mt-1">{T.sucessoTexto}</p>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault();
        enviar();
      }}
      className="relative mt-4 grid gap-4"
    >
      <Campo id={`${id}-nome`} rotulo={T.nome} erro={erros.nome}>
        <input
          id={`${id}-nome`}
          className="campo"
          autoComplete="name"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          aria-invalid={Boolean(erros.nome)}
          aria-describedby={descricao(`${id}-nome`, erros.nome)}
          required
        />
      </Campo>
      <Campo id={`${id}-email`} rotulo={T.email} erro={erros.email}>
        <input
          id={`${id}-email`}
          type="email"
          inputMode="email"
          className="campo"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={160}
          aria-invalid={Boolean(erros.email)}
          aria-describedby={descricao(`${id}-email`, erros.email)}
          required
        />
      </Campo>
      <div>
        <span className="rotulo" id={`${id}-telefone-rotulo`}>
          {telefoneObrigatorio ? T.telefone : T.telefoneOpcional}
        </span>
        <div className="flex gap-2">
          <label htmlFor={`${id}-ddi`} className="sr-only">
            {T.ddi}
          </label>
          <select
            id={`${id}-ddi`}
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
            id={`${id}-telefone`}
            type="tel"
            inputMode="tel"
            className="campo min-w-0"
            autoComplete="tel-national"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            maxLength={24}
            aria-labelledby={`${id}-telefone-rotulo`}
            aria-invalid={Boolean(erros.telefone)}
            aria-describedby={erros.telefone ? `${id}-telefone-erro` : undefined}
            required={telefoneObrigatorio}
          />
        </div>
        {erros.telefone && (
          <span id={`${id}-telefone-erro`} className="erro-campo" role="alert">
            {erros.telefone}
          </span>
        )}
      </div>
      <Campo id={`${id}-mensagem`} rotulo={rotuloMensagem} erro={erros.mensagem}>
        <textarea
          id={`${id}-mensagem`}
          className="campo min-h-24"
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          maxLength={1000}
          aria-invalid={Boolean(erros.mensagem)}
          aria-describedby={descricao(`${id}-mensagem`, erros.mensagem)}
          required={mensagemObrigatoria}
        />
      </Campo>

      {/* campo-isca para robôs: escondido de pessoas (taste-skill-ignore) */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-0 overflow-hidden">
        <label htmlFor={`${id}-site`}>Site</label>
        <input id={`${id}-site`} tabIndex={-1} autoComplete="off" value={isca} onChange={(e) => setIsca(e.target.value)} />
      </div>

      {erroGeral && (
        <p className="bg-erro-claro px-4 py-3 font-semibold text-mar" role="alert">
          {erroGeral}
        </p>
      )}
      <button type="submit" className="botao w-full" disabled={enviando} aria-busy={enviando}>
        {enviando ? T.enviando : botao}
      </button>
    </form>
  );
}
